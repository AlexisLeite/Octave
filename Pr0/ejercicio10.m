function resultado = ejercicio10()
  % EJERCICIO10  Ortonormalizacion de Gram-Schmidt y factorizacion QR.

  A = [2, 3, 0; 2, -1, -2; 0, 0, 1];
  [Q, R] = gram_schmidt(A);
  resultado.A = A;
  resultado.Q = Q;
  resultado.R = R;
  resultado.error_factorizacion = norm(A - Q * R);
  resultado.error_ortogonalidad = norm(Q' * Q - eye(columns(A)));
  % Q = [1/sqrt(2), 1/sqrt(2), 0;
  %      1/sqrt(2),-1/sqrt(2), 0;
  %      0,         0,         1]
  % R = [2*sqrt(2), sqrt(2), -sqrt(2);
  %      0,         2*sqrt(2), sqrt(2);
  %      0,         0,         1]
endfunction

function [Q, R] = gram_schmidt(A)
  [filas, columnas] = size(A);
  Q = zeros(filas, columnas);
  R = zeros(columnas, columnas);
  for j = 1:columnas
    u = A(:, j);
    for i = 1:j-1
      R(i, j) = Q(:, i)' * A(:, j);
      u = u - R(i, j) * Q(:, i);
    endfor
    R(j, j) = norm(u);
    if R(j, j) < 1e-12
      error("las columnas de A deben ser linealmente independientes");
    endif
    Q(:, j) = u / R(j, j);
  endfor
endfunction
