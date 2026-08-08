# Matriz interna de cobertura del manual

Este archivo guía la reconstrucción pedagógica del manual. No es contenido de la interfaz.
Cada fila se cierra solo cuando la ayuda explica el modelo mental, la sintaxis y variantes,
incluye ejemplos autocontenidos, errores frecuentes, criterios de elección y un ejercicio.

| Área | Punto de partida | Objetivo | Estado |
| --- | --- | --- | --- |
| Primer contacto y sesión | Sólido pero disperso | ejecución, ayuda, workspace y lectura de errores desde cero | Cubierto |
| Tipos numéricos | Solo `double` e `int16` como muestra | `double`/`single`, los 8 enteros, rangos, conversión y elección | Cubierto |
| Valores especiales y complejos | Menciones aisladas | `NaN`, `Inf`, `eps`, parte real/imaginaria, magnitud/fase | Cubierto |
| Texto | `char` y compatibilidad básica | `char`, comillas dobles según versión, celdas de char y conversiones | Cubierto |
| Arreglos | Escalar/vector/matriz bien introducidos | N-D, singleton, `permute`, `squeeze`, creación e inspección | Cubierto |
| Datos especiales | cell/struct explicados | sparse, function handles, clases/objetos y criterios de elección | Cubierto |
| Operadores | Matricial vs elemento a elemento | catálogo completo, asignación, incremento, rangos, transposición, precedencia | Cubierto |
| Indexación | Lineal y lógica presentes | listas de índices, borrado, crecimiento, `end`, `:` y N-D | Cubierto |
| Control de flujo | Buena base | condiciones no escalares, todas las terminaciones y criterios | Cubierto |
| Funciones, scripts y alcance | Buena base | archivos, subfunciones, funciones anidadas, `persistent`, `global` | Cubierto |
| Entrada/salida | Consola, texto, binario, CSV/MAT | rutas, formatos, importación robusta y serialización | Cubierto |
| Gráficos | 2D/3D/exportación | estado gráfico, escalas, layouts, elección y diagnóstico | Cubierto |
| Errores, tests y depuración | Cobertura amplia | flujo completo desde mensaje hasta prueba de regresión | Cubierto |
| Álgebra y métodos numéricos | Cobertura amplia | supuestos, condicionamiento, tolerancias y elección de método | Cubierto |
| Rendimiento | Vectorización/profiling | memoria, sparse, precisión y medir antes de optimizar | Cubierto |
| Paquetes e interoperabilidad | Introducción breve | ciclo de paquetes, MATLAB, Python/procesos, formatos abiertos | Cubierto |
| Reducciones fundamentales | Uso incidental de `min`/`max` | dimensión, índice, extremos globales, NaN, complejos y criterios | Cubierto |

## Slices completados

1. Sistema completo de tipos y representaciones: completado.
2. Operadores, precedencia e indexación avanzada: completado.
3. Funciones, alcance, objetos y organización del código: completado.
4. E/S, gráficos, errores, pruebas y depuración: completado.
5. Cálculo numérico, rendimiento, paquetes e interoperabilidad: completado.
6. Revisión transversal de duplicados, vaguedades, ejercicios y búsqueda: completado.

Auditoría final interna: 99 nodos, 82 secciones hoja; cada hoja contiene al menos
dos explicaciones y dos ejemplos ejecutables, además de criterio de elección,
error frecuente y ejercicio explícitos. Se ejecutaron 56 bloques nuevos o tocados
contra GNU Octave 11.3; dos fallos detectados por esa prueba fueron corregidos y
los bloques afectados se repitieron sin errores.
