import express from 'express'
import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { lstat, mkdir, readFile, readdir, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { renderNotebookPdf } from './notebookPdf.ts'
import { createRuntimeManager } from './runtime/index.ts'

const rootDir = path.resolve(process.env.OCTAVE_NOTEBOOK_ROOT || process.cwd())
const projectsDir = path.resolve(process.env.OCTAVE_NOTEBOOK_PROJECTS_DIR || path.join(rootDir, 'projects'))
const port = Number(process.env.PORT || 4310)
const host = process.env.HOST || '127.0.0.1'
if (!Number.isInteger(port) || port < 0 || port > 65_535) throw new Error(`Puerto inválido: ${process.env.PORT}`)
const app = express()
const runtimes = createRuntimeManager()

app.use('/api', (_req, res, next) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  next()
})
app.use(express.json({
  limit: '4mb',
  verify: (_req, _res, bytes, encoding) => {
    if (!['utf-8', 'utf8'].includes(encoding.toLowerCase())) throw new Error('La API solamente acepta JSON UTF-8')
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    } catch {
      throw new Error('El cuerpo JSON contiene bytes UTF-8 inválidos')
    }
  },
}))

async function readUtf8(filePath: string) {
  const bytes = await readFile(filePath)
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
}

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

function isWithin(root: string, candidate: string, allowRoot = false) {
  const relative = path.relative(root, candidate)
  return (allowRoot || relative !== '') && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative)
}

function sameFilesystemPath(first: string, second: string) {
  return process.platform === 'win32' ? first.toLowerCase() === second.toLowerCase() : first === second
}

async function canonicalProjectsDir() {
  return realpath(projectsDir)
}

async function assertDirectoryConfined(directory: string) {
  const [root, resolved] = await Promise.all([canonicalProjectsDir(), realpath(directory)])
  if (!isWithin(root, resolved, true)) throw new Error('Ruta fuera de projects')
  if (!(await stat(resolved)).isDirectory()) throw new Error('El directorio de destino no es válido')
  return resolved
}

async function resolveExistingFile(target: ReturnType<typeof projectPath>) {
  const [root, resolved] = await Promise.all([canonicalProjectsDir(), realpath(target.absolute)])
  if (!isWithin(root, resolved)) throw new Error('Ruta fuera de projects')
  if (!(await stat(resolved)).isFile()) throw new Error('El recurso solicitado no es un archivo')
  return resolved
}

function inlineDisposition(filename: string) {
  const fallback = filename.replace(/[^\x20-\x7e]|["\\]/g, '_')
  const encoded = encodeURIComponent(filename).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)
  return `inline; filename="${fallback}"; filename*=UTF-8''${encoded}`
}

function attachmentDisposition(filename: string) {
  return inlineDisposition(filename).replace(/^inline;/, 'attachment;')
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
  if (JSON.stringify(document).includes('\uFFFD')) {
    throw new Error('El documento contiene caracteres UTF-8 inválidos')
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

app.get('/api/assets', async (req, res, next) => {
  try {
    const target = projectPath(req.query.path)
    if (path.extname(target.absolute).toLowerCase() !== '.pdf') throw new Error('Tipo de archivo no permitido')
    const resolved = await resolveExistingFile(target)
    res.type('application/pdf')
    res.setHeader('Content-Disposition', inlineDisposition(path.basename(target.relative)))
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.sendFile(resolved, { acceptRanges: true, dotfiles: 'deny', lastModified: true }, (error) => {
      if (!error) return
      if (res.headersSent) res.destroy(error)
      else next(error)
    })
  } catch (error) { next(error) }
})

app.get('/api/files', async (req, res, next) => {
  try {
    const target = projectPath(req.query.path)
    const absolutePath = await resolveExistingFile(target)
    const document = JSON.parse(await readUtf8(absolutePath))
    assertDocument(document)
    res.json({ document, absolutePath })
  } catch (error) { next(error) }
})

app.get('/api/notebooks/pdf', async (req, res, next) => {
  try {
    const target = projectPath(req.query.path)
    if (path.extname(target.absolute).toLowerCase() !== '.octnb') throw new Error('El recurso no es un cuaderno')
    const absolutePath = await resolveExistingFile(target)
    const document = JSON.parse(await readUtf8(absolutePath))
    assertDocument(document)
    const pdf = await renderNotebookPdf(document)
    const filename = `${path.basename(target.relative, '.octnb')}.pdf`
    res.type('application/pdf')
    res.setHeader('Content-Disposition', attachmentDisposition(filename))
    res.setHeader('Content-Length', String(pdf.length))
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.send(pdf)
  } catch (error) { next(error) }
})

app.post('/api/files', async (req, res, next) => {
  try {
    let requestedPath = req.body.path
    if (req.body.type === 'file' && typeof requestedPath === 'string' && !requestedPath.toLowerCase().endsWith('.octnb')) requestedPath += '.octnb'
    const target = projectPath(requestedPath)
    await assertDirectoryConfined(path.dirname(target.absolute))
    if (req.body.type === 'directory') {
      await mkdir(target.absolute, { recursive: false })
    } else if (req.body.type === 'file') {
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
    await assertDirectoryConfined(path.dirname(target.absolute))
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
    await assertDirectoryConfined(path.dirname(target.absolute))
    await rm(target.absolute, { recursive: true, force: false })
    res.json({ ok: true })
  } catch (error) { next(error) }
})

app.post('/api/files/rename', async (req, res, next) => {
  try {
    const current = projectPath(req.body.path)
    let nextInput = req.body.nextPath
    if (current.relative.toLowerCase().endsWith('.octnb') && typeof nextInput === 'string' && !nextInput.toLowerCase().endsWith('.octnb')) nextInput += '.octnb'
    const target = projectPath(nextInput)
    const currentEntry = await lstat(current.absolute)
    await Promise.all([
      assertDirectoryConfined(path.dirname(current.absolute)),
      assertDirectoryConfined(path.dirname(target.absolute)),
    ])
    if (current.absolute === target.absolute) return res.json({ path: target.relative })
    if (currentEntry.isDirectory() && !sameFilesystemPath(current.absolute, target.absolute) && isWithin(current.absolute, target.absolute, true)) {
      throw new Error('No se puede mover un directorio dentro de sí mismo')
    }
    if (!sameFilesystemPath(current.absolute, target.absolute)) {
      try {
        await lstat(target.absolute)
        throw new Error('EEXIST: ya existe un archivo o directorio en el destino')
      } catch (error) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'ENOENT') throw error
      }
    }
    await rename(current.absolute, target.absolute)
    res.json({ path: target.relative })
  } catch (error) { next(error) }
})

app.post('/api/runtime/open', async (req, res, next) => {
  try {
    res.status(201).json(await runtimes.open(
      String(req.body.documentId || ''),
      String(req.body.clientId || ''),
    ))
  } catch (error) { next(error) }
})
app.post('/api/runtime/execute', async (req, res, next) => {
  try { res.json(await runtimes.execute(String(req.body.runtimeId || ''), { cellId: String(req.body.cellId || ''), code: String(req.body.code || '') })) } catch (error) { next(error) }
})
app.post('/api/runtime/execute-stream', async (req, res) => {
  res.status(200)
  res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  let connected = true
  res.once('close', () => { connected = false })
  const send = (event: unknown) => {
    if (connected && !res.writableEnded) res.write(`${JSON.stringify(event)}\n`)
  }

  try {
    const result = await runtimes.execute(
      String(req.body.runtimeId || ''),
      { cellId: String(req.body.cellId || ''), code: String(req.body.code || '') },
      (progress) => send({ type: 'progress', progress }),
    )
    send({ type: 'result', result })
  } catch (error) {
    send({ type: 'error', error: error instanceof Error ? error.message : String(error) })
  } finally {
    if (!res.writableEnded) res.end()
  }
})
app.post('/api/runtime/inspect', async (req, res, next) => {
  try { res.json(await runtimes.inspect(String(req.body.runtimeId || ''), String(req.body.expression || ''))) } catch (error) { next(error) }
})
app.post('/api/runtime/interrupt', async (req, res, next) => {
  try { await runtimes.interrupt(String(req.body.runtimeId || '')); res.json({ ok: true }) } catch (error) { next(error) }
})
app.post('/api/runtime/close', async (req, res, next) => {
  try { await runtimes.close(String(req.body.runtimeId || '')); res.json({ ok: true }) } catch (error) { next(error) }
})
app.post('/api/runtime/heartbeat', (req, res, next) => {
  try {
    runtimes.heartbeat(String(req.body.clientId || ''))
    res.json({ ok: true })
  } catch (error) { next(error) }
})
app.get('/api/runtime/status', (_req, res) => {
  res.json({ idleTimeoutMs: 10 * 60_000, clientTimeoutMs: 30_000, runtimes: runtimes.status() })
})

const distDir = path.resolve(process.env.OCTAVE_NOTEBOOK_WEB_DIR || path.join(rootDir, 'dist'))
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(distDir))
  app.get(/.*/, (_req, res) => res.sendFile(path.join(distDir, 'index.html')))
}

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = error instanceof Error ? error.message : 'Error desconocido'
  const status = /ENOENT/.test(message) ? 404 : /EEXIST/.test(message) ? 409 : 400
  res.status(status).json({ error: message })
})

mkdirSync(projectsDir, { recursive: true })
const server = app.listen(port, host, () => {
  const address = server.address()
  const listeningPort = typeof address === 'object' && address ? address.port : port
  console.log(`Octave API http://${host}:${listeningPort}`)
})

let shuttingDown = false
async function shutdown() {
  if (shuttingDown) return
  shuttingDown = true
  server.close()
  await runtimes.closeAll()
}
process.once('SIGINT', () => { void shutdown() })
process.once('SIGTERM', () => { void shutdown() })
