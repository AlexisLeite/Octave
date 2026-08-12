export function outputLines(value: string) {
  const lines = value.replace(/\r\n?/g, '\n').split('\n')
  if (lines.at(-1) === '') lines.pop()
  return lines.map((text, index) => ({
    number: index + 1,
    text,
  }))
}

export function outputTail(value: string, limit = 200) {
  const lines = outputLines(value)
  const start = Math.max(0, lines.length - limit)
  return lines.slice(start)
}

export function numberedOutputText(value: string, limit = 200) {
  const lines = outputTail(value, limit)
  const width = String(lines.at(-1)?.number ?? 1).length
  return lines
    .map((line) => `${String(line.number).padStart(width, ' ')} | ${line.text}`)
    .join('\n')
}
