export class AvatarView {
  constructor(root, options) {
    this.root = root
    this.options = options
    this.state = 'idle'
    this.transcriptLines = []
    this._render()
    this.setMouthLevel(0)
  }

  _render() {
    this.root.className = 'dh-widget-root'
    this.root.innerHTML = `
      <div class="dh-widget" data-state="idle">
        <div class="dh-header">
          <span class="dh-title"></span>
          <button class="dh-toggle" type="button">Mic</button>
        </div>
        <div class="dh-avatar-shell">
          <img class="dh-avatar-image" alt="Digital human avatar" />
          <div class="dh-avatar-mouth"></div>
          <div class="dh-status-pill">idle</div>
        </div>
        <div class="dh-transcript"></div>
      </div>
    `

    this.widget = this.root.querySelector('.dh-widget')
    this.titleEl = this.root.querySelector('.dh-title')
    this.toggleButton = this.root.querySelector('.dh-toggle')
    this.imageEl = this.root.querySelector('.dh-avatar-image')
    this.mouthEl = this.root.querySelector('.dh-avatar-mouth')
    this.statusEl = this.root.querySelector('.dh-status-pill')
    this.transcriptEl = this.root.querySelector('.dh-transcript')

    this.titleEl.textContent = this.options.title
    this.imageEl.src = this.options.avatarImage
  }

  setState(nextState) {
    this.state = nextState
    this.widget.dataset.state = nextState
    this.statusEl.textContent = nextState
    if (nextState !== 'speaking') {
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
    const clamped = Math.max(0, Math.min(1, Number(level) || 0))
    const scale = 0.55 + clamped * 2.1
    const opacity = 0.62 + clamped * 0.38
    this.mouthEl.style.transform = `scaleY(${scale.toFixed(3)})`
    this.mouthEl.style.opacity = opacity.toFixed(3)
  }
}
