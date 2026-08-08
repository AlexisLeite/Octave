import { type HelpNode, markdown, code, topic } from '../helpTypes'

export const programmingHelp: HelpNode[] = [
  topic(
    'programacion-control',
    'Control de flujo: decidir y repetir',
    [
      markdown(`Un programa combina datos con decisiones y repeticiones. En Octave, if, switch, for y while forman bloques cerrados con end (o sus variantes endif, endfor y endwhile). La condición debe producir un valor lógico; escribe condiciones escalares para controlar una única rama y reserva las máscaras para seleccionar elementos.`),
      code(`clear;
temperaturas = [17, 21, 29, 33];
for temperatura = temperaturas
  if temperatura >= 30
    estado = 'alerta';
  elseif temperatura >= 20
    estado = 'normal';
  else
    estado = 'frío';
  endif
  fprintf('%g -> %s\\n', temperatura, estado);
endfor`, 'Decisiones dentro de una repetición'),
      markdown(`La estructura elegida comunica intención: if evalúa predicados; switch compara un valor con casos; for recorre un conjunto conocido; while repite mientras una condición siga siendo cierta. Antes de escribir un bucle, identifica su estado inicial, la condición de avance y el resultado final.

**Práctica:** predice cuántas iteraciones hará el bloque antes de ejecutarlo y explica por qué termina.`),
      code(`clear;
saldo = 100;
mes = 0;
while saldo < 130
  mes += 1;
  saldo *= 1.05;
endwhile
fprintf('%d meses; saldo %.2f\\n', mes, saldo);
assert(mes == 6);`, 'Un estado que avanza hasta un umbral'),
    ],
    [
      topic('programacion-if', 'if, elseif y condiciones escalares', [
        markdown(`if ejecuta exactamente una rama: prueba de arriba abajo y se detiene en la primera condición verdadera. elseif evita anidar if innecesarios y else captura el resto. En una condición matricial Octave solo considera verdadera la condición si **todos** sus elementos son no nulos; esa semántica sorprende, así que expresa la reducción con all o any.`),
        code(`clear;
notas = [8, 7, 10];
if all(notas >= 6)
  mensaje = 'todos aprobaron';
elseif any(notas >= 6)
  mensaje = 'aprobación parcial';
else
  mensaje = 'nadie aprobó';
endif
disp(mensaje);
assert(strcmp(mensaje, 'todos aprobaron'));`, 'Reducir una máscara de forma explícita'),
        markdown(`Usa && y || para predicados escalares: cortocircuitan y pueden proteger una operación posterior. Usa & y | para construir máscaras elemento a elemento. No encadenes comparaciones como 0 < x < 1; escribe 0 < x && x < 1, o (0 < x) & (x < 1) para un arreglo.

Error frecuente: confundir = con ==. La primera asigna; la segunda compara.`),
        code(`clear;
v = [4, 8, 12];
i = 2;
valido = isscalar(i) && i >= 1 && i <= numel(v) && v(i) > 0;
en_intervalo = (5 < v) & (v <= 10);
assert(valido && isequal(en_intervalo, [false, true, false]));`, 'Cortocircuito y máscara'),
      ], [], ['if', 'elseif', 'else', 'all', 'any', 'cortocircuito']),

      topic('programacion-switch', 'switch, case y otherwise', [
        markdown(`switch evalúa una expresión una vez y la compara con case. No existe caída automática al caso siguiente: no hace falta break. Un case puede agrupar alternativas dentro de una celda. otherwise captura cualquier valor no contemplado.`),
        code(`clear;
unidad = 'cm';
valor = 250;
switch lower(unidad)
  case 'm'
    metros = valor;
  case {'cm', 'centimetro', 'centímetros'}
    metros = valor / 100;
  case 'mm'
    metros = valor / 1000;
  otherwise
    error('Unidad no admitida: %s', unidad);
endswitch
assert(metros == 2.5);`, 'Varios nombres para un caso'),
        markdown(`Prefiere switch cuando comparas un solo selector discreto; if es mejor para rangos o predicados heterogéneos. Normaliza texto antes de comparar y conserva otherwise para detectar entradas nuevas.

**Práctica:** añade kilómetros sin alterar los casos existentes y prueba mayúsculas.`),
        code(`clear;
operacion = 'media';
x = [2, 4, 9, 13];
switch operacion
  case 'suma'
    resultado = sum(x);
  case 'media'
    resultado = mean(x);
  case 'máximo'
    resultado = max(x);
  otherwise
    resultado = NaN;
endswitch
fprintf('%s = %.2f\\n', operacion, resultado);`, 'Despachar una operación'),
      ], [], ['switch', 'case', 'otherwise', 'despacho']),

      topic('programacion-for-rangos', 'for desde cero: rangos y acumuladores', [
        markdown(`for variable = expresión asigna a la variable una columna de la expresión en cada iteración. Un rango fila como 1:n tiene columnas escalares, por lo que produce el patrón habitual. El cuerpo puede leer y actualizar un acumulador inicializado antes del bucle.`),
        code(`clear;
n = 6;
factorial_n = 1;
for k = 2:n
  factorial_n *= k;
endfor
assert(factorial_n == factorial(n));
fprintf('%d! = %d\\n', n, factorial_n);`, 'Rango y acumulación'),
        markdown(`El rango inicio:paso:fin puede ascender o descender; si el paso apunta en dirección equivocada queda vacío. No cambies k dentro del cuerpo esperando alterar la próxima iteración: for toma sus valores de la expresión de recorrido.

Errores frecuentes: olvidar inicializar el acumulador, usar = en vez de += y asumir que 1:0 incluye algo.`),
        code(`clear;
cuenta_atras = [];
for k = 10:-2:2
  cuenta_atras(end + 1) = k;
endfor
assert(isequal(cuenta_atras, [10, 8, 6, 4, 2]));
assert(isempty(3:7:1));`, 'Paso descendente y rango vacío'),
      ], [], ['for', 'rango', 'acumulador', 'paso', 'endfor']),

      topic('programacion-for-columnas', 'for recorre columnas de matrices', [
        markdown(`La regla profunda de for es “una columna por iteración”. Si A mide m×n, la variable recibe un vector m×1 en cada una de las n vueltas. Para recorrer elementos usa A(:) o índices lineales; para recorrer filas, transpón de forma consciente o itera su número.`),
        code(`clear;
A = [1, 2, 3; 10, 20, 30];
sumas = zeros(1, columns(A));
j = 0;
for columna = A
  j += 1;
  sumas(j) = sum(columna);
endfor
assert(isequal(sumas, [11, 22, 33]));`, 'Cada vuelta recibe una columna'),
        markdown(`Esta semántica permite procesar observaciones almacenadas por columnas, pero puede ocultar un error de orientación. Comprueba size antes del bucle. En arreglos N-D, for aplana todas las dimensiones salvo la primera en una secuencia de columnas.

**Experimento:** cambia A por A.' y predice el número y tamaño de iteraciones.`),
        code(`clear;
A = reshape(1:12, 3, 4);
vistos = [];
for elemento = A(:).'
  vistos(end + 1) = elemento;
endfor
assert(isequal(vistos, 1:12));
fprintf('%d elementos en orden lineal por columnas\\n', numel(vistos));`, 'Recorrer todos los elementos explícitamente'),
      ], [], ['for', 'columnas', 'matriz', 'orientación', 'A(:)']),

      topic('programacion-for-patrones', 'for anidados, break y continue', [
        markdown(`Los bucles anidados recorren productos de conjuntos. El índice interior cambia más rápido. break termina **solo el bucle más interno**; continue salta el resto de la iteración actual. Úsalos para excepciones claras, no para esconder una condición difícil de seguir.`),
        code(`clear;
tabla = zeros(4, 5);
for fila = 1:rows(tabla)
  for columna = 1:columns(tabla)
    tabla(fila, columna) = fila * columna;
  endfor
endfor
assert(tabla(4, 5) == 20);`, 'Dos dimensiones, dos índices'),
        markdown(`Cuando buscas un valor en dos bucles, una bandera permite salir del exterior después de break. A menudo find expresa mejor la búsqueda. continue es útil para filtrar temprano, pero una máscara puede ser más legible.

Error frecuente: esperar que break salga de todos los niveles.`),
        code(`clear;
datos = [4, -1, 7, 0, 9, -3];
total_positivo = 0;
primero_grande = NaN;
for x = datos
  if x <= 0, continue; endif
  total_positivo += x;
  if x > 8
    primero_grande = x;
    break;
  endif
endfor
assert(total_positivo == 20 && primero_grande == 9);`, 'Filtrar y terminar temprano'),
      ], [], ['for', 'anidado', 'break', 'continue', 'bandera']),

      topic('programacion-for-rendimiento', 'Preasignar y saber cuándo vectorizar', [
        markdown(`Si el resultado final tiene tamaño conocido, resérvalo con zeros, ones, cell o false antes de for. Hacer crecer y(end+1) en cada vuelta obliga a realojar memoria. Un bucle preasignado y claro es correcto; vectorizar es valioso cuando una operación de arreglo expresa directamente la matemática.`),
        code(`clear;
n = 1000;
y = zeros(1, n);
for k = 1:n
  y(k) = sin(k / 20) * exp(-k / 500);
endfor
assert(numel(y) == n && all(isfinite(y)));`, 'Bucle preasignado'),
        markdown(`La versión vectorizada crea el rango completo y aplica operadores con punto. No vectorices a costa de matrices temporales gigantes ni de una lógica ilegible. Mide con timeit o tic/toc después de obtener una versión correcta.

**Regla práctica:** reducción simple → función como sum; fórmula independiente → vectorización; estado dependiente o ramas complejas → bucle explícito.`),
        code(`clear;
k = 1:1000;
y_vector = sin(k / 20) .* exp(-k / 500);
y_bucle = zeros(size(k));
for i = 1:numel(k)
  y_bucle(i) = sin(k(i) / 20) * exp(-k(i) / 500);
endfor
assert(norm(y_vector - y_bucle, Inf) < 1e-14);`, 'Equivalencia antes de optimizar'),
      ], [], ['for', 'preasignación', 'vectorización', 'zeros', 'rendimiento']),

      topic('programacion-while', 'while, invariantes y terminación', [
        markdown(`while repite mientras una condición sea verdadera. Es apropiado cuando no conoces el número de vueltas: convergencia, lectura hasta fin de archivo o simulación por eventos. Inicializa el estado antes, actualízalo en toda ruta y define un límite de seguridad.`),
        code(`clear;
x = 1;
objetivo = 50;
iteracion = 0;
max_iter = 20;
while x < objetivo && iteracion < max_iter
  x = 1.6 * x;
  iteracion += 1;
endwhile
assert(x >= objetivo && iteracion <= max_iter);
fprintf('%d iteraciones, x=%.3f\\n', iteracion, x);`, 'Condición y límite de seguridad'),
        markdown(`Un invariante es una propiedad cierta antes y después de cada vuelta; documentarlo simplifica la corrección. Error clásico: un bucle infinito porque la variable de condición no cambia. Para iteraciones numéricas combina tolerancia absoluta/relativa con máximo de iteraciones.

**Práctica:** implementa bisección manteniendo siempre un cambio de signo entre los extremos.`),
        code(`clear;
f = @(x) x.^2 - 2;
a = 1; b = 2; tolerancia = 1e-10;
iter = 0;
while (b - a) > tolerancia && iter < 100
  medio = (a + b) / 2;
  if f(a) * f(medio) <= 0, b = medio; else, a = medio; endif
  iter += 1;
endwhile
raiz = (a + b) / 2;
assert(abs(raiz - sqrt(2)) < tolerancia);`, 'Bisección con invariante'),
      ], [], ['while', 'terminación', 'invariante', 'tolerancia']),
    ],
    ['control', 'if', 'switch', 'for', 'while', 'break', 'continue'],
  ),
  topic(
    'programacion-funciones',
    'Funciones, alcance y archivos de programa',
    [
      markdown(`Una función encapsula un contrato: recibe entradas, produce salidas y mantiene variables locales. Esta frontera permite probar una idea sin depender del workspace. Los bloques de este capítulo definen funciones locales y las usan en el mismo fragmento para seguir siendo autocontenidos.`),
      code(`clear;
function y = cuadrado(x)
  y = x .^ 2;
endfunction

entrada = [-2, 0, 3];
salida = cuadrado(entrada);
assert(isequal(salida, [4, 0, 9]));`, 'Una función pequeña con contrato vectorial'),
      markdown(`En un proyecto real, la función principal suele vivir en un archivo con su mismo nombre: cuadrado.m. Las funciones locales debajo de un script o función ayudan a ocultar detalles. Define qué formas y clases aceptas, valida temprano y documenta unidades.

**Práctica:** extiende la función para rechazar texto y escribe un caso que demuestre el error.`),
      code(`clear;
function y = porcentaje(parte, total)
  assert(isnumeric(parte) && isnumeric(total), 'Las entradas deben ser numéricas');
  assert(all(total(:) != 0), 'El total no puede ser cero');
  y = 100 .* parte ./ total;
endfunction

assert(porcentaje(1, 4) == 25);`, 'Validar en la frontera'),
    ],
    [
      topic('programacion-funciones-definicion', 'Entradas, múltiples salidas y retorno', [
        markdown(`La cabecera function salida = nombre(entrada) nombra el contrato. Para varias salidas usa [a,b] = nombre(...). Octave devuelve solo las salidas solicitadas; nargout permite omitir trabajo caro. Una salida debe recibir valor en toda ruta normal.`),
        code(`clear;
function [media, dispersion] = resumen(x)
  assert(isvector(x) && !isempty(x));
  media = mean(x);
  if nargout > 1
    dispersion = std(x);
  endif
endfunction

[m, s] = resumen([2, 4, 6, 8]);
assert(m == 5 && s > 0);`, 'Dos salidas y cálculo condicional'),
        markdown(`return termina la función inmediatamente; úsalo para un caso base claro, no para dispersar el flujo. Si el llamador pide menos salidas, las restantes se descartan. Si pide más de las declaradas, falla.

Error frecuente: llamar una salida igual que una función usada después, ocultándola dentro del alcance local.`),
        code(`clear;
function [cociente, resto] = division_entera(a, b)
  assert(isscalar(a) && isscalar(b) && b != 0);
  cociente = fix(a / b);
  resto = a - cociente * b;
endfunction

[q, r] = division_entera(17, 5);
assert(q == 3 && r == 2 && 17 == q * 5 + r);`, 'Salidas relacionadas por un invariante'),
      ], [], ['function', 'salidas', 'nargout', 'return', 'endfunction']),

      topic('programacion-argumentos', 'nargin, valores opcionales y varargin', [
        markdown(`nargin indica cuántas entradas recibió la llamada. Úsalo para valores opcionales pequeños y evidentes. Para opciones numerosas, pares nombre/valor son más legibles. varargin es una celda con las entradas adicionales; se accede con llaves.`),
        code(`clear;
function y = escalar(x, factor, desplazamiento)
  if nargin < 2, factor = 1; endif
  if nargin < 3, desplazamiento = 0; endif
  validateattributes(factor, {'numeric'}, {'scalar'});
  y = factor .* x + desplazamiento;
endfunction

assert(isequal(escalar([1, 2]), [1, 2]));
assert(isequal(escalar([1, 2], 10, -1), [9, 19]));`, 'Opciones posicionales con predeterminados'),
        markdown(`varargin no valida ni interpreta por sí solo. Recorre los pares, normaliza nombres y rechaza opciones desconocidas: aceptar silenciosamente un typo crea resultados incorrectos. varargout sirve para un número dinámico de salidas, aunque una estructura suele ser más fácil de mantener.

**Práctica:** agrega la opción absoluto y comprueba que una opción sin valor produzca error.`),
        code(`clear;
function y = transformar(x, varargin)
  escala = 1;
  assert(mod(numel(varargin), 2) == 0, 'Las opciones deben ser pares nombre/valor');
  for k = 1:2:numel(varargin)
    nombre = lower(varargin{k}); valor = varargin{k + 1};
    switch nombre
      case 'escala', escala = valor;
      otherwise, error('Opción desconocida: %s', nombre);
    endswitch
  endfor
  y = escala .* x;
endfunction

assert(isequal(transformar(1:3, 'escala', 4), [4, 8, 12]));`, 'Interpretar varargin sin ambigüedad'),
      ], [], ['nargin', 'varargin', 'varargout', 'opcional', 'nombre valor']),

      topic('programacion-scope', 'Alcance local, persistent y global', [
        markdown(`Las variables de una función son locales: no leen ni modifican automáticamente el workspace del llamador. Los argumentos entran por valor y las salidas transportan resultados. persistent conserva estado privado entre llamadas de la misma función; clear nombre_funcion lo reinicia.`),
        code(`clear;
function n = siguiente_id()
  persistent contador = 0;
  contador += 1;
  n = contador;
endfunction

a = siguiente_id();
b = siguiente_id();
assert(a == 1 && b == 2);`, 'Estado privado persistente'),
        markdown(`global comparte un nombre solo entre alcances que también lo declaran global. Dificulta pruebas, concurrencia y razonamiento; prefiere argumentos, salidas o una estructura de configuración. Las funciones anidadas pueden capturar variables de su función exterior, otra dependencia que conviene mantener pequeña.

Error frecuente: esperar que clear limpie un persistent sin limpiar la función.`),
        code(`clear;
factor = 10;
function y = independiente(x)
  factor = 2;  % Local: no modifica el factor exterior.
  y = factor * x;
endfunction

resultado = independiente(3);
assert(resultado == 6 && factor == 10);`, 'Dos alcances, un mismo nombre'),
      ], [], ['scope', 'alcance', 'local', 'persistent', 'global']),

      topic('programacion-handles', 'Handles y funciones anónimas', [
        markdown(`Un handle referencia una función: @sin o @(x) expresión. Puede guardarse, pasarse a otro algoritmo y ejecutarse con f(argumentos). Una anónima contiene una sola expresión y captura el valor de variables visibles cuando se crea.`),
        code(`clear;
centro = 2;
f = @(x) (x - centro).^2;
centro = 100;
valores = f([1, 2, 3]);
assert(isequal(valores, [1, 0, 1]));`, 'Captura en una función anónima'),
        markdown(`Para lógica con ramas, validación o varias sentencias, define una función con nombre. feval(f,args...) ejecuta un handle y functions(f) permite inspeccionarlo. Los algoritmos numéricos usan handles para desacoplar el método del modelo.

**Práctica:** pasa la misma función a una integración aproximada y a una búsqueda de máximo en una malla.`),
        code(`clear;
aplicar = @(f, x) f(x);
modelos = {@sin, @(x) x.^2, @(x) exp(-x)};
resultados = cellfun(@(f) aplicar(f, 1), modelos);
esperado = [sin(1), 1, exp(-1)];
assert(norm(resultados - esperado, Inf) < 1e-14);`, 'Funciones como datos'),
      ], [], ['handle', 'anónima', '@', 'feval', 'callback']),

      topic('programacion-scripts', 'Scripts frente a funciones', [
        markdown(`Un script ejecuta sentencias en el workspace actual: puede leer, crear y sobrescribir nombres del llamador. Es práctico para una exploración o como punto de entrada pequeño, pero esa dependencia implícita lo vuelve frágil. Una función declara entradas y salidas y tiene alcance local: debe contener la lógica reutilizable.`),
        code(`clear;
ruta = [tempname(), '.m'];
fid = fopen(ruta, 'wt');
assert(fid != -1);
fprintf(fid, 'resultado_del_script = entrada_del_script .^ 2;\\n');
fclose(fid);
entrada_del_script = 7;
run(ruta);
unlink(ruta);
assert(resultado_del_script == 49);`, 'Un script comparte el workspace'),
        markdown(`Organiza un proyecto con una función pública por archivo homónimo, funciones auxiliares locales y un script de entrada que solo configura y llama. addpath altera la resolución global de nombres; evita depender del directorio de trabajo y construye rutas desde mfilename('fullpath').

Error frecuente: llamar un archivo igual que una función estándar; comprueba which -all nombre.`),
        code(`clear;
ubicacion = mfilename('fullpath');
if isempty(ubicacion)
  ubicacion = pwd();
endif
[carpeta, nombre, extension] = fileparts(ubicacion);
fprintf('contexto: %s%s, carpeta: %s\\n', nombre, extension, carpeta);
assert(ischar(carpeta));`, 'Rutas independientes del directorio actual'),
      ], [], ['script', 'función', 'archivo m', 'mfilename', 'addpath', 'which']),
    ],
    ['funciones', 'scope', 'argumentos', 'handles', 'scripts'],
  ),
  topic(
    'programacion-io',
    'Entrada, salida y persistencia',
    [
      markdown(`La E/S conecta un cálculo con personas, archivos y otros programas. Separa tres capas: convertir datos internos, transportarlos y presentar resultados. Comprueba siempre aperturas, tamaños y estado de cierre; un archivo externo es una entrada no confiable.`),
      code(`clear;
nombre = 'muestra A';
valores = [2.5, 3.1, 4.8];
fprintf('%s: n=%d, media=%.2f\\n', nombre, numel(valores), mean(valores));
disp('Vector completo:');
disp(valores);`, 'Salida humana breve y verificable'),
      markdown(`Para intercambiar resultados automáticamente prefiere formatos con estructura estable y precisión explícita. Para diagnóstico humano añade unidades, etiquetas y saltos de línea. Nunca construyas una orden de shell pegando texto externo sin validarlo.

**Práctica:** decide qué guardarías en MAT, CSV y texto narrativo para el mismo experimento.`),
      code(`clear;
ruta = [tempname(), '.mat'];
config = struct('semilla', 7, 'unidad', 'm');
resultado = magic(3);
save(ruta, 'config', 'resultado');
recuperado = load(ruta);
unlink(ruta);
assert(isequal(recuperado.resultado, resultado));`, 'Persistir datos estructurados'),
    ],
    [
      topic('programacion-consola', 'disp, printf y formatos', [
        markdown(`disp muestra un valor de forma sencilla. printf y fprintf usan una cadena de formato: %d entero, %g real compacto, %.3f tres decimales, %e científica, %s texto y %% un porcentaje literal. Los valores rellenan el formato por columnas cuando son arreglos.`),
        code(`clear;
etiquetas = {'A', 'B', 'C'};
valores = [pi, 1/3, 12000];
for k = 1:numel(valores)
  printf('%s  fijo=%10.3f  científico=%12.4e\\n', ...
         etiquetas{k}, valores(k), valores(k));
endfor`, 'Anchura y precisión de presentación'),
        markdown(`sprintf devuelve el texto sin imprimirlo, útil para mensajes y rutas. input evalúa por defecto lo escrito; input(prompt,'s') lo recibe como texto y permite validarlo antes de convertir. En automatización, pasa argumentos a funciones en vez de pedir interacción.

Error frecuente: omitir \\n y dejar salidas pegadas en una línea.`),
        code(`clear;
cantidad = 12;
unidad = 'kg';
linea = sprintf('cantidad=%d %s', cantidad, unidad);
disp(linea);
analizado = sscanf('12 3.5', '%d %f');
assert(isequal(analizado, [12; 3.5]));`, 'Formatear y analizar sin interacción'),
      ], [], ['disp', 'printf', 'fprintf', 'sprintf', 'input', 'formato']),

      topic('programacion-archivos-texto', 'Archivos de texto y cierre seguro', [
        markdown(`fopen devuelve un identificador o -1. Indica modo: 'rt' lectura, 'wt' escritura que reemplaza, 'at' anexado. fgetl lee una línea sin salto; fgets lo conserva. fclose libera el recurso. Si una operación intermedia puede fallar, onCleanup garantiza el cierre al abandonar el alcance.`),
        code(`clear;
ruta = [tempname(), '.txt'];
fid = fopen(ruta, 'wt');
assert(fid != -1, 'No se pudo abrir para escribir');
limpieza = onCleanup(@() fclose(fid));
fprintf(fid, 'sensor,valor\\nA,12.5\\nB,9.75\\n');
clear limpieza;
texto = fileread(ruta);
unlink(ruta);
assert(!isempty(strfind(texto, 'A,12.5')));`, 'onCleanup protege el recurso'),
        markdown(`feof solo se vuelve verdadero después de intentar leer más allá del final; el patrón robusto comprueba el resultado de fgetl. Conserva codificación y saltos de línea previstos. Al escribir resultados importantes, considera un temporal y renómbralo solo después de completar.

**Práctica:** ignora líneas vacías y comentarios que empiecen con #.`),
        code(`clear;
ruta = [tempname(), '.txt'];
fid = fopen(ruta, 'wt'); fprintf(fid, 'uno\\n\\n# nota\\ndos\\n'); fclose(fid);
fid = fopen(ruta, 'rt');
lineas = {};
while true
  linea = fgetl(fid);
  if !ischar(linea), break; endif
  linea = strtrim(linea);
  if isempty(linea) || linea(1) == '#', continue; endif
  lineas{end + 1} = linea;
endwhile
fclose(fid); unlink(ruta);
assert(isequal(lineas, {'uno', 'dos'}));`, 'Lectura línea a línea'),
      ], [], ['fopen', 'fclose', 'fgetl', 'onCleanup', 'texto']),

      topic('programacion-binarios', 'Archivos binarios, bytes y endianness', [
        markdown(`fread y fwrite transportan representaciones binarias. Debes acordar clase, orden de bytes y dimensiones; el archivo no los explica por sí solo. Abre con rb/wb y escribe metadatos o usa MAT cuando ambas partes son Octave/MATLAB.`),
        code(`clear;
ruta = [tempname(), '.bin'];
original = single([1.25, -2.5, 10]);
fid = fopen(ruta, 'wb', 'ieee-le');
assert(fid != -1);
fwrite(fid, original, 'single'); fclose(fid);
fid = fopen(ruta, 'rb', 'ieee-le');
recuperado = fread(fid, [1, Inf], 'single=>single'); fclose(fid);
unlink(ruta);
assert(isequal(recuperado, original));`, 'Contrato binario explícito'),
        markdown(`La precisión 'uint8=>uint8' separa la representación almacenada de la clase devuelta. Verifica el conteo de elementos y rechaza archivos truncados. Para registros mixtos define una especificación documentada; no confíes en la representación interna de una estructura.

Error frecuente: leer double lo que se escribió como single: cambia tanto valores como cantidad.`),
        code(`clear;
palabra = uint8('OCTAVE');
ruta = [tempname(), '.bin'];
fid = fopen(ruta, 'wb'); cantidad = fwrite(fid, palabra, 'uint8'); fclose(fid);
fid = fopen(ruta, 'rb'); [bytes, leidos] = fread(fid, cantidad, 'uint8=>uint8'); fclose(fid);
unlink(ruta);
assert(leidos == cantidad && strcmp(char(bytes.'), 'OCTAVE'));`, 'Validar la cantidad leída'),
      ], [], ['fread', 'fwrite', 'binario', 'endianness', 'bytes']),

      topic('programacion-csv-mat', 'CSV, MAT y recursos temporales', [
        markdown(`CSV es intercambio tabular y no conserva por sí mismo clases complejas, estructuras ni todos los metadatos. dlmread/dlmwrite cubren matrices numéricas sencillas. MAT conserva variables de Octave/MATLAB: save selecciona nombres y load devuelve una estructura si se asigna su resultado.`),
        code(`clear;
A = [1.5, 2.25; 3.75, 4.5];
ruta = [tempname(), '.csv'];
dlmwrite(ruta, A, 'delimiter', ',', 'precision', '%.17g');
B = dlmread(ruta, ',');
unlink(ruta);
assert(norm(A - B, Inf) < 1e-14);`, 'CSV numérico con precisión'),
        markdown(`tempname evita colisiones; tempdir informa la ubicación temporal. No uses nombres fijos en pruebas paralelas. Después de crear recursos, elimínalos o usa onCleanup. Al cargar un MAT ajeno, inspecciona whos('-file',ruta) antes de introducir nombres en el workspace.

**Práctica:** guarda configuración, resultados y versión del algoritmo en una sola estructura.`),
        code(`clear;
ruta = [tempname(), '.mat'];
experimento = struct('version', 1, 'x', 0:0.5:2, 'y', (0:0.5:2).^2);
save('-mat7-binary', ruta, 'experimento');
inventario = whos('-file', ruta);
datos = load(ruta, 'experimento');
unlink(ruta);
assert(strcmp(inventario(1).name, 'experimento'));
assert(isequal(datos.experimento.y, experimento.y));`, 'Inspeccionar y cargar selectivamente'),
      ], [], ['csv', 'mat', 'save', 'load', 'tempname', 'recursos']),
    ],
    ['entrada', 'salida', 'archivos', 'CSV', 'MAT', 'recursos'],
  ),
  topic(
    'programacion-calidad',
    'Errores, depuración, pruebas y código mantenible',
    [
      markdown(`Un programa robusto falla de forma informativa cuando se viola su contrato y conserva contexto suficiente para investigar. Distingue errores de programación, entradas inválidas y condiciones externas recuperables. No captures todo para continuar a ciegas: valida, añade contexto y prueba invariantes.`),
      code(`clear;
function y = media_positiva(x)
  validateattributes(x, {'numeric'}, {'vector', 'nonempty', 'finite'});
  if any(x < 0)
    error('manual:valorNegativo', 'Se esperaban valores no negativos');
  endif
  y = mean(x);
endfunction

assert(media_positiva([0, 2, 4]) == 2);`, 'Contrato y error identificable'),
      markdown(`Depurar no es adivinar cambios: reduce el caso, reproduce, inspecciona el primer estado incorrecto y formula una hipótesis verificable. Después convierte el caso mínimo en una prueba para evitar la regresión.

**Práctica:** introduce un error de límite en un bucle, localiza la primera iteración incorrecta y escribe un assert que falle antes del acceso.`),
      code(`clear;
entrada = [3, 1, 4, 1, 5];
esperado = sort(entrada);
obtenido = sort(entrada);
assert(isequal(size(obtenido), size(entrada)));
assert(isequal(obtenido, esperado));
disp('Caso de regresión correcto');`, 'Una reproducción convertida en prueba'),
    ],
    [
      topic('programacion-error-warning-assert', 'error, warning y assert', [
        markdown(`error interrumpe la ruta actual; warning informa y continúa; assert detiene si un invariante es falso. Usa error para impedir un resultado inválido, warning cuando existe una alternativa segura y assert para supuestos internos o pruebas. Un identificador estable, como proyecto:causa, permite distinguir fallos.`),
        code(`clear;
function y = raiz_controlada(x)
  assert(isnumeric(x), 'La entrada debe ser numérica');
  if any(x(:) < 0)
    error('manual:dominio', 'No se admiten negativos reales');
  endif
  if any(x(:) == 0)
    warning('manual:cero', 'La entrada contiene cero');
  endif
  y = sqrt(x);
endfunction

warning('off', 'manual:cero');
assert(isequal(raiz_controlada([0, 4]), [0, 2]));
warning('on', 'manual:cero');`, 'Severidad según la consecuencia'),
        markdown(`Incluye el valor problemático y la unidad cuando ayuden, sin filtrar secretos. No uses assert para validar algo recuperable si necesitas controlar el identificador y el mensaje. warning('query',id) permite conservar y restaurar preferencias.

Error frecuente: desactivar todos los warnings y ocultar degradaciones reales.`),
        code(`clear;
estado = warning('query', 'Octave:divide-by-zero');
unwind_protect
  warning('off', 'Octave:divide-by-zero');
  temporal = 1 / 0;
unwind_protect_cleanup
  warning(estado.state, 'Octave:divide-by-zero');
end_unwind_protect
assert(isinf(temporal));`, 'Restaurar configuración global'),
      ], [], ['error', 'warning', 'assert', 'identificador', 'invariante']),

      topic('programacion-try-catch', 'try/catch y limpieza garantizada', [
        markdown(`try/catch recupera un fallo esperado en una frontera, por ejemplo datos externos. El objeto capturado expone message, identifier y stack. Captura lo mínimo, distingue causas conocidas y vuelve a lanzar lo inesperado con rethrow para no perder la traza.`),
        code(`clear;
ruta = [tempname(), '.mat'];
try
  datos = load(ruta);
catch err
  if !isempty(strfind(err.message, 'unable to find file')) || ...
     !isempty(strfind(err.message, 'No such file'))
    datos = struct('valor', 0);
  else
    rethrow(err);
  endif
end_try_catch
assert(datos.valor == 0);`, 'Recuperar una ausencia prevista'),
        markdown(`onCleanup ejecuta una función al destruirse el objeto, incluso ante return o error. unwind_protect/unwind_protect_cleanup es la alternativa idiomática de Octave. Libera archivos, restaura directorios y revierte opciones globales.

Error frecuente: catch vacío. Silencia la única evidencia y puede convertir corrupción en un resultado aparentemente válido.`),
        code(`clear;
directorio_original = pwd();
temporal = tempname();
mkdir(temporal);
limpieza = onCleanup(@() cd(directorio_original));
cd(temporal);
assert(strcmp(pwd(), temporal));
clear limpieza;
cd(directorio_original);
rmdir(temporal);
assert(strcmp(pwd(), directorio_original));`, 'Restaurar un recurso de proceso'),
      ], [], ['try', 'catch', 'rethrow', 'onCleanup', 'unwind_protect']),

      topic('programacion-debugger', 'Depuración interactiva y trazas', [
        markdown(`dbstop in funcion at línea crea un punto de interrupción; dbstop if error se detiene donde nace un fallo. En pausa, dbstack muestra llamadas, dbup/dbdown cambian de marco, dbstep avanza y dbcont continúa. dbquit abandona. Empieza por el marco más cercano de tu código.`),
        code(`clear;
function salida = capa_exterior(x)
  salida = capa_interior(x) + 1;
endfunction
function salida = capa_interior(x)
  pila = dbstack();
  salida = x.^2;
  assert(numel(pila) >= 1);
endfunction

assert(capa_exterior(3) == 10);`, 'Observar la pila desde una llamada'),
        markdown(`La depuración también puede ser instrumental: imprime forma, clase y rango en puntos elegidos, o guarda un caso mínimo. No inundes el bucle completo; condiciona la observación a la primera anomalía. dbstatus lista puntos y dbclear all los retira.

**Práctica:** usa dbstop if error con una entrada negativa y examina x antes de continuar.`),
        code(`clear;
datos = [3, 4, NaN, 8];
indice_malo = find(!isfinite(datos), 1);
if !isempty(indice_malo)
  fprintf('Primera anomalía en %d: %g\\n', indice_malo, datos(indice_malo));
endif
assert(indice_malo == 3);`, 'Instrumentación dirigida'),
      ], [], ['dbstop', 'dbstack', 'dbstep', 'dbcont', 'breakpoint', 'traza']),

      topic('programacion-pruebas', 'Pruebas unitarias y casos límite', [
        markdown(`Una prueba prepara datos, ejecuta una unidad y verifica propiedades observables. Incluye caso normal, borde, entrada inválida y regresión. Para punto flotante compara con tolerancia: norm(obtenido-esperado,Inf) <= atol + rtol*escala. Fijar semillas hace reproducible el azar.`),
        code(`clear;
function y = normalizar01(x)
  minimo = min(x); maximo = max(x);
  assert(maximo > minimo, 'Se necesitan al menos dos valores distintos');
  y = (x - minimo) ./ (maximo - minimo);
endfunction

y = normalizar01([-5, 0, 5]);
assert(norm(y - [0, 0.5, 1], Inf) < 1e-14);`, 'Propiedades y tolerancia'),
        markdown(`Los archivos .m pueden contener bloques %!test, %!assert, %!error y %!warning ejecutados con test('archivo'). Mantén cada prueba independiente y limpia temporales. Una prueba no demuestra ausencia total de errores; protege comportamientos relevantes y obliga a diseñar contratos claros.

**Práctica:** prueba vector fila, columna, valor repetido, NaN y arreglo vacío.`),
        code(`clear;
rand('state', 42);
muestra1 = rand(1, 5);
rand('state', 42);
muestra2 = rand(1, 5);
assert(isequal(muestra1, muestra2));
assert(all(muestra1 >= 0 & muestra1 <= 1));`, 'Prueba aleatoria reproducible'),
      ], [], ['test', 'prueba', 'assert', 'tolerancia', '%!test', 'regresión']),

      topic('programacion-buenas-practicas', 'Diseño, nombres y refactorización', [
        markdown(`Escribe funciones pequeñas con una responsabilidad, nombres que expresen dominio y unidades visibles. Separa cálculo puro de E/S; así las pruebas no necesitan consola ni archivos. Prefiere datos explícitos a globales y comentarios que expliquen decisiones. Usa indentación consistente y una ruta normal fácil de leer.`),
        code(`clear;
function metros = centimetros_a_metros(centimetros)
  validateattributes(centimetros, {'numeric'}, {'finite'});
  metros = centimetros ./ 100;
endfunction

mediciones_cm = [125, 80, 250];
mediciones_m = centimetros_a_metros(mediciones_cm);
assert(isequal(mediciones_m, [1.25, 0.8, 2.5]));`, 'Unidades en los nombres y lógica pura'),
        markdown(`Refactoriza en pasos verificables: conserva una prueba, extrae una función, vuelve a probar y recién entonces optimiza. Revisa dimensiones en fronteras, evita números mágicos y registra versiones/semillas en resultados científicos.

**Ejercicio integrador:** lee mediciones, valida filas, transforma unidades, resume por columna y guarda datos+configuración. Haz que cada función sea comprobable sin tocar disco.`),
        code(`clear;
function resultado = resumir_columnas(X)
  validateattributes(X, {'numeric'}, {'2d', 'nonempty', 'finite'});
  resultado = struct('n', rows(X), ...
                     'media', mean(X, 1), ...
                     'minimo', min(X, [], 1), ...
                     'maximo', max(X, [], 1));
endfunction

resumen = resumir_columnas([1, 10; 3, 30; 5, 20]);
assert(resumen.n == 3);
assert(isequal(resumen.media, [3, 20]));`, 'Núcleo comprobable de un flujo mayor'),
      ], [], ['buenas prácticas', 'diseño', 'nombres', 'refactorización', 'reproducibilidad']),
    ],
    ['errores', 'warnings', 'assert', 'depuración', 'pruebas', 'buenas prácticas'],
  ),
]
