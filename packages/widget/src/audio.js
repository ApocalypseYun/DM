import { shouldCloseVoiceSegment, shouldCommitVoiceSegment } from './helpers.js'

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
    this.playbackAnalyser = null
    this.playbackMeterTimer = null
    this.playbackActive = false
    this.isStreaming = false
    this.lastSpeechAt = 0
    this.segmentStartedAt = 0
    this.voiceActivationThreshold = 0.02
    this.segmentSilenceWindowMs = 1400
    this.minimumSegmentDurationMs = 600
    this.minimumSegmentByteLength = 1800
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
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error('Current browser does not support microphone capture')
    }
    if (typeof window.MediaRecorder === 'undefined') {
      throw new Error('Current browser does not support MediaRecorder')
    }

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        },
      })
    } catch (error) {
      throw this._normalizeStartError(error)
    }

    this.audioContext = new (window.AudioContext || window.webkitAudioContext)()
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume()
    }
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
        this.segmentStartedAt = 0
        return
      }
      const blob = new Blob(this.segmentChunks, { type: this.mediaRecorder.mimeType || 'audio/webm' })
      this.segmentChunks = []
      const segmentDurationMs = this.segmentStartedAt ? Date.now() - this.segmentStartedAt : 0
      this.segmentStartedAt = 0
      if (
        !shouldCommitVoiceSegment(
          segmentDurationMs,
          blob.size,
          this.minimumSegmentDurationMs,
          this.minimumSegmentByteLength,
        )
      ) {
        return
      }
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
      if (level > this.voiceActivationThreshold) {
        this.lastSpeechAt = now
        if (!this.segmentActive) {
          this.segmentActive = true
          this.segmentStartedAt = now
          this.segmentChunks = []
          this.websocket?.send(JSON.stringify({ type: 'barge_in' }))
          if (this.mediaRecorder?.state === 'inactive') {
            this.mediaRecorder.start()
          }
        }
      }

      if (this.segmentActive && shouldCloseVoiceSegment(now - this.lastSpeechAt, this.segmentSilenceWindowMs)) {
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
    this.stopPlayback()
    if (this.analysisTimer) {
      clearInterval(this.analysisTimer)
      this.analysisTimer = null
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop()
    }
    this.segmentActive = false
    this.segmentChunks = []
    this.segmentStartedAt = 0
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
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume()
    }
    const buffer = base64ToArrayBuffer(audioBase64)
    const decoded = await this.audioContext.decodeAudioData(buffer.slice(0))
    const source = this.audioContext.createBufferSource()
    const analyser = this.audioContext.createAnalyser()
    analyser.fftSize = 256
    source.buffer = decoded
    source.connect(analyser)
    analyser.connect(this.audioContext.destination)
    this.playbackSource = source
    this.playbackAnalyser = analyser
    this._setPlaybackActive(true)
    this._startPlaybackMeter()
    source.addEventListener('ended', () => {
      if (this.playbackSource === source) {
        this._stopPlaybackMeter()
        this.playbackAnalyser?.disconnect()
        this.playbackAnalyser = null
        this.playbackSource = null
        this._setPlaybackActive(false)
      }
    })
    source.start()
  }

  stopPlayback() {
    const source = this.playbackSource
    if (source) {
      try {
        source.stop()
      } catch (_error) {
        // Ignore stop races when the source already ended.
      }
    }
    this.playbackSource = null
    this._stopPlaybackMeter()
    this.playbackAnalyser?.disconnect()
    this.playbackAnalyser = null
    this._setPlaybackActive(false)
  }

  _readLevel() {
    return this._readAnalyserLevel(this.analyser)
  }

  _readAnalyserLevel(analyser) {
    if (!analyser) {
      return 0
    }
    const samples = new Uint8Array(analyser.frequencyBinCount)
    analyser.getByteTimeDomainData(samples)
    let total = 0
    for (let index = 0; index < samples.length; index += 1) {
      const centered = (samples[index] - 128) / 128
      total += centered * centered
    }
    return Math.sqrt(total / samples.length)
  }

  _startPlaybackMeter() {
    this._stopPlaybackMeter()
    this.playbackMeterTimer = window.setInterval(() => {
      const level = this._readAnalyserLevel(this.playbackAnalyser)
      this.callbacks.onPlaybackLevel?.(Math.min(1, level * 4))
    }, 40)
  }

  _stopPlaybackMeter() {
    if (this.playbackMeterTimer) {
      clearInterval(this.playbackMeterTimer)
      this.playbackMeterTimer = null
    }
    this.callbacks.onPlaybackLevel?.(0)
  }

  _setPlaybackActive(active) {
    if (this.playbackActive === active) {
      return
    }
    this.playbackActive = active
    this.callbacks.onPlaybackStateChange?.(active)
  }

  _normalizeStartError(error) {
    if (!error || typeof error !== 'object') {
      return new Error('Failed to start microphone')
    }
    if (error.name === 'NotAllowedError') {
      return new Error('Microphone permission was denied')
    }
    if (error.name === 'NotFoundError') {
      return new Error('No microphone device was found')
    }
    if (error.name === 'NotReadableError') {
      return new Error('Microphone is busy or unavailable')
    }
    return new Error(error.message || 'Failed to start microphone')
  }
}
