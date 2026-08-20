import { spawn } from 'node:child_process'
import { access } from 'node:fs/promises'
import { constants } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { devShimRelativePath, resolveDevCommand } from './devCommand.mjs'

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const shimRelative = devShimRelativePath(process.platform)
const shimPath = await findShim(path.join(repository, shimRelative))
const { command, args, usesMonitor } = resolveDevCommand({ shimPath })

if (!usesMonitor) {
  console.error(`[dev] Sin Console Monitor: no se encontró ${shimRelative}. Ejecutando dev:raw.`)
}

process.exit(await run(command, args, repository))

async function findShim(candidate) {
  return access(candidate, constants.X_OK).then(() => candidate, () => null)
}

function run(executable, executableArgs, cwd) {
  return new Promise((resolveRun, rejectRun) => {
    const windows = process.platform === 'win32'
    const spawned = windows ? (process.env.ComSpec || 'cmd.exe') : executable
    const spawnedArgs = windows ? ['/d', '/s', '/c', executable, ...executableArgs] : executableArgs
    const child = spawn(spawned, spawnedArgs, { cwd, windowsHide: true, stdio: 'inherit' })
    const forward = (signal) => () => child.kill(signal)
    const signals = ['SIGINT', 'SIGTERM']

    for (const signal of signals) {
      process.on(signal, forward(signal))
    }

    child.once('error', rejectRun)
    child.once('exit', (code, signal) => resolveRun(signal ? 1 : code ?? 1))
  })
}
