import { describe, expect, it } from 'vitest'
import { filterHelpTree, findHelpNode, octaveHelp, searchHelp, type HelpNode } from './octaveHelp'

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

  it('documenta do-until y separa lectura de dimensiones de cambio de forma', () => {
    const until = findHelpNode(octaveHelp, 'programacion-do-until')
    const dimensions = findHelpNode(octaveHelp, 'fundamentos-dimensiones')
    const reshape = findHelpNode(octaveHelp, 'fundamentos-cambio-forma')

    expect(until?.blocks.filter((block) => block.kind === 'code')).toHaveLength(2)
    expect(dimensions?.keywords).toEqual(expect.arrayContaining(['size', 'ndims', 'numel', 'isrow']))
    expect(reshape?.keywords).toEqual(expect.arrayContaining(['reshape', 'permute', 'squeeze']))
    expect(searchHelp(octaveHelp, 'until')[0].node.id).toBe('programacion-do-until')
  })

  it('documenta y prioriza las constantes matemáticas y numéricas', () => {
    const constants = findHelpNode(octaveHelp, 'fundamentos-constantes')

    expect(constants?.blocks.filter((block) => block.kind === 'code')).toHaveLength(4)
    expect(constants?.keywords).toEqual(expect.arrayContaining([
      'e', 'Euler', 'pi', 'Inf', 'NaN', 'eps', 'realmin', 'realmax',
    ]))
    expect(searchHelp(octaveHelp, 'e')[0].node.id).toBe('fundamentos-constantes')
    expect(searchHelp(octaveHelp, 'euler')[0].node.id).toBe('fundamentos-constantes')
    expect(searchHelp(octaveHelp, 'pi')[0].node.id).toBe('fundamentos-constantes')
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

  it('normaliza tildes, mayúsculas, puntuación y espacios antes de buscar', () => {
    const ids = (query: string) => searchHelp(octaveHelp, query).map((result) => result.node.id)

    expect(ids('comparación')).toEqual(ids('comparacion'))
    expect(ids('comparación')).toEqual(ids('  [ ¿COMPARACIÓN?! ]  '))
    expect(ids('entrada/salida')).toEqual(ids('entrada   salida'))
    expect(ids('entrada/salida')).toEqual(ids('entrada---salida'))
    expect(ids('entrada/salida')).toEqual(ids('entrada ( salida )'))
  })

  it('encuentra preguntas naturales después de quitar puntuación y palabras funcionales', () => {
    const results = searchHelp(octaveHelp, '¿qué es NaN?')
    const ids = results.map((result) => result.node.id)

    expect(ids).toContain('tipos-flotantes')
    expect(results.every((result) => result.score > 0)).toBe(true)
  })

  it('prioriza coincidencias exactas de token y prefijos sobre subcadenas', () => {
    const exact = searchHelp(octaveHelp, 'max')
    const prefix = searchHelp(octaveHelp, 'maxi')

    expect(exact[0].node.id).toBe('fundamentos-min-max')
    expect(prefix[0].node.id).toBe('fundamentos-min-max')

    const exactTopic = exact.find((result) => result.node.id === 'fundamentos-min-max')
    const substringTopic = exact.find((result) => result.node.id === 'tipos-enteros')
    expect(exactTopic).toBeDefined()
    expect(substringTopic).toBeDefined()
    expect(exactTopic!.score).toBeGreaterThan(substringTopic!.score)
  })
})
