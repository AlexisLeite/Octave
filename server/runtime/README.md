# Octave runtime

`createRuntimeManager()` manages one persistent `octave-cli` child process per
runtime. Calls within a runtime are serialized; distinct runtimes may execute in
parallel. Variables therefore survive between `execute` calls until `close`.

`execute` accepts an optional progress callback. It receives cumulative stdout
and stderr snapshots as Octave emits them, before the final result is available.
The HTTP API exposes those snapshots as NDJSON. A timeout still terminates the
unresponsive process, but its final result preserves every output chunk received
before termination. `interrupt(runtimeId)` provides the same preservation for an
explicit user Stop action and removes the dead runtime immediately.

`open(documentId, clientId)` assigns the runtime to one of two server-enforced
slots for that browser tab: one notebook slot and one ephemeral help slot
(`documentId` beginning with `help-`). Opening a notebook atomically closes and
replaces that client's previous notebook. A second help open is rejected while
the help slot is busy, and help runtimes close automatically after their first
execution or inspection. Different client IDs have independent slots.

Every runtime has an unref'ed inactivity timer, refreshed by creation, execution,
and inspection. The default idle limit is 10 minutes; expiry removes the runtime
from its map and slot, closes Octave, and deletes its temporary directory. This
also bounds leaked runtimes after reloads, HMR, or lost close requests.

The browser also sends `heartbeat(clientId)` every 10 seconds. Missing heartbeats
for 30 seconds atomically close both slots owned by that client. Heartbeats do not
refresh runtime inactivity, so an attached but unused Octave process still reaches
the 10-minute idle limit. Both timers are unref'ed and generation-checked to make
heartbeat/expiry races harmless.

Every runtime starts with an implicit `heading(txt, txt2)` helper. It separates itself
from preceding output and prints `txt`; when the optional `txt2` is present, it prints
it immediately afterward. Blank lines around the outer edge of a cell result are
normalized, so a heading at the start of the output has no leading gap. The helper is
not represented as a notebook cell and is recreated whenever the document runtime is
reset.

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
