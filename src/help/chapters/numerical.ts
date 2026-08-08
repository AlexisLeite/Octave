import { code, markdown, topic, type HelpNode } from '../helpTypes'
import { withPedagogicalClosures } from './pedagogicalClosures'

export const numericalHelp: HelpNode[] = withPedagogicalClosures([
  topic('numeric-linear', 'Álgebra lineal numérica', [
    markdown(String.raw`Octave usa matrices como modelo central. Antes de calcular, revisa dimensiones, escala y estructura. Evalúa una solución por su residuo $\lVert Ax-b\rVert$, no solo por los dígitos impresos.`),
    code(`A = [4, -1; 2, 5];
b = [7; 3];
x = A \\ b;
residuo_relativo = norm(A*x-b) / norm(b)`, 'Resolver y verificar'),
    markdown(String.raw`Prefiere $A\backslash b$ frente a $A^{-1}b$: cuesta menos, evita formar la inversa y permite que Octave elija un solver según la estructura.`),
  ], [
    topic('numeric-systems', 'Sistemas y mínimos cuadrados', [
      markdown(String.raw`En un sistema cuadrado, la barra inversa resuelve $Ax=b$. Si hay más filas que columnas, obtiene la solución de mínimos cuadrados que minimiza $\lVert Ax-b\rVert_2$. Verifica rango y residuo.`),
      code(`A = [1,0; 1,1; 1,2; 1,3];
b = [1.1; 2.0; 2.9; 4.2];
coef = A \\ b;
pred = A*coef;
[coef, norm(b-pred), rank(A)]`, 'Ajuste lineal'),
      markdown(String.raw`Un sistema de rango deficiente no determina todos los parámetros. pinv produce una solución de norma mínima, pero el modelo sigue sin identificar direcciones del espacio de parámetros.`),
      code(`A = [1,2,3; 2,4,6];
b = [1;2];
x = pinv(A)*b;
[rank(A), x, norm(A*x-b)]`, 'Rango deficiente'),
    ], [], ['backslash', 'residuo', 'mínimos cuadrados', 'pinv']),
    topic('numeric-factorizations', 'LU, QR y Cholesky', [
      markdown(String.raw`LU sirve para matrices cuadradas generales; QR para mínimos cuadrados; Cholesky aprovecha matrices simétricas definidas positivas. Factoriza una vez cuando resolverás varios términos independientes.`),
      code(`A = [4,2,0; 2,5,1; 0,1,3];
[L,U,P] = lu(A);
R = chol(A);
[norm(P*A-L*U), norm(A-R'*R)]`, 'Verificar factorizaciones'),
      markdown(String.raw`El pivoteo $P$ evita divisiones por elementos pequeños. Para varios $b$, reutilizar factores separa el costo de analizar $A$ del de cada resolución.`),
      code(`A = [3,-1,0; -1,3,-1; 0,-1,3];
B = [1,0; 0,1; 1,1];
[L,U,P] = lu(A);
X = U \\ (L \\ (P*B));
norm(A*X-B)`, 'Reutilizar LU'),
    ], [], ['lu', 'qr', 'chol', 'pivoteo']),
    topic('numeric-spectrum', 'Autovalores, SVD y condicionamiento', [
      markdown(String.raw`Los pares propios cumplen $Av=\lambda v$. La SVD $A=U\Sigma V^*$ revela rango y direcciones sensibles. Un número de condición grande advierte que pequeñas perturbaciones pueden amplificarse.`),
      code(`A = [2,1; 1,2];
[V,D] = eig(A);
[diag(D), norm(A*V-V*D), norm(V'*V-eye(2))]`, 'Verificar pares propios'),
      markdown(String.raw`Conservando los $k$ mayores valores singulares se obtiene la mejor aproximación de rango $k$ en norma 2; su error es $\sigma_{k+1}$.`),
      code(`A = magic(8);
[U,S,V] = svd(A);
k = 2;
Ak = U(:,1:k)*S(1:k,1:k)*V(:,1:k)';
[cond(A), norm(A-Ak,2), S(k+1,k+1)]`, 'Rango bajo y condición'),
      markdown(String.raw`Las matrices dispersas evitan memoria cuadrática cuando predominan los ceros. Construye directamente con sparse o spdiags y evita convertir a full.`),
      code(`n = 1000;
e = ones(n,1);
S = spdiags([-e,2*e,-e], -1:1, n, n);
x = S \\ ones(n,1);
[issparse(S), nnz(S), norm(S*x-ones(n,1))]`, 'Sistema disperso'),
    ], [], ['eig', 'svd', 'cond', 'sparse', 'rango']),
  ], ['matrices', 'sistemas', 'factorizaciones', 'autovalores']),

  topic('numeric-calculus', 'Cálculo numérico', [
    markdown(String.raw`Los métodos numéricos aproximan objetos continuos con operaciones finitas. El resultado depende del método, la tolerancia, la discretización y la regularidad del problema. Acompaña el número con una verificación de error.`),
    code(`f = @(x) exp(-x.^2);
x = linspace(0,1,21);
aprox = trapz(x,f(x));
referencia = quad(f,0,1);
[aprox, referencia, abs(aprox-referencia)]`, 'Discretización y error'),
  ], [
    topic('numeric-roots-derivatives', 'Raíces y derivadas', [
      markdown(String.raw`fzero busca $f(x)=0$. Un intervalo con cambio de signo brinda una garantía que un punto inicial no ofrece. Inspecciona $|f(x)|$ y prueba casos con raíces múltiples.`),
      code(`f = @(x) cos(x)-x;
[raiz, valor, info] = fzero(f,[0,1]);
[raiz, valor, info]`, 'Raíz acotada'),
      markdown(String.raw`La diferencia central tiene error de truncamiento $O(h^2)$, pero un $h$ demasiado pequeño amplifica el redondeo al restar números cercanos.`),
      code(`f = @(x) exp(x);
h = 10.^(-(1:12));
d = (f(1+h)-f(1-h))./(2*h);
[h(:), abs(d-exp(1))(:)]`, 'Paso óptimo'),
    ], [], ['fzero', 'gradient', 'derivada', 'truncamiento']),
    topic('numeric-integration-interpolation', 'Integración e interpolación', [
      markdown(String.raw`quad adapta evaluaciones de una función; trapz integra datos ya muestreados. Un estudio de convergencia repite el cálculo al refinar la grilla y estima el orden observado.`),
      code(`ns = [10,20,40,80];
err = zeros(size(ns));
for k = 1:numel(ns)
  x = linspace(0,pi,ns(k)+1);
  err(k) = abs(trapz(x,sin(x))-2);
endfor
[ns(:), err(:)]`, 'Convergencia de trapecios'),
      markdown(String.raw`Interpolar obliga a pasar por los datos; ajustar modela una tendencia con ruido. pchip preserva mejor la forma y spline prioriza suavidad; grados polinómicos altos pueden oscilar.`),
      code(`x = [0,1,2,3,4]; y = [0,1,1.1,1.2,2];
xi = 0:0.5:4;
lineal = interp1(x,y,xi,'linear');
forma = interp1(x,y,xi,'pchip');
[xi(:), lineal(:), forma(:)]`, 'Comparar interpoladores'),
    ], [], ['quad', 'trapz', 'interp1', 'pchip', 'spline']),
    topic('numeric-ode-optimization', 'ODE y optimización', [
      markdown(String.raw`Un problema inicial especifica $y'=f(t,y)$ y $y(t_0)=y_0$. Los solvers ode adaptan el paso. Valida contra una solución conocida o un invariante físico.`),
      code(`f = @(t,y) -0.7*y;
[t,y] = ode45(f,[0,5],2);
exacta = 2*exp(-0.7*t);
[numel(t), max(abs(y-exacta)), y(end)]`, 'Decaimiento'),
      markdown(String.raw`fminbnd minimiza una función escalar en un intervalo. Un resultado local no demuestra optimalidad global: explora la función, prueba varios inicios cuando corresponda y revisa sensibilidad.`),
      code(`t = (0:5)'; y = [3;2.2;1.7;1.2;0.95;0.7];
objetivo = @(k) sum((3*exp(-k*t)-y).^2);
[k,costo] = fminbnd(objetivo,0,2);
[k,costo]`, 'Estimar un parámetro'),
    ], [], ['ode45', 'fminbnd', 'estado', 'optimización']),
  ], ['raíces', 'integración', 'interpolación', 'ODE']),

  topic('numeric-statistics', 'Estadística y simulación', [
    markdown(String.raw`Antes de resumir, revisa forma, escala, valores faltantes y mecanismo de muestreo. Media y desviación no sustituyen una inspección de asimetría, atípicos o grupos diferentes.`),
    code(`x = [9,10,10,11,12,50];
[mean(x), median(x), std(x), min(x), max(x)]`, 'Efecto de un atípico'),
  ], [
    topic('numeric-descriptive', 'Resumen y correlación', [
      markdown(String.raw`Las funciones estadísticas operan por columnas por defecto. Indica la dimensión en código reutilizable. Correlación mide asociación lineal, no causalidad.`),
      code(`X = [1,2,8; 2,4,7; 3,5,6; 4,8,5];
medias = mean(X,1);
desvios = std(X,0,1);
R = corrcoef(X);
[medias;desvios], R`, 'Columnas como variables'),
      markdown(String.raw`Cuantiles y mediana son robustos ante asimetría. Investiga un atípico antes de eliminarlo: puede ser error, evento válido o señal del fenómeno.`),
      code(`x = [1,1,2,2,3,3,4,20];
q = quantile(x,[0,0.25,0.5,0.75,1]);
[q, q(4)-q(2)]`, 'Cuantiles e IQR'),
    ], [], ['mean', 'median', 'corrcoef', 'quantile']),
    topic('numeric-random', 'Aleatoriedad reproducible', [
      markdown(String.raw`Un generador pseudoaleatorio produce una secuencia determinista según su estado. Fijar la semilla permite repetir una prueba; reiniciarla dentro de un bucle repite la misma muestra.`),
      code(`rand('state',2026);
a = rand(1,4);
rand('state',2026);
b = rand(1,4);
[a;b;a==b]`, 'Semilla reproducible'),
      markdown(String.raw`rand es uniforme y randn normal estándar. Valida una simulación comparando momentos o frecuencias con valores teóricos.`),
      code(`randn('state',17);
x = 2 + 3*randn(1,100000);
[mean(x), std(x)]`, 'Comprobar momentos'),
    ], [], ['rand', 'randn', 'semilla', 'reproducibilidad']),
    topic('numeric-monte-carlo', 'Monte Carlo e incertidumbre', [
      markdown(String.raw`Monte Carlo estima esperanzas con muestras. Su error típico decrece como $1/\sqrt{N}$: ganar un decimal puede exigir cien veces más muestras. Reporta semilla, tamaño e incertidumbre.`),
      code(`rand('state',9);
N = 50000;
p = 2*rand(2,N)-1;
dentro = sum(p.^2,1)<=1;
pi_est = 4*mean(dentro);
ee = 4*std(dentro)/sqrt(N);
[pi_est, ee, abs(pi_est-pi)]`, 'Estimar π'),
      markdown(String.raw`Un intervalo aproximado para una media usa el error estándar $s/\sqrt{N}$. Más simulaciones reducen ruido, pero no corrigen un modelo sesgado.`),
      code(`randn('state',31);
x = exp(0.3*randn(1,2000));
m = mean(x); ee = std(x)/sqrt(numel(x));
[m, m+[-1,1]*1.96*ee]`, 'Intervalo aproximado'),
    ], [], ['monte carlo', 'error estándar', 'intervalo']),
  ], ['estadística', 'aleatoriedad', 'simulación']),

  topic('numeric-graphics', 'Visualización científica', [
    markdown(String.raw`Un gráfico debe comunicar una comparación o estructura. Etiqueta ejes con unidades, usa escalas honestas y no hagas del color la única codificación.`),
    code(`x = linspace(0,2*pi,200);
plot(x,sin(x),'linewidth',2);
xlabel('tiempo (s)'); ylabel('amplitud');
title('Oscilación'); grid on;`, 'Curva con contexto'),
  ], [
    topic('numeric-graphics-choice', 'Elegir gráfico y controlar el estado', [
      markdown(String.raw`El tipo de gráfico debe corresponder a la pregunta. Usa plot para una variable ordenada o continua; scatter para relación entre pares sin unirlos; bar para comparar categorías; hist para una distribución; errorbar cuando cada estimación tiene incertidumbre. Una imagen bonita con una geometría incorrecta comunica una relación falsa.

Etiqueta ejes con unidades, explica símbolos en legend y conserva escalas comparables. No uses color como única codificación y evita el doble eje vertical salvo que la relación sea imprescindible y esté claramente marcada.`),
      code(`clear;
x = 1:5;
media = [2.1, 2.8, 3.0, 4.2, 4.8];
incertidumbre = [0.2, 0.3, 0.15, 0.4, 0.25];
figure(20); clf;
h = errorbar(x, media, incertidumbre, 'o-');
set(h, 'linewidth', 1.5);
xlabel('tiempo (s)'); ylabel('velocidad (m/s)');
title('Estimación e incertidumbre'); grid on;
assert(numel(media) == numel(incertidumbre));`, 'Serie ordenada con incertidumbre'),
      markdown(String.raw`figure selecciona una ventana; axes o subplot selecciona un sistema de ejes. Muchas funciones de alto nivel reemplazan el contenido actual. hold on conserva lo existente y hold off restaura el reemplazo; clf limpia la figura completa. Guardar handles evita depender de gcf/gca y permite modificar el objeto correcto.

**Criterio:** crea o limpia explícitamente al comienzo de cada bloque y usa hold solo durante una superposición deliberada. Error frecuente: ejecutar varias veces con hold on y duplicar curvas; otro es unir con líneas categorías cuyo orden no tiene continuidad. **Ejercicio:** muestra los mismos datos como scatter y bar en dos subplots y explica qué pregunta responde cada uno.`),
      code(`clear;
x = linspace(0, 2*pi, 150);
figure(21); clf;
ax = axes();
h1 = plot(ax, x, sin(x), 'linewidth', 1.5);
hold(ax, 'on');
h2 = plot(ax, x, cos(x), '--', 'linewidth', 1.5);
hold(ax, 'off');
legend(ax, {'seno', 'coseno'});
xlabel(ax, 'ángulo (rad)'); ylabel(ax, 'amplitud'); grid(ax, 'on');
assert(ishandle(h1) && ishandle(h2));`, 'Superponer sin depender del eje actual'),
      markdown(String.raw`Las escalas semilogx, semilogy y loglog son útiles cuando órdenes de magnitud importan, pero excluyen valores no positivos. Antes de usarlas valida el dominio y declara la escala. Para datos densos considera transparencia, contornos o agregación en vez de ocultar puntos por superposición.

**Ejercicio:** genera 1000 normales, presenta un histograma y comprueba por separado media y desviación; el gráfico orienta, las estadísticas verifican.`),
      code(`clear;
randn('state', 12);
muestra = 2 + 0.5 * randn(1, 1000);
figure(22); clf;
hist(muestra, 20);
xlabel('valor'); ylabel('frecuencia'); title('Distribución simulada');
assert(abs(mean(muestra) - 2) < 0.08);
assert(abs(std(muestra) - 0.5) < 0.08);`, 'Histograma más comprobación numérica'),
    ], [], ['plot', 'scatter', 'bar', 'hist', 'errorbar', 'figure', 'axes', 'hold', 'clf', 'elegir gráfico']),

    topic('numeric-graphics-2d', 'Gráficos 2D y handles', [
      markdown(String.raw`plot acepta varias series. Conserva handles para editar propiedades sin depender del objeto actual. Usa loglog para leyes de potencia y nunca ocultes ceros o negativos sin explicarlo.`),
      code(`x = linspace(0,4*pi,300);
h = plot(x,sin(x),x,cos(x));
set(h(1),'linewidth',2);
set(h(2),'linestyle','--','linewidth',2);
legend('seno','coseno'); grid on;`, 'Comparar series'),
      markdown(String.raw`subplot organiza comparaciones. Limpia la figura para que reejecutar no superponga resultados y dirige operaciones mediante handles de ejes.`),
      code(`figure(1); clf;
x = linspace(0,2*pi,150);
ax1 = subplot(2,1,1); plot(ax1,x,sin(x)); title(ax1,'Señal');
ax2 = subplot(2,1,2); plot(ax2,x,cos(x)); title(ax2,'Derivada');`, 'Dos paneles'),
    ], [], ['plot', 'handle', 'subplot', 'loglog']),
    topic('numeric-graphics-3d', 'Superficies e imágenes', [
      markdown(String.raw`meshgrid construye coordenadas; surf representa altura y imagesc una matriz como imagen. Incluye colorbar cuando el color codifica magnitud.`),
      code(`[X,Y] = meshgrid(linspace(-2,2,60));
Z = exp(-(X.^2+Y.^2));
surf(X,Y,Z); shading interp;
xlabel('x'); ylabel('y'); zlabel('z'); colorbar;`, 'Superficie gaussiana'),
      markdown(String.raw`La orientación de filas y columnas importa. axis xy corrige el sentido vertical para coordenadas cartesianas y axis image conserva píxeles cuadrados.`),
      code(`A = peaks(40);
imagesc([-2,2],[-1,1],A);
axis xy image; colorbar;
xlabel('x'); ylabel('y');`, 'Mapa de calor'),
    ], [], ['surf', 'meshgrid', 'imagesc', 'colorbar']),
    topic('numeric-graphics-export', 'Exportación profesional', [
      markdown(String.raw`Exporta vector para documentos y raster para imágenes densas. Define tamaño, tipografía y resolución en el script para regenerar el mismo artefacto.`),
      code(`figure(2); clf;
x = linspace(0,1,100); plot(x,sqrt(x),'linewidth',2);
xlabel('x'); ylabel('sqrt(x)');
set(gcf,'paperposition',[0,0,12,8]);
print('figura.pdf','-dpdf');`, 'PDF vectorial'),
      markdown(String.raw`En PNG, fija resolución con -r. Prueba rutas y evita sobrescribir resultados importantes de manera implícita.`),
      code(`figure(3); clf; bar([3,5,4,7]);
xlabel('caso'); ylabel('valor');
set(gcf,'paperposition',[0,0,10,7]);
print('figura.png','-dpng','-r150');`, 'PNG a 150 dpi'),
    ], [], ['print', 'pdf', 'png', 'resolución']),
  ], ['plot', 'surf', 'handles', 'exportación']),

  topic('numeric-performance', 'Rendimiento y precisión', [
    markdown(String.raw`Optimiza después de medir. Elige primero un algoritmo de buena complejidad; luego vectoriza operaciones claras, preasigna y reduce copias. La precisión también es parte del diseño.`),
    code(`n = 200000;
x = linspace(0,10,n);
tic; y = sin(x).^2+cos(x).^2; tiempo = toc;
[max(abs(y-1)), tiempo]`, 'Medir una operación'),
  ], [
    topic('numeric-vectorization', 'Vectorización, preasignación y sparse', [
      markdown(String.raw`Las operaciones con punto actúan elemento a elemento. El broadcasting combina dimensiones compatibles; revisa size para no crear una matriz enorme por accidente.`),
      code(`X = [1,2,3;4,5,6];
centrada = X-mean(X,1);
[size(centrada), mean(centrada,1)]`, 'Broadcasting'),
      markdown(String.raw`Un bucle claro con preasignación puede superar una expresión que crea intermedios grandes. Reserva con zeros, cell o false y aprovecha matrices sparse.`),
      code(`n = 10000;
y = zeros(n,1);
for k = 1:n
  y(k) = sqrt(k)/(k+1);
endfor
[size(y),y(end)]`, 'Preasignar'),
    ], [], ['vectorización', 'broadcasting', 'preasignación', 'sparse']),
    topic('numeric-profiling', 'Profiling y memoria', [
      markdown(String.raw`tic/toc mide una región. El profiler atribuye tiempo a funciones y líneas: usa una carga representativa, busca los mayores costos y desactívalo al terminar.`),
      code(`profile clear; profile on;
for k = 1:20
  svd(rand(30));
endfor
profile off;
p = profile('info');
numel(p.FunctionTable)`, 'Capturar un perfil'),
      markdown(String.raw`Antes de crear arreglos grandes, estima bytes con whos. Una matriz densa usa memoria proporcional a $n^2$; estructura de banda o dispersión puede cambiar la viabilidad.`),
      code(`n = 2000;
A = zeros(n,n); S = sparse(n,n);
ia = whos('A'); is = whos('S');
[ia.bytes,is.bytes]`, 'Comparar memoria'),
    ], [], ['tic', 'toc', 'profile', 'whos', 'memoria']),
    topic('numeric-floating-point', 'Redondeo, cancelación y overflow', [
      markdown(String.raw`Los double representan un conjunto finito. Combina tolerancia absoluta y relativa: $|a-b|\le a_{tol}+r_{tol}\max(|a|,|b|)$.`),
      code(`a = [1e-12,1e6,3]; b = [2e-12,1e6+1e-7,3+1e-13];
atol = 1e-10; rtol = 1e-12;
abs(a-b) <= atol+rtol.*max(abs(a),abs(b))`, 'Comparación robusta'),
      markdown(String.raw`Restar números cercanos cancela dígitos. Una forma algebraicamente equivalente puede ser mucho más estable.`),
      code(`x = 1e-12;
directa = sqrt(1+x)-1;
estable = x/(sqrt(1+x)+1);
[directa,estable,x/2]`, 'Evitar cancelación'),
      markdown(String.raw`exp puede desbordar a Inf y valores diminutos caer a cero. Escalas logarítmicas evitan intermedios imposibles; isfinite, isinf e isnan detectan fallos temprano.`),
      code(`x = [700,710,720];
m = max(x);
log_suma = m+log(sum(exp(x-m)));
[exp(x),log_suma,isfinite(log_suma)]`, 'Log-sum-exp'),
    ], [], ['eps', 'tolerancia', 'cancelación', 'overflow', 'NaN']),
  ], ['vectorización', 'profiling', 'precisión', 'memoria']),

  topic('numeric-ecosystem', 'Paquetes, interoperabilidad y proyectos', [
    markdown(String.raw`Un proyecto reproducible separa código, datos, pruebas y resultados; declara dependencias y reconstruye cada salida desde fuentes conocidas. No dependas silenciosamente del directorio o de una sesión previa.`),
    code(`entorno.octave = version();
entorno.directorio = pwd();
entorno.plataforma = computer();
entorno`, 'Registrar el entorno'),
  ], [
    topic('numeric-packages-paths', 'Paquetes, Forge y paths', [
      markdown(String.raw`pkg list inventaría paquetes; pkg load habilita uno. Documenta nombre y versión e instala solo desde fuentes confiables. which revela qué implementación se ejecuta.`),
      code(`paquetes = pkg('list');
nombres = cellfun(@(p) p.name,paquetes,'uniformoutput',false);
nombres`, 'Inventario de paquetes'),
      markdown(String.raw`El path decide dónde busca funciones. Evita addpath(genpath(...)) indiscriminado y savepath dentro de aplicaciones; detecta colisiones con which -all.`),
      code(`partes = strsplit(path(),pathsep());
partes(1:min(5,numel(partes)))
which('mean','-all')`, 'Inspeccionar resolución'),
      markdown(String.raw`El ciclo completo es: **inventariar → instalar → cargar → usar → descargar o desinstalar**. Las órdenes principales son pkg list, pkg describe nombre, pkg install archivo.tar.gz, pkg install -forge nombre, pkg load nombre, pkg unload nombre, pkg update y pkg uninstall nombre. Instalar y actualizar modifican el entorno: revisa fuente, versión, dependencias y permisos antes de hacerlo.

Un paquete instalado no necesariamente está cargado. pkg load agrega sus funciones al path de la sesión; pkg unload las retira. En un proyecto, registra versiones y carga dependencias en el punto de entrada, no de forma escondida dentro de funciones de cálculo.`),
      code(`clear;
inventario = pkg('list');
assert(iscell(inventario));
for k = 1:numel(inventario)
  p = inventario{k};
  fprintf('%s %s, cargado=%d\\n', p.name, p.version, p.loaded);
  assert(isfield(p, 'depends') && isfield(p, 'dir'));
endfor`, 'Versiones y estado de carga'),
      markdown(String.raw`El load path decide qué función gana cuando existen nombres repetidos. addpath agrega rutas y rmpath las retira; genpath puede incluir carpetas privadas, datos o versiones duplicadas, por eso no debe aplicarse indiscriminadamente. which -all ayuda a diagnosticar colisiones.

Errores frecuentes: instalar durante una ejecución normal, depender de un paquete cargado en una sesión anterior y usar savepath para cambiar globalmente el entorno de otra persona. **Criterio:** dependencia declarada y versión registrada; instalación como paso separado; carga explícita al iniciar. **Ejercicio:** escribe una función que reciba nombre y versión mínima, busque el paquete en pkg list y produzca un error útil si falta.`),
      code(`clear;
function encontrado = buscar_paquete(nombre)
  lista = pkg('list');
  encontrado = [];
  for k = 1:numel(lista)
    if strcmp(lista{k}.name, nombre)
      encontrado = lista{k};
      return;
    endif
  endfor
endfunction

resultado = buscar_paquete('__paquete_inexistente__');
assert(isempty(resultado));`, 'Comprobar una dependencia sin modificar el entorno'),
    ], [], ['pkg', 'forge', 'path', 'which', 'dependencias']),
    topic('numeric-matlab-compatibility', 'Compatibilidad entre GNU Octave y MATLAB', [
      markdown(String.raw`Octave y MATLAB comparten matrices, indexación y gran parte de la biblioteca, pero no son el mismo lenguaje. Para un núcleo portable usa end en lugar de endif/endfor/endfunction, ~= en lugar de !=, ~ en lugar de !, x=x+1 en lugar de += o ++, y ^/.^ en lugar de **/.**. Esas alternativas funcionan en ambos.

Las comillas dobles son una diferencia importante: en Octave actual producen char, mientras que en MATLAB moderno producen string. Para texto portable usa comillas simples y strcmp, o aísla una capa de conversión. También pueden variar gráficos, paquetes, argumentos nuevos y comportamiento de versiones antiguas.`),
      code(`clear;
function y = formula_portable(x)
  if ~isnumeric(x)
    error('La entrada debe ser numérica');
  end
  y = x.^2 + 2.*x + 1;
end

resultado = formula_portable(0:3);
assert(isequal(resultado, [1, 4, 9, 16]));`, 'Un subconjunto sintáctico común'),
      markdown(String.raw`Detecta el entorno con exist('OCTAVE_VERSION','builtin'), pero prefiere detectar la **capacidad** concreta con exist('funcion','file') o nargin antes de ramificar por marca. Encapsula la diferencia en una función pequeña y prueba las dos rutas.

La compatibilidad numérica no exige bits idénticos: diferentes BLAS, solvers u órdenes de reducción pueden cambiar los últimos dígitos. Compara invariantes, residuos y tolerancias. **Ejercicio:** crea una función portable que use vecnorm si existe y, si no, calcule sqrt(sum(abs(X).^2,dim)).`),
      code(`clear;
es_octave = exist('OCTAVE_VERSION', 'builtin') != 0;
hay_json = exist('jsonencode', 'builtin') || exist('jsonencode', 'file');
if es_octave
  entorno = ['GNU Octave ', OCTAVE_VERSION];
else
  entorno = 'MATLAB';
end
assert(ischar(entorno) && !isempty(entorno));
assert(islogical(logical(hay_json)));
disp(entorno);`, 'Entorno y capacidad por separado'),
      markdown(String.raw`Errores frecuentes: llenar todo el programa de if OCTAVE_VERSION, usar sintaxis exclusiva sin documentarla, o afirmar portabilidad sin ejecutar pruebas en ambos entornos. **Criterio:** núcleo común primero; adaptador pequeño cuando una diferencia aporta valor; prueba automatizada en cada entorno admitido.`),
      code(`clear;
A = [3, 1; 1, 2]; b = [9; 8];
x = A \\ b;
residuo_relativo = norm(A*x - b) / norm(b);
assert(residuo_relativo < 1e-12);

esperado = [2; 3];
assert(norm(x - esperado, Inf) < 1e-12);`, 'Probar propiedades numéricas portables'),
    ], [], ['MATLAB', 'compatibilidad', 'portabilidad', 'OCTAVE_VERSION', 'feature detection', 'sintaxis común']),
    topic('numeric-interoperability', 'MATLAB, Python y datos', [
      markdown(String.raw`Octave comparte gran parte del lenguaje MATLAB, pero difiere en paquetes y gráficos. Para portabilidad, usa end, aísla extensiones exclusivas y prueba en ambos entornos.`),
      code(`if exist('OCTAVE_VERSION','builtin')
  entorno = ['Octave ',OCTAVE_VERSION];
else
  entorno = 'MATLAB';
endif
entorno`, 'Detectar entorno'),
      markdown(String.raw`Para Python y otros procesos, formatos abiertos y contratos explícitos son robustos: UTF-8, esquema, unidades, errores y precisión. CSV sirve para tablas; MAT para arreglos; JSON para estructuras.`),
      code(`r.metodo = 'mínimos cuadrados';
r.coeficientes = [1.2,-0.4]; r.residuo = 2.1e-6;
texto = jsonencode(r);
vuelta = jsondecode(texto);
texto, vuelta.coeficientes`, 'Contrato JSON'),
    ], [], ['MATLAB', 'Python', 'CSV', 'JSON', 'interoperabilidad']),
    topic('numeric-projects', 'Orientación a proyectos', [
      markdown(String.raw`Un punto de entrada fija semillas, valida dependencias, registra parámetros y llama funciones sin estado oculto. Guarda resultados junto a los parámetros que los produjeron.`),
      code(`config.semilla = 2026; config.muestras = 10000;
rand('state',config.semilla);
datos = rand(1,config.muestras);
resultado.media = mean(datos);
resultado.error = abs(resultado.media-0.5);
[config,resultado]`, 'Ejecución parametrizada'),
      markdown(String.raw`Las pruebas numéricas usan invariantes, casos conocidos y convergencia al refinar. assert convierte supuestos en contratos y detiene el pipeline cerca de la causa.`),
      code(`n = 100;
x = linspace(0,1,n);
I = trapz(x,x.^2);
error = abs(I-1/3);
assert(error < 1e-4,'grilla insuficiente');
[I,error]`, 'Resultado verificable'),
    ], [], ['proyecto', 'reproducibilidad', 'pipeline', 'assert']),
  ], ['paquetes', 'Forge', 'MATLAB', 'Python', 'proyectos']),
])
