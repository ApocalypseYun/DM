# Realtime Digital Human Design

**Date:** 2026-03-05

## Goal

Rebuild the project into a full-duplex, low-latency, embeddable digital-human system that uses:

- local `Xinference` for ASR
- local `Dify` for conversation orchestration
- a separately deployed local TTS service
- a browser-side draggable avatar widget driven from a single front-facing image

The first version must support direct speech input, interruption during assistant playback, assistant speech output, avatar animation while speaking, and easy website embedding.

## Constraints

- Existing migrated legacy code is not the target architecture.
- The user wants a complete refactor, not a patch on top of the old single-file service.
- The system must support full duplex interaction (user can interrupt the assistant while it is speaking).
- The system must use locally deployed services for ASR, Dify, and TTS.
- The current server has one NVIDIA A10 with about 5 GB free VRAM at the time of inspection, so new GPU-heavy components must be lightweight.
- The currently available avatar asset for the primary interaction flow is `/Users/liuguanzhong/Code/D-M/数字人素材/定稿-数字人说明/正面图.jpg`.
- The existing 360-degree showcase video is not appropriate as the real-time speaking surface.

## Current Server Baseline

### Available Services

- `Xinference` is running and reachable on `http://127.0.0.1:9997`
- `Dify` is running behind the existing Docker setup and reachable via the local gateway on port `88`

### Active Xinference Models

- `qwen3` (LLM, 8B GPTQ Int4)
- `bge-large-zh-v1.5` (embedding)
- `paraformer-zh` (audio ASR)

### Key Implication

The server already provides the speech-to-text and text-reasoning foundations, but it does not currently provide local TTS. TTS must therefore be added as an independent service and kept lightweight enough to fit the remaining resource budget.

## Recommended Product Shape

The first release should be a real-time avatar widget, not a server-side video rendering system.

### Why

- Server-side generation of full MP4 responses is too slow for full duplex.
- Browser-driven animation allows interruption, lower latency, and simpler embedding.
- A single avatar image is enough for a strong first version if the speaking animation is event-driven.
- This design keeps the conversation path stable even if avatar rendering changes later.

## System Architecture

### 1. Realtime API

A new backend service handles:

- browser WebSocket connections
- session state
- VAD / interruption control
- forwarding audio to ASR
- sending stabilized text to Dify
- requesting audio from local TTS
- converting TTS output into avatar-control events

This service becomes the main system entrypoint.

### 2. Local TTS Service

A standalone local TTS service provides:

- one default general-purpose Chinese female voice in V1
- a stable HTTP or WebSocket API for text-to-audio
- a `voice_profile` abstraction so cloned voices can be added later without changing the main protocol

The TTS service must be deployable independently from the Realtime API.

### 3. Widget Frontend

A browser widget provides:

- draggable floating avatar
- microphone controls
- subtitle display
- idle, listening, thinking, speaking states
- lip movement driven by audio energy / phoneme approximations
- interrupt-on-user-speech behavior

The widget should be embeddable on arbitrary websites through a small client API.

## Interaction Flow

### Upstream (User -> Backend)

1. The user opens the widget.
2. The widget establishes a WebSocket session with the Realtime API.
3. The browser streams microphone audio chunks continuously.
4. The Realtime API forwards audio to `Xinference paraformer-zh`.
5. Partial and final ASR text events are produced.

### Midstream (Conversation)

1. Once a final utterance segment is stable, the Realtime API forwards text to Dify.
2. Dify returns the assistant response.
3. The Realtime API streams assistant text back to the widget as display events.

### Downstream (Assistant -> User)

1. The Realtime API sends the assistant text to the local TTS service.
2. The TTS service returns playable audio chunks.
3. The Realtime API relays TTS audio to the widget.
4. The widget plays audio while animating the avatar in real time.

## Full-Duplex / Interruption Rules

Full duplex is a core requirement. The system must support barge-in.

### Required Behavior

- If the user starts speaking while the assistant is speaking, the widget immediately emits a `barge_in` event.
- The Realtime API cancels the active response pipeline for the current assistant turn.
- Any delayed TTS chunks for the canceled turn are discarded.
- The widget stops playback and switches back to listening mode without reconnecting.

### Result

The system remains conversational and responsive instead of serializing into push-to-talk playback.

## Voice Profile Model

The architecture must not hardcode a single voice.

### V1

- one built-in voice profile: `default_female_zh`

### V2+

- add cloned voices by registering more `voice_profile_id` values
- page-level default voice selection
- runtime voice switching between turns

This keeps the product flexible while avoiding unnecessary complexity in the first implementation.

## Embed Model

The frontend should be consumable as a reusable widget package.

### Example Mount Contract

```js
window.DigitalHumanWidget.mount({
  container: document.getElementById('assistant-root'),
  serverUrl: 'https://your-domain.example',
  avatarImage: '/assets/avatar/front.jpg',
  voiceProfile: 'default_female_zh',
  draggable: true,
})
```

### Expected Widget Features

- draggable and dockable
- can be mounted inline or floating
- preserves position locally
- supports future theming / branding without backend changes

## Deployment Shape

### Existing Services Kept As-Is

- `Xinference`
- `Dify`

### New Services To Build

- `apps/realtime-api`
- `apps/local-tts`
- `packages/widget`

### Suggested Runtime

- `realtime-api`: Docker container
- `local-tts`: Docker container or dedicated process container
- `widget`: built static files served from Nginx / existing website host

This isolates new work from the current model infrastructure.

## Repository Cleanup Strategy

Before implementation, remove or quarantine files that no longer belong to the new architecture.

### Primary Cleanup Goal

Stop treating the imported legacy snapshot as the product root.

### Recommended Handling

- remove obsolete top-level scaffolding that only existed for the migration exercise
- archive or remove legacy paths that are not in the first implementation path
- keep only assets and references that directly support the new architecture

If `LivePortrait` and `Wav2Lip` are not part of the V1 runtime path, they should not remain in the main active source tree. If the user wants them preserved, move them into a clearly marked `archive/legacy/` area.

## Proposed Repository Shape

```text
DM/
├── apps/
│   ├── realtime-api/
│   └── local-tts/
├── packages/
│   └── widget/
├── assets/
│   └── avatar/
├── docs/
│   └── plans/
└── docker-compose.yml
```

## Risks

### 1. TTS Choice Risk

The exact local TTS engine must be selected to fit the current server resource envelope. A model that is too heavy will compete with the already-loaded LLM and ASR services.

### 2. Browser Audio UX

Full duplex requires careful handling of:

- echo cancellation
- VAD thresholds
- playback interruption
- reconnection behavior

This must be designed deliberately, not treated as a simple WebSocket stream.

### 3. Legacy Drift

If legacy code remains in place while new code is added beside it, the repo will become ambiguous and harder to maintain. Cleanup needs to be explicit and early.

## V1 Success Criteria

The first version is successful if:

- a user can open the widget on a normal web page
- the widget can be dragged and positioned freely
- the user can speak directly into the widget
- speech is transcribed locally via `Xinference`
- text is sent to Dify and a response is returned
- the response is synthesized by the local TTS service
- the widget plays assistant audio while animating the avatar
- the user can interrupt assistant playback with a new utterance
- voice selection is modeled as a configurable `voice_profile`

## Out of Scope For V1

- server-side generation of a full speaking MP4 for every turn
- heavy photo-real video synthesis in the critical full-duplex path
- voice cloning as a mandatory first-release requirement
- multi-avatar authoring tools
- admin dashboards

## Next Step

Create a detailed implementation plan that starts with repository cleanup, then builds:

1. the new Realtime API
2. the local TTS service
3. the embeddable widget
4. the integration and deployment wiring
