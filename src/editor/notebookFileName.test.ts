import { describe, expect, it } from 'vitest'
import { notebookPdfName } from './notebookFileName'

describe('notebookPdfName', () => {
  it('uses the notebook filename instead of its editable title', () => {
    expect(notebookPdfName('Práctico 1/solución.octnb')).toBe('solución.pdf')
    expect(notebookPdfName('carpeta/Modelo.OCTNB')).toBe('Modelo.pdf')
  })
})

