import { foundationHelp } from './chapters/foundations'
import { numericalHelp } from './chapters/numerical'
import { programmingHelp } from './chapters/programming'
import type { HelpNode } from './helpTypes'

export type { HelpBlock, HelpCodeBlock, HelpMarkdownBlock, HelpNode } from './helpTypes'

/**
 * Manual completo, ordenado desde los fundamentos del lenguaje hasta sus
 * herramientas de programación y las áreas numéricas aplicadas.
 */
export const octaveHelp: HelpNode[] = [
  ...foundationHelp,
  ...programmingHelp,
  ...numericalHelp,
]

function normalized(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
}

function matches(node: HelpNode, query: string) {
  const searchable = [
    node.title,
    ...(node.keywords ?? []),
    ...node.blocks.flatMap((block) => block.kind === 'code'
      ? [block.title ?? '', block.source]
      : [block.source]),
  ].join(' ')

  return normalized(searchable).includes(query)
}

/** Preserva los ancestros de cada coincidencia para que el resultado siga siendo navegable. */
export function filterHelpTree(nodes: HelpNode[], rawQuery: string): HelpNode[] {
  const query = normalized(rawQuery.trim())
  if (!query) return nodes

  return nodes.flatMap((current) => {
    const children = filterHelpTree(current.children ?? [], rawQuery)
    if (matches(current, query)) return [{ ...current }]
    if (children.length) return [{ ...current, children }]
    return []
  })
}

export function findHelpNode(nodes: HelpNode[], id: string): HelpNode | undefined {
  for (const current of nodes) {
    if (current.id === id) return current
    const child = findHelpNode(current.children ?? [], id)
    if (child) return child
  }
}
