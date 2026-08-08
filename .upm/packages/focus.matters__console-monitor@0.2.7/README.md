# @focus.matters/console-monitor

Run long-lived commands and expose their recent console output to local agents.

## Install

```bash
cm install
```

This creates:

```text
~/.mcp/console-monitor/server.mjs
~/.mcp/console-monitor/run.mjs
```

`server.mjs` starts the local console index on `127.0.0.1:9500`.
`run.mjs` runs a command, registers it in that index, and refreshes its entry
every 5 seconds while the command is alive.

## CLI

```bash
cm server
cm run -- pnpm dev
cm run --cwd /path/to/project -- npm run watch
```

`cm run` starts the index automatically when the installed `server.mjs` is
available. Each monitor keeps recent output in memory and exposes reads through
the index. The index removes consoles that have not refreshed their state in
the last 15 seconds.

The index list only returns:

```json
[
  {
    "pwd": "/path/to/project",
    "command": "pnpm dev",
    "id": "..."
  }
]
```

## MCP

Start the MCP server with:

```bash
console-monitor-mcp
cm mcp
```

It exposes these tools:

- `index`: returns the current console index with `pwd`, `command`, and `id`.
- `read`: reads recent output from a console using `id` and `lines`.
- `restart`: stops and starts the console's original command using its `id`.
- `console_index`: alias for `index`.
- `console_read`: alias for `read`.
- `console_restart`: alias for `restart`.

Example MCP config:

```json
{
  "mcpServers": {
    "console-monitor": {
      "command": "npx",
      "args": ["-y", "@focus.matters/console-monitor", "mcp"]
    }
  }
}
```
