import assert from 'node:assert/strict'
import childProcess from 'node:child_process'
import { test } from 'node:test'
import { apply, name } from '../index.js'

test('the plugin exports its name and installs the interceptor through ctx.effect', () => {
  assert.equal(name, 'gui-launch-env-fix')

  const effects = []
  const ctx = {
    effect(callback, label) {
      effects.push({ callback, label })
    },
  }
  const original = childProcess.spawn
  apply(ctx)

  assert.equal(effects.length, 1)
  assert.equal(typeof effects[0].callback, 'function')
  assert.equal(typeof effects[0].label, 'string')
  assert.notEqual(effects[0].label, '')

  const dispose = effects[0].callback()
  try {
    assert.equal(typeof dispose, 'function')
    assert.notEqual(childProcess.spawn, original)
  } finally {
    dispose()
  }
  assert.equal(childProcess.spawn, original)
})
