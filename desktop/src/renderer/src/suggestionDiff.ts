export type DraftSuggestionDiffLine = {
  marker: '+' | '-'
  lineNumber: number | null
  text: string
}

export function draftSuggestionDiffLines(replacement: string, startLine?: number | null, original?: string | null): DraftSuggestionDiffLine[] {
  const originalLines = suggestionLines(original)
  const replacementLines = suggestionLines(replacement)

  if (originalLines.length === 0 && replacementLines.length === 0) {
    return []
  }

  return [
    ...originalLines.map((text, index) => ({
      marker: '-' as const,
      lineNumber: startLine ? startLine + index : null,
      text,
    })),
    ...replacementLines.map((text, index) => ({
      marker: '+' as const,
      lineNumber: startLine ? startLine + index : null,
      text,
    })),
  ]
}

function suggestionLines(value?: string | null): string[] {
  if (value == null) {
    return []
  }

  const normalized = value.replace(/\r\n?/g, '\n').replace(/\n+$/g, '')
  return normalized.length === 0 ? [] : normalized.split('\n')
}
