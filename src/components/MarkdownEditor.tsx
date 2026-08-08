import { useEffect, useRef } from 'react'
import { baseKeymap, setBlockType, toggleMark, wrapIn } from 'prosemirror-commands'
import { history, redo, undo } from 'prosemirror-history'
import { keymap } from 'prosemirror-keymap'
import { defaultMarkdownParser, defaultMarkdownSerializer, schema } from 'prosemirror-markdown'
import { EditorState, Plugin, TextSelection, type Command, type Transaction } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
}

/**
 * Applies the familiar Markdown block prefixes while they are being typed.
 * `text` is not part of the document yet (it comes from handleTextInput), so
 * consuming the shortcut also prevents its trailing space from being inserted.
 */
export function markdownBlockShortcut(
  state: EditorState,
  from: number,
  to: number,
  text: string,
): Transaction | null {
  if (text !== ' ' || from !== to) return null

  const $from = state.doc.resolve(from)
  const paragraph = $from.parent
  if (paragraph.type !== schema.nodes.paragraph) return null

  const beforeCursor = paragraph.textBetween(0, $from.parentOffset, undefined, '\ufffc')
  const heading = /^(#{1,6})$/.exec(beforeCursor)
  const orderedList = /^(\d+)\.$/.exec(beforeCursor)

  let replacement
  let cursorOffset: number
  let markerLength: number

  if (heading) {
    markerLength = heading[1].length
    replacement = schema.nodes.heading.create(
      { level: markerLength },
      paragraph.content.cut(markerLength),
    )
    cursorOffset = 1
  } else if (beforeCursor === '>') {
    markerLength = 1
    const innerParagraph = schema.nodes.paragraph.create(
      null,
      paragraph.content.cut(markerLength),
    )
    replacement = schema.nodes.blockquote.create(null, innerParagraph)
    cursorOffset = 2
  } else if (/^[-*+]$/.test(beforeCursor)) {
    markerLength = 1
    const innerParagraph = schema.nodes.paragraph.create(
      null,
      paragraph.content.cut(markerLength),
    )
    const item = schema.nodes.list_item.create(null, innerParagraph)
    replacement = schema.nodes.bullet_list.create(null, item)
    cursorOffset = 3
  } else if (orderedList) {
    markerLength = orderedList[0].length
    const innerParagraph = schema.nodes.paragraph.create(
      null,
      paragraph.content.cut(markerLength),
    )
    const item = schema.nodes.list_item.create(null, innerParagraph)
    replacement = schema.nodes.ordered_list.create(
      { order: Number(orderedList[1]) },
      item,
    )
    cursorOffset = 3
  } else if (beforeCursor === '```') {
    markerLength = 3
    replacement = schema.nodes.code_block.create(
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

/**
 * Converts a complete Markdown heading when Enter is pressed. This also covers
 * pasted text and browser input paths that do not emit one event per character.
 */
export const markdownHeadingOnEnter: Command = (state, dispatch) => {
  const { $from, empty } = state.selection
  if (!empty || $from.parent.type !== schema.nodes.paragraph) return false
  if ($from.parentOffset !== $from.parent.content.size) return false

  const match = /^(#{1,6})\s+(.+)$/.exec($from.parent.textContent)
  if (!match) return false

  const blockPos = $from.before()
  const heading = schema.nodes.heading.create(
    { level: match[1].length },
    schema.text(match[2]),
  )
  const paragraph = schema.nodes.paragraph.create()
  const transaction = state.tr
    .replaceWith(blockPos, blockPos + $from.parent.nodeSize, [heading, paragraph])

  const paragraphCursor = blockPos + heading.nodeSize + 1
  transaction.setSelection(TextSelection.near(transaction.doc.resolve(paragraphCursor)))
  dispatch?.(transaction.scrollIntoView())
  return true
}

function markdownInputShortcuts() {
  return new Plugin({
    props: {
      handleTextInput(view, from, to, text) {
        const transaction = markdownBlockShortcut(view.state, from, to, text)
        if (!transaction) return false
        view.dispatch(transaction)
        return true
      },
    },
  })
}

export function MarkdownEditor({ value, onChange }: MarkdownEditorProps) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!host.current) return
    const shortcuts = keymap({
      'Mod-b': toggleMark(schema.marks.strong),
      'Mod-i': toggleMark(schema.marks.em),
      'Mod-`': toggleMark(schema.marks.code),
      'Mod-z': undo,
      'Mod-Shift-z': redo,
      'Mod-y': redo,
      'Ctrl-Alt-0': setBlockType(schema.nodes.paragraph),
      'Ctrl-Alt-1': setBlockType(schema.nodes.heading, { level: 1 }),
      'Ctrl-Alt-2': setBlockType(schema.nodes.heading, { level: 2 }),
      'Ctrl-Alt-3': setBlockType(schema.nodes.heading, { level: 3 }),
      'Mod->': wrapIn(schema.nodes.blockquote),
      'Enter': markdownHeadingOnEnter,
    })
    const editor = new EditorView(host.current, {
      state: EditorState.create({
        doc: defaultMarkdownParser.parse(value || ''),
        plugins: [history(), markdownInputShortcuts(), shortcuts, keymap(baseKeymap)],
      }),
      dispatchTransaction(transaction) {
        const next = editor.state.apply(transaction)
        editor.updateState(next)
        if (transaction.docChanged) onChangeRef.current(defaultMarkdownSerializer.serialize(next.doc))
      },
      attributes: { class: 'markdown-prosemirror', spellcheck: 'true' },
    })
    view.current = editor
    return () => { editor.destroy(); view.current = null }
  }, [])

  useEffect(() => {
    const editor = view.current
    if (!editor) return
    const current = defaultMarkdownSerializer.serialize(editor.state.doc)
    if (current !== value) {
      editor.updateState(EditorState.create({
        doc: defaultMarkdownParser.parse(value || ''),
        plugins: editor.state.plugins,
      }))
    }
  }, [value])

  return <div ref={host} className="markdown-host" />
}
