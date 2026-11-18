# dsh-open-gui-fix

[English](README.md) | [简体中文](README.zh.md)

[GitHub](https://github.com/ailawu0409/dsh-open-gui-fix) · [Issues](https://github.com/ailawu0409/dsh-open-gui-fix/issues)

Fixes the **Open in** menu of [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)
for Electron applications such as VS Code, Cursor, and Windsurf: clicking
**Open in VS Code** opens the application window instead of doing nothing
visible.

> **Unofficial plugin:** This project is not affiliated with or endorsed by
> DeepSeek. DSH extension APIs may change between releases.
>
> **Version note:** The version in `package.json` (currently `1.0.2`) is the
> plugin version, not the DSH host version. The manifest declares no host
> version constraint, so the compatibility notes below are advisory.

## Why the click did nothing

The DSH host process runs with `ELECTRON_RUN_AS_NODE=1`. The open-in-app host
half starts the chosen application detached with a credential-scrubbed copy of
the inherited environment (`*KEY*`, `*PASSWORD*`, `*SECRET*`, `*TOKEN*` and
`DSH_*` names are removed, but the switch is not), so that variable still reached
the application, and an Electron application started with it comes up as a
plain Node process with no window. Nothing failed loudly: the child exited
immediately.

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
  as `-e`, `--eval`, or `--inspect`;
- the plugin does not write files, use the network, or collect telemetry.

## Install

This repository is the private local package `@local/gui-launch-env-fix`. It is
installed by directory, not from a registry.

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

### Updating

Pull the new revision in the same directory and restart DSH:

```sh
git pull
```

DSH links the plugin directory, so do not move or delete it while the plugin is
installed.

## Where it applies

The plugin has no page of its own. It takes effect for the menus that offer
**Open in ...**, for example **Open in VS Code** on a workspace or directory.

## Compatibility

- DSH `0.2.2-rc.3` on Windows Desktop is verified. The mechanism is not
  Windows-specific, but macOS and Linux are untested.
- The DSH host runtime must provide `module.syncBuiltinESMExports` (current DSH
  desktop builds do). Without it the plugin row fails loudly instead of
  pretending to work.
- Plugin version `1.0.2` is independent of the DSH host version;
  `package.json` declares no host version constraint.

## After a DSH upgrade

Run the doctor, which reports whether the running installation still leaks the
variable and whether the launch shape this plugin intercepts still exists:

```sh
node tools/doctor.mjs
```

It re-executes itself under the DSH runtime when the packages live inside
`app.asar`; it reads `DSH_INSTALL_DIR` and `DSH_NODE_EXECUTABLE` from the DSH
shell. The doctor is read-only: it does not start DSH or modify the profile. Its
verdict tells you whether to keep the plugin, remove it because upstream fixed
the leak, or update `intercept.js` because the launch implementation changed.

## Limitations

- A DSH terminal is not covered: running `code .` there still inherits the
  variable from the shell. This plugin fixes the **Open in ...** launch path
  only.
- `spawnSync`, `exec`, `execFile`, and `fork` are not patched; `fork` needs the
  variable by design.
- If DSH itself starts stripping the variable from child environments, this
  plugin becomes a harmless no-op.

## Development

Node.js `24.17.0` is the current development environment; `package.json` does
not declare an `engines` constraint. The project has no third-party runtime
dependencies and does not require a dependency-install step for its tests.
There is no CI; run the full suite locally.

### Tests

```sh
npm test                          # all three test files
node test/intercept.test.mjs      # unit tests (12)
node test/index.test.mjs          # entry smoke test (1)
node test/integration.test.mjs    # integration tests (4; requires Windows cmd.exe)
npm pack --dry-run --json         # inspect published files
```

The unit tests stub `child_process` and cover environment stripping, spawn
shapes, install guards, and disposal. The entry test asserts the plugin name and
the real `ctx.effect` wiring against `node:child_process`. The integration
tests use real `child_process` and a temporary directory, and verify the ESM
replacement, detached launch stripping, JavaScript-entrypoint preservation, and
attached-child preservation. The integration tests require Windows because they
use `ComSpec`/`cmd.exe`.

See [AGENT.md](AGENT.md) for architecture, behavior contracts, and upgrade
notes (repository only).

## Structure

| File | Purpose | Packed |
| --- | --- | --- |
| `index.js` | Host plugin entry: exports `name` and installs/disposes the interceptor through `apply(ctx)` | ✓ |
| `intercept.js` | Core implementation: launch predicate, environment stripping, spawn wrapper, idempotent install/dispose | ✓ |
| `cordis.patch.yml` | Inserts the plugin row into the DSH bundle | ✓ |
| `locale/en.json`, `locale/zh.json` | Plugin page title and description (English / Chinese) | ✓ |
| `icon.svg` | Plugin icon | ✓ |
| `package.json` | Package exports, `dsh.bundle.patch`, `files` manifest, and `npm test` script | ✓ (npm always includes) |
| `README.md`, `README.zh.md` | User documentation (English / Chinese) | ✓ |
| `CHANGELOG.md` | Release history | ✓ |
| `LICENSE` | MIT license | ✓ |
| `test/intercept.test.mjs` | Unit tests for the pure helpers and spawn wrapper (stubbed `child_process`) | — |
| `test/index.test.mjs` | Plugin entry smoke test: `name` export and `ctx.effect` wiring | — |
| `test/integration.test.mjs` | Integration tests with real `child_process` (Windows) | — |
| `tools/doctor.mjs` | Read-only doctor for post-DSH-upgrade checks | — |
| `AGENT.md` | Development-agent guide, in Chinese | — |
| `.gitignore` | Ignores `node_modules/`, logs, and OS files | — |

`npm pack --dry-run` publishes 11 files: `index.js`, `intercept.js`,
`cordis.patch.yml`, `locale/en.json`, `locale/zh.json`, `icon.svg`,
`CHANGELOG.md`, `LICENSE`, `README.md`, `README.zh.md`, and `package.json`.
`AGENT.md`, `test/`, `tools/`, and `.gitignore` stay in the repository.

## Troubleshooting

- **The plugin row is missing:** Make sure the directory still exists and was
  added as a local plugin in **Plugins**. This package is local, not fetched
  from a registry.
- **Open in still does nothing:** Confirm the row is enabled. If you replaced an
  installed copy, restart DSH. Then run `node tools/doctor.mjs` and follow its
  verdict.
- **`code .` in a DSH terminal still fails:** That is expected; the plugin
  covers the **Open in ...** menu only (see Limitations).
- **The plugin row reports `syncBuiltinESMExports` missing:** The DSH runtime is
  too old or not a supported build; upgrade DSH.

## Turning it off

Disable the row in **Plugins**, or remove the bundle. The previous behaviour
returns immediately: clicking an Electron application in the **Open in** menu
has no visible effect again.

## License

[MIT](LICENSE)

[![](https://img.shields.io/badge/powered_by-dsh-4D6BFE?style=flat-square&logo=deepseek&logoColor=white)](https://github.com/deepseek-ai/deepseek-harness)
