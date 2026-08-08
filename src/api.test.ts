import { afterEach, describe, expect, it, vi } from 'vitest'
import { api, runtimeHeartbeatStatus, startRuntimeHeartbeat, type BackendConnectionStatus } from './api'

const coordinatorKey = Symbol.for('octave.runtime-heartbeat.v1')

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  delete (globalThis as unknown as Record<PropertyKey, unknown>)[coordinatorKey]
})

describe('backend connection heartbeat', () => {
  it('reports a confirmed backend as online and a network error as offline', async () => {
    vi.useFakeTimers()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ ok: true }),
    } as Response)
    vi.stubGlobal('fetch', fetchMock)
    const statuses: BackendConnectionStatus[] = []

    const stop = startRuntimeHeartbeat(10_000, (status) => statuses.push(status))
    await Promise.resolve()
    await Promise.resolve()
    await Promise.resolve()

    expect(statuses).toEqual(['offline', 'online'])
    expect(runtimeHeartbeatStatus().connection).toBe('online')

    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    await expect(api.tree()).rejects.toThrow('Failed to fetch')
    expect(statuses.at(-1)).toBe('offline')
    expect(runtimeHeartbeatStatus().connection).toBe('offline')

    stop()
    vi.advanceTimersByTime(1_000)
    expect(runtimeHeartbeatStatus().active).toBe(false)
  })
})

describe('streaming Octave execution', () => {
  it('delivers partial output before the final result', async () => {
    const encoder = new TextEncoder()
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoder.encode('{"type":"progress","progress":{"cellId":"cell-1","stdout":"1\\n","stderr":"","durationMs":12,"timedOut":false}}\n'))
        controller.enqueue(encoder.encode('{"type":"progress","progress":{"cellId":"cell-1","stdout":"1\\n2\\n","stderr":"","durationMs":24,"timedOut":false}}\n'))
        controller.enqueue(encoder.encode('{"type":"result","result":{"cellId":"cell-1","stdout":"1\\n2","stderr":"","durationMs":25,"error":null}}\n'))
        controller.close()
      },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, {
      status: 200,
      headers: { 'Content-Type': 'application/x-ndjson' },
    })))
    const progress: string[] = []

    const result = await api.runtime.execute('runtime-1', 'cell-1', 'disp(1)', (event) => {
      progress.push(event.stdout)
    })

    expect(progress).toEqual(['1\n', '1\n2\n'])
    expect(result.stdout).toBe('1\n2')
  })
})
