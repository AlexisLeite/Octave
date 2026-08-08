import { describe, expect, it } from 'vitest'
import type { NotebookDocument } from '../types'
import { clearNotebookCellOutput } from './notebookOutput'

describe('clearNotebookCellOutput', () => {
  it('only removes the requested persisted output', () => {
    const document: NotebookDocument = {
      version: 1,
      id: 'notebook-1',
      title: 'Notebook',
      cells: [
        { id: 'a', kind: 'code', source: 'x = 1' },
        { id: 'b', kind: 'code', source: 'disp(x)' },
      ],
      outputs: {
        a: { cellId: 'a', stdout: '1', stderr: '', durationMs: 1, error: null },
        b: { cellId: 'b', stdout: '1', stderr: '', durationMs: 1, error: null },
      },
    }

    const result = clearNotebookCellOutput(document, 'b')

    expect(result.cells).toBe(document.cells)
    expect(result.outputs).toEqual({ a: document.outputs?.a })
    expect(document.outputs?.b).toBeDefined()
  })
})
