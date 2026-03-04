# DM Widget

Embeddable browser widget for the realtime digital-human experience.

## Current Contract

```js
window.DigitalHumanWidget.mount({
  serverUrl: 'https://your-host.example',
  avatarImage: '/assets/avatar/front.jpg',
  voiceProfile: 'default_female_zh',
  draggable: true,
})
```

## Behavior

- opens a realtime WebSocket session
- streams microphone audio in chunks
- emits barge-in when the user starts speaking
- renders a draggable floating avatar
- plays returned TTS audio and updates avatar states
