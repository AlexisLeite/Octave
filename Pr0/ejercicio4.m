function suma = ejercicio4(f, epsilon)
  % EJERCICIO4  Suma f(0)+...+f(N), con N el primer indice f(N)<epsilon.
  % Ejemplo: ejercicio4(@(n) 1 / 2^(n + 1), 1e-4)

  if nargin < 1, f = @(n) 1 / 2^(n + 1); endif
  if nargin < 2, epsilon = 1e-6; endif
  suma = serie2(f, epsilon);
endfunction

function suma = serie2(f, epsilon)
  if epsilon <= 0
    error("epsilon debe ser positivo");
  endif

  n = 0;
  suma = f(n);
  % Se incluye f(N), aun cuando sea menor que epsilon, tal como pide el enunciado.
  while f(n) >= epsilon
    n = n + 1;
    suma = suma + f(n);
  endwhile
endfunction
