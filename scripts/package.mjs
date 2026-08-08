import { spawn } from 'node:child_process'
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const repository = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const sourcePackage = JSON.parse(await readFile(path.join(repository, 'package.json'), 'utf8'))
const artifactName = `${sourcePackage.name}-${sourcePackage.version}.tgz`
const packageOutput = path.join(repository, 'package')
const artifactPath = path.join(packageOutput, artifactName)
const stagingParent = await mkdtemp(path.join(tmpdir(), 'octave-notebook-package-'))
const staging = path.join(stagingParent, 'package')

try {
  await stat(path.join(repository, 'dist', 'index.html')).catch(() => {
    throw new Error('Falta dist/index.html. Ejecute pnpm build antes de empaquetar.')
  })

  await rm(packageOutput, { recursive: true, force: true })
  await mkdir(packageOutput, { recursive: true })
  await mkdir(path.join(staging, 'app'), { recursive: true })
  await cp(path.join(repository, 'dist'), path.join(staging, 'web'), {
    recursive: true,
    filter: (source) => !source.toLowerCase().endsWith('.tgz') && !source.toLowerCase().endsWith('.sha256'),
  })
  await cp(path.join(repository, 'projects'), path.join(staging, 'example-projects'), { recursive: true })

  await build({
    entryPoints: [path.join(repository, 'server', 'index.ts')],
    outfile: path.join(staging, 'app', 'server.cjs'),
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    sourcemap: false,
    legalComments: 'none',
  })

  await mkdir(path.join(staging, 'bin'), { recursive: true })
  await build({
    entryPoints: [path.join(repository, 'scripts', 'package-cli.cjs')],
    outfile: path.join(staging, 'bin', 'octave-notebook.cjs'),
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    legalComments: 'none',
    define: { __PACKAGE_VERSION__: JSON.stringify(sourcePackage.version) },
  })
  await build({
    entryPoints: [path.join(repository, 'scripts', 'install-template.mjs')],
    outfile: path.join(packageOutput, 'install.mjs'),
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    legalComments: 'none',
    define: { __PACKAGE_VERSION__: JSON.stringify(sourcePackage.version) },
  })
  await writeFile(path.join(staging, 'README.md'), `# Octave Notebook\n\nRequiere Node.js 20+ y una instalación local de GNU Octave.\n\n\`\`\`sh\nnpx octave-notebook --port 4310 --projects ./projects\n\`\`\`\n`, 'utf8')
  await writeFile(path.join(staging, 'package.json'), `${JSON.stringify({
    name: sourcePackage.name,
    version: sourcePackage.version,
    description: 'Notebook IDE local para GNU Octave',
    type: 'commonjs',
    bin: { 'octave-notebook': 'bin/octave-notebook.cjs' },
    engines: { node: '>=20' },
    license: 'UNLICENSED',
  }, null, 2)}\n`, 'utf8')

  await runNpm(['pack', staging, '--pack-destination', packageOutput, '--quiet'], repository)
  await stat(artifactPath)
  console.log(`Paquete: ${artifactPath}`)
} finally {
  await rm(stagingParent, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })
}

function runNpm(args, cwd) {
  return new Promise((resolveRun, rejectRun) => {
    const command = process.platform === 'win32' ? (process.env.ComSpec || 'cmd.exe') : 'npm'
    const commandArgs = process.platform === 'win32' ? ['/d', '/s', '/c', 'npm.cmd', ...args] : args
    const child = spawn(command, commandArgs, { cwd, windowsHide: true, stdio: 'inherit' })
    child.once('error', rejectRun)
    child.once('exit', (code) => code === 0 ? resolveRun() : rejectRun(new Error(`npm ${args[0]} falló con código ${code}.`)))
  })
}
