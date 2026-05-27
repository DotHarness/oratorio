export type DraftSuggestionDiffLine = {
  marker: '+'
  lineNumber: number | null
  text: string
}

export function draftSuggestionDiffLines(replacement: string, startLine?: number | null): DraftSuggestionDiffLine[] {
  if (!replacement.trim()) {
    return []
  }

  return replacement.replace(/\r\n?/g, '\n').split('\n').map((text, index) => ({
    marker: '+',
    lineNumber: startLine ? startLine + index : null,
    text,
  }))
}
