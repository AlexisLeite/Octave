import type { NotebookCell } from '../types'

export interface NotebookHeading {
  cellId: string
  cellIndex: number
  indexInCell: number
  level: number
  label: string
  path: string[]
}

const atxHeading = /^ {0,3}(#{1,6})(?:[ \t]+|$)(.*)$/
const fence = /^ {0,3}(`{3,}|~{3,})/

function headingLabel(source: string) {
  return source
    .replace(/[ \t]+#+[ \t]*$/, '')
    .trim()
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .replace(/\\([\\`*_[\]{}()#+.!-])/g, '$1')
    .replace(/\s+/g, ' ')
}

export function extractNotebookHeadings(cells: NotebookCell[]): NotebookHeading[] {
  const headings: NotebookHeading[] = []
  const hierarchy: Array<string | undefined> = []

  cells.forEach((cell, cellIndex) => {
    if (cell.kind !== 'markdown') return

    let activeFence: { marker: string; length: number } | null = null
    let indexInCell = 0

    for (const line of cell.source.split(/\r?\n/)) {
      const fenceMatch = fence.exec(line)
      if (fenceMatch) {
        const marker = fenceMatch[1][0]
        const length = fenceMatch[1].length
        if (!activeFence) activeFence = { marker, length }
        else if (activeFence.marker === marker && length >= activeFence.length) activeFence = null
        continue
      }
      if (activeFence) continue

      const match = atxHeading.exec(line)
      if (!match) continue
      const label = headingLabel(match[2])
      if (!label) continue

      const level = match[1].length
      hierarchy.length = level
      hierarchy[level - 1] = label
      headings.push({
        cellId: cell.id,
        cellIndex,
        indexInCell,
        level,
        label,
        path: hierarchy.filter((item): item is string => Boolean(item)),
      })
      indexInCell += 1
    }
  })

  return headings
}

export function breadcrumbForCell(headings: NotebookHeading[], cells: NotebookCell[], cellId: string) {
  const cellIndex = cells.findIndex((cell) => cell.id === cellId)
  if (cellIndex < 0) return []

  let path: string[] = []
  for (const heading of headings) {
    if (heading.cellIndex > cellIndex) break
    path = heading.path
  }
  return path
}
