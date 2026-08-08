import { describe, expect, it } from 'vitest'
import { numberedOutputText, outputTail } from '../editor/outputTail'

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
})
