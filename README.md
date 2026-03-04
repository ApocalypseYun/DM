# DM Realtime Digital Human

This repository is being rebuilt into a full-duplex digital-human system focused on:

- realtime speech input
- local ASR via Xinference
- local conversation orchestration via Dify
- locally deployed TTS
- a draggable embeddable browser widget

The current active codebase is organized around a clean application layout instead of the earlier migrated legacy snapshot.

## Active Structure

```text
DM/
├── apps/
│   ├── realtime-api/   # WebSocket session orchestration
│   └── local-tts/      # Local speech synthesis service
├── packages/
│   └── widget/         # Embeddable draggable avatar widget
├── assets/
│   └── avatar/         # Front-facing digital human assets
├── docs/
│   └── plans/          # Design and implementation plans
└── docker-compose.yml  # Local orchestration for new services
```

## External Dependencies

These are expected to exist outside this repository and are not managed by the root compose file:

- `Xinference`
- `Dify`

## Current Direction

The first implementation slice establishes:

- repository scaffolding
- the new service boundaries
- testable backend contracts
- the widget entrypoint contract

The legacy migrated snapshot is intentionally not the active runtime path for this rebuild.

## Services

### `apps/realtime-api`

- FastAPI WebSocket service
- manages session state, interruption, ASR/Dify/TTS orchestration
- expected public port: `8090`

### `apps/local-tts`

- FastAPI local TTS wrapper
- defaults to a mock offline synthesizer for development
- supports `piper` as a local deployment target through environment variables
- expected public port: `8091`

### `packages/widget`

- plain browser-side embeddable widget
- attaches `window.DigitalHumanWidget.mount(...)`
- supports draggable floating mode, microphone capture, interruption, and audio playback

## Realtime Protocol (Current MVP)

The browser widget uses:

- `barge_in` to interrupt any in-flight assistant response
- `audio_commit` to submit one VAD-delimited utterance as a single encoded blob
- `set_voice_profile` to switch the active voice for subsequent turns

The backend returns:

- `asr_final`
- `assistant_text_final`
- `tts_audio_chunk`
- `avatar_state`
- `interrupt_ack`

This keeps the first working version compatible with browser `MediaRecorder` output instead of assuming raw WAV input.

## Environment

For deployment with the root `docker-compose.yml`, copy the root template:

```bash
cp .env.example .env
```

### Realtime API

See [apps/realtime-api/.env.example](/Users/liuguanzhong/Code/D-M/DM/.worktrees/realtime-refactor/apps/realtime-api/.env.example).

Key values:

- `XINFERENCE_BASE_URL`
- `DIFY_CHAT_URL`
- `DIFY_API_KEY`
- `LOCAL_TTS_BASE_URL`

### Local TTS

See [apps/local-tts/.env.example](/Users/liuguanzhong/Code/D-M/DM/.worktrees/realtime-refactor/apps/local-tts/.env.example).

Key values:

- `TTS_PROVIDER=mock|piper`
- `PIPER_BIN`
- `PIPER_MODEL_PATH`
- `PIPER_CONFIG_PATH`

To prepare the recommended local Chinese female voice, use:

```bash
cd /Users/liuguanzhong/Code/D-M/DM/.worktrees/realtime-refactor
sh apps/local-tts/scripts/fetch_piper_voice.sh ./data/piper
sh apps/local-tts/scripts/fetch_piper_runtime.sh ./apps/local-tts/vendor
```

## Local Development

### Backend

Run the new services:

```bash
cd /Users/liuguanzhong/Code/D-M/DM/.worktrees/realtime-refactor
docker compose up --build
```

This compose file only starts:

- `realtime-api`
- `local-tts`

It does not start `Xinference` or `Dify`; those are expected to already be available on the server or your target runtime.

For real speech output on the target server, set:

```bash
export TTS_PROVIDER=piper
```

### Widget

Run the lightweight local checks:

```bash
cd /Users/liuguanzhong/Code/D-M/DM/.worktrees/realtime-refactor/packages/widget
node --test tests/*.test.mjs
node scripts/build.mjs
```

## Embed Example

After serving the widget assets, mount it from any page:

```html
<script type="module">
  import '/widget/index.js'

  window.DigitalHumanWidget.mount({
    serverUrl: 'http://127.0.0.1:8090',
    avatarImage: '/assets/avatar/front.jpg',
    voiceProfile: 'default_female_zh',
    draggable: true,
  })
</script>
```

## Key Documents

- [Realtime design](/Users/liuguanzhong/Code/D-M/DM/.worktrees/realtime-refactor/docs/plans/2026-03-05-realtime-digital-human-design.md)
- [Implementation plan](/Users/liuguanzhong/Code/D-M/DM/.worktrees/realtime-refactor/docs/plans/2026-03-05-realtime-digital-human-implementation.md)
