function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('Failed to read audio blob'))
        return
      }
      const [, base64 = ''] = result.split(',', 2)
      resolve(base64)
    }
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read audio blob'))
    reader.readAsDataURL(blob)
  })
}

function base64ToArrayBuffer(base64) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes.buffer
}

export class AudioRuntime {
  constructor(serverUrl, callbacks) {
    this.serverUrl = serverUrl
    this.callbacks = callbacks
    this.websocket = null
    this.audioContext = null
    this.mediaRecorder = null
    this.mediaStream = null
    this.analysisTimer = null
    this.audioSource = null
    this.analyser = null
    this.voiceProfile = 'default_female_zh'
    this.segmentActive = false
    this.segmentChunks = []
    this.segmentMimeType = 'audio/webm'
    this.playbackSource = null
    this.isStreaming = false
    this.lastSpeechAt = 0
  }

  async connect() {
    if (this.websocket && this.websocket.readyState <= 1) {
      return
    }

    const wsUrl = this.serverUrl.replace(/^http/, 'ws').replace(/\/$/, '') + '/ws/realtime'
    this.websocket = new WebSocket(wsUrl)
    this.websocket.addEventListener('message', (event) => {
      const payload = JSON.parse(event.data)
      this.callbacks.onEvent(payload)
    })
    await new Promise((resolve, reject) => {
      this.websocket.addEventListener('open', resolve, { once: true })
      this.websocket.addEventListener('error', reject, { once: true })
    })
  }

  async startStreaming(voiceProfile) {
    await this.connect()
    if (this.isStreaming) {
      return
    }
    this.voiceProfile = voiceProfile

    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
      },
    })

    this.audioContext = new (window.AudioContext || window.webkitAudioContext)()
    this.audioSource = this.audioContext.createMediaStreamSource(this.mediaStream)
    this.analyser = this.audioContext.createAnalyser()
    this.analyser.fftSize = 512
    this.audioSource.connect(this.analyser)

    this.segmentMimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : ''
    this.mediaRecorder = this.segmentMimeType
      ? new MediaRecorder(this.mediaStream, { mimeType: this.segmentMimeType })
      : new MediaRecorder(this.mediaStream)
    this.mediaRecorder.addEventListener('dataavailable', (recordingEvent) => {
      if (!recordingEvent.data || recordingEvent.data.size === 0) {
        return
      }
      this.segmentChunks.push(recordingEvent.data)
    })
    this.mediaRecorder.addEventListener('stop', async () => {
      if (!this.websocket || this.segmentChunks.length === 0) {
        this.segmentChunks = []
        return
      }
      const blob = new Blob(this.segmentChunks, { type: this.mediaRecorder.mimeType || 'audio/webm' })
      this.segmentChunks = []
      const audioBase64 = await blobToBase64(blob)
      this.websocket.send(
        JSON.stringify({
          type: 'audio_commit',
          audio_base64: audioBase64,
          mime_type: blob.type || 'audio/webm',
          voice_profile_id: this.voiceProfile,
        }),
      )
    })

    this.websocket.send(JSON.stringify({ type: 'set_voice_profile', voice_profile_id: voiceProfile }))

    this.analysisTimer = window.setInterval(() => {
      const level = this._readLevel()
      const now = Date.now()
      if (level > 0.04) {
        this.lastSpeechAt = now
        if (!this.segmentActive) {
          this.segmentActive = true
          this.segmentChunks = []
          this.websocket?.send(JSON.stringify({ type: 'barge_in' }))
          if (this.mediaRecorder?.state === 'inactive') {
            this.mediaRecorder.start()
          }
        }
      }

      if (this.segmentActive && now - this.lastSpeechAt > 900) {
        this.segmentActive = false
        if (this.mediaRecorder?.state === 'recording') {
          this.mediaRecorder.stop()
        }
      }
    }, 150)
    this.isStreaming = true
  }

  async stopStreaming() {
    this.isStreaming = false
    if (this.analysisTimer) {
      clearInterval(this.analysisTimer)
      this.analysisTimer = null
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop()
    }
    this.segmentActive = false
    this.segmentChunks = []
    this.mediaRecorder = null
    this.audioSource?.disconnect()
    this.audioSource = null
    this.analyser = null
    if (this.audioContext && this.audioContext.state !== 'closed') {
      await this.audioContext.close()
    }
    this.audioContext = null
    this.mediaStream?.getTracks().forEach((track) => track.stop())
    this.mediaStream = null
  }

  async playBase64Wav(audioBase64) {
    this.stopPlayback()
    if (!this.audioContext || this.audioContext.state === 'closed') {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)()
    }
    const buffer = base64ToArrayBuffer(audioBase64)
    const decoded = await this.audioContext.decodeAudioData(buffer.slice(0))
    const source = this.audioContext.createBufferSource()
    source.buffer = decoded
    source.connect(this.audioContext.destination)
    this.playbackSource = source
    source.addEventListener('ended', () => {
      if (this.playbackSource === source) {
        this.playbackSource = null
      }
    })
    source.start()
  }

  stopPlayback() {
    if (!this.playbackSource) {
      return
    }
    try {
      this.playbackSource.stop()
    } catch (_error) {
      // Ignore stop races when the source already ended.
    }
    this.playbackSource = null
  }

  _readLevel() {
    if (!this.analyser) {
      return 0
    }
    const samples = new Uint8Array(this.analyser.frequencyBinCount)
    this.analyser.getByteTimeDomainData(samples)
    let total = 0
    for (let index = 0; index < samples.length; index += 1) {
      const centered = (samples[index] - 128) / 128
      total += centered * centered
    }
    return Math.sqrt(total / samples.length)
  }
}
