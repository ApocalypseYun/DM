# DM Widget

Embeddable browser widget for the realtime digital-human experience.

## Current Contract

```js
window.DigitalHumanWidget.mount({
  serverUrl: 'https://your-host.example',
  avatarRenderer: 'dh_live',
  avatarImage: '/assets/avatar/front.jpg',
  voiceProfile: 'default_female_zh',
  draggable: true,
  dhLive: {
    runtimeBaseUrl: '/widget/dh-live',
    assetBaseUrl: '/widget/dh-live/assets/default',
    frameRate: 25,
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
- renders a draggable floating avatar (`dh_live` renderer with image fallback)
- plays returned TTS audio and updates avatar states
