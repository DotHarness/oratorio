export type DraftSuggestionDiffLineType = 'context' | 'add' | 'remove'

export type DraftSuggestionDiffLine = {
  type: DraftSuggestionDiffLineType
  oldLineNumber: number | null
  newLineNumber: number | null
  text: string
}

export function draftSuggestionDiffLines(replacement: string, startLine?: number | null, original?: string | null): DraftSuggestionDiffLine[] {
  const originalLines = suggestionLines(original)
  const replacementLines = suggestionLines(replacement)

  if (originalLines.length === 0 && replacementLines.length === 0) {
    return []
  }

  const base = startLine ?? null
  const numberAt = (offset: number) => (base == null ? null : base + offset)

  const lines: DraftSuggestionDiffLine[] = []
  let oldOffset = 0
  let newOffset = 0

  for (const op of diffLineOps(originalLines, replacementLines)) {
    if (op.type === 'context') {
      lines.push({ type: 'context', oldLineNumber: numberAt(oldOffset), newLineNumber: numberAt(newOffset), text: op.text })
      oldOffset += 1
      newOffset += 1
    } else if (op.type === 'remove') {
      lines.push({ type: 'remove', oldLineNumber: numberAt(oldOffset), newLineNumber: null, text: op.text })
      oldOffset += 1
    } else {
      lines.push({ type: 'add', oldLineNumber: null, newLineNumber: numberAt(newOffset), text: op.text })
      newOffset += 1
    }
  }

  return lines
}

type DiffLineOp = { type: DraftSuggestionDiffLineType; text: string }

/**
 * Longest-common-subsequence line diff. Lines shared by both sides become
 * `context`, so only the genuinely changed lines render as `-`/`+` instead of
 * deleting and re-adding the whole block.
 */
function diffLineOps(oldLines: string[], newLines: string[]): DiffLineOp[] {
  const rows = oldLines.length
  const cols = newLines.length

  const lcs: number[][] = Array.from({ length: rows + 1 }, () => new Array<number>(cols + 1).fill(0))
  for (let i = rows - 1; i >= 0; i -= 1) {
    for (let j = cols - 1; j >= 0; j -= 1) {
      lcs[i][j] = oldLines[i] === newLines[j]
        ? lcs[i + 1][j + 1] + 1
        : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  const ops: DiffLineOp[] = []
  let i = 0
  let j = 0
  while (i < rows && j < cols) {
    if (oldLines[i] === newLines[j]) {
      ops.push({ type: 'context', text: oldLines[i] })
      i += 1
      j += 1
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      ops.push({ type: 'remove', text: oldLines[i] })
      i += 1
    } else {
      ops.push({ type: 'add', text: newLines[j] })
      j += 1
    }
  }
  while (i < rows) {
    ops.push({ type: 'remove', text: oldLines[i] })
    i += 1
  }
  while (j < cols) {
    ops.push({ type: 'add', text: newLines[j] })
    j += 1
  }

  return ops
}

function suggestionLines(value?: string | null): string[] {
  if (value == null) {
    return []
  }

  const normalized = value.replace(/\r\n?/g, '\n').replace(/\n+$/g, '')
  return normalized.length === 0 ? [] : normalized.split('\n')
}
