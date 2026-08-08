function resultado = ejercicio8()
  % EJERCICIO8  Polinomios de Taylor en varias variables.
  % En el primer caso u=x-1 y v=y-1; se conservan terminos de grado <= 2.

  resultado.y_sobre_x = "P_2(x,y) = 1 + (y-1) - (x-1) + (x-1)^2 - (x-1)*(y-1)";
  resultado.exp_x = "P_4(x,y) = 1 + x + x^2/2 + x^3/6 + x^4/24";
  resultado.P1 = @(x, y) 1 + (y - 1) - (x - 1) + (x - 1).^2 - (x - 1).*(y - 1);
  resultado.P2 = @(x, y) 1 + x + x.^2 / 2 + x.^3 / 6 + x.^4 / 24;
endfunction
