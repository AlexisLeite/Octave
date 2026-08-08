import type { ExecutionResult, NotebookDocument, TreeNode } from './types'

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }))
    throw new Error(body.error || response.statusText)
  }
  return response.json() as Promise<T>
}

export const api = {
  tree: () => request<{ nodes: TreeNode[] }>('/api/tree'),
  read: (path: string) => request<{ document: NotebookDocument }>(`/api/files?path=${encodeURIComponent(path)}`),
  create: (path: string, type: 'file' | 'directory') => request<{ path: string }>('/api/files', { method: 'POST', body: JSON.stringify({ path, type }) }),
  save: (path: string, document: NotebookDocument) => request<{ savedAt: string }>('/api/files', { method: 'PUT', body: JSON.stringify({ path, document }) }),
  remove: (path: string) => request<{ ok: true }>(`/api/files?path=${encodeURIComponent(path)}`, { method: 'DELETE' }),
  rename: (path: string, nextPath: string) => request<{ path: string }>('/api/files/rename', { method: 'POST', body: JSON.stringify({ path, nextPath }) }),
  runtime: {
    open: (documentId: string) => request<{ runtimeId: string }>('/api/runtime/open', { method: 'POST', body: JSON.stringify({ documentId }) }),
    execute: (runtimeId: string, cellId: string, code: string) => request<ExecutionResult>('/api/runtime/execute', { method: 'POST', body: JSON.stringify({ runtimeId, cellId, code }) }),
    inspect: (runtimeId: string, expression: string) => request<{ expression: string; display: string; type?: string; shape?: string }>('/api/runtime/inspect', { method: 'POST', body: JSON.stringify({ runtimeId, expression }) }),
    close: (runtimeId: string) => request<{ ok: true }>('/api/runtime/close', { method: 'POST', body: JSON.stringify({ runtimeId }) }),
  },
}
