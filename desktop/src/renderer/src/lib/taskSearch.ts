import type { WorkItem } from './types'

export type ParsedTaskSearchQuery = {
  text: string
  sources: string[]
  labels: string[]
}

type ParsedQualifier = {
  key: string
  value: string
  end: number
}

const sourceQualifierKeys = new Set(['s', 'source'])

export function parseTaskSearchQuery(query: string): ParsedTaskSearchQuery {
  let index = 0
  let text = ''
  const sources: string[] = []
  const labels: string[] = []

  while (index < query.length) {
    const qualifier = parseQualifierAt(query, index)
    if (qualifier) {
      if (sourceQualifierKeys.has(qualifier.key)) {
        sources.push(qualifier.value)
      } else {
        labels.push(qualifier.value)
      }
      index = qualifier.end
      continue
    }

    text += query[index]
    index += 1
  }

  return {
    text: normalizePlainSearchText(text),
    sources,
    labels,
  }
}

export function taskSearchApiSource(query: ParsedTaskSearchQuery): string | null {
  const sources = Array.from(new Set(query.sources.map(normalizeFilterValue).filter(Boolean)))
  return sources.length === 1 ? sources[0] : null
}

export function taskMatchesSearch(item: WorkItem, query: ParsedTaskSearchQuery) {
  return matchesSources(item, query.sources) && matchesLabels(item, query.labels) && matchesPlainText(item, query.text)
}

function parseQualifierAt(input: string, index: number): ParsedQualifier | null {
  if (index > 0 && !isWhitespace(input[index - 1])) {
    return null
  }

  const keyMatch = /^(source|label|s|l):/i.exec(input.slice(index))
  if (!keyMatch) {
    return null
  }

  const key = keyMatch[1].toLowerCase()
  let cursor = index + keyMatch[0].length
  const parsedValue = input[cursor] === '"' ? parseQuotedValue(input, cursor) : parseBareValue(input, cursor)
  const value = parsedValue.value.trim()
  if (!value) {
    return null
  }

  return {
    key,
    value,
    end: parsedValue.end,
  }
}

function parseQuotedValue(input: string, quoteIndex: number) {
  let cursor = quoteIndex + 1
  let value = ''

  while (cursor < input.length) {
    const char = input[cursor]
    if (char === '\\' && input[cursor + 1] === '"') {
      value += '"'
      cursor += 2
      continue
    }

    if (char === '"') {
      return { value, end: cursor + 1 }
    }

    value += char
    cursor += 1
  }

  return { value, end: cursor }
}

function parseBareValue(input: string, start: number) {
  let cursor = start
  while (cursor < input.length && !isWhitespace(input[cursor])) {
    cursor += 1
  }

  return {
    value: input.slice(start, cursor),
    end: cursor,
  }
}

function matchesSources(item: WorkItem, sources: string[]) {
  if (sources.length === 0) {
    return true
  }

  const itemSources = new Set([normalizeFilterValue(item.sourceKey), normalizeFilterValue(item.source)].filter(Boolean))
  return sources.every((source) => itemSources.has(normalizeFilterValue(source)))
}

function matchesLabels(item: WorkItem, labels: string[]) {
  if (labels.length === 0) {
    return true
  }

  const itemLabels = new Set(item.labels.map(normalizeFilterValue).filter(Boolean))
  return labels.every((label) => itemLabels.has(normalizeFilterValue(label)))
}

function matchesPlainText(item: WorkItem, text: string) {
  const normalizedText = normalizeFilterValue(text)
  if (!normalizedText) {
    return true
  }

  return [item.shortId ?? '', item.title, item.repository, item.number ?? '', item.assignee ?? '', item.branch ?? '', item.labels.join(' '), item.headSha ?? '']
    .join(' ')
    .toLowerCase()
    .includes(normalizedText)
}

function normalizePlainSearchText(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function normalizeFilterValue(value: string | null | undefined) {
  return (value ?? '').trim().toLowerCase()
}

function isWhitespace(value: string | undefined) {
  return value === undefined || /\s/.test(value)
}
