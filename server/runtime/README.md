# Octave runtime

`createRuntimeManager()` manages one persistent `octave-cli` child process per
runtime. Calls within a runtime are serialized; distinct runtimes may execute in
parallel. Variables therefore survive between `execute` calls until `close`.

Each code cell is written verbatim to a short-lived `.m` file and loaded with
`source`. This preserves cell-relative error line numbers. A random marker set is
written to both stdout and stderr around every request, followed by a JSON error
record. Waiting for the end marker on both streams avoids losing late stderr
chunks. Marker tokens are never placed in the Octave workspace.

Inspection evaluates an expression in the same workspace and emits a private JSON
record containing `disp`, `class`, and matrix dimensions. Runtime-generated
workspace variables use per-request random names and are cleared after success.

Octave discovery order is `options.octavePath`, `OCTAVE_CLI_PATH`, PATH, then
standard GNU Octave Windows installation directories. A timed-out or over-limit
process is killed because its workspace can no longer be considered consistent.
Call `close`/`closeAll` during server shutdown to remove temporary directories.
