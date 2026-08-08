#!/usr/bin/env node
import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createInterface } from 'node:readline/promises'
import { Command } from 'commander'

const packageDirectory = path.dirname(fileURLToPath(import.meta.url))
const program = new Command()
  .name('install.mjs')
  .description('Instala Octave Notebook desde el paquete npm contiguo')
  .version(__PACKAGE_VERSION__)
  .option('--prefix <directorio>', 'Directorio de instalación')
  .option('--force', 'Permite instalar en un directorio no vacío')
  .showHelpAfterError()

program.parse()
await install(program.opts()).catch((error) => {
  process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})

async function install(options) {
  const archives = readdirSync(packageDirectory).filter((name) => name.endsWith('.tgz'))
  if (archives.length !== 1) throw new Error(`Se esperaba exactamente un archivo .tgz junto a install.mjs; se encontraron ${archives.length}.`)
  let prefix = options.prefix ? path.resolve(options.prefix) : null
  let interactive = false
  let answers
  try {
    if (!prefix) {
      interactive = true
      answers = createInterface({ input: process.stdin, output: process.stdout })
      const fallback = defaultPrefix()
      const response = await ask(answers, `Directorio de instalación [${fallback}]: `)
      prefix = path.resolve(response.trim() || fallback)
    }

    const nonEmpty = existsSync(prefix) && readdirSync(prefix).length > 0
    if (nonEmpty && !options.force) {
      if (!interactive) throw new Error('El directorio de instalación no está vacío. Use --force para continuar.')
      const confirmation = await ask(answers, 'El directorio no está vacío. ¿Continuar? [y/N]: ')
      if (!/^y(?:es)?$|^s(?:í|i)?$/i.test(confirmation.trim())) throw new Error('Instalación cancelada.')
    }

    const archive = path.join(packageDirectory, archives[0])
    await runNpm(['install', '--prefix', prefix, '--ignore-scripts', '--no-audit', '--no-fund', archive])
    process.stdout.write(`Octave Notebook instalado en ${prefix}\n`)
    process.stdout.write(`Ejecute: npx --prefix "${prefix}" octave-notebook setup\n`)
  } finally {
    answers?.close()
  }
}

function defaultPrefix() {
  if (process.platform === 'win32') return path.join(process.env.LOCALAPPDATA || path.join(homedir(), 'AppData', 'Local'), 'Octave Notebook')
  return path.join(homedir(), '.local', 'share', 'octave-notebook')
}

async function ask(readline, prompt) {
  if (process.stdin.destroyed) throw new Error('No hay entrada disponible para completar la instalación interactiva. Use --prefix.')
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 30_000)
  try {
    return await readline.question(prompt, { signal: controller.signal })
  } catch (error) {
    if (error?.name === 'AbortError') throw new Error('Tiempo agotado esperando una respuesta. Use --prefix para instalar sin interacción.')
    throw new Error('No se pudo leer la respuesta. Use --prefix para instalar sin interacción.')
  } finally {
    clearTimeout(timer)
  }
}

function runNpm(args) {
  return new Promise((resolveRun, rejectRun) => {
    const invocation = npmInvocation(args)
    const child = spawn(invocation.command, invocation.args, { stdio: 'inherit', windowsHide: true })
    child.once('error', rejectRun)
    child.once('exit', (code) => code === 0 ? resolveRun() : rejectRun(new Error(`npm install terminó con código ${code}.`)))
  })
}

function npmInvocation(args) {
  if (process.platform !== 'win32') return { command: 'npm', args }
  return { command: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', 'npm.cmd', ...args] }
}
