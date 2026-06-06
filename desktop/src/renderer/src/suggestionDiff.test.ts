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

  it('trims final trailing newlines', () => {
    expect(draftSuggestionDiffLines('first\n', 12)).toEqual([
      { marker: '+', lineNumber: 12, text: 'first' },
    ])
  })

  it('renders whitespace-only replacement lines without trimming spaces', () => {
    expect(draftSuggestionDiffLines('', 1)).toEqual([])
    expect(draftSuggestionDiffLines('  \n\t', 1)).toEqual([
      { marker: '+', lineNumber: 1, text: '  ' },
      { marker: '+', lineNumber: 2, text: '\t' },
    ])
  })

  it('renders original and replacement lines together', () => {
    expect(draftSuggestionDiffLines('new line', 41, 'old line')).toEqual([
      { marker: '-', lineNumber: 41, text: 'old line' },
      { marker: '+', lineNumber: 41, text: 'new line' },
    ])
  })
})
