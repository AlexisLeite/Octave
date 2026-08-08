---
name: console-monitor-usage
description: Use when Codex needs to inspect or monitor output from a running console command related to its current task through the console-monitor MCP server. Trigger only when a relevant dev server, watcher, build, test, or other process was launched with cm run and its state helps verify the current work.
---

# Console Monitor MCP Consumption

Use the `console-monitor` MCP server to discover commands launched through
`cm run` and read their recent output. Only inspect consoles whose command and
working directory are related to the current task. Do not read an unrelated
console merely because it appears in the index.

## Tool Selection

- Use `index` only when a monitored console may be relevant to the current
  task. It returns `pwd`, `command`, and `id`; use those fields to confirm
  relevance before reading output.
- Use `read` with the selected `id` to read recent console output.
- Use `restart` with the selected `id` when the current task requires the
  related console's original command to be stopped and started again.
- `console_index` and `console_read` are aliases for clients that prefer
  namespaced tool names; `console_restart` is the restart alias.

## Index Semantics

The local index runs on `127.0.0.1:9500`. A monitor refreshes its entry every
5 seconds while the wrapped command is alive. Entries that have not refreshed in
the last 15 seconds are removed from the index.

## Reading Output

Read enough lines to answer the immediate question. Start with 50 lines for
diagnosis, then request more only when the relevant error or startup message is
not visible.

When output is empty, report that the monitor is reachable but has no buffered
output. Then check whether the command has just started, the selected `id` is
wrong, or the command exited and aged out of the index.
