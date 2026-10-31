export const CLAIM_TOKEN_REGEX = /\[claim:(c_[a-zA-Z0-9_-]+)\]/g

export interface TextSegment {
  type: 'text' | 'citation'
  content: string
  claimId?: string
}

export function splitTextByCitations(text: string): TextSegment[] {
  if (!text) return []

  const segments: TextSegment[] = []
  let lastIndex = 0
  const regex = new RegExp(CLAIM_TOKEN_REGEX.source, 'g')
  let match: RegExpExecArray | null = regex.exec(text)

  while (match !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: 'text',
        content: text.slice(lastIndex, match.index),
      })
    }

    const claimId = match[1]
    if (claimId) {
      segments.push({
        type: 'citation',
        content: match[0],
        claimId,
      })
    }

    lastIndex = match.index + match[0].length
    match = regex.exec(text)
  }

  if (lastIndex < text.length) {
    segments.push({
      type: 'text',
      content: text.slice(lastIndex),
    })
  }

  return segments
}
