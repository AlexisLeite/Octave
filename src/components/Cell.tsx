import { Braces, Copy, GripVertical, Play, Plus, RotateCcw, Text, Trash2, WandSparkles } from 'lucide-react'
import { useMemo } from 'react'
import type { ExecutionResult, NotebookCell } from '../types'
import { LoadingDot } from './LoadingDot'
import { MarkdownEditor } from './MarkdownEditor'
import { OctaveEditor } from './OctaveEditor'

interface CellProps {
  cell: NotebookCell
  index: number
  order: number
  output?: ExecutionResult
  running: boolean
  onChange: (source: string) => void
  onRun: () => void
  onFormat: () => void
  onDelete: () => void
  onClearOutput: () => void
  onCopyContext: () => void
  onKindChange: (kind: NotebookCell['kind']) => void
  onInspect: (expression: string) => Promise<{ display: string; type?: string; shape?: string }>
  completionSources: string[]
  viewStateKey: string
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

export function Cell({ cell, index, order, output, running, onChange, onRun, onFormat, onDelete, onClearOutput, onCopyContext, onKindChange, onInspect, completionSources, viewStateKey, dragging, dropEdge, onDragStart, onDragEnd, onDragOver, onDrop, onDragLeave, showInsertAfter, onAddAfter, onSplitMarkdownSelection }: CellProps) {
  const resultMatchesSource = output?.source === cell.source
  const diagnostics = useMemo(() => resultMatchesSource && output?.error?.line ? [{
      line: output.error.line,
      ...(output.error.column ? { column: output.error.column } : {}),
      severity: 'error' as const,
      message: output.error.message,
    }] : [], [resultMatchesSource, output?.error?.line, output?.error?.column, output?.error?.message])

  return (
    <article
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
        className="cell-gutter"
        draggable
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = 'move'
          event.dataTransfer.setData('text/x-octave-cell', cell.id)
          onDragStart()
        }}
        onDragEnd={onDragEnd}
      >
        <GripVertical size={14} />
        <span>{index + 1}</span>
        {cell.kind === 'code' && <LoadingDot active={running} />}
      </aside>
      <div className="cell-body">
        <div className="cell-actions">
          {cell.kind === 'code' && <button aria-label="Ejecutar" title="Ejecutar · Ctrl+Enter" onClick={onRun}><Play size={14} /></button>}
          {cell.kind === 'code' && <button aria-label="Formatear código" title="Formatear · Ctrl+Shift+F" onClick={onFormat}><WandSparkles size={14} /></button>}
          {cell.kind === 'code' && <button aria-label="Copiar contexto" title="Copiar contexto" onClick={onCopyContext}><Copy size={14} /></button>}
          {cell.kind === 'code' && <button aria-label="Borrar salida" title="Borrar salida" onClick={onClearOutput} disabled={!output}><RotateCcw size={14} /></button>}
          <button
            aria-label={cell.kind === 'code' ? 'Convertir a markdown' : 'Convertir a código'}
            title={cell.kind === 'code' ? 'Markdown' : 'Código'}
            onClick={() => onKindChange(cell.kind === 'code' ? 'markdown' : 'code')}
          >{cell.kind === 'code' ? <Text size={14} /> : <Braces size={14} />}</button>
          <button aria-label="Eliminar celda" title="Eliminar" onClick={onDelete}><Trash2 size={14} /></button>
        </div>
        {cell.kind === 'code' ? (
          <OctaveEditor value={cell.source} onChange={onChange} onRun={onRun} onFormat={onFormat} diagnostics={diagnostics} onInspect={onInspect} completionSources={completionSources} viewStateKey={viewStateKey} />
        ) : (
          <MarkdownEditor value={cell.source} onChange={onChange} onSplitSelection={onSplitMarkdownSelection} viewStateKey={viewStateKey} />
        )}
        {output && (output.stdout || output.stderr || output.error) && (
          <div className={`cell-output ${output.error ? 'error' : ''}`}>
            {output.stdout && <pre>{output.stdout}</pre>}
            {output.stderr && <pre>{output.stderr}</pre>}
            {output.error && <pre>{output.error.message}</pre>}
            <span className="duration">{output.durationMs} ms</span>
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
