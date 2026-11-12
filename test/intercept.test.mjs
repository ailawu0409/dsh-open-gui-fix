import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { installSpawnInterceptor, keepsRunAsNode, stripRunAsNode } from '../intercept.js'

const noSync = () => {}

/** A stand-in child_process module that records the calls it receives. */
function stubChildProcess() {
  const calls = []
  const spawn = (...args) => {
    calls.push(args)
    return 'sentinel'
  }
  return { childProcess: { spawn }, calls, spawn }
}

test('stripRunAsNode removes the switch from a copy and leaves the input alone', () => {
  const env = { PATH: 'C:\\Windows', ELECTRON_RUN_AS_NODE: '1' }
  const stripped = stripRunAsNode(env)

  assert.notEqual(stripped, env)
  assert.deepEqual(stripped, { PATH: 'C:\\Windows' })
  assert.deepEqual(env, { PATH: 'C:\\Windows', ELECTRON_RUN_AS_NODE: '1' })
})

test('stripRunAsNode matches the name case-insensitively', () => {
  const env = { PATH: 'x', electron_run_as_node: '1', Electron_Run_As_Node: '0' }
  assert.deepEqual(stripRunAsNode(env), { PATH: 'x' })
})

test('stripRunAsNode returns the same object when nothing has to change', () => {
  const env = { PATH: 'x' }
  assert.equal(stripRunAsNode(env), env)
  assert.equal(stripRunAsNode(undefined), undefined)
})

test('keepsRunAsNode recognizes the Node-interpreter shapes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-gui-fix-unit-'))
  try {
    const script = join(directory, 'entry.js')
    writeFileSync(script, '')
    const module = join(directory, 'entry.mjs')
    writeFileSync(module, '')

    assert.equal(keepsRunAsNode([script]), true)
    assert.equal(keepsRunAsNode([module]), true)
    // A script keeps the switch even behind other Node flags.
    assert.equal(keepsRunAsNode(['--no-warnings', script]), true)
    // Interpreter modes that never name a script.
    assert.equal(keepsRunAsNode(['-e', 'console.log(1)']), true)
    assert.equal(keepsRunAsNode(['--eval', 'console.log(1)']), true)
    assert.equal(keepsRunAsNode(['--inspect-brk']), true)
    // An application's own leading flag is argv, not a Node switch.
    assert.equal(keepsRunAsNode(['-d']), false)
    assert.equal(keepsRunAsNode(['--cd=C:\\Projects\\demo']), false)
    assert.equal(keepsRunAsNode([join(directory, 'missing.js')]), false)
    assert.equal(keepsRunAsNode([directory]), false)
    assert.equal(keepsRunAsNode(['C:\\Projects\\notes.txt']), false)
    assert.equal(keepsRunAsNode([]), false)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('a detached GUI launch gets a stripped environment copy', () => {
  const { childProcess, calls } = stubChildProcess()
  const install = installSpawnInterceptor({ childProcess, syncBuiltinESMExports: noSync })
  try {
    const env = { PATH: 'x', ELECTRON_RUN_AS_NODE: '1' }
    childProcess.spawn('Code.exe', ['D:\\Projects\\demo'], { detached: true, stdio: 'ignore', env })

    assert.equal(calls.length, 1)
    const [command, argv, options] = calls[0]
    assert.equal(command, 'Code.exe')
    assert.deepEqual(argv, ['D:\\Projects\\demo'])
    assert.equal(options.detached, true)
    assert.equal(options.stdio, 'ignore')
    assert.deepEqual(options.env, { PATH: 'x' })
    assert.deepEqual(env, { PATH: 'x', ELECTRON_RUN_AS_NODE: '1' })
  } finally {
    install()
  }
})

test('a two-argument detached launch keeps its call shape', () => {
  const { childProcess, calls } = stubChildProcess()
  const install = installSpawnInterceptor({ childProcess, syncBuiltinESMExports: noSync })
  try {
    childProcess.spawn('Code.exe', { detached: true, env: { ELECTRON_RUN_AS_NODE: '1', PATH: 'x' } })

    assert.equal(calls.length, 1)
    assert.equal(calls[0].length, 2)
    assert.deepEqual(calls[0][1].env, { PATH: 'x' })
  } finally {
    install()
  }
})

test('every other spawn shape keeps the exact arguments it passed', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dsh-gui-fix-shapes-'))
  const { childProcess, calls } = stubChildProcess()
  const install = installSpawnInterceptor({ childProcess, syncBuiltinESMExports: noSync })
  try {
    const attached = { env: { ELECTRON_RUN_AS_NODE: '1' } }
    childProcess.spawn('pwsh.exe', ['-Command', 'ls'], attached)
    assert.equal(calls[0][2], attached)

    const detachedWithoutSwitch = { detached: true, env: { PATH: 'x' } }
    childProcess.spawn('pwsh.exe', [], detachedWithoutSwitch)
    assert.equal(calls[1][2], detachedWithoutSwitch)

    // GitHub Desktop's packaged CLI: the resolved script exists on disk, so the
    // launch really is a Node interpreter run and must keep the switch.
    const cli = join(directory, 'cli.js')
    writeFileSync(cli, '')
    const detachedScript = { detached: true, env: { ELECTRON_RUN_AS_NODE: '1' } }
    childProcess.spawn('GitHubDesktop.exe', [cli, 'open'], detachedScript)
    assert.equal(calls[2][2], detachedScript)
    assert.equal(calls[2][2].env.ELECTRON_RUN_AS_NODE, '1')
  } finally {
    install()
    rmSync(directory, { recursive: true, force: true })
  }
})

test('an interceptor failure falls through to the original call', () => {
  const { childProcess, calls } = stubChildProcess()
  const install = installSpawnInterceptor({ childProcess, syncBuiltinESMExports: noSync })
  try {
    const options = {
      detached: true,
      get env() {
        throw new Error('boom')
      },
    }
    assert.equal(childProcess.spawn('Code.exe', [], options), 'sentinel')
    assert.equal(calls[0][2], options)
  } finally {
    install()
  }
})

test('installation is idempotent and disposal restores the original export', () => {
  const { childProcess, spawn } = stubChildProcess()
  const first = installSpawnInterceptor({ childProcess, syncBuiltinESMExports: noSync })
  const interceptor = childProcess.spawn
  assert.notEqual(interceptor, spawn)

  const second = installSpawnInterceptor({ childProcess, syncBuiltinESMExports: noSync })
  assert.equal(childProcess.spawn, interceptor)
  second()

  first()
  assert.equal(childProcess.spawn, spawn)
})
