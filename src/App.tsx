import { useCallback, useEffect, useRef, useState } from 'react'
import { Braces, FilePlus2, FolderPlus, Moon, Pencil, Play, Plus, RotateCcw, Save, Sun, Trash2, Type } from 'lucide-react'
import { api } from './api'
import { Cell } from './components/Cell'
import { FileTree, type CreatingNode } from './components/FileTree'
import type { ExecutionResult, NotebookCell, NotebookDocument, TreeNode } from './types'

function uid() {
  return crypto.randomUUID()
}

function parentPath(path: string) {
  const index = path.lastIndexOf('/')
  return index === -1 ? '' : path.slice(0, index)
}

export default function App() {
  const [tree, setTree] = useState<TreeNode[]>([])
  const [activePath, setActivePath] = useState<string | null>(null)
  const [selected, setSelected] = useState<TreeNode | null>(null)
  const [document, setDocument] = useState<NotebookDocument | null>(null)
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState(248)
  const [outputs, setOutputs] = useState<Record<string, ExecutionResult>>({})
  const [running, setRunning] = useState<Set<string>>(new Set())
  const [notice, setNotice] = useState<string | null>(null)
  const [creating, setCreating] = useState<CreatingNode | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const stored = localStorage.getItem('octave-theme')
    return stored === 'light' || stored === 'dark' ? stored : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  })
  const runtimeId = useRef<string | null>(null)
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
      if (path) void openDocument({ name: path.split('/').at(-1)!, path, type: 'file' })
    })
  }, [refreshTree])
  useEffect(() => {
    globalThis.document.documentElement.dataset.theme = theme
    localStorage.setItem('octave-theme', theme)
  }, [theme])
  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), 4200)
    return () => clearTimeout(timer)
  }, [notice])

  const saveCurrent = useCallback(async () => {
    const currentDocument = documentRef.current
    const currentPath = activePathRef.current
    if (!currentDocument || !currentPath || !dirtyRef.current) return
    setSaving(true)
    try {
      await api.save(currentPath, currentDocument)
      if (activePathRef.current === currentPath && documentRef.current === currentDocument) setDirty(false)
    } catch (error) {
      setNotice((error as Error).message)
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

  useEffect(() => () => {
    if (runtimeId.current) void api.runtime.close(runtimeId.current)
  }, [])

  async function openDocument(node: TreeNode) {
    if (node.type !== 'file' || !node.path.endsWith('.octnb') || node.path === activePathRef.current) return
    await saveCurrent()
    const previousRuntime = runtimeId.current
    runtimeId.current = null
    if (previousRuntime) await api.runtime.close(previousRuntime).catch(() => undefined)
    try {
      const { document: next } = await api.read(node.path)
      const runtime = await api.runtime.open(next.id)
      runtimeId.current = runtime.runtimeId
      setActivePath(node.path)
      setSelected(node)
      setDocument(next)
      setOutputs(next.outputs || {})
      setDirty(false)
      localStorage.setItem('octave-active-path', node.path)
    } catch (error) {
      setNotice((error as Error).message)
    }
  }

  function selectedDirectory() {
    if (!selected) return ''
    return selected.type === 'directory' ? selected.path : parentPath(selected.path)
  }

  function beginCreate(type: CreatingNode['type']) {
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
      if (type === 'file') await openDocument({ name: result.path.split('/').at(-1)!, path: result.path, type: 'file' })
    } catch (error) {
      setNotice((error as Error).message)
      throw error
    }
  }

  async function renameSelected() {
    if (!selected) return
    const currentName = selected.name.replace(/\.octnb$/, '')
    const name = window.prompt('Nuevo nombre', currentName)?.trim()
    if (!name || name === currentName) return
    const base = parentPath(selected.path)
    try {
      const result = await api.rename(selected.path, base ? `${base}/${name}` : name)
      if (activePath === selected.path) {
        setActivePath(result.path)
        localStorage.setItem('octave-active-path', result.path)
      }
      setSelected({ ...selected, path: result.path, name: result.path.split('/').at(-1)! })
      await refreshTree()
    } catch (error) { setNotice((error as Error).message) }
  }

  async function deleteSelected() {
    if (!selected || !window.confirm(`Eliminar ${selected.name}?`)) return
    try {
      await api.remove(selected.path)
      if (activePath === selected.path || activePath?.startsWith(`${selected.path}/`)) {
        dirtyRef.current = false
        setDirty(false)
        if (runtimeId.current) await api.runtime.close(runtimeId.current).catch(() => undefined)
        runtimeId.current = null
        setActivePath(null)
        setDocument(null)
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

  function removeCell(id: string) {
    mutateDocument((current) => {
      const nextOutputs = { ...(current.outputs || {}) }
      delete nextOutputs[id]
      return { ...current, cells: current.cells.filter((cell) => cell.id !== id), outputs: nextOutputs }
    })
    setOutputs((current) => { const next = { ...current }; delete next[id]; return next })
  }

  async function ensureRuntime() {
    if (runtimeId.current) return runtimeId.current
    if (!documentRef.current) throw new Error('No hay documento activo')
    const runtime = await api.runtime.open(documentRef.current.id)
    runtimeId.current = runtime.runtimeId
    return runtime.runtimeId
  }

  async function runCell(cell: NotebookCell) {
    setRunning((current) => new Set(current).add(cell.id))
    try {
      const id = await ensureRuntime()
      const result = await api.runtime.execute(id, cell.id, cell.source)
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
    const previousRuntime = runtimeId.current
    runtimeId.current = null
    if (previousRuntime) await api.runtime.close(previousRuntime).catch(() => undefined)
    setOutputs({})
    mutateDocument((current) => ({ ...current, outputs: {} }))
    try {
      const runtime = await api.runtime.open(document.id)
      runtimeId.current = runtime.runtimeId
    } catch (error) { setNotice((error as Error).message) }
  }

  async function inspect(expression: string) {
    const id = await ensureRuntime()
    const result = await api.runtime.inspect(id, expression)
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
          onSelect={setSelected}
          onOpen={openDocument}
          onCreate={createEntry}
          onCancelCreate={() => setCreating(null)}
        />
        <footer className="sidebar-footer">
          <button onClick={renameSelected} disabled={!selected} title="Renombrar" aria-label="Renombrar"><Pencil size={14} /></button>
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
                <button onClick={runAll} title="Ejecutar todo" aria-label="Ejecutar todo"><Play size={15} /></button>
              </div>
            </header>
            <div className="notebook">
              {document.cells.map((cell, index) => (
                <Cell
                  key={cell.id}
                  cell={cell}
                  index={index}
                  output={outputs[cell.id]}
                  running={running.has(cell.id)}
                  onChange={(source) => updateCell(cell.id, { source })}
                  onRun={() => runCell(cell)}
                  onDelete={() => removeCell(cell.id)}
                  onKindChange={(kind) => updateCell(cell.id, { kind })}
                  onInspect={inspect}
                />
              ))}
              <div className="add-cell">
                <button onClick={() => addCell('code')}><Plus size={14} /><Braces size={14} /><span>Código</span></button>
                <button onClick={() => addCell('markdown')}><Plus size={14} /><Type size={14} /><span>Markdown</span></button>
              </div>
            </div>
          </>
        ) : <div className="empty-workspace"><span className="brand-mark">∿</span></div>}
      </section>
      {notice && <div className="notice" role="status">{notice}</div>}
    </main>
  )
}
