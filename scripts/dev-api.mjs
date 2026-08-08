process.env.NODE_ENV = 'development'
process.env.PORT = process.env.OCTAVE_DEV_API_PORT || '4311'

await import('../server/index.ts')
