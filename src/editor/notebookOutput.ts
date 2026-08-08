import type { NotebookDocument } from '../types'

export function clearNotebookCellOutput(document: NotebookDocument, cellId: string): NotebookDocument {
  if (!document.outputs?.[cellId]) return document
  const outputs = { ...document.outputs }
  delete outputs[cellId]
  return { ...document, outputs }
}
