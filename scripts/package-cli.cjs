#!/usr/bin/env node
'use strict'

const { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } = require('node:fs')
const { homedir } = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const { Command, InvalidArgumentError } = require('commander')

const OCTAVE_DOWNLOAD = 'https://octave.org/download'
const packageRoot = path.resolve(__dirname, '..')
const program = new Command()
  .name('octave-notebook')
  .description('Notebook IDE local para GNU Octave')
  .version(__PACKAGE_VERSION__)
  .showHelpAfterError()

withCommonOptions(program.command('start', { isDefault: true }).description('Inicia la aplicación'))
  .option('--host <dirección>', 'Dirección de escucha', '127.0.0.1')
  .option('--port <puerto>', 'Puerto TCP', parsePort, 4310)
  .option('--projects <directorio>', 'Directorio de cuadernos')
  .action(start)

withCommonOptions(program.command('doctor').description('Verifica Node, configuración y Octave'))
  .action(doctor)

withCommonOptions(program.command('setup').description('Configura o instala GNU Octave'))
  .action(setup)

program.parseAsync().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})

function withCommonOptions(command) {
  return command
    .option('--config <archivo>', 'Archivo de configuración', defaultConfigPath())
    .option('--octave-path <ejecutable>', 'Ruta de octave-cli')
}

async function start(options) {
  const config = readConfig(options.config)
  const octave = await configuredOctave(options.octavePath, config)
  if (options.octavePath) writeConfig(options.config, { ...config, octavePath: octave })

  const projects = path.resolve(options.projects || process.env.OCTAVE_NOTEBOOK_PROJECTS_DIR || path.join(process.cwd(), 'projects'))
  seedProjects(projects)
  process.env.NODE_ENV = 'production'
  process.env.HOST = options.host
  process.env.PORT = String(options.port)
  process.env.OCTAVE_NOTEBOOK_ROOT = packageRoot
  process.env.OCTAVE_NOTEBOOK_PROJECTS_DIR = projects
  process.env.OCTAVE_NOTEBOOK_WEB_DIR = path.join(packageRoot, 'web')
  if (octave) process.env.OCTAVE_CLI_PATH = octave
  require(path.join(packageRoot, 'app', 'server.cjs'))
}

async function doctor(options) {
  const config = readConfig(options.config)
  const octave = await configuredOctave(options.octavePath, config)
  if (!octave) throw new Error(`Octave no fue encontrado. Ejecute "octave-notebook setup" o visite ${OCTAVE_DOWNLOAD}`)
  const version = runCapture(octave, ['--version'])
  process.stdout.write(`Node ${process.version}\nOctave ${firstLine(version)}\nEjecutable ${octave}\nConfig ${path.resolve(options.config)}\n`)
}

async function setup(options) {
  const config = readConfig(options.config)
  let octave = await configuredOctave(options.octavePath, config)
  if (!octave) {
    const installer = packageManagerCommand()
    if (!installer) throw new Error(`No se encontró un gestor de paquetes compatible. Instale GNU Octave desde ${OCTAVE_DOWNLOAD}`)
    process.stdout.write(`Instalando GNU Octave con ${installer.label}...\n`)
    const result = spawnSync(installer.command, installer.args, { stdio: 'inherit', windowsHide: true })
    if (result.error || result.status !== 0) {
      throw new Error(`La instalación con ${installer.label} falló. Instale GNU Octave desde ${OCTAVE_DOWNLOAD}`)
    }
    octave = await discoverOctave()
  }
  if (!octave) throw new Error(`Octave no pudo validarse después de la instalación. Consulte ${OCTAVE_DOWNLOAD}`)
  writeConfig(options.config, { ...config, octavePath: octave })
  process.stdout.write(`Octave configurado: ${octave}\nConfig: ${path.resolve(options.config)}\n`)
}

async function configuredOctave(explicit, config) {
  if (explicit) {
    if (canRun(explicit)) return path.resolve(explicit)
    throw new Error(`El ejecutable indicado no es válido: ${explicit}`)
  }
  if (config.octavePath) {
    if (canRun(config.octavePath)) return config.octavePath
    throw new Error(`Octave configurado ya no está disponible: ${config.octavePath}. Ejecute setup nuevamente.`)
  }
  return discoverOctave()
}

async function discoverOctave() {
  for (const command of process.platform === 'win32' ? ['octave-cli.exe', 'octave-cli', 'octave.exe', 'octave'] : ['octave-cli', 'octave']) {
    if (canRun(command)) return command
  }
  if (process.platform === 'win32') {
    const roots = [process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'GNU Octave'), process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'GNU Octave'), 'C:\\Octave'].filter(Boolean)
    for (const root of roots) {
      if (!existsSync(root)) continue
      for (const entry of readdirSync(root, { withFileTypes: true }).filter((item) => item.isDirectory()).sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }))) {
        for (const relative of ['mingw64/bin/octave-cli.exe', 'usr/bin/octave-cli.exe']) {
          const candidate = path.join(root, entry.name, relative)
          if (canRun(candidate)) return candidate
        }
      }
    }
  }
  return null
}

function packageManagerCommand() {
  if (process.platform === 'win32' && commandExists('winget')) return { label: 'winget', command: 'winget', args: ['install', '--id', 'GNU.Octave', '--exact', '--accept-package-agreements', '--accept-source-agreements'] }
  if (process.platform === 'darwin' && commandExists('brew')) return { label: 'Homebrew', command: 'brew', args: ['install', 'octave'] }
  if (process.platform === 'linux') {
    const elevated = typeof process.getuid === 'function' && process.getuid() !== 0 && commandExists('sudo') ? ['sudo'] : []
    for (const candidate of [
      ['apt-get', ['install', '-y', 'octave']],
      ['dnf', ['install', '-y', 'octave']],
      ['pacman', ['-S', '--needed', '--noconfirm', 'octave']],
      ['zypper', ['--non-interactive', 'install', 'octave']],
    ]) {
      if (commandExists(candidate[0])) return elevated.length ? { label: candidate[0], command: elevated[0], args: [candidate[0], ...candidate[1]] } : { label: candidate[0], command: candidate[0], args: candidate[1] }
    }
  }
  return null
}

function defaultConfigPath() {
  if (process.platform === 'win32') return path.join(process.env.APPDATA || path.join(homedir(), 'AppData', 'Roaming'), 'Octave Notebook', 'config.json')
  if (process.platform === 'darwin') return path.join(homedir(), 'Library', 'Application Support', 'Octave Notebook', 'config.json')
  return path.join(process.env.XDG_CONFIG_HOME || path.join(homedir(), '.config'), 'octave-notebook', 'config.json')
}

function readConfig(filename) {
  if (!existsSync(filename)) return {}
  try {
    const config = JSON.parse(readFileSync(filename, 'utf8'))
    if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('objeto JSON esperado')
    return config
  } catch (error) {
    throw new Error(`Configuración inválida en ${filename}: ${error.message}`)
  }
}

function writeConfig(filename, config) {
  const absolute = path.resolve(filename)
  mkdirSync(path.dirname(absolute), { recursive: true })
  writeFileSync(absolute, `${JSON.stringify(config, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 })
}

function seedProjects(projects) {
  mkdirSync(projects, { recursive: true })
  if (readdirSync(projects).length !== 0) return
  const examples = path.join(packageRoot, 'example-projects')
  if (existsSync(examples)) cpSync(examples, projects, { recursive: true, force: false })
}

function canRun(executable) {
  const result = spawnSync(executable, ['--version'], { stdio: 'ignore', windowsHide: true, timeout: 5000 })
  return !result.error && result.status === 0
}

function commandExists(command) {
  const checker = process.platform === 'win32' ? 'where.exe' : 'sh'
  const args = process.platform === 'win32' ? [command] : ['-c', 'command -v "$1" >/dev/null 2>&1', 'sh', command]
  const result = spawnSync(checker, args, { stdio: 'ignore', windowsHide: true })
  return !result.error && result.status === 0
}

function runCapture(command, args) {
  const result = spawnSync(command, args, { encoding: 'utf8', windowsHide: true, timeout: 5000 })
  if (result.error || result.status !== 0) throw new Error(`No se pudo ejecutar ${command}.`)
  return result.stdout || result.stderr || ''
}

function firstLine(value) { return value.trim().split(/\r?\n/, 1)[0] }
function parsePort(value) {
  const port = Number(value)
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new InvalidArgumentError(`Puerto inválido: ${value}`)
  return port
}
