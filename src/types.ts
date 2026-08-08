export type CellKind = 'code' | 'markdown'

export interface NotebookCell {
  id: string
  kind: CellKind
  source: string
}

export interface NotebookDocument {
  version: 1
  id: string
  title: string
  cells: NotebookCell[]
  outputs?: Record<string, ExecutionResult>
}

export interface TreeNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: TreeNode[]
}

export interface ExecutionError {
  message: string
  line: number | null
  column: number | null
  stack?: string
}

export interface ExecutionResult {
  cellId: string
  source?: string
  stdout: string
  stderr: string
  durationMs: number
  error: ExecutionError | null
  timedOut?: boolean
  cancelled?: boolean
}

export interface ExecutionProgress {
  cellId: string
  stdout: string
  stderr: string
  durationMs: number
  timedOut: boolean
}
