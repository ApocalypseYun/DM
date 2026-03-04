import test from 'node:test'
import assert from 'node:assert/strict'

import {
  clampPosition,
  normalizeMountOptions,
  shouldCloseVoiceSegment,
  shouldCommitVoiceSegment,
} from '../src/helpers.js'

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

test('shouldCloseVoiceSegment waits for a longer silence window', () => {
  assert.equal(shouldCloseVoiceSegment(900), false)
  assert.equal(shouldCloseVoiceSegment(1500), true)
})

test('shouldCommitVoiceSegment rejects short noise bursts', () => {
  assert.equal(shouldCommitVoiceSegment(320, 900), false)
  assert.equal(shouldCommitVoiceSegment(900, 3200), true)
})
