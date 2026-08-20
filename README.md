# Octave Notebook

IDE local de notebooks para [GNU Octave](https://octave.org/), construido con React, Vite y Node.js. Combina documentos Markdown y celdas de código ejecutables con un contexto persistente por cuaderno, sin enviar el código ni los archivos a un servicio externo.

<img width="1917" height="907" alt="image" src="https://github.com/user-attachments/assets/17814a10-3653-47dd-9719-5764a8fc8e48" />

## Características

- Explorador de archivos y carpetas respaldado por un directorio `projects/` real.
- Celdas Octave con Monaco: resaltado, diagnósticos, sugerencias, formato, inspección y atajos.
- Celdas Markdown con ProseMirror, fórmulas LaTeX/KaTeX y edición por atajos.
- Contexto Octave persistente mientras el cuaderno está activo.
- Resultados y errores guardados junto con el documento `.octnb`.
- Visor PDF con estado de página, zoom y desplazamiento.
- Exportación del cuaderno a un PDF presentable, con fórmulas y sintaxis coloreada.
- Manual de Octave integrado, navegable y con ejemplos ejecutables aislados.
- Temas claro y oscuro, panel redimensionable y restauración del estado de trabajo.
- Instalador y CLI portables para Windows, macOS y Linux.

## Ayuda integrada con código ejecutable

<img width="1067" height="747" alt="image" src="https://github.com/user-attachments/assets/3463672a-0e9f-408b-8fee-acc566f3bdb9" />

## Requisitos

- [Node.js](https://nodejs.org/) 20 o posterior.
- [pnpm](https://pnpm.io/).
- GNU Octave con `octave-cli` disponible en `PATH`, o una ruta indicada mediante `OCTAVE_CLI_PATH`.
- gnuplot disponible en `PATH` y registrado como toolkit gráfico de Octave.

El paquete no incluye los binarios de Octave. El comando `octave-notebook setup` puede descubrir una instalación existente o invocar `winget`, Homebrew, `apt-get`, `dnf`, `pacman` o `zypper` cuando estén disponibles.

## Inicio rápido para desarrollo

```sh
git clone https://github.com/AlexisLeite/Octave.git
cd Octave
pnpm install
pnpm dev:raw
```

La interfaz queda en [http://localhost:5173](http://localhost:5173) y la API de desarrollo en `http://127.0.0.1:4311`. Vite redirige `/api` a ese puerto.

`pnpm dev` levanta el mismo entorno y, si encuentra el shim local de Console Monitor (`.upm/bin/cm` en Linux y macOS, `.upm/bin/cm.cmd` en Windows), lo registra con el id `octave-notebook-dev`. Sin ese shim equivale a `pnpm dev:raw`, que nunca depende de esa herramienta local.

Para cambiar el puerto de la API de desarrollo:

```powershell
$env:OCTAVE_DEV_API_PORT = '4401'
pnpm dev:raw
```

## Producción

```sh
pnpm serve
```

`pnpm serve` genera `dist/` y sirve la aplicación en `http://127.0.0.1:4310`, sin HMR. Para separar ambos pasos:

```sh
pnpm build
pnpm serve:dist
```

Configuración disponible:

| Variable | Uso | Valor predeterminado |
| --- | --- | --- |
| `HOST` | Dirección de escucha | `127.0.0.1` |
| `PORT` | Puerto HTTP | `4310` |
| `OCTAVE_CLI_PATH` | Ejecutable local de Octave | Descubrimiento automático |
| `OCTAVE_NOTEBOOK_PROJECTS_DIR` | Directorio de cuadernos y archivos | `./projects` |
| `OCTAVE_NOTEBOOK_WEB_DIR` | Bundle web que sirve Node | `./dist` |
| `OCTAVE_NOTEBOOK_ROOT` | Raíz usada para resolver recursos | Directorio actual |

Ejemplo:

```powershell
$env:PORT = '4400'
$env:OCTAVE_CLI_PATH = 'C:\Octave\octave-11.3.0\mingw64\bin\octave-cli.exe'
$env:OCTAVE_NOTEBOOK_PROJECTS_DIR = 'D:\Cuadernos'
pnpm serve:dist
```

## Paquete instalable

El artefacto se genera fuera de `dist/` para no mezclar el sitio compilado con el instalador:

```sh
pnpm package
node package/install.mjs --prefix /ruta/de/instalacion
```

`package/` contiene `install.mjs` y `octave-notebook-<versión>.tgz`. Sin `--prefix`, el instalador solicita el destino y confirma antes de escribir en un directorio no vacío.

La instalación expone el CLI `octave-notebook`:

```sh
octave-notebook setup
octave-notebook doctor
octave-notebook start --host 127.0.0.1 --port 4310 --projects ./projects
```

- `setup` descubre o instala GNU Octave y gnuplot, valida el toolkit gráfico y guarda la ruta de Octave.
- `doctor` valida Node, la configuración, el ejecutable de Octave, gnuplot y su integración con Octave.
- `start` inicia la aplicación; también es el comando predeterminado.
- `--config <archivo>` aísla la configuración.
- `--octave-path <ejecutable>` registra una ruta explícita.

## Modelo de ejecución

Cada pestaña del navegador recibe un identificador propio. El servidor permite un runtime persistente para su cuaderno activo y, como máximo, otro runtime efímero para un ejemplo de ayuda. La ayuda destruye su proceso al terminar.

El cliente envía un heartbeat cada 10 segundos. Si desaparece durante 30 segundos, el servidor cierra sus procesos Octave; un runtime inactivo también caduca después de 10 minutos. El coordinador del heartbeat es único incluso durante HMR.

Cambiar de cuaderno reinicia el contexto. Los resultados ya guardados permanecen en el documento, pero no reconstruyen automáticamente las variables del proceso anterior.

## Atajos principales

| Atajo | Acción |
| --- | --- |
| `Ctrl+Enter` | Ejecutar la celda activa |
| `Ctrl+Shift+Enter` | Ejecutar todo el cuaderno |
| `Ctrl+S` | Formatear la celda activa y guardar |
| `Ctrl+Shift+F` | Formatear la celda de código |
| `Ctrl+Espacio` | Abrir sugerencias de Octave |
| `Ctrl+D` | Agregar la siguiente coincidencia al multicursor |
| `F1` | Abrir la ayuda o enfocar su buscador |

## Estructura del proyecto

```text
src/
  components/        interfaz, editores, árbol, ayuda y visor PDF
  editor/            lenguaje, linter, formato e historial
  help/              manual y motor de búsqueda
server/
  runtime/           procesos persistentes de octave-cli
  notebookPdf.ts     exportación profesional a PDF
scripts/             desarrollo, producción, paquete e instalación
projects/            archivos y cuadernos locales
```

El frontend consume una API Node/Express. El runtime serializa la ejecución de cada proceso Octave, conserva su directorio de trabajo y traduce errores a diagnósticos de línea y columna.

## Verificación

```sh
pnpm test
pnpm build
```

La prueba integral del artefacto es deliberadamente más costosa y debe ejecutarse antes de publicar:

```sh
pnpm test:package
```

Esta prueba genera el paquete actual, ejecuta `node package/install.mjs --prefix <temporal>`, usa un puerto libre, valida frontend, API y Octave real, detiene los procesos y elimina los recursos temporales.

## Scripts

| Comando | Descripción |
| --- | --- |
| `pnpm dev` | API y Vite en watch, mediante Console Monitor si está instalado |
| `pnpm dev:raw` | API y Vite en watch sin Console Monitor |
| `pnpm serve` | Build y servidor de producción sin HMR |
| `pnpm serve:dist` | Sirve un `dist/` ya generado |
| `pnpm test` | Pruebas unitarias |
| `pnpm build` | Typecheck y bundle de producción |
| `pnpm package` | Build y paquete instalable universal |
| `pnpm test:package` | Instalación temporal y smoke test integral |

## Seguridad

Las celdas ejecutan código local con los permisos del proceso Node. Mantén el servidor en `127.0.0.1` salvo que controles la red, los archivos servidos y quién puede acceder. No abras cuadernos de origen desconocido sin revisar su código.

## Contribuir

1. Crea una rama enfocada en un cambio.
2. Añade pruebas para la lógica modificada.
3. Ejecuta `pnpm test` y `pnpm build`.
4. Si alteraste instalación, CLI o servidor de producción, ejecuta también `pnpm test:package`.
5. Abre un pull request describiendo el comportamiento y la validación realizada.

## Licencia

El proyecto todavía no publica una licencia de código abierto y el paquete se marca como `UNLICENSED`. Añade un archivo `LICENSE` antes de distribuirlo como software open source.
