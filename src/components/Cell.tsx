import { Braces, ChevronUp, Copy, GripVertical, Play, Plus, RotateCcw, Square, Text, Trash2, WandSparkles } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ExecutionResult, NotebookCell } from '../types'
import { LoadingDot } from './LoadingDot'
import { MarkdownEditor } from './MarkdownEditor'
import { NumberedOutput } from './NumberedOutput'
import { OctaveEditor } from './OctaveEditor'

interface CellProps {
  cell: NotebookCell
  index: number
  order: number
  output?: ExecutionResult
  running: boolean
  onChange: (source: string) => void
  onRun: () => void
  onStop: () => void
  onFormat: () => void
  onDelete: () => void
  onClearOutput: () => void
  onCopyContext: () => void
  onKindChange: (kind: NotebookCell['kind']) => void
  onInspect: (expression: string) => Promise<{ display: string; type?: string; shape?: string }>
  completionSources: string[]
  viewStateKey: string
  notebookPath: string
  dragging: boolean
  dropEdge: 'before' | 'after' | null
  onDragStart: () => void
  onDragEnd: () => void
  onDragOver: (edge: 'before' | 'after') => void
  onDrop: (edge: 'before' | 'after') => void
  onDragLeave: () => void
  showInsertAfter: boolean
  onAddAfter: (kind: NotebookCell['kind']) => void
  onSplitMarkdownSelection: (remaining: string, extracted: string) => void
}

export function Cell({ cell, index, order, output, running, onChange, onRun, onStop, onFormat, onDelete, onClearOutput, onCopyContext, onKindChange, onInspect, completionSources, viewStateKey, notebookPath, dragging, dropEdge, onDragStart, onDragEnd, onDragOver, onDrop, onDragLeave, showInsertAfter, onAddAfter, onSplitMarkdownSelection }: CellProps) {
  const [outputCollapsed, setOutputCollapsed] = useState(false)
  const cellRef = useRef<HTMLElement>(null)
  const gutterRef = useRef<HTMLElement>(null)
  const executionIndicatorRef = useRef<HTMLSpanElement>(null)
  const editorRegionRef = useRef<HTMLDivElement>(null)
  const actionsBoundaryRef = useRef<HTMLDivElement>(null)
  const outputContentRef = useRef<HTMLDivElement>(null)
  const resultMatchesSource = output?.source === cell.source
  const diagnostics = useMemo(() => resultMatchesSource && output?.error?.line ? [{
      line: output.error.line,
      ...(output.error.column ? { column: output.error.column } : {}),
      severity: 'error' as const,
      message: output.error.message,
    }] : [], [resultMatchesSource, output?.error?.line, output?.error?.column, output?.error?.message])

  useEffect(() => {
    if (!output) setOutputCollapsed(false)
  }, [output])

  useEffect(() => {
    if (!output || outputCollapsed) return
    const frame = window.requestAnimationFrame(() => {
      const content = outputContentRef.current
      if (content) content.scrollTop = content.scrollHeight
    })
    return () => window.cancelAnimationFrame(frame)
  }, [output?.stdout, output?.stderr, output?.error?.message, outputCollapsed, running])

  useEffect(() => {
    const region = editorRegionRef.current
    const boundary = actionsBoundaryRef.current
    const cellElement = cellRef.current
    const gutter = gutterRef.current
    const indicator = executionIndicatorRef.current
    const scroller = region?.closest<HTMLElement>('.notebook')
    if (!region || !boundary || !cellElement || !gutter || !scroller) return

    let frame = 0
    const layout = () => {
      frame = 0
      const regionRect = region.getBoundingClientRect()
      const cellRect = cellElement.getBoundingClientRect()
      const gutterRect = gutter.getBoundingClientRect()
      const scrollerRect = scroller.getBoundingClientRect()
      const actions = boundary.firstElementChild as HTMLElement | null
      const actionWidth = actions?.getBoundingClientRect().width ?? boundary.getBoundingClientRect().width
      const actionHeight = Math.max(33, boundary.getBoundingClientRect().height)
      const stickyTop = scrollerRect.top + 2
      const shouldFloat = regionRect.top < stickyTop
        && regionRect.bottom > stickyTop + actionHeight + 2

      if (shouldFloat) {
        boundary.dataset.floating = 'true'
        boundary.style.setProperty('--cell-actions-top', `${stickyTop}px`)
        boundary.style.setProperty('--cell-actions-left', `${regionRect.right - actionWidth - 6}px`)
      } else {
        delete boundary.dataset.floating
        boundary.style.removeProperty('--cell-actions-top')
        boundary.style.removeProperty('--cell-actions-left')
      }

      if (!indicator) return
      const indicatorSize = Math.max(6, indicator.getBoundingClientRect().width)
      const indicatorTop = stickyTop + 8
      const shouldFloatIndicator = running
        && cellRect.top < indicatorTop
        && cellRect.bottom > indicatorTop + indicatorSize + 2
      if (shouldFloatIndicator) {
        indicator.dataset.floating = 'true'
        indicator.style.setProperty('--cell-indicator-top', `${indicatorTop}px`)
        indicator.style.setProperty('--cell-indicator-left', `${gutterRect.left + (gutterRect.width - indicatorSize) / 2}px`)
      } else {
        delete indicator.dataset.floating
        indicator.style.removeProperty('--cell-indicator-top')
        indicator.style.removeProperty('--cell-indicator-left')
      }
    }
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(layout)
    }
    const observer = new ResizeObserver(schedule)
    observer.observe(region)
    observer.observe(cellElement)
    observer.observe(scroller)
    scroller.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    schedule()

    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
      if (indicator) {
        delete indicator.dataset.floating
        indicator.style.removeProperty('--cell-indicator-top')
        indicator.style.removeProperty('--cell-indicator-left')
      }
      scroller.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [running])

  return (
    <article
      ref={cellRef}
      data-cell-id={cell.id}
      className={`cell ${running ? 'running' : ''} ${dragging ? 'dragging' : ''} ${dropEdge ? `drop-${dropEdge}` : ''}`}
      style={{ order }}
      onDragOver={(event) => {
        if (dragging) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        const bounds = event.currentTarget.getBoundingClientRect()
        onDragOver(event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after')
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) onDragLeave()
      }}
      onDrop={(event) => {
        event.preventDefault()
        const bounds = event.currentTarget.getBoundingClientRect()
        const edge = event.clientY < bounds.top + bounds.height / 2 ? 'before' : 'after'
        onDrop(edge)
      }}
    >
      <aside
        ref={gutterRef}
        className="cell-gutter"
      >
        <span
          className="cell-drag-handle"
          draggable
          role="button"
          aria-label="Mover celda"
          title="Mover celda"
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = 'move'
            event.dataTransfer.setData('text/x-octave-cell', cell.id)
            onDragStart()
          }}
          onDragEnd={onDragEnd}
        >
          <GripVertical size={14} />
        </span>
        <span>{index + 1}</span>
        {cell.kind === 'code' && (
          <span
            ref={executionIndicatorRef}
            className="cell-execution-indicator"
            role={running ? 'status' : undefined}
            aria-label={running ? 'En ejecución' : undefined}
            title={running ? 'En ejecución' : undefined}
          >
            <LoadingDot active={running} />
          </span>
        )}
      </aside>
      <div className="cell-body">
        <div ref={editorRegionRef} className="cell-editor-region">
          <div ref={actionsBoundaryRef} className="cell-actions-boundary">
            <div className="cell-actions">
              {cell.kind === 'code' && (running
                ? <button type="button" aria-label="Detener" title="Detener ejecución" onClick={onStop}><Square size={13} fill="currentColor" /></button>
                : <button type="button" aria-label="Ejecutar" title="Ejecutar · Ctrl+Enter" onClick={onRun}><Play size={14} /></button>)}
              {cell.kind === 'code' && <button type="button" aria-label="Formatear código" title="Formatear · Ctrl+Shift+F" onClick={onFormat}><WandSparkles size={14} /></button>}
              {cell.kind === 'code' && <button type="button" aria-label="Copiar contexto" title="Copiar contexto" onClick={onCopyContext}><Copy size={14} /></button>}
              {cell.kind === 'code' && <button type="button" aria-label="Borrar salida" title="Borrar salida · no reinicia Octave" onClick={onClearOutput} disabled={!output}><RotateCcw size={14} /></button>}
              <button
                type="button"
                aria-label={cell.kind === 'code' ? 'Convertir a markdown' : 'Convertir a código'}
                title={cell.kind === 'code' ? 'Markdown' : 'Código'}
                onClick={() => onKindChange(cell.kind === 'code' ? 'markdown' : 'code')}
              >{cell.kind === 'code' ? <Text size={14} /> : <Braces size={14} />}</button>
              <button type="button" aria-label="Eliminar celda" title="Eliminar" onClick={onDelete}><Trash2 size={14} /></button>
            </div>
          </div>
          {cell.kind === 'code' ? (
            <OctaveEditor value={cell.source} onChange={onChange} onRun={onRun} onFormat={onFormat} diagnostics={diagnostics} onInspect={onInspect} completionSources={completionSources} viewStateKey={viewStateKey} />
          ) : (
            <MarkdownEditor value={cell.source} onChange={onChange} onSplitSelection={onSplitMarkdownSelection} viewStateKey={viewStateKey} notebookPath={notebookPath} />
          )}
        </div>
        {output && (output.stdout || output.stderr || output.error) && (
          <div className={`cell-output ${output.error ? 'error' : ''} ${outputCollapsed ? 'collapsed' : ''}`}>
            <div className="cell-output-toolbar">
              <span className="duration">{output.durationMs} ms</span>
              <button
                type="button"
                className="cell-output-collapse"
                aria-expanded={!outputCollapsed}
                aria-label={outputCollapsed ? 'Expandir salida' : 'Colapsar salida'}
                title={outputCollapsed ? 'Expandir salida' : 'Colapsar salida'}
                onClick={() => setOutputCollapsed((collapsed) => !collapsed)}
              >
                <ChevronUp size={14} />
                <span>{outputCollapsed ? 'Expandir' : 'Colapsar'}</span>
              </button>
            </div>
            <div ref={outputContentRef} className="cell-output-content" aria-hidden={outputCollapsed}>
              {output.outputs?.length ? output.outputs.map((block, blockIndex) => block.type === 'image'
                ? <img className="octave-plot" key={blockIndex} src={block.value} alt={block.alt || 'Gráfica de Octave'} />
                : <NumberedOutput key={blockIndex} value={block.value} />)
                : output.stdout && <NumberedOutput value={output.stdout} />}
              {output.stderr && <NumberedOutput value={output.stderr} />}
              {output.error && <pre>{output.error.message}</pre>}
            </div>
          </div>
        )}
      </div>
      {showInsertAfter && (
        <div className="cell-insert">
          <button onClick={() => onAddAfter('code')} title="Insertar código" aria-label="Insertar código"><Plus size={11} /><Braces size={13} /></button>
          <button onClick={() => onAddAfter('markdown')} title="Insertar Markdown" aria-label="Insertar Markdown"><Plus size={11} /><Text size={13} /></button>
        </div>
      )}
    </article>
  )
}
