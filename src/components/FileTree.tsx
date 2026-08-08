import { ChevronDown, ChevronRight, FileCode2, Folder, FolderOpen } from 'lucide-react'
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
  onSelect: (node: TreeNode) => void
  onOpen: (node: TreeNode) => void
  onCreate: (name: string) => Promise<void>
  onCancelCreate: () => void
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
    try { await onCreate(normalized) } finally { pending.current = false }
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

export function FileTree({ nodes, activePath, selectedPath, creating, onSelect, onOpen, onCreate, onCancelCreate }: FileTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    if (!creating?.parentPath) return
    setExpanded((current) => new Set(current).add(creating.parentPath))
  }, [creating])

  function renderNode(node: TreeNode, depth: number) {
    const open = expanded.has(node.path)
    const isDirectory = node.type === 'directory'
    return (
      <div key={node.path}>
        <button
          className={`tree-row ${selectedPath === node.path ? 'selected' : ''} ${activePath === node.path ? 'active' : ''}`}
          style={{ paddingInlineStart: 10 + depth * 14 }}
          onClick={() => {
            onSelect(node)
            if (isDirectory) {
              setExpanded((current) => {
                const next = new Set(current)
                next.has(node.path) ? next.delete(node.path) : next.add(node.path)
                return next
              })
            } else {
              onOpen(node)
            }
          }}
        >
          {isDirectory ? (open ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : <span className="tree-spacer" />}
          {isDirectory ? (open ? <FolderOpen size={15} /> : <Folder size={15} />) : <FileCode2 size={15} />}
          <span>{node.name.replace(/\.octnb$/, '')}</span>
        </button>
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
    </div>
  )
}
