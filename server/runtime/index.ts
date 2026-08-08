import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  access,
  mkdir,
  mkdtemp,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { constants as fsConstants, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, normalize, resolve } from "node:path";

export interface RuntimeManagerOptions {
  /** Explicit octave-cli executable. OCTAVE_CLI_PATH and PATH are used next. */
  octavePath?: string;
  /** Maximum duration of one execute/inspect request. Defaults to 30 seconds. */
  timeoutMs?: number;
  /** Maximum combined stdout/stderr retained for one request. Defaults to 10 MiB. */
  maxOutputBytes?: number;
  /** Parent for per-runtime temporary directories. Defaults to the OS temp directory. */
  tempRoot?: string;
  /** Idle lifetime for every runtime. Defaults to 10 minutes. */
  idleTimeoutMs?: number;
  /** Time without a client heartbeat before all of its runtimes close. Defaults to 30 seconds. */
  clientTimeoutMs?: number;
}

export type RuntimeRole = "notebook" | "help";

export interface RuntimeStatus {
  runtimeId: string;
  documentId: string;
  clientId: string;
  role: RuntimeRole;
  pid: number | null;
  createdAt: string;
  lastActivityAt: string;
}

export interface ExecuteInput {
  cellId: string;
  code: string;
}

export interface RuntimeError {
  message: string;
  line: number | null;
  column: number | null;
  stack?: string;
}

export interface ExecuteResult {
  cellId: string;
  stdout: string;
  stderr: string;
  durationMs: number;
  error: RuntimeError | null;
}

export interface InspectResult {
  expression: string;
  display: string;
  type?: string;
  shape?: string;
}

export interface RuntimeManager {
  open(documentId: string, clientId?: string): Promise<{ runtimeId: string }>;
  execute(runtimeId: string, input: ExecuteInput): Promise<ExecuteResult>;
  inspect(runtimeId: string, expression: string): Promise<InspectResult>;
  close(runtimeId: string): Promise<void>;
  closeAll(): Promise<void>;
  status(): RuntimeStatus[];
  heartbeat(clientId: string): void;
}

interface OctaveStackFrame {
  file?: string;
  name?: string;
  line?: number;
  column?: number;
}

interface OctaveErrorPayload {
  message?: string;
  identifier?: string;
  stack?: OctaveStackFrame | OctaveStackFrame[];
}

interface ProtocolResult {
  stdout: string;
  stderr: string;
  error: OctaveErrorPayload | null;
}

interface PendingRequest {
  token: string;
  stdout: string;
  stderr: string;
  stdoutDone: boolean;
  stderrDone: boolean;
  timer: NodeJS.Timeout;
  resolve: (result: ProtocolResult) => void;
  reject: (error: Error) => void;
}

class RuntimeOperationalError extends Error {}
class RuntimeTimeoutError extends RuntimeOperationalError {}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_OUTPUT_BYTES = 10 * 1024 * 1024;
const DEFAULT_IDLE_TIMEOUT_MS = 10 * 60_000;
const DEFAULT_CLIENT_TIMEOUT_MS = 30_000;
const IMPLICIT_NOTEBOOK_SOURCE = [
  "function heading = heading(txt, txt2)",
  '  disp("")',
  "  disp(txt)",
  "  if nargin >= 2",
  '    rendered = evalc("disp(txt2)");',
  '    rendered = regexprep(rendered, "\\r?\\n$", "");',
  '    lines = strsplit(rendered, "\\n", "collapsedelimiters", false);',
  "    for line_index = 1:numel(lines)",
  '      fprintf("  %s\\n", lines{line_index});',
  "    endfor",
  "  endif",
  "end",
].join("\n");

class OctaveRuntime {
  readonly runtimeId = randomUUID();
  readonly documentId: string;

  get pid(): number | null {
    return this.child.pid ?? null;
  }

  get alive(): boolean {
    return !this.exited && !this.closing;
  }

  private readonly executable: string;
  private readonly timeoutMs: number;
  private readonly maxOutputBytes: number;
  private readonly directory: string;
  private readonly child: ChildProcessWithoutNullStreams;
  private pending: PendingRequest | null = null;
  private queue: Promise<unknown> = Promise.resolve();
  private exited = false;
  private closing = false;
  private exitError: Error | null = null;
  private exitPromise: Promise<void>;

  private constructor(
    documentId: string,
    executable: string,
    directory: string,
    timeoutMs: number,
    maxOutputBytes: number,
  ) {
    this.documentId = documentId;
    this.executable = executable;
    this.directory = directory;
    this.timeoutMs = timeoutMs;
    this.maxOutputBytes = maxOutputBytes;

    this.child = spawn(
      executable,
      ["--quiet", "--no-init-file", "--no-history", "--no-line-editing"],
      {
        cwd: directory,
        env: {
          ...process.env,
          OCTAVE_HISTFILE: process.platform === "win32" ? "NUL" : "/dev/null",
        },
        stdio: ["pipe", "pipe", "pipe"],
        windowsHide: true,
      },
    );

    this.child.stdout.setEncoding("utf8");
    this.child.stderr.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => this.onOutput("stdout", chunk));
    this.child.stderr.on("data", (chunk: string) => this.onOutput("stderr", chunk));

    this.exitPromise = new Promise((resolveExit) => {
      this.child.once("close", (code, signal) => {
        this.exited = true;
        const detail = signal ? `signal ${signal}` : `code ${code ?? "unknown"}`;
        this.exitError ??= new RuntimeOperationalError(
          `Octave runtime ${this.runtimeId} exited with ${detail}`,
        );
        this.failPending(this.exitError);
        resolveExit();
      });
    });

    this.child.once("error", (error) => {
      this.exitError = new RuntimeOperationalError(
        `Could not start Octave executable ${JSON.stringify(this.executable)}: ${error.message}`,
      );
      this.failPending(this.exitError);
    });
  }

  static async create(
    documentId: string,
    executable: string,
    tempRoot: string,
    timeoutMs: number,
    maxOutputBytes: number,
  ): Promise<OctaveRuntime> {
    await mkdir(tempRoot, { recursive: true });
    const directory = await mkdtemp(join(tempRoot, "octave-runtime-"));
    const runtime = new OctaveRuntime(
      documentId,
      executable,
      directory,
      timeoutMs,
      maxOutputBytes,
    );

    try {
      // Detect spawn failures and install notebook helpers without exposing a
      // synthetic cell or bootstrap output to the document.
      await runtime.enqueue(() => runtime.runSource(IMPLICIT_NOTEBOOK_SOURCE, "startup"));
      return runtime;
    } catch (error) {
      await runtime.forceClose();
      throw error;
    }
  }

  execute(input: ExecuteInput): Promise<ExecuteResult> {
    if (!input || typeof input.cellId !== "string" || typeof input.code !== "string") {
      return Promise.reject(new TypeError("execute input must contain string cellId and code fields"));
    }

    return this.enqueue(async () => {
      const startedAt = performance.now();
      const sourcePath = join(this.directory, `cell-${safeFilePart(input.cellId)}-${randomUUID()}.m`);

      try {
        const protocol = await this.runSource(input.code, sourcePath);
        return {
          cellId: input.cellId,
          stdout: trimOuterBlankLines(protocol.stdout),
          stderr: trimOuterBlankLines(protocol.stderr),
          durationMs: Math.max(0, performance.now() - startedAt),
          error: protocol.error ? normalizeOctaveError(protocol.error, sourcePath) : null,
        };
      } catch (error) {
        if (error instanceof RuntimeTimeoutError) {
          return {
            cellId: input.cellId,
            stdout: "",
            stderr: "",
            durationMs: Math.max(0, performance.now() - startedAt),
            error: { message: error.message, line: null, column: null },
          };
        }
        throw error;
      }
    });
  }

  inspect(expression: string): Promise<InspectResult> {
    if (typeof expression !== "string" || expression.trim() === "") {
      return Promise.reject(new TypeError("expression must be a non-empty string"));
    }

    return this.enqueue(async () => {
      const inspectToken = randomUUID().replaceAll("-", "");
      const variable = `__octave_ide_value_${inspectToken}`;
      const display = `__octave_ide_display_${inspectToken}`;
      const payload = `__octave_ide_payload_${inspectToken}`;
      const shape = `__octave_ide_shape_${inspectToken}`;
      const marker = `__OCTAVE_INSPECT_${inspectToken}__`;
      const expressionLiteral = octaveString(expression);
      const code = [
        `${variable} = eval(${expressionLiteral});`,
        `${display} = evalc('disp(${variable});');`,
        `${shape} = sprintf('%dx', size(${variable}));`,
        `if (! isempty(${shape})); ${shape}(end) = []; endif`,
        `${payload} = struct('display', ${display}, 'type', class(${variable}), 'shape', ${shape});`,
        `fprintf(1, '${marker}%s\\n', jsonencode(${payload}));`,
        `clear ${variable} ${display} ${payload} ${shape};`,
      ].join("\n");

      const sourcePath = join(this.directory, `inspect-${inspectToken}.m`);
      const protocol = await this.runSource(code, sourcePath);
      if (protocol.error) {
        const normalized = normalizeOctaveError(protocol.error, sourcePath);
        const error = new RuntimeOperationalError(normalized.message);
        if (normalized.stack) error.stack = `${error.name}: ${error.message}\n${normalized.stack}`;
        throw error;
      }

      const markerIndex = protocol.stdout.lastIndexOf(marker);
      if (markerIndex < 0) {
        throw new RuntimeOperationalError("Octave returned no inspection payload");
      }
      const jsonLine = protocol.stdout.slice(markerIndex + marker.length).split(/\r?\n/, 1)[0];
      try {
        const parsed = JSON.parse(jsonLine) as {
          display: string;
          type?: string;
          shape?: string;
        };
        return {
          expression,
          display: parsed.display.replace(/\r?\n$/, ""),
          type: parsed.type,
          shape: parsed.shape,
        };
      } catch (error) {
        throw new RuntimeOperationalError(
          `Invalid inspection payload from Octave: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
  }

  close(): Promise<void> {
    if (this.closing) return this.queue.then(() => undefined, () => undefined);
    this.closing = true;
    return this.enqueue(() => this.forceClose(), true);
  }

  forceClose(): Promise<void> {
    return (async () => {
      if (!this.exited) {
        this.child.stdin.end("exit(0);\n");
        const forceTimer = setTimeout(() => this.child.kill(), 1_500);
        forceTimer.unref();
        await this.exitPromise;
        clearTimeout(forceTimer);
      }
      await rm(this.directory, { recursive: true, force: true });
    })();
  }

  killForProcessExit(): void {
    if (!this.exited) this.child.kill();
    try {
      rmSync(this.directory, { recursive: true, force: true });
    } catch {
      // The OS will reclaim the process; a locked temp file may survive abrupt shutdown.
    }
  }

  private enqueue<T>(operation: () => Promise<T>, allowWhileClosing = false): Promise<T> {
    if (!allowWhileClosing && (this.closing || this.exited)) {
      return Promise.reject(
        this.exitError ?? new RuntimeOperationalError(`Octave runtime ${this.runtimeId} is closed`),
      );
    }
    const result = this.queue.then(operation, operation);
    this.queue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  private async runSource(code: string, labelOrPath: string): Promise<ProtocolResult> {
    if (this.exited) {
      throw this.exitError ?? new RuntimeOperationalError(`Octave runtime ${this.runtimeId} is closed`);
    }

    const isPath = labelOrPath.endsWith(".m");
    const sourcePath = isPath
      ? labelOrPath
      : join(this.directory, `${safeFilePart(labelOrPath)}-${randomUUID()}.m`);
    const token = randomUUID().replaceAll("-", "");
    const errorVariable = `__octave_ide_error_${token}`;
    const jsonVariable = `__octave_ide_json_${token}`;
    await writeFile(sourcePath, ensureTrailingNewline(code), "utf8");

    const command = [
      `fprintf(1, '__OCTAVE_${token}_OUT_BEGIN__\\n'); fflush(1);`,
      `fprintf(2, '__OCTAVE_${token}_ERR_BEGIN__\\n'); fflush(2);`,
      "try",
      `  source(${octaveString(sourcePath.replaceAll("\\", "/"))});`,
      `  fprintf(1, '\\n__OCTAVE_${token}_META__null\\n');`,
      `catch ${errorVariable}`,
      "  try",
      `    ${jsonVariable} = jsonencode(${errorVariable});`,
      "  catch",
      `    ${jsonVariable} = '{"message":"Unknown Octave error","stack":[]}';`,
      "  end_try_catch",
      `  fprintf(1, '\\n__OCTAVE_${token}_META__%s\\n', ${jsonVariable});`,
      `  clear ${errorVariable} ${jsonVariable};`,
      "end_try_catch",
      `fprintf(1, '__OCTAVE_${token}_OUT_END__\\n'); fflush(1);`,
      `fprintf(2, '\\n__OCTAVE_${token}_ERR_END__\\n'); fflush(2);`,
      "",
    ].join("\n");

    try {
      return await this.sendCommand(token, command);
    } finally {
      await rm(sourcePath, { force: true }).catch(() => undefined);
    }
  }

  private sendCommand(token: string, command: string): Promise<ProtocolResult> {
    if (this.pending) {
      return Promise.reject(new RuntimeOperationalError("Internal error: concurrent Octave commands"));
    }

    return new Promise<ProtocolResult>((resolveRequest, rejectRequest) => {
      const timer = setTimeout(() => {
        const timeoutError = new RuntimeTimeoutError(
          `Octave execution timed out after ${this.timeoutMs} ms; the runtime was terminated`,
        );
        this.exitError = timeoutError;
        this.failPending(timeoutError);
        this.child.kill();
      }, this.timeoutMs);
      timer.unref();

      this.pending = {
        token,
        stdout: "",
        stderr: "",
        stdoutDone: false,
        stderrDone: false,
        timer,
        resolve: resolveRequest,
        reject: rejectRequest,
      };

      this.child.stdin.write(command, "utf8", (error) => {
        if (error) {
          this.exitError = new RuntimeOperationalError(`Failed writing to Octave: ${error.message}`);
          this.failPending(this.exitError);
        }
      });
    });
  }

  private onOutput(stream: "stdout" | "stderr", chunk: string): void {
    const pending = this.pending;
    if (!pending) return;
    pending[stream] += chunk;

    if (Buffer.byteLength(pending.stdout) + Buffer.byteLength(pending.stderr) > this.maxOutputBytes) {
      const error = new RuntimeOperationalError(
        `Octave output exceeded the ${this.maxOutputBytes}-byte request limit; the runtime was terminated`,
      );
      this.exitError = error;
      this.failPending(error);
      this.child.kill();
      return;
    }

    pending.stdoutDone = pending.stdout.includes(`__OCTAVE_${pending.token}_OUT_END__`);
    pending.stderrDone = pending.stderr.includes(`__OCTAVE_${pending.token}_ERR_END__`);
    if (pending.stdoutDone && pending.stderrDone) this.completePending(pending);
  }

  private completePending(pending: PendingRequest): void {
    if (this.pending !== pending) return;
    clearTimeout(pending.timer);
    this.pending = null;

    try {
      const outBegin = `__OCTAVE_${pending.token}_OUT_BEGIN__\n`;
      const meta = `\n__OCTAVE_${pending.token}_META__`;
      const outEnd = `\n__OCTAVE_${pending.token}_OUT_END__`;
      const errBegin = `__OCTAVE_${pending.token}_ERR_BEGIN__\n`;
      const errEnd = `\n__OCTAVE_${pending.token}_ERR_END__`;
      const outStart = pending.stdout.indexOf(outBegin);
      const metaStart = pending.stdout.lastIndexOf(meta);
      const outEndStart = pending.stdout.indexOf(outEnd, metaStart + meta.length);
      const errStart = pending.stderr.indexOf(errBegin);
      const errEndStart = pending.stderr.lastIndexOf(errEnd);
      if ([outStart, metaStart, outEndStart, errStart, errEndStart].some((index) => index < 0)) {
        throw new RuntimeOperationalError("Malformed response from the Octave runtime");
      }

      const stdout = pending.stdout.slice(outStart + outBegin.length, metaStart);
      const metadata = pending.stdout.slice(metaStart + meta.length, outEndStart).trim();
      const stderr = pending.stderr.slice(errStart + errBegin.length, errEndStart);
      const error = metadata === "null" ? null : (JSON.parse(metadata) as OctaveErrorPayload);
      pending.resolve({ stdout, stderr, error });
    } catch (error) {
      pending.reject(
        error instanceof Error ? error : new RuntimeOperationalError(String(error)),
      );
    }
  }

  private failPending(error: Error): void {
    const pending = this.pending;
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending = null;
    pending.reject(error);
  }
}

interface ManagedRuntime {
  runtime: OctaveRuntime;
  clientId: string;
  role: RuntimeRole;
  createdAt: number;
  lastActivityAt: number;
  idleTimer: NodeJS.Timeout | null;
}

interface ClientRuntimeSlots {
  notebook?: string;
  help?: string;
}

interface ClientLease {
  generation: number;
  lastHeartbeatAt: number;
  timer: NodeJS.Timeout | null;
}

class RuntimeManagerImpl implements RuntimeManager {
  private readonly options: Required<
    Pick<
      RuntimeManagerOptions,
      "timeoutMs" | "maxOutputBytes" | "tempRoot" | "idleTimeoutMs" | "clientTimeoutMs"
    >
  > &
    Pick<RuntimeManagerOptions, "octavePath">;
  private readonly runtimes = new Map<string, ManagedRuntime>();
  private readonly clientSlots = new Map<string, ClientRuntimeSlots>();
  private readonly clientLeases = new Map<string, ClientLease>();
  private lifecycleQueue: Promise<unknown> = Promise.resolve();
  private executablePromise: Promise<string> | null = null;
  private accepting = true;
  private readonly exitHandler = () => {
    for (const managed of this.runtimes.values()) {
      if (managed.idleTimer) clearTimeout(managed.idleTimer);
      managed.runtime.killForProcessExit();
    }
    for (const lease of this.clientLeases.values()) {
      if (lease.timer) clearTimeout(lease.timer);
    }
  };

  constructor(options: RuntimeManagerOptions) {
    this.options = {
      octavePath: options.octavePath,
      timeoutMs: positiveInteger(options.timeoutMs, DEFAULT_TIMEOUT_MS, "timeoutMs"),
      maxOutputBytes: positiveInteger(
        options.maxOutputBytes,
        DEFAULT_MAX_OUTPUT_BYTES,
        "maxOutputBytes",
      ),
      tempRoot: resolve(options.tempRoot ?? tmpdir()),
      idleTimeoutMs: positiveInteger(
        options.idleTimeoutMs,
        DEFAULT_IDLE_TIMEOUT_MS,
        "idleTimeoutMs",
      ),
      clientTimeoutMs: positiveInteger(
        options.clientTimeoutMs,
        DEFAULT_CLIENT_TIMEOUT_MS,
        "clientTimeoutMs",
      ),
    };
    process.once("exit", this.exitHandler);
  }

  async open(documentId: string, clientId = "legacy"): Promise<{ runtimeId: string }> {
    if (typeof documentId !== "string" || documentId.trim() === "") {
      throw new TypeError("documentId must be a non-empty string");
    }
    validateClientId(clientId);
    this.heartbeat(clientId);
    const role: RuntimeRole = documentId.startsWith("help-") ? "help" : "notebook";

    return this.serialize(async () => {
      if (!this.accepting) throw new RuntimeOperationalError("Runtime manager is shutting down");
      const slots = this.clientSlots.get(clientId) ?? {};
      const occupiedId = slots[role];
      if (occupiedId) {
        const occupied = this.runtimes.get(occupiedId);
        if (role === "help" && occupied?.runtime.alive) {
          throw new RuntimeOperationalError("The help runtime for this client is busy");
        }
        if (occupied) await this.closeManaged(occupiedId, occupied);
      }

      const executable = await (this.executablePromise ??= discoverOctave(this.options.octavePath));
      const runtime = await OctaveRuntime.create(
        documentId,
        executable,
        this.options.tempRoot,
        this.options.timeoutMs,
        this.options.maxOutputBytes,
      );
      const now = Date.now();
      const managed: ManagedRuntime = {
        runtime,
        clientId,
        role,
        createdAt: now,
        lastActivityAt: now,
        idleTimer: null,
      };
      this.runtimes.set(runtime.runtimeId, managed);
      const currentSlots = this.clientSlots.get(clientId) ?? {};
      currentSlots[role] = runtime.runtimeId;
      this.clientSlots.set(clientId, currentSlots);
      this.touch(runtime.runtimeId, managed);
      return { runtimeId: runtime.runtimeId };
    });
  }

  async execute(runtimeId: string, input: ExecuteInput): Promise<ExecuteResult> {
    const managed = this.get(runtimeId);
    this.touch(runtimeId, managed);
    try {
      const result = await managed.runtime.execute(input);
      if (managed.role !== "help" && managed.runtime.alive) this.touch(runtimeId, managed);
      return result;
    } finally {
      if (managed.role === "help" || !managed.runtime.alive) {
        await this.close(runtimeId).catch(() => undefined);
      }
    }
  }

  async inspect(runtimeId: string, expression: string): Promise<InspectResult> {
    const managed = this.get(runtimeId);
    this.touch(runtimeId, managed);
    try {
      const result = await managed.runtime.inspect(expression);
      if (managed.role !== "help" && managed.runtime.alive) this.touch(runtimeId, managed);
      return result;
    } finally {
      if (managed.role === "help" || !managed.runtime.alive) {
        await this.close(runtimeId).catch(() => undefined);
      }
    }
  }

  async close(runtimeId: string): Promise<void> {
    await this.serialize(async () => {
      const managed = this.runtimes.get(runtimeId);
      if (managed) await this.closeManaged(runtimeId, managed);
    });
  }

  async closeAll(): Promise<void> {
    this.accepting = false;
    await this.serialize(async () => {
      const runtimes = [...this.runtimes.entries()];
      this.runtimes.clear();
      this.clientSlots.clear();
      for (const lease of this.clientLeases.values()) {
        if (lease.timer) clearTimeout(lease.timer);
      }
      this.clientLeases.clear();
      for (const [, managed] of runtimes) {
        if (managed.idleTimer) clearTimeout(managed.idleTimer);
      }
      await Promise.allSettled(runtimes.map(([, managed]) => managed.runtime.close()));
    });
  }

  status(): RuntimeStatus[] {
    return [...this.runtimes.values()]
      .map((managed) => ({
        runtimeId: managed.runtime.runtimeId,
        documentId: managed.runtime.documentId,
        clientId: managed.clientId,
        role: managed.role,
        pid: managed.runtime.pid,
        createdAt: new Date(managed.createdAt).toISOString(),
        lastActivityAt: new Date(managed.lastActivityAt).toISOString(),
      }))
      .sort((first, second) => first.createdAt.localeCompare(second.createdAt));
  }

  heartbeat(clientId: string): void {
    validateClientId(clientId);
    if (!this.accepting) return;
    const previous = this.clientLeases.get(clientId);
    const generation = (previous?.generation ?? 0) + 1;
    const lastHeartbeatAt = Date.now();
    if (previous?.timer) clearTimeout(previous.timer);
    const lease: ClientLease = { generation, lastHeartbeatAt, timer: null };
    this.clientLeases.set(clientId, lease);
    this.scheduleClientLease(clientId, lease, this.options.clientTimeoutMs);
  }

  private get(runtimeId: string): ManagedRuntime {
    const managed = this.runtimes.get(runtimeId);
    if (!managed) throw new RuntimeOperationalError(`Unknown Octave runtime: ${runtimeId}`);
    return managed;
  }

  private touch(runtimeId: string, managed: ManagedRuntime): void {
    if (this.runtimes.get(runtimeId) !== managed) return;
    managed.lastActivityAt = Date.now();
    if (managed.idleTimer) clearTimeout(managed.idleTimer);
    managed.idleTimer = setTimeout(() => {
      void this.close(runtimeId);
    }, this.options.idleTimeoutMs);
    managed.idleTimer.unref();
  }

  private scheduleClientLease(clientId: string, lease: ClientLease, delayMs: number): void {
    if (lease.timer) clearTimeout(lease.timer);
    const generation = lease.generation;
    lease.timer = setTimeout(() => {
      void this.serialize(async () => {
        const current = this.clientLeases.get(clientId);
        if (!current || current.generation !== generation) return;
        const remaining = this.options.clientTimeoutMs - (Date.now() - current.lastHeartbeatAt);
        if (remaining > 0) {
          this.scheduleClientLease(clientId, current, remaining);
          return;
        }
        this.clientLeases.delete(clientId);
        const slots = this.clientSlots.get(clientId);
        for (const runtimeId of [slots?.notebook, slots?.help]) {
          if (!runtimeId) continue;
          const managed = this.runtimes.get(runtimeId);
          if (managed) await this.closeManaged(runtimeId, managed);
        }
      });
    }, delayMs);
    lease.timer.unref();
  }

  private async closeManaged(runtimeId: string, managed: ManagedRuntime): Promise<void> {
    if (this.runtimes.get(runtimeId) !== managed) return;
    this.runtimes.delete(runtimeId);
    if (managed.idleTimer) clearTimeout(managed.idleTimer);
    const slots = this.clientSlots.get(managed.clientId);
    if (slots?.[managed.role] === runtimeId) delete slots[managed.role];
    if (slots && !slots.notebook && !slots.help) this.clientSlots.delete(managed.clientId);
    await managed.runtime.close();
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.lifecycleQueue.then(operation, operation);
    this.lifecycleQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

export function createRuntimeManager(options: RuntimeManagerOptions = {}): RuntimeManager {
  return new RuntimeManagerImpl(options);
}

async function discoverOctave(explicit?: string): Promise<string> {
  const requested = explicit ?? process.env.OCTAVE_CLI_PATH;
  if (requested) {
    if (await canStartOctave(requested)) return requested;
    throw new RuntimeOperationalError(
      `The configured Octave executable could not be started: ${JSON.stringify(requested)}`,
    );
  }

  for (const command of process.platform === "win32"
    ? ["octave-cli.exe", "octave-cli", "octave.exe", "octave"]
    : ["octave-cli", "octave"]) {
    if (await canStartOctave(command)) return command;
  }

  if (process.platform === "win32") {
    for (const candidate of await windowsOctaveCandidates()) {
      if (await canStartOctave(candidate)) return candidate;
    }
  }

  throw new RuntimeOperationalError(
    "No local Octave installation was found. Add octave-cli to PATH or set OCTAVE_CLI_PATH.",
  );
}

async function canStartOctave(executable: string): Promise<boolean> {
  if (/[\\/]/.test(executable)) {
    try {
      await access(executable, fsConstants.X_OK);
    } catch {
      return false;
    }
  }

  return new Promise<boolean>((resolveCheck) => {
    let settled = false;
    const child = spawn(executable, ["--version"], {
      stdio: "ignore",
      windowsHide: true,
    });
    const timer = setTimeout(() => {
      child.kill();
      if (!settled) {
        settled = true;
        resolveCheck(false);
      }
    }, 4_000);
    timer.unref();
    child.once("error", () => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        resolveCheck(false);
      }
    });
    child.once("exit", (code) => {
      clearTimeout(timer);
      if (!settled) {
        settled = true;
        resolveCheck(code === 0);
      }
    });
  });
}

async function windowsOctaveCandidates(): Promise<string[]> {
  const roots = new Set<string>();
  for (const root of [process.env.ProgramFiles, process.env["ProgramFiles(x86)"], "C:\\Octave"]) {
    if (root) roots.add(root === "C:\\Octave" ? root : join(root, "GNU Octave"));
  }

  const candidates: string[] = [];
  for (const root of roots) {
    try {
      const entries = await readdir(root, { withFileTypes: true });
      for (const entry of entries
        .filter((item) => item.isDirectory() && /octave/i.test(item.name))
        .sort((a, b) => b.name.localeCompare(a.name, undefined, { numeric: true }))) {
        candidates.push(join(root, entry.name, "mingw64", "bin", "octave-cli.exe"));
        candidates.push(join(root, entry.name, "usr", "bin", "octave-cli.exe"));
      }
    } catch {
      // This root simply does not exist on the current machine.
    }
  }
  return candidates;
}

function normalizeOctaveError(error: OctaveErrorPayload, sourcePath: string): RuntimeError {
  const message = error.message || error.identifier || "Octave execution failed";
  const messageLocation = /near line\s+(\d+)(?:,\s*column\s+(\d+))?/i.exec(message);
  const frames = !error.stack ? [] : Array.isArray(error.stack) ? error.stack : [error.stack];
  const normalizedSource = normalize(sourcePath).toLocaleLowerCase();
  const frame =
    frames.find(
      (item) => item.file && normalize(item.file).toLocaleLowerCase() === normalizedSource,
    ) ?? frames[0];
  const line = messageLocation?.[1]
    ? Number(messageLocation[1])
    : Number.isFinite(frame?.line)
      ? Number(frame?.line)
      : null;
  const column = messageLocation?.[2]
    ? Number(messageLocation[2])
    : Number.isFinite(frame?.column)
      ? Number(frame?.column)
      : null;
  const stack = frames.length
    ? frames
        .map((item) => {
          const location = [item.file, item.line, item.column].filter((part) => part != null).join(":");
          return item.name ? `${item.name} (${location})` : location;
        })
        .filter(Boolean)
        .join("\n")
    : undefined;
  return { message, line, column, ...(stack ? { stack } : {}) };
}

function octaveString(value: string): string {
  if (value === "") return "''";
  const bytes = Buffer.from(value, "utf8");
  return `native2unicode(uint8([${[...bytes].join(" ")}]), 'UTF-8')`;
}

function safeFilePart(value: string): string {
  const safe = basename(value).replace(/[^a-zA-Z0-9_.-]+/g, "-").slice(0, 48);
  return safe || "cell";
}

function ensureTrailingNewline(value: string): string {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function trimOuterBlankLines(value: string): string {
  return value
    .replace(/^(?:[\t ]*\r?\n)+/, "")
    .replace(/(?:\r?\n[\t ]*)+$/, "");
}

function positiveInteger(value: number | undefined, fallback: number, name: string): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value <= 0) {
    throw new TypeError(`${name} must be a positive integer`);
  }
  return value;
}

function validateClientId(clientId: string): void {
  if (
    typeof clientId !== "string" ||
    clientId.length < 1 ||
    clientId.length > 128 ||
    !/^[a-zA-Z0-9_.:-]+$/.test(clientId)
  ) {
    throw new TypeError("clientId must be a non-empty identifier of at most 128 characters");
  }
}
