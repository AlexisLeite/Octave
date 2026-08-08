function resultado = ejercicio7()
  % EJERCICIO7  Polinomios de Taylor en una variable.
  % Se usa h=x-x0. Los coeficientes se dejan tambien como texto legible.

  a = sqrt(17);
  resultado.f1 = "P_3(x) = 1 - x + x^2 - x^3";
  resultado.f2 = "P_4(x) = -(x-pi/2) + (x-pi/2)^3/6";
  resultado.f3 = "P_n(x) = sum_{k=0}^n x^k/k!";
  resultado.f4 = sprintf(["P_23(x) = 1 + 286*sqrt(17) + 1442*h + " ...
                         "170*sqrt(17)*h^2 + 170*h^3 + " ...
                         "5*sqrt(17)*h^4 + h^5, h=x-sqrt(17)"]);

  % Funciones que evaluan los cuatro polinomios pedidos.
  resultado.P1 = @(x) 1 - x + x.^2 - x.^3;
  resultado.P2 = @(x) -(x - pi / 2) + (x - pi / 2).^3 / 6;
  resultado.P3 = @(x, n) taylor_exp(x, n);
  resultado.P4 = @(x) 1 + 286*a + 1442*(x-a) + 170*a*(x-a).^2 + ...
                     170*(x-a).^3 + 5*a*(x-a).^4 + (x-a).^5;
endfunction

function valor = taylor_exp(x, n)
  if n < 0 || n != fix(n)
    error("n debe ser un natural");
  endif
  valor = zeros(size(x));
  for k = 0:n
    valor = valor + x .^ k / factorial(k);
  endfor
endfunction
