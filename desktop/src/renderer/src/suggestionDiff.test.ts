import { describe, expect, it } from 'vitest'
import { draftSuggestionDiffLines } from './suggestionDiff'

describe('draftSuggestionDiffLines', () => {
  it('renders a single replacement as one added line', () => {
    expect(draftSuggestionDiffLines('## Purpose', 4)).toEqual([
      { marker: '+', lineNumber: 4, text: '## Purpose' },
    ])
  })

  it('keeps multiline replacements in order', () => {
    expect(draftSuggestionDiffLines('first\nsecond', 8)).toEqual([
      { marker: '+', lineNumber: 8, text: 'first' },
      { marker: '+', lineNumber: 9, text: 'second' },
    ])
  })

  it('normalizes Windows newlines', () => {
    expect(draftSuggestionDiffLines('first\r\nsecond\rthird', 2)).toEqual([
      { marker: '+', lineNumber: 2, text: 'first' },
      { marker: '+', lineNumber: 3, text: 'second' },
      { marker: '+', lineNumber: 4, text: 'third' },
    ])
  })

  it('preserves a trailing blank line', () => {
    expect(draftSuggestionDiffLines('first\n', 12)).toEqual([
      { marker: '+', lineNumber: 12, text: 'first' },
      { marker: '+', lineNumber: 13, text: '' },
    ])
  })

  it('does not render empty or whitespace-only replacements', () => {
    expect(draftSuggestionDiffLines('', 1)).toEqual([])
    expect(draftSuggestionDiffLines('  \n\t', 1)).toEqual([])
  })
})
