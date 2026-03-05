import { AudioRuntime } from './audio.js'
import { AvatarView } from './avatar.js'
import { clampPosition, normalizeMountOptions } from './helpers.js'

function ensureStyles() {
  const existing = document.getElementById('dh-widget-styles')
  if (existing) {
    return
  }

  const link = document.createElement('link')
  link.id = 'dh-widget-styles'
  link.rel = 'stylesheet'
  link.href = new URL('./styles.css', import.meta.url).toString()
  document.head.appendChild(link)
}

export class DigitalHumanWidget {
  constructor(rawOptions) {
    this.options = normalizeMountOptions(rawOptions)
    this.position = { x: 24, y: 24 }
    this.dragOffset = { x: 0, y: 0 }
    this.dragging = false
    this.listening = false
    this.playbackActive = false
    this.pendingIdleAfterPlayback = false

    ensureStyles()

    this.mountRoot = this.options.container ?? document.body
    this.root = document.createElement('div')
    this.mountRoot.appendChild(this.root)

    this.view = new AvatarView(this.root, this.options)
    this.audio = new AudioRuntime(this.options.serverUrl, {
      onEvent: (payload) => this.handleServerEvent(payload),
      onPlaybackLevel: (level) => this.view.setMouthLevel(level),
      onPlaybackStateChange: (active) => this._handlePlaybackState(active),
    })

    this._applyPosition()
    this._bindDrag()
    this.view.toggleButton.addEventListener('click', () => this.toggleListening())
  }

  async toggleListening() {
    const nextListening = !this.listening
    this.listening = nextListening
    this.view.setListeningActive(this.listening)
    this.view.setState(this.listening ? 'listening' : 'idle')

    try {
      if (this.listening) {
        await this.audio.startStreaming(this.options.voiceProfile)
        this.view.appendTranscript('系统', '麦克风已开启，请直接说话')
        return
      }

      await this.audio.stopStreaming()
    } catch (error) {
      this.listening = false
      this.view.setListeningActive(false)
      this.view.setState('idle')
      this.view.appendTranscript('系统', error instanceof Error ? error.message : 'Failed to start microphone')
    }
  }

  async handleServerEvent(payload) {
    switch (payload.type) {
      case 'session_ready':
        this.view.setState('idle')
        break
      case 'asr_final':
        this.view.appendTranscript('你', payload.text)
        break
      case 'assistant_text_final':
        this.view.appendTranscript('助手', payload.text)
        break
      case 'avatar_state':
        if (payload.state === 'idle' && this.playbackActive) {
          this.pendingIdleAfterPlayback = true
          break
        }
        this.view.setState(payload.state)
        break
      case 'interrupt_ack':
        this.audio.stopPlayback()
        this.view.setState('listening')
        break
      case 'tts_audio_chunk':
        this.pendingIdleAfterPlayback = false
        this.view.setState('speaking')
        await this.audio.playBase64Wav(payload.audio_base64)
        break
      case 'error':
        this.view.appendTranscript('系统', payload.detail)
        this.view.setState('idle')
        break
      default:
        break
    }
  }

  _handlePlaybackState(active) {
    this.playbackActive = active
    if (active) {
      this.view.setState('speaking')
      return
    }

    if (this.pendingIdleAfterPlayback) {
      this.pendingIdleAfterPlayback = false
      this.view.setState(this.listening ? 'listening' : 'idle')
      return
    }

    if (this.view.state === 'speaking') {
      this.view.setState(this.listening ? 'listening' : 'idle')
    }
  }

  _bindDrag() {
    if (!this.options.draggable) {
      return
    }

    const onPointerMove = (event) => {
      if (!this.dragging) {
        return
      }
      const next = clampPosition(
        {
          x: event.clientX - this.dragOffset.x,
          y: event.clientY - this.dragOffset.y,
        },
        { width: window.innerWidth, height: window.innerHeight },
        { width: 280, height: 360 },
      )
      this.position = next
      this._applyPosition()
    }

    const onPointerUp = () => {
      this.dragging = false
      document.removeEventListener('pointermove', onPointerMove)
      document.removeEventListener('pointerup', onPointerUp)
    }

    this.root.addEventListener('pointerdown', (event) => {
      this.dragging = true
      this.dragOffset = {
        x: event.clientX - this.position.x,
        y: event.clientY - this.position.y,
      }
      document.addEventListener('pointermove', onPointerMove)
      document.addEventListener('pointerup', onPointerUp)
    })
  }

  _applyPosition() {
    if (this.options.mountMode !== 'floating') {
      return
    }
    this.root.style.position = 'fixed'
    this.root.style.left = `${this.position.x}px`
    this.root.style.top = `${this.position.y}px`
    this.root.style.zIndex = '9999'
  }
}
