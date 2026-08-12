import { describe, expect, it } from 'vitest'
import { numberedOutputText, outputLines, outputTail } from '../editor/outputTail'
import { virtualOutputRange } from './NumberedOutput'

describe('outputTail', () => {
  it('keeps the real line numbers for the last 200 lines', () => {
    const value = Array.from({ length: 250 }, (_, index) => `line ${index + 1}`).join('\n')
    const result = outputTail(value)

    expect(result).toHaveLength(200)
    expect(result[0]).toEqual({ number: 51, text: 'line 51' })
    expect(result.at(-1)).toEqual({ number: 250, text: 'line 250' })
  })

  it('does not invent a numbered blank line for a final newline', () => {
    expect(outputTail('one\ntwo\n')).toEqual([
      { number: 1, text: 'one' },
      { number: 2, text: 'two' },
    ])
  })

  it('formats copied output with aligned real line numbers', () => {
    const value = Array.from({ length: 202 }, (_, index) => `value ${index + 1}`).join('\n')
    const copied = numberedOutputText(value)

    expect(copied.split('\n')).toHaveLength(200)
    expect(copied).toMatch(/^  3 \| value 3/m)
    expect(copied).toMatch(/^202 \| value 202$/m)
  })

  it('keeps every line available while rendering only the visible window', () => {
    const value = Array.from({ length: 25_000 }, (_, index) => `line ${index + 1}`).join('\n')

    expect(outputLines(value)).toHaveLength(25_000)
    expect(virtualOutputRange(25_000, 19_000, 760)).toEqual({ start: 988, end: 1052 })
  })
})
