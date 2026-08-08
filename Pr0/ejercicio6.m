function resultado = ejercicio6(m)
  % EJERCICIO6  Sucesiones de Collatz. La cota evita un ciclo infinito.
  % Para las semillas 1,...,999 el maximo es m=871 y son 178 pasos.

  if nargin < 1, m = 1; endif
  resultado.sucesion = collatz(m);
  resultado.pasos = numel(resultado.sucesion) - 1;

  pasos = zeros(1, 999);
  for semilla = 1:999
    pasos(semilla) = numel(collatz(semilla)) - 1;
  endfor
  [resultado.maximo_pasos_menor_1000, resultado.semilla_maxima] = max(pasos);
  resultado.verificado_menos_de_200 = all(pasos < 200);
endfunction

function sucesion = collatz(m)
  if m < 1 || m != fix(m)
    error("m debe ser un natural positivo");
  endif
  max_pasos = 1000;
  sucesion = m;
  pasos = 0;
  while sucesion(end) != 1 && pasos < max_pasos
    actual = sucesion(end);
    if mod(actual, 2) == 0
      siguiente = actual / 2;
    else
      siguiente = 3 * actual + 1;
    endif
    sucesion(end + 1) = siguiente;
    pasos = pasos + 1;
  endwhile
  if sucesion(end) != 1
    error("se alcanzo la cota de %d pasos sin llegar a 1", max_pasos);
  endif
endfunction
