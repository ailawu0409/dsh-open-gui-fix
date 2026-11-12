/**
 * The launch environment fix: a detached launch that starts an external
 * application must not inherit `ELECTRON_RUN_AS_NODE`, or an Electron-based
 * application (VS Code, Cursor, Windsurf, ...) starts as a plain Node process
 * and shows no window. The variable is removed from a shallow copy of the
 * child's environment only — the parent's `process.env` is never touched, and
 * every other spawn shape keeps the environment it asked for.
 *
 * The exception is a launch that deliberately uses an Electron binary as a
 * Node interpreter (GitHub Desktop's packaged `cli.js`, for example): those
 * keep the variable, because removing it would break them instead.
 * @module @local/gui-launch-env-fix/intercept
 */

import { statSync } from 'node:fs'

/** The Electron switch that turns an Electron binary into a plain Node process. */
const RUN_AS_NODE = 'ELECTRON_RUN_AS_NODE'

/**
 * Cross-module-generation marker. A reloaded plugin module cannot see the
 * previous generation's state, so the marker lives on the wrapped function
 * itself and makes a second installation a no-op.
 */
const INTERCEPTOR = Symbol.for('dsh.gui-launch-env-fix.interceptor')

/** A Node entrypoint script handed to an Electron binary that runs as Node. */
const JS_ENTRYPOINT = /\.(?:c|m)?js$/i

/**
 * Node switches that start an interpreter without naming a script: eval,
 * print, interactive REPL, and preload. Any other leading flag belongs to the
 * application's own argv (a window manager's `-d`, a shell's `--cd=...`).
 */
const NODE_SWITCH = /^-[epir]{1,4}$|^--(?:eval|print|inspect|inspect-brk|require|import|loader|input-type|enable-source-maps|experimental-[a-z-]+)(?:=|$)/

/** Whether an environment object carries the switch under any letter case. */
function hasRunAsNode(env) {
  if (env === undefined || env === null) return false
  for (const key of Object.keys(env)) {
    if (key.toUpperCase() === RUN_AS_NODE) return true
  }
  return false
}

/** Whether one argv element names a JavaScript script that exists on disk. */
function isExistingScript(value) {
  if (typeof value !== 'string' || !JS_ENTRYPOINT.test(value)) return false
  try {
    return statSync(value).isFile()
  } catch {
    // Swallows ENOENT/EACCES: a path that is not there proves no script.
    return false
  }
}

/**
 * Remove the switch from a child environment.
 * @param env - the environment object the caller is about to hand a child.
 * @returns a fresh shallow copy without the switch, or `env` itself when it
 *   carries no switch (so an unaffected spawn keeps its exact argument).
 */
export function stripRunAsNode(env) {
  if (!hasRunAsNode(env)) return env
  const copy = {}
  for (const [key, value] of Object.entries(env)) {
    if (key.toUpperCase() === RUN_AS_NODE) continue
    copy[key] = value
  }
  return copy
}

/**
 * Whether one detached launch uses its executable as a Node interpreter, in
 * which case the switch is required rather than leaked.
 * @param args - the argv handed to the child (without the program itself).
 * @returns true when some argument is an existing JavaScript script, or when
 *   the first argument is a Node interpreter switch; false for an ordinary GUI
 *   argv such as a directory to open.
 */
export function keepsRunAsNode(args) {
  if (args.some(isExistingScript)) return true
  const first = args[0]
  return typeof first === 'string' && NODE_SWITCH.test(first)
}

/** Whether a spawn argument is an options object rather than an argv array. */
function isOptions(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Install the interceptor over `childProcess.spawn`.
 *
 * The ESM importers of `node:child_process` (the open-in-app host bundle among
 * them) hold live bindings into this module's exports, so the caller must
 * re-publish the CommonJS exports through `syncBuiltinESMExports` after the
 * replacement for them to observe it.
 * @param options - the `child_process` module to patch and the sync function.
 * @returns the disposer that restores the original export.
 */
export function installSpawnInterceptor({ childProcess, syncBuiltinESMExports }) {
  if (typeof syncBuiltinESMExports !== 'function') {
    throw new TypeError('gui-launch-env-fix: this runtime has no module.syncBuiltinESMExports()')
  }
  const current = childProcess.spawn
  if (typeof current !== 'function') {
    throw new TypeError('gui-launch-env-fix: child_process.spawn is not a function')
  }
  // A previous module generation already installed its interceptor: keep it.
  if (current[INTERCEPTOR] !== undefined) return () => {}

  const original = current
  const interceptor = function spawn(command, ...rest) {
    try {
      const [first, second] = rest
      const hasArgv = Array.isArray(first)
      const argv = hasArgv ? first : []
      const options = hasArgv ? second : first
      if (isOptions(options) && options.detached === true && !keepsRunAsNode(argv)) {
        const source = options.env ?? process.env
        const sanitized = stripRunAsNode(source)
        if (sanitized !== source) {
          const patched = { ...options, env: sanitized }
          return hasArgv
            ? Reflect.apply(original, this, [command, argv, patched])
            : Reflect.apply(original, this, [command, patched])
        }
      }
    } catch {
      // Swallows every interceptor failure: a launch must never break because
      // this plugin could not decide, so it falls through to the exact call.
    }
    return Reflect.apply(original, this, [command, ...rest])
  }
  interceptor[INTERCEPTOR] = original

  childProcess.spawn = interceptor
  syncBuiltinESMExports()
  return function uninstall() {
    if (childProcess.spawn !== interceptor) return
    childProcess.spawn = original
    syncBuiltinESMExports()
  }
}
