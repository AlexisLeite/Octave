import { describe, expect, it } from 'vitest'
import type { NotebookCell } from '../types'
import { breadcrumbForCell, extractNotebookHeadings } from './notebookHeadings'

function markdown(id: string, source: string): NotebookCell {
  return { id, kind: 'markdown', source }
}

describe('notebook heading breadcrumbs', () => {
  it('builds hierarchy across markdown cells in document order', () => {
    const cells: NotebookCell[] = [
      markdown('intro', '# Tema\nTexto\n### Ejercicio'),
      { id: 'code', kind: 'code', source: 'x = 1;' },
      markdown('detail', '## Subtema\n#### Caso'),
    ]

    expect(extractNotebookHeadings(cells).map(({ level, label, path }) => ({ level, label, path }))).toEqual([
      { level: 1, label: 'Tema', path: ['Tema'] },
      { level: 3, label: 'Ejercicio', path: ['Tema', 'Ejercicio'] },
      { level: 2, label: 'Subtema', path: ['Tema', 'Subtema'] },
      { level: 4, label: 'Caso', path: ['Tema', 'Subtema', 'Caso'] },
    ])
  })

  it('ignores headings inside fenced code and cleans common inline markup', () => {
    const headings = extractNotebookHeadings([
      markdown('one', '```octave\n# No es título\n```\n## **Método** [rápido](https://example.com) ##'),
    ])

    expect(headings).toHaveLength(1)
    expect(headings[0]).toMatchObject({ level: 2, label: 'Método rápido', path: ['Método rápido'] })
  })

  it('uses the latest hierarchy at or before a focused cell', () => {
    const cells: NotebookCell[] = [
      markdown('topic', '# Tema'),
      { id: 'code', kind: 'code', source: 'x = 1;' },
      markdown('exercise', '## Ejercicio'),
    ]
    const headings = extractNotebookHeadings(cells)

    expect(breadcrumbForCell(headings, cells, 'code')).toEqual(['Tema'])
    expect(breadcrumbForCell(headings, cells, 'exercise')).toEqual(['Tema', 'Ejercicio'])
    expect(breadcrumbForCell(headings, cells, 'missing')).toEqual([])
  })
})
