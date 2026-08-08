import { SplitSquareVertical } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import 'katex/dist/katex.min.css'
import { baseKeymap, setBlockType, toggleMark, wrapIn } from 'prosemirror-commands'
import { history, redo, undo } from 'prosemirror-history'
import { keymap } from 'prosemirror-keymap'
import { DOMParser as ProseMirrorDOMParser } from 'prosemirror-model'
import { EditorState, Plugin } from 'prosemirror-state'
import { EditorView } from 'prosemirror-view'
import {
  markdownBlockShortcut,
  markdownHeadingOnEnter,
  plainTextPasteSlice,
} from '../editor/markdownEditing'
import {
  markdownParser,
  markdownSchema,
  markdownSerializer,
  mathInputPlugin,
  mathNodeViews,
  normalizeClipboardMath,
} from '../editor/markdownMath'

interface MarkdownEditorProps {
  value: string
  onChange: (value: string) => void
  onSplitSelection?: (remaining: string, extracted: string) => void
}

interface SelectionToolbarPosition {
  left: number
  top: number
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

function formattedPlainTextPaste() {
  return new Plugin({
    props: {
      handlePaste(view, event) {
        const clipboard = event.clipboardData
        if (!clipboard) return false

        // Let ProseMirror's DOM parser preserve semantic HTML and inline marks.
        if (clipboard.getData('text/html').trim()) return false

        const text = clipboard.getData('text/plain')
        if (!text || (!/[\r\n•◦▪]/.test(text) && !/\$[^$\n]+\$/.test(text))) return false

        view.dispatch(view.state.tr
          .replaceSelection(plainTextPasteSlice(text, view.state.schema))
          .scrollIntoView())
        return true
      },
    },
  })
}

function formattedHtmlMathPaste() {
  return new Plugin({
    props: {
      handlePaste(view, event) {
        const html = event.clipboardData?.getData('text/html')
        if (!html || !/<(?:math|su[bp])(?:\s|>)/i.test(html)) return false

        const clipboardDocument = new window.DOMParser().parseFromString(html, 'text/html')
        normalizeClipboardMath(clipboardDocument.body)
        const slice = ProseMirrorDOMParser.fromSchema(view.state.schema).parseSlice(
          clipboardDocument.body,
          { preserveWhitespace: true },
        )
        view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView())
        return true
      },
    },
  })
}

export function MarkdownEditor({ value, onChange, onSplitSelection }: MarkdownEditorProps) {
  // The component file intentionally exports only React components so Vite can
  // preserve the ProseMirror instance during Fast Refresh.
  const host = useRef<HTMLDivElement>(null)
  const mount = useRef<HTMLDivElement>(null)
  const toolbar = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onSplitSelectionRef = useRef(onSplitSelection)
  const [selectionToolbar, setSelectionToolbar] = useState<SelectionToolbarPosition | null>(null)
  onChangeRef.current = onChange
  onSplitSelectionRef.current = onSplitSelection

  function hideSelectionToolbar() {
    setSelectionToolbar(null)
  }

  function showSelectionToolbarAt(clientX: number, clientY: number) {
    const editor = view.current
    const editorMount = mount.current
    const editorHost = host.current
    if (!editor || !editorMount || !editorHost || editor.state.selection.empty) {
      hideSelectionToolbar()
      return
    }

    const browserSelection = window.getSelection()
    const anchor = browserSelection?.anchorNode
    if (!browserSelection || browserSelection.isCollapsed || !anchor || !editorMount.contains(anchor)) {
      hideSelectionToolbar()
      return
    }

    const range = browserSelection.rangeCount ? browserSelection.getRangeAt(0) : null
    const hoveredRect = range && Array.from(range.getClientRects()).find((rect) => (
      rect.width > 0
      && rect.height > 0
      && clientX >= rect.left - 1
      && clientX <= rect.right + 1
      && clientY >= rect.top - 1
      && clientY <= rect.bottom + 1
    ))
    if (!hoveredRect) {
      hideSelectionToolbar()
      return
    }

    const hostRect = editorHost.getBoundingClientRect()
    const toolbarHeight = 30
    const roomBelow = window.innerHeight - hoveredRect.bottom
    const top = roomBelow >= toolbarHeight + 8
      ? hoveredRect.bottom - hostRect.top + 5
      : hoveredRect.top - hostRect.top - toolbarHeight - 5
    setSelectionToolbar({
      left: Math.min(hostRect.width - 20, Math.max(20, clientX - hostRect.left)),
      top,
    })
  }

  function splitSelection() {
    const editor = view.current
    const callback = onSplitSelectionRef.current
    if (!editor || !callback || editor.state.selection.empty) {
      hideSelectionToolbar()
      return
    }

    const { from, to } = editor.state.selection
    // Cutting the document preserves the open ancestors around a partial
    // selection (paragraphs, list items, headings and inline marks). Serializing
    // selection.content() directly can flatten those open nodes.
    const selectedDocument = editor.state.doc.cut(from, to)
    const extracted = markdownSerializer.serialize(selectedDocument).trim()
    if (!extracted) {
      hideSelectionToolbar()
      return
    }

    const transaction = editor.state.tr
      .deleteSelection()
      .setMeta('addToHistory', false)
      .setMeta('splitMarkdownSelection', extracted)
    editor.dispatch(transaction)
    hideSelectionToolbar()
  }

  useEffect(() => {
    if (!mount.current) return
    const shortcuts = keymap({
      'Mod-b': toggleMark(markdownSchema.marks.strong),
      'Mod-i': toggleMark(markdownSchema.marks.em),
      'Mod-`': toggleMark(markdownSchema.marks.code),
      'Mod-z': undo,
      'Mod-Shift-z': redo,
      'Mod-y': redo,
      'Ctrl-Alt-0': setBlockType(markdownSchema.nodes.paragraph),
      'Ctrl-Alt-1': setBlockType(markdownSchema.nodes.heading, { level: 1 }),
      'Ctrl-Alt-2': setBlockType(markdownSchema.nodes.heading, { level: 2 }),
      'Ctrl-Alt-3': setBlockType(markdownSchema.nodes.heading, { level: 3 }),
      'Mod->': wrapIn(markdownSchema.nodes.blockquote),
      'Enter': markdownHeadingOnEnter,
    })
    const editor = new EditorView(mount.current, {
      state: EditorState.create({
        doc: markdownParser.parse(value || ''),
        plugins: [
          history(),
          markdownInputShortcuts(),
          mathInputPlugin(),
          formattedHtmlMathPaste(),
          formattedPlainTextPaste(),
          shortcuts,
          keymap(baseKeymap),
        ],
      }),
      dispatchTransaction(transaction) {
        const next = editor.state.apply(transaction)
        editor.updateState(next)
        if (transaction.docChanged) {
          const remaining = markdownSerializer.serialize(next.doc)
          const extracted = transaction.getMeta('splitMarkdownSelection') as string | undefined
          if (extracted && onSplitSelectionRef.current) {
            onSplitSelectionRef.current(remaining, extracted)
          } else {
            onChangeRef.current(remaining)
          }
        }
        if (next.selection.empty) hideSelectionToolbar()
      },
      attributes: { class: 'markdown-prosemirror', spellcheck: 'true' },
      nodeViews: mathNodeViews,
    })
    view.current = editor
    return () => { editor.destroy(); view.current = null }
  }, [])

  useEffect(() => {
    const editor = view.current
    if (!editor) return
    const current = markdownSerializer.serialize(editor.state.doc)
    if (current !== value) {
      editor.updateState(EditorState.create({
        doc: markdownParser.parse(value || ''),
        plugins: editor.state.plugins,
      }))
    }
  }, [value])

  useEffect(() => {
    const handleSelectionChange = () => {
      window.requestAnimationFrame(() => {
        if (view.current?.state.selection.empty || window.getSelection()?.isCollapsed) {
          hideSelectionToolbar()
        }
      })
    }
    const handlePointerDown = (event: PointerEvent) => {
      if (!toolbar.current?.contains(event.target as Node)) hideSelectionToolbar()
    }
    const handleScroll = () => hideSelectionToolbar()
    document.addEventListener('selectionchange', handleSelectionChange)
    document.addEventListener('pointerdown', handlePointerDown, true)
    document.addEventListener('scroll', handleScroll, true)
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)
      document.removeEventListener('pointerdown', handlePointerDown, true)
      document.removeEventListener('scroll', handleScroll, true)
    }
  }, [])

  return (
    <div
      ref={host}
      className="markdown-host"
      onMouseMove={(event) => {
        if (toolbar.current?.contains(event.target as Node)) return
        showSelectionToolbarAt(event.clientX, event.clientY)
      }}
      onMouseUp={(event) => {
        const { clientX, clientY } = event
        window.requestAnimationFrame(() => showSelectionToolbarAt(clientX, clientY))
      }}
      onMouseLeave={(event) => {
        if (!toolbar.current?.contains(event.relatedTarget as Node)) hideSelectionToolbar()
      }}
    >
      <div ref={mount} className="markdown-editor-mount" />
      {selectionToolbar && onSplitSelection && (
        <div
          ref={toolbar}
          className="markdown-selection-toolbar"
          style={{ left: selectionToolbar.left, top: selectionToolbar.top }}
          role="toolbar"
          aria-label="Acciones de selección"
        >
          <button
            type="button"
            title="Mover selección a una celda debajo"
            aria-label="Mover selección a una celda Markdown debajo"
            onMouseDown={(event) => event.preventDefault()}
            onClick={splitSelection}
          >
            <SplitSquareVertical size={15} />
          </button>
        </div>
      )}
    </div>
  )
}
