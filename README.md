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
- `pnpm package`: compila los últimos cambios y genera `package/install.mjs` junto al paquete npm universal.
- `pnpm test:package`: instala el paquete de forma interactiva y no interactiva en temporales, ejecuta `setup`, `doctor` y un smoke test completo, y elimina los recursos usados.

## Paquete instalable

```sh
pnpm package
node package/install.mjs --prefix /ruta/de/instalacion
```

Sin `--prefix`, el instalador solicita el destino y confirma antes de escribir sobre un directorio no vacío. La aplicación instalada expone el comando `octave-notebook`:

```sh
octave-notebook setup
octave-notebook doctor
octave-notebook start --host 127.0.0.1 --port 4310 --projects ./projects
```

`setup` descubre Octave local y guarda su ruta. Si no lo encuentra, puede usar `winget`, Homebrew o el gestor de paquetes de Linux disponible. La configuración puede aislarse con `--config` y la ruta puede establecerse con `--octave-path`.
