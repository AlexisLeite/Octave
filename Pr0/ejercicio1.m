function resultado = ejercicio1(v, A, fila, n, m)
  % EJERCICIO1  Funciones: norma euclidea, sustitucion e intercambio.
  % Uso: r = ejercicio1(v, A, fila, n, m)
  % Cada campo de r contiene la respuesta de uno de los apartados.

  if nargin < 1, v = [3, 4]; endif
  if nargin < 2, A = [1, 2; 3, 4]; endif
  if nargin < 3, fila = [9, 8]; endif
  if nargin < 4, n = 1; endif
  if nargin < 5, m = rows(A); endif

  resultado.norma = norma(v);
  resultado.sustitucion = sustitucion(A, fila, n);
  resultado.intercambio = intercambio(A, n, m);
endfunction

function valor = norma(v)
  valor = sqrt(sum(v .^ 2));
endfunction

function B = sustitucion(A, v, n)
  if n < 1 || n > rows(A) || n != fix(n)
    error("n debe ser el indice de una fila de A");
  endif
  if !isrow(v) || columns(v) != columns(A)
    error("v debe ser un vector fila con tantas entradas como columnas tiene A");
  endif
  B = A;
  B(n, :) = v;
endfunction

function B = intercambio(A, n, m)
  if any([n, m] < 1) || any([n, m] > rows(A)) || n != fix(n) || m != fix(m)
    error("n y m deben ser indices validos de filas de A");
  endif
  B = A;
  B([n, m], :) = B([m, n], :);
endfunction
