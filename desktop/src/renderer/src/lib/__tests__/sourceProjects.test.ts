import { describe, expect, it } from 'vitest'
import {
  buildSourceProjectFilterOptions,
  sourceProjectDisplay,
  sourceProjectMatchesFilter,
  sourceProjectValuesEquivalent,
} from '../sourceProjects'

describe('source project display helpers', () => {
  it('deduplicates legacy and canonical GitHub projects while keeping the canonical value', () => {
    const options = buildSourceProjectFilterOptions([
      'owner-alpha/repo-alpha',
      'github:github.com/owner-alpha/repo-alpha',
    ])

    expect(options).toEqual([
      {
        value: 'github:github.com/owner-alpha/repo-alpha',
        label: 'owner-alpha/repo-alpha',
        tooltip: 'GitHub · github.com/owner-alpha/repo-alpha',
        aliases: [
          'owner-alpha/repo-alpha',
          'github:github.com/owner-alpha/repo-alpha',
        ],
      },
    ])
  })

  it('uses the last two GitLab path segments by default', () => {
    const [option] = buildSourceProjectFilterOptions([
      'gitlab:gitlab.example.test/group-alpha/team-alpha/project-alpha',
    ])

    expect(option).toMatchObject({
      value: 'gitlab:gitlab.example.test/group-alpha/team-alpha/project-alpha',
      label: 'team-alpha/project-alpha',
      tooltip: 'GitLab · gitlab.example.test/group-alpha/team-alpha/project-alpha',
    })
  })

  it('adds parent segments only when compact labels collide', () => {
    const options = buildSourceProjectFilterOptions([
      'gitlab:gitlab.example.test/group-alpha/team-shared/project-alpha',
      'gitlab:gitlab.example.test/group-beta/team-shared/project-alpha',
    ])

    expect(options.map((option) => option.label)).toEqual([
      'group-alpha/team-shared/project-alpha',
      'group-beta/team-shared/project-alpha',
    ])
  })

  it('uses provider and instance labels for otherwise identical projects', () => {
    const options = buildSourceProjectFilterOptions([
      'github:github.com/owner-alpha/project-alpha',
      'gitlab:gitlab-a.example.test/owner-alpha/project-alpha',
      'gitlab:gitlab-b.example.test/owner-alpha/project-alpha',
    ])

    expect(options.map((option) => option.label)).toEqual([
      'GitHub · owner-alpha/project-alpha',
      'GitLab · gitlab-a.example.test/owner-alpha/project-alpha',
      'GitLab · gitlab-b.example.test/owner-alpha/project-alpha',
    ])
  })

  it('matches canonical GitHub filters against legacy repository values', () => {
    expect(sourceProjectMatchesFilter(
      'owner-alpha/repo-alpha',
      'github:github.com/owner-alpha/repo-alpha',
      'github',
    )).toBe(true)
    expect(sourceProjectValuesEquivalent(
      'owner-alpha/repo-alpha',
      'github:github.com/owner-alpha/repo-alpha',
    )).toBe(true)
  })

  it('does not treat ambiguous bare paths as GitLab without a matching source hint', () => {
    expect(sourceProjectMatchesFilter(
      'group-alpha/project-alpha',
      'gitlab:gitlab.example.test/group-alpha/project-alpha',
    )).toBe(false)
    expect(sourceProjectMatchesFilter(
      'group-alpha/project-alpha',
      'gitlab:gitlab.example.test/group-alpha/project-alpha',
      'gitlab',
    )).toBe(true)
  })

  it('formats GitLab canonical source projects with the same compact label as filters', () => {
    const options = buildSourceProjectFilterOptions([
      'gitlab:gitlab.example.test/group-alpha/team-alpha/project-alpha',
    ])

    expect(sourceProjectDisplay(
      'gitlab:gitlab.example.test/group-alpha/team-alpha/project-alpha',
      options,
      'gitlab',
    )).toEqual({
      label: 'team-alpha/project-alpha',
      tooltip: 'GitLab · gitlab.example.test/group-alpha/team-alpha/project-alpha',
    })
  })

  it('uses compact collision disambiguation when formatting source projects', () => {
    const options = buildSourceProjectFilterOptions([
      'gitlab:gitlab.example.test/group-alpha/team-shared/project-alpha',
      'gitlab:gitlab.example.test/group-beta/team-shared/project-alpha',
    ])

    expect(sourceProjectDisplay(
      'gitlab:gitlab.example.test/group-alpha/team-shared/project-alpha',
      options,
      'gitlab',
    ).label).toBe('group-alpha/team-shared/project-alpha')
    expect(sourceProjectDisplay(
      'gitlab:gitlab.example.test/group-beta/team-shared/project-alpha',
      options,
      'gitlab',
    ).label).toBe('group-beta/team-shared/project-alpha')
  })

  it('formats canonical GitHub projects like legacy owner/repo values', () => {
    const options = buildSourceProjectFilterOptions([
      'owner-alpha/repo-alpha',
      'github:github.com/owner-alpha/repo-alpha',
    ])

    expect(sourceProjectDisplay(
      'github:github.com/owner-alpha/repo-alpha',
      options,
      'github',
    )).toMatchObject({
      label: 'owner-alpha/repo-alpha',
      tooltip: 'GitHub · github.com/owner-alpha/repo-alpha',
    })
  })

  it('formats bare GitLab paths with a GitLab provider hint', () => {
    expect(sourceProjectDisplay(
      'group-alpha/team-alpha/project-alpha',
      [],
      'gitlab',
    )).toEqual({
      label: 'team-alpha/project-alpha',
      tooltip: 'GitLab · group-alpha/team-alpha/project-alpha',
    })
  })
})
