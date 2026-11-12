# Open in app window fix

Fixes the **Open in** menu for Electron applications such as VS Code, Cursor,
and Windsurf: clicking **Open in VS Code** now opens the application window
instead of doing nothing visible.

## Why the click did nothing

The DSH host process runs with `ELECTRON_RUN_AS_NODE=1`. The open-in-app host
half starts the chosen application detached with the inherited environment, so
that variable reached the application, and an Electron application started with
it comes up as a plain Node process with no window. Nothing failed loudly: the
child exited immediately.

## What this plugin does

It rewrites the environment of a **detached** launch only:

- the variable is removed from a shallow copy of that child's environment;
- the caller's environment object, and `process.env` itself, are never modified;
- non-detached spawns (shell tools, background jobs, language servers, MCP
  servers, terminals) keep the exact environment they asked for;
- a detached launch that uses its executable as a Node interpreter keeps the
  variable. That is the case when one argument is a JavaScript script that
  exists on disk (GitHub Desktop starts through its packaged `cli.js` and needs
  the variable), or when the first argument is a Node interpreter switch such
  as `-e`, `--eval`, or `--inspect`.

## Where it applies

The plugin has no page of its own. It appears in **Plugins** and takes effect
for the menus that offer **Open in ...**, for example **Open in VS Code** on a
workspace or directory.

Enabling the row takes effect immediately for a new installation. After
replacing an already installed copy of the package, restart DSH so the host
loads the new module.

## Limitations

- A DSH terminal is not covered: running `code .` there still inherits the
  variable from the shell. This plugin fixes the **Open in ...** launch path
  only.
- `spawnSync`, `exec`, `execFile`, and `fork` are not patched; `fork` needs the
  variable by design.
- If DSH itself starts stripping the variable from child environments, this
  plugin becomes a harmless no-op.

## Turning it off

Disable this row in **Plugins**, or remove the bundle. The previous behaviour
returns immediately: clicking an Electron application in the **Open in** menu
has no visible effect again.
