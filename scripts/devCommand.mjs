const monitorArgs = ['run', '--id', 'octave-notebook-dev', '--cwd', '.', '--', 'pnpm', 'dev:raw']

/**
 * Devuelve la ruta relativa del shim de Console Monitor para una plataforma.
 * Refleja localCommandPath() del post-install de @focus.matters/console-monitor:
 * en Windows el shim es un .cmd y en el resto un script sh sin extensión.
 */
export function devShimRelativePath(platform) {
  return platform === 'win32' ? '.upm/bin/cm.cmd' : '.upm/bin/cm'
}

/**
 * Elige el comando de desarrollo según haya o no un shim de Console Monitor utilizable.
 * Sin shim el entorno es el mismo, solo que sin monitor.
 */
export function resolveDevCommand({ shimPath }) {
  if (!shimPath) {
    return { command: 'pnpm', args: ['dev:raw'], usesMonitor: false }
  }

  return { command: shimPath, args: [...monitorArgs], usesMonitor: true }
}
