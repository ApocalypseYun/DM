export function clampPosition(position, viewport, widgetSize) {
  const maxX = Math.max(0, viewport.width - widgetSize.width)
  const maxY = Math.max(0, viewport.height - widgetSize.height)

  return {
    x: Math.min(Math.max(position.x, 0), maxX),
    y: Math.min(Math.max(position.y, 0), maxY),
  }
}

export function normalizeMountOptions(options) {
  const rawMouthRig = options.mouthRig ?? {}

  return {
    container: options.container ?? null,
    serverUrl: options.serverUrl,
    avatarImage: options.avatarImage ?? '/assets/avatar/front.jpg',
    voiceProfile: options.voiceProfile ?? 'default_female_zh',
    draggable: options.draggable ?? true,
    mountMode: options.mountMode ?? 'floating',
    title: options.title ?? '数字人助手',
    mouthRig: {
      xPercent: rawMouthRig.xPercent ?? 50,
      yPercent: rawMouthRig.yPercent ?? 77.5,
      widthPercent: rawMouthRig.widthPercent ?? 12,
      heightPercent: rawMouthRig.heightPercent ?? 4.6,
    },
  }
}

export function shouldCloseVoiceSegment(lastSpeechDeltaMs, silenceWindowMs = 1400) {
  return lastSpeechDeltaMs > silenceWindowMs
}

export function shouldCommitVoiceSegment(
  durationMs,
  byteLength,
  minimumDurationMs = 600,
  minimumByteLength = 1800,
) {
  return durationMs >= minimumDurationMs && byteLength >= minimumByteLength
}
