import { ChevronDown, ChevronRight, Play, RotateCcw, Search, X } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api } from '../api'
import { findHelpNode, findHelpPath, octaveHelp, searchHelp, type HelpBlock, type HelpNode } from '../help/octaveHelp'
import type { ExecutionResult } from '../types'
import { LoadingDot } from './LoadingDot'
import { OctaveEditor } from './OctaveEditor'
import { ReadonlyMarkdown } from './ReadonlyMarkdown'
import './HelpModal.css'

export interface HelpModalProps {
  open: boolean
  onClose: () => void
}

interface VisibleNode {
  node: HelpNode
  level: number
}

function renderedBlocks(node: HelpNode): HelpBlock[] {
  return node.blocks
}

const HELP_STORAGE = {
  query: 'octave-help-v1-query',
  selected: 'octave-help-v1-selected',
  expanded: 'octave-help-v1-expanded',
  focused: 'octave-help-v1-focused',
  treeScroll: 'octave-help-v1-tree-scroll',
  contentScroll: 'octave-help-v1-content-scroll',
  lastQuery: 'octave-help-v1-last-query',
  lastResult: 'octave-help-v1-last-result',
} as const

function storedString(key: string, fallback: string) {
  const value = localStorage.getItem(key)
  return value === null ? fallback : value
}

function storedStringSet(key: string, fallback: Iterable<string>) {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) || 'null')
    return new Set(Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : fallback)
  } catch {
    return new Set(fallback)
  }
}

function storedScrollMap() {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(HELP_STORAGE.contentScroll) || '{}')
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {} as Record<string, number>
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] => Number.isFinite(entry[1]) && Number(entry[1]) >= 0))
  } catch {
    return {} as Record<string, number>
  }
}

function flatten(nodes: HelpNode[], expanded: Set<string>, level = 1): VisibleNode[] {
  return nodes.flatMap((current) => [
    { node: current, level },
    ...(current.children?.length && expanded.has(current.id)
      ? flatten(current.children, expanded, level + 1)
      : []),
  ])
}

function firstLeaf(nodes: HelpNode[]): HelpNode | undefined {
  const current = nodes[0]
  return current?.children?.length ? firstLeaf(current.children) : current
}

function ExecutableBlock({ title, originalCode }: { title?: string; originalCode: string }) {
  const [code, setCode] = useState(originalCode)
  const [result, setResult] = useState<ExecutionResult | null>(null)
  const [requestError, setRequestError] = useState<string | null>(null)
  const [running, setRunning] = useState(false)

  async function run() {
    if (running) return
    setRunning(true)
    let runtimeId: string | null = null
    try {
      const opened = await api.runtime.open(`help-${crypto.randomUUID()}`)
      runtimeId = opened.runtimeId
      const nextResult = await api.runtime.execute(runtimeId, `help-example-${crypto.randomUUID()}`, code)
      setResult(nextResult)
      setRequestError(null)
    } catch (error) {
      setResult(null)
      setRequestError(error instanceof Error ? error.message : 'No se pudo ejecutar el ejemplo')
    } finally {
      if (runtimeId) await api.runtime.close(runtimeId).catch(() => undefined)
      setRunning(false)
    }
  }

  function reset() {
    setCode(originalCode)
    setResult(null)
    setRequestError(null)
  }

  return (
    <section className="help-code-block" aria-label={title ?? 'Ejemplo ejecutable'} aria-busy={running}>
      <div className="help-example-heading">
        {title ? <h2>{title}</h2> : <span />}
        <div className="help-example-actions">
          <LoadingDot active={running} />
          <button type="button" onClick={() => void run()} disabled={running} title={running ? 'Ejecutando…' : 'Ejecutar'} aria-label={`Ejecutar ${title ?? 'bloque'}`}><Play size={13} /></button>
          <button type="button" onClick={reset} title="Restablecer" aria-label={`Restablecer ${title ?? 'bloque'}`}><RotateCcw size={13} /></button>
        </div>
      </div>
      <div className="help-example-editor">
        <OctaveEditor value={code} onChange={setCode} onRun={() => void run()} />
      </div>
      {(result || requestError) && (
        <div className={`help-example-output${requestError || result?.error ? ' error' : ''}`} role="status">
          {result?.stdout && <pre>{result.stdout}</pre>}
          {result?.stderr && <pre>{result.stderr}</pre>}
          {result?.error && <pre>{result.error.message}</pre>}
          {requestError && <pre>{requestError}</pre>}
        </div>
      )}
    </section>
  )
}

export function HelpModal({ open, onClose }: HelpModalProps) {
  const defaultSelectedId = firstLeaf(octaveHelp)?.id ?? ''
  const [query, setQuery] = useState(() => storedString(HELP_STORAGE.query, ''))
  const [selectedId, setSelectedId] = useState(() => {
    const stored = storedString(HELP_STORAGE.selected, defaultSelectedId)
    return findHelpNode(octaveHelp, stored) ? stored : defaultSelectedId
  })
  const [expanded, setExpanded] = useState<Set<string>>(() => storedStringSet(HELP_STORAGE.expanded, octaveHelp.map((item) => item.id)))
  const [focusedId, setFocusedId] = useState(() => {
    const stored = storedString(HELP_STORAGE.focused, octaveHelp[0]?.id ?? '')
    return findHelpNode(octaveHelp, stored) ? stored : octaveHelp[0]?.id ?? ''
  })
  const [activeResultId, setActiveResultId] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const treeRef = useRef<HTMLElement>(null)
  const contentRef = useRef<HTMLElement>(null)
  const contentScrollRef = useRef<Record<string, number>>(storedScrollMap())
  const openerRef = useRef<HTMLElement | null>(null)
  const lastQueryRef = useRef(storedString(HELP_STORAGE.lastQuery, query))
  const lastResultRef = useRef(storedString(HELP_STORAGE.lastResult, ''))

  const results = useMemo(() => searchHelp(octaveHelp, query), [query])
  const visible = useMemo(() => flatten(octaveHelp, expanded), [expanded])
  const selected = findHelpNode(octaveHelp, selectedId) ?? firstLeaf(octaveHelp) ?? octaveHelp[0]

  useEffect(() => {
    if (!open) return
    openerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const focusTimer = window.setTimeout(() => {
      searchRef.current?.focus()
      searchRef.current?.select()
    }, 0)
    return () => {
      window.clearTimeout(focusTimer)
      openerRef.current?.focus()
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    function focusSearch(event: KeyboardEvent) {
      if (event.key !== 'F1') return
      event.preventDefault()
      event.stopPropagation()
      event.stopImmediatePropagation()
      if (!query.trim() && lastQueryRef.current.trim()) {
        setActiveResultId(lastResultRef.current)
        setQuery(lastQueryRef.current)
      }
      requestAnimationFrame(() => {
        searchRef.current?.focus()
        searchRef.current?.select()
      })
    }
    document.addEventListener('keydown', focusSearch, true)
    return () => document.removeEventListener('keydown', focusSearch, true)
  }, [open, query])

  useEffect(() => {
    if (!query.trim()) return
    setActiveResultId((current) => results.some((result) => result.node.id === current)
      ? current
      : results[0]?.node.id ?? '')
  }, [query, results])

  useEffect(() => { localStorage.setItem(HELP_STORAGE.query, query) }, [query])
  useEffect(() => {
    if (!query.trim()) return
    lastQueryRef.current = query
    localStorage.setItem(HELP_STORAGE.lastQuery, query)
  }, [query])
  useEffect(() => { localStorage.setItem(HELP_STORAGE.selected, selectedId) }, [selectedId])
  useEffect(() => { localStorage.setItem(HELP_STORAGE.expanded, JSON.stringify([...expanded])) }, [expanded])
  useEffect(() => { localStorage.setItem(HELP_STORAGE.focused, focusedId) }, [focusedId])

  useEffect(() => {
    if (!open) return
    const frame = requestAnimationFrame(() => {
      const treeScroll = Number(localStorage.getItem(HELP_STORAGE.treeScroll))
      if (treeRef.current && Number.isFinite(treeScroll) && treeScroll >= 0) treeRef.current.scrollTop = treeScroll
    })
    return () => cancelAnimationFrame(frame)
  }, [open])

  useEffect(() => {
    if (!open || !selected?.id) return
    const frame = requestAnimationFrame(() => {
      if (contentRef.current) contentRef.current.scrollTop = contentScrollRef.current[selected.id] ?? 0
    })
    return () => cancelAnimationFrame(frame)
  }, [open, selected?.id])

  if (!open) return null

  function close() {
    onClose()
  }

  function handleDialogKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      return
    }
    if (event.key !== 'Tab') return
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    )
    if (!focusable?.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  function handleTreeKeyDown(event: React.KeyboardEvent<HTMLDivElement>, id: string) {
    const index = visible.findIndex((entry) => entry.node.id === id)
    const current = visible[index]
    if (!current) return
    let target: VisibleNode | undefined
    if (event.key === 'ArrowDown') target = visible[index + 1]
    if (event.key === 'ArrowUp') target = visible[index - 1]
    if (event.key === 'Home') target = visible[0]
    if (event.key === 'End') target = visible[visible.length - 1]
    if (event.key === 'ArrowRight' && current.node.children?.length) {
      if (!expanded.has(id)) setExpanded((value) => new Set(value).add(id))
      else target = visible[index + 1]
    }
    if (event.key === 'ArrowLeft') {
      if (current.node.children?.length && expanded.has(id)) {
        setExpanded((value) => { const next = new Set(value); next.delete(id); return next })
      } else {
        target = [...visible].slice(0, index).reverse().find((candidate) => candidate.level < current.level)
      }
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setSelectedId(id)
    }
    if (target) {
      event.preventDefault()
      setFocusedId(target.node.id)
      requestAnimationFrame(() => dialogRef.current?.querySelector<HTMLElement>(`[data-help-id="${target?.node.id}"]`)?.focus())
    } else if (['ArrowLeft', 'ArrowRight', 'Enter', ' '].includes(event.key)) {
      event.preventDefault()
    }
  }

  function openSearchResult(id: string) {
    const path = findHelpPath(octaveHelp, id)
    if (!path) return
    if (query.trim()) {
      lastQueryRef.current = query
      localStorage.setItem(HELP_STORAGE.lastQuery, query)
    }
    lastResultRef.current = id
    localStorage.setItem(HELP_STORAGE.lastResult, id)
    setActiveResultId(id)
    setExpanded((value) => {
      const next = new Set(value)
      path.slice(0, -1).forEach((node) => next.add(node.id))
      return next
    })
    contentScrollRef.current[id] = 0
    localStorage.setItem(HELP_STORAGE.contentScroll, JSON.stringify(contentScrollRef.current))
    setSelectedId(id)
    setFocusedId(id)
    setQuery('')
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (contentRef.current) contentRef.current.scrollTop = 0
      const treeItem = dialogRef.current?.querySelector<HTMLElement>(`[data-help-id="${id}"]`)
      treeItem?.scrollIntoView({ block: 'nearest' })
      treeItem?.focus({ preventScroll: true })
    }))
  }

  function moveActiveResult(nextIndex: number) {
    const next = results[nextIndex]
    if (!next) return
    setActiveResultId(next.node.id)
    requestAnimationFrame(() => {
      document.getElementById(`help-result-${next.node.id}`)?.scrollIntoView({ block: 'nearest' })
    })
  }

  function handleSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!query.trim() || !results.length) return
    const currentIndex = results.findIndex((result) => result.node.id === activeResultId)
    let nextIndex: number | undefined
    if (event.key === 'ArrowDown') nextIndex = currentIndex < 0 ? 0 : Math.min(results.length - 1, currentIndex + 1)
    if (event.key === 'ArrowUp') nextIndex = currentIndex < 0 ? 0 : Math.max(0, currentIndex - 1)
    if (nextIndex !== undefined) {
      event.preventDefault()
      event.stopPropagation()
      moveActiveResult(nextIndex)
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      event.stopPropagation()
      const active = results.find((result) => result.node.id === activeResultId) ?? results[0]
      openSearchResult(active.node.id)
    }
  }

  return createPortal(
    <div className="help-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}>
      <div
        ref={dialogRef}
        className="help-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Ayuda de Octave"
        onKeyDown={handleDialogKeyDown}
      >
        <header className="help-header">
          <label className="help-search">
            <Search aria-hidden="true" size={16} />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => {
                setActiveResultId('')
                setQuery(event.target.value)
              }}
              onKeyDown={handleSearchKeyDown}
              placeholder="Buscar"
              aria-label="Buscar en la ayuda"
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={Boolean(query.trim())}
              aria-controls={query.trim() ? 'help-search-results' : undefined}
              aria-activedescendant={query.trim() && activeResultId ? `help-result-${activeResultId}` : undefined}
            />
          </label>
          <button type="button" className="help-close" onClick={close} aria-label="Cerrar ayuda">
            <X aria-hidden="true" size={18} />
          </button>
        </header>

        {query.trim() ? (
          <main id="help-search-results" className="help-results" role="listbox" aria-label="Resultados de búsqueda">
            {results.map((result) => (
              <button
                type="button"
                id={`help-result-${result.node.id}`}
                role="option"
                aria-selected={activeResultId === result.node.id}
                className={`help-result${activeResultId === result.node.id ? ' active' : ''}`}
                key={result.node.id}
                tabIndex={-1}
                onMouseEnter={() => setActiveResultId(result.node.id)}
                onClick={() => openSearchResult(result.node.id)}
              >
                {result.breadcrumb.length > 0 && (
                  <span className="help-result-breadcrumb">{result.breadcrumb.join(' / ')}</span>
                )}
                <span className="help-result-title">{result.node.title}</span>
              </button>
            ))}
            {!results.length && <div className="help-empty" role="status">Sin resultados</div>}
          </main>
        ) : (
        <div className="help-layout">
          <nav
            ref={treeRef}
            className="help-tree"
            role="tree"
            aria-label="Áreas de aprendizaje"
            onScroll={(event) => localStorage.setItem(HELP_STORAGE.treeScroll, String(event.currentTarget.scrollTop))}
          >
            {visible.map(({ node: item, level }) => {
              const hasChildren = Boolean(item.children?.length)
              const isExpanded = expanded.has(item.id)
              return (
                <div
                  key={item.id}
                  role="treeitem"
                  aria-level={level}
                  aria-expanded={hasChildren ? isExpanded : undefined}
                  aria-selected={selected?.id === item.id}
                  className={`help-tree-item${selected?.id === item.id ? ' selected' : ''}`}
                  style={{ paddingInlineStart: 10 + (level - 1) * 15 }}
                  tabIndex={focusedId === item.id ? 0 : -1}
                  data-help-id={item.id}
                  onFocus={() => setFocusedId(item.id)}
                  onClick={() => {
                    setSelectedId(item.id)
                  }}
                  onKeyDown={(event) => handleTreeKeyDown(event, item.id)}
                >
                  {hasChildren ? (
                    <button
                      type="button"
                      className="help-tree-chevron"
                      tabIndex={-1}
                      aria-label={isExpanded ? `Contraer ${item.title}` : `Expandir ${item.title}`}
                      onClick={(event) => {
                        event.stopPropagation()
                        setExpanded((value) => {
                          const next = new Set(value)
                          if (next.has(item.id)) next.delete(item.id); else next.add(item.id)
                          return next
                        })
                      }}
                    >
                      {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </button>
                  ) : <span className="help-tree-chevron" aria-hidden="true" />}
                  <span>{item.title}</span>
                </div>
              )
            })}
            {!visible.length && <div className="help-empty" role="status">Sin resultados</div>}
          </nav>

          <main
            ref={contentRef}
            className="help-content"
            tabIndex={-1}
            onScroll={(event) => {
              if (!selected?.id) return
              contentScrollRef.current[selected.id] = event.currentTarget.scrollTop
              localStorage.setItem(HELP_STORAGE.contentScroll, JSON.stringify(contentScrollRef.current))
            }}
          >
            {selected && (
              <article key={selected.id}>
                <h1>{selected.title}</h1>
                <div className="help-notebook">
                  {renderedBlocks(selected).map((block, index) => block.kind === 'markdown' ? (
                    <ReadonlyMarkdown key={`${selected.id}-${index}`} source={block.source} className="help-narrative" />
                  ) : (
                    <ExecutableBlock
                      key={`${selected.id}-${index}`}
                      title={block.title}
                      originalCode={block.source}
                    />
                  ))}
                </div>
              </article>
            )}
          </main>
        </div>
        )}
      </div>
    </div>,
    document.body,
  )
}
