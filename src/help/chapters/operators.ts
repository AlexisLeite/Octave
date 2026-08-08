import { type HelpNode, markdown, code, topic } from '../helpTypes'
import { comparisonHelp } from './comparisons'

export const operatorHelp: HelpNode[] = [
  topic(
    'fundamentos-operadores',
    'Operadores: catálogo, significado y precedencia',
    [
      markdown(`Un operador combina o transforma valores. En Octave el símbolo importa, pero también la **forma** y la **intención matemática**: * puede significar producto matricial mientras .* siempre combina posiciones correspondientes. Los paréntesis no son decoración; documentan el orden y evitan depender de una tabla memorizada.

Este capítulo agrupa el catálogo completo: aritmética matricial y elemento a elemento, relaciones, lógica, asignaciones compuestas, incremento/decremento, rangos, transposición y precedencia.`),
      code(`clear;
A = [1, 2; 3, 4];
B = [2, 0; 1, 2];
producto = A * B;
por_posicion = A .* B;
assert(isequal(producto, [4, 4; 10, 8]));
assert(isequal(por_posicion, [2, 0; 3, 8]));`, 'El símbolo responde una pregunta matemática'),
      markdown(`**Método de elección:** escribe primero en palabras la operación —“resolver Ax=b”, “dividir cada muestra”, “todos cumplen”, “avanzar de dos en dos”— y elige después el operador. Si una expresión mezcla familias, añade paréntesis y comprueba size.

Error frecuente: agregar puntos hasta que desaparezca un error dimensional. Eso puede producir un cálculo válido pero distinto. **Ejercicio:** explica antes de ejecutar qué representan A*B, A.*B, A\\B y A./B para dos matrices compatibles.`),
      code(`clear;
x = (1:5).';
y = 2 .* x.^2 - 3 .* x + 1;
mascara = (y >= 0) & isfinite(y);
seleccion = y(mascara);
assert(isequal(y, [0; 3; 10; 21; 36]));
assert(all(seleccion >= 0));`, 'Leer una expresión por capas'),
    ],
    [
      topic('operadores-aritmeticos', 'Aritmética matricial y elemento a elemento', [
        markdown(`+ y - suman o restan arreglos compatibles; los signos unarios +x y -x conservan forma. * es producto matricial y .* multiplica por posiciones. / resuelve X*B=A y \\ resuelve A*X=B; ./ y .\\ dividen por posiciones. ^ y ** son potencia matricial, mientras .^ y .** elevan cada elemento.

Resumen de pares: * / \\ ^ ** expresan álgebra matricial; .* ./ .\\ .^ .** expresan operaciones por elemento. Para escalares, algunas parejas coinciden, pero conserva el símbolo que comunica la generalización correcta.`),
        code(`clear;
A = [3, 1; 1, 2];
b = [9; 8];
x = A \\ b;
assert(norm(A*x - b) < 1e-12);

fila = [2, 4, 8];
mitades = fila ./ 2;
identidad = 1 .\\ fila;
assert(isequal(mitades, [1, 2, 4]));
assert(isequal(identidad, fila));`, 'Resolver no es dividir posiciones'),
        markdown(`A/B equivale conceptualmente a resolver por la derecha; es menos común que A\\b. A^n compone una matriz cuadrada n veces y admite exponentes escalares bajo restricciones; A.^B aplica potencias compatibles. Prefiere A\\b antes que inv(A)*b por precisión y costo.

Broadcasting permite combinar dimensiones iguales o unitarias, también con +, -, .* y ./; verifica que la expansión sea deliberada. Error frecuente: usar x^2 con un vector. **Criterio:** si cada muestra sigue la misma fórmula, usa puntos; si filas y columnas representan espacios lineales, usa álgebra matricial. **Ejercicio:** centra cada columna de A restando mean(A,1) y explica el broadcasting.`),
        code(`clear;
A = [1, 2; 3, 4];
matriz_cuadrada = A^2;
elementos_cuadrados = A.^2;
assert(isequal(matriz_cuadrada, [7, 10; 15, 22]));
assert(isequal(elementos_cuadrados, [1, 4; 9, 16]));

columnas = [1, 10; 3, 14; 5, 18];
centradas = columnas - mean(columnas, 1);
assert(all(abs(mean(centradas, 1)) < 1e-12));`, 'Potencia y expansión compatibles'),
      ], [], ['+', '-', '*', '.*', '/', './', '\\', '.\\', '^', '**', '.^', '.**', 'matricial', 'elementwise']),

      ...comparisonHelp,

      topic('operadores-logicos', 'Lógicos por elemento y cortocircuito', [
        markdown(`& y | combinan arreglos logical posición por posición. ! y ~ niegan y son sinónimos en Octave. && y || producen una decisión escalar y **cortocircuitan**: evalúan la derecha solo si hace falta. Esa diferencia permite proteger accesos o cálculos no válidos.

Las comparaciones ==, !=, ~=, <, <=, > y >= se evalúan antes que los operadores lógicos. != y ~= son dos grafías de “distinto” aceptadas por Octave; ~= es la forma compatible con MATLAB.`),
        code(`clear;
x = [-2, 0, 3, NaN, 8];
en_rango = isfinite(x) & (0 <= x) & (x <= 5);
fuera = !en_rango;
assert(isequal(en_rango, [false, true, true, false, false]));
assert(nnz(fuera) == 3);

misma_mascara = (x != 0) | (x ~= 0);
assert(isequal(misma_mascara, x ~= 0));`, 'Máscaras elemento a elemento'),
        markdown(`Usa & y | para máscaras; usa && y || en if/while con condiciones escalares. all y any reducen una máscara explícitamente. El cortocircuito no es una optimización menor: en !isempty(x) && x(1)>0 evita indexar un arreglo vacío.

Error frecuente: escribir 0<x<1; Octave compara primero 0<x y luego ese logical con 1. Escribe (0<x)&(x<1). Otro error es usar & donde la derecha puede fallar. **Ejercicio:** valida que datos sea vector, no vacío, finito y no negativo usando && para las comprobaciones de estructura y all para el contenido.`),
        code(`clear;
datos = [2, 4, 6];
valido = isvector(datos) && !isempty(datos) ...
         && all(isfinite(datos)) && all(datos >= 0);
assert(valido);

vacio = [];
protegido = !isempty(vacio) && vacio(1) > 0;
alternativa = isempty(vacio) || vacio(1) > 0;
assert(!protegido && alternativa);`, 'Decisiones escalares protegidas'),
      ], [], ['&', '|', '!', '~', '&&', '||', 'cortocircuito', '!=', '~=', 'all', 'any']),

      topic('operadores-asignacion', 'Asignación, formas compuestas e incremento', [
        markdown(`= asigna el valor de la derecha al destino de la izquierda: nombre, elemento indexado, campo o contenido de celda. No es una comparación; para comparar usa ==. La asignación puede encadenarse, pero una línea por nombre suele ser más clara.

Octave admite estas formas compuestas: +=, -=, *=, /=, \\=, ^=, .*=, ./=, .\\=, .^=, &= y |=. x op= y significa x = x op y evaluando el destino una sola vez. Son prácticas en acumuladores, pero varias no son compatibles con MATLAB.`),
        code(`clear;
total = 10;
total += 5;
total -= 3;
total *= 2;
total /= 4;
assert(total == 6);

v = [1, 2, 3];
v .*= 2;
v .^= 2;
assert(isequal(v, [4, 16, 36]));`, 'Asignaciones compuestas'),
        markdown(`++ incrementa uno y -- decrementa uno. En forma prefija, nuevo=++x modifica x y devuelve el valor nuevo; en forma postfija, anterior=x++ devuelve el valor anterior y después modifica x. Evita esconderlos dentro de expresiones largas. Para código compatible con MATLAB, escribe x=x+1.

Error frecuente: escribir if x=3, que asigna en vez de comparar y normalmente produce un error de sintaxis o una decisión equivocada en otros lenguajes. Otro error es usar *= cuando se pretendía .*= sobre una matriz. **Criterio:** formas compuestas para una actualización obvia; asignación explícita cuando ayuda a ver la operación o la portabilidad. **Ejercicio:** implementa el mismo contador con +=, ++ y la forma portable.`),
        code(`clear;
k = 5;
anterior = k++;
nuevo = ++k;
assert(anterior == 5);
assert(nuevo == 7 && k == 7);

bandera = true;
bandera &= (k > 0);
otra = false;
otra |= (k == 7);
assert(bandera && otra);`, 'Prefijo, postfijo y actualización lógica'),
      ], [], ['=', '+=', '-=', '*=', '/=', '\\=', '^=', '.*=', './=', '.\\=', '.^=', '&=', '|=', '++', '--', 'asignación']),

      topic('operadores-rango-transpuesta', 'Dos puntos, end y transposición', [
        markdown(`inicio:fin e inicio:paso:fin crean rangos. Dentro de índices, : selecciona toda una dimensión y end representa su última posición válida. A(:) reúne todos los elementos como columna en orden lineal; no es lo mismo que crear un rango de valores.

El extremo de un rango aparece solo si coincide con la progresión. Un paso positivo con inicio mayor que fin, o negativo en la dirección contraria, produce vacío. linspace(a,b,n) es preferible cuando importa la cantidad exacta de muestras.`),
        code(`clear;
ascenso = 2:5;
pares = 2:2:10;
descenso = 5:-2:1;
vacio = 5:1;
assert(isequal(ascenso, [2, 3, 4, 5]));
assert(isequal(pares, [2, 4, 6, 8, 10]));
assert(isequal(descenso, [5, 3, 1]) && isempty(vacio));

A = reshape(1:6, 2, 3);
assert(isequal(A(:, end), [5; 6]));`, 'Crear y seleccionar con dos puntos'),
        markdown(`' es transposición conjugada: intercambia filas y columnas y conjuga complejos. .' es transposición simple y no conjuga. En datos reales dan el mismo resultado, por eso el error suele permanecer oculto hasta usar complejos. Ambos son operadores postfijos.

**Criterio:** usa ' cuando el concepto es adjunto/producto interno y .' cuando solo reorganizas orientación. Error frecuente: insertar ' para “arreglar dimensiones” sin decidir si debía conjugar. **Ejercicio:** demuestra con un vector complejo que v'*v es real no negativo y compáralo con v.'*v.`),
        code(`clear;
v = [1 + 2i, 3 - 4i];
adjunta = v';
simple = v.';
assert(adjunta(1) == 1 - 2i);
assert(simple(1) == 1 + 2i);

energia = v * v';
sin_conjugar = v * v.';
assert(isreal(energia) && energia >= 0);
assert(energia != sin_conjugar);`, 'Conjugar o solo cambiar orientación'),
      ], [], [':', 'colon', 'rango', 'end', "'", ".'", 'transpuesta', 'conjugada']),

      topic('operadores-precedencia', 'Precedencia y asociatividad sin sorpresas', [
        markdown(`Cuando faltan paréntesis, Octave usa este orden práctico, de mayor a menor:

1. llamadas, indexación, llaves y acceso a campos;
2. incremento/decremento postfijo;
3. transposición y potencias;
4. + y - unarios, !/~, incremento/decremento prefijo;
5. productos y divisiones: *, /, \\, .*, ./, .\\;
6. suma y resta;
7. rango :;
8. relaciones: <, <=, ==, >=, >, !=/~=;
9. &: luego |; después && y finalmente ||;
10. asignación simple o compuesta.

Los paréntesis de una llamada o índice no son el mismo operador que los usados para agrupar, pero ambos hacen visible la estructura.`),
        code(`clear;
a = 2; b = 3; c = 4;
implicita = a + b * c;
explicita = a + (b * c);
otra = (a + b) * c;
assert(implicita == 14 && explicita == 14 && otra == 20);

negada = -2^2;
assert(negada == -(2^2) && negada == -4);`, 'Producto y potencia preceden a suma y signo'),
        markdown(`Operadores del mismo nivel suelen asociar a la izquierda, pero encadenar potencias es una trampa de portabilidad: Octave evalúa 2^3^2 como (2^3)^2. Escribe siempre (2^3)^2 o 2^(3^2) según la intención. Las comparaciones encadenadas tampoco expresan intervalos: usa dos comparaciones unidas por & o &&.

Error frecuente: creer que 1:2+5 significa (1:2)+5; la suma tiene mayor precedencia y resulta 1:(2+5). **Criterio:** parentetiza al mezclar familias, aunque conozcas la tabla. **Ejercicio:** agrega paréntesis a valido = a>0 & b<1 || c==2 para expresar dos interpretaciones diferentes y crea datos que las distingan.`),
        code(`clear;
rango_implicito = 1:2+5;
rango_explicito = 1:(2+5);
assert(isequal(rango_implicito, rango_explicito));

izquierda = 2^3^2;
primero_izquierda = (2^3)^2;
primero_derecha = 2^(3^2);
assert(izquierda == primero_izquierda);
assert(izquierda == 64 && primero_derecha == 512);`, 'Rango y potencias encadenadas'),
      ], [], ['precedencia', 'asociatividad', 'paréntesis', 'orden de evaluación']),
    ],
    ['operadores', 'aritmética', 'lógica', 'comparación', 'precedencia'],
  ),
]
