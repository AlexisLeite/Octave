function resultado = ejercicio9()
  % EJERCICIO9  Resolucion por eliminacion gaussiana con pivoteo parcial.

  sistemas = {
    [-1, 1, -1, 1; 4, 2, -1, 5; 1, 1, 1, 5],
    [2, 1, 1, 3; 1, -1, -2, 3; 0, 1, -5, -1],
    [1, 2, -1, 1; 2, 4, -2, 0]
  };

  for i = 1:numel(sistemas)
    [escalonada, solucion, compatible] = gauss(sistemas{i});
    resultado(i).aumentada_escalonada = escalonada;
    resultado(i).compatible = compatible;
    resultado(i).solucion = solucion;
  endfor
  % Resultado esperado: (1/5,3,9/5), (2,-1,0) y sistema incompatible.
endfunction

function [M, x, compatible] = gauss(M)
  [filas, columnas] = size(M);
  variables = columnas - 1;
  pivote = 1;
  for col = 1:variables
    [~, relativa] = max(abs(M(pivote:filas, col)));
    fila_max = pivote + relativa - 1;
    if abs(M(fila_max, col)) < 1e-12
      continue;
    endif
    M([pivote, fila_max], :) = M([fila_max, pivote], :);
    for fila = pivote + 1:filas
      factor = M(fila, col) / M(pivote, col);
      M(fila, :) = M(fila, :) - factor * M(pivote, :);
    endfor
    pivote = pivote + 1;
    if pivote > filas
      break;
    endif
  endfor

  compatible = true;
  for fila = 1:filas
    if all(abs(M(fila, 1:variables)) < 1e-12) && abs(M(fila, end)) >= 1e-12
      compatible = false;
    endif
  endfor
  if !compatible
    x = [];
    return;
  endif

  if rank(M(:, 1:variables)) < variables
    x = "infinitas soluciones";
    return;
  endif
  x = zeros(variables, 1);
  for fila = variables:-1:1
    x(fila) = (M(fila, end) - M(fila, fila + 1:variables) * x(fila + 1:variables)) / M(fila, fila);
  endfor
endfunction
