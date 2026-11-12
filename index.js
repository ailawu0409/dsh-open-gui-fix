/**
 * Host plugin entry: installs the detached-GUI launch interceptor for the whole
 * life of this plugin row and removes it again on disposal.
 *
 * The DSH host process itself runs with `ELECTRON_RUN_AS_NODE=1`, and the
 * open-in-app host half spawns the chosen application detached with the
 * inherited environment, so an Electron application started from "Open in ..."
 * used to come up as a plain Node process with no window. Nothing here changes
 * `process.env`: only the environment copy handed to a detached GUI child is
 * rewritten, which leaves the harness's own terminals, tools, and other child
 * processes exactly as they were.
 * @module @local/gui-launch-env-fix
 */

import childProcess from 'node:child_process'
import { syncBuiltinESMExports } from 'node:module'
import { installSpawnInterceptor } from './intercept.js'

/** Cordis function-plugin name. */
export const name = 'gui-launch-env-fix'

/**
 * Patch `child_process.spawn` for this plugin's life.
 * @param ctx - the plugin context that owns the interceptor.
 */
export function apply(ctx) {
  ctx.effect(
    () => installSpawnInterceptor({ childProcess, syncBuiltinESMExports }),
    'gui-launch-env-fix: strip ELECTRON_RUN_AS_NODE from detached GUI launches',
  )
}
