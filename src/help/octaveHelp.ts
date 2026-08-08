export interface HelpExample {
  title: string
  code: string
}

export interface HelpNode {
  id: string
  title: string
  summary: string
  syntax?: string[]
  examples: HelpExample[]
  children?: HelpNode[]
  keywords?: string[]
}

const example = (title: string, code: string): HelpExample => ({ title, code })

const node = (
  id: string,
  title: string,
  summary: string,
  syntax: string[],
  examples: HelpExample[],
  keywords: string[] = [],
  children?: HelpNode[],
): HelpNode => ({ id, title, summary, syntax, examples, keywords, children })

export const octaveHelp: HelpNode[] = [
  node('fundamentos', 'Fundamentos y sintaxis', 'Octave evalúa expresiones y sentencias. El punto y coma evita imprimir un resultado; los comentarios comienzan con %. Usa help y doc para consultar una función instalada.', ['expresion;', '% comentario', 'help nombre'], [
    example('Sesión', "radio = 3;\narea = pi * radio^2\ndisp(area)\nhelp sqrt"),
  ], ['comentarios', 'ayuda', 'punto y coma'], [
    node('fundamentos-comandos', 'Comandos básicos', 'clc limpia la consola, clear elimina variables y who o whos inspeccionan el espacio de trabajo.', ['clc', 'clear nombre', 'whos'], [example('Espacio de trabajo', 'x = 42;\nwhos x\nclear x')]),
    node('fundamentos-expresiones', 'Expresiones y precedencia', 'Los paréntesis hacen explícito el orden. La potenciación precede a productos y sumas.', ['(a + b) / c', 'x^n'], [example('Precedencia', 'a = 2; b = 3;\ny = (a + b)^2')]),
  ]),
  node('variables', 'Variables y tipos', 'Las variables se crean al asignar. Octave trabaja principalmente con matrices numéricas, además de valores lógicos, caracteres, strings, celdas y estructuras.', ['nombre = valor', 'class(valor)', 'size(valor)'], [
    example('Tipos', "n = 12;\nactivo = true;\nnombre = 'Octave';\nclass(n)"),
  ], ['double', 'logical', 'char', 'string', 'struct', 'cell'], [
    node('variables-celdas', 'Celdas', 'Una celda puede contener valores de distinto tipo. Los paréntesis extraen una celda; las llaves extraen su contenido.', ['C = {a, b}', 'C(1)', 'C{1}'], [example('Contenido heterogéneo', "C = {pi, 'radio', [1 2 3]};\nvalor = C{1}")]),
    node('variables-estructuras', 'Estructuras', 'Una estructura agrupa campos nombrados y puede formar arreglos de registros.', ['s.campo = valor', 's.(nombre)'], [example('Registro', "p.nombre = 'Ada';\np.edad = 36;\ndisp(p.nombre)")]),
  ]),
  node('matrices', 'Vectores, matrices e indexación', 'Los corchetes construyen arreglos. Espacios o comas separan columnas y el punto y coma separa filas. Los índices comienzan en 1.', ['v = [a b c]', 'A = [a b; c d]', 'A(filas, columnas)', 'inicio:paso:fin'], [
    example('Construcción e índice', 'A = [1 2 3; 4 5 6];\ncolumna = A(:, 2)\nultimo = A(end, end)'),
  ], ['colon', 'end', 'reshape', 'linspace'], [
    node('matrices-rangos', 'Rangos y formas', 'El operador dos puntos crea rangos y selecciona regiones. reshape cambia la forma sin cambiar el orden de los elementos.', ['a:b', 'a:paso:b', 'reshape(A, m, n)'], [example('Malla', 'x = linspace(0, 2*pi, 100);\nB = reshape(1:12, 3, 4);')]),
    node('matrices-indexacion-logica', 'Indexación lógica', 'Una condición produce una máscara lógica que permite consultar o modificar solo los elementos que la cumplen.', ['A(condicion)', 'A(condicion) = valor'], [example('Filtrar', 'v = [-2 4 -1 7];\npositivos = v(v > 0)\nv(v < 0) = 0;')]),
  ]),
  node('operadores', 'Operadores', 'Los operadores matriciales aplican álgebra lineal. Los operadores con punto trabajan elemento a elemento. Las comparaciones producen valores lógicos.', ['A * B', 'A .* B', 'A / B', 'A ./ B', 'A^2', 'A.^2', '==  ~=  <  <=  >  >='], [
    example('Elemento a elemento', 'x = 1:5;\ny = x.^2 + 2.*x;\nseleccion = y >= 10;'),
  ], ['aritmetica', 'comparacion', 'logicos', 'elemento'], [
    node('operadores-logicos', 'Lógica', '& y | operan elemento a elemento. && y || hacen cortocircuito y se usan con condiciones escalares.', ['a & b', 'a | b', '!a', 'cond1 && cond2'], [example('Condición', 'x = 4;\nvalido = isscalar(x) && x > 0;')]),
    node('operadores-transpuesta', 'Transposición', "El apóstrofo calcula la transpuesta conjugada. .' transpone sin conjugar valores complejos.", ["A'", "A.'"], [example('Complejos', "z = [1+i, 2-i];\nconjugada = z';\nsimple = z.';")]),
  ]),
  node('control', 'Control de flujo', 'if selecciona ramas, switch compara casos y los bucles for y while repiten sentencias. Cada bloque se cierra con end.', ['if condicion ... elseif ... else ... end', 'for k = rango ... end', 'while condicion ... end'], [
    example('Bucle y condición', 'suma = 0;\nfor k = 1:10\n  if mod(k, 2) == 0\n    suma += k;\n  endif\nendfor'),
  ], ['if', 'for', 'while', 'switch', 'break', 'continue', 'end'], [
    node('control-condicionales', 'Condicionales', 'Una condición de if debe poder interpretarse como verdadera o falsa. elseif evita niveles innecesarios.', ['if c ... elseif d ... else ... endif'], [example('Clasificar', "if x > 0\n  tipo = 'positivo';\nelseif x < 0\n  tipo = 'negativo';\nelse\n  tipo = 'cero';\nendif")]),
    node('control-bucles', 'Bucles', 'for recorre columnas de un arreglo. while repite mientras su condición sea verdadera. break interrumpe y continue avanza.', ['for elemento = arreglo ... endfor', 'while condicion ... endwhile'], [example('Búsqueda', 'k = 1;\nwhile k <= numel(v) && v(k) != objetivo\n  k += 1;\nendwhile')]),
  ]),
  node('funciones', 'Funciones y scripts', 'Un script ejecuta sentencias en el espacio de trabajo actual. Una función tiene entradas, salidas y un espacio local; debe cerrarse con endfunction o end.', ['function salida = nombre(entrada) ... endfunction', 'function [a, b] = nombre(x) ... endfunction'], [
    example('Función', 'function norma = norma2(v)\n  norma = sqrt(sum(v.^2));\nendfunction\n\nnorma2([3 4])'),
  ], ['function', 'script', 'argumentos', 'retorno', 'handle'], [
    node('funciones-anonimas', 'Funciones anónimas y handles', 'Un handle permite pasar una función como valor. La sintaxis @ crea handles a funciones existentes o anónimas.', ['f = @nombre', 'f = @(x) expresion', 'f(args)'], [example('Función como dato', 'f = @(x) exp(-x.^2);\narea = quad(f, 0, 1);')]),
    node('funciones-argumentos', 'Argumentos variables', 'nargin y nargout informan cuántos argumentos se usaron. varargin y varargout reciben listas variables en celdas.', ['nargin', 'varargin', 'varargout'], [example('Valor predeterminado', 'function y = escala(x, factor)\n  if nargin < 2, factor = 1; endif\n  y = factor * x;\nendfunction')]),
  ]),
  node('algebra-lineal', 'Álgebra lineal', 'Prefiere resolver sistemas con la barra inversa antes que formar una inversa. Octave incluye factorizaciones, autovalores, rango y normas.', ['x = A \\ b', '[L, U, P] = lu(A)', '[V, D] = eig(A)', 'norm(A)'], [
    example('Sistema lineal', 'A = [3 -1; 2 4];\nb = [7; 10];\nx = A \\ b;\nresiduo = norm(A*x - b)'),
  ], ['sistemas', 'lu', 'qr', 'svd', 'eigen', 'autovalores'], [
    node('algebra-factorizaciones', 'Factorizaciones', 'LU resuelve sistemas generales, QR problemas de mínimos cuadrados y Cholesky matrices hermitianas definidas positivas.', ['lu(A)', 'qr(A)', 'chol(A)', 'svd(A)'], [example('Mínimos cuadrados', 'A = [1 0; 1 1; 1 2];\nb = [1; 2; 2];\ncoef = A \\ b;')]),
    node('algebra-autovalores', 'Autovalores', 'eig devuelve autovectores y autovalores. Para una matriz A, las columnas de V cumplen A*V = V*D.', ['lambda = eig(A)', '[V, D] = eig(A)'], [example('Espectro', 'A = [2 1; 1 2];\n[V, D] = eig(A);\nerror = norm(A*V - V*D)')]),
  ]),
  node('calculo', 'Cálculo numérico', 'Octave aproxima raíces, integrales, derivadas, interpolaciones y ecuaciones diferenciales mediante algoritmos numéricos.', ['fzero(f, x0)', 'quad(f, a, b)', 'interp1(x, y, xi)', 'ode45(f, intervalo, y0)'], [
    example('Raíz', 'f = @(x) cos(x) - x;\nraiz = fzero(f, 0.7);\nerror = abs(f(raiz))'),
  ], ['integracion', 'derivacion', 'interpolacion', 'ode'], [
    node('calculo-integracion', 'Integración e interpolación', 'quad integra una función escalar. trapz integra muestras. interp1 estima valores entre puntos conocidos.', ['quad(f, a, b)', 'trapz(x, y)', 'interp1(x, y, xi, metodo)'], [example('Datos muestreados', 'x = 0:0.1:pi;\ny = sin(x);\nI = trapz(x, y);\nyi = interp1(x, y, pi/4, "spline");')]),
    node('calculo-edos', 'Ecuaciones diferenciales', 'Los solvers ode reciben una función que calcula la derivada, el intervalo y el estado inicial.', ['[t, y] = ode45(@(t,y) derivada, [t0 tf], y0)'], [example('Decaimiento', 'f = @(t, y) -0.5*y;\n[t, y] = ode45(f, [0 10], 1);\nplot(t, y)')]),
  ]),
  node('estadistica', 'Estadística', 'Las funciones descriptivas operan por columnas de forma predeterminada. Las distribuciones y generadores aleatorios permiten simulación.', ['mean(x)', 'median(x)', 'std(x)', 'cov(X)', 'rand(m, n)', 'randn(m, n)'], [
    example('Resumen', 'datos = [12 15 14 18 16];\npromedio = mean(datos);\ndesvio = std(datos);'),
  ], ['media', 'desvio', 'probabilidad', 'aleatorio'], [
    node('estadistica-simulacion', 'Simulación', 'rand genera uniformes en (0,1) y randn normales estándar. Fijar el estado hace reproducible una prueba.', ['rand("state", semilla)', 'rand(m, n)', 'randn(m, n)'], [example('Monte Carlo', 'rand("state", 7);\np = rand(2, 10000);\npi_aprox = 4 * mean(sum(p.^2, 1) <= 1)')]),
  ]),
  node('graficos', 'Gráficos', 'plot crea gráficos 2D. figure, subplot, títulos y etiquetas organizan la salida. surf, mesh e imagesc muestran datos 2D o superficies.', ['plot(x, y)', 'subplot(filas, columnas, indice)', 'surf(X, Y, Z)', 'legend(...)'], [
    example('Dos curvas', "x = linspace(0, 2*pi, 200);\nplot(x, sin(x), x, cos(x));\nxlabel('x'); ylabel('amplitud');\nlegend('sin(x)', 'cos(x)'); grid on;"),
  ], ['plot', 'figure', 'axes', 'surf', 'legend'], [
    node('graficos-estilo', 'Estilo y exportación', 'Los handles permiten cambiar propiedades. print exporta una figura; no imprime valores numéricos en la consola.', ['h = plot(...)', 'set(h, "linewidth", 2)', 'print("archivo.png", "-dpng")'], [example('Exportar', "h = plot(1:10, (1:10).^2);\nset(h, 'linewidth', 2);\nprint('grafico.png', '-dpng', '-r150');")]),
  ]),
  node('archivos', 'Entrada, salida y archivos', 'disp y fprintf muestran valores. load y save persisten variables. Las funciones fopen/fclose permiten controlar archivos de texto o binarios.', ['disp(valor)', 'fprintf(formato, valores...)', 'save archivo.mat variables', 'load archivo.mat'], [
    example('Salida con formato', "nombre = 'Ada'; valor = pi;\nfprintf('%s: %.4f\\n', nombre, valor);\nsave resultado.mat valor"),
  ], ['disp', 'fprintf', 'csv', 'json', 'load', 'save'], [
    node('archivos-texto', 'Archivos de texto', 'Comprueba que fopen no devuelva -1 y garantiza fclose incluso cuando el procesamiento pueda fallar.', ['fid = fopen(ruta, modo)', 'linea = fgetl(fid)', 'fclose(fid)'], [example('Leer líneas', "fid = fopen('datos.txt', 'r');\nassert(fid != -1);\nlinea = fgetl(fid);\nfclose(fid);")]),
    node('archivos-tabulares', 'Datos tabulares', 'dlmread y dlmwrite manejan archivos delimitados numéricos. csvread/csvwrite existen, aunque sus opciones son más limitadas.', ['A = dlmread(archivo, separador)', 'dlmwrite(archivo, A, "delimiter", separador)'], [example('CSV numérico', "A = dlmread('datos.csv', ',');\ndlmwrite('salida.csv', A.^2, 'delimiter', ',');")]),
  ]),
  node('depuracion', 'Depuración y errores', 'Lee la traza desde la primera llamada de tu código. dbstop permite detenerse en líneas o errores; try/catch recupera errores esperados. assert documenta invariantes.', ['dbstop if error', 'dbstop in funcion at linea', 'dbstack', 'try ... catch err ... end_try_catch'], [
    example('Validar una entrada', "function y = raiz_positiva(x)\n  assert(x >= 0, 'x debe ser no negativo');\n  y = sqrt(x);\nendfunction"),
  ], ['debug', 'breakpoint', 'error', 'warning', 'assert'], [
    node('depuracion-interactiva', 'Depuración interactiva', 'Cuando la ejecución se detiene, dbstack muestra la pila, dbup/dbdown cambian de marco y dbcont continúa.', ['dbstop in nombre at n', 'dbstep', 'dbcont', 'dbquit'], [example('Detener al fallar', 'dbstop if error\nresultado = mi_funcion(datos);')]),
    node('depuracion-errores', 'Errores y advertencias', 'error interrumpe la ejecución. warning informa una situación recuperable. Un objeto capturado contiene message e identifier.', ['error("mensaje")', 'warning("mensaje")', 'lasterror()'], [example('Recuperación', "try\n  A = load('entrada.mat');\ncatch err\n  warning('No se pudo cargar: %s', err.message);\nend_try_catch")]),
  ]),
  node('paquetes', 'Paquetes', 'Los paquetes extienden Octave. pkg list muestra los instalados; pkg load habilita uno durante la sesión. Instala solo paquetes de fuentes confiables.', ['pkg list', 'pkg load nombre', 'pkg install -forge nombre', 'pkg unload nombre'], [
    example('Usar un paquete', 'pkg list\npkg load signal\n[b, a] = butter(4, 0.2);'),
  ], ['forge', 'install', 'signal', 'image', 'optim'], [
    node('paquetes-gestion', 'Gestión', 'pkg describe muestra metadatos. Una versión concreta o archivo local puede pasarse a pkg install.', ['pkg describe nombre', 'pkg update', 'pkg uninstall nombre'], [example('Inspección', 'pkg list\npkg describe -verbose signal')]),
  ]),
  node('rendimiento', 'Rendimiento y vectorización', 'Preasigna arreglos, expresa operaciones con funciones matriciales y mide antes de optimizar. Evita crecer una matriz en cada iteración.', ['zeros(m, n)', 'ones(m, n)', 'tic; ...; toc', 'profile on'], [
    example('Vectorizar', 'x = linspace(0, 10, 100000);\ny = sin(x).^2 + cos(x).^2;'),
  ], ['profiling', 'preasignar', 'vectorizar', 'tic', 'toc'], [
    node('rendimiento-medicion', 'Medición', 'tic/toc mide una sección. timeit reduce el ruido al repetir una función. profile identifica las funciones costosas.', ['tic; codigo; toc', 'timeit(@() funcion())', 'profile on; ...; profile report'], [example('Comparar', 'f = @() sum((1:100000).^2);\ntiempo = timeit(f)')]),
    node('rendimiento-memoria', 'Memoria y preasignación', 'zeros y similares reservan el tamaño final. Las matrices dispersas ahorran memoria cuando predominan los ceros.', ['A = zeros(m, n)', 'S = sparse(i, j, v, m, n)'], [example('Preasignar', 'n = 10000;\ny = zeros(1, n);\nfor k = 1:n\n  y(k) = sqrt(k);\nendfor')]),
  ]),
]

function normalized(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es')
}

function matches(node: HelpNode, query: string) {
  const searchable = [
    node.title,
    node.summary,
    ...(node.syntax ?? []),
    ...(node.keywords ?? []),
    ...node.examples.flatMap((item) => [item.title, item.code]),
  ].join(' ')
  return normalized(searchable).includes(query)
}

/** Preserva los ancestros de cada coincidencia para que el resultado siga siendo navegable. */
export function filterHelpTree(nodes: HelpNode[], rawQuery: string): HelpNode[] {
  const query = normalized(rawQuery.trim())
  if (!query) return nodes

  return nodes.flatMap((current) => {
    const children = filterHelpTree(current.children ?? [], rawQuery)
    if (matches(current, query)) return [{ ...current }]
    if (children.length) return [{ ...current, children }]
    return []
  })
}

export function findHelpNode(nodes: HelpNode[], id: string): HelpNode | undefined {
  for (const current of nodes) {
    if (current.id === id) return current
    const child = findHelpNode(current.children ?? [], id)
    if (child) return child
  }
}
