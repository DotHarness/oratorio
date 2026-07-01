export type CanonicalSourceProject = {
  provider: string
  instance: string
  projectPath: string
}

export type SourceProjectFilterOption = {
  value: string
  label: string
  tooltip: string
  aliases: string[]
}

export type SourceProjectDisplay = {
  label: string
  tooltip: string
}

type SourceProjectEntry = {
  value: string
  provider: string | null
  instance: string | null
  projectPath: string
  parsed: CanonicalSourceProject | null
  aliases: string[]
}

type SourceProjectGroup = {
  value: string
  provider: string | null
  instance: string | null
  projectPath: string
  aliases: string[]
  labelDepth: number
}

const canonicalSourceProjectPattern = /^([^:]+):([^/]+)\/(.+)$/

export function parseCanonicalSourceProject(value: string | null | undefined): CanonicalSourceProject | null {
  const match = value?.trim().match(canonicalSourceProjectPattern)
  if (!match) {
    return null
  }

  const projectPath = normalizeProjectPath(match[3])
  if (!projectPath) {
    return null
  }

  return {
    provider: match[1].trim().toLowerCase(),
    instance: match[2].trim().toLowerCase(),
    projectPath,
  }
}

export function buildSourceProjectFilterOptions(values: string[]): SourceProjectFilterOption[] {
  const entries = values
    .map(toEntry)
    .filter((entry): entry is SourceProjectEntry => Boolean(entry))
  const groups = groupEquivalentEntries(entries)
  const labelled = applyCompactLabels(groups)

  return labelled
    .map((group) => ({
      value: group.value,
      label: group.label,
      tooltip: sourceProjectTooltip(group),
      aliases: group.aliases,
    }))
    .sort((left, right) => left.label.localeCompare(right.label) || left.tooltip.localeCompare(right.tooltip))
}

export function sourceProjectMatchesFilter(
  repository: string | null | undefined,
  filter: string,
  repositorySource?: string | null,
) {
  if (filter === 'all') {
    return true
  }

  const repositoryValue = repository?.trim()
  const filterValue = filter.trim()
  if (!repositoryValue || !filterValue) {
    return false
  }

  if (sameText(repositoryValue, filterValue)) {
    return true
  }

  const repositoryProject = parseCanonicalSourceProject(repositoryValue)
  const filterProject = parseCanonicalSourceProject(filterValue)
  if (repositoryProject && filterProject) {
    return sameCanonicalProject(repositoryProject, filterProject)
  }

  if (filterProject) {
    return rawRepositoryMatchesCanonical(repositoryValue, filterProject, repositorySource)
  }

  if (repositoryProject) {
    return rawRepositoryMatchesCanonical(filterValue, repositoryProject, 'github')
  }

  return false
}

export function sourceProjectValuesEquivalent(left: string, right: string) {
  return sourceProjectMatchesFilter(left, right) || sourceProjectMatchesFilter(right, left)
}

export function sourceProjectDisplay(
  value: string | null | undefined,
  options: SourceProjectFilterOption[] = [],
  providerHint?: string | null,
): SourceProjectDisplay {
  const trimmed = value?.trim() ?? ''
  if (!trimmed || sameText(trimmed, 'local')) {
    return { label: trimmed, tooltip: trimmed }
  }

  const exactOption = options.find((option) =>
    sameText(option.value, trimmed) ||
    option.aliases.some((alias) => sameText(alias, trimmed)))
  if (exactOption) {
    return { label: exactOption.label, tooltip: exactOption.tooltip }
  }

  const matchedOption = options.find((option) =>
    sourceProjectMatchesFilter(trimmed, option.value, providerHint) ||
    sourceProjectMatchesFilter(option.value, trimmed, providerHint))
  if (matchedOption) {
    return { label: matchedOption.label, tooltip: matchedOption.tooltip }
  }

  const parsed = parseCanonicalSourceProject(trimmed)
  if (parsed) {
    return {
      label: compactSourceProjectLabel(parsed.projectPath),
      tooltip: sourceProjectTooltip(parsed),
    }
  }

  const projectPath = normalizeProjectPath(trimmed)
  if (!projectPath) {
    return { label: trimmed, tooltip: trimmed }
  }

  const provider = providerHint?.trim().toLowerCase() || 'github'
  const fallback = {
    provider,
    instance: provider === 'github' ? 'github.com' : null,
    projectPath,
  }
  return {
    label: compactSourceProjectLabel(projectPath),
    tooltip: sourceProjectTooltip(fallback),
  }
}

export function sourceProjectDisplayLabel(value: string | null | undefined) {
  const parsed = parseCanonicalSourceProject(value)
  return parsed ? `${providerLabel(parsed.provider)}: ${parsed.projectPath}` : value ?? ''
}

export function sourceProjectAliases(value: string | null | undefined) {
  const parsed = parseCanonicalSourceProject(value)
  if (parsed) {
    return entryAliases(parsed, parsedKey(parsed))
  }

  const projectPath = normalizeProjectPath(value ?? '')
  return projectPath ? [projectPath, `github:github.com/${projectPath}`] : []
}

export function providerLabel(provider: string) {
  const normalized = provider.toLowerCase()
  if (normalized === 'github') return 'GitHub'
  if (normalized === 'gitlab') return 'GitLab'
  return provider
}

export function hostFromUrl(value: string | null | undefined) {
  if (!value) {
    return ''
  }

  try {
    return new URL(value).host
  } catch {
    return value.replace(/^https?:\/\//i, '').split('/')[0] ?? ''
  }
}

function toEntry(value: string): SourceProjectEntry | null {
  const trimmed = value.trim()
  if (!trimmed || sameText(trimmed, 'local')) {
    return null
  }

  const parsed = parseCanonicalSourceProject(trimmed)
  if (parsed) {
    return {
      value: trimmed,
      provider: parsed.provider,
      instance: parsed.instance,
      projectPath: parsed.projectPath,
      parsed,
      aliases: uniqueStrings([trimmed, ...entryAliases(parsed, parsedKey(parsed))]),
    }
  }

  const projectPath = normalizeProjectPath(trimmed)
  if (!projectPath) {
    return null
  }

  return {
    value: trimmed,
    provider: 'github',
    instance: 'github.com',
    projectPath,
    parsed: null,
    aliases: uniqueStrings([trimmed, projectPath, `github:github.com/${projectPath}`]),
  }
}

function groupEquivalentEntries(entries: SourceProjectEntry[]): SourceProjectGroup[] {
  const githubCanonicalByPath = new Map<string, SourceProjectEntry[]>()
  for (const entry of entries) {
    if (entry.parsed?.provider !== 'github') {
      continue
    }

    const key = comparable(entry.projectPath)
    githubCanonicalByPath.set(key, [...(githubCanonicalByPath.get(key) ?? []), entry])
  }

  const groups = new Map<string, SourceProjectEntry[]>()
  for (const entry of entries) {
    const identity = entry.parsed
      ? parsedIdentity(entry.parsed)
      : legacyGitHubIdentity(entry, githubCanonicalByPath.get(comparable(entry.projectPath)))
    groups.set(identity, [...(groups.get(identity) ?? []), entry])
  }

  return Array.from(groups.values()).map((groupEntries) => {
    const representative = groupEntries.find((entry) => entry.parsed) ?? groupEntries[0]
    const aliases = uniqueStrings(groupEntries.flatMap((entry) => entry.aliases))
    return {
      value: representative.value,
      provider: representative.provider,
      instance: representative.instance,
      projectPath: representative.projectPath,
      aliases,
      labelDepth: Math.min(2, Math.max(1, pathSegments(representative.projectPath).length)),
    }
  })
}

function applyCompactLabels(groups: SourceProjectGroup[]): Array<SourceProjectGroup & { label: string }> {
  const drafts = groups.map((group) => ({ ...group }))
  let changed = true

  while (changed) {
    changed = false
    const byLabel = groupBy(drafts, (draft) => comparable(compactPathLabel(draft.projectPath, draft.labelDepth)))
    for (const duplicates of byLabel.values()) {
      if (duplicates.length < 2) {
        continue
      }

      for (const duplicate of duplicates) {
        const segmentCount = pathSegments(duplicate.projectPath).length
        if (duplicate.labelDepth < segmentCount) {
          duplicate.labelDepth += 1
          changed = true
        }
      }
    }
  }

  const labelled = drafts.map((draft) => ({ ...draft, label: compactPathLabel(draft.projectPath, draft.labelDepth) }))
  const byLabel = groupBy(labelled, (draft) => comparable(draft.label))
  for (const duplicates of byLabel.values()) {
    if (duplicates.length < 2) {
      continue
    }

    const providerOccurrences = new Map<string, number>()
    for (const duplicate of duplicates) {
      const key = duplicate.provider ?? ''
      providerOccurrences.set(key, (providerOccurrences.get(key) ?? 0) + 1)
    }

    for (const duplicate of duplicates) {
      const labelPrefix = duplicate.provider ? providerLabel(duplicate.provider) : null
      const providerHasDuplicates = (providerOccurrences.get(duplicate.provider ?? '') ?? 0) > 1
      duplicate.label = providerHasDuplicates && duplicate.instance
        ? `${labelPrefix ?? 'Project'} · ${duplicate.instance}/${duplicate.projectPath}`
        : `${labelPrefix ?? 'Project'} · ${duplicate.projectPath}`
    }
  }

  return labelled
}

function rawRepositoryMatchesCanonical(
  rawValue: string,
  canonical: CanonicalSourceProject,
  repositorySource?: string | null,
) {
  const source = repositorySource?.trim().toLowerCase()
  if (source && source !== canonical.provider) {
    return false
  }

  if (canonical.provider !== 'github' && source !== canonical.provider) {
    return false
  }

  return sameText(normalizeProjectPath(rawValue), canonical.projectPath)
}

function sameCanonicalProject(left: CanonicalSourceProject, right: CanonicalSourceProject) {
  return sameText(left.provider, right.provider) &&
    sameText(left.instance, right.instance) &&
    sameText(left.projectPath, right.projectPath)
}

function legacyGitHubIdentity(entry: SourceProjectEntry, candidates: SourceProjectEntry[] | undefined) {
  if (!candidates?.length) {
    return comparable(`github:github.com/${entry.projectPath}`)
  }

  const preferred = candidates.find((candidate) => sameText(candidate.instance, 'github.com')) ?? candidates[0]
  return parsedIdentity(preferred.parsed!)
}

function parsedIdentity(parsed: CanonicalSourceProject) {
  return comparable(parsedKey(parsed))
}

function parsedKey(parsed: CanonicalSourceProject) {
  return `${parsed.provider}:${parsed.instance}/${parsed.projectPath}`
}

function entryAliases(parsed: CanonicalSourceProject, key: string) {
  const aliases = [key]
  if (parsed.provider === 'github') {
    aliases.push(parsed.projectPath, `github:github.com/${parsed.projectPath}`)
  }
  return aliases
}

function sourceProjectTooltip(group: Pick<SourceProjectGroup, 'provider' | 'instance' | 'projectPath'>) {
  if (!group.provider) {
    return group.projectPath
  }

  const location = group.instance ? `${group.instance}/${group.projectPath}` : group.projectPath
  return `${providerLabel(group.provider)} · ${location}`
}

function compactPathLabel(projectPath: string, depth: number) {
  const segments = pathSegments(projectPath)
  return segments.slice(Math.max(0, segments.length - depth)).join('/')
}

function compactSourceProjectLabel(projectPath: string) {
  return compactPathLabel(projectPath, Math.min(2, Math.max(1, pathSegments(projectPath).length)))
}

function normalizeProjectPath(value: string) {
  return value.trim().replace(/\\/g, '/').replace(/^\/+|\/+$/g, '')
}

function pathSegments(projectPath: string) {
  return projectPath.split('/').map((segment) => segment.trim()).filter(Boolean)
}

function groupBy<T>(items: T[], keySelector: (item: T) => string) {
  const groups = new Map<string, T[]>()
  for (const item of items) {
    const key = keySelector(item)
    groups.set(key, [...(groups.get(key) ?? []), item])
  }
  return groups
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    const trimmed = value.trim()
    const key = comparable(trimmed)
    if (!trimmed || seen.has(key)) {
      continue
    }

    seen.add(key)
    result.push(trimmed)
  }
  return result
}

function sameText(left: string | null | undefined, right: string | null | undefined) {
  return comparable(left ?? '') === comparable(right ?? '')
}

function comparable(value: string) {
  return value.trim().toLowerCase()
}
