# Matriz interna de cobertura del manual

Este archivo guía la reconstrucción pedagógica del manual. No es contenido de la interfaz.
Cada fila se cierra solo cuando la ayuda explica el modelo mental, la sintaxis y variantes,
incluye ejemplos autocontenidos, errores frecuentes, criterios de elección y un ejercicio.

| Área | Punto de partida | Objetivo | Estado |
| --- | --- | --- | --- |
| Primer contacto y sesión | Sólido pero disperso | ejecución, ayuda, workspace y lectura de errores desde cero | En revisión |
| Tipos numéricos | Solo `double` e `int16` como muestra | `double`/`single`, los 8 enteros, rangos, conversión y elección | Cubierto |
| Valores especiales y complejos | Menciones aisladas | `NaN`, `Inf`, `eps`, parte real/imaginaria, magnitud/fase | Cubierto |
| Texto | `char` y compatibilidad básica | `char`, comillas dobles según versión, celdas de char y conversiones | Cubierto |
| Arreglos | Escalar/vector/matriz bien introducidos | N-D, singleton, `permute`, `squeeze`, creación e inspección | Cubierto |
| Datos especiales | cell/struct explicados | sparse, function handles, clases/objetos y criterios de elección | Cubierto |
| Operadores | Matricial vs elemento a elemento | catálogo completo, asignación, incremento, rangos, transposición, precedencia | Pendiente |
| Indexación | Lineal y lógica presentes | listas de índices, borrado, crecimiento, `end`, `:` y N-D | En revisión |
| Control de flujo | Buena base | condiciones no escalares, todas las terminaciones y criterios | En revisión |
| Funciones, scripts y alcance | Buena base | archivos, subfunciones, funciones anidadas, `persistent`, `global` | En revisión |
| Entrada/salida | Consola, texto, binario, CSV/MAT | rutas, formatos, importación robusta y serialización | En revisión |
| Gráficos | 2D/3D/exportación | estado gráfico, escalas, layouts, elección y diagnóstico | En revisión |
| Errores, tests y depuración | Cobertura amplia | flujo completo desde mensaje hasta prueba de regresión | En revisión |
| Álgebra y métodos numéricos | Cobertura amplia | supuestos, condicionamiento, tolerancias y elección de método | En revisión |
| Rendimiento | Vectorización/profiling | memoria, sparse, precisión y medir antes de optimizar | En revisión |
| Paquetes e interoperabilidad | Introducción breve | ciclo de paquetes, MATLAB, Python/procesos, formatos abiertos | Pendiente |

## Orden de slices

1. Sistema completo de tipos y representaciones.
2. Operadores, precedencia e indexación avanzada.
3. Funciones, alcance, objetos y organización del código.
4. E/S, gráficos, errores, pruebas y depuración.
5. Cálculo numérico, rendimiento, paquetes e interoperabilidad.
6. Revisión transversal de duplicados, vaguedades, ejercicios y búsqueda.
