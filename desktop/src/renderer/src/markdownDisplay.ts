type FenceState = {
  marker: '`' | '~'
  length: number
}

type MarkdownSegment = {
  kind: 'text' | 'code'
  value: string
}

export function normalizeMarkdownForDisplay(value: string) {
  const lines = value.replace(/\r\n?/g, '\n').split('\n')
  let fence: FenceState | null = null

  return lines
    .map((line) => {
      const fenceMatch = line.match(/^\s{0,3}(`{3,}|~{3,})/)
      if (fenceMatch) {
        const marker = fenceMatch[1][0] as '`' | '~'
        const length = fenceMatch[1].length
        if (fence && marker === fence.marker && length >= fence.length) {
          fence = null
        } else if (!fence) {
          fence = { marker, length }
        }
        return line
      }

      if (fence) {
        return line
      }

      return normalizeInlineMarkdownLine(line)
    })
    .join('\n')
}

function normalizeInlineMarkdownLine(line: string) {
  return splitInlineCodeSegments(line)
    .map((segment) => (segment.kind === 'code' ? segment.value : normalizeMarkdownTextSegment(segment.value)))
    .join('')
}

function splitInlineCodeSegments(line: string): MarkdownSegment[] {
  const segments: MarkdownSegment[] = []
  let textStart = 0
  let index = 0

  while (index < line.length) {
    if (line[index] !== '`' || isEscapedMarkdownChar(line, index)) {
      index += 1
      continue
    }

    const runLength = countBacktickRun(line, index)
    const closeIndex = findClosingBacktickRun(line, index + runLength, runLength)

    if (closeIndex === -1) {
      if (textStart < index) {
        segments.push({ kind: 'text', value: line.slice(textStart, index) })
      }
      segments.push({ kind: 'text', value: escapeBacktickRun(line.slice(index, index + runLength)) })
      index += runLength
      textStart = index
      continue
    }

    if (textStart < index) {
      segments.push({ kind: 'text', value: line.slice(textStart, index) })
    }
    segments.push({ kind: 'code', value: line.slice(index, closeIndex + runLength) })
    index = closeIndex + runLength
    textStart = index
  }

  if (textStart < line.length) {
    segments.push({ kind: 'text', value: line.slice(textStart) })
  }

  return segments
}

function normalizeMarkdownTextSegment(value: string) {
  return value
    .replace(/([^#\n])(\s*#{2,6}\s)/g, '$1\n\n$2')
    .replace(/(#{2,6}\sPrior Attempt)(Round)/g, '$1\n\n$2')
    .replace(/(#{2,6}\s[^\n|]+)\|/g, '$1\n\n|')
    .replace(/([^\n])(\n[-*]\s)/g, '$1\n$2')
}

function findClosingBacktickRun(value: string, start: number, runLength: number) {
  for (let index = start; index < value.length; index += 1) {
    if (value[index] !== '`' || isEscapedMarkdownChar(value, index)) {
      continue
    }

    const candidateLength = countBacktickRun(value, index)
    if (candidateLength === runLength) {
      return index
    }

    index += candidateLength - 1
  }

  return -1
}

function countBacktickRun(value: string, start: number) {
  let runLength = 0
  while (value[start + runLength] === '`') {
    runLength += 1
  }
  return runLength
}

function escapeBacktickRun(value: string) {
  return value.replace(/`/g, '\\`')
}

function isEscapedMarkdownChar(value: string, index: number) {
  let slashCount = 0
  for (let cursor = index - 1; cursor >= 0 && value[cursor] === '\\'; cursor -= 1) {
    slashCount += 1
  }

  return slashCount % 2 === 1
}
