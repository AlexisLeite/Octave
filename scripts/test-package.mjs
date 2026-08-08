import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import net from 'node:net'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const packageJson = JSON.parse(await readFile(path.join(repository, 'package.json'), 'utf8'))
const artifact = path.join(repository, 'package', `${packageJson.name}-${packageJson.version}.tgz`)
const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'octave-notebook-package-test-'))
const prefix = path.join(temporaryRoot, 'installation')
const interactivePrefix = path.join(temporaryRoot, 'interactive-installation')
const projects = path.join(temporaryRoot, 'projects')
const configHome = path.join(temporaryRoot, 'user-config')
const configFile = path.join(configHome, 'octave-notebook.json')
const isolatedEnvironment = {
  ...process.env,
  HOME: configHome,
  USERPROFILE: configHome,
  APPDATA: path.join(configHome, 'appdata'),
  LOCALAPPDATA: path.join(configHome, 'localappdata'),
  XDG_CONFIG_HOME: path.join(configHome, 'xdg'),
}
let application = null
let applicationOutput = ''

try {
  await run(process.execPath, [process.env.npm_execpath, 'package'], repository, 'creación del paquete', true)
  await stat(artifact)
  const packageFiles = (await readdir(path.join(repository, 'package'))).sort()
  if (packageFiles.length !== 2 || packageFiles[0] !== 'install.mjs' || packageFiles[1] !== path.basename(artifact)) {
    throw new Error(`/package debe contener solamente install.mjs y un tgz; contiene ${packageFiles.join(', ')}`)
  }
  const installer = path.join(repository, 'package', 'install.mjs')
  await run(process.execPath, [installer, '--help'], temporaryRoot, 'ayuda del instalador', false, isolatedEnvironment)
  await run(process.execPath, [installer, '--prefix', prefix], temporaryRoot, 'instalación no interactiva', false, isolatedEnvironment)

  await mkdir(interactivePrefix, { recursive: true })
  await writeFile(path.join(interactivePrefix, 'existing.txt'), 'confirmación requerida\n', 'utf8')
  await runInteractiveInstaller(installer, interactivePrefix, isolatedEnvironment)
  await stat(path.join(interactivePrefix, 'node_modules', packageJson.name, 'bin', 'octave-notebook.cjs'))

  const cli = path.join(prefix, 'node_modules', packageJson.name, 'bin', 'octave-notebook.cjs')
  await stat(cli)
  await run(process.execPath, [cli, '--help'], temporaryRoot, 'ayuda del CLI', false, isolatedEnvironment)
  await stat(path.join(prefix, 'node_modules', packageJson.name, 'web', 'index.html'))
  await stat(path.join(prefix, 'node_modules', packageJson.name, 'dist')).then(
    () => { throw new Error('El paquete contiene un dist anidado inesperado.') },
    (error) => { if (error?.code !== 'ENOENT') throw error },
  )
  await run(process.execPath, [cli, 'setup', '--config', configFile], temporaryRoot, 'setup de Octave', false, isolatedEnvironment)
  await stat(configFile)
  await run(process.execPath, [cli, 'doctor', '--config', configFile], temporaryRoot, 'doctor de Octave', false, isolatedEnvironment)
  const configuredOctave = JSON.parse(await readFile(configFile, 'utf8')).octavePath
  const overrideConfig = path.join(configHome, 'octave-override.json')
  await run(process.execPath, [cli, 'doctor', '--config', overrideConfig, '--octave-path', configuredOctave], temporaryRoot, 'override explícito de Octave', false, isolatedEnvironment)
  if (!JSON.parse(await readFile(overrideConfig, 'utf8')).octavePath) throw new Error('doctor no registró --octave-path en la configuración aislada.')
  await run(process.execPath, [cli, 'doctor', '--config', overrideConfig], temporaryRoot, 'reuso del override de Octave', false, isolatedEnvironment)
  const port = await reserveFreePort()
  application = spawn(process.execPath, [cli, 'start', '--host', '127.0.0.1', '--port', String(port), '--projects', projects, '--config', configFile], {
    cwd: temporaryRoot,
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: isolatedEnvironment,
  })
  application.stdout.on('data', (chunk) => { applicationOutput += chunk.toString() })
  application.stderr.on('data', (chunk) => { applicationOutput += chunk.toString() })

  const baseUrl = `http://127.0.0.1:${port}`
  await waitForHealth(`${baseUrl}/api/health`, application)
  const health = await getJson(`${baseUrl}/api/health`)
  if (health.ok !== true) throw new Error(`Health inesperado: ${JSON.stringify(health)}`)

  const tree = await getJson(`${baseUrl}/api/tree`)
  if (!Array.isArray(tree.nodes) || tree.nodes.length === 0) throw new Error('La API instalada no listó los proyectos de ejemplo.')

  const frontend = await fetch(baseUrl)
  const html = await frontend.text()
  if (!frontend.ok || !html.includes('<div id="root"></div>')) throw new Error(`Frontend instalado inválido (${frontend.status}).`)

  const runtimeResponse = await fetch(`${baseUrl}/api/runtime/open`, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ documentId: 'package-smoke-test', clientId: 'package-smoke-client' }),
  })
  const runtimeBody = await runtimeResponse.json()
  if (runtimeResponse.ok) {
    const execution = await postJson(`${baseUrl}/api/runtime/execute`, { runtimeId: runtimeBody.runtimeId, cellId: 'smoke', code: 'disp(6 * 7)' })
    if (execution.error || !/^42\s*$/m.test(execution.stdout)) throw new Error(`Octave no ejecutó el smoke test: ${JSON.stringify(execution)}`)
    await postJson(`${baseUrl}/api/runtime/close`, { runtimeId: runtimeBody.runtimeId })
    console.log('Octave local: ejecución verificada (42).')
  } else if (!/Octave|octave-cli/i.test(String(runtimeBody.error))) {
    throw new Error(`Error inesperado al abrir Octave: ${JSON.stringify(runtimeBody)}`)
  } else {
    console.log('Octave local no disponible; se validó el diagnóstico de descubrimiento.')
  }

  console.log(`Paquete npm instalado y probado en puerto TCP aleatorio ${port}.`)
} catch (error) {
  const detail = applicationOutput.trim() ? `\n\nSalida de la aplicación instalada:\n${applicationOutput.trim()}` : ''
  throw new Error(`${error instanceof Error ? error.message : String(error)}${detail}`, { cause: error })
} finally {
  if (application && application.exitCode === null) await terminate(application)
  await rm(temporaryRoot, { recursive: true, force: true, maxRetries: 8, retryDelay: 150 })
}

async function reserveFreePort() {
  const server = net.createServer()
  await new Promise((resolveListen, rejectListen) => {
    server.once('error', rejectListen)
    server.listen(0, '127.0.0.1', resolveListen)
  })
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('No se pudo reservar un puerto TCP.')
  const port = address.port
  await new Promise((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()))
  return port
}

async function waitForHealth(url, child) {
  const deadline = Date.now() + 30_000
  let lastError = 'sin respuesta'
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error(`La aplicación instalada terminó antes del readiness (código ${child.exitCode}).`)
    try {
      const response = await fetch(url)
      if (response.ok) return
      lastError = `HTTP ${response.status}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 150))
  }
  throw new Error(`Timeout esperando readiness: ${lastError}`)
}

async function getJson(url) {
  const response = await fetch(url)
  const body = await response.json()
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status} ${JSON.stringify(body)}`)
  return body
}

async function postJson(url, value) {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json; charset=utf-8' }, body: JSON.stringify(value) })
  const body = await response.json()
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status} ${JSON.stringify(body)}`)
  return body
}

function run(command, args, cwd, label, inherit = false, env = process.env) {
  if (!command || args.some((argument) => argument === undefined)) return Promise.reject(new Error(`Comando no disponible para ${label}.`))
  return new Promise((resolveRun, rejectRun) => {
    let output = ''
    const child = spawn(command, args, { cwd, windowsHide: true, env, stdio: inherit ? 'inherit' : ['ignore', 'pipe', 'pipe'] })
    child.stdout?.on('data', (chunk) => { output += chunk.toString() })
    child.stderr?.on('data', (chunk) => { output += chunk.toString() })
    child.once('error', rejectRun)
    child.once('exit', (code) => code === 0 ? resolveRun() : rejectRun(new Error(`${label} falló con código ${code}${output.trim() ? `: ${output.trim()}` : ''}.`)))
  })
}

function runInteractiveInstaller(installer, selectedPrefix, env) {
  return new Promise((resolveRun, rejectRun) => {
    let output = ''
    const child = spawn(process.execPath, [installer], { cwd: temporaryRoot, windowsHide: true, env, stdio: ['pipe', 'pipe', 'pipe'] })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      rejectRun(new Error(`La instalación interactiva excedió 45 segundos: ${output}`))
    }, 45_000)
    let sentPrefix = false
    let sentConfirmation = false
    child.stdout.on('data', (chunk) => {
      output += chunk.toString()
      if (!sentPrefix && output.includes('Directorio de instalaci')) {
        sentPrefix = true
        child.stdin.write(`${selectedPrefix}\n`)
      }
      if (!sentConfirmation && output.includes('Continuar?')) {
        sentConfirmation = true
        child.stdin.end('y\n')
      }
    })
    child.stderr.on('data', (chunk) => { output += chunk.toString() })
    child.once('error', (error) => { clearTimeout(timer); rejectRun(error) })
    child.once('exit', (code) => {
      clearTimeout(timer)
      if (code === 0) resolveRun()
      else rejectRun(new Error(`Instalación interactiva falló con código ${code}: ${output.trim()}`))
    })
  })
}

async function terminate(child) {
  child.kill('SIGTERM')
  await Promise.race([
    new Promise((resolveExit) => child.once('exit', resolveExit)),
    new Promise((resolveWait) => setTimeout(resolveWait, 3_000)),
  ])
  if (child.exitCode === null) child.kill('SIGKILL')
}
