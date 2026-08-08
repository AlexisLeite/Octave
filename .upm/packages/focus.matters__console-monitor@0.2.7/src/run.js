import { randomUUID } from "node:crypto";
import http from "node:http";
import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { DEFAULT_HOST, HEARTBEAT_INTERVAL_MS, HISTORY_LIMIT, INDEX_PORT } from "./constants.js";
import {
  ensureIndexServer,
  heartbeatConsole,
  registerConsole,
  unregisterConsole
} from "./index-client.js";

const DEFAULT_READ_LINES = 25;

function parsePositiveInteger(value, flagName) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Invalid value for ${flagName}: ${value}`);
  }

  return parsed;
}

function parseArgs(argv) {
  const options = {
    cwd: process.cwd(),
    id: randomUUID()
  };
  const command = [];
  let parsingFlags = true;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];

    if (parsingFlags && token === "--") {
      parsingFlags = false;
      continue;
    }

    if (parsingFlags && (token === "--help" || token === "-h")) {
      options.help = true;
      continue;
    }

    if (parsingFlags && token.startsWith("--cwd=")) {
      options.cwd = resolve(token.slice("--cwd=".length));
      continue;
    }

    if (parsingFlags && token === "--cwd") {
      index += 1;
      if (index >= argv.length) {
        throw new Error("Missing value for --cwd");
      }
      options.cwd = resolve(argv[index]);
      continue;
    }

    if (parsingFlags && token.startsWith("--id=")) {
      options.id = token.slice("--id=".length).trim();
      continue;
    }

    if (parsingFlags && token === "--id") {
      index += 1;
      if (index >= argv.length) {
        throw new Error("Missing value for --id");
      }
      options.id = argv[index].trim();
      continue;
    }

    command.push(token);
  }

  if (!options.id) {
    throw new Error("Console id cannot be empty");
  }

  return {
    options,
    command
  };
}

function printableCommand(command) {
  return command
    .map((token) => (/^[\w./:=@-]+$/.test(token) ? token : JSON.stringify(token)))
    .join(" ");
}

function quoteWindowsShellArg(token) {
  if (token === "") {
    return "\"\"";
  }

  const escaped = token
    .replace(/(\\*)"/g, "$1$1\\\"")
    .replace(/(\\+)$/g, "$1$1")
    .replace(/%/g, "%%");

  if (!/[\s"&()<>^|%]/.test(token)) {
    return escaped;
  }

  return `"${escaped}"`;
}

function consumeBufferedText(buffer, chunk, onLine) {
  const combined = buffer + chunk;
  const parts = combined.split(/\r\n|[\n\r]/);
  const endsWithLineBreak = /(?:\r\n|[\n\r])$/.test(combined);
  const completeLineCount = parts.length - 1;

  for (let index = 0; index < completeLineCount; index += 1) {
    onLine(parts[index]);
  }

  return endsWithLineBreak ? "" : parts[parts.length - 1];
}

function createHistoryWindow() {
  const lines = [];

  return {
    push(line) {
      lines.push(line);
      if (lines.length > HISTORY_LIMIT) {
        lines.splice(0, lines.length - HISTORY_LIMIT);
      }
    },
    read(count) {
      return lines.slice(-count);
    }
  };
}

function clampLines(value) {
  const parsed = Number.parseInt(String(value ?? DEFAULT_READ_LINES), 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return DEFAULT_READ_LINES;
  }

  return Math.min(parsed, HISTORY_LIMIT);
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  response.end(body);
}

function createMonitorServer(history, restartCommand) {
  return http.createServer((request, response) => {
    const url = new URL(request.url, `http://${DEFAULT_HOST}`);

    if (request.method === "GET" && url.pathname === "/health") {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === "GET" && url.pathname === "/read") {
      const lines = clampLines(url.searchParams.get("lines"));
      sendJson(response, 200, {
        lines,
        output: history.read(lines).join("\n")
      });
      return;
    }

    if (request.method === "POST" && url.pathname === "/restart") {
      Promise.resolve(restartCommand())
        .then(() => {
          sendJson(response, 200, { ok: true });
        })
        .catch((error) => {
          sendJson(response, 500, { error: error.message });
        });
      return;
    }

    sendJson(response, 404, { error: "Not found" });
  });
}

function listenMonitorServer(history, restartCommand) {
  const server = createMonitorServer(history, restartCommand);

  return new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, DEFAULT_HOST, () => {
      server.off("error", reject);
      const address = server.address();
      if (!address || typeof address !== "object") {
        reject(new Error("Monitor server did not expose a TCP address"));
        return;
      }

      resolvePromise({
        server,
        port: address.port
      });
    });
  });
}

function spawnCommand(command, args, cwd) {
  const stdio = ["inherit", "pipe", "pipe"];

  if (process.platform !== "win32") {
    return spawn(command, args, {
      cwd,
      detached: true,
      env: process.env,
      stdio
    });
  }

  return spawn([command, ...args].map(quoteWindowsShellArg).join(" "), {
    cwd,
    env: process.env,
    stdio,
    shell: true
  });
}

function waitForChildExit(child, timeoutMs) {
  if (child.exitCode != null || child.signalCode != null) {
    return Promise.resolve(true);
  }

  return new Promise((resolvePromise) => {
    const timer = setTimeout(() => {
      child.off("exit", handleExit);
      resolvePromise(false);
    }, timeoutMs);

    function handleExit() {
      clearTimeout(timer);
      resolvePromise(true);
    }

    child.once("exit", handleExit);
  });
}

async function terminateChild(child) {
  if (child.exitCode != null || child.signalCode != null) {
    return;
  }

  if (process.platform === "win32") {
    const killer = spawn("taskkill", ["/pid", String(child.pid), "/t", "/f"], {
      stdio: "ignore",
      windowsHide: true
    });
    await new Promise((resolvePromise) => {
      killer.once("error", resolvePromise);
      killer.once("exit", resolvePromise);
    });
  } else {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      child.kill("SIGTERM");
    }
  }

  if (await waitForChildExit(child, 5000)) {
    return;
  }

  try {
    if (process.platform === "win32") {
      child.kill("SIGKILL");
    } else {
      process.kill(-child.pid, "SIGKILL");
    }
  } catch {
    child.kill("SIGKILL");
  }

  if (!(await waitForChildExit(child, 5000))) {
    throw new Error(`Command process ${child.pid} did not exit during restart`);
  }
}

/**
 * Prints usage for running a command through the indexed console monitor.
 */
export function printRunUsage() {
  console.error(
    [
      "Usage:",
      "  cm run [--cwd <path>] [--id <id>] -- <command> [args...]",
      "  cm run [--cwd <path>] [--id <id>] <command> [args...]",
      "",
      `The command is registered in the local index at ${DEFAULT_HOST}:${INDEX_PORT}.`,
      "The monitor refreshes its index entry every 5 seconds while running.",
      "",
      "Examples:",
      "  cm run -- pnpm dev",
      "  cm run --cwd /path/to/project -- npm run watch"
    ].join("\n")
  );
}

/**
 * Runs a command, stores recent output, and registers it in the local index.
 */
export async function runConsoleMonitor(argv = process.argv.slice(2)) {
  let parsed;

  try {
    parsed = parseArgs(argv);
  } catch (error) {
    console.error(`[cm run] ${error.message}`);
    printRunUsage();
    process.exit(1);
  }

  if (parsed.options.help) {
    printRunUsage();
    process.exit(0);
  }

  if (parsed.command.length === 0) {
    console.error("[cm run] Missing command");
    printRunUsage();
    process.exit(1);
  }

  const [command, ...args] = parsed.command;
  const history = createHistoryWindow();
  const streamBuffers = {
    stdout: "",
    stderr: ""
  };
  const commandLabel = printableCommand(parsed.command);
  const record = {
    id: parsed.options.id,
    pwd: parsed.options.cwd,
    command: commandLabel,
    host: DEFAULT_HOST,
    port: null
  };

  let restartHandler = null;

  await ensureIndexServer();
  const monitor = await listenMonitorServer(history, () => {
    if (!restartHandler) {
      throw new Error("Console command is not ready to restart");
    }
    return restartHandler();
  });
  record.port = monitor.port;
  await registerConsole(record);

  console.error(`[cm run] Registered ${record.id} in index ${DEFAULT_HOST}:${INDEX_PORT}`);

  let child = null;
  let isExiting = false;
  let restartingChild = null;
  let restartPromise = null;

  function flushPartialLines() {
    for (const source of Object.keys(streamBuffers)) {
      const remainder = streamBuffers[source];
      if (!remainder) {
        continue;
      }

      history.push(remainder);
      streamBuffers[source] = "";
    }
  }

  function handleChunk(source, chunk) {
    const text = chunk.toString("utf8");
    const target = source === "stdout" ? process.stdout : process.stderr;

    target.write(text);
    streamBuffers[source] = consumeBufferedText(streamBuffers[source], text, (line) => {
      history.push(line);
    });
  }

  async function cleanup() {
    if (isExiting) {
      return;
    }

    isExiting = true;
    clearInterval(heartbeatTimer);
    flushPartialLines();

    try {
      await unregisterConsole(record.id);
    } catch (error) {
      console.error(`[cm run] Failed to unregister ${record.id}: ${error.message}`);
    }

    monitor.server.close();
  }

  function startCommand() {
    const nextChild = spawnCommand(command, args, parsed.options.cwd);
    child = nextChild;

    nextChild.stdout?.on("data", (chunk) => {
      handleChunk("stdout", chunk);
    });
    nextChild.stderr?.on("data", (chunk) => {
      handleChunk("stderr", chunk);
    });

    nextChild.on("error", async (error) => {
      console.error(`[cm run] Failed to start child process: ${error.message}`);
      await cleanup();
      process.exit(1);
    });

    nextChild.on("exit", async (code, signal) => {
      if (restartingChild === nextChild) {
        return;
      }

      await cleanup();

      if (signal) {
        process.exit(1);
        return;
      }

      process.exit(code ?? 1);
    });

    return new Promise((resolvePromise, reject) => {
      nextChild.once("spawn", resolvePromise);
      nextChild.once("error", reject);
    });
  }

  async function restartCommand() {
    if (restartPromise) {
      return restartPromise;
    }

    restartPromise = (async () => {
      const previousChild = child;
      if (!previousChild || previousChild.exitCode != null || previousChild.signalCode != null) {
        throw new Error("Console command is not currently running");
      }

      restartingChild = previousChild;
      flushPartialLines();
      console.error(`[cm run] Restarting ${record.id}: ${commandLabel}`);

      try {
        await terminateChild(previousChild);
        flushPartialLines();
        history.push(`[cm run] Restarting ${commandLabel}`);
        if (isExiting) {
          throw new Error("Console monitor is shutting down");
        }
        await startCommand();
      } finally {
        restartingChild = null;
      }
    })();

    try {
      await restartPromise;
    } finally {
      restartPromise = null;
    }
  }

  const heartbeatTimer = setInterval(() => {
    heartbeatConsole(record).catch((error) => {
      console.error(`[cm run] Failed to refresh index entry ${record.id}: ${error.message}`);
    });
  }, HEARTBEAT_INTERVAL_MS);
  heartbeatTimer.unref?.();

  restartHandler = restartCommand;
  await startCommand();

  function forwardSignal(signal) {
    if (child && !child.killed) {
      child.kill(signal);
      return;
    }

    cleanup().finally(() => {
      process.exit(1);
    });
  }

  process.on("SIGINT", () => {
    forwardSignal("SIGINT");
  });
  process.on("SIGTERM", () => {
    forwardSignal("SIGTERM");
  });
}
