# DM Widget

Embeddable browser widget for the realtime digital-human experience.

## Current Contract

```js
window.DigitalHumanWidget.mount({
  serverUrl: 'https://your-host.example',
  avatarRenderer: 'three_fullbody',
  avatarImage: '/assets/avatar/front.jpg',
  voiceProfile: 'default_female_zh',
  draggable: true,
  threeFullBody: {
    modelUrl: '/widget/models/RobotExpressive.glb',
  },
  dhLive: {
    runtimeBaseUrl: '/widget/dh-live',
    assetBaseUrl: '/widget/dh-live/assets/default',
    frameRate: 25,
  },
  layout: {
    frameMode: 'full_body',
    widgetWidth: 340,
    avatarHeight: 460,
    avatarFit: 'contain',
  },
  mouthRig: {
    xPercent: 50,
    yPercent: 77.5,
    widthPercent: 12,
    heightPercent: 4.6,
  },
})
```

## Behavior

- opens a realtime WebSocket session
- streams microphone audio in chunks
- emits barge-in when the user starts speaking
- renders a draggable floating avatar (`three_fullbody` -> `dh_live` -> image fallback chain)
- plays returned TTS audio and updates avatar states
