import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Braces, CircleHelp, FilePlus2, FolderPlus, Moon, Pencil, Play, Plus, Printer, RotateCcw, Save, Sun, Trash2, Type } from 'lucide-react'
import { api } from './api'
import { Cell } from './components/Cell'
import { FileTree, type CreatingNode } from './components/FileTree'
import { HelpModal } from './components/HelpModal'
import { PdfViewer } from './components/PdfViewer'
import { breadcrumbForCell, extractNotebookHeadings } from './editor/notebookHeadings'
import { formatOctaveCode } from './editor/octaveFormat'
import {
  applyNotebookSnapshot,
  createNotebookHistory,
  recordNotebookEdit,
  redoNotebookEdit,
  undoNotebookEdit,
  type NotebookHistory,
} from './editor/notebookHistory'
import type { ExecutionResult, NotebookCell, NotebookDocument, TreeNode } from './types'

function uid() {
  return crypto.randomUUID()
}

function parentPath(path: string) {
  const index = path.lastIndexOf('/')
  return index === -1 ? '' : path.slice(0, index)
}

function isMissingRuntime(error: unknown) {
  return error instanceof Error && /Unknown Octave runtime/i.test(error.message)
}

type NotebookViewState = {
  scrollTop: number
  scrollLeft: number
  activeCellId?: string
}

const NOTEBOOK_VIEW_STORAGE = 'octave-notebook-views-v1'

function readNotebookViews(): Record<string, NotebookViewState> {
  try {
    const parsed = JSON.parse(localStorage.getItem(NOTEBOOK_VIEW_STORAGE) ?? '{}') as Record<string, Partial<NotebookViewState>>
    return Object.fromEntries(Object.entries(parsed).flatMap(([path, value]) => (
      Number.isFinite(value?.scrollTop) && Number.isFinite(value?.scrollLeft)
        ? [[path, {
            scrollTop: Math.max(0, Number(value.scrollTop)),
            scrollLeft: Math.max(0, Number(value.scrollLeft)),
            ...(typeof value.activeCellId === 'string' ? { activeCellId: value.activeCellId } : {}),
          }]]
        : []
    )))
  } catch {
    return {}
  }
}

function storeNotebookView(path: string, state: NotebookViewState) {
  try {
    const views = readNotebookViews()
    views[path] = state
    localStorage.setItem(NOTEBOOK_VIEW_STORAGE, JSON.stringify(views))
  } catch {
    // View persistence must never interfere with editing.
  }
}

export default function App() {
  const [tree, setTree] = useState<TreeNode[]>([])
  const [activePath, setActivePath] = useState<string | null>(null)
  const [activeAbsolutePath, setActiveAbsolutePath] = useState<string | null>(null)
  const [selected, setSelected] = useState<TreeNode | null>(null)
  const [document, setDocument] = useState<NotebookDocument | null>(null)
  const [pdfPath, setPdfPath] = useState<string | null>(null)
  const [openedPdfs, setOpenedPdfs] = useState<string[]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [printing, setPrinting] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const raw = localStorage.getItem('octave-sidebar-width')
    const stored = raw === null ? Number.NaN : Number(raw)
    return Number.isFinite(stored) ? Math.min(440, Math.max(176, stored)) : 248
  })
  const [outputs, setOutputs] = useState<Record<string, ExecutionResult>>({})
  const [running, setRunning] = useState<Set<string>>(new Set())
  const [draggedCell, setDraggedCell] = useState<string | null>(null)
  const [cellDrop, setCellDrop] = useState<{ id: string; edge: 'before' | 'after' } | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [creating, setCreating] = useState<CreatingNode | null>(null)
  const [renamingPath, setRenamingPath] = useState<string | null>(null)
  const [helpOpen, setHelpOpen] = useState(() => localStorage.getItem('octave-help-v1-open') === 'true')
  const [breadcrumbState, setBreadcrumbState] = useState<{ documentId: string | null; path: string[] }>({ documentId: null, path: [] })
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const stored = localStorage.getItem('octave-theme')
    return stored === 'light' || stored === 'dark' ? stored : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  const runtimeId = useRef<string | null>(null)
  const draggedCellRef = useRef<string | null>(null)
  const runtimeOpening = useRef<Promise<string> | null>(null)
  const runtimeGeneration = useRef(0)
  const documentRef = useRef(document)
  const historyRef = useRef<NotebookHistory | null>(null)
  const activePathRef = useRef(activePath)
  const dirtyRef = useRef(dirty)
  const notebookRef = useRef<HTMLDivElement>(null)
  const activeCellIdRef = useRef<string | null>(null)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const pendingSaveCountRef = useRef(0)
  const breadcrumbFrame = useRef<number | null>(null)
  const restorationStarted = useRef(false)
  const restoredPath = useRef(localStorage.getItem('octave-active-path'))
  documentRef.current = document
  activePathRef.current = activePath
  dirtyRef.current = dirty

  const notebookHeadings = useMemo(
    () => extractNotebookHeadings(document?.cells ?? []),
    [document?.cells],
  )

  const setBreadcrumbPath = useCallback((path: string[]) => {
    const documentId = documentRef.current?.id ?? null
    setBreadcrumbState((current) => {
      if (current.documentId === documentId
        && current.path.length === path.length
        && current.path.every((part, index) => part === path[index])) return current
      return { documentId, path }
    })
  }, [])

  const updateVisibleBreadcrumb = useCallback(() => {
    const scroller = notebookRef.current
    const currentDocument = documentRef.current
    if (!scroller || !currentDocument) return

    const activeCell = (globalThis.document.activeElement as HTMLElement | null)?.closest<HTMLElement>('.cell')
    if (activeCell?.dataset.cellId && scroller.contains(activeCell)) {
      setBreadcrumbPath(breadcrumbForCell(notebookHeadings, currentDocument.cells, activeCell.dataset.cellId))
      return
    }

    const scrollerRect = scroller.getBoundingClientRect()
    const anchorY = scrollerRect.top + Math.min(56, scrollerRect.height * 0.16)
    const cells = new Map(
      Array.from(scroller.querySelectorAll<HTMLElement>(':scope > .cell'))
        .map((element) => [element.dataset.cellId ?? '', element]),
    )

    let path: string[] = []
    for (const heading of notebookHeadings) {
      const cell = cells.get(heading.cellId)
      const rendered = cell?.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')[heading.indexInCell]
      if (rendered && rendered.getBoundingClientRect().top <= anchorY) path = heading.path
    }

    if (!path.length) {
      const visibleCell = Array.from(cells.values())
        .filter((cell) => cell.getBoundingClientRect().bottom > scrollerRect.top)
        .sort((left, right) => left.getBoundingClientRect().top - right.getBoundingClientRect().top)[0]
      if (visibleCell?.dataset.cellId) {
        const firstHeading = notebookHeadings.find((heading) => heading.cellId === visibleCell.dataset.cellId)
        path = firstHeading?.path
          ?? breadcrumbForCell(notebookHeadings, currentDocument.cells, visibleCell.dataset.cellId)
      }
    }

    setBreadcrumbPath(path)
  }, [notebookHeadings, setBreadcrumbPath])

  const scheduleVisibleBreadcrumb = useCallback(() => {
    if (breadcrumbFrame.current !== null) return
    breadcrumbFrame.current = window.requestAnimationFrame(() => {
      breadcrumbFrame.current = null
      updateVisibleBreadcrumb()
    })
  }, [updateVisibleBreadcrumb])

  const persistNotebookView = useCallback((scroller = notebookRef.current) => {
    const documentId = scroller?.dataset.documentId
    if (!documentId || !scroller) return
    storeNotebookView(documentId, {
      scrollTop: scroller.scrollTop,
      scrollLeft: scroller.scrollLeft,
      ...(activeCellIdRef.current ? { activeCellId: activeCellIdRef.current } : {}),
    })
  }, [])

  useEffect(() => {
    setBreadcrumbState({ documentId: document?.id ?? null, path: [] })
  }, [document?.id])

  useEffect(() => {
    activeCellIdRef.current = null
    if (!document) return
    const scroller = notebookRef.current
    const view = readNotebookViews()[document.id]
    if (!scroller || !view) return
    let cancelled = false

    const restore = () => {
      if (cancelled || notebookRef.current !== scroller) return
      scroller.scrollTo({ top: view.scrollTop, left: view.scrollLeft, behavior: 'instant' })
      activeCellIdRef.current = view.activeCellId && document.cells.some((cell) => cell.id === view.activeCellId)
        ? view.activeCellId
        : null
    }

    const frame = window.requestAnimationFrame(() => window.requestAnimationFrame(restore))
    const settleTimer = window.setTimeout(restore, 120)
    return () => {
      cancelled = true
      window.cancelAnimationFrame(frame)
      window.clearTimeout(settleTimer)
    }
  }, [document?.id])

  useEffect(() => {
    const persist = () => persistNotebookView()
    window.addEventListener('pagehide', persist)
    return () => window.removeEventListener('pagehide', persist)
  }, [persistNotebookView])

  useEffect(() => {
    scheduleVisibleBreadcrumb()
    return () => {
      if (breadcrumbFrame.current !== null) window.cancelAnimationFrame(breadcrumbFrame.current)
      breadcrumbFrame.current = null
    }
  }, [notebookHeadings, scheduleVisibleBreadcrumb])

  const refreshTree = useCallback(async () => {
    try {
      const nodes = (await api.tree()).nodes
      setTree(nodes)
      return nodes
    } catch (error) {
      setNotice((error as Error).message)
      return []
    }
  }, [])

  useEffect(() => {
    if (restorationStarted.current) return
    restorationStarted.current = true
    void refreshTree().then(() => {
      const path = restoredPath.current
      if (path) void openFile({ name: path.split('/').at(-1)!, path, type: 'file' })
    })
  }, [refreshTree])
  useEffect(() => {
    const timer = window.setInterval(() => { void refreshTree() }, 2500)
    return () => window.clearInterval(timer)
  }, [refreshTree])
  useEffect(() => {
    globalThis.document.documentElement.dataset.theme = theme
    localStorage.setItem('octave-theme', theme)
  }, [theme])
  useEffect(() => {
    localStorage.setItem('octave-sidebar-width', String(sidebarWidth))
  }, [sidebarWidth])
  useEffect(() => {
    localStorage.setItem('octave-help-v1-open', String(helpOpen))
  }, [helpOpen])
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 4200)
    return () => clearTimeout(timer)
  }, [notice])

  const saveCurrent = useCallback(async (formatActiveCell = false) => {
    let currentDocument = documentRef.current
    const currentPath = activePathRef.current
    if (!currentDocument || !currentPath) return true

    if (formatActiveCell && activeCellIdRef.current) {
      const cellId = activeCellIdRef.current
      const cell = currentDocument.cells.find((candidate) => candidate.id === cellId)
      if (cell?.kind === 'code') {
        const source = formatOctaveCode(cell.source)
        if (source !== cell.source) {
          currentDocument = {
            ...currentDocument,
            cells: currentDocument.cells.map((candidate) => candidate.id === cellId ? { ...candidate, source } : candidate),
          }
          documentRef.current = currentDocument
          setDocument(currentDocument)
          setDirty(true)
          dirtyRef.current = true
        }
      }
    }

    if (!dirtyRef.current) return true
    const documentToSave = currentDocument
    pendingSaveCountRef.current += 1
    setSaving(true)
    const save = saveQueueRef.current.then(async () => {
      try {
        await api.save(currentPath, documentToSave)
        if (activePathRef.current === currentPath && documentRef.current === documentToSave) {
          dirtyRef.current = false
          setDirty(false)
        }
        return true
      } catch (error) {
        setNotice((error as Error).message)
        return false
      } finally {
        pendingSaveCountRef.current -= 1
        if (pendingSaveCountRef.current === 0) setSaving(false)
      }
    })
    saveQueueRef.current = save.then(() => undefined)
    return save
  }, [])

  useEffect(() => {
    function handleSave(event: KeyboardEvent) {
      if (event.defaultPrevented) return
      if (event.key === 'F1') {
        event.preventDefault()
        setHelpOpen(true)
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key === 'Enter') {
        event.preventDefault()
        void runAll()
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        if (activeCellIdRef.current) formatCell(activeCellIdRef.current)
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void saveCurrent(true)
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        const target = event.target
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable)) return
        event.preventDefault()
        if (event.shiftKey) redoNotebookChange(); else undoNotebookChange()
        return
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
        const target = event.target
        if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable)) return
        event.preventDefault()
        redoNotebookChange()
      }
    }
    window.addEventListener('keydown', handleSave)
    return () => window.removeEventListener('keydown', handleSave)
  }, [saveCurrent])

  useEffect(() => {
    if (!dirty || !document || !activePath) return
    // Autosave is intentionally persistence-only. Formatting is explicit via
    // Ctrl+S, Ctrl+Shift+F or the cell action.
    const timer = window.setTimeout(() => { void saveCurrent(false) }, 700)
    return () => clearTimeout(timer)
  }, [dirty, document, activePath, saveCurrent])

  useEffect(() => {
    if (!activePath || !document) return
    const path = activePath
    let disposed = false

    const reloadExternalChanges = async () => {
      if (disposed || dirtyRef.current || activePathRef.current !== path) return
      try {
        const { document: next, absolutePath } = await api.read(path)
        if (disposed || dirtyRef.current || activePathRef.current !== path) return
        const current = documentRef.current
        if (current && JSON.stringify(current) === JSON.stringify(next)) return
        documentRef.current = next
        historyRef.current = createNotebookHistory(next)
        setActiveAbsolutePath(absolutePath)
        setDocument(next)
        setOutputs(next.outputs || {})
      } catch {
        // The tree refresh reports files that were moved or deleted externally.
      }
    }

    const timer = window.setInterval(() => { void reloadExternalChanges() }, 1500)
    const handleFocus = () => { void reloadExternalChanges() }
    window.addEventListener('focus', handleFocus)
    void reloadExternalChanges()
    return () => {
      disposed = true
      window.clearInterval(timer)
      window.removeEventListener('focus', handleFocus)
    }
  }, [activePath, Boolean(document)])

  useEffect(() => () => {
    runtimeGeneration.current += 1
    if (runtimeId.current) void api.runtime.close(runtimeId.current)
  }, [])

  function launchRuntime(documentId: string, generation = runtimeGeneration.current) {
    const opening = api.runtime.open(documentId).then(async ({ runtimeId: nextRuntimeId }) => {
      if (generation !== runtimeGeneration.current) {
        await api.runtime.close(nextRuntimeId).catch(() => undefined)
        throw new Error('STALE_RUNTIME')
      }
      runtimeId.current = nextRuntimeId
      return nextRuntimeId
    }).finally(() => {
      if (runtimeOpening.current === opening) runtimeOpening.current = null
    })
    runtimeOpening.current = opening
    return opening
  }

  async function openDocument(node: TreeNode) {
    if (node.type !== 'file' || !node.path.toLowerCase().endsWith('.octnb') || node.path === activePathRef.current) return
    persistNotebookView()
    if (!(await saveCurrent())) return
    const generation = ++runtimeGeneration.current
    const previousRuntime = runtimeId.current
    runtimeId.current = null
    runtimeOpening.current = null
    if (previousRuntime) void api.runtime.close(previousRuntime).catch(() => undefined)
    try {
      const { document: next, absolutePath } = await api.read(node.path)
      activePathRef.current = node.path
      setActivePath(node.path)
      setActiveAbsolutePath(absolutePath)
      setSelected(node)
      documentRef.current = next
      historyRef.current = createNotebookHistory(next)
      setDocument(next)
      setPdfPath(null)
      setOutputs(next.outputs || {})
      dirtyRef.current = false
      setDirty(false)
      localStorage.setItem('octave-active-path', node.path)
      void launchRuntime(next.id, generation).catch((error) => {
        if (error instanceof Error && error.message === 'STALE_RUNTIME') return
        if (generation === runtimeGeneration.current) setNotice((error as Error).message)
      })
    } catch (error) {
      setNotice((error as Error).message)
    }
  }

  async function openPdf(node: TreeNode) {
    if (node.type !== 'file' || !node.path.toLowerCase().endsWith('.pdf') || node.path === activePathRef.current) return
    persistNotebookView()
    if (!(await saveCurrent())) return
    runtimeGeneration.current += 1
    const previousRuntime = runtimeId.current
    runtimeId.current = null
    runtimeOpening.current = null
    if (previousRuntime) void api.runtime.close(previousRuntime).catch(() => undefined)
    documentRef.current = null
    historyRef.current = null
    activeCellIdRef.current = null
    setDocument(null)
    setActiveAbsolutePath(null)
    setOutputs({})
    setDirty(false)
    setPdfPath(node.path)
    setOpenedPdfs((current) => current.includes(node.path) ? current : [...current, node.path])
    activePathRef.current = node.path
    setActivePath(node.path)
    setSelected(node)
    localStorage.setItem('octave-active-path', node.path)
  }

  async function openFile(node: TreeNode) {
    if (node.path.toLowerCase().endsWith('.pdf')) await openPdf(node)
    else await openDocument(node)
  }

  function selectedDirectory() {
    if (!selected) return ''
    return selected.type === 'directory' ? selected.path : parentPath(selected.path)
  }

  function beginCreate(type: CreatingNode['type']) {
    setRenamingPath(null)
    setCreating({ type, parentPath: selectedDirectory() })
  }

  async function createEntry(name: string) {
    if (!creating) return
    if (/[\\/]/.test(name)) {
      setNotice('El nombre no puede contener barras')
      throw new Error('Nombre inválido')
    }
    const { parentPath: base, type } = creating
    try {
      const result = await api.create(base ? `${base}/${name}` : name, type)
      setCreating(null)
      await refreshTree()
      if (type === 'file') await openFile({ name: result.path.split('/').at(-1)!, path: result.path, type: 'file' })
    } catch (error) {
      setNotice((error as Error).message)
      throw error
    }
  }

  async function renameNode(node: TreeNode, name: string) {
    if (/[\\/]/.test(name)) {
      setNotice('El nombre no puede contener barras')
      throw new Error('Nombre inválido')
    }
    const base = parentPath(node.path)
    try {
      if (!(await saveCurrent())) return
      const result = await api.rename(node.path, base ? `${base}/${name}` : name)
      setOpenedPdfs((current) => current.map((path) => path === node.path || path.startsWith(`${node.path}/`) ? `${result.path}${path.slice(node.path.length)}` : path))
      if (activePath === node.path || activePath?.startsWith(`${node.path}/`)) {
        const suffix = activePath.slice(node.path.length)
        const nextActivePath = `${result.path}${suffix}`
        activePathRef.current = nextActivePath
        setActivePath(nextActivePath)
        void api.read(nextActivePath).then(({ absolutePath }) => {
          if (activePathRef.current === nextActivePath) setActiveAbsolutePath(absolutePath)
        }).catch(() => undefined)
        localStorage.setItem('octave-active-path', nextActivePath)
        if (pdfPath) setPdfPath(nextActivePath)
        if (activePath === node.path) {
          mutateDocument((current) => ({ ...current, title: name.replace(/\.octnb$/, '') }), { record: false })
        }
      }
      setSelected({ ...node, path: result.path, name: result.path.split('/').at(-1)! })
      setRenamingPath(null)
      await refreshTree()
    } catch (error) {
      setNotice((error as Error).message)
      throw error
    }
  }

  async function moveNode(sourcePath: string, targetDirectory: string) {
    const currentParent = parentPath(sourcePath)
    if (currentParent === targetDirectory) return
    const fileName = sourcePath.split('/').at(-1)!
    const nextPath = targetDirectory ? `${targetDirectory}/${fileName}` : fileName
    try {
      if (activePath === sourcePath && !(await saveCurrent())) return
      const result = await api.rename(sourcePath, nextPath)
      setOpenedPdfs((current) => current.map((path) => path === sourcePath ? result.path : path))
      if (activePath === sourcePath) {
        activePathRef.current = result.path
        setActivePath(result.path)
        void api.read(result.path).then(({ absolutePath }) => {
          if (activePathRef.current === result.path) setActiveAbsolutePath(absolutePath)
        }).catch(() => undefined)
        localStorage.setItem('octave-active-path', result.path)
        if (pdfPath) setPdfPath(result.path)
      }
      if (selected?.path === sourcePath) setSelected({ ...selected, path: result.path })
      await refreshTree()
    } catch (error) { setNotice((error as Error).message) }
  }

  async function deleteSelected() {
    if (!selected || !window.confirm(`Eliminar ${selected.name}?`)) return
    try {
      await api.remove(selected.path)
      setOpenedPdfs((current) => current.filter((path) => path !== selected.path && !path.startsWith(`${selected.path}/`)))
      if (activePath === selected.path || activePath?.startsWith(`${selected.path}/`)) {
        dirtyRef.current = false
        setDirty(false)
        if (runtimeId.current) await api.runtime.close(runtimeId.current).catch(() => undefined)
        runtimeGeneration.current += 1
        runtimeId.current = null
        runtimeOpening.current = null
        setActivePath(null)
        setActiveAbsolutePath(null)
        documentRef.current = null
        historyRef.current = null
        setDocument(null)
        setPdfPath(null)
        setOutputs({})
        localStorage.removeItem('octave-active-path')
      }
      setSelected(null)
      await refreshTree()
    } catch (error) { setNotice((error as Error).message) }
  }

  function mutateDocument(
    mutate: (current: NotebookDocument) => NotebookDocument,
    options: { record?: boolean } = {},
  ) {
    const current = documentRef.current
    if (!current) return
    const next = mutate(current)
    if (next === current) return
    if (options.record !== false) {
      historyRef.current = recordNotebookEdit(
        historyRef.current ?? createNotebookHistory(current),
        current,
        next,
      )
    }
    documentRef.current = next
    setDocument(next)
    setDirty(true)
  }

  function restoreNotebookHistory(direction: 'undo' | 'redo') {
    const current = documentRef.current
    const history = historyRef.current
    if (!current || !history) return
    const nextHistory = direction === 'undo' ? undoNotebookEdit(history) : redoNotebookEdit(history)
    if (nextHistory === history) return
    const nextDocument = applyNotebookSnapshot(current, nextHistory.present, history.present)
    historyRef.current = nextHistory
    documentRef.current = nextDocument
    setDocument(nextDocument)
    setOutputs(nextDocument.outputs ?? {})
    setDirty(true)
  }

  function undoNotebookChange() { restoreNotebookHistory('undo') }
  function redoNotebookChange() { restoreNotebookHistory('redo') }

  function updateCell(id: string, changes: Partial<NotebookCell>) {
    const sourceOnly = Object.keys(changes).length === 1 && changes.source !== undefined
    mutateDocument(
      (current) => ({ ...current, cells: current.cells.map((cell) => cell.id === id ? { ...cell, ...changes } : cell) }),
      { record: !sourceOnly },
    )
  }

  function formatCell(id: string) {
    const current = documentRef.current
    const cell = current?.cells.find((candidate) => candidate.id === id)
    if (!cell || cell.kind !== 'code') return
    const source = formatOctaveCode(cell.source)
    if (source !== cell.source) updateCell(id, { source })
  }

  function addCell(kind: NotebookCell['kind']) {
    mutateDocument((current) => ({ ...current, cells: [...current.cells, { id: uid(), kind, source: '' }] }))
  }

  function addCellAfter(cellId: string, kind: NotebookCell['kind']) {
    mutateDocument((current) => {
      const cells = [...current.cells]
      const index = cells.findIndex((cell) => cell.id === cellId)
      cells.splice(index < 0 ? cells.length : index + 1, 0, { id: uid(), kind, source: '' })
      return { ...current, cells }
    })
  }

  function splitMarkdownCell(cellId: string, remaining: string, extracted: string) {
    mutateDocument((current) => {
      const cells = [...current.cells]
      const index = cells.findIndex((cell) => cell.id === cellId)
      if (index < 0) return current
      cells[index] = { ...cells[index], source: remaining }
      cells.splice(index + 1, 0, { id: uid(), kind: 'markdown', source: extracted })
      return { ...current, cells }
    })
  }

  function removeCell(id: string) {
    mutateDocument((current) => {
      const nextOutputs = { ...(current.outputs || {}) }
      delete nextOutputs[id]
      return { ...current, cells: current.cells.filter((cell) => cell.id !== id), outputs: nextOutputs }
    })
    setOutputs((current) => { const next = { ...current }; delete next[id]; return next })
  }

  function reorderCell(sourceId: string, targetId: string, edge: 'before' | 'after') {
    draggedCellRef.current = null
    setDraggedCell(null)
    setCellDrop(null)
    if (sourceId === targetId) return

    mutateDocument((current) => {
      const source = current.cells.find((cell) => cell.id === sourceId)
      if (!source) return current
      const cells = current.cells.filter((cell) => cell.id !== sourceId)
      const targetIndex = cells.findIndex((cell) => cell.id === targetId)
      if (targetIndex === -1) return current
      const insertionIndex = targetIndex + (edge === 'after' ? 1 : 0)
      cells.splice(insertionIndex, 0, source)
      if (cells.every((cell, index) => cell.id === current.cells[index]?.id)) return current
      return { ...current, cells }
    })
  }

  async function ensureRuntime() {
    if (runtimeId.current) return runtimeId.current
    if (runtimeOpening.current) return runtimeOpening.current
    if (!documentRef.current) throw new Error('No hay documento activo')
    return launchRuntime(documentRef.current.id)
  }

  async function recoverRuntime() {
    runtimeId.current = null
    runtimeOpening.current = null
    return ensureRuntime()
  }

  async function executeCell(cell: NotebookCell) {
    const id = await ensureRuntime()
    try {
      return await api.runtime.execute(id, cell.id, cell.source)
    } catch (error) {
      if (!isMissingRuntime(error)) throw error
      const recoveredId = await recoverRuntime()
      return api.runtime.execute(recoveredId, cell.id, cell.source)
    }
  }

  async function runCell(cell: NotebookCell) {
    setRunning((current) => new Set(current).add(cell.id))
    try {
      const execution = await executeCell(cell)
      const result: ExecutionResult = { ...execution, source: cell.source }
      setOutputs((current) => ({ ...current, [cell.id]: result }))
      mutateDocument((current) => ({
        ...current,
        outputs: { ...(current.outputs || {}), [cell.id]: result },
      }), { record: false })
    } catch (error) { setNotice((error as Error).message) }
    finally { setRunning((current) => { const next = new Set(current); next.delete(cell.id); return next }) }
  }

  async function copyCellContext(cell: NotebookCell, index: number, output?: ExecutionResult, isRunning = false) {
    if (!activeAbsolutePath) {
      setNotice('No se pudo resolver la ruta absoluta del cuaderno')
      return
    }
    const stale = Boolean(output?.source && output.source !== cell.source)
    const status = isRunning
      ? 'ejecutando'
      : !output
      ? 'sin ejecutar'
      : stale
        ? output.error ? 'error desactualizado' : 'resultado desactualizado'
        : output.error ? 'error' : 'ejecutada'
    const sections = [
      `Notebook: ${activeAbsolutePath}`,
      `Celda: ${index + 1}`,
      `ID: ${cell.id}`,
      `Estado: ${status}`,
      '',
      'Código actual:',
      '```octave',
      cell.source,
      '```',
    ]
    if (output) {
      if (output.stdout) sections.push('', 'Salida:', '```text', output.stdout.trimEnd(), '```')
      if (output.stderr) sections.push('', 'stderr:', '```text', output.stderr.trimEnd(), '```')
      if (output.error) {
        const location = output.error.line
          ? ` (línea ${output.error.line}${output.error.column ? `, columna ${output.error.column}` : ''})`
          : ''
        sections.push('', `Error${location}:`, '```text', output.error.message, '```')
      }
      if (!output.stdout && !output.stderr && !output.error) sections.push('', 'Resultado: sin salida')
    }
    try {
      await navigator.clipboard.writeText(sections.join('\n'))
      setNotice('Contexto de la celda copiado')
    } catch {
      setNotice('No se pudo copiar el contexto de la celda')
    }
  }

  async function runAll() {
    const current = documentRef.current
    if (!current) return
    for (const cell of current.cells) if (cell.kind === 'code') await runCell(cell)
  }

  async function printNotebook() {
    const path = activePathRef.current
    const currentDocument = documentRef.current
    if (!path || !currentDocument || printing) return
    if (!(await saveCurrent())) return
    setPrinting(true)
    try {
      const blob = await api.pdf(path)
      const url = URL.createObjectURL(blob)
      const anchor = globalThis.document.createElement('a')
      anchor.href = url
      anchor.download = `${currentDocument.title || 'notebook'}.pdf`
      globalThis.document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1_000)
      setNotice('PDF generado')
    } catch (error) {
      setNotice((error as Error).message)
    } finally {
      setPrinting(false)
    }
  }

  async function resetNotebookState() {
    if (!document) return
    const generation = ++runtimeGeneration.current
    const previousRuntime = runtimeId.current
    runtimeId.current = null
    runtimeOpening.current = null
    if (previousRuntime) void api.runtime.close(previousRuntime).catch(() => undefined)
    setOutputs({})
    const nextDocument = { ...document, outputs: {} }
    documentRef.current = nextDocument
    historyRef.current = createNotebookHistory(nextDocument)
    setDocument(nextDocument)
    setDirty(true)
    void launchRuntime(document.id, generation).catch((error) => {
      if (error instanceof Error && error.message === 'STALE_RUNTIME') return
      if (generation === runtimeGeneration.current) setNotice((error as Error).message)
    })
  }

  async function inspect(expression: string) {
    let id = await ensureRuntime()
    let result
    try {
      result = await api.runtime.inspect(id, expression)
    } catch (error) {
      if (!isMissingRuntime(error)) throw error
      id = await recoverRuntime()
      result = await api.runtime.inspect(id, expression)
    }
    return { display: result.display, type: result.type, shape: result.shape }
  }

  function startResize(event: React.PointerEvent) {
    event.preventDefault()
    const startX = event.clientX
    const startWidth = sidebarWidth
    function move(moveEvent: PointerEvent) { setSidebarWidth(Math.min(440, Math.max(176, startWidth + moveEvent.clientX - startX))) }
    function stop() { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop) }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  const breadcrumb = document && breadcrumbState.documentId === document.id && breadcrumbState.path.length
    ? breadcrumbState.path
    : document ? [document.title] : []

  return (
    <main className="app-shell">
      <aside className="sidebar" style={{ width: sidebarWidth }}>
        <header className="sidebar-header">
          <div className="brand"><span className="brand-mark">∿</span><span>Octave</span></div>
          <div className="toolbar">
            <button onClick={() => beginCreate('file')} title="Nuevo documento" aria-label="Nuevo documento"><FilePlus2 size={15} /></button>
            <button onClick={() => beginCreate('directory')} title="Nueva carpeta" aria-label="Nueva carpeta"><FolderPlus size={15} /></button>
          </div>
        </header>
        <FileTree
          nodes={tree}
          activePath={activePath}
          selectedPath={selected?.path || null}
          creating={creating}
          renamingPath={renamingPath}
          onSelect={(node) => { setSelected(node); setRenamingPath(null) }}
          onOpen={openFile}
          onCreate={createEntry}
          onCancelCreate={() => setCreating(null)}
          onBeginRename={(path) => { setCreating(null); setRenamingPath(path) }}
          onRename={renameNode}
          onCancelRename={() => setRenamingPath(null)}
          onMove={moveNode}
        />
        <footer className="sidebar-footer">
          <button onClick={() => { setCreating(null); if (selected) setRenamingPath(selected.path) }} disabled={!selected} title="Renombrar" aria-label="Renombrar"><Pencil size={14} /></button>
          <button onClick={deleteSelected} disabled={!selected} title="Eliminar" aria-label="Eliminar"><Trash2 size={14} /></button>
          <span />
        </footer>
      </aside>
      <div className="splitter" onPointerDown={startResize} />
      <section className="workspace">
        {document ? (
          <>
            <header className="workspace-header">
              <div className="document-title">
                <nav className="document-breadcrumb" aria-label="Ubicación en el documento" title={breadcrumb.join(' / ')}>
                  <ol>
                    {breadcrumb.map((part, index) => (
                      <li key={`${index}-${part}`} aria-current={index === breadcrumb.length - 1 ? 'location' : undefined}>{part}</li>
                    ))}
                  </ol>
                </nav>
                <i
                  className={dirty ? 'dirty' : ''}
                  role="status"
                  aria-label={saving ? 'Guardando' : dirty ? 'Cambios pendientes' : 'Guardado'}
                  title={saving ? 'Guardando' : dirty ? 'Cambios pendientes' : 'Guardado'}
                />
              </div>
              <div className="toolbar">
                <button onClick={() => void saveCurrent(true)} title="Guardar y formatear celda · Ctrl+S" aria-label="Guardar"><Save size={15} /></button>
                <button onClick={printNotebook} disabled={printing} title="Exportar PDF" aria-label="Exportar PDF"><Printer size={15} /></button>
                <button onClick={resetNotebookState} title="Reiniciar estado" aria-label="Reiniciar estado"><RotateCcw size={15} /></button>
                <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="Cambiar tema" aria-label="Cambiar tema">
                  {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                </button>
                <button onClick={() => setHelpOpen(true)} title="Ayuda · F1" aria-label="Ayuda"><CircleHelp size={15} /></button>
                <button onClick={runAll} title="Ejecutar todo · Ctrl+Shift+Enter" aria-label="Ejecutar todo"><Play size={15} /></button>
              </div>
            </header>
            <div
              ref={notebookRef}
              data-document-id={document.id}
              className={`notebook ${draggedCell ? 'cell-drag-active' : ''}`}
              onScroll={(event) => {
                persistNotebookView(event.currentTarget)
                scheduleVisibleBreadcrumb()
              }}
              onPointerDownCapture={(event) => {
                if (event.pointerType !== 'mouse' || event.button !== 0) return
                activeCellIdRef.current = (event.target as HTMLElement).closest<HTMLElement>('.cell')?.dataset.cellId ?? activeCellIdRef.current
                persistNotebookView(event.currentTarget)
              }}
              onFocusCapture={(event) => {
                const cell = (event.target as HTMLElement).closest<HTMLElement>('.cell')
                if (cell?.dataset.cellId) {
                  activeCellIdRef.current = cell.dataset.cellId
                  persistNotebookView(event.currentTarget)
                  setBreadcrumbPath(breadcrumbForCell(notebookHeadings, document.cells, cell.dataset.cellId))
                }
              }}
              onBlurCapture={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) scheduleVisibleBreadcrumb()
              }}
            >
              {[...document.cells].sort((a, b) => a.id.localeCompare(b.id)).map((cell) => {
                const index = document.cells.findIndex((candidate) => candidate.id === cell.id)
                return (
                <Cell
                  key={cell.id}
                  cell={cell}
                  index={index}
                  order={index}
                  output={outputs[cell.id]}
                  running={running.has(cell.id)}
                  onChange={(source) => updateCell(cell.id, { source })}
                  onRun={() => runCell(cell)}
                  onFormat={() => formatCell(cell.id)}
                  onDelete={() => removeCell(cell.id)}
                  onCopyContext={() => void copyCellContext(cell, index, outputs[cell.id], running.has(cell.id))}
                  onKindChange={(kind) => updateCell(cell.id, { kind })}
                  onInspect={inspect}
                  completionSources={document.cells
                    .slice(0, index)
                    .filter((candidate) => candidate.kind === 'code')
                    .map((candidate) => candidate.source)}
                  viewStateKey={`${document.id}:${cell.id}`}
                  dragging={draggedCell === cell.id}
                  dropEdge={cellDrop?.id === cell.id ? cellDrop.edge : null}
                  onDragStart={() => { draggedCellRef.current = cell.id; setDraggedCell(cell.id); setCellDrop(null) }}
                  onDragEnd={() => { draggedCellRef.current = null; setDraggedCell(null); setCellDrop(null) }}
                  onDragOver={(edge) => {
                    if (!draggedCell || draggedCell === cell.id) return
                    setCellDrop((current) => current?.id === cell.id && current.edge === edge ? current : { id: cell.id, edge })
                  }}
                  onDrop={(edge) => {
                    const sourceId = draggedCellRef.current
                    if (sourceId) reorderCell(sourceId, cell.id, edge)
                  }}
                  onDragLeave={() => { if (cellDrop?.id === cell.id) setCellDrop(null) }}
                  showInsertAfter={index < document.cells.length - 1}
                  onAddAfter={(kind) => addCellAfter(cell.id, kind)}
                  onSplitMarkdownSelection={(remaining, extracted) => splitMarkdownCell(cell.id, remaining, extracted)}
                />
                )
              })}
              <div className="add-cell" style={{ order: document.cells.length }}>
                <button onClick={() => addCell('code')}><Plus size={14} /><Braces size={14} /><span>Código</span></button>
                <button onClick={() => addCell('markdown')}><Plus size={14} /><Type size={14} /><span>Markdown</span></button>
              </div>
            </div>
          </>
        ) : pdfPath ? null : <div className="empty-workspace"><span className="brand-mark">∿</span></div>}
        {openedPdfs.map((path) => <PdfViewer key={path} path={path} active={pdfPath === path} />)}
      </section>
      {notice && <div className="notice" role="status">{notice}</div>}
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
    </main>
  )
}
