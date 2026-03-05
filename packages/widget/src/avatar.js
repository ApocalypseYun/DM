import { DHLiveAvatar } from './dh_live_avatar.js'

export class AvatarView {
  constructor(root, options) {
    this.root = root
    this.options = options
    this.state = 'idle'
    this.transcriptLines = []
    this.renderer = null
    this.rendererMode = options.avatarRenderer === 'dh_live' ? 'dh_live' : 'image'
    this._render()
    if (this.rendererMode === 'dh_live') {
      this._initializeDhLive()
    } else {
      this.setMouthLevel(0)
    }
  }

  _render() {
    this.root.className = 'dh-widget-root'
    const imageRendererVisible = this.rendererMode === 'image'
    this.root.innerHTML = `
      <div class="dh-widget" data-state="idle">
        <div class="dh-header">
          <span class="dh-title"></span>
          <button class="dh-toggle" type="button">Mic</button>
        </div>
        <div class="dh-avatar-shell">
          <div class="dh-avatar-stage">
            <div class="dh-avatar-live${this.rendererMode === 'dh_live' ? ' is-active' : ''}"></div>
            <div class="dh-avatar-image-renderer${imageRendererVisible ? ' is-active' : ''}">
              <img class="dh-avatar-image" alt="Digital human avatar" />
              <img class="dh-avatar-mouth-layer" alt="" aria-hidden="true" />
              <div class="dh-avatar-mouth-aperture"></div>
            </div>
          </div>
          <div class="dh-status-pill">idle</div>
        </div>
        <div class="dh-transcript"></div>
      </div>
    `

    this.widget = this.root.querySelector('.dh-widget')
    this.titleEl = this.root.querySelector('.dh-title')
    this.toggleButton = this.root.querySelector('.dh-toggle')
    this.liveEl = this.root.querySelector('.dh-avatar-live')
    this.imageRendererEl = this.root.querySelector('.dh-avatar-image-renderer')
    this.imageEl = this.root.querySelector('.dh-avatar-image')
    this.mouthLayerEl = this.root.querySelector('.dh-avatar-mouth-layer')
    this.mouthApertureEl = this.root.querySelector('.dh-avatar-mouth-aperture')
    this.statusEl = this.root.querySelector('.dh-status-pill')
    this.transcriptEl = this.root.querySelector('.dh-transcript')

    this.titleEl.textContent = this.options.title
    this.imageEl.src = this.options.avatarImage
    this.mouthLayerEl.src = this.options.avatarImage

    const { mouthRig } = this.options
    this.root.style.setProperty('--dh-mouth-x', `${mouthRig.xPercent}%`)
    this.root.style.setProperty('--dh-mouth-y', `${mouthRig.yPercent}%`)
    this.root.style.setProperty('--dh-mouth-width', `${mouthRig.widthPercent}%`)
    this.root.style.setProperty('--dh-mouth-height', `${mouthRig.heightPercent}%`)
  }

  async _initializeDhLive() {
    try {
      this.renderer = new DHLiveAvatar(this.liveEl, this.options.dhLive)
      await this.renderer.init()
      this._setRendererMode('dh_live')
      return
    } catch (error) {
      console.warn('[dh-widget] failed to initialize dh_live renderer, falling back to image renderer', error)
      this.renderer?.destroy()
      this.renderer = null
      this._setRendererMode('image')
      this.setMouthLevel(0)
    }
  }

  _setRendererMode(mode) {
    this.rendererMode = mode
    this.liveEl.classList.toggle('is-active', mode === 'dh_live')
    this.imageRendererEl.classList.toggle('is-active', mode === 'image')
  }

  setState(nextState) {
    this.state = nextState
    this.widget.dataset.state = nextState
    this.statusEl.textContent = nextState
    if (nextState !== 'speaking' && this.rendererMode === 'image') {
      this.setMouthLevel(0)
    }
  }

  setListeningActive(isActive) {
    this.toggleButton.textContent = isActive ? 'Stop' : 'Mic'
  }

  appendTranscript(role, text) {
    if (!text) {
      return
    }
    this.transcriptLines.push(`${role}: ${text}`)
    this.transcriptLines = this.transcriptLines.slice(-4)
    this.transcriptEl.textContent = this.transcriptLines.join('\n')
  }

  setMouthLevel(level) {
    if (this.rendererMode !== 'image') {
      return
    }
    const clamped = Math.max(0, Math.min(1, Number(level) || 0))
    const jawShift = clamped * 3.8
    const jawScale = 1 + clamped * 0.22
    const apertureScaleY = 0.25 + clamped * 2.35
    const apertureOpacity = clamped * 0.72
    const apertureBlur = 0.6 + clamped * 2.1

    this.mouthLayerEl.style.transform = `translateY(${jawShift.toFixed(2)}px) scaleY(${jawScale.toFixed(3)})`
    this.mouthApertureEl.style.transform = `translateY(${(jawShift * 0.4).toFixed(2)}px) scaleY(${apertureScaleY.toFixed(3)})`
    this.mouthApertureEl.style.opacity = apertureOpacity.toFixed(3)
    this.mouthApertureEl.style.filter = `blur(${apertureBlur.toFixed(2)}px)`
  }

  pushAudioChunk(arrayBuffer) {
    this.renderer?.pushAudioChunk(arrayBuffer)
  }

  clearSpeechAudio() {
    this.renderer?.clearAudio()
  }

  destroy() {
    this.renderer?.destroy()
    this.renderer = null
  }
}
