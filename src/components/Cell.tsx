import { Braces, GripVertical, Play, Text, Trash2 } from 'lucide-react'
import type { ExecutionResult, NotebookCell } from '../types'
import { MarkdownEditor } from './MarkdownEditor'
import { OctaveEditor } from './OctaveEditor'

interface CellProps {
  cell: NotebookCell
  index: number
  output?: ExecutionResult
  running: boolean
  onChange: (source: string) => void
  onRun: () => void
  onDelete: () => void
  onKindChange: (kind: NotebookCell['kind']) => void
  onInspect: (expression: string) => Promise<{ display: string; type?: string; shape?: string }>
}

export function Cell({ cell, index, output, running, onChange, onRun, onDelete, onKindChange, onInspect }: CellProps) {
  const diagnostics = output?.error?.line ? [{
    line: output.error.line,
    column: output.error.column || 1,
    severity: 'error' as const,
    message: output.error.message,
  }] : []

  return (
    <article className={`cell ${running ? 'running' : ''}`}>
      <aside className="cell-gutter">
        <GripVertical size={14} />
        <span>{index + 1}</span>
      </aside>
      <div className="cell-body">
        <div className="cell-actions">
          {cell.kind === 'code' && <button aria-label="Ejecutar" title="Ejecutar · Shift+Enter" onClick={onRun}><Play size={14} /></button>}
          <button
            aria-label={cell.kind === 'code' ? 'Convertir a markdown' : 'Convertir a código'}
            title={cell.kind === 'code' ? 'Markdown' : 'Código'}
            onClick={() => onKindChange(cell.kind === 'code' ? 'markdown' : 'code')}
          >{cell.kind === 'code' ? <Text size={14} /> : <Braces size={14} />}</button>
          <button aria-label="Eliminar celda" title="Eliminar" onClick={onDelete}><Trash2 size={14} /></button>
        </div>
        {cell.kind === 'code' ? (
          <OctaveEditor value={cell.source} onChange={onChange} onRun={onRun} diagnostics={diagnostics} onInspect={onInspect} />
        ) : (
          <MarkdownEditor value={cell.source} onChange={onChange} />
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
    </article>
  )
}
