/**
 * Doctor for @local/gui-launch-env-fix: reports whether the running DSH
 * installation still leaks `ELECTRON_RUN_AS_NODE` into detached GUI launches,
 * and whether the launch shape this plugin intercepts still exists.
 *
 * Run it in a DSH shell after every DSH upgrade:
 *   node tools/doctor.mjs
 *
 * A Desktop installation keeps its packages inside `app.asar`, which plain Node
 * cannot read, so the script re-executes itself once under the DSH runtime
 * (`DSH_NODE_EXECUTABLE`, which already carries `ELECTRON_RUN_AS_NODE=1` in a
 * DSH shell) when it was started by an ordinary Node.
 *
 * Read-only: it imports the installed packages in a throwaway process and
 * inspects their files; it never starts DSH, changes a profile, or launches an
 * application.
 */

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath, pathToFileURL } from 'node:url'

const SWITCH = 'ELECTRON_RUN_AS_NODE'
const self = fileURLToPath(import.meta.url)

// Desktop packages live inside app.asar: only the DSH runtime can read them.
if (process.versions.electron === undefined && process.env.DSH_NODE_EXECUTABLE !== undefined) {
  const rerun = spawnSync(process.env.DSH_NODE_EXECUTABLE, [self], {
    stdio: 'inherit',
    env: { ...process.env, [SWITCH]: '1' },
  })
  process.exit(rerun.status ?? 1)
}

const installDir = process.env.DSH_INSTALL_DIR
if (installDir === undefined || installDir === '') {
  console.error('DSH_INSTALL_DIR is not set. Run this inside a DSH shell.')
  process.exit(2)
}

/** Resolve one installed package directory from the DSH installation anchor. */
function packageDir(name) {
  const require = createRequire(join(installDir, 'package.json'))
  const searchPaths = [installDir, dirname(installDir), dirname(dirname(installDir))]
  return dirname(require.resolve(`${name}/package.json`, { paths: searchPaths }))
}

/** Read one installed package file, or null when it is absent. */
function readPackageFile(name, relative) {
  try {
    return readFileSync(join(packageDir(name), relative), 'utf8')
  } catch {
    return null
  }
}

// 1. Does the shared scrub still hand the switch to children?
process.env[SWITCH] = '1'
const subprocessEntry = join(packageDir('@deepseek-ai/dsh-subprocess'), 'lib', 'index.js')
const subprocess = await import(pathToFileURL(subprocessEntry).href)
const scrubbed = subprocess.scrubbedParentEnv()
const scrubLeaks = Object.keys(scrubbed).some((key) => key.toUpperCase() === SWITCH)

// 2. Does the open-in-app host half still launch detached through spawn?
const openInApp = readPackageFile('@deepseek-ai/dsh-host-open-in-app', join('lib', 'index.js'))
const launchDetached = openInApp !== null && /detached:\s*(?:!0|true)/.test(openInApp)
const usesSpawn = openInApp !== null && /from "node:child_process"/.test(openInApp)
const mergesScrub = openInApp !== null && /scrubbedParentEnv/.test(openInApp)

console.log(`DSH installation : ${installDir}`)
console.log(`DSH version : ${createRequire(join(installDir, 'package.json'))(join(installDir, 'package.json')).version}`)
console.log(`scrub still forwards ${SWITCH} : ${scrubLeaks ? 'YES' : 'no'}`)
console.log(`open-in-app spawns detached : ${launchDetached ? 'yes' : 'NO'}`)
console.log(`open-in-app imports child_process : ${usesSpawn ? 'yes' : 'NO'}`)
console.log(`open-in-app merges scrubbedParentEnv : ${mergesScrub ? 'yes' : 'no'}`)

if (!scrubLeaks) {
  console.log('\nVerdict: upstream no longer forwards the switch at the scrub layer.')
  console.log('This plugin is a harmless no-op now; disable or remove it.')
} else if (launchDetached && usesSpawn && mergesScrub) {
  console.log('\nVerdict: the leak and the intercepted launch shape are both still here.')
  console.log('Keep the plugin. If "Open in VS Code" stops working after an upgrade,')
  console.log('re-check the predicates in intercept.js against the installed open-in-app code.')
} else {
  console.log('\nVerdict: the launch shape changed, so the interceptor may not match any more.')
  console.log('Read the installed open-in-app host half and update intercept.js before trusting it.')
}
