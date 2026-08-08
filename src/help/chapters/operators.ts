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
    ],
    ['operadores', 'aritmética', 'lógica', 'comparación', 'precedencia'],
  ),
]
