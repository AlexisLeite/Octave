import http from "node:http";
import { DEFAULT_HOST, DEFAULT_READ_LINES, INDEX_PORT, REGISTRY_TTL_MS } from "./constants.js";

const consoles = new Map();

function now() {
  return Date.now();
}

function pruneStaleConsoles() {
  const cutoff = now() - REGISTRY_TTL_MS;

  for (const [id, record] of consoles) {
    if (record.lastSeen < cutoff) {
      consoles.delete(id);
    }
  }
}

function publicConsole(record) {
  return {
    pwd: record.pwd,
    command: record.command,
    id: record.id
  };
}

function sendJson(response, statusCode, payload) {
  const body = JSON.stringify(payload, null, 2);
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  response.end(body);
}

function readBody(request) {
  return new Promise((resolvePromise, reject) => {
    let body = "";

    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => {
      if (!body.trim()) {
        resolvePromise({});
        return;
      }

      try {
        resolvePromise(JSON.parse(body));
      } catch (error) {
        reject(new Error(`Invalid JSON body: ${error.message}`));
      }
    });
    request.on("error", reject);
  });
}

function assertConsolePayload(payload) {
  if (!payload || typeof payload !== "object") {
    throw new Error("Console payload must be an object");
  }

  for (const key of ["id", "pwd", "command", "host"]) {
    if (typeof payload[key] !== "string" || payload[key].trim() === "") {
      throw new Error(`Console payload is missing ${key}`);
    }
  }

  if (!Number.isInteger(payload.port) || payload.port < 0 || payload.port > 65535) {
    throw new Error("Console payload has invalid port");
  }
}

function upsertConsole(payload) {
  assertConsolePayload(payload);

  const previous = consoles.get(payload.id);
  const record = {
    ...previous,
    id: payload.id,
    pwd: payload.pwd,
    command: payload.command,
    host: payload.host,
    port: payload.port,
    lastSeen: now()
  };

  consoles.set(record.id, record);
  return publicConsole(record);
}

function clampLines(value) {
  const parsed = Number.parseInt(String(value ?? DEFAULT_READ_LINES), 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    return DEFAULT_READ_LINES;
  }

  return Math.min(parsed, 1000);
}

function requestMonitorRead(record, lines) {
  return new Promise((resolvePromise, reject) => {
    const path = `/read?lines=${encodeURIComponent(String(lines))}`;
    const request = http.request(
      {
        host: record.host,
        port: record.port,
        method: "GET",
        path,
        timeout: 5000
      },
      (response) => {
        let body = "";

        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(`Monitor returned ${response.statusCode}`));
            return;
          }

          try {
            resolvePromise(JSON.parse(body));
          } catch (error) {
            reject(new Error(`Invalid monitor response: ${error.message}`));
          }
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error(`Timed out reading console ${record.id}`));
    });
    request.on("error", reject);
    request.end();
  });
}

function requestMonitorRestart(record) {
  return new Promise((resolvePromise, reject) => {
    const request = http.request(
      {
        host: record.host,
        port: record.port,
        method: "POST",
        path: "/restart",
        timeout: 15000
      },
      (response) => {
        let body = "";

        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          let parsed;
          try {
            parsed = body ? JSON.parse(body) : {};
          } catch (error) {
            reject(new Error(`Invalid monitor response: ${error.message}`));
            return;
          }

          if (response.statusCode < 200 || response.statusCode >= 300) {
            reject(new Error(parsed.error || `Monitor returned ${response.statusCode}`));
            return;
          }

          resolvePromise(parsed);
        });
      }
    );

    request.on("timeout", () => {
      request.destroy(new Error(`Timed out restarting console ${record.id}`));
    });
    request.on("error", reject);
    request.end();
  });
}

async function routeRequest(request, response) {
  const url = new URL(request.url, `http://${DEFAULT_HOST}:${INDEX_PORT}`);

  if (request.method === "GET" && url.pathname === "/health") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && (url.pathname === "/consoles" || url.pathname === "/index")) {
    pruneStaleConsoles();
    sendJson(response, 200, { consoles: Array.from(consoles.values(), publicConsole) });
    return;
  }

  if (request.method === "POST" && (url.pathname === "/register" || url.pathname === "/heartbeat")) {
    const payload = await readBody(request);
    const consoleRecord = upsertConsole(payload);
    sendJson(response, 200, { console: consoleRecord });
    return;
  }

  if (request.method === "DELETE" && url.pathname.startsWith("/consoles/")) {
    const id = decodeURIComponent(url.pathname.slice("/consoles/".length));
    consoles.delete(id);
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET" && url.pathname.startsWith("/read/")) {
    pruneStaleConsoles();
    const id = decodeURIComponent(url.pathname.slice("/read/".length));
    const record = consoles.get(id);

    if (!record) {
      sendJson(response, 404, { error: `Unknown console id: ${id}` });
      return;
    }

    const lines = clampLines(url.searchParams.get("lines"));
    const result = await requestMonitorRead(record, lines);
    sendJson(response, 200, {
      console: publicConsole(record),
      lines,
      output: result.output ?? ""
    });
    return;
  }

  if (request.method === "POST" && url.pathname.startsWith("/restart/")) {
    pruneStaleConsoles();
    const id = decodeURIComponent(url.pathname.slice("/restart/".length));
    const record = consoles.get(id);

    if (!record) {
      sendJson(response, 404, { error: `Unknown console id: ${id}` });
      return;
    }

    await requestMonitorRestart(record);
    record.lastSeen = now();
    sendJson(response, 200, {
      ok: true,
      console: publicConsole(record)
    });
    return;
  }

  sendJson(response, 404, { error: "Not found" });
}

/**
 * Creates the fixed-port HTTP index shared by monitor processes and MCP tools.
 */
export function createIndexServer() {
  return http.createServer((request, response) => {
    routeRequest(request, response).catch((error) => {
      sendJson(response, 500, { error: error.message });
    });
  });
}

/**
 * Starts the local console index server on the fixed registry port 9500.
 */
export async function main() {
  const server = createIndexServer();

  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(INDEX_PORT, DEFAULT_HOST, () => {
      server.off("error", reject);
      resolvePromise();
    });
  });

  console.error(`[console-monitor] index listening on ${DEFAULT_HOST}:${INDEX_PORT}`);
}
