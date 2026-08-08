import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  ensureIndexServer,
  listConsoles,
  readConsole,
  restartConsole
} from "./index-client.js";

function text(content) {
  return {
    content: [
      {
        type: "text",
        text: content
      }
    ]
  };
}

async function listIndexTool() {
  await ensureIndexServer();
  const consoles = await listConsoles();
  return text(JSON.stringify(consoles, null, 2));
}

async function readConsoleTool({ id, lines }) {
  await ensureIndexServer();
  const result = await readConsole(id, lines);
  return text(result.output || "");
}

async function restartConsoleTool({ id }) {
  await ensureIndexServer();
  const result = await restartConsole(id);
  return text(JSON.stringify(result, null, 2));
}

const readSchema = {
  id: z.string().min(1).describe("Console id returned by the index tool."),
  lines: z.number().int().min(0).max(1000).default(25).describe("Number of recent lines to read.")
};

const consoleIdSchema = {
  id: z.string().min(1).describe("Console id returned by the index tool.")
};

/**
 * Creates the MCP bridge exposing console discovery, reads, and restarts.
 */
export function createServer() {
  const server = new McpServer({
    name: "console-monitor",
    version: "0.3.0"
  });

  server.registerTool(
    "index",
    {
      description: "List active monitored consoles with pwd, command, and id.",
      inputSchema: {}
    },
    listIndexTool
  );

  server.registerTool(
    "read",
    {
      description: "Read recent output from a monitored console by id.",
      inputSchema: readSchema
    },
    readConsoleTool
  );

  server.registerTool(
    "restart",
    {
      description: "Restart the command running in a monitored console by id.",
      inputSchema: consoleIdSchema
    },
    restartConsoleTool
  );

  server.registerTool(
    "console_index",
    {
      description: "Alias for index. Lists active monitored consoles.",
      inputSchema: {}
    },
    listIndexTool
  );

  server.registerTool(
    "console_read",
    {
      description: "Alias for read. Reads recent output from a console by id.",
      inputSchema: readSchema
    },
    readConsoleTool
  );

  server.registerTool(
    "console_restart",
    {
      description: "Alias for restart. Restarts a monitored console command by id.",
      inputSchema: consoleIdSchema
    },
    restartConsoleTool
  );

  return server;
}

/**
 * Connects the console-monitor MCP server over stdio for MCP-compatible hosts.
 */
export async function main() {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
