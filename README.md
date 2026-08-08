# Octave Notebook

IDE local de notebooks para GNU Octave, construido con Vite, React y Node.js.

## Desarrollo

```powershell
pnpm install
pnpm dev
```

`pnpm dev` se registra en Console Monitor con el id `octave-notebook-dev`. La interfaz queda disponible en `http://localhost:5173` y la API en `http://127.0.0.1:4310`.

## Producción

```powershell
pnpm build
$env:NODE_ENV = 'production'
pnpm start
```

Los documentos `.octnb` y las carpetas creadas desde la interfaz se guardan físicamente dentro de `projects/`. El servidor busca `octave-cli` en `PATH` y en las ubicaciones habituales de GNU Octave para Windows.

## Comandos

- `pnpm dev`: API y Vite en watch mediante Console Monitor.
- `pnpm dev:raw`: API y Vite sin Console Monitor.
- `pnpm test`: pruebas unitarias.
- `pnpm build`: typecheck y build de producción.
