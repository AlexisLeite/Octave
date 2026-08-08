#!/usr/bin/env node

import { printRunUsage, runConsoleMonitor } from "../src/run.js";
import { main as runIndexServer } from "../src/index-server.js";
import { installConsoleMonitor } from "../src/install.js";
import { DEFAULT_HOST, INDEX_PORT } from "../src/constants.js";

function printUsage() {
  console.error(
    [
      "Usage:",
      "  cm run [--cwd <path>] [--id <id>] -- <command> [args...]",
      "  cm mcp",
      "  cm server",
      "  cm install",
      "",
      "Commands:",
      "  run      Run a command and register it in the local console index",
      "  mcp      Start the MCP stdio bridge for the local console index",
      `  server   Start the local console index on ${DEFAULT_HOST}:${INDEX_PORT}`,
      "  install  Install run.mjs and server.mjs under ~/.mcp/console-monitor"
    ].join("\n")
  );
}

const [command, ...args] = process.argv.slice(2);

try {
  if (command === "--help" || command === "-h" || !command) {
    printUsage();
    process.exit(command ? 0 : 1);
  }

  if (command === "run") {
    await runConsoleMonitor(args);
  } else if (command === "mcp") {
    const { main: runMcpServer } = await import("../src/mcp.js");
    await runMcpServer();
  } else if (command === "server") {
    await runIndexServer();
  } else if (command === "install") {
    const result = await installConsoleMonitor();
    console.log(`Installed console-monitor runtime in ${result.installDir}`);
    console.log(`cm: ${result.cmScript}`);
    console.log(`server: ${result.serverScript}`);
    console.log(`run: ${result.runScript}`);
  } else {
    console.error(`[cm] Unsupported command: ${command}`);
    printUsage();
    process.exit(1);
  }
} catch (error) {
  console.error(`[cm] ${error.stack || error.message}`);
  if (command === "run") {
    printRunUsage();
  }
  process.exit(1);
}
