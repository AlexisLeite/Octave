import { chmod, cp, mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { homedir } from "node:os";
import { DEFAULT_HOST, INDEX_PORT, INSTALL_DIR_NAME } from "./constants.js";

function scriptFor(sourceFile, exportName) {
  const sourceUrl = pathToFileURL(sourceFile).href;

  return [
    "#!/usr/bin/env node",
    `import { ${exportName} } from ${JSON.stringify(sourceUrl)};`,
    "",
    `${exportName}().catch((error) => {`,
    "  console.error(error.stack || error.message);",
    "  process.exit(1);",
    "});",
    ""
  ].join("\n");
}

function commandScript(mcpScript) {
  return [
    "#!/usr/bin/env node",
    "",
    "import { spawn } from \"node:child_process\";",
    "import { installConsoleMonitor } from \"./src/install.js\";",
    "import { main as runIndexServer } from \"./src/index-server.js\";",
    "import { printRunUsage, runConsoleMonitor } from \"./src/run.js\";",
    "",
    "function printUsage() {",
    "  console.error([",
    "    \"Usage:\",",
    "    \"  cm run [--cwd <path>] [--id <id>] -- <command> [args...]\",",
    "    \"  cm mcp\",",
    "    \"  cm server\",",
    "    \"  cm install\",",
    "    \"\",",
    "    \"Commands:\",",
    "    \"  run      Run a command and register it in the local console index\",",
    "    \"  mcp      Start the MCP stdio bridge for the local console index\",",
    `    \"  server   Start the local console index on ${DEFAULT_HOST}:${INDEX_PORT}\",`,
    "    \"  install  Install the shared console-monitor runtime under ~/.mcp/console-monitor\"",
    "  ].join(\"\\n\"));",
    "}",
    "",
    "function runMcpServer(args) {",
    "  return new Promise((resolvePromise, reject) => {",
    `    const child = spawn(process.execPath, [${JSON.stringify(mcpScript)}, ...args], {`,
    "      stdio: \"inherit\"",
    "    });",
    "    child.once(\"error\", reject);",
    "    child.once(\"exit\", (code, signal) => {",
    "      if (signal) {",
    "        reject(new Error(`MCP server exited with signal ${signal}`));",
    "        return;",
    "      }",
    "      resolvePromise(code ?? 1);",
    "    });",
    "  });",
    "}",
    "",
    "const [command, ...args] = process.argv.slice(2);",
    "",
    "try {",
    "  if (command === \"--help\" || command === \"-h\" || !command) {",
    "    printUsage();",
    "    process.exit(command ? 0 : 1);",
    "  }",
    "",
    "  if (command === \"run\") {",
    "    await runConsoleMonitor(args);",
    "  } else if (command === \"mcp\") {",
    "    process.exit(await runMcpServer(args));",
    "  } else if (command === \"server\") {",
    "    await runIndexServer();",
    "  } else if (command === \"install\") {",
    "    const result = await installConsoleMonitor();",
    "    console.log(`Installed console-monitor runtime in ${result.installDir}`);",
    "    console.log(`cm: ${result.cmScript}`);",
    "    console.log(`server: ${result.serverScript}`);",
    "    console.log(`run: ${result.runScript}`);",
    "  } else {",
    "    console.error(`[cm] Unsupported command: ${command}`);",
    "    printUsage();",
    "    process.exit(1);",
    "  }",
    "} catch (error) {",
    "  console.error(`[cm] ${error.stack || error.message}`);",
    "  if (command === \"run\") {",
    "    printRunUsage();",
    "  }",
    "  process.exit(1);",
    "}",
    ""
  ].join("\n");
}

function samePath(left, right) {
  const resolvedLeft = resolve(left);
  const resolvedRight = resolve(right);

  if (process.platform === "win32") {
    return resolvedLeft.toLowerCase() === resolvedRight.toLowerCase();
  }

  return resolvedLeft === resolvedRight;
}

async function copyRuntimeSource(srcDir, runtimeSrcDir) {
  if (samePath(srcDir, runtimeSrcDir)) {
    return;
  }

  await rm(runtimeSrcDir, { recursive: true, force: true });
  await cp(srcDir, runtimeSrcDir, { recursive: true });
}

/**
 * Installs the shared runtime used by every local console-monitor shim safely.
 */
export async function installConsoleMonitor() {
  const srcDir = dirname(fileURLToPath(import.meta.url));
  const installDir = resolve(homedir(), ".mcp", INSTALL_DIR_NAME);
  const runtimeSrcDir = resolve(installDir, "src");
  const cmScript = resolve(installDir, "cm.mjs");
  const serverScript = resolve(installDir, "server.mjs");
  const runScript = resolve(installDir, "run.mjs");
  const mcpScript = resolve(installDir, "mcp.mjs");

  await mkdir(installDir, { recursive: true });
  await copyRuntimeSource(srcDir, runtimeSrcDir);
  await writeFile(cmScript, commandScript(mcpScript), "utf8");
  await writeFile(serverScript, scriptFor(resolve(runtimeSrcDir, "index-server.js"), "main"), "utf8");
  await writeFile(runScript, scriptFor(resolve(runtimeSrcDir, "run.js"), "runConsoleMonitor"), "utf8");
  await writeFile(mcpScript, scriptFor(resolve(runtimeSrcDir, "mcp.js"), "main"), "utf8");

  if (process.platform !== "win32") {
    await chmod(cmScript, 0o755);
    await chmod(serverScript, 0o755);
    await chmod(runScript, 0o755);
  }

  return {
    installDir,
    cmScript,
    serverScript,
    runScript,
    mcpScript
  };
}

/**
 * Runs the shared runtime installer and prints every generated entrypoint.
 */
async function main() {
  const result = await installConsoleMonitor();
  console.log(`Installed console-monitor runtime in ${result.installDir}`);
  console.log(`cm: ${result.cmScript}`);
  console.log(`server: ${result.serverScript}`);
  console.log(`run: ${result.runScript}`);
}

if (process.argv[1] && samePath(fileURLToPath(import.meta.url), process.argv[1])) {
  main().catch((error) => {
    console.error(error.stack || error.message);
    process.exit(1);
  });
}
