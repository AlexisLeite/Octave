import { describe, expect, it } from 'vitest'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { renderNotebookPdf, tokenizeOctaveForPdf } from '../server/notebookPdf.ts'

describe('renderNotebookPdf', () => {
  it('clasifica los tokens de Octave usados para el syntax highlight', () => {
    const tokens = tokenizeOctaveForPdf(`function y = area(r)\n  y = pi * r^2; % círculo\n  disp("listo");`).flat()
    const kindOf = (text: string) => tokens.find((token) => token.text === text)?.kind

    expect(kindOf('function')).toBe('keyword')
    expect(kindOf('pi')).toBe('constant')
    expect(kindOf('2')).toBe('number')
    expect(kindOf('disp')).toBe('builtin')
    expect(kindOf('"listo"')).toBe('string')
    expect(tokens.some((token) => token.kind === 'comment' && token.text.includes('círculo'))).toBe(true)
    expect(tokens.some((token) => token.kind === 'operator' && token.text.includes('^'))).toBe(true)
  })

  it('genera un trabajo entregable con contenido y fórmulas renderizadas', async () => {
    const buffer = await renderNotebookPdf({
      version: 1,
      id: 'notebook-test',
      title: 'Trabajo de prueba',
      cells: [
        {
          id: 'markdown',
          kind: 'markdown',
          source: '# Método\n\nDescripción con **énfasis** y $x^2 + 1$ en línea.\n\n$$\\frac{1}{\\sqrt{x}}$$\n\nUna fórmula inválida conserva un fallback legible: $\\frac{1}$.',
        },
        { id: 'success', kind: 'code', source: '\n\ndisp(6 * 7)\n\n' },
        { id: 'failure', kind: 'code', source: 'print(a)' },
      ],
      outputs: {
        success: { cellId: 'success', source: 'disp(6 * 7)', stdout: '42\n', stderr: '', durationMs: 4, error: null },
        failure: {
          cellId: 'failure',
          source: 'print(a)',
          stdout: '',
          stderr: '',
          durationMs: 3,
          error: { message: 'input arguments must be strings', line: 1, column: 1 },
        },
      },
    })

    expect(buffer.subarray(0, 5).toString('ascii')).toBe('%PDF-')
    expect(buffer.length).toBeGreaterThan(1_000)

    const loadingTask = getDocument({ data: new Uint8Array(buffer) })
    const pdf = await loadingTask.promise
    const pageTexts: string[] = []
    const positionedText: Array<{ text: string; x: number }> = []
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      pageTexts.push(content.items.map((item) => 'str' in item ? item.str : '').join(' '))
      for (const item of content.items) {
        if ('str' in item) positionedText.push({ text: item.str, x: item.transform[4] })
      }
    }
    const text = pageTexts.join(' ')
    expect(text).not.toContain('Trabajo de prueba')
    expect(text).toContain('Método')
    expect(text).toContain('disp(6 * 7)')
    expect(text).toContain('42')
    expect(text).toContain('Error - línea 1, columna 1')
    expect(text).toContain('input arguments must be strings')
    expect(text).toContain('Expresión matemática no disponible')
    expect(text).not.toContain('MARKDOWN')
    expect(text).not.toContain('OCTAVE')
    expect(text).not.toMatch(/\d+\s*[·.]\s*(?:MARKDOWN|OCTAVE)/)
    expect(text).not.toContain('notebook-test')
    expect(text).not.toContain('\\frac')
    expect(text).not.toContain('\\sqrt')
    expect(text).not.toContain('$$')
    expect(positionedText.find((item) => item.text === 'Salida')?.x).toBeLessThan(80)
    expect(positionedText.find((item) => item.text.startsWith('Error'))?.x).toBeLessThan(80)

    const metadata = await pdf.getMetadata()
    expect(metadata.info.Title).toBeUndefined()
    expect(metadata.info.Author).toBeUndefined()
    expect(metadata.info.Subject).toBeUndefined()
    expect(metadata.info.Creator).toBeUndefined()
    expect(metadata.info.Producer).toBeUndefined()
    await loadingTask.destroy()
  })
})
