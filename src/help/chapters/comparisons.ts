import { type HelpNode, markdown, code, topic } from '../helpTypes'

export const comparisonHelp: HelpNode[] = [
  topic('fundamentos-comparaciones', 'Comparación entre números', [
    markdown(`Comparar puede producir una decisión escalar, una máscara del tamaño de los datos o una comprobación aproximada afectada por el punto flotante. Estos mini-notebooks son independientes: ejecuta un bloque completo, predice el resultado y modifica un caso sin depender del estado de otro bloque.`),
  ], [
    topic('fundamentos-comparaciones-operadores', 'Operadores y máscaras: ==, ~=, <, <=, >, >=', [
      markdown(`Los operadores == (igual), ~= (distinto), <, <=, > y >= devuelven valores logical. Entre escalares producen una decisión; entre arreglos compatibles comparan posición por posición y producen una **máscara**. No resumen el arreglo automáticamente.`),
      code(`clear;
a = 7; b = 10;
assert((a == b) == false);
assert((a ~= b) == true);
assert(a < b && a <= 7 && b > a && b >= 10);
assert(islogical(a < b));`, 'Los seis operadores con escalares'),
      markdown(`Una máscara conserva la forma y sirve para contar, seleccionar o reemplazar. La expansión implícita también se aplica: comparar una columna con una fila genera una matriz. Comprueba las dimensiones si esperabas correspondencia uno a uno.`),
      code(`clear;
x = [-2, 0, 3, 5];
mascara = (x >= 0) & (x < 5);
assert(isequal(mascara, [false, true, true, false]));
assert(isequal(x(mascara), [0, 3]));
assert(nnz(mascara) == 2);`, 'Una comparación produce una máscara'),
      code(`clear;
columna = [1; 3; 5]; fila = [2, 4];
menor = columna < fila;
assert(isequal(size(menor), [3, 2]));
assert(isequal(menor, [true, true; false, true; false, false]));`, 'Expansión implícita al comparar'),
    ], [], ['comparar', 'comparación', 'igual', 'distinto', 'máscara', '==', '~=', '<=', '>=']),

    topic('fundamentos-comparaciones-reduccion', 'De una máscara a una decisión: all y any', [
      markdown(`all responde “¿se cumplen todas?” y any responde “¿se cumple alguna?”. Sin dimensión reducen la primera dimensión no unitaria; sobre una matriz pueden devolver una fila. Para una decisión global, aplana con mascara(:).`),
      code(`clear;
A = [2, 4, 6; 8, 10, 12];
es_par = mod(A, 2) == 0;
assert(all(es_par(:)));
assert(any(A(:) > 10));
assert(isequal(all(A > 0, 1), [true, true, true]));`, 'Reducir explícitamente una máscara'),
      markdown(`No encadenes comparaciones como en la notación matemática. Octave evalúa 0 < x < 1 de izquierda a derecha: primero obtiene ceros y unos y luego los compara con 1. Escribe dos comparaciones completas unidas con &. Usa && solo entre condiciones escalares.`),
      code(`clear;
x = [-2, 0.25, 0.75, 2];
incorrecta = 0 < x < 1;
correcta = (0 < x) & (x < 1);
assert(!isequal(incorrecta, correcta));
assert(isequal(correcta, [false, true, true, false]));`, 'Por qué 0 < x < 1 es incorrecto'),
      code(`clear;
x = [0.1, 0.5, 0.9];
condicion = all(x(:) >= 0) && all(x(:) <= 1);
assert(condicion);
if condicion
  disp('Todos pertenecen a [0, 1]');
endif`, 'Una condición escalar para if'),
    ], [], ['all', 'any', 'comparaciones encadenadas', 'intervalo', '&&', '&']),

    topic('fundamentos-comparaciones-exactas', 'Igualdad exacta: enteros, char y logical', [
      markdown(`== y ~= son apropiados cuando la representación es exacta y el valor es discreto: enteros, logical, caracteres, índices o residuos enteros. En arreglos, == produce una máscara; isequal produce una sola decisión e incluye la forma.`),
      code(`clear;
conteos = int32([3, 5, 8]);
esperados = int32([3, 5, 8]);
bits = logical([1, 0, 1]);
assert(all(conteos == esperados));
assert(isequal(conteos, esperados));
assert(isequal(bits, [true, false, true]));
assert(mod(17, 5) == 2);`, 'Valores discretos comparados exactamente'),
      markdown(`Con char, == compara carácter por carácter y requiere tamaños compatibles. Para textos completos usa strcmp: devuelve una decisión escalar y maneja longitudes diferentes. Reserva == para posiciones o códigos concretos.`),
      code(`clear;
a = 'Octave'; b = 'Octave'; c = 'octave';
assert(all(a == b));
assert(strcmp(a, b));
assert(!strcmp(a, c));
assert(a(1) == 'O' && a(end) == 'e');`, 'Texto completo frente a caracteres'),
      markdown(`Un double admite igualdad exacta cuando representa un entero dentro de su rango exacto o es una copia sin operaciones intermedias. El riesgo comienza con resultados aproximados; no sustituyas indiscriminadamente todo == por una tolerancia.`),
      code(`clear;
indice = 12; copia = indice;
assert(copia == indice);
assert(10 / 2 == 5);
assert(isequal(size(copia), [1, 1]));`, 'Doubles exactamente representables'),
    ], [], ['igualdad exacta', 'integer', 'logical', 'char', 'strcmp', 'isequal']),

    topic('fundamentos-comparaciones-flotantes', 'Punto flotante, representación y eps', [
      markdown(`La mayoría de los decimales no tiene una expansión binaria finita. Operaciones matemáticamente equivalentes pueden terminar en doubles vecinos. == compara exactamente los valores almacenados, que ya incluyen redondeos anteriores.`),
      code(`clear;
a = 0.1 + 0.2; b = 0.3;
diferencia = a - b;
fprintf('a=%.17g, b=%.17g, diferencia=%.3g\\n', a, b, diferencia);
assert(a ~= b);
assert(abs(diferencia) < 1e-15);`, '0.1 + 0.2 y la representación binaria'),
      markdown(`eps(x) aproxima la separación entre x y el siguiente double representable cerca de esa escala; eps sin argumentos es eps(1). No es una tolerancia universal: crece con la magnitud y cerca de cero intervienen números subnormales.`),
      code(`clear;
e_uno = eps(1);
e_grande = eps(1e12);
e_pequeno = eps(1e-12);
assert(e_grande > e_uno);
assert(e_pequeno < e_uno);
assert(1 + e_uno > 1);`, 'eps depende de la escala'),
      code(`clear;
x = 1; y = x + 4 * eps(x);
distancia_en_eps = abs(y - x) / eps(x);
assert(distancia_en_eps == 4);
assert(y > x);`, 'Distancia entre representables'),
    ], [], ['punto flotante', 'error de representación', 'redondeo', 'eps', 'double', '0.1']),

    topic('fundamentos-comparaciones-tolerancia', 'Tolerancia absoluta, relativa y norm', [
      markdown(`Una comparación robusta combina tolerancia absoluta atol, útil cerca de cero, y relativa rtol, útil cuando cambia la escala:

$|a-b| \\le atol + rtol\\,\\max(|a|,|b|)$.

Ambas pertenecen al problema: deben reflejar resolución, error esperado y consecuencias de equivocarse.`),
      code(`clear;
a = 1e8 + 1; b = 1e8;
atol = 1e-12; rtol = 2e-8;
umbral = atol + rtol * max(abs(a), abs(b));
assert(abs(a - b) <= umbral);
assert(abs(a - b) > atol);`, 'Combinar tolerancia absoluta y relativa'),
      code(`clear;
a = 3e-14; b = 0;
atol = 1e-12; rtol = 1e-9;
assert(abs(a - b) <= atol + rtol * max(abs(a), abs(b)));`, 'La tolerancia absoluta cerca de cero'),
      markdown(`Con arreglos decide si la condición debe cumplirse componente a componente o si importa un error agregado. norm mide un error global. Una prueba usual es norm(A-B) <= atol + rtol*max(norm(A),norm(B)).`),
      code(`clear;
A = [1, 2; 3, 4];
B = A + [1e-11, -2e-11; 0, 1e-11];
atol = 1e-10; rtol = 1e-9;
error = abs(A - B);
escala = max(abs(A), abs(B));
assert(all((error <= atol + rtol .* escala)(:)));`, 'Tolerancia componente a componente'),
      code(`clear;
A = [1, 2; 3, 4];
B = A + 1e-10 * [1, -1; 2, -2];
atol = 1e-12; rtol = 1e-9;
error = norm(A - B, 'fro');
referencia = max(norm(A, 'fro'), norm(B, 'fro'));
assert(error <= atol + rtol * referencia);`, 'Comparar arreglos con norm'),
    ], [], ['tolerancia absoluta', 'tolerancia relativa', 'atol', 'rtol', 'norm']),

    topic('fundamentos-comparaciones-estructurales', 'isequal, isequaln, NaN e Inf', [
      markdown(`isequal comprueba contenido y forma completos. A diferencia de all(A(:)==B(:)), no pierde dimensiones. NaN no es igual ni a sí mismo; isequaln considera iguales los NaN en las mismas posiciones.`),
      code(`clear;
fila = [1, 2, 3]; columna = [1; 2; 3];
assert(all(fila(:) == columna(:)));
assert(!isequal(fila, columna));
assert(isequal(fila, [1, 2, 3]));`, 'La forma también importa'),
      code(`clear;
a = [1, NaN, 3]; b = [1, NaN, 3];
assert(NaN ~= NaN);
assert(!isequal(a, b));
assert(isequaln(a, b));
assert(isnan(a(2)));`, 'NaN con isequal e isequaln'),
      markdown(`isnan localiza NaN e isfinite selecciona finitos. Inf sí es igual a Inf del mismo signo y participa del orden extendido, pero Inf-Inf produce NaN. Trata estos valores antes de aplicar tolerancias.`),
      code(`clear;
x = [-Inf, -2, 0, Inf, NaN];
assert(isequal(isfinite(x), [false, true, true, false, false]));
assert(isequal(isnan(x), [false, false, false, false, true]));
assert(Inf == Inf && -Inf < 0 && Inf > 0);
assert(isnan(Inf - Inf));`, 'NaN, Inf y valores finitos'),
    ], [], ['isequal', 'isequaln', 'NaN', 'Inf', 'isfinite', 'isnan']),

    topic('fundamentos-comparaciones-complejos', 'Números complejos: qué significa comparar', [
      markdown(`Para complejos, == y ~= comparan exactamente las partes real e imaginaria. La igualdad aproximada se expresa con abs(z-w), distancia en el plano complejo, y admite tolerancia absoluta más relativa.`),
      code(`clear;
z = 3 + 4i; w = complex(3, 4); u = 3 - 4i;
assert(z == w);
assert(z ~= u);
assert(real(z) == 3 && imag(z) == 4);
assert(abs(z) == 5);`, 'Igualdad y distancia compleja'),
      code(`clear;
z = exp(1i * pi) + 1; w = 0;
atol = 1e-14; rtol = 1e-12;
assert(abs(z - w) <= atol + rtol * max(abs(z), abs(w)));`, 'Tolerancia para un complejo'),
      markdown(`Los complejos no tienen un orden natural equivalente al de los reales. Octave define un criterio para <, <=, > y >=, pero puede no representar tu dominio. Compara abs(z) para magnitud, real(z) o imag(z) para componentes, y angle(z) para fase.`),
      code(`clear;
z = [3+4i, 1+1i, -2i];
assert(isequal(abs(z) > 2, [true, false, false]));
assert(isequal(real(z) > 0, [true, true, false]));`, 'Comparar una propiedad del complejo'),
    ], [], ['complejos', 'complex', 'real', 'imag', 'abs', 'angle', 'magnitud', 'fase']),

    topic('fundamentos-comparaciones-limites', 'Casos límite y errores frecuentes', [
      markdown(`Los vacíos siguen identidades lógicas: all([]) es true y any([]) es false. Si la ausencia de datos es un error, exige ~isempty antes de all.`),
      code(`clear;
x = [];
assert(all(x));
assert(!any(x));
assert(!(!isempty(x) && all(isfinite(x))));`, 'Vacíos: universalidad y existencia'),
      markdown(`+0 y -0 comparan iguales, aunque la división revela su signo. NaN invalida comparaciones ordinarias. Las formas compatibles pueden expandirse silenciosamente. Valida finitud, forma y dominio antes de comparar.`),
      code(`clear;
p = 0.0; n = -0.0;
assert(p == n);
assert((1 / p) > 0 && (1 / n) < 0);
assert(!(NaN < 1) && !(NaN >= 1) && NaN ~= NaN);`, 'Cero con signo y NaN'),
      code(`clear;
observado = [1; 2; 3]; esperado = [1, 2, 3];
comparacion = observado == esperado;
assert(isequal(size(comparacion), [3, 3]));
assert(!isequal(size(observado), size(esperado)));
assert(isequal(observado, esperado.'));`, 'Broadcasting accidental'),
      markdown(`Lista de comprobación: decide máscara o decisión; valida tamaños y finitud; usa igualdad exacta para datos discretos; define atol y rtol desde el dominio; en arreglos elige entre componentes y norm; en complejos explicita la propiedad comparada.`),
      code(`clear;
observado = [0.10000000001, 0.2, 0.3];
esperado = [0.1, 0.2, 0.3];
atol = 1e-12; rtol = 1e-9;
formas_ok = isequal(size(observado), size(esperado));
finitos = all(isfinite(observado(:))) && all(isfinite(esperado(:)));
error = abs(observado - esperado);
umbral = atol + rtol .* max(abs(observado), abs(esperado));
assert(formas_ok && finitos && all(error(:) <= umbral(:)));`, 'Patrón completo de comparación segura'),
    ], [], ['casos límite', 'vacío', 'cero con signo', 'broadcasting accidental', 'errores frecuentes']),
  ], ['comparación numérica', 'operadores relacionales', 'tolerancia', 'punto flotante', 'NaN', 'complejos']),
]
