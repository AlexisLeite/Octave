import { describe, expect, it } from 'vitest'
import type { NotebookDocument } from '../types'
import {
  applyNotebookSnapshot,
  createNotebookHistory,
  recordNotebookEdit,
  redoNotebookEdit,
  undoNotebookEdit,
} from './notebookHistory'

function notebook(source = 'a = 1;'): NotebookDocument {
  return {
    version: 1,
    id: 'doc-a',
    title: 'A',
    cells: [{ id: 'c1', kind: 'code', source }],
    outputs: {
      c1: { cellId: 'c1', source, stdout: '1\n', stderr: '', durationMs: 1, error: null },
    },
  }
}

describe('notebookHistory', () => {
  it('registra cada cambio estructural como un paso independiente', () => {
    const initial = notebook('a')
    let history = createNotebookHistory(initial)
    const added: NotebookDocument = {
      ...initial,
      cells: [...initial.cells, { id: 'c2', kind: 'code', source: '' }],
    }
    history = recordNotebookEdit(history, initial, added)
    expect(history.past).toHaveLength(1)
    const moved: NotebookDocument = {
      ...initial,
      cells: [{ id: 'c2', kind: 'code', source: '' }, ...initial.cells],
    }
    history = recordNotebookEdit(history, added, moved)
    expect(history.past).toHaveLength(2)
  })

  it('incluye kind, add/split, reorder y delete en el orden global', () => {
    const initial = notebook()
    const converted = { ...initial, cells: [{ ...initial.cells[0], kind: 'markdown' as const }] }
    const split = { ...converted, cells: [...converted.cells, { id: 'c2', kind: 'markdown' as const, source: '# Nota' }] }
    const moved = { ...split, cells: [split.cells[1], split.cells[0]] }
    const deleted = { ...moved, cells: [moved.cells[0]] }
    let history = createNotebookHistory(initial)
    history = recordNotebookEdit(history, initial, converted)
    history = recordNotebookEdit(history, converted, split)
    history = recordNotebookEdit(history, split, moved)
    history = recordNotebookEdit(history, moved, deleted)
    history = undoNotebookEdit(history)
    expect(history.present.cells.map((cell) => cell.id)).toEqual(['c2', 'c1'])
    history = undoNotebookEdit(history)
    expect(history.present.cells.map((cell) => cell.id)).toEqual(['c1', 'c2'])
    history = undoNotebookEdit(history)
    expect(history.present.cells).toEqual(converted.cells)
    history = undoNotebookEdit(history)
    expect(history.present.cells[0].kind).toBe('code')
  })

  it('mantiene redo hasta una nueva mutación y luego lo descarta', () => {
    const initial = notebook('a')
    const edited = notebook('ab')
    let history = recordNotebookEdit(createNotebookHistory(initial), initial, edited)
    history = undoNotebookEdit(history)
    expect(redoNotebookEdit(history).present.cells[0].source).toBe('ab')

    history = recordNotebookEdit(history, initial, notebook('ax'))
    expect(history.future).toEqual([])
    expect(redoNotebookEdit(history)).toBe(history)
  })

  it('no incluye salidas en undo y elimina las de celdas ausentes', () => {
    const current = notebook()
    current.outputs!.removed = { cellId: 'removed', stdout: 'viejo', stderr: '', durationMs: 1, error: null }
    const restored = applyNotebookSnapshot(current, {
      title: 'Restaurado',
      cells: [{ id: 'c1', kind: 'code', source: 'a = 2;' }],
    })
    expect(restored.outputs).toEqual({ c1: current.outputs!.c1 })
    expect(restored.cells[0].source).toBe('a = 2;')
  })

  it('preserva ediciones internas posteriores al aplicar una operación estructural', () => {
    const before = notebook('antes')
    const afterStructure = {
      ...before,
      cells: [...before.cells, { id: 'c2', kind: 'markdown' as const, source: '# Nueva' }],
    }
    const current = {
      ...afterStructure,
      cells: [{ ...afterStructure.cells[0], source: 'editado después' }, afterStructure.cells[1]],
    }
    const restored = applyNotebookSnapshot(
      current,
      createNotebookHistory(before).present,
      createNotebookHistory(afterStructure).present,
    )
    expect(restored.cells).toEqual([{ ...before.cells[0], source: 'editado después' }])
  })

  it('revierte el cambio de fuente que forma parte de un split estructural', () => {
    const before = notebook('uno dos')
    const afterSplit = {
      ...before,
      cells: [
        { ...before.cells[0], source: 'uno' },
        { id: 'c2', kind: 'code' as const, source: 'dos' },
      ],
    }
    const restored = applyNotebookSnapshot(
      afterSplit,
      createNotebookHistory(before).present,
      createNotebookHistory(afterSplit).present,
    )
    expect(restored.cells).toEqual(before.cells)
  })

  it('sincroniza ediciones internas previas como base sin crear otro paso', () => {
    const loaded = notebook('cargado')
    const edited = notebook('editado antes')
    const afterStructure = {
      ...edited,
      cells: [...edited.cells, { id: 'c2', kind: 'code' as const, source: '' }],
    }
    const history = recordNotebookEdit(createNotebookHistory(loaded), edited, afterStructure)
    expect(history.past).toHaveLength(1)
    expect(history.past[0].cells[0].source).toBe('editado antes')
    expect(undoNotebookEdit(history).present.cells[0].source).toBe('editado antes')
  })

  it('crea historias independientes al abrir otro documento', () => {
    const before = notebook('a')
    const first = recordNotebookEdit(createNotebookHistory(before), before, notebook('b'))
    const other = { ...notebook('x'), id: 'doc-b', title: 'B' }
    const second = createNotebookHistory(other)
    expect(first.past).toHaveLength(1)
    expect(second.past).toHaveLength(0)
    expect(undoNotebookEdit(second)).toBe(second)
  })
})
