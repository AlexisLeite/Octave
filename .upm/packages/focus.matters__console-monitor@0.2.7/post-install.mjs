#!/usr/bin/env node

import { chmod, mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { installConsoleMonitor } from "./src/install.js";

function localCommandPath(projectDir) {
  return resolve(projectDir, ".upm", "bin", process.platform === "win32" ? "cm.cmd" : "cm");
}

function localShim(cmScript) {
  if (process.platform === "win32") {
    return `@echo off\r\nnode "${cmScript}" %*\r\n`;
  }

  return `#!/usr/bin/env sh\nexec node "${cmScript}" "$@"\n`;
}

async function installLocalShim(cmScript) {
  const projectDir = process.env.UPM_PROJECT_DIR;
  if (!projectDir) {
    return null;
  }

  const shimPath = localCommandPath(projectDir);
  await mkdir(dirname(shimPath), { recursive: true });
  await writeFile(shimPath, localShim(cmScript), "utf8");

  if (process.platform !== "win32") {
    await chmod(shimPath, 0o755);
  }

  return shimPath;
}

const result = await installConsoleMonitor();
const shimPath = await installLocalShim(result.cmScript);

console.log(`Installed console-monitor runtime in ${result.installDir}`);
console.log(`cm: ${result.cmScript}`);
console.log(`server: ${result.serverScript}`);
console.log(`run: ${result.runScript}`);
if (shimPath) {
  console.log(`local shim: ${shimPath}`);
}
