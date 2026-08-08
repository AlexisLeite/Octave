import { SplitSquareVertical } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import 'katex/dist/katex.min.css'
import { baseKeymap, setBlockType, toggleMark, wrapIn } from 'prosemirror-commands'
import { history, redo, undo } from 'prosemirror-history'
import { keymap } from 'prosemirror-keymap'
import { DOMParser as ProseMirrorDOMParser } from 'prosemirror-model'
import { EditorState, Plugin, Selection as ProseMirrorSelection } from 'prosemirror-state'
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
  viewStateKey?: string
}

interface SelectionToolbarPosition {
  left: number
  top: number
}

interface DocumentRange {
  from: number
  to: number
}

function rangeVisuallyTouches(range: Range, element: HTMLElement) {
  try { if (range.intersectsNode(element)) return true } catch { /* detached during HMR */ }
  const target = element.getBoundingClientRect()
  return Array.from(range.getClientRects()).some((rect) => (
    rect.width > 0
    && rect.height > 0
    && rect.bottom >= target.top - 1
    && rect.top <= target.bottom + 1
    && rect.right >= target.left - 1
    && rect.left <= target.right + 1
  ))
}

function selectedDocumentRange(editor: EditorView, editorMount: HTMLElement): DocumentRange | null {
  const browserSelection = window.getSelection()
  const anchor = browserSelection?.anchorNode
  const focus = browserSelection?.focusNode
  if (!browserSelection || !anchor || !focus || !editorMount.contains(anchor) || !editorMount.contains(focus)) return null
  if (browserSelection.isCollapsed) {
    const current = editor.state.selection
    return current.empty ? null : { from: current.from, to: current.to }
  }

  let { from, to } = editor.state.selection
  try {
    const anchorPosition = editor.posAtDOM(anchor, browserSelection.anchorOffset, -1)
    const focusPosition = editor.posAtDOM(focus, browserSelection.focusOffset, 1)
    from = Math.min(anchorPosition, focusPosition)
    to = Math.max(anchorPosition, focusPosition)
  } catch {
    // Atomic node views can leave a DOM endpoint that ProseMirror cannot map;
    // the state selection and intersection pass below remain authoritative.
  }

  const nativeRange = browserSelection.rangeCount ? browserSelection.getRangeAt(0) : null
  if (nativeRange) {
    editorMount.querySelectorAll<HTMLElement>('[data-math]').forEach((math) => {
      try {
        if (!rangeVisuallyTouches(nativeRange, math)) return
        const mapped = editor.posAtDOM(math, 0, -1)
        const resolved = editor.state.doc.resolve(Math.max(0, Math.min(mapped, editor.state.doc.content.size)))
        const nodeAfter = resolved.nodeAfter
        const nodeBefore = resolved.nodeBefore
        if (nodeAfter?.type.name.startsWith('math_')) {
          from = Math.min(from, mapped)
          to = Math.max(to, mapped + nodeAfter.nodeSize)
        } else if (nodeBefore?.type.name.startsWith('math_')) {
          from = Math.min(from, mapped - nodeBefore.nodeSize)
          to = Math.max(to, mapped)
        }
      } catch {
        // A detached node during HMR is ignored; the next gesture remaps it.
      }
    })
  }

  from = Math.max(0, Math.min(from, editor.state.doc.content.size))
  to = Math.max(from, Math.min(to, editor.state.doc.content.size))
  return to > from ? { from, to } : null
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

export function MarkdownEditor({ value, onChange, onSplitSelection, viewStateKey }: MarkdownEditorProps) {
  // The component file intentionally exports only React components so Vite can
  // preserve the ProseMirror instance during Fast Refresh.
  const host = useRef<HTMLDivElement>(null)
  const mount = useRef<HTMLDivElement>(null)
  const toolbar = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const viewStateKeyRef = useRef(viewStateKey)
  const onSplitSelectionRef = useRef(onSplitSelection)
  const [selectionToolbar, setSelectionToolbar] = useState<SelectionToolbarPosition | null>(null)
  onChangeRef.current = onChange
  viewStateKeyRef.current = viewStateKey
  onSplitSelectionRef.current = onSplitSelection

  function hideSelectionToolbar() {
    setSelectionToolbar(null)
  }

  function showSelectionToolbarAt(clientX: number, clientY: number) {
    const editor = view.current
    const editorMount = mount.current
    const editorHost = host.current
    if (!editor || !editorMount || !editorHost) {
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
    const selectedRects = range ? Array.from(range.getClientRects()) : []
    if (range) {
      editorMount.querySelectorAll<HTMLElement>('[data-math]').forEach((math) => {
        if (rangeVisuallyTouches(range, math)) selectedRects.push(math.getBoundingClientRect())
      })
    }
    const hoveredRect = selectedRects.find((rect) => (
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
      left: Math.min(hostRect.width - 20, Math.max(20, hoveredRect.right - hostRect.left)),
      top,
    })
  }

  function splitSelection() {
    const editor = view.current
    const callback = onSplitSelectionRef.current
    const editorMount = mount.current
    const selectedRange = editor && editorMount ? selectedDocumentRange(editor, editorMount) : null
    if (!editor || !callback || !selectedRange) {
      hideSelectionToolbar()
      return
    }

    const { from, to } = selectedRange
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
      .delete(from, to)
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
    const initialDocument = markdownParser.parse(value || '')
    let initialSelection: ProseMirrorSelection | undefined
    if (viewStateKeyRef.current) {
      const storageKey = `octave-markdown-view-v1:${viewStateKeyRef.current}`
      try {
        const saved = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as { selection?: unknown } | null
        if (saved?.selection) initialSelection = ProseMirrorSelection.fromJSON(
          initialDocument,
          saved.selection as Parameters<typeof ProseMirrorSelection.fromJSON>[1],
        )
      } catch {
        localStorage.removeItem(storageKey)
      }
    }
    const editor = new EditorView(mount.current, {
      state: EditorState.create({
        doc: initialDocument,
        ...(initialSelection ? { selection: initialSelection } : {}),
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
        if (viewStateKeyRef.current) {
          localStorage.setItem(`octave-markdown-view-v1:${viewStateKeyRef.current}`, JSON.stringify({
            selection: next.selection.toJSON(),
          }))
        }
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
      const nextDocument = markdownParser.parse(value || '')
      let selection: ProseMirrorSelection
      try {
        selection = ProseMirrorSelection.fromJSON(nextDocument, editor.state.selection.toJSON())
      } catch {
        selection = ProseMirrorSelection.near(nextDocument.resolve(Math.min(nextDocument.content.size, editor.state.selection.head)))
      }
      editor.updateState(EditorState.create({
        doc: nextDocument,
        selection,
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
        if (selectionToolbar || toolbar.current?.contains(event.target as Node)) return
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
