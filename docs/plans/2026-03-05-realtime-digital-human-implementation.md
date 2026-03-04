# Realtime Digital Human Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Rebuild the repository into a full-duplex, embeddable digital-human system with a new realtime API, a local TTS service, and a draggable browser widget.

**Architecture:** The implementation replaces the current legacy-first structure with a clean application layout centered on `apps/realtime-api`, `apps/local-tts`, and `packages/widget`. Existing `Xinference` and `Dify` remain external dependencies, while the new codebase focuses on realtime session orchestration, local speech synthesis, and a browser-side avatar widget driven from a single front-facing image.

**Tech Stack:** FastAPI, Python, WebSocket, Docker, TypeScript, browser Web Audio APIs, static widget bundle

---

### Task 1: Clean the repository and preserve only necessary references

**Files:**
- Modify: `/Users/liuguanzhong/Code/D-M/DM/README.md`
- Create: `/Users/liuguanzhong/Code/D-M/DM/archive/legacy/`
- Move or Delete: legacy top-level directories that do not belong to the new V1 runtime path

**Step 1: Inventory the current top-level tree**

Run: `find /Users/liuguanzhong/Code/D-M/DM -maxdepth 2 -mindepth 1 | sort`
Expected: Clear list of files and directories that need to stay, move, or be removed.

**Step 2: Move legacy code out of the active product path**

Move legacy items into `archive/legacy/` unless they are still needed as implementation references:

- `/Users/liuguanzhong/Code/D-M/DM/digital_human`
- `/Users/liuguanzhong/Code/D-M/DM/LivePortrait`
- `/Users/liuguanzhong/Code/D-M/DM/Wav2Lip`
- temporary planning files that are not part of the shipping product

Expected: The active repository root stops looking like a migrated server dump.

**Step 3: Keep only reusable assets and planning docs**

Retain:

- `docs/plans/`
- avatar assets copied into a dedicated `assets/avatar/` path
- any documentation needed for implementation

**Step 4: Verify the cleanup result**

Run: `find /Users/liuguanzhong/Code/D-M/DM -maxdepth 2 -mindepth 1 | sort`
Expected: Clean root layout with room for the new architecture.

### Task 2: Create the new repository structure

**Files:**
- Create: `/Users/liuguanzhong/Code/D-M/DM/apps/realtime-api/`
- Create: `/Users/liuguanzhong/Code/D-M/DM/apps/local-tts/`
- Create: `/Users/liuguanzhong/Code/D-M/DM/packages/widget/`
- Create: `/Users/liuguanzhong/Code/D-M/DM/assets/avatar/`
- Create: `/Users/liuguanzhong/Code/D-M/DM/docker-compose.yml`

**Step 1: Create the application directories**

Create:

- `apps/realtime-api`
- `apps/local-tts`
- `packages/widget`
- `assets/avatar`

**Step 2: Copy the front-facing avatar image into the new asset path**

Source:
- `/Users/liuguanzhong/Code/D-M/数字人素材/定稿-数字人说明/正面图.jpg`

Destination:
- `/Users/liuguanzhong/Code/D-M/DM/assets/avatar/front.jpg`

Expected: The widget has a stable local avatar asset path under version control.

**Step 3: Add root-level compose orchestration**

Create `docker-compose.yml` for the new services only:

- `realtime-api`
- `local-tts`

Expected: New app services are isolated from the existing Xinference and Dify deployment.

### Task 3: Build the realtime API skeleton

**Files:**
- Create: `/Users/liuguanzhong/Code/D-M/DM/apps/realtime-api/app/main.py`
- Create: `/Users/liuguanzhong/Code/D-M/DM/apps/realtime-api/app/config.py`
- Create: `/Users/liuguanzhong/Code/D-M/DM/apps/realtime-api/app/session.py`
- Create: `/Users/liuguanzhong/Code/D-M/DM/apps/realtime-api/app/asr_client.py`
- Create: `/Users/liuguanzhong/Code/D-M/DM/apps/realtime-api/app/dify_client.py`
- Create: `/Users/liuguanzhong/Code/D-M/DM/apps/realtime-api/app/tts_client.py`
- Create: `/Users/liuguanzhong/Code/D-M/DM/apps/realtime-api/app/models.py`
- Create: `/Users/liuguanzhong/Code/D-M/DM/apps/realtime-api/requirements.txt`

**Step 1: Write the failing connectivity tests**

Create tests for:

- WebSocket session accepts a connection
- `barge_in` cancels active response state
- outbound event types are validated

Suggested files:
- `/Users/liuguanzhong/Code/D-M/DM/apps/realtime-api/tests/test_session.py`

**Step 2: Run the tests to confirm they fail**

Run: `pytest /Users/liuguanzhong/Code/D-M/DM/apps/realtime-api/tests/test_session.py -v`
Expected: FAIL because the service modules do not exist yet.

**Step 3: Implement the minimal API skeleton**

Implement:

- FastAPI app bootstrap
- `/health`
- `/ws/realtime`
- in-memory per-connection session state
- typed event envelopes for:
  - `audio_chunk`
  - `barge_in`
  - `asr_partial`
  - `asr_final`
  - `assistant_text_chunk`
  - `assistant_text_final`
  - `tts_audio_chunk`
  - `avatar_state`
  - `interrupt_ack`

**Step 4: Run tests again**

Run: `pytest /Users/liuguanzhong/Code/D-M/DM/apps/realtime-api/tests/test_session.py -v`
Expected: PASS for the initial skeleton behavior.

### Task 4: Integrate ASR and Dify adapters

**Files:**
- Modify: `/Users/liuguanzhong/Code/D-M/DM/apps/realtime-api/app/asr_client.py`
- Modify: `/Users/liuguanzhong/Code/D-M/DM/apps/realtime-api/app/dify_client.py`
- Modify: `/Users/liuguanzhong/Code/D-M/DM/apps/realtime-api/app/session.py`
- Create: `/Users/liuguanzhong/Code/D-M/DM/apps/realtime-api/tests/test_pipeline.py`

**Step 1: Write failing tests for adapter orchestration**

Cover:

- ASR partial/final event handling
- stable final text forwarding into Dify
- Dify response creating assistant text events

**Step 2: Run tests to confirm failure**

Run: `pytest /Users/liuguanzhong/Code/D-M/DM/apps/realtime-api/tests/test_pipeline.py -v`
Expected: FAIL because the adapter flow is not wired yet.

**Step 3: Implement adapter clients**

Implement:

- `asr_client.py` for the existing `Xinference` audio transcription endpoint
- `dify_client.py` for the local Dify API endpoint and key-based authentication
- session logic that accumulates finalized utterances and invokes Dify turn processing

**Step 4: Run the adapter tests**

Run: `pytest /Users/liuguanzhong/Code/D-M/DM/apps/realtime-api/tests/test_pipeline.py -v`
Expected: PASS with mocked upstream services.

### Task 5: Build the local TTS service

**Files:**
- Create: `/Users/liuguanzhong/Code/D-M/DM/apps/local-tts/app/main.py`
- Create: `/Users/liuguanzhong/Code/D-M/DM/apps/local-tts/app/config.py`
- Create: `/Users/liuguanzhong/Code/D-M/DM/apps/local-tts/app/voices.py`
- Create: `/Users/liuguanzhong/Code/D-M/DM/apps/local-tts/requirements.txt`
- Create: `/Users/liuguanzhong/Code/D-M/DM/apps/local-tts/tests/test_tts_api.py`

**Step 1: Write failing tests for the TTS API**

Cover:

- synthesize request accepts text
- `voice_profile_id` defaults to `default_female_zh`
- unsupported voice profile returns a clear error

**Step 2: Run tests to confirm failure**

Run: `pytest /Users/liuguanzhong/Code/D-M/DM/apps/local-tts/tests/test_tts_api.py -v`
Expected: FAIL because the service does not exist yet.

**Step 3: Implement the minimal TTS service**

Implement:

- local FastAPI app
- `POST /tts/synthesize`
- one default voice profile: `default_female_zh`
- response format that the Realtime API can consume consistently

The implementation should keep the synthesis backend abstracted so a cloned voice can be plugged in later without changing the request contract.

**Step 4: Run tests**

Run: `pytest /Users/liuguanzhong/Code/D-M/DM/apps/local-tts/tests/test_tts_api.py -v`
Expected: PASS for the basic service contract.

### Task 6: Wire TTS into the realtime pipeline and implement interruption

**Files:**
- Modify: `/Users/liuguanzhong/Code/D-M/DM/apps/realtime-api/app/tts_client.py`
- Modify: `/Users/liuguanzhong/Code/D-M/DM/apps/realtime-api/app/session.py`
- Create: `/Users/liuguanzhong/Code/D-M/DM/apps/realtime-api/tests/test_barge_in.py`

**Step 1: Write failing interruption tests**

Cover:

- active assistant playback is canceled on `barge_in`
- canceled turns stop emitting `tts_audio_chunk`
- `interrupt_ack` is sent

**Step 2: Run tests to confirm failure**

Run: `pytest /Users/liuguanzhong/Code/D-M/DM/apps/realtime-api/tests/test_barge_in.py -v`
Expected: FAIL until the cancellation logic is implemented.

**Step 3: Implement cancellation-aware TTS streaming**

Implement:

- turn-scoped response IDs
- cancellation tokens / task cancellation
- discard late chunks from canceled turns
- `interrupt_ack` event emission

**Step 4: Run tests**

Run: `pytest /Users/liuguanzhong/Code/D-M/DM/apps/realtime-api/tests/test_barge_in.py -v`
Expected: PASS.

### Task 7: Build the embeddable widget package

**Files:**
- Create: `/Users/liuguanzhong/Code/D-M/DM/packages/widget/src/index.ts`
- Create: `/Users/liuguanzhong/Code/D-M/DM/packages/widget/src/widget.ts`
- Create: `/Users/liuguanzhong/Code/D-M/DM/packages/widget/src/audio.ts`
- Create: `/Users/liuguanzhong/Code/D-M/DM/packages/widget/src/avatar.ts`
- Create: `/Users/liuguanzhong/Code/D-M/DM/packages/widget/src/styles.css`
- Create: `/Users/liuguanzhong/Code/D-M/DM/packages/widget/package.json`
- Create: `/Users/liuguanzhong/Code/D-M/DM/packages/widget/tests/`

**Step 1: Write failing widget behavior tests**

Cover:

- widget mounts into a DOM container
- widget is draggable
- widget opens a WebSocket session
- widget switches visual states (`idle`, `listening`, `thinking`, `speaking`)

**Step 2: Run tests to confirm failure**

Run: `npm test --prefix /Users/liuguanzhong/Code/D-M/DM/packages/widget`
Expected: FAIL until the widget exists.

**Step 3: Implement the widget**

Implement:

- `window.DigitalHumanWidget.mount(...)`
- draggable positioning
- avatar rendering using `/Users/liuguanzhong/Code/D-M/DM/assets/avatar/front.jpg`
- mic capture
- audio playback queue
- subtitle rendering
- avatar speaking animation driven by received audio energy or derived envelope data

**Step 4: Run tests**

Run: `npm test --prefix /Users/liuguanzhong/Code/D-M/DM/packages/widget`
Expected: PASS for the initial widget behaviors.

### Task 8: Add integration wiring and local developer docs

**Files:**
- Modify: `/Users/liuguanzhong/Code/D-M/DM/README.md`
- Create: `/Users/liuguanzhong/Code/D-M/DM/apps/realtime-api/.env.example`
- Create: `/Users/liuguanzhong/Code/D-M/DM/apps/local-tts/.env.example`
- Create: `/Users/liuguanzhong/Code/D-M/DM/packages/widget/README.md`
- Modify: `/Users/liuguanzhong/Code/D-M/DM/docker-compose.yml`

**Step 1: Document all runtime dependencies**

Document:

- `XINFERENCE_BASE_URL`
- `DIFY_BASE_URL`
- `DIFY_API_KEY`
- `LOCAL_TTS_BASE_URL`
- widget embed API

**Step 2: Add a local integration startup path**

Define how to:

- start `local-tts`
- start `realtime-api`
- build and serve the widget
- connect these to the already-running server-side `Xinference` and `Dify`

**Step 3: Verify docs are accurate**

Run: `sed -n '1,260p' /Users/liuguanzhong/Code/D-M/DM/README.md`
Expected: The README reflects the new architecture, not the legacy migrated snapshot.

### Task 9: Run final verification

**Files:**
- Read: all new app and package files

**Step 1: Run backend tests**

Run:

- `pytest /Users/liuguanzhong/Code/D-M/DM/apps/realtime-api/tests -v`
- `pytest /Users/liuguanzhong/Code/D-M/DM/apps/local-tts/tests -v`

Expected: PASS.

**Step 2: Run widget tests/build**

Run:

- `npm test --prefix /Users/liuguanzhong/Code/D-M/DM/packages/widget`
- `npm run build --prefix /Users/liuguanzhong/Code/D-M/DM/packages/widget`

Expected: PASS and a production bundle is generated.

**Step 3: Perform a local smoke check**

Verify:

- the widget mounts
- WebSocket connects
- assistant state transitions work
- interruption works

**Step 4: Review final git status**

Run: `git -C /Users/liuguanzhong/Code/D-M/DM status --short`
Expected: Only intended cleanup, new files, and documentation changes are present.
