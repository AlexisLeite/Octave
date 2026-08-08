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
    .replace(/[^\p{L}\p{N}_]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function tokens(value: string) {
  const valueNormalized = normalized(value)
  return valueNormalized ? valueNormalized.split(' ') : []
}

const QUERY_STOP_WORDS = new Set([
  'a', 'al', 'como', 'cual', 'de', 'del', 'el', 'en', 'es', 'la', 'las',
  'lo', 'los', 'o', 'para', 'por', 'que', 'un', 'una', 'y',
])

function meaningfulQueryTokens(value: string) {
  const allTokens = tokens(value)
  const meaningful = allTokens.filter((token) => !QUERY_STOP_WORDS.has(token))
  return meaningful.length ? meaningful : allTokens
}

export interface HelpSearchResult {
  node: HelpNode
  /** Títulos desde la raíz hasta el padre del resultado. */
  breadcrumb: string[]
  score: number
}

interface IndexedHelpNode {
  node: HelpNode
  breadcrumb: string[]
  order: number
}

function indexHelp(nodes: HelpNode[], breadcrumb: string[] = [], indexed: IndexedHelpNode[] = []) {
  for (const node of nodes) {
    indexed.push({ node, breadcrumb, order: indexed.length })
    indexHelp(node.children ?? [], [...breadcrumb, node.title], indexed)
  }
  return indexed
}

function includesEveryQueryToken(value: string, queryTokens: string[]) {
  if (!queryTokens.length) return false
  const valueTokens = new Set(tokens(value))
  return queryTokens.every((token) => valueTokens.has(token))
}

function prefixesEveryQueryToken(value: string, queryTokens: string[]) {
  if (!queryTokens.length) return false
  const valueTokens = tokens(value)
  return queryTokens.every((queryToken) => (
    valueTokens.some((valueToken) => valueToken.startsWith(queryToken))
  ))
}

function includesEveryQuerySubstring(value: string, queryTokens: string[]) {
  if (!queryTokens.length) return false
  const valueNormalized = normalized(value)
  return queryTokens.every((token) => valueNormalized.includes(token))
}

function scoreHelpNode(node: HelpNode, query: string, queryTokens: string[]) {
  const title = normalized(node.title)
  const keywords = (node.keywords ?? []).map(normalized)
  const blockTitles = node.blocks.flatMap((block) => block.kind === 'code' && block.title ? [block.title] : [])
  const blockSources = node.blocks.map((block) => block.source)
  const narrativeAndCode = [...blockTitles, ...blockSources]

  // Un nombre o alias exacto debe ganar incluso frente a muchas coincidencias
  // accidentales en el código de otra sección (por ejemplo max vs realmax).
  if (title === query) return 10_000
  if (keywords.some((keyword) => keyword === query)) return 9_800
  if (includesEveryQueryToken(node.title, queryTokens)) return 9_200
  if (keywords.some((keyword) => includesEveryQueryToken(keyword, queryTokens))) return 9_000
  if (narrativeAndCode.some((value) => includesEveryQueryToken(value, queryTokens))) return 8_600

  if (prefixesEveryQueryToken(node.title, queryTokens)) return 8_000
  if (keywords.some((keyword) => prefixesEveryQueryToken(keyword, queryTokens))) return 7_800
  if (narrativeAndCode.some((value) => prefixesEveryQueryToken(value, queryTokens))) return 7_400

  if (title.startsWith(query)) return 7_000
  if (keywords.some((keyword) => keyword.startsWith(query))) return 6_800
  if (title.includes(query)) return 6_000
  if (keywords.some((keyword) => keyword.includes(query))) return 5_800
  if (narrativeAndCode.some((value) => normalized(value).includes(query))) return 5_000
  if (includesEveryQuerySubstring(node.title, queryTokens)) return 4_800
  if (keywords.some((keyword) => includesEveryQuerySubstring(keyword, queryTokens))) return 4_600
  if (narrativeAndCode.some((value) => includesEveryQuerySubstring(value, queryTokens))) return 4_000
  return 0
}

/** Resultados planos ordenados por relevancia; el orden del manual desempata. */
export function searchHelp(nodes: HelpNode[], rawQuery: string): HelpSearchResult[] {
  const query = normalized(rawQuery.trim())
  if (!query) return []
  const queryTokens = meaningfulQueryTokens(query)

  return indexHelp(nodes)
    .map((entry) => ({ ...entry, score: scoreHelpNode(entry.node, query, queryTokens) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.order - right.order)
    .map(({ node, breadcrumb, score }) => ({ node, breadcrumb, score }))
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

/** Ruta inclusiva desde la raíz; permite revelar un resultado en el árbol. */
export function findHelpPath(nodes: HelpNode[], id: string, ancestors: HelpNode[] = []): HelpNode[] | undefined {
  for (const current of nodes) {
    const path = [...ancestors, current]
    if (current.id === id) return path
    const child = findHelpPath(current.children ?? [], id, path)
    if (child) return child
  }
}
