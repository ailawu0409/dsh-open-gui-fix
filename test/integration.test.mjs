// Run with `node test/integration.test.mjs` (or `pnpm test`). Each probe writes
// its report into a unique temporary directory that the test removes again.
import assert from 'node:assert/strict'
import childProcess, { spawn as esmSpawn } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { syncBuiltinESMExports } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { installSpawnInterceptor } from '../intercept.js'

/** The command interpreter that reports a child's environment back to disk. */
const shell = process.env.ComSpec ?? 'cmd.exe'

/** Wait for one probe to write its report; bounded so a hung child fails the test. */
async function waitForReport(path, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (existsSync(path)) {
      try {
        const text = readFileSync(path, 'utf8')
        if (text.trim() !== '') return text.trim()
      } catch {
        // Swallows a partially written report: the next poll reads it again.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  throw new Error(`probe report was not written: ${path}`)
}

/** Run one detached launch with the exact shape the open-in-app launcher uses. */
function launchDetached(command, argv, env) {
  const child = esmSpawn(command, argv, { detached: true, stdio: 'ignore', env })
  child.unref()
}

/**
 * Write a command script that reports its inherited switch to `report` in the
 * same directory. Quoting lives inside the script, so a temporary directory
 * containing spaces cannot corrupt the invocation.
 */
function writeEchoProbe(directory, report) {
  const probe = join(directory, 'echo-probe.cmd')
  writeFileSync(probe, `@echo [%ELECTRON_RUN_AS_NODE%]> "%~dp0${report}"\r\n`)
  return probe
}

test('the replacement reaches an ESM importer of node:child_process', () => {
  const original = childProcess.spawn
  const uninstall = installSpawnInterceptor({ childProcess, syncBuiltinESMExports })
  try {
    assert.equal(esmSpawn, childProcess.spawn)
    assert.notEqual(esmSpawn, original)
  } finally {
    uninstall()
  }
  assert.equal(childProcess.spawn, original)
  assert.equal(esmSpawn, original)
})

test('a detached GUI launch no longer inherits ELECTRON_RUN_AS_NODE', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-gui-fix-detached-'))
  const uninstall = installSpawnInterceptor({ childProcess, syncBuiltinESMExports })
  try {
    const report = join(directory, 'detached.txt')
    launchDetached(shell, ['/d', '/c', writeEchoProbe(directory, 'detached.txt')], {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
    })

    assert.equal(await waitForReport(report), '[]')
  } finally {
    uninstall()
    rmSync(directory, { recursive: true, force: true })
  }
})

test('a detached launch with a JavaScript entrypoint keeps ELECTRON_RUN_AS_NODE', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-gui-fix-entrypoint-'))
  const uninstall = installSpawnInterceptor({ childProcess, syncBuiltinESMExports })
  try {
    const probe = join(directory, 'probe.mjs')
    writeFileSync(
      probe,
      'import { writeFileSync } from "node:fs"\n'
      + 'writeFileSync(process.argv[2], `[${process.env.ELECTRON_RUN_AS_NODE ?? ""}]`)\n',
    )
    const report = join(directory, 'entrypoint.txt')
    launchDetached(process.execPath, [probe, report], { ...process.env, ELECTRON_RUN_AS_NODE: '1' })

    assert.equal(await waitForReport(report), '[1]')
  } finally {
    uninstall()
    rmSync(directory, { recursive: true, force: true })
  }
})

test('an ordinary child process still inherits ELECTRON_RUN_AS_NODE', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-gui-fix-attached-'))
  const uninstall = installSpawnInterceptor({ childProcess, syncBuiltinESMExports })
  try {
    const report = join(directory, 'attached.txt')
    const child = esmSpawn(shell, ['/d', '/c', writeEchoProbe(directory, 'attached.txt')], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: 'ignore',
    })
    await new Promise((resolve, reject) => {
      child.once('exit', resolve)
      child.once('error', reject)
    })

    assert.equal(await waitForReport(report), '[1]')
  } finally {
    uninstall()
    rmSync(directory, { recursive: true, force: true })
  }
})
