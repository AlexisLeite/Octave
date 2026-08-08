function resultado = ejercicio3(A, f, N)
  % EJERCICIO3  Uso de for: maximo de una matriz y suma parcial de serie.
  % f debe ser un function handle; por ejemplo @(k) 1 / (k + 1)^2.

  if nargin < 1, A = [1, -4; 7, 2]; endif
  if nargin < 2, f = @(k) 1 / (k + 1)^2; endif
  if nargin < 3, N = 10; endif

  resultado.maximo = maximo(A);
  resultado.serie = serie(f, N);
endfunction

function valor = maximo(A)
  if isempty(A)
    error("A no puede ser vacia");
  endif
  valor = A(1);
  for i = 1:numel(A)
    if A(i) > valor
      valor = A(i);
    endif
  endfor
endfunction

function suma = serie(f, N)
  if N < 0 || N != fix(N)
    error("N debe ser un natural");
  endif
  suma = 0;
  for n = 0:N
    suma = suma + f(n);
  endfor
endfunction
