import type { ExecutionResult, NotebookDocument, TreeNode } from './types'

const RUNTIME_CLIENT_KEY = 'octave-runtime-client-v1'
const fallbackRuntimeClientId = crypto.randomUUID()
const HEARTBEAT_COORDINATOR = Symbol.for('octave.runtime-heartbeat.v1')

interface HeartbeatCoordinator {
  clientId: string
  subscribers: number
  interval: ReturnType<typeof setInterval> | null
  delayedStop: ReturnType<typeof setTimeout> | null
  sent: number
}

function runtimeClientId() {
  try {
    const current = sessionStorage.getItem(RUNTIME_CLIENT_KEY)
    if (current) return current
    const created = crypto.randomUUID()
    sessionStorage.setItem(RUNTIME_CLIENT_KEY, created)
    return created
  } catch {
    return fallbackRuntimeClientId
  }
}

function heartbeatCoordinator() {
  const registry = globalThis as unknown as Record<PropertyKey, unknown>
  const clientId = runtimeClientId()
  const current = registry[HEARTBEAT_COORDINATOR] as HeartbeatCoordinator | undefined
  if (current?.clientId === clientId) return current
  if (current?.interval) clearInterval(current.interval)
  if (current?.delayedStop) clearTimeout(current.delayedStop)
  const created: HeartbeatCoordinator = {
    clientId,
    subscribers: 0,
    interval: null,
    delayedStop: null,
    sent: 0,
  }
  registry[HEARTBEAT_COORDINATOR] = created
  return created
}

function sendRuntimeHeartbeat(coordinator = heartbeatCoordinator()) {
  coordinator.sent += 1
  return request<{ ok: true }>('/api/runtime/heartbeat', {
    method: 'POST',
    keepalive: true,
    body: JSON.stringify({ clientId: coordinator.clientId }),
  })
}

export function startRuntimeHeartbeat(intervalMs = 10_000) {
  const coordinator = heartbeatCoordinator()
  coordinator.subscribers += 1
  if (coordinator.delayedStop) {
    clearTimeout(coordinator.delayedStop)
    coordinator.delayedStop = null
  }
  if (!coordinator.interval) {
    void sendRuntimeHeartbeat(coordinator).catch(() => undefined)
    coordinator.interval = setInterval(() => {
      void sendRuntimeHeartbeat(coordinator).catch(() => undefined)
    }, intervalMs)
  }

  let released = false
  return () => {
    if (released) return
    released = true
    coordinator.subscribers = Math.max(0, coordinator.subscribers - 1)
    if (coordinator.subscribers || coordinator.delayedStop) return
    // Fast Refresh tears down and mounts effects back-to-back. Keeping the
    // singleton alive briefly lets the replacement subscribe without creating
    // an overlapping interval or an extra immediate heartbeat.
    coordinator.delayedStop = setTimeout(() => {
      coordinator.delayedStop = null
      if (coordinator.subscribers || !coordinator.interval) return
      clearInterval(coordinator.interval)
      coordinator.interval = null
    }, 1_000)
  }
}

export function runtimeHeartbeatStatus() {
  const coordinator = heartbeatCoordinator()
  return {
    clientId: coordinator.clientId,
    subscribers: coordinator.subscribers,
    active: Boolean(coordinator.interval),
    sent: coordinator.sent,
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json', ...init?.headers },
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }))
    throw new Error(body.error || response.statusText)
  }
  return response.json() as Promise<T>
}

async function requestBlob(url: string): Promise<Blob> {
  const response = await fetch(url, { headers: { Accept: 'application/pdf' } })
  if (!response.ok) {
    const body = await response.json().catch(() => ({ error: response.statusText }))
    throw new Error(body.error || response.statusText)
  }
  return response.blob()
}

export const api = {
  tree: () => request<{ nodes: TreeNode[] }>('/api/tree'),
  read: (path: string) => request<{ document: NotebookDocument; absolutePath: string }>(`/api/files?path=${encodeURIComponent(path)}`),
  create: (path: string, type: 'file' | 'directory') => request<{ path: string }>('/api/files', { method: 'POST', body: JSON.stringify({ path, type }) }),
  save: (path: string, document: NotebookDocument) => request<{ savedAt: string }>('/api/files', { method: 'PUT', body: JSON.stringify({ path, document }) }),
  pdf: (path: string) => requestBlob(`/api/notebooks/pdf?path=${encodeURIComponent(path)}`),
  remove: (path: string) => request<{ ok: true }>(`/api/files?path=${encodeURIComponent(path)}`, { method: 'DELETE' }),
  rename: (path: string, nextPath: string) => request<{ path: string }>('/api/files/rename', { method: 'POST', body: JSON.stringify({ path, nextPath }) }),
  runtime: {
    open: (documentId: string) => request<{ runtimeId: string }>('/api/runtime/open', { method: 'POST', body: JSON.stringify({ documentId, clientId: runtimeClientId() }) }),
    execute: (runtimeId: string, cellId: string, code: string) => request<ExecutionResult>('/api/runtime/execute', { method: 'POST', body: JSON.stringify({ runtimeId, cellId, code }) }),
    inspect: (runtimeId: string, expression: string) => request<{ expression: string; display: string; type?: string; shape?: string }>('/api/runtime/inspect', { method: 'POST', body: JSON.stringify({ runtimeId, expression }) }),
    close: (runtimeId: string) => request<{ ok: true }>('/api/runtime/close', { method: 'POST', keepalive: true, body: JSON.stringify({ runtimeId }) }),
    heartbeat: () => sendRuntimeHeartbeat(),
  },
}
