export function outputTail(value: string, limit = 200) {
  const lines = value.replace(/\r\n?/g, '\n').split('\n')
  if (lines.at(-1) === '') lines.pop()
  const start = Math.max(0, lines.length - limit)
  return lines.slice(start).map((text, index) => ({
    number: start + index + 1,
    text,
  }))
}

export function numberedOutputText(value: string, limit = 200) {
  const lines = outputTail(value, limit)
  const width = String(lines.at(-1)?.number ?? 1).length
  return lines
    .map((line) => `${String(line.number).padStart(width, ' ')} | ${line.text}`)
    .join('\n')
}
