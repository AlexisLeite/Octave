import { describe, expect, it } from 'vitest'
import { devShimRelativePath, resolveDevCommand } from './devCommand.mjs'

describe('devShimRelativePath', () => {
  it('uses the shim name that console-monitor generates on each platform', () => {
    expect(devShimRelativePath('win32')).toBe('.upm/bin/cm.cmd')
    expect(devShimRelativePath('linux')).toBe('.upm/bin/cm')
    expect(devShimRelativePath('darwin')).toBe('.upm/bin/cm')
  })
})

describe('resolveDevCommand', () => {
  it('falls back to dev:raw when the shim is missing', () => {
    expect(resolveDevCommand({ shimPath: null })).toEqual({
      command: 'pnpm',
      args: ['dev:raw'],
      usesMonitor: false,
    })
  })

  it('wraps dev:raw in console-monitor when the shim exists', () => {
    expect(resolveDevCommand({ shimPath: '/repo/.upm/bin/cm' })).toEqual({
      command: '/repo/.upm/bin/cm',
      args: ['run', '--id', 'octave-notebook-dev', '--cwd', '.', '--', 'pnpm', 'dev:raw'],
      usesMonitor: true,
    })
  })

  it('does not share the argument array between calls', () => {
    const first = resolveDevCommand({ shimPath: '/repo/.upm/bin/cm' })
    const pristine = [...first.args]
    first.args.push('--roto')

    expect(resolveDevCommand({ shimPath: '/repo/.upm/bin/cm' }).args).toEqual(pristine)
  })
})
