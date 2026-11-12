# dsh-open-gui-fix

Fixes the **Open in** menu of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
for Electron applications such as VS Code, Cursor, and Windsurf: clicking
**Open in VS Code** opens the application window instead of doing nothing
visible.

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

## Install

This is a local DSH bundle: it is installed by directory, not from a registry.

1. Clone this repository somewhere permanent — DSH links the directory, so do
   not move or delete it afterwards:

   ```sh
   git clone https://github.com/ailawu0409/dsh-open-gui-fix.git
   ```

2. In DSH, open **Plugins** and add this directory as a local plugin, or install
   it from an agent session:

   ```
   plugin_manager install_bundle target="<absolute path to the cloned directory>"
   ```

3. Confirm the row **Open in app window fix** / **外部应用打开修复** in
   **Plugins**, then click **Open in VS Code** on a workspace.

Enabling the row takes effect immediately for a new installation. After
replacing an already installed copy of the package, restart DSH so the host
loads the new module.

## Where it applies

The plugin has no page of its own. It takes effect for the menus that offer
**Open in ...**, for example **Open in VS Code** on a workspace or directory.

## Requirements

- A DSH host with `module.syncBuiltinESMExports` in its runtime (every current
  Electron/Node release has it). Without it the plugin row fails loudly instead
  of pretending to work.
- Verified against DSH `0.2.2-rc.2` on Windows Desktop. The mechanism is not
  Windows-specific, but macOS and Linux are untested.

## After a DSH upgrade

Run the doctor, which reports whether the running installation still leaks the
variable and whether the launch shape this plugin intercepts still exists:

```sh
node tools/doctor.mjs
```

It re-executes itself under the DSH runtime when the packages live inside
`app.asar`. Its verdict tells you whether to keep the plugin, remove it because
upstream fixed the leak, or update `intercept.js` because the launch
implementation changed.

## Limitations

- A DSH terminal is not covered: running `code .` there still inherits the
  variable from the shell. This plugin fixes the **Open in ...** launch path
  only.
- `spawnSync`, `exec`, `execFile`, and `fork` are not patched; `fork` needs the
  variable by design.
- If DSH itself starts stripping the variable from child environments, this
  plugin becomes a harmless no-op.

## Tests

```sh
node test/intercept.test.mjs
node test/integration.test.mjs
```

The integration test launches a bounded probe in a temporary directory, asserts
that a detached launch loses the variable and that a JavaScript-entrypoint
launch keeps it, and removes its temporary files afterwards.

## Turning it off

Disable the row in **Plugins**, or remove the bundle. The previous behaviour
returns immediately: clicking an Electron application in the **Open in** menu
has no visible effect again.

## License

[MIT](LICENSE)

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
