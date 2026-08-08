import { type HelpNode, markdown, code, topic } from '../helpTypes'
import { operatorHelp } from './operators'
import { withPedagogicalClosures } from './pedagogicalClosures'
import { valueTypeHelp } from './valueTypes'

const foundationSections: HelpNode[] = [
  topic(
    'fundamentos-sesion',
    '1. Pensar y trabajar en Octave',
    [markdown(`Octave es una calculadora interactiva y un lenguaje de programación numérica. En ambos casos lee sentencias, las evalúa de arriba abajo y conserva valores en el espacio de trabajo. Estos mini-notebooks parten de un runtime nuevo: ejecuta un bloque completo y luego cambia una sola cosa para contrastar tu predicción.`)],
    [
      topic('fundamentos-modelo-ejecucion', 'Primeros pasos y modelo de ejecución', [
        markdown(`Una asignación como $x=3$ crea un nombre para un valor. Una expresión posterior consulta el estado dejado por las líneas anteriores. El punto y coma suprime la **visualización**, no el cálculo; conviene usar nombres explícitos en vez de depender de ans.`),
        code(`clear;
lado = 4;
area = lado^2;
perimetro = 4 * lado;
disp(area);
fprintf('lado=%g, perímetro=%g\\n', lado, perimetro);
whos lado area perimetro`, 'Una sesión observable'),
        markdown(`Error frecuente: creer que una línea silenciosa no se ejecutó. Confírmala con whos o mostrando la variable. Suprime resultados intermedios grandes y muestra solo lo que explica el cálculo.

**Experimento:** cambia lado por 2.5. Predice primero qué resultados cambiarán y qué tipo mostrará class.`),
        code(`clear;
base = 3;
altura = 5;
base = base + 1;
area = base * altura / 2;
assert(area == 10);
fprintf('Después de reasignar base, el área es %.1f\\n', area);`, 'El estado cambia al asignar'),
      ], [], ['sesión', 'ejecución', 'ans', 'punto y coma', 'whos']),

      topic('fundamentos-sintaxis-ayuda', 'Sintaxis, comentarios y ayuda integrada', [
        markdown(`Los paréntesis hacen explícita la precedencia: el producto se evalúa antes que la suma. Un comentario empieza con % o # y llega hasta el final de la línea; debe explicar una intención o decisión, no traducir literalmente el código.`),
        code(`clear;
a = 2; b = 3; c = 4;
implicita = a + b * c;
explicita = a + (b * c);  % El producto ocurre primero.
otra = (a + b) * c;       % Aquí cambia el cálculo.
assert(implicita == explicita && otra == 20);
fprintf('%g frente a %g\\n', implicita, otra);`, 'Precedencia visible'),
        markdown(`La ayuda instalada es parte del entorno: help nombre da una referencia breve, lookfor palabra busca por concepto y type nombre deja inspeccionar muchas funciones. Formula una pregunta, consulta y prueba un caso mínimo.

Error frecuente: pegar comillas “tipográficas”; el código usa comillas rectas. **Pregunta:** ¿qué devuelve sqrt para datos negativos y cómo lo verificarías sin arriesgar un cálculo grande?`),
        code(`clear;
texto = help('sqrt');
primera_linea = strtok(texto, sprintf('\\n'));
disp(primera_linea);
r = sqrt([0, 1, 4, 9]);
assert(isequal(r, [0, 1, 2, 3]));`, 'Consultar y comprobar'),
      ], [], ['sintaxis', 'comentarios', 'help', 'lookfor', 'precedencia']),

      topic('fundamentos-constantes', 'Constantes matemáticas y numéricas', [
        markdown(`Octave ofrece nombres listos para valores universales. **pi** representa la razón entre la circunferencia y su diámetro, mientras que **e** es el número de Euler, base de los logaritmos naturales. Para calcular $e^x$ se recomienda **exp(x)**: funciona tanto con escalares como con arreglos y expresa directamente la operación matemática.

No confundas el número e con la notación científica: 1e-3 significa $1\times10^{-3}$, no $e^{-3}$. Como los nombres pueden ser ocultados por variables, evita asignar valores a pi o e; si ocurre, clear pi o clear e recupera la constante integrada.`),
        code(`clear;
radio = 3;
area = pi * radio^2;
e_al_cuadrado = exp(2);

fprintf('pi = %.15f\\n', pi);
fprintf('e  = %.15f\\n', e);
fprintf('Área = %.6f, e^2 = %.6f\\n', area, e_al_cuadrado);
assert(abs(exp(1) - e) <= eps(e));`, 'Pi, Euler y la función exp'),
        markdown(`Las constantes **i** y **j** representan la unidad imaginaria $\sqrt{-1}$. En código reutilizable es más seguro escribir **1i** o **1j**, porque una variable llamada i o j puede ocultar esos nombres. La identidad de Euler conecta las constantes principales: $e^{i\pi}+1=0$, salvo el pequeño error inevitable del punto flotante.`),
        code(`clear;
z = 3 + 4i;
identidad_euler = exp(1i * pi) + 1;

fprintf('|z| = %g\\n', abs(z));
fprintf('|exp(i*pi)+1| = %.3e\\n', abs(identidad_euler));
assert(abs(z) == 5);
assert(abs(identidad_euler) < 1e-14);`, 'Unidad imaginaria e identidad de Euler'),
        markdown(`**Inf** y **-Inf** representan infinitos con signo; **NaN** representa un resultado numérico indefinido. No los compares con ==: usa isinf, isnan e isfinite. Son valores de punto flotante y pueden propagarse por un cálculo, por lo que conviene validarlos en los límites de entrada y salida.`),
        code(`clear;
datos = [3, Inf, -Inf, NaN, 8];
finitos = datos(isfinite(datos));

assert(isequal(finitos, [3, 8]));
assert(isinf(datos(2)) && isnan(datos(4)));
fprintf('%d finitos, %d infinitos, %d NaN\\n', ...
  nnz(isfinite(datos)), nnz(isinf(datos)), nnz(isnan(datos)));`, 'Infinito, NaN y validación'),
        markdown(`Octave también expone límites de la representación. **eps(x)** es la separación local entre números representables cerca de x; **realmin** y **realmax** delimitan aproximadamente los valores positivos normalizados de double; **flintmax** es el mayor entero consecutivo representable exactamente. Para enteros tipados existen intmin e intmax.

**Criterio:** usa pi, e y exp para fórmulas; 1i para complejos; isfinite para validar; eps como escala de precisión, no como tolerancia universal. **Error frecuente:** comparar resultados calculados con == o creer que realmin es el número negativo más pequeño. **Ejercicio:** calcula $\sin(\pi)$, explica por qué no es exactamente cero y compruébalo con una tolerancia basada en eps.`),
        code(`clear;
limites = [realmin, realmax, flintmax];
error_seno = abs(sin(pi));

fprintf('eps(1) = %.3e\\n', eps(1));
fprintf('realmin = %.3e, realmax = %.3e\\n', realmin, realmax);
fprintf('flintmax = %.0f\\n', flintmax);
assert(error_seno < 2 * eps(pi));
assert(intmax('int8') == 127 && intmin('int8') == -128);`, 'Precisión y límites representables'),
      ], [], [
        'e', 'Euler', 'número de Euler', 'numero de Euler', 'constante de Euler',
        'pi', 'π', 'constantes', 'exp', 'exponencial', 'i', 'j', 'unidad imaginaria',
        'identidad de Euler', 'Inf', 'infinito', 'NaN', 'eps', 'realmin', 'realmax',
        'flintmax', 'intmin', 'intmax', 'límites numéricos',
      ]),

      ...valueTypeHelp,

      topic('fundamentos-conversiones', 'Conversiones, rango y precisión', [
        markdown(`Convertir crea una representación nueva. Al pasar un real a entero se pierde la fracción y el resultado queda limitado por el rango del tipo. Antes de convertir pregunta qué información puede perderse; suele ser sensato calcular en double y convertir en los límites de entrada o salida.`),
        code(`clear;
x = [-2.7, 2.4, 300];
como_int8 = int8(x);
otra_vez_double = double(como_int8);
disp(como_int8);
assert(isa(como_int8, 'int8'));
assert(como_int8(3) == intmax('int8'));
assert(isa(otra_vez_double, 'double'));`, 'Redondeo y saturación'),
        markdown(`str2double interpreta texto; num2str prepara un número para mostrarlo. En cambio, double('12') devuelve códigos de caracteres, no doce. Valida entradas con isfinite o isnan. Para punto flotante evita == tras varios cálculos: comprueba $|a-b|<\varepsilon$ con una tolerancia adecuada.`),
        code(`clear;
texto = '12.5';
valor = str2double(texto);
codigos = double(texto);
etiqueta = num2str(valor, '%.1f');
assert(abs(valor - 12.5) < 1e-12);
assert(isequal(codigos, [49, 50, 46, 53]));
fprintf('valor=%g, texto=%s\\n', valor, etiqueta);`, 'Texto y códigos no son lo mismo'),
      ], [], ['conversión', 'int8', 'str2double', 'precisión']),
    ],
    ['sesión', 'variables', 'tipos', 'ayuda'],
  ),

  topic(
    'fundamentos-indexacion-operadores',
    '3. Seleccionar y calcular con arreglos',
    [markdown(`Indexar responde “¿qué posiciones quiero?”; operar responde “¿qué relación matemática quiero aplicar?”. Separar esas preguntas aclara la diferencia entre selección lineal, subíndices, máscaras y álgebra matricial.`)],
    [
      topic('fundamentos-indexacion-lineal', 'Indexación lineal, subíndices y end', [
        markdown(`Los índices comienzan en 1. A(fila,columna) usa subíndices; A(k) recorre por columnas. end representa el último índice válido en su dimensión y : selecciona toda una dimensión. Por eso A(end,:) significa “última fila completa”.`),
        code(`clear;
A = [10, 20, 30; 40, 50, 60; 70, 80, 90];
centro = A(2, 2);
cuarto_lineal = A(4);
ultima_fila = A(end, :);
borde = A(:, [1, end]);
assert(centro == 50 && cuarto_lineal == 20);
assert(isequal(ultima_fila, [70, 80, 90]));
disp(borde);`, 'Dos sistemas de coordenadas'),
        markdown(`sub2ind convierte coordenadas en índice lineal e ind2sub hace lo inverso. Error frecuente: asumir recorrido por filas y esperar que A(4) sea 40. Usa dos subíndices cuando fila y columna tienen significado.

**Pregunta:** predice la forma de A(:,end:-1:1).`),
        code(`clear;
A = reshape(11:22, 3, 4);
fila = 2; columna = 3;
k = sub2ind(size(A), fila, columna);
[f2, c2] = ind2sub(size(A), k);
invertida = A(:, end:-1:1);
assert(A(k) == A(fila, columna));
assert(f2 == fila && c2 == columna);
assert(isequal(size(invertida), size(A)));`, 'Traducir coordenadas'),
      ], [], ['índice lineal', 'subíndices', 'end', 'sub2ind']),

      topic('fundamentos-indexacion-logica', 'Indexación lógica', [
        markdown(`Una comparación produce una máscara logical. A(mascara) extrae posiciones verdaderas en orden lineal; A(mascara)=valor modifica solo esas posiciones. Así se expresa “datos que cumplen una regla” sin enumerar índices. La máscara debe conservar la correspondencia con los datos.`),
        code(`clear;
datos = [-3, 2, NaN, 7, -1, 4];
es_valido = isfinite(datos) & datos >= 0;
seleccion = datos(es_valido);
assert(isequal(seleccion, [2, 7, 4]));
limpios = datos;
limpios(~isfinite(limpios)) = 0;
limpios(limpios < 0) = 0;
disp(limpios);`, 'Filtrar y reparar'),
        markdown(`find devuelve posiciones numéricas; úsalo solo cuando las necesites. & y | combinan máscaras; && y || cortocircuitan condiciones escalares. Error frecuente: escribir 0<x<1. Octave lo evalúa de izquierda a derecha; escribe (0<x)&(x<1).`),
        code(`clear;
x = [-0.2, 0, 0.25, 0.8, 1, 1.2];
interior = (0 < x) & (x < 1);
posiciones = find(interior);
valores = x(interior);
assert(isequal(posiciones, [3, 4]));
assert(isequal(valores, [0.25, 0.8]));
fprintf('hay %d valores interiores\\n', nnz(interior));`, 'Combinar condiciones'),
      ], [], ['máscara', 'logical', 'find', 'filtrar']),

      topic('fundamentos-indexacion-avanzada', 'Listas de índices, escritura, borrado y N-D', [
        markdown(`Un índice puede ser un escalar, un rango, una lista de enteros positivos o una máscara logical. A([3,1,3]) selecciona en ese orden y puede repetir posiciones. Con dos o más índices, cada dimensión se elige por separado: A(filas,columnas,paginas).

Leer y escribir comparten coordenadas. A(indices)=valor asigna un escalar a todas las posiciones; para varios valores, la cantidad y forma deben ser compatibles. end+1 designa la siguiente posición y permite crecer, aunque en bucles conviene preasignar.`),
        code(`clear;
A = reshape(1:12, 3, 4);
filas = [3, 1];
columnas = [4, 2];
bloque = A(filas, columnas);
assert(isequal(bloque, [12, 6; 10, 4]));

v = [10, 20, 30];
repetidos = v([3, 1, 3]);
assert(isequal(repetidos, [30, 10, 30]));`, 'Seleccionar, reordenar y repetir'),
        markdown(`Asignar [] borra elementos: v(2)=[] acorta un vector y A(:,2)=[] borra una columna completa. En matrices, solo puedes borrar de forma coherente una fila, columna o selección lineal; no dejes un “agujero” rectangular. A(end+1)=x agrega a un vector, mientras A(fila,end+1)=... agrega una columna si las filas son compatibles.

Error frecuente: usar cero, negativos, fracciones o NaN como índices; los índices numéricos empiezan en 1 y deben ser enteros válidos. Otro error es crecer una matriz miles de veces. **Criterio:** listas para posiciones conocidas, máscaras para reglas, find solo si necesitas números de posición. **Ejercicio:** elimina de un vector todos los no finitos, agrega una muestra al final y conserva orientación de fila.`),
        code(`clear;
v = [10, 20, 30, 40];
v(2) = [];
v(end + 1) = 50;
assert(isequal(v, [10, 30, 40, 50]));

A = reshape(1:12, 3, 4);
A(:, 2) = [];
assert(isequal(size(A), [3, 3]));
A(:, end + 1) = [100; 200; 300];
assert(isequal(A(:, end), [100; 200; 300]));`, 'Borrar y crecer deliberadamente'),
        markdown(`En N-D, usa tantos subíndices como ejes quieras distinguir: volumen(:,:,2) selecciona una página. Si das menos índices que dimensiones, Octave combina dimensiones restantes para la indexación; esa regla es potente pero poco obvia. En código pedagógico o reusable, especifica todos los ejes importantes.

La forma del resultado depende del contexto y de la forma de los índices. Si el contrato exige fila o columna, normaliza con x(:) para columna o x(:).' para fila. **Ejercicio:** crea un arreglo 2x3x4, selecciona páginas 4 y 1 en ese orden y reemplaza toda la página 2 por cero.`),
        code(`clear;
volumen = reshape(1:24, [2, 3, 4]);
paginas = volumen(:, :, [4, 1]);
assert(isequal(size(paginas), [2, 3, 2]));
assert(isequal(paginas(:, :, 1), volumen(:, :, 4)));

volumen(:, :, 2) = 0;
pagina_2 = volumen(:, :, 2);
pagina_1 = volumen(:, :, 1);
assert(all(pagina_2(:) == 0));
assert(any(pagina_1(:) != 0));`, 'Indexar páginas N-D'),
      ], [], ['índices', 'lista', 'end+1', 'borrar', 'eliminar', 'crecer', 'N-D', 'páginas', 'asignación indexada']),

      ...operatorHelp,

      topic('fundamentos-broadcasting', 'Broadcasting y compatibilidad dimensional', [
        markdown(`Broadcasting combina dimensiones iguales o unitarias. Una fila $1\times n$ puede aplicarse a cada fila de una matriz $m\times n$; una columna $m\times1$, a cada columna. Desde las últimas dimensiones, cada par debe ser igual o contener un 1.`),
        code(`clear;
A = [10, 20, 30; 40, 50, 60];
offset = [1, 2, 3];
escala = [1; 10];
B = A + offset;
C = A .* escala;
assert(isequal(B, [11, 22, 33; 41, 52, 63]));
assert(isequal(C, [10, 20, 30; 400, 500, 600]));`, 'Expandir dimensiones unitarias'),
        markdown(`Una fila menos una columna puede producir una matriz de todas las diferencias: útil si es deliberado, peligroso si falta una transposición. Valida formas en las entradas. Error frecuente: usar repmat para silenciar incompatibilidades sin comprenderlas; primero escribe las dimensiones esperadas.`),
        code(`clear;
columna = [1; 2; 4];
fila = [10, 20];
diferencias = columna - fila;
assert(isequal(diferencias, [-9, -19; -8, -18; -6, -16]));
A = [1, 2, 3; 4, 5, 6];
centrada = A - mean(A, 1);
assert(all(abs(mean(centrada, 1)) < 1e-12));`, 'Expansión deliberada'),
      ], [], ['broadcasting', 'expansión implícita', 'dimensión unitaria']),
    ],
    ['indexación', 'operadores', 'broadcasting'],
  ),

  topic(
    'fundamentos-datos-compuestos',
    '4. Texto y datos heterogéneos',
    [markdown(`Los arreglos numéricos son homogéneos. Caracteres, celdas y estructuras resuelven necesidades distintas: texto matricial, contenidos heterogéneos y registros con campos nombrados. La representación correcta hace naturales las operaciones posteriores.`)],
    [
      topic('fundamentos-chars-strings', 'Caracteres y strings', [
        markdown(`Las comillas simples crean arreglos char, indexables como vectores. Versiones recientes admiten comillas dobles, pero para ejemplos portables usamos char. Los corchetes concatenan. strcmp compara contenido completo; == compara carácter a carácter.`),
        code(`clear;
saludo = 'hola';
nombre = 'Ada';
mensaje = [saludo, ', ', nombre, '!'];
primera = mensaje(1);
coincide = strcmp(nombre, 'Ada');
assert(isa(mensaje, 'char') && primera == 'h' && coincide);
disp(mensaje);`, 'Texto como arreglo'),
        markdown(`Una matriz char requiere el mismo ancho en cada fila; char rellena con espacios. Para longitudes variables suelen ser mejores las celdas. Error frecuente: usar nombre=='Ada' dentro de if; produce un vector. Usa strcmp. sprintf sirve para presentar y str2double para analizar.`),
        code(`clear;
nombres = char('sol', 'luna');
linea = sprintf('temperatura = %.1f C', 23.75);
recuperado = str2double('23.75');
assert(rows(nombres) == 2 && columns(nombres) == 4);
assert(abs(recuperado - 23.75) < 1e-12);
disp(nombres);
disp(linea);`, 'Relleno y formato'),
      ], [], ['char', 'string', 'strcmp', 'sprintf']),

      topic('fundamentos-celdas', 'Celdas y dos niveles de indexación', [
        markdown(`Una celda puede contener valores de tipos distintos. C(i) devuelve una **celda** y conserva el recipiente; C{i} devuelve su **contenido**. Paréntesis seleccionan recipientes, llaves los abren. Úsalas para heterogeneidad real, no como sustituto automático de matrices.`),
        code(`clear;
C = {pi, 'radio', [1, 2, 3]; true, struct('unidad', 'm'), 42};
recipiente = C(1, 2);
contenido = C{1, 2};
assert(iscell(recipiente));
assert(ischar(contenido) && strcmp(contenido, 'radio'));
assert(C{2, 1} == true);
disp(C);`, 'Seleccionar o abrir'),
        markdown(`cellfun aplica una función a cada contenido; un bucle suele ser más claro si la transformación es compleja. Error frecuente: C{1}={valor}, que anida otra celda. Para guardar valor usa C{1}=valor; para reemplazar el recipiente usa C(1)={valor}.`),
        code(`clear;
palabras = {'Octave', 'es', 'matricial'};
longitudes = cellfun(@numel, palabras);
mayusculas = cellfun(@upper, palabras, 'UniformOutput', false);
assert(isequal(longitudes, [6, 2, 9]));
assert(strcmp(mayusculas{2}, 'ES'));
seleccion = palabras([1, 3]);
assert(iscell(seleccion) && numel(seleccion) == 2);`, 'Operar sobre contenidos'),
      ], [], ['cell', 'celdas', 'llaves', 'cellfun']),

      topic('fundamentos-estructuras', 'Estructuras: datos con nombres', [
        markdown(`Una estructura agrupa campos nombrados. muestra.valor y muestra.unidad son más informativos que posiciones anónimas. Los campos se acceden con punto o dinámicamente mediante muestra.(nombre). Una estructura puede contener arreglos y también puede formar un arreglo de registros.`),
        code(`clear;
muestra.valor = 18.4;
muestra.unidad = 'C';
muestra.valida = true;
campo = 'valor';
assert(muestra.(campo) == 18.4);
assert(isfield(muestra, 'unidad'));
disp(fieldnames(muestra));
fprintf('%.1f %s\\n', muestra.valor, muestra.unidad);`, 'Un registro legible'),
        markdown(`En un arreglo de estructuras, [personas.edad] reúne campos escalares. Error frecuente: asumir que un campo existe; valida entradas externas con isfield. Conserva el mismo esquema en todos los elementos y evita campos dinámicos si nombres fijos comunican mejor el modelo.`),
        code(`clear;
personas(1) = struct('nombre', 'Ada', 'edad', 36);
personas(2) = struct('nombre', 'Linus', 'edad', 54);
edades = [personas.edad];
[~, mayor] = max(edades);
assert(strcmp(personas(mayor).nombre, 'Linus'));
for k = 1:numel(personas)
  fprintf('%s: %d\\n', personas(k).nombre, personas(k).edad);
endfor`, 'Arreglo de registros'),
      ], [], ['struct', 'estructuras', 'campos', 'isfield']),

      topic('fundamentos-modelado-datos', 'Elegir una representación y comprobarla', [
        markdown(`La representación debe favorecer la pregunta principal. Una matriz sirve para cálculos homogéneos; una celda conserva piezas heterogéneas; una estructura nombra roles. Se pueden combinar: una estructura guarda metadatos y un campo contiene una matriz eficiente.

Antes de calcular fija invariantes de forma, unidades, finitud y correspondencia entre etiquetas y columnas.`),
        code(`clear;
experimento.nombre = 'calibración';
experimento.unidades = {'s', 'V'};
experimento.datos = [0, 0.1; 1, 0.9; 2, 2.1; 3, 3.0];
assert(columns(experimento.datos) == numel(experimento.unidades));
assert(all(isfinite(experimento.datos(:))));
tiempo = experimento.datos(:, 1);
voltaje = experimento.datos(:, 2);
pendiente = mean(diff(voltaje) ./ diff(tiempo));
fprintf('pendiente media: %.3f V/s\\n', pendiente);`, 'Metadatos y matriz'),
        markdown(`No existe un contenedor universal: el criterio es qué invariantes quedan claros y qué operaciones son naturales. Error frecuente: mezclar unidades en una columna sin registrarlo.

**Experimentos:** añade un campo operador; agrega una fila y revalida; introduce NaN deliberadamente y observa qué assert detecta el problema.`),
        code(`clear;
registro.etiquetas = {'x', 'y'};
registro.valores = [1, 10; 2, 20; 3, 30];
registro.descripcion = 'relación lineal';
assert(rows(registro.valores) >= 1);
assert(columns(registro.valores) == numel(registro.etiquetas));
x = registro.valores(:, 1);
y = registro.valores(:, 2);
razones = y ./ x;
assert(all(abs(razones - 10) < 1e-12));
disp(registro.descripcion);`, 'Representar, validar, calcular'),
      ], [], ['modelado', 'invariantes', 'metadatos', 'validación']),
    ],
    ['texto', 'celdas', 'estructuras', 'modelado'],
  ),

  topic(
    'fundamentos-arreglos',
    '2. Arreglos, formas y construcción',
    [markdown(`El modelo unificador de Octave es el arreglo. Escalares, vectores y matrices se distinguen principalmente por su forma; dominar orientación, tamaño y orden de almacenamiento evita gran parte de los errores iniciales.`)],
    [
      topic('fundamentos-escalar-vector-matriz', 'Escalares, vectores y matrices', [
        markdown(`Un escalar ocupa $1\times1$. Un vector fila mide $1\times n$ y uno columna, $n\times1$: contienen valores semejantes, pero la orientación cambia productos e indexación. En corchetes, espacios o comas separan columnas y el punto y coma separa filas.`),
        code(`clear;
s = 7;
fila = [1, 2, 3];
columna = [1; 2; 3];
A = [1, 2, 3; 4, 5, 6];
assert(isequal(size(s), [1, 1]));
assert(isequal(size(fila), [1, 3]));
assert(isequal(size(columna), [3, 1]));
assert(isequal(size(A), [2, 3]));`, 'Cuatro formas'),
        markdown(`La transposición cambia orientación. ' transpone y conjuga; .' solo transpone, diferencia importante con complejos. Elige conscientemente una convención de filas o columnas.

Error frecuente: confundir length(A), la dimensión mayor, con numel(A), el total de posiciones.`),
        code(`clear;
v = [2, 4, 6];
w = v.';
A = reshape(1:12, 3, 4);
assert(isequal(size(w), [3, 1]));
assert(numel(A) == 12 && length(A) == 4);
fprintf('A: %d filas, %d columnas\\n', rows(A), columns(A));`, 'Orientación y medidas'),
      ], [], ['escalar', 'vector', 'matriz', 'transpuesta']),

      topic('fundamentos-dimensiones', 'Leer la forma y las dimensiones', [
        markdown(`Lee una forma de izquierda a derecha. En una matriz de tamaño $m\times n$, la dimensión 1 contiene las **filas** y la dimensión 2 las **columnas**. Un escalar mide $1\times1$, un vector fila $1\times n$ y un vector columna $n\times1$. Octave considera que todo arreglo tiene al menos dos dimensiones.

**size(A)** devuelve el vector de longitudes; **size(A,k)** consulta solo el eje $k$. **rows(A)** y **columns(A)** nombran los dos primeros ejes. Empieza por estas funciones antes de estudiar reshape o indexación N-D.`),
        code(`clear;
escalar = 7;
fila = [10, 20, 30, 40];
columna = fila.';
A = zeros(3, 5);
assert(isequal(size(escalar), [1, 1]));
assert(isequal(size(fila), [1, 4]));
assert(isequal(size(columna), [4, 1]));
assert(rows(A) == 3 && columns(A) == 5);
assert(size(A, 1) == 3 && size(A, 2) == 5);`, 'Escalar, fila, columna y matriz'),
        markdown(`Estas medidas responden preguntas distintas:

- **numel(A)**: cantidad total de valores, el producto de la forma.
- **ndims(A)**: cantidad de ejes reportados; nunca es menor que 2 y omite dimensiones unitarias finales.
- **length(A)**: longitud del eje más largo. En matrices suele ser ambiguo; prefiere size o numel.
- **isscalar**, **isvector**, **isrow**, **iscolumn** e **ismatrix**: comprueban la clase de forma que exige tu función.

Error frecuente: decir que una matriz $3\times5$ “tiene tamaño 5” porque length devuelve 5. Su forma sigue siendo $3\times5$ y contiene 15 valores.`),
        code(`clear;
V = zeros(2, 3, 4);
assert(isequal(size(V), [2, 3, 4]));
assert(size(V, 1) == 2 && size(V, 2) == 3 && size(V, 3) == 4);
assert(size(V, 5) == 1);
assert(ndims(V) == 3 && numel(V) == 24 && length(V) == 4);
assert(!isvector(V) && !ismatrix(V));
fprintf('forma: %dx%dx%d; elementos: %d\\n', size(V), numel(V));`, 'Cada función responde una pregunta'),
      ], [], ['dimensiones', 'size', 'rows', 'columns', 'ndims', 'numel', 'length', 'isvector', 'isrow', 'iscolumn', 'forma']),

      topic('fundamentos-construccion', 'Construcción y concatenación', [
        markdown(`zeros, ones y eye hacen explícita la forma y evitan crecer arreglos paso a paso. La concatenación horizontal $[A\ B]$ exige igual número de filas; la vertical $[A;B]$, igual número de columnas.`),
        code(`clear;
Z = zeros(2, 3);
U = ones(2, 1);
I = eye(2);
H = [I, U];
V = [H; 2 * H];
assert(isequal(size(Z), [2, 3]));
assert(isequal(size(H), [2, 3]));
assert(isequal(size(V), [4, 3]));
disp(V);`, 'Bloques compatibles'),
        markdown(`cat generaliza la concatenación y repmat repite patrones. Error frecuente: unir bloques sin escribir antes sus formas. Buena práctica: preasigna con el tipo final si importa, por ejemplo zeros(3,4,'uint8'). Para cálculos, broadcasting suele expresar mejor la intención que repmat.`),
        code(`clear;
patron = [1, 0; 0, 1];
mosaico = repmat(patron, 2, 3);
capa1 = zeros(2, 2);
capa2 = ones(2, 2);
volumen = cat(3, capa1, capa2);
assert(isequal(size(mosaico), [4, 6]));
assert(isequal(size(volumen), [2, 2, 2]));`, 'Repetir y apilar'),
      ], [], ['zeros', 'ones', 'eye', 'cat', 'repmat']),

      topic('fundamentos-cambio-forma', 'Cambiar forma sin cambiar los datos', [
        markdown(`reshape cambia las coordenadas sin cambiar la cantidad ni el orden lineal de los valores. Por eso el producto de la forma nueva debe ser igual a numel(A). Escribe primero la forma de origen y la de destino; luego comprueba ambas con size.`),
        code(`clear;
v = 1:12;
A = reshape(v, 3, 4);
B = reshape(A, 2, 2, 3);
assert(isequal(size(v), [1, 12]));
assert(isequal(size(A), [3, 4]));
assert(isequal(size(B), [2, 2, 3]));
assert(numel(v) == numel(A) && numel(A) == numel(B));`, 'Una cantidad, tres formas'),
        markdown(`Octave almacena y recorre por columnas: **A(:)** toma primero toda la columna 1, luego la 2. reshape conserva exactamente ese orden; no transpone ni “rellena por filas”. **permute** sí cambia el significado de los ejes. **squeeze** elimina ejes unitarios y puede alterar la orientación, así que úsalo solo cuando ese cambio forme parte del contrato.

Error frecuente: aplicar reshape hasta que una operación deje de fallar. **Criterio:** size para observar, reshape para reinterpretar una secuencia, permute para reordenar ejes y transposición para intercambiar fila/columna.`),
        code(`clear;
A = reshape(1:6, 2, 3);
lineal = A(:);
T = permute(A, [2, 1]);
assert(isequal(lineal, (1:6).'));
assert(A(1, 3) == 5);
assert(isequal(size(T), [3, 2]));
assert(T(3, 1) == A(1, 3));`, 'Orden lineal frente a orden de ejes'),
      ], [], ['reshape', 'A(:)', 'permute', 'squeeze', 'orden por columnas', 'cambio de forma']),

      topic('fundamentos-min-max', 'Mínimos y máximos con min y max', [
        markdown(`min y max responden dos preguntas: **qué valor extremo hay** y, opcionalmente, **dónde apareció primero**. Con un vector, min(x) y max(x) devuelven escalares. Con una matriz operan por la primera dimensión no unitaria, normalmente cada columna; el segundo resultado devuelve el índice dentro de esa dimensión.

Sintaxis principal: m=max(x), [m,idx]=max(x), m=max(A,[],dim) y m=max(A,B) para el máximo posición por posición entre dos arreglos compatibles. min ofrece las mismas variantes. El [] ocupa el argumento de comparación para poder indicar dim.`),
        code(`clear;
x = [7, 2, 9, 9, 4];
[mayor, donde_mayor] = max(x);
[menor, donde_menor] = min(x);
assert(mayor == 9 && donde_mayor == 3);
assert(menor == 2 && donde_menor == 2);

limites = [0, 5, 10];
recortados_abajo = max([-2, 7, 8], limites);
assert(isequal(recortados_abajo, [0, 7, 10]));`, 'Valor extremo e índice de la primera aparición'),
        markdown(`Para A de m por n, max(A) devuelve 1 por n; max(A,[],2) devuelve m por 1. Escribe siempre la dimensión en código reutilizable. Para un extremo global, convierte deliberadamente a vector con A(:): [valor,k]=max(A(:)); luego ind2sub traduce k a fila y columna.

GNU Octave ignora NaN cuando hay otro valor numérico en la reducción; si todos son NaN el resultado es NaN. No dependas de eso para limpiar datos: decide si un NaN significa ausente o inválido y valida con isnan/isfinite. Con complejos, min/max comparan primero magnitud y resuelven empates por fase; si querías mayor parte real, exprésalo con real.`),
        code(`clear;
A = [3, 1, 9; 4, 8, 2];
[por_columna, filas] = max(A);
por_fila = max(A, [], 2);
[maximo_global, k] = max(A(:));
[fila, columna] = ind2sub(size(A), k);
assert(isequal(por_columna, [4, 8, 9]));
assert(isequal(filas, [2, 2, 1]));
assert(isequal(por_fila, [9; 8]));
assert(maximo_global == 9 && fila == 1 && columna == 3);`, 'Elegir dimensión y recuperar coordenadas'),
        markdown(`Errores frecuentes: suponer que max(A) busca en toda la matriz; olvidar que un empate devuelve la primera posición; confundir max(A,B) con max(A,[],dim); y usar max para recortar valores sin documentar el límite. En datos complejos, “mayor” debe tener un criterio explícito.

**Criterio:** pide índice solo si necesitas localizar o modificar el extremo; indica dim cuando los ejes tienen significado; usa A(:) para un extremo global. **Ejercicio:** encuentra el mínimo global de una matriz, informa fila y columna, y después calcula el máximo de cada fila ignorando deliberadamente las entradas no finitas mediante una máscara.`),
        code(`clear;
z = [3 + 4i, -6, 1 + 1i];
[extremo, indice] = max(z);
assert(extremo == -6 && indice == 2);  % abs(-6) es el mayor módulo.

datos = [NaN, 4, 2];
assert(max(datos) == 4 && min(datos) == 2);
solo_nan = [NaN, NaN];
assert(isnan(max(solo_nan)) && isnan(min(solo_nan)));`, 'NaN y complejos requieren criterio'),
      ], [], ['max', 'min', 'máximo', 'mínimo', 'extremo', 'índice', 'dimensión', 'NaN', 'complejos']),

      topic('fundamentos-rangos', 'Rangos y muestreo', [
        markdown(`inicio:paso:fin crea una progresión; si se omite el paso vale 1. El extremo solo aparece si pertenece a ella. linspace(inicio,fin,n) es mejor cuando el requisito es una cantidad exacta de muestras, no un paso exacto.`),
        code(`clear;
enteros = 2:6;
pares = 2:2:10;
descenso = 5:-1:1;
muestras = linspace(0, 1, 5);
assert(isequal(enteros, [2, 3, 4, 5, 6]));
assert(isequal(descenso, [5, 4, 3, 2, 1]));
assert(numel(muestras) == 5 && muestras(end) == 1);`, 'Paso frente a cantidad'),
        markdown(`$0.1$ no tiene representación binaria exacta: con pasos decimales usa tolerancias. Error frecuente: 5:1 queda vacío porque el paso avanza en dirección contraria.

**Experimento:** cambia la cantidad de ángulos y observa el error de $\sin^2(x)+\cos^2(x)=1$.`),
        code(`clear;
angulos = linspace(0, 2*pi, 17);
identidad = sin(angulos).^2 + cos(angulos).^2;
error_maximo = max(abs(identidad - 1));
assert(error_maximo < 1e-12);
vacio = 5:1;
assert(isempty(vacio));
fprintf('error máximo: %.3g\\n', error_maximo);`, 'Muestreo y precisión'),
      ], [], ['dos puntos', 'colon', 'linspace', 'rango']),
    ],
    ['arreglos', 'formas', 'construcción', 'rangos'],
  ),
]

export const foundationHelp: HelpNode[] = withPedagogicalClosures([
  foundationSections[0],
  foundationSections[3],
  foundationSections[1],
  foundationSections[2],
])
