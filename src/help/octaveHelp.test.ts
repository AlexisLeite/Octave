import { describe, expect, it } from 'vitest'
import { filterHelpTree, findHelpNode, octaveHelp, type HelpNode } from './octaveHelp'

function flatten(nodes: HelpNode[]): HelpNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children ?? [])])
}

describe('octaveHelp', () => {
  const nodes = flatten(octaveHelp)

  it('integra en orden los tres capítulos del manual', () => {
    expect(octaveHelp.map((node) => node.id)).toEqual([
      'fundamentos-sesion',
      'fundamentos-arreglos',
      'fundamentos-indexacion-operadores',
      'fundamentos-datos-compuestos',
      'programacion-control',
      'programacion-funciones',
      'programacion-io',
      'programacion-calidad',
      'numeric-linear',
      'numeric-calculus',
      'numeric-statistics',
      'numeric-graphics',
      'numeric-performance',
      'numeric-ecosystem',
    ])
  })

  it('ofrece un manual sustancial con narrativa y ejemplos ejecutables', () => {
    const markdownCount = nodes.flatMap((node) => node.blocks).filter((block) => block.kind === 'markdown').length
    const codeCount = nodes.flatMap((node) => node.blocks).filter((block) => block.kind === 'code').length

    expect(nodes.length).toBeGreaterThanOrEqual(65)
    expect(markdownCount).toBeGreaterThanOrEqual(125)
    expect(codeCount).toBeGreaterThanOrEqual(125)
    expect(nodes.every((node) => node.blocks.length > 0)).toBe(true)
    expect(nodes.filter((node) => !node.children?.length).every((node) => (
      node.blocks.some((block) => block.kind === 'markdown')
      && node.blocks.some((block) => block.kind === 'code')
    ))).toBe(true)
  })

  it('documenta for en profundidad y con múltiples bloques ejecutables', () => {
    const forTopics = nodes.filter((node) => node.id.includes('programacion-for'))
    const forCodeBlocks = forTopics.flatMap((node) => node.blocks).filter((block) => block.kind === 'code')

    expect(forTopics.length).toBeGreaterThanOrEqual(4)
    expect(forCodeBlocks.length).toBeGreaterThanOrEqual(8)
    expect(findHelpNode(octaveHelp, 'programacion-for-columnas')).toBeDefined()
    expect(findHelpNode(octaveHelp, 'programacion-for-rendimiento')).toBeDefined()
  })

  it('busca sin depender de mayúsculas ni tildes y conserva ancestros', () => {
    const result = filterHelpTree(octaveHelp, 'INTEGRACIÓN')

    expect(result.map((node) => node.id)).toContain('numeric-calculus')
    expect(findHelpNode(result, 'numeric-integration-interpolation')).toBeDefined()
  })

  it('busca en títulos, palabras clave, narrativa, títulos de ejemplo y código', () => {
    expect(findHelpNode(filterHelpTree(octaveHelp, 'columnas de matrices'), 'programacion-for-columnas')).toBeDefined()
    expect(findHelpNode(filterHelpTree(octaveHelp, 'condicionamiento'), 'numeric-spectrum')).toBeDefined()
    expect(findHelpNode(filterHelpTree(octaveHelp, 'endfunction'), 'programacion-funciones-definicion')).toBeDefined()
    expect(findHelpNode(filterHelpTree(octaveHelp, 'Monte Carlo'), 'numeric-monte-carlo')).toBeDefined()
  })

  it('mantiene el árbol original cuando la búsqueda está vacía', () => {
    expect(filterHelpTree(octaveHelp, '   ')).toBe(octaveHelp)
  })
})
