import { describe, expect, it } from 'vitest'
import { filterHelpTree, findHelpNode, octaveHelp, type HelpNode } from './octaveHelp'

function everyNode(nodes: HelpNode[], predicate: (node: HelpNode) => boolean): boolean {
  return nodes.every((node) => predicate(node) && everyNode(node.children ?? [], predicate))
}

describe('octaveHelp', () => {
  it('cubre todas las áreas con manual y ejemplos', () => {
    expect(octaveHelp).toHaveLength(14)
    expect(everyNode(octaveHelp, (node) => Boolean(node.summary && node.examples.length))).toBe(true)
  })

  it('busca sin depender de mayúsculas ni tildes y conserva la rama', () => {
    const result = filterHelpTree(octaveHelp, 'INTEGRACIÓN')
    expect(result.map((node) => node.id)).toContain('calculo')
    expect(findHelpNode(result, 'calculo-integracion')).toBeDefined()
  })

  it('busca dentro del código de ejemplo', () => {
    expect(findHelpNode(filterHelpTree(octaveHelp, 'endfunction'), 'funciones')).toBeDefined()
  })
})
