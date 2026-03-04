import test from 'node:test'
import assert from 'node:assert/strict'

import { clampPosition, normalizeMountOptions } from '../src/helpers.js'

test('clampPosition keeps the widget inside the viewport', () => {
  const result = clampPosition(
    { x: -10, y: 9999 },
    { width: 300, height: 600 },
    { width: 120, height: 140 },
  )

  assert.deepEqual(result, { x: 0, y: 460 })
})

test('normalizeMountOptions fills defaults', () => {
  const options = normalizeMountOptions({
    serverUrl: 'https://example.com',
  })

  assert.equal(options.voiceProfile, 'default_female_zh')
  assert.equal(options.draggable, true)
  assert.equal(options.mountMode, 'floating')
})
