import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import http from "node:http";
import { join } from "node:path";
import { homedir } from "node:os";
import { DEFAULT_HOST, INDEX_PORT, INSTALL_DIR_NAME } from "./constants.js";

function requestJson(method, path, payload, timeoutMs = 5000) {
  return new Promise((resolvePromise, reject) => {
    const body = payload == null ? null : JSON.stringify(payload);
    const request = http.request(
      {
        host: DEFAULT_HOST,
        port: INDEX_PORT,
        method,
        path,
        headers: body == null ? undefined : {
          "content-type": "application/json",
          "content-length": Buffer.byteLength(body)
        },
        timeout: timeoutMs
      },
      (response) => {
        let text = "";

        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          text += chunk;
        });
        response.on("end", () => {
          let parsed = null;
          if (text) {
            try {
              parsed = JSON.parse(text);
            } catch (error) {
              reject(new Error(`Invalid index response: ${error.message}`));
              return;
            }
          }

          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(parsed?.error || `Index server returned ${response.statusCode}`));
            return;
          }

          resolvePromise(parsed);
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error(`Timed out contacting console monitor index on port ${INDEX_PORT}`));
    });
    request.on("error", reject);

    if (body != null) {
      request.write(body);
    }

    request.end();
  });
}

function installedServerPath() {
  return join(homedir(), ".mcp", INSTALL_DIR_NAME, "server.mjs");
}

async function sleep(ms) {
  await new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

/**
 * Ensures the fixed local registry is reachable before a monitor registers.
 */
export async function ensureIndexServer() {
  try {
    await indexHealth();
    return;
  } catch {
    // The server is started below when the well-known install is present.
  }

  const serverScript = installedServerPath();
  try {
    await access(serverScript);
  } catch {
    const { installConsoleMonitor } = await import("./install.js");
    await installConsoleMonitor();
  }

  const child = spawn(process.execPath, [serverScript], {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  child.unref();

  for (let attempt = 0; attempt < 20; attempt += 1) {
    await sleep(250);
    try {
      await indexHealth();
      return;
    } catch {
      // Retry until the detached server has had enough time to bind.
    }
  }

  throw new Error(`Console monitor index did not start on ${DEFAULT_HOST}:${INDEX_PORT}`);
}

/**
 * Performs a health check against the fixed local console index HTTP server.
 */
export async function indexHealth() {
  return requestJson("GET", "/health");
}

/**
 * Registers or refreshes all public and private console metadata in the index.
 */
export async function registerConsole(consoleRecord) {
  return requestJson("POST", "/register", consoleRecord);
}

/**
 * Refreshes the last-seen timestamp that keeps a console entry discoverable.
 */
export async function heartbeatConsole(consoleRecord) {
  return requestJson("POST", "/heartbeat", consoleRecord);
}

/**
 * Removes a monitored console from the local index after its command exits.
 */
export async function unregisterConsole(id) {
  return requestJson("DELETE", `/consoles/${encodeURIComponent(id)}`);
}

/**
 * Reads the current non-stale console list exposed by the local index server.
 */
export async function listConsoles() {
  const response = await requestJson("GET", "/consoles");
  return response?.consoles ?? [];
}

/**
 * Reads recent output lines from a registered console through the index router.
 */
export async function readConsole(id, lines) {
  const params = new URLSearchParams();
  if (lines != null) {
    params.set("lines", String(lines));
  }

  return requestJson("GET", `/read/${encodeURIComponent(id)}?${params.toString()}`);
}

/**
 * Restarts the command owned by a registered console without changing its id.
 */
export async function restartConsole(id) {
  return requestJson("POST", `/restart/${encodeURIComponent(id)}`);
}
