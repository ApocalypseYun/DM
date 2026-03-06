export function clampPosition(position, viewport, widgetSize) {
  const maxX = Math.max(0, viewport.width - widgetSize.width)
  const maxY = Math.max(0, viewport.height - widgetSize.height)

  return {
    x: Math.min(Math.max(position.x, 0), maxX),
    y: Math.min(Math.max(position.y, 0), maxY),
  }
}

export function normalizeMountOptions(options) {
  const normalizedOptions = options ?? {}
  const rawMouthRig = normalizedOptions.mouthRig ?? {}
  const rawDhLive = normalizedOptions.dhLive ?? {}
  const rawThreeFullBody = normalizedOptions.threeFullBody ?? {}
  const rawLayout = normalizedOptions.layout ?? {}
  const frameMode = rawLayout.frameMode ?? 'full_body'

  const defaultsByMode = frameMode === 'full_body'
    ? {
        widgetWidth: 340,
        avatarHeight: 460,
        transcriptMinHeight: 110,
        avatarFit: 'contain',
      }
    : {
        widgetWidth: 280,
        avatarHeight: 220,
        transcriptMinHeight: 92,
        avatarFit: 'cover',
      }

  return {
    container: normalizedOptions.container ?? null,
    serverUrl: normalizedOptions.serverUrl,
    avatarImage: normalizedOptions.avatarImage ?? '/assets/avatar/front.jpg',
    avatarRenderer: normalizedOptions.avatarRenderer ?? 'three_fullbody',
    voiceProfile: normalizedOptions.voiceProfile ?? 'default_female_zh',
    draggable: normalizedOptions.draggable ?? true,
    mountMode: normalizedOptions.mountMode ?? 'floating',
    title: normalizedOptions.title ?? '数字人助手',
    layout: {
      frameMode,
      widgetWidth: rawLayout.widgetWidth ?? defaultsByMode.widgetWidth,
      avatarHeight: rawLayout.avatarHeight ?? defaultsByMode.avatarHeight,
      transcriptMinHeight: rawLayout.transcriptMinHeight ?? defaultsByMode.transcriptMinHeight,
      avatarFit: rawLayout.avatarFit ?? defaultsByMode.avatarFit,
    },
    dhLive: {
      runtimeBaseUrl: rawDhLive.runtimeBaseUrl ?? '/widget/dh-live',
      assetBaseUrl: rawDhLive.assetBaseUrl ?? '/widget/dh-live/assets/default',
      frameRate: rawDhLive.frameRate ?? 25,
    },
    threeFullBody: {
      modelUrl: rawThreeFullBody.modelUrl ?? '/widget/models/RobotExpressive.glb',
    },
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
