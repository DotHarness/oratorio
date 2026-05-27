import { describe, expect, it } from 'vitest'
import { normalizeMarkdownForDisplay } from './markdownDisplay'

describe('normalizeMarkdownForDisplay', () => {
  it('keeps heading text inside inline code spans', () => {
    const value = 'README.md adds the heading `## Oratorio M2 user-authored PR review test`, then a paragraph.'

    expect(normalizeMarkdownForDisplay(value)).toBe(value)
  })

  it('keeps recommendation replacements inside inline code spans', () => {
    const value = 'The heading duplicates the PR title; `## Purpose` is more maintainable.'

    expect(normalizeMarkdownForDisplay(value)).toBe(value)
  })

  it('escapes an unpaired trailing backtick as display text', () => {
    expect(normalizeMarkdownForDisplay('the heading `')).toBe('the heading \\`')
  })

  it('keeps the existing heading-table repair', () => {
    expect(normalizeMarkdownForDisplay('### Prior Attempts| Attempt | Runner |')).toBe(
      '### Prior Attempts\n\n| Attempt | Runner |',
    )
  })

  it('does not rewrite fenced code block content', () => {
    const value = ['```md', '### Prior Attempts| Attempt | Runner |', 'the heading `', '`## Purpose`', '```'].join('\n')

    expect(normalizeMarkdownForDisplay(value)).toBe(value)
  })

  it('does not double escape an escaped backtick', () => {
    expect(normalizeMarkdownForDisplay('literal \\` backtick')).toBe('literal \\` backtick')
  })
})
