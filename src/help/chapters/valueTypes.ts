import { type HelpNode, markdown, code, topic } from '../helpTypes'

export const valueTypeHelp: HelpNode[] = [
  topic(
    'fundamentos-variables-tipos',
    'Variables, valores y tipos',
    [
      markdown(`Una **variable** es un nombre; el **valor** es el dato asociado y la **clase** dice cómo se representa. Octave no exige declarar una variable antes de asignarla y el mismo nombre puede recibir después otra clase. Esa flexibilidad ayuda a explorar, pero en un programa conviene mantener estable el significado de cada nombre.

El modelo mental es: **clase + forma + contenido**. class informa la clase, size y ndims informan la forma, y whos resume ambas junto con la memoria. isa comprueba una clase concreta; predicados como isnumeric, isfloat, isinteger, islogical, ischar, iscell, isstruct e isobject comprueban familias.`),
      code(`clear;
mediciones = [18.2, 19.1, 20.0];
valida = isfinite(mediciones);
fprintf('clase=%s, forma=%dx%d, bytes=%d\\n', ...
        class(mediciones), rows(mediciones), columns(mediciones), ...
        whos('mediciones').bytes);
assert(isa(mediciones, 'double'));
assert(isnumeric(mediciones) && islogical(valida));`, 'Inspeccionar clase, forma y contenido'),
      markdown(`Asignar b=a copia el valor con semántica de valor: modificar b no modifica a. Convertir con double, single, int16, logical, char u otra función crea una representación nueva; no es una anotación inocua. Antes de convertir pregunta qué rango, precisión o significado puede perderse.

**Criterio:** empieza con double para cálculo numérico general; cambia de clase cuando exista una razón medible de memoria, interoperabilidad o dominio. Error frecuente: llamar sum, mean, pi o i a una variable y ocultar un nombre útil. **Ejercicio:** cambia datos a single, compara whos y calcula el error máximo al volver a double.`),
      code(`clear;
a = [10, 20, 30];
b = a;
b(1) = 99;
assert(a(1) == 10 && b(1) == 99);

x = single(pi);
vuelta = double(x);
fprintf('error al guardar pi en single: %.3g\\n', abs(vuelta - pi));
assert(isa(x, 'single') && isa(vuelta, 'double'));`, 'Copiar y convertir son operaciones distintas'),
    ],
    [
      topic('tipos-flotantes', 'double, single y valores especiales', [
        markdown(`Los literales 3, 2.5 y 1e-6 son double. double usa normalmente 64 bits y ofrece unas 15 cifras decimales significativas; single usa 32 bits y unas 7 cifras. Ambos siguen aritmética de punto flotante: muchos decimales no se representan exactamente.

eps(x) aproxima la distancia al siguiente número representable cerca de x; realmin y realmax describen magnitudes normales extremas, y flintmax el mayor entero consecutivo representable. Inf representa desbordamiento o infinito y NaN un resultado indefinido. isfinite, isinf e isnan deben formar parte de la validación.`),
        code(`clear;
d = 0.1 + 0.2;
s = single(0.1) + single(0.2);
fprintf('double: %.17g, single: %.9g\\n', d, s);
assert(abs(d - 0.3) <= eps(0.3));
assert(abs(double(s) - 0.3) < 1e-6);
assert(flintmax('single') < flintmax('double'));`, 'Precisión según la representación'),
        markdown(`NaN no es igual a sí mismo, por eso se detecta con isnan y no con ==. Inf sí participa en comparaciones, pero suele señalar que debe revisarse el cálculo. Para comparar resultados aproximados usa una tolerancia absoluta y relativa, no ==.

**Criterio:** usa single si el formato externo lo exige o si mediste que memoria/ancho de banda dominan y su precisión alcanza; usa double en los demás cálculos. Error frecuente: reducir a single solo al final y esperar ahorrar la memoria usada durante el cálculo. **Ejercicio:** evalúa eps(single(1)) y eps(1), y explica qué diferencia práctica produce.`),
        code(`clear;
especiales = [0/0, 1/0, -1/0, realmax * 2];
assert(isnan(especiales(1)));
assert(isinf(especiales(2)) && especiales(2) > 0);
assert(isinf(especiales(3)) && especiales(3) < 0);
finitos = especiales(isfinite(especiales));
assert(isempty(finitos));`, 'NaN, Inf y validación'),
      ], [], ['double', 'single', 'eps', 'flintmax', 'NaN', 'Inf', 'isfinite']),

      topic('tipos-enteros', 'Enteros signed y unsigned: clases, rangos y conversión', [
        markdown(`Octave ofrece ocho clases enteras. Las signed int8, int16, int32 e int64 representan desde $-2^{n-1}$ hasta $2^{n-1}-1$. Las unsigned uint8, uint16, uint32 y uint64 representan desde 0 hasta $2^n-1$. intmin('clase') e intmax('clase') consultan límites sin memorizar constantes.

Una matriz tiene una sola clase: [uint8(1), uint8(2)] es uint8. Los enteros son útiles para archivos, imágenes, contadores con contrato externo e identificadores exactos dentro de su rango; no son la opción automática para álgebra numérica.`),
        code(`clear;
clases = {'int8', 'uint8', 'int16', 'uint16', ...
          'int32', 'uint32', 'int64', 'uint64'};
for k = 1:numel(clases)
  nombre = clases{k};
  fprintf('%-6s: %s .. %s\\n', nombre, ...
          num2str(intmin(nombre)), num2str(intmax(nombre)));
endfor
assert(intmin('int8') == -128 && intmax('uint8') == 255);`, 'Las ocho clases y sus límites'),
        markdown(`Al convertir un real a entero, Octave redondea y satura fuera del rango; la fracción y los valores especiales dejan de conservarse. La aritmética entera también puede saturar. Convierte de forma deliberada y valida antes. double puede representar exactamente todos los enteros solo hasta flintmax('double'); convertir uint64 grandes a double puede perder unidades.

**Criterio:** elige el tipo más pequeño cuyo rango cubra el contrato, pero calcula en double si usarás división, factorizaciones o funciones que esperan flotantes. Error frecuente: usar uint para cantidades que pueden restarse y volverse negativas. **Ejercicio:** convierte [-1, 0, 255, 256] a uint8 y explica cada resultado.`),
        code(`clear;
x = [-200, -2.7, 2.4, 2.5, 300];
y = int8(x);
assert(isequal(y, int8([-128, -3, 2, 3, 127])));

grande = intmax('uint64');
como_double = double(grande);
vuelta = uint64(como_double);
fprintf('uint64 exacto tras ida y vuelta: %d\\n', vuelta == grande);
assert(isa(y, 'int8'));`, 'Redondeo, saturación y pérdida de exactitud'),
      ], [], ['int8', 'uint8', 'int16', 'uint16', 'int32', 'uint32', 'int64', 'uint64', 'intmin', 'intmax']),

      topic('tipos-logical', 'logical: verdad, máscaras y condiciones', [
        markdown(`logical solo representa false y true. Las comparaciones producen arreglos logical y estos sirven como máscaras de indexación. logical(x) convierte cero en false y cualquier valor numérico no nulo en true; NaN también es no nulo, de modo que no equivale a “dato válido”.

En if y while, una condición matricial es verdadera solo si no está vacía y todos sus elementos son verdaderos. Para comunicar intención, reduce explícitamente con all o any.`),
        code(`clear;
datos = [-2, 0, 3, NaN];
mascara = isfinite(datos) & datos > 0;
seleccion = datos(mascara);
assert(islogical(mascara));
assert(isequal(mascara, [false, false, true, false]));
assert(isequal(seleccion, 3));`, 'Una máscara expresa una regla'),
        markdown(`& y | trabajan elemento a elemento; && y || exigen decisiones escalares y cortocircuitan la derecha. ! y ~ son negación. No uses logical para codificar estados con más de dos posibilidades: conserva una categoría explícita.

Error frecuente: escribir if x > 0 esperando “algún positivo”; escribe if any(x > 0). **Criterio:** all verifica un contrato universal y any detecta al menos un caso. **Ejercicio:** crea una máscara de valores finitos dentro del intervalo cerrado [0,1].`),
        code(`clear;
x = [2, 4, 6];
todos_pares = all(mod(x, 2) == 0);
hay_mayor_que_cinco = any(x > 5);
seguro = !isempty(x) && all(isfinite(x));
assert(todos_pares && hay_mayor_que_cinco && seguro);

vacio = [];
assert(!(!isempty(vacio) && vacio(1) > 0));`, 'Reducir y cortocircuitar'),
      ], [], ['logical', 'true', 'false', 'all', 'any', 'máscara', 'cortocircuito']),

      topic('tipos-complejos', 'Números complejos y su representación', [
        markdown(`Un complejo $a+bi$ guarda una parte real y una imaginaria, en double o single. Puede escribirse 3+4i, pero complex(3,4) evita depender de que nadie haya reasignado i o j. real e imag extraen componentes; abs da el módulo, angle la fase y conj el conjugado.

Los complejos aparecen naturalmente en raíces, espectros, señales y ecuaciones. No son un error: sqrt(-1) produce un complejo.`),
        code(`clear;
z = complex(3, 4);
assert(real(z) == 3 && imag(z) == 4);
assert(abs(z) == 5);
assert(conj(z) == complex(3, -4));
fprintf('módulo=%g, fase=%g rad\\n', abs(z), angle(z));`, 'Componentes, módulo y fase'),
        markdown(`' calcula la transpuesta conjugada y .' solo transpone. Esa diferencia no se ve en datos reales. La igualdad compleja compara ambas componentes; para resultados aproximados compara abs(z1-z2) con una tolerancia. Los complejos no tienen un orden matemático natural: expresa si quieres ordenar por módulo, fase o parte real.

Error frecuente: usar i como contador y luego escribir 2+3*i creyendo que i sigue siendo la unidad imaginaria. **Ejercicio:** construye las cuatro raíces de z^4=1 y verifica que su cuarta potencia queda a tolerancia de 1.`),
        code(`clear;
v = [1 + 2i, 3 - 4i];
conjugada = v';
simple = v.';
assert(conjugada(1) == 1 - 2i);
assert(simple(1) == 1 + 2i);

raices = exp(1i * (0:3) * pi/2);
assert(all(abs(raices.^4 - 1) < 1e-12));`, 'Transposición y raíces complejas'),
      ], [], ['complex', 'real', 'imag', 'conj', 'abs', 'angle', 'i', 'j']),

      topic('tipos-texto', 'char, comillas y compatibilidad de strings', [
        markdown(`En GNU Octave, el texto básico es un arreglo **char**. Tanto 'hola' como "hola" producen char en las versiones actuales; las comillas dobles permiten ciertas secuencias de escape, pero no crean la clase string de MATLAB. Octave no implementa de forma general esa clase string: para código portable usa char, matrices char o celdas de char.

Un char se indexa como cualquier arreglo. Una matriz char debe tener igual cantidad de columnas por fila; char('sol','luna') rellena con espacios. Una celda {'sol','luna'} conserva longitudes diferentes. ischar, iscellstr y class permiten inspeccionar la representación.`),
        code(`clear;
palabra = 'Octave';
otra = "Octave";
assert(ischar(palabra) && ischar(otra));
assert(strcmp(palabra, otra));
assert(palabra(1) == 'O' && numel(palabra) == 6);

filas = char('sol', 'luna');
assert(isequal(size(filas), [2, 4]));`, 'El texto de Octave es char'),
        markdown(`strcmp y strcmpi comparan textos completos; == compara carácter a carácter y devuelve una máscara. str2double analiza números escritos como texto; num2str y sprintf producen texto para presentar. char(65) interpreta un código y double('A') devuelve 65: ninguna de esas dos operaciones analiza el número “65”.

**Criterio:** usa char para una pieza de texto y cellstr para una colección de longitudes variables. Error frecuente al migrar desde MATLAB: esperar que "a" + "b" concatene strings; en Octave son char y + opera sobre códigos numéricos. Concatena con [a,b] o sprintf. **Ejercicio:** transforma {'rojo','verde'} a mayúsculas con cellfun y UniformOutput=false.`),
        code(`clear;
texto = '12.50';
numero = str2double(texto);
codigos = double(texto);
etiqueta = sprintf('valor = %.1f', numero);
assert(abs(numero - 12.5) < 1e-12);
assert(isequal(codigos, [49, 50, 46, 53, 48]));
assert(strcmp(etiqueta, 'valor = 12.5'));

nombres = {'Ada', 'Linus'};
assert(iscellstr(nombres));`, 'Analizar no es convertir códigos'),
      ], [], ['char', 'string', 'comillas', 'cellstr', 'strcmp', 'str2double', 'compatibilidad MATLAB']),

      topic('tipos-arreglos-nd', 'Arreglos N-D: forma, páginas y dimensiones unitarias', [
        markdown(`Un arreglo N-D sigue siendo homogéneo: todos sus elementos comparten clase. La tercera dimensión puede pensarse como páginas de una matriz; dimensiones posteriores generalizan la idea. zeros(2,3,4) crea 4 páginas de 2 por 3 y A(:,:,k) selecciona una.

size informa longitudes por dimensión, ndims la cantidad de dimensiones reportadas y numel el total de elementos. reshape cambia la forma conservando el orden lineal por columnas; permute reordena dimensiones y squeeze elimina dimensiones unitarias.`),
        code(`clear;
A = reshape(1:24, [2, 3, 4]);
pagina_2 = A(:, :, 2);
assert(isequal(size(A), [2, 3, 4]));
assert(ndims(A) == 3 && numel(A) == 24);
assert(isequal(pagina_2, [7, 9, 11; 8, 10, 12]));

por_paginas = sum(A, 3);
assert(isequal(size(por_paginas), [2, 3]));`, 'Páginas de un arreglo tridimensional'),
        markdown(`Las dimensiones unitarias tienen longitud 1 y son importantes para broadcasting. reshape(A,2,1,3) y reshape(A,2,3) contienen lo mismo, pero comunican contratos diferentes. squeeze puede cambiar una fila en columna o eliminar ejes que tenían significado, así que verifica size antes y después.

**Criterio:** usa N-D cuando cada eje tiene un significado uniforme —fila, columna, canal, tiempo— y documenta ese orden. Error frecuente: asumir que reshape transpone o reordena valores; solo cambia las coordenadas. **Ejercicio:** crea datos de tamaño 4x3x2, intercambia los dos primeros ejes con permute y predice la nueva forma.`),
        code(`clear;
datos = reshape(1:24, [2, 3, 4]);
reordenados = permute(datos, [2, 1, 3]);
restaurados = ipermute(reordenados, [2, 1, 3]);
assert(isequal(size(reordenados), [3, 2, 4]));
assert(isequal(restaurados, datos));

con_eje = reshape(1:6, [2, 1, 3]);
sin_eje = squeeze(con_eje);
assert(isequal(size(sin_eje), [2, 3]));`, 'Reordenar dimensiones deliberadamente'),
      ], [], ['N-D', 'ndims', 'reshape', 'permute', 'ipermute', 'squeeze', 'páginas']),

      topic('tipos-sparse', 'Matrices sparse: misma álgebra, otro almacenamiento', [
        markdown(`Una matriz sparse guarda principalmente posiciones y valores no nulos. No es una clase numérica separada: class(sparse(...)) puede seguir siendo double; se detecta con issparse. sparse(i,j,v,m,n) construye una matriz desde tripletas y spalloc reserva capacidad aproximada.

El ahorro aparece cuando casi todo es cero y el algoritmo conserva dispersidad. nnz cuenta no nulos y nzmax la capacidad almacenada. full materializa todos los ceros y puede multiplicar drásticamente la memoria.`),
        code(`clear;
i = [1, 2, 3, 4];
j = [1, 2, 3, 4];
v = [10, 20, 30, 40];
S = sparse(i, j, v, 4, 4);
assert(issparse(S) && isa(S, 'double'));
assert(nnz(S) == 4 && S(3, 3) == 30);
assert(isequal(full(S), diag(v)));
fprintf('no nulos: %d de %d posiciones\\n', nnz(S), numel(S));`, 'Construir desde tripletas'),
        markdown(`Operaciones como S*x y S\\b aprovechan estructura sparse; mezclar con ciertas matrices densas o aplicar funciones que llenan los ceros puede producir una matriz full. sparse conviene por patrón, no por tamaño aislado. Una matriz pequeña o con muchos no nulos suele ser más simple como full.

**Criterio:** considera sparse si nnz(A)/numel(A) es muy bajo y mide el flujo completo. Error frecuente: crear primero una matriz full enorme para convertirla después; construye por tripletas. **Ejercicio:** arma la matriz tridiagonal de tamaño 100 con spdiags y comprueba nnz.`),
        code(`clear;
n = 6;
e = ones(n, 1);
T = spdiags([-e, 2*e, -e], -1:1, n, n);
b = ones(n, 1);
x = T \\ b;
assert(issparse(T));
assert(nnz(T) == 3*n - 2);
assert(norm(T*x - b) < 1e-12);

densa = full(T);
assert(!issparse(densa));`, 'Resolver sin perder dispersidad'),
      ], [], ['sparse', 'issparse', 'spalloc', 'spdiags', 'nnz', 'nzmax', 'full']),

      topic('tipos-contenedores', 'cell y struct: heterogeneidad y significado', [
        markdown(`Una matriz numérica o char es homogénea. Una **cell** puede guardar contenidos de clases y formas distintas; una **struct** agrupa campos con nombre. class devuelve cell o struct, e iscell/isstruct los reconocen.

En C(i) los paréntesis seleccionan recipientes y el resultado sigue siendo cell; C{i} abre recipientes y devuelve su contenido. En una estructura, s.campo accede a un campo conocido y s.(nombre) usa un nombre calculado. Los arreglos de estructuras repiten el mismo esquema para varios registros.`),
        code(`clear;
C = {pi, 'radio', [1, 2, 3]};
recipiente = C(2);
contenido = C{2};
assert(iscell(C) && iscell(recipiente));
assert(ischar(contenido) && strcmp(contenido, 'radio'));

C{1} = 3.14;
C(3) = {[10, 20]};
assert(isequal(C{3}, [10, 20]));`, 'Paréntesis conservan; llaves abren'),
        markdown(`**Criterio de elección:** usa matriz para datos homogéneos que calcularás juntos; cell para piezas realmente heterogéneas o textos de longitudes variables; struct para un registro cuyos roles merecen nombres. Combínalos cuando ayude: una struct puede contener una matriz de mediciones y una celda de etiquetas.

Errores frecuentes: C{1}={x} crea una celda anidada; acceder a un campo inexistente falla; y un arreglo de structs con esquemas inconsistentes es difícil de procesar. Valida con isfield y fieldnames. **Ejercicio:** modela tres sensores con nombre, unidad y vector de lecturas; decide si conviene struct de arreglos o arreglo de structs y justifica la consulta principal.`),
        code(`clear;
experimento.nombre = 'calibración';
experimento.unidades = {'s', 'V'};
experimento.datos = [0, 0.1; 1, 1.0; 2, 1.9];
assert(isstruct(experimento));
assert(isfield(experimento, 'datos'));
assert(columns(experimento.datos) == numel(experimento.unidades));

personas = struct('nombre', {'Ada', 'Linus'}, 'edad', {36, 54});
assert(isequal([personas.edad], [36, 54]));`, 'Campos y arreglos de registros'),
      ], [], ['cell', 'struct', 'iscell', 'isstruct', 'fieldnames', 'isfield', 'heterogéneo']),

      topic('tipos-function-handles', 'function_handle: funciones como valores', [
        markdown(`Un **function_handle** permite guardar y pasar una función. @sin referencia una función existente; @(x) x.^2 crea una función anónima de una expresión. class devuelve function_handle, isa(f,'function_handle') lo comprueba y functions(f) inspecciona metadatos.

Se invoca con paréntesis como cualquier función. Los handles hacen posible que integradores, optimizadores, ordenadores y utilidades reciban comportamiento como argumento.`),
        code(`clear;
f = @sin;
g = @(x) x.^2 + 1;
x = [0, pi/2, pi];
assert(isa(f, 'function_handle'));
assert(all(abs(f(x) - [0, 1, 0]) < 1e-12));
assert(isequal(g(0:2), [1, 2, 5]));
disp(functions(g).type);`, 'Referenciar y crear funciones'),
        markdown(`Una función anónima captura el valor de variables externas en el momento de crear el handle. Para lógica de varias sentencias, validación o varias salidas, escribe una función con nombre. Usa func2str para mostrar un handle; evita str2func con texto externo no validado.

**Criterio:** handle anónimo para una fórmula corta; handle a función con nombre para comportamiento reutilizable o complejo. Error frecuente: escribir f=@(x) x^2 y pasar un vector; si la fórmula es por elemento necesita x.^2. **Ejercicio:** crea una familia f_a(x)=exp(-a*x) capturando a y comprueba qué ocurre si reasignas a después.`),
        code(`clear;
factor = 3;
escala = @(x) factor .* x;
factor = 10;  % No cambia el valor ya capturado por escala.
assert(escala(2) == 6);

aplicar = @(f, x) f(x);
resultado = aplicar(@(t) t.^3, 1:4);
assert(isequal(resultado, [1, 8, 27, 64]));`, 'Captura y funciones de orden superior'),
      ], [], ['function_handle', 'handle', 'anónima', '@', 'functions', 'func2str', 'callback']),

      topic('tipos-objetos', 'Clases y objetos: datos con comportamiento', [
        markdown(`Un objeto pertenece a una clase definida por el usuario o una biblioteca. class(obj) devuelve el nombre de esa clase; isobject distingue objetos, properties lista propiedades visibles y methods lista métodos. A diferencia de struct, una clase puede validar invariantes, ocultar representación y asociar operaciones.

La sintaxis de una clase nueva se guarda normalmente en un archivo con el mismo nombre:

~~~octave
classdef Termometro
  properties
    celsius
  endproperties
  methods
    function obj = Termometro(valor)
      assert(isscalar(valor) && isfinite(valor));
      obj.celsius = valor;
    endfunction
    function f = fahrenheit(obj)
      f = obj.celsius * 9/5 + 32;
    endfunction
  endmethods
endclassdef
~~~

El constructor crea el objeto; punto accede a propiedades y obj.metodo(args) o metodo(obj,args) invoca métodos.`),
        code(`clear;
colores = containers.Map({'rojo', 'verde'}, {1, 2});
assert(isobject(colores));
assert(strcmp(class(colores), 'containers.Map'));
assert(colores('verde') == 2);
colores('azul') = 3;
assert(isKey(colores, 'azul'));
disp(keys(colores));`, 'Usar un objeto de biblioteca'),
        markdown(`Las clases **value** se copian al asignar; una clase que hereda de handle comparte identidad mutable. Esa decisión cambia el modelo mental y debe ser deliberada. Para datos simples y públicos, struct suele bastar; usa classdef cuando necesitas invariantes, comportamiento polimórfico o una API estable.

Errores frecuentes: poner varias clases públicas en cualquier archivo, mutar un objeto handle suponiendo que era una copia, o acceder a propiedades privadas. Consulta help classdef, methods y properties. **Ejercicio:** guarda el ejemplo Termometro en Termometro.m, crea dos valores y agrega un método es_fiebre con un umbral explícito.`),
        code(`clear;
p = inputParser();
p.addRequired('datos', @(x) isnumeric(x) && isvector(x));
p.addParameter('escala', 1, @(x) isscalar(x) && x > 0);
p.parse([1, 2, 3], 'escala', 2);
opciones = p.Results;
assert(isobject(p) && strcmp(class(p), 'inputParser'));
assert(isequal(opciones.datos, [1, 2, 3]));
assert(opciones.escala == 2);`, 'Un objeto que protege un contrato'),
      ], [], ['classdef', 'class', 'object', 'isobject', 'properties', 'methods', 'handle class', 'constructor']),
    ],
    ['variables', 'tipos', 'class', 'isa', 'whos', 'conversión'],
  ),
]
