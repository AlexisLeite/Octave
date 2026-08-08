function resultado = ejercicio5(n)
  % EJERCICIO5  Fibonacci y aproximacion al numero aureo.
  % Si r_n=f_(n+1)/f_n, entonces r_n=1+1/r_(n-1). En el limite
  % L=1+1/L, luego L^2-L-1=0 y, por ser positivo, L=(1+sqrt(5))/2.

  if nargin < 1, n = 20; endif
  if n < 0 || n != fix(n)
    error("n debe ser un natural");
  endif

  hasta = max(n, 20);
  f = fibonacci(hasta);
  resultado.fibonacci = f(1:n + 1);
  resultado.cocientes_f1_a_f20 = f(2:21) ./ f(1:20);
  resultado.phi = (1 + sqrt(5)) / 2;
  resultado.error_final = abs(resultado.cocientes_f1_a_f20(end) - resultado.phi);
endfunction

function f = fibonacci(n)
  f = ones(1, n + 1);
  for k = 3:n + 1
    f(k) = f(k - 1) + f(k - 2);
  endfor
endfunction
