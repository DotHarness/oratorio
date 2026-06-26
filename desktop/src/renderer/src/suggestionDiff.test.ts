import { describe, expect, it } from 'vitest'
import { draftSuggestionDiffLines } from './suggestionDiff'

describe('draftSuggestionDiffLines', () => {
  it('renders a single replacement as one added line', () => {
    expect(draftSuggestionDiffLines('## Purpose', 4)).toEqual([
      { type: 'add', oldLineNumber: null, newLineNumber: 4, text: '## Purpose' },
    ])
  })

  it('keeps multiline replacements in order', () => {
    expect(draftSuggestionDiffLines('first\nsecond', 8)).toEqual([
      { type: 'add', oldLineNumber: null, newLineNumber: 8, text: 'first' },
      { type: 'add', oldLineNumber: null, newLineNumber: 9, text: 'second' },
    ])
  })

  it('normalizes Windows newlines', () => {
    expect(draftSuggestionDiffLines('first\r\nsecond\rthird', 2)).toEqual([
      { type: 'add', oldLineNumber: null, newLineNumber: 2, text: 'first' },
      { type: 'add', oldLineNumber: null, newLineNumber: 3, text: 'second' },
      { type: 'add', oldLineNumber: null, newLineNumber: 4, text: 'third' },
    ])
  })

  it('trims final trailing newlines', () => {
    expect(draftSuggestionDiffLines('first\n', 12)).toEqual([
      { type: 'add', oldLineNumber: null, newLineNumber: 12, text: 'first' },
    ])
  })

  it('renders whitespace-only replacement lines without trimming spaces', () => {
    expect(draftSuggestionDiffLines('', 1)).toEqual([])
    expect(draftSuggestionDiffLines('  \n\t', 1)).toEqual([
      { type: 'add', oldLineNumber: null, newLineNumber: 1, text: '  ' },
      { type: 'add', oldLineNumber: null, newLineNumber: 2, text: '\t' },
    ])
  })

  it('renders a replaced line as a remove followed by an add', () => {
    expect(draftSuggestionDiffLines('new line', 41, 'old line')).toEqual([
      { type: 'remove', oldLineNumber: 41, newLineNumber: null, text: 'old line' },
      { type: 'add', oldLineNumber: null, newLineNumber: 41, text: 'new line' },
    ])
  })

  it('keeps unchanged lines as context and only marks the edited line', () => {
    const original = 'alpha\nbeta\ngamma'
    const replacement = 'alpha\nBETA\ngamma'
    expect(draftSuggestionDiffLines(replacement, 10, original)).toEqual([
      { type: 'context', oldLineNumber: 10, newLineNumber: 10, text: 'alpha' },
      { type: 'remove', oldLineNumber: 11, newLineNumber: null, text: 'beta' },
      { type: 'add', oldLineNumber: null, newLineNumber: 11, text: 'BETA' },
      { type: 'context', oldLineNumber: 12, newLineNumber: 12, text: 'gamma' },
    ])
  })

  it('tracks old and new line numbers independently when lines are inserted', () => {
    const original = 'one\ntwo'
    const replacement = 'one\ninserted\ntwo'
    expect(draftSuggestionDiffLines(replacement, 5, original)).toEqual([
      { type: 'context', oldLineNumber: 5, newLineNumber: 5, text: 'one' },
      { type: 'add', oldLineNumber: null, newLineNumber: 6, text: 'inserted' },
      { type: 'context', oldLineNumber: 6, newLineNumber: 7, text: 'two' },
    ])
  })
})
