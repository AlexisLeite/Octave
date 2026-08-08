import { useCallback, useEffect, useRef, useState } from 'react'
import { Braces, CircleHelp, FilePlus2, FolderPlus, Moon, Pencil, Play, Plus, RotateCcw, Save, Sun, Trash2, Type } from 'lucide-react'
import { api } from './api'
import { Cell } from './components/Cell'
import { FileTree, type CreatingNode } from './components/FileTree'
import { HelpModal } from './components/HelpModal'
import { PdfViewer } from './components/PdfViewer'
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

export default function App() {
  const [tree, setTree] = useState<TreeNode[]>([])
  const [activePath, setActivePath] = useState<string | null>(null)
  const [selected, setSelected] = useState<TreeNode | null>(null)
  const [document, setDocument] = useState<NotebookDocument | null>(null)
  const [pdfPath, setPdfPath] = useState<string | null>(null)
  const [openedPdfs, setOpenedPdfs] = useState<string[]>([])
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
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
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const stored = localStorage.getItem('octave-theme')
    return stored === 'light' || stored === 'dark' ? stored : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  const runtimeId = useRef<string | null>(null)
  const draggedCellRef = useRef<string | null>(null)
  const runtimeOpening = useRef<Promise<string> | null>(null)
  const runtimeGeneration = useRef(0)
  const documentRef = useRef(document)
  const activePathRef = useRef(activePath)
  const dirtyRef = useRef(dirty)
  const restorationStarted = useRef(false)
  const restoredPath = useRef(localStorage.getItem('octave-active-path'))
  documentRef.current = document
  activePathRef.current = activePath
  dirtyRef.current = dirty

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

  const saveCurrent = useCallback(async () => {
    const currentDocument = documentRef.current
    const currentPath = activePathRef.current
    if (!currentDocument || !currentPath || !dirtyRef.current) return true
    setSaving(true)
    try {
      await api.save(currentPath, currentDocument)
      if (activePathRef.current === currentPath && documentRef.current === currentDocument) setDirty(false)
      return true
    } catch (error) {
      setNotice((error as Error).message)
      return false
    } finally {
      setSaving(false)
    }
  }, [])

  useEffect(() => {
    function handleSave(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        void saveCurrent()
      }
    }
    window.addEventListener('keydown', handleSave)
    return () => window.removeEventListener('keydown', handleSave)
  }, [saveCurrent])

  useEffect(() => {
    if (!dirty || !document || !activePath) return
    const timer = setTimeout(saveCurrent, 700)
    return () => clearTimeout(timer)
  }, [dirty, document, activePath, saveCurrent])

  useEffect(() => {
    if (!activePath || !document) return
    const path = activePath
    let disposed = false

    const reloadExternalChanges = async () => {
      if (disposed || dirtyRef.current || activePathRef.current !== path) return
      try {
        const { document: next } = await api.read(path)
        if (disposed || dirtyRef.current || activePathRef.current !== path) return
        const current = documentRef.current
        if (current && JSON.stringify(current) === JSON.stringify(next)) return
        documentRef.current = next
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
    if (!(await saveCurrent())) return
    const generation = ++runtimeGeneration.current
    const previousRuntime = runtimeId.current
    runtimeId.current = null
    runtimeOpening.current = null
    if (previousRuntime) void api.runtime.close(previousRuntime).catch(() => undefined)
    try {
      const { document: next } = await api.read(node.path)
      setActivePath(node.path)
      setSelected(node)
      setDocument(next)
      setPdfPath(null)
      setOutputs(next.outputs || {})
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
    if (!(await saveCurrent())) return
    runtimeGeneration.current += 1
    const previousRuntime = runtimeId.current
    runtimeId.current = null
    runtimeOpening.current = null
    if (previousRuntime) void api.runtime.close(previousRuntime).catch(() => undefined)
    setDocument(null)
    setOutputs({})
    setDirty(false)
    setPdfPath(node.path)
    setOpenedPdfs((current) => current.includes(node.path) ? current : [...current, node.path])
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
        setActivePath(nextActivePath)
        localStorage.setItem('octave-active-path', nextActivePath)
        if (pdfPath) setPdfPath(nextActivePath)
        if (activePath === node.path) {
          mutateDocument((current) => ({ ...current, title: name.replace(/\.octnb$/, '') }))
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
        setActivePath(result.path)
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
        setDocument(null)
        setPdfPath(null)
        setOutputs({})
        localStorage.removeItem('octave-active-path')
      }
      setSelected(null)
      await refreshTree()
    } catch (error) { setNotice((error as Error).message) }
  }

  function mutateDocument(mutate: (current: NotebookDocument) => NotebookDocument) {
    setDocument((current) => current ? mutate(current) : current)
    setDirty(true)
  }

  function updateCell(id: string, changes: Partial<NotebookCell>) {
    mutateDocument((current) => ({ ...current, cells: current.cells.map((cell) => cell.id === id ? { ...cell, ...changes } : cell) }))
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
      }))
    } catch (error) { setNotice((error as Error).message) }
    finally { setRunning((current) => { const next = new Set(current); next.delete(cell.id); return next }) }
  }

  async function runAll() {
    if (!document) return
    for (const cell of document.cells) if (cell.kind === 'code') await runCell(cell)
  }

  async function resetNotebookState() {
    if (!document) return
    const generation = ++runtimeGeneration.current
    const previousRuntime = runtimeId.current
    runtimeId.current = null
    runtimeOpening.current = null
    if (previousRuntime) void api.runtime.close(previousRuntime).catch(() => undefined)
    setOutputs({})
    mutateDocument((current) => ({ ...current, outputs: {} }))
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
                <span>{document.title}</span>
                <i className={dirty ? 'dirty' : ''} title={saving ? 'Guardando' : dirty ? 'Cambios pendientes' : 'Guardado'} />
              </div>
              <div className="toolbar">
                <button onClick={saveCurrent} disabled={!dirty || saving} title="Guardar · Ctrl+S" aria-label="Guardar"><Save size={15} /></button>
                <button onClick={resetNotebookState} title="Reiniciar estado" aria-label="Reiniciar estado"><RotateCcw size={15} /></button>
                <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="Cambiar tema" aria-label="Cambiar tema">
                  {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                </button>
                <button onClick={() => setHelpOpen(true)} title="Ayuda" aria-label="Ayuda"><CircleHelp size={15} /></button>
                <button onClick={runAll} title="Ejecutar todo" aria-label="Ejecutar todo"><Play size={15} /></button>
              </div>
            </header>
            <div className={`notebook ${draggedCell ? 'cell-drag-active' : ''}`}>
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
                  onDelete={() => removeCell(cell.id)}
                  onKindChange={(kind) => updateCell(cell.id, { kind })}
                  onInspect={inspect}
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
