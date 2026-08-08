import type { NotebookCell, NotebookDocument } from '../types'

export interface NotebookSnapshot {
  title: string
  cells: NotebookCell[]
}

export interface NotebookHistory {
  past: NotebookSnapshot[]
  present: NotebookSnapshot
  future: NotebookSnapshot[]
}

function cloneCells(cells: NotebookCell[]): NotebookCell[] {
  return cells.map((cell) => ({ ...cell }))
}

export function notebookSnapshot(document: NotebookDocument): NotebookSnapshot {
  return { title: document.title, cells: cloneCells(document.cells) }
}

export function createNotebookHistory(document: NotebookDocument): NotebookHistory {
  return {
    past: [],
    present: notebookSnapshot(document),
    future: [],
  }
}

export function recordNotebookEdit(
  history: NotebookHistory,
  before: NotebookDocument,
  after: NotebookDocument,
): NotebookHistory {
  return {
    past: [...history.past, notebookSnapshot(before)],
    present: notebookSnapshot(after),
    future: [],
  }
}

export function undoNotebookEdit(history: NotebookHistory): NotebookHistory {
  const previous = history.past.at(-1)
  if (!previous) return history
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  }
}

export function redoNotebookEdit(history: NotebookHistory): NotebookHistory {
  const next = history.future[0]
  if (!next) return history
  return {
    past: [...history.past, history.present],
    present: next,
    future: history.future.slice(1),
  }
}

/**
 * La historia contiene solo estado editable. Las salidas pertenecen a la línea
 * de ejecución del kernel: no se deshacen al editar, igual que en un notebook.
 */
export function applyNotebookSnapshot(
  document: NotebookDocument,
  snapshot: NotebookSnapshot,
  baseline: NotebookSnapshot = notebookSnapshot(document),
): NotebookDocument {
  const cellIds = new Set(snapshot.cells.map((cell) => cell.id))
  const currentCells = new Map(document.cells.map((cell) => [cell.id, cell]))
  const baselineCells = new Map(baseline.cells.map((cell) => [cell.id, cell]))
  const outputs = Object.fromEntries(
    Object.entries(document.outputs ?? {}).filter(([cellId]) => cellIds.has(cellId)),
  )
  return {
    ...document,
    title: document.title === baseline.title ? snapshot.title : document.title,
    cells: snapshot.cells.map((target) => {
      const current = currentCells.get(target.id)
      const previous = baselineCells.get(target.id)
      if (!current || !previous || current.source === previous.source) return { ...target }
      return { ...target, source: current.source }
    }),
    outputs,
  }
}
