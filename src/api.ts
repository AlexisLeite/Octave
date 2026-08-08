import type { ExecutionProgress, ExecutionResult, NotebookDocument, TreeNode } from './types'

const RUNTIME_CLIENT_KEY = 'octave-runtime-client-v1'
const fallbackRuntimeClientId = crypto.randomUUID()
const HEARTBEAT_COORDINATOR = Symbol.for('octave.runtime-heartbeat.v1')
const HEARTBEAT_TIMEOUT_MS = 4_000
const HEARTBEAT_IMPLEMENTATION = {}

export type BackendConnectionStatus = 'online' | 'offline'

interface HeartbeatCoordinator {
  clientId: string
  subscribers: number
  interval: ReturnType<typeof setInterval> | null
  delayedStop: ReturnType<typeof setTimeout> | null
  sent: number
  connection: BackendConnectionStatus
  lastSuccessfulAt: number | null
  listeners: Set<(status: BackendConnectionStatus) => void>
  implementation: object
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
  if (current?.clientId === clientId) {
    // Keep coordinators created by a prior HMR version compatible when fields
    // are added without creating a second heartbeat interval.
    current.connection ??= 'offline'
    current.lastSuccessfulAt ??= null
    current.listeners ??= new Set()
    if (current.implementation !== HEARTBEAT_IMPLEMENTATION) {
      if (current.interval) clearInterval(current.interval)
      if (current.delayedStop) clearTimeout(current.delayedStop)
      current.interval = null
      current.delayedStop = null
      current.implementation = HEARTBEAT_IMPLEMENTATION
    }
    return current
  }
  if (current?.interval) clearInterval(current.interval)
  if (current?.delayedStop) clearTimeout(current.delayedStop)
  const created: HeartbeatCoordinator = {
    clientId,
    subscribers: 0,
    interval: null,
    delayedStop: null,
    sent: 0,
    connection: 'offline',
    lastSuccessfulAt: null,
    listeners: new Set(),
    implementation: HEARTBEAT_IMPLEMENTATION,
  }
  registry[HEARTBEAT_COORDINATOR] = created
  return created
}

function updateBackendConnection(status: BackendConnectionStatus) {
  const coordinator = heartbeatCoordinator()
  if (status === 'online') coordinator.lastSuccessfulAt = Date.now()
  if (coordinator.connection === status) return
  coordinator.connection = status
  coordinator.listeners.forEach((listener) => listener(status))
}

function sendRuntimeHeartbeat(coordinator = heartbeatCoordinator()) {
  coordinator.sent += 1
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(new DOMException('Heartbeat timeout', 'TimeoutError')), HEARTBEAT_TIMEOUT_MS)
  return request<{ ok: true }>('/api/runtime/heartbeat', {
    method: 'POST',
    keepalive: true,
    signal: controller.signal,
    body: JSON.stringify({ clientId: coordinator.clientId }),
  }).finally(() => clearTimeout(timeout))
}

export function startRuntimeHeartbeat(
  intervalMs = 10_000,
  onConnectionChange?: (status: BackendConnectionStatus) => void,
) {
  const coordinator = heartbeatCoordinator()
  coordinator.subscribers += 1
  if (onConnectionChange) {
    coordinator.listeners.add(onConnectionChange)
    onConnectionChange(coordinator.connection)
  }
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
    if (onConnectionChange) coordinator.listeners.delete(onConnectionChange)
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
    connection: coordinator.connection,
    lastSuccessfulAt: coordinator.lastSuccessfulAt,
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json; charset=utf-8', Accept: 'application/json', ...init?.headers },
    })
  } catch (error) {
    updateBackendConnection('offline')
    throw error
  }
  if (!response.ok) {
    updateBackendConnection(response.status >= 500 ? 'offline' : 'online')
    const body = await response.json().catch(() => ({ error: response.statusText }))
    throw new Error(body.error || response.statusText)
  }
  updateBackendConnection('online')
  return response.json() as Promise<T>
}

async function requestBlob(url: string): Promise<Blob> {
  let response: Response
  try {
    response = await fetch(url, { headers: { Accept: 'application/pdf' } })
  } catch (error) {
    updateBackendConnection('offline')
    throw error
  }
  if (!response.ok) {
    updateBackendConnection(response.status >= 500 ? 'offline' : 'online')
    const body = await response.json().catch(() => ({ error: response.statusText }))
    throw new Error(body.error || response.statusText)
  }
  updateBackendConnection('online')
  return response.blob()
}

async function executeStreaming(
  runtimeId: string,
  cellId: string,
  code: string,
  onProgress?: (progress: ExecutionProgress) => void,
): Promise<ExecutionResult> {
  let response: Response
  try {
    response = await fetch('/api/runtime/execute-stream', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        Accept: 'application/x-ndjson',
      },
      body: JSON.stringify({ runtimeId, cellId, code }),
    })
  } catch (error) {
    updateBackendConnection('offline')
    throw error
  }

  if (!response.ok) {
    updateBackendConnection(response.status >= 500 ? 'offline' : 'online')
    const body = await response.json().catch(() => ({ error: response.statusText }))
    throw new Error(body.error || response.statusText)
  }
  if (!response.body) throw new Error('El servidor no devolvió un stream de ejecución')
  updateBackendConnection('online')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result: ExecutionResult | undefined

  const consumeLine = (line: string) => {
    if (!line.trim()) return
    const event = JSON.parse(line) as
      | { type: 'progress'; progress: ExecutionProgress }
      | { type: 'result'; result: ExecutionResult }
      | { type: 'error'; error: string }
    if (event.type === 'progress') onProgress?.(event.progress)
    else if (event.type === 'result') result = event.result
    else throw new Error(event.error || 'Falló la ejecución de Octave')
  }

  while (true) {
    const { done, value } = await reader.read()
    buffer += decoder.decode(value, { stream: !done })
    let newline = buffer.indexOf('\n')
    while (newline >= 0) {
      consumeLine(buffer.slice(0, newline))
      buffer = buffer.slice(newline + 1)
      newline = buffer.indexOf('\n')
    }
    if (done) break
  }
  consumeLine(buffer)
  if (!result) throw new Error('La ejecución terminó sin un resultado final')
  return result
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
    execute: (
      runtimeId: string,
      cellId: string,
      code: string,
      onProgress?: (progress: ExecutionProgress) => void,
    ) => executeStreaming(runtimeId, cellId, code, onProgress),
    interrupt: (runtimeId: string) => request<{ ok: true }>('/api/runtime/interrupt', { method: 'POST', body: JSON.stringify({ runtimeId }) }),
    inspect: (runtimeId: string, expression: string) => request<{ expression: string; display: string; type?: string; shape?: string }>('/api/runtime/inspect', { method: 'POST', body: JSON.stringify({ runtimeId, expression }) }),
    close: (runtimeId: string) => request<{ ok: true }>('/api/runtime/close', { method: 'POST', keepalive: true, body: JSON.stringify({ runtimeId }) }),
    heartbeat: () => sendRuntimeHeartbeat(),
  },
}
