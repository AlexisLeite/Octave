function resultado = ejercicio2(a, b, x, n)
  % EJERCICIO2  Uso de if: maximo, signo y paridad.

  if nargin < 1, a = 2; endif
  if nargin < 2, b = -3; endif
  if nargin < 3, x = 0; endif
  if nargin < 4, n = 8; endif

  resultado.maximo = maximo(a, b);
  resultado.signo = signo(x);
  resultado.esPar = esPar(n);
endfunction

function valor = maximo(a, b)
  if a >= b
    valor = a;
  else
    valor = b;
  endif
endfunction

function valor = signo(x)
  if x > 0
    valor = 1;
  elseif x == 0
    valor = 0;
  else
    valor = -1;
  endif
endfunction

function valor = esPar(n)
  if n < 0 || n != fix(n)
    error("n debe ser un natural");
  endif
  if mod(n, 2) == 0
    valor = 1;
  else
    valor = 0;
  endif
endfunction
