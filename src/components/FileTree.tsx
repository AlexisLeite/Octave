import { ChevronDown, ChevronRight, FileCode2, FileText, Folder, FolderOpen } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { TreeNode } from '../types'

export interface CreatingNode {
  type: 'file' | 'directory'
  parentPath: string
}

interface FileTreeProps {
  nodes: TreeNode[]
  activePath: string | null
  selectedPath: string | null
  creating: CreatingNode | null
  renamingPath: string | null
  onSelect: (node: TreeNode) => void
  onOpen: (node: TreeNode) => void
  onCreate: (name: string) => Promise<void>
  onCancelCreate: () => void
  onBeginRename: (path: string) => void
  onRename: (node: TreeNode, name: string) => Promise<void>
  onCancelRename: () => void
  onMove: (sourcePath: string, targetDirectory: string) => Promise<void>
}

interface DraftNodeProps {
  type: CreatingNode['type']
  depth: number
  onCreate: (name: string) => Promise<void>
  onCancel: () => void
}

function DraftNode({ type, depth, onCreate, onCancel }: DraftNodeProps) {
  const [name, setName] = useState('')
  const pending = useRef(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { input.current?.focus() }, [])

  async function finish() {
    if (pending.current) return
    const normalized = name.trim()
    if (!normalized) { onCancel(); return }
    pending.current = true
    try {
      await onCreate(normalized)
    } catch {
      input.current?.focus()
      input.current?.select()
    } finally {
      pending.current = false
    }
  }

  return (
    <div className="tree-row tree-draft" style={{ paddingInlineStart: 23 + depth * 14 }}>
      {type === 'directory' ? <Folder size={15} /> : <FileCode2 size={15} />}
      <input
        ref={input}
        value={name}
        aria-label={type === 'directory' ? 'Nombre de carpeta' : 'Nombre de documento'}
        onChange={(event) => setName(event.target.value)}
        onBlur={() => void finish()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); void finish() }
          if (event.key === 'Escape') { event.preventDefault(); onCancel() }
        }}
      />
    </div>
  )
}

interface RenameNodeProps {
  node: TreeNode
  depth: number
  onRename: (node: TreeNode, name: string) => Promise<void>
  onCancel: () => void
}

function FileIcon({ node }: { node: TreeNode }) {
  if (node.type === 'directory') return <Folder size={15} />
  if (node.name.toLowerCase().endsWith('.pdf')) return <FileText size={15} />
  return <FileCode2 size={15} />
}

function RenameNode({ node, depth, onRename, onCancel }: RenameNodeProps) {
  const [name, setName] = useState(node.name.replace(/\.octnb$/, ''))
  const pending = useRef(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { input.current?.focus(); input.current?.select() }, [])

  async function finish() {
    if (pending.current) return
    const normalized = name.trim()
    if (!normalized) { onCancel(); return }
    if (normalized === node.name.replace(/\.octnb$/, '')) { onCancel(); return }
    pending.current = true
    try {
      await onRename(node, normalized)
    } catch {
      input.current?.focus()
      input.current?.select()
    } finally {
      pending.current = false
    }
  }

  return (
    <div className="tree-row tree-draft" style={{ paddingInlineStart: 23 + depth * 14 }}>
      {node.type === 'directory' ? <FolderOpen size={15} /> : <FileIcon node={node} />}
      <input
        ref={input}
        value={name}
        aria-label="Nuevo nombre"
        onChange={(event) => setName(event.target.value)}
        onBlur={() => void finish()}
        onKeyDown={(event) => {
          if (event.key === 'Enter') { event.preventDefault(); void finish() }
          if (event.key === 'Escape') { event.preventDefault(); onCancel() }
        }}
      />
    </div>
  )
}

export function FileTree({
  nodes,
  activePath,
  selectedPath,
  creating,
  renamingPath,
  onSelect,
  onOpen,
  onCreate,
  onCancelCreate,
  onBeginRename,
  onRename,
  onCancelRename,
  onMove,
}: FileTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('octave-tree-expanded') || '[]')
      return new Set(Array.isArray(stored) ? stored.filter((path): path is string => typeof path === 'string') : [])
    } catch {
      return new Set()
    }
  })
  const [dragSource, setDragSource] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const dragSourceRef = useRef<string | null>(null)
  const suppressClickAfterDrag = useRef(false)

  useEffect(() => {
    localStorage.setItem('octave-tree-expanded', JSON.stringify([...expanded]))
  }, [expanded])

  useEffect(() => {
    if (!creating?.parentPath) return
    setExpanded((current) => new Set(current).add(creating.parentPath))
  }, [creating])

  useEffect(() => {
    if (!dropTarget) return
    const timer = window.setTimeout(() => {
      setExpanded((current) => new Set(current).add(dropTarget))
    }, 650)
    return () => window.clearTimeout(timer)
  }, [dropTarget])

  function toggleDirectory(path: string) {
    setExpanded((current) => {
      const next = new Set(current)
      next.has(path) ? next.delete(path) : next.add(path)
      return next
    })
  }

  function activateNode(node: TreeNode) {
    onSelect(node)
    if (node.type === 'file') onOpen(node)
  }

  function consumeSuppressedClick() {
    if (!suppressClickAfterDrag.current) return false
    suppressClickAfterDrag.current = false
    return true
  }

  function renderNode(node: TreeNode, depth: number) {
    const open = expanded.has(node.path)
    const isDirectory = node.type === 'directory'
    const isNotebook = !isDirectory && node.name.toLowerCase().endsWith('.octnb')
    if (renamingPath === node.path) {
      return <RenameNode key={node.path} node={node} depth={depth} onRename={onRename} onCancel={onCancelRename} />
    }
    return (
      <div key={node.path}>
        <div
          role="treeitem"
          aria-expanded={isDirectory ? open : undefined}
          tabIndex={0}
          className={`tree-row ${selectedPath === node.path ? 'selected' : ''} ${activePath === node.path ? 'active' : ''} ${dropTarget === node.path ? 'drop-target' : ''} ${dragSource === node.path ? 'dragging' : ''}`}
          style={{ paddingInlineStart: 10 + depth * 14 }}
          draggable={isNotebook}
          onClick={() => {
            if (consumeSuppressedClick()) return
            activateNode(node)
          }}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault()
              activateNode(node)
            }
            if (isDirectory && event.key === 'ArrowRight' && !open) {
              event.preventDefault()
              toggleDirectory(node.path)
            }
            if (isDirectory && event.key === 'ArrowLeft' && open) {
              event.preventDefault()
              toggleDirectory(node.path)
            }
            if (event.key === 'F2' && selectedPath === node.path) {
              event.preventDefault()
              onBeginRename(node.path)
            }
          }}
          onDragStart={(event) => {
            if (!isNotebook) { event.preventDefault(); return }
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData('text/x-octave-path', node.path)
            dragSourceRef.current = node.path
            suppressClickAfterDrag.current = true
            setDragSource(node.path)
          }}
          onDragEnd={() => {
            dragSourceRef.current = null
            setDragSource(null)
            setDropTarget(null)
            window.setTimeout(() => { suppressClickAfterDrag.current = false }, 0)
          }}
          onDragOver={(event) => {
            if (!isDirectory || !dragSourceRef.current) return
            event.preventDefault()
            event.stopPropagation()
            event.dataTransfer.dropEffect = 'move'
            setDropTarget(node.path)
          }}
          onDragLeave={(event) => {
            if (event.currentTarget.contains(event.relatedTarget as Node)) return
            if (dropTarget === node.path) setDropTarget(null)
          }}
          onDrop={(event) => {
            if (!isDirectory) return
            event.preventDefault()
            event.stopPropagation()
            const source = event.dataTransfer.getData('text/x-octave-path') || dragSourceRef.current
            dragSourceRef.current = null
            setDragSource(null)
            setDropTarget(null)
            window.setTimeout(() => { suppressClickAfterDrag.current = false }, 0)
            if (source) void onMove(source, node.path)
          }}
        >
          {isDirectory ? (
            <span
              role="button"
              tabIndex={-1}
              aria-label={open ? `Contraer ${node.name}` : `Expandir ${node.name}`}
              onClick={(event) => {
                event.stopPropagation()
                if (consumeSuppressedClick()) return
                toggleDirectory(node.path)
              }}
              onMouseDown={(event) => event.stopPropagation()}
            >
              {open ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
            </span>
          ) : <span className="tree-spacer" />}
          {isDirectory ? (open ? <FolderOpen size={15} /> : <Folder size={15} />) : <FileIcon node={node} />}
          <span
            onClick={(event) => {
              event.stopPropagation()
              if (consumeSuppressedClick()) return
              if (selectedPath === node.path) {
                onBeginRename(node.path)
                return
              }
              activateNode(node)
            }}
          >
            {node.name.replace(/\.octnb$/i, '')}
          </span>
        </div>
        {isDirectory && open && node.children?.map((child) => renderNode(child, depth + 1))}
        {isDirectory && open && creating?.parentPath === node.path && (
          <DraftNode type={creating.type} depth={depth + 1} onCreate={onCreate} onCancel={onCancelCreate} />
        )}
      </div>
    )
  }

  return (
    <div className="tree">
      {nodes.map((node) => renderNode(node, 0))}
      {creating?.parentPath === '' && <DraftNode type={creating.type} depth={0} onCreate={onCreate} onCancel={onCancelCreate} />}
      <div
        className={`tree-root-drop ${dragSource ? 'visible' : ''} ${dropTarget === '' ? 'drop-target' : ''}`}
        onDragOver={(event) => {
          if (!dragSourceRef.current) return
          event.preventDefault()
          event.stopPropagation()
          event.dataTransfer.dropEffect = 'move'
          setDropTarget('')
        }}
        onDrop={(event) => {
          event.preventDefault()
          event.stopPropagation()
          const source = event.dataTransfer.getData('text/x-octave-path') || dragSourceRef.current
          dragSourceRef.current = null
          setDragSource(null)
          setDropTarget(null)
          window.setTimeout(() => { suppressClickAfterDrag.current = false }, 0)
          if (source) void onMove(source, '')
        }}
      />
    </div>
  )
}
