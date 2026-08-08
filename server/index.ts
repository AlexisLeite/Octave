import express from 'express'
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, readdir, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { createRuntimeManager } from './runtime/index.ts'

const rootDir = path.resolve(process.cwd())
const projectsDir = path.join(rootDir, 'projects')
const port = Number(process.env.PORT || 4310)
const app = express()
const runtimes = createRuntimeManager()

app.use(express.json({ limit: '4mb' }))

function projectPath(input: unknown): { relative: string; absolute: string } {
  if (typeof input !== 'string' || input.includes('\0')) throw new Error('Ruta inválida')
  const normalized = input.replaceAll('\\', '/').replace(/^\/+|\/+$/g, '')
  if (!normalized || normalized.split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('Ruta inválida')
  }
  const absolute = path.resolve(projectsDir, ...normalized.split('/'))
  const prefix = `${projectsDir}${path.sep}`.toLowerCase()
  if (!absolute.toLowerCase().startsWith(prefix)) throw new Error('Ruta fuera de projects')
  return { relative: normalized, absolute }
}

function notebook(pathname: string) {
  return {
    version: 1 as const,
    id: randomUUID(),
    title: path.basename(pathname, '.octnb'),
    cells: [{ id: randomUUID(), kind: 'code' as const, source: '' }],
    outputs: {},
  }
}

function assertDocument(value: unknown): asserts value is ReturnType<typeof notebook> {
  const document = value as ReturnType<typeof notebook>
  if (!document || document.version !== 1 || typeof document.id !== 'string' || typeof document.title !== 'string' || !Array.isArray(document.cells)) {
    throw new Error('Documento inválido')
  }
  for (const cell of document.cells) {
    if (!cell || typeof cell.id !== 'string' || !['code', 'markdown'].includes(cell.kind) || typeof cell.source !== 'string') {
      throw new Error('Celda inválida')
    }
  }
  if (document.outputs !== undefined && (typeof document.outputs !== 'object' || document.outputs === null || Array.isArray(document.outputs))) {
    throw new Error('Resultados inválidos')
  }
}

async function listTree(directory = projectsDir, prefix = ''): Promise<Array<Record<string, unknown>>> {
  const entries = await readdir(directory, { withFileTypes: true })
  const visible = entries.filter((entry) => !entry.name.startsWith('.')).sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1
    return a.name.localeCompare(b.name, undefined, { numeric: true })
  })
  return Promise.all(visible.map(async (entry) => {
    const relative = prefix ? `${prefix}/${entry.name}` : entry.name
    if (entry.isDirectory()) {
      return { name: entry.name, path: relative, type: 'directory', children: await listTree(path.join(directory, entry.name), relative) }
    }
    return { name: entry.name, path: relative, type: 'file' }
  }))
}

app.get('/api/health', (_req, res) => res.json({ ok: true }))

app.get('/api/tree', async (_req, res, next) => {
  try { res.json({ nodes: await listTree() }) } catch (error) { next(error) }
})

app.get('/api/files', async (req, res, next) => {
  try {
    const target = projectPath(req.query.path)
    const document = JSON.parse(await readFile(target.absolute, 'utf8'))
    assertDocument(document)
    res.json({ document })
  } catch (error) { next(error) }
})

app.post('/api/files', async (req, res, next) => {
  try {
    let requestedPath = req.body.path
    if (req.body.type === 'file' && typeof requestedPath === 'string' && !requestedPath.endsWith('.octnb')) requestedPath += '.octnb'
    const target = projectPath(requestedPath)
    if (req.body.type === 'directory') {
      await mkdir(target.absolute, { recursive: false })
    } else if (req.body.type === 'file') {
      await mkdir(path.dirname(target.absolute), { recursive: true })
      await writeFile(target.absolute, `${JSON.stringify(notebook(target.relative), null, 2)}\n`, { encoding: 'utf8', flag: 'wx' })
    } else {
      throw new Error('Tipo inválido')
    }
    res.status(201).json({ path: target.relative })
  } catch (error) { next(error) }
})

app.put('/api/files', async (req, res, next) => {
  try {
    const target = projectPath(req.body.path)
    assertDocument(req.body.document)
    await mkdir(path.dirname(target.absolute), { recursive: true })
    const temp = `${target.absolute}.${randomUUID()}.tmp`
    await writeFile(temp, `${JSON.stringify(req.body.document, null, 2)}\n`, 'utf8')
    await rm(target.absolute, { force: true })
    await rename(temp, target.absolute)
    res.json({ savedAt: new Date().toISOString() })
  } catch (error) { next(error) }
})

app.delete('/api/files', async (req, res, next) => {
  try {
    const target = projectPath(req.query.path)
    await rm(target.absolute, { recursive: true, force: false })
    res.json({ ok: true })
  } catch (error) { next(error) }
})

app.post('/api/files/rename', async (req, res, next) => {
  try {
    const current = projectPath(req.body.path)
    let nextInput = req.body.nextPath
    if (current.relative.endsWith('.octnb') && typeof nextInput === 'string' && !nextInput.endsWith('.octnb')) nextInput += '.octnb'
    const target = projectPath(nextInput)
    await stat(current.absolute)
    await mkdir(path.dirname(target.absolute), { recursive: true })
    await rename(current.absolute, target.absolute)
    res.json({ path: target.relative })
  } catch (error) { next(error) }
})

app.post('/api/runtime/open', async (req, res, next) => {
  try { res.status(201).json(await runtimes.open(String(req.body.documentId || ''))) } catch (error) { next(error) }
})
app.post('/api/runtime/execute', async (req, res, next) => {
  try { res.json(await runtimes.execute(String(req.body.runtimeId || ''), { cellId: String(req.body.cellId || ''), code: String(req.body.code || '') })) } catch (error) { next(error) }
})
app.post('/api/runtime/inspect', async (req, res, next) => {
  try { res.json(await runtimes.inspect(String(req.body.runtimeId || ''), String(req.body.expression || ''))) } catch (error) { next(error) }
})
app.post('/api/runtime/close', async (req, res, next) => {
  try { await runtimes.close(String(req.body.runtimeId || '')); res.json({ ok: true }) } catch (error) { next(error) }
})

const distDir = path.join(rootDir, 'dist')
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(distDir))
  app.get(/.*/, (_req, res) => res.sendFile(path.join(distDir, 'index.html')))
}

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : 'Error desconocido'
  const status = /ENOENT/.test(message) ? 404 : /EEXIST/.test(message) ? 409 : 400
  res.status(status).json({ error: message })
})

await mkdir(projectsDir, { recursive: true })
const server = app.listen(port, '127.0.0.1', () => console.log(`Octave API http://127.0.0.1:${port}`))

async function shutdown() {
  await runtimes.closeAll()
  server.close()
}
process.once('SIGINT', shutdown)
process.once('SIGTERM', shutdown)
