import { schema } from 'prosemirror-markdown'
import { Fragment, Schema, Slice, type Node as ProseMirrorNode } from 'prosemirror-model'
import { TextSelection, type Command, type EditorState, type Transaction } from 'prosemirror-state'

/** Applies Markdown block prefixes as they are typed. */
export function markdownBlockShortcut(
  state: EditorState,
  from: number,
  to: number,
  text: string,
): Transaction | null {
  if (text !== ' ' || from !== to) return null

  const $from = state.doc.resolve(from)
  const paragraph = $from.parent
  const editorSchema = state.schema
  if (paragraph.type !== editorSchema.nodes.paragraph) return null

  const beforeCursor = paragraph.textBetween(0, $from.parentOffset, undefined, '\ufffc')
  const heading = /^(#{1,6})$/.exec(beforeCursor)
  const orderedList = /^(\d+)\.$/.exec(beforeCursor)

  let replacement
  let cursorOffset: number
  let markerLength: number

  if (heading) {
    markerLength = heading[1].length
    replacement = editorSchema.nodes.heading.create(
      { level: markerLength },
      paragraph.content.cut(markerLength),
    )
    cursorOffset = 1
  } else if (beforeCursor === '>') {
    markerLength = 1
    const innerParagraph = editorSchema.nodes.paragraph.create(
      null,
      paragraph.content.cut(markerLength),
    )
    replacement = editorSchema.nodes.blockquote.create(null, innerParagraph)
    cursorOffset = 2
  } else if (/^[-*+]$/.test(beforeCursor)) {
    markerLength = 1
    const innerParagraph = editorSchema.nodes.paragraph.create(
      null,
      paragraph.content.cut(markerLength),
    )
    const item = editorSchema.nodes.list_item.create(null, innerParagraph)
    replacement = editorSchema.nodes.bullet_list.create(null, item)
    cursorOffset = 3
  } else if (orderedList) {
    markerLength = orderedList[0].length
    const innerParagraph = editorSchema.nodes.paragraph.create(
      null,
      paragraph.content.cut(markerLength),
    )
    const item = editorSchema.nodes.list_item.create(null, innerParagraph)
    replacement = editorSchema.nodes.ordered_list.create(
      { order: Number(orderedList[1]) },
      item,
    )
    cursorOffset = 3
  } else if (beforeCursor === '```') {
    markerLength = 3
    replacement = editorSchema.nodes.code_block.create(
      null,
      paragraph.content.cut(markerLength),
    )
    cursorOffset = 1
  } else {
    return null
  }

  const blockPos = $from.before()
  const parent = $from.node($from.depth - 1)
  const index = $from.index($from.depth - 1)
  if (!parent.canReplaceWith(index, index + 1, replacement.type)) return null

  const transaction = state.tr.replaceWith(
    blockPos,
    blockPos + paragraph.nodeSize,
    replacement,
  )
  transaction.setSelection(TextSelection.near(transaction.doc.resolve(blockPos + cursorOffset)))
  return transaction.scrollIntoView()
}

/** Converts `# Heading` when Enter is pressed, including pasted input. */
export const markdownHeadingOnEnter: Command = (state, dispatch) => {
  const { $from, empty } = state.selection
  const editorSchema = state.schema
  if (!empty || $from.parent.type !== editorSchema.nodes.paragraph) return false
  if ($from.parentOffset !== $from.parent.content.size) return false

  const match = /^(#{1,6})\s+(.+)$/.exec($from.parent.textContent)
  if (!match) return false

  const blockPos = $from.before()
  const heading = editorSchema.nodes.heading.create(
    { level: match[1].length },
    editorSchema.text(match[2]),
  )
  const paragraph = editorSchema.nodes.paragraph.create()
  const transaction = state.tr
    .replaceWith(blockPos, blockPos + $from.parent.nodeSize, [heading, paragraph])

  transaction.setSelection(TextSelection.near(
    transaction.doc.resolve(blockPos + heading.nodeSize + 1),
  ))
  dispatch?.(transaction.scrollIntoView())
  return true
}

const bulletLine = /^\s*[•◦▪*-]\s+(.+)$/
const orderedLine = /^\s*(\d+)[.)]\s+(.+)$/
const headingLine = /^\s*(#{1,6})\s+(.+)$/

function inlineMath(line: string, targetSchema: Schema): ProseMirrorNode[] {
  const mathType = targetSchema.nodes.math_inline
  if (!mathType) return line ? [targetSchema.text(line)] : []

  const content: ProseMirrorNode[] = []
  let cursor = 0
  const expression = /(^|[^\\])\$([^$\n]+?)\$/g
  let match: RegExpExecArray | null
  while ((match = expression.exec(line))) {
    const marker = match.index + match[1].length
    if (marker > cursor) content.push(targetSchema.text(line.slice(cursor, marker)))
    content.push(mathType.create({ latex: match[2] }))
    cursor = marker + match[2].length + 2
  }
  if (cursor < line.length) content.push(targetSchema.text(line.slice(cursor)))
  return content
}

function inlineLines(lines: string[], targetSchema: Schema): ProseMirrorNode[] {
  const content: ProseMirrorNode[] = []
  lines.forEach((line, index) => {
    if (index > 0) content.push(targetSchema.nodes.hard_break.create())
    content.push(...inlineMath(line, targetSchema))
  })
  return content
}

/** Converts structured plain text (notably PDF clipboard text) to a PM slice. */
export function plainTextPasteSlice(text: string, targetSchema: Schema = schema): Slice {
  const lines = text.replace(/\r\n?/g, '\n').split('\n')
  const blocks: ProseMirrorNode[] = []
  let index = 0

  while (index < lines.length) {
    if (!lines[index].trim()) {
      index += 1
      continue
    }

    const sameLineMath = /^\s*\$\$([\s\S]+)\$\$\s*$/.exec(lines[index])
    if (sameLineMath && targetSchema.nodes.math_block) {
      blocks.push(targetSchema.nodes.math_block.create({ latex: sameLineMath[1].trim() }))
      index += 1
      continue
    }

    if (lines[index].trim() === '$$' && targetSchema.nodes.math_block) {
      const latex: string[] = []
      index += 1
      while (index < lines.length && lines[index].trim() !== '$$') {
        latex.push(lines[index])
        index += 1
      }
      if (index < lines.length) index += 1
      blocks.push(targetSchema.nodes.math_block.create({ latex: latex.join('\n').trim() }))
      continue
    }

    const heading = headingLine.exec(lines[index])
    if (heading) {
      blocks.push(targetSchema.nodes.heading.create(
        { level: heading[1].length },
        inlineMath(heading[2], targetSchema),
      ))
      index += 1
      continue
    }

    const firstBullet = bulletLine.exec(lines[index])
    const firstOrdered = orderedLine.exec(lines[index])
    if (firstBullet || firstOrdered) {
      const ordered = Boolean(firstOrdered)
      const items: ProseMirrorNode[] = []
      const order = firstOrdered ? Number(firstOrdered[1]) : 1

      while (index < lines.length) {
        const marker = ordered ? orderedLine.exec(lines[index]) : bulletLine.exec(lines[index])
        if (!marker) break

        const itemLines = [ordered ? marker[2] : marker[1]]
        index += 1
        while (
          index < lines.length
          && lines[index].trim()
          && !headingLine.test(lines[index])
          && !bulletLine.test(lines[index])
          && !orderedLine.test(lines[index])
        ) {
          itemLines.push(lines[index])
          index += 1
        }
        items.push(targetSchema.nodes.list_item.create(
          null,
          targetSchema.nodes.paragraph.create(null, inlineLines(itemLines, targetSchema)),
        ))
        if (index < lines.length && !lines[index].trim()) break
      }

      blocks.push(ordered
        ? targetSchema.nodes.ordered_list.create({ order }, items)
        : targetSchema.nodes.bullet_list.create(null, items))
      continue
    }

    const paragraphLines: string[] = []
    while (
      index < lines.length
      && lines[index].trim()
      && !headingLine.test(lines[index])
      && !bulletLine.test(lines[index])
      && !orderedLine.test(lines[index])
    ) {
      paragraphLines.push(lines[index])
      index += 1
    }
    blocks.push(targetSchema.nodes.paragraph.create(null, inlineLines(paragraphLines, targetSchema)))
  }

  return new Slice(Fragment.fromArray(blocks), 0, 0)
}
