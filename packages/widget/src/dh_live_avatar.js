const FRAME_INTERVAL_MS = 40
const BLEND_SHAPE_SIZE = 12
const WORK_WIDTH = 128
const WORK_HEIGHT = 128
const ORTHO_MATRIX = buildOrthoMatrix()

const runtimeModulePromiseByBaseUrl = new Map()
const scriptPromiseByUrl = new Map()

function trimTrailingSlash(value) {
  return String(value || '').replace(/\/+$/, '')
}

function parseObjFile(lines) {
  const vertices = []
  const faces = []

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      continue
    }
    const parts = line.split(/\s+/)
    if (parts[0] === 'v') {
      vertices.push(
        Number.parseFloat(parts[1]),
        Number.parseFloat(parts[2]),
        Number.parseFloat(parts[3]),
        Number.parseFloat(parts[4]),
        Number.parseFloat(parts[5]),
      )
      continue
    }
    if (parts[0] === 'f') {
      for (const chunk of parts.slice(1)) {
        const [indexText] = chunk.split('/')
        faces.push(Number.parseInt(indexText, 10) - 1)
      }
    }
  }

  return { vertices, faces }
}

function utf8ByteLength(input) {
  return new TextEncoder().encode(input).length + 1
}

function ensureScript(url) {
  const existingPromise = scriptPromiseByUrl.get(url)
  if (existingPromise) {
    return existingPromise
  }

  const promise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-dh-live-runtime="${url}"]`)
    if (existing) {
      if (existing.dataset.dhLiveReady === '1' || existing.readyState === 'complete') {
        resolve()
        return
      }
      existing.addEventListener(
        'load',
        () => {
          existing.dataset.dhLiveReady = '1'
          resolve()
        },
        { once: true },
      )
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${url}`)), { once: true })
      return
    }

    const script = document.createElement('script')
    script.src = url
    script.async = true
    script.dataset.dhLiveRuntime = url
    script.addEventListener(
      'load',
      () => {
        script.dataset.dhLiveReady = '1'
        resolve()
      },
      { once: true },
    )
    script.addEventListener('error', () => reject(new Error(`Failed to load ${url}`)), { once: true })
    document.head.appendChild(script)
  })

  scriptPromiseByUrl.set(url, promise)
  return promise
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type)
  if (!shader) {
    throw new Error('Failed to create shader')
  }

  gl.shaderSource(shader, source)
  gl.compileShader(shader)

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || 'Unknown shader compile error'
    gl.deleteShader(shader)
    throw new Error(message)
  }
  return shader
}

function buildOrthoMatrix() {
  const orthoMatrix = new Float32Array(16)
  const left = 0
  const right = 128
  const bottom = 0
  const top = 128
  const near = 1000
  const far = -1000

  const rl = right - left
  const tb = top - bottom
  const fn = far - near

  orthoMatrix[0] = 2 / rl
  orthoMatrix[1] = 0
  orthoMatrix[2] = 0
  orthoMatrix[3] = 0

  orthoMatrix[4] = 0
  orthoMatrix[5] = 2 / tb
  orthoMatrix[6] = 0
  orthoMatrix[7] = 0

  orthoMatrix[8] = 0
  orthoMatrix[9] = 0
  orthoMatrix[10] = -2 / fn
  orthoMatrix[11] = 0

  orthoMatrix[12] = -(right + left) / rl
  orthoMatrix[13] = -(top + bottom) / tb
  orthoMatrix[14] = -(far + near) / fn
  orthoMatrix[15] = 1
  return orthoMatrix
}

async function responseToJson(response, gzip) {
  if (!gzip) {
    return response.json()
  }
  if (typeof DecompressionStream !== 'function') {
    throw new Error('Browser does not support gzip decompression')
  }
  const stream = response.body
  if (!stream) {
    throw new Error('Missing gzip response stream')
  }
  const decompressed = stream.pipeThrough(new DecompressionStream('gzip'))
  const text = await new Response(decompressed).text()
  return JSON.parse(text)
}

async function fetchCombinedData(assetBaseUrl) {
  const jsonUrl = `${assetBaseUrl}/combined_data.json`
  const jsonResponse = await fetch(jsonUrl)
  if (jsonResponse.ok) {
    return responseToJson(jsonResponse, false)
  }

  const gzipUrl = `${assetBaseUrl}/combined_data.json.gz`
  const gzipResponse = await fetch(gzipUrl)
  if (!gzipResponse.ok) {
    throw new Error(`Failed to load combined data (${jsonResponse.status}/${gzipResponse.status})`)
  }
  return responseToJson(gzipResponse, true)
}

export class DHLiveAvatar {
  constructor(stageEl, options = {}) {
    this.stageEl = stageEl
    this.options = {
      runtimeBaseUrl: trimTrailingSlash(options.runtimeBaseUrl || '/widget/dh-live'),
      assetBaseUrl: trimTrailingSlash(options.assetBaseUrl || '/widget/dh-live/assets/default'),
      frameRate: options.frameRate || 25,
    }

    this.module = null
    this.video = null
    this.frameData = []
    this.frameCount = 0
    this.objData = null

    this.canvasVideo = null
    this.canvasGl = null
    this.workCanvas = null
    this.ctxVideo = null
    this.ctxWork = null
    this.gl = null

    this.program = null
    this.positionBuffer = null
    this.indexBuffer = null
    this.textureBs = null

    this.imageDataPtr = 0
    this.imageDataGlPtr = 0
    this.bsPtr = 0
    this.pixelsFbo = new Uint8Array(WORK_WIDTH * WORK_HEIGHT * 4)

    this.rafId = 0
    this.lastTickAt = 0
    this.running = false
    this.destroyed = false

    this._tick = this._tick.bind(this)
  }

  async init() {
    this._renderShell()
    this.module = await this._loadRuntimeModule()
    const combinedData = await fetchCombinedData(this.options.assetBaseUrl)
    this._hydrateCombinedData(combinedData)
    this._pushRuntimeConfig(combinedData)
    await this._loadVideo()
    await this._initializeGl()
    this._initializeMemory()
    this.running = true
    this.lastTickAt = performance.now()
    this.rafId = requestAnimationFrame(this._tick)
  }

  pushAudioChunk(arrayBuffer) {
    if (!this.module || this.destroyed || !arrayBuffer) {
      return
    }
    const view = arrayBuffer instanceof Uint8Array ? arrayBuffer : new Uint8Array(arrayBuffer)
    if (view.byteLength === 0) {
      return
    }
    const ptr = this.module._malloc(view.byteLength)
    this.module.HEAPU8.set(view, ptr)
    this.module._setAudioBuffer(ptr, view.byteLength)
    this.module._free(ptr)
  }

  clearAudio() {
    if (!this.module || this.destroyed) {
      return
    }
    this.module._clearAudio()
  }

  destroy() {
    this.destroyed = true
    this.running = false
    if (this.rafId) {
      cancelAnimationFrame(this.rafId)
      this.rafId = 0
    }

    if (this.video) {
      this.video.pause()
      this.video.src = ''
      this.video.load()
      this.video = null
    }

    if (this.module) {
      if (this.imageDataPtr) {
        this.module._free(this.imageDataPtr)
        this.imageDataPtr = 0
      }
      if (this.imageDataGlPtr) {
        this.module._free(this.imageDataGlPtr)
        this.imageDataGlPtr = 0
      }
      if (this.bsPtr) {
        this.module._free(this.bsPtr)
        this.bsPtr = 0
      }
    }

    if (this.gl) {
      if (this.program) {
        this.gl.deleteProgram(this.program)
        this.program = null
      }
      if (this.positionBuffer) {
        this.gl.deleteBuffer(this.positionBuffer)
        this.positionBuffer = null
      }
      if (this.indexBuffer) {
        this.gl.deleteBuffer(this.indexBuffer)
        this.indexBuffer = null
      }
      if (this.textureBs) {
        this.gl.deleteTexture(this.textureBs)
        this.textureBs = null
      }
    }
  }

  _renderShell() {
    this.stageEl.innerHTML = `
      <div class="dh-live-shell">
        <canvas class="dh-live-canvas-video"></canvas>
        <canvas class="dh-live-canvas-gl" width="128" height="128"></canvas>
      </div>
    `
    this.canvasVideo = this.stageEl.querySelector('.dh-live-canvas-video')
    this.canvasGl = this.stageEl.querySelector('.dh-live-canvas-gl')
    this.workCanvas = document.createElement('canvas')
    this.workCanvas.width = WORK_WIDTH
    this.workCanvas.height = WORK_HEIGHT
    this.ctxVideo = this.canvasVideo.getContext('2d')
    this.ctxWork = this.workCanvas.getContext('2d', { willReadFrequently: true })
    this.gl = this.canvasGl.getContext('webgl2', { antialias: false })

    if (!this.ctxVideo || !this.ctxWork || !this.gl) {
      throw new Error('Browser does not support required canvas/WebGL2 APIs')
    }
  }

  async _loadRuntimeModule() {
    const key = this.options.runtimeBaseUrl
    const existingPromise = runtimeModulePromiseByBaseUrl.get(key)
    if (existingPromise) {
      return existingPromise
    }

    const modulePromise = (async () => {
        const runtimeScriptUrl = `${this.options.runtimeBaseUrl}/DHLiveMini.js`
        await ensureScript(runtimeScriptUrl)
        if (typeof window.createQtAppInstance !== 'function') {
          throw new Error('DHLive runtime loader missing createQtAppInstance')
        }
        return window.createQtAppInstance({
          locateFile: (path) => {
            if (path.endsWith('.wasm')) {
              return `${this.options.runtimeBaseUrl}/DHLiveMini.wasm`
            }
            return `${this.options.runtimeBaseUrl}/${path}`
          },
          print: () => {},
          printErr: () => {},
        })
      })()
    runtimeModulePromiseByBaseUrl.set(key, modulePromise)
    return modulePromise
  }

  _hydrateCombinedData(combinedData) {
    this.frameData = combinedData.json_data || []
    this.frameCount = this.frameData.length
    if (!this.frameCount) {
      throw new Error('combined_data contains no json_data frames')
    }
    if (!combinedData.face3D_obj || combinedData.face3D_obj.length === 0) {
      throw new Error('combined_data missing face3D_obj')
    }
    this.objData = parseObjFile(combinedData.face3D_obj)
  }

  _pushRuntimeConfig(combinedData) {
    const { json_data: _dropJsonData, ...runtimeConfig } = combinedData
    const jsonText = JSON.stringify(runtimeConfig)
    const byteLength = utf8ByteLength(jsonText)
    const ptr = this.module._malloc(byteLength)
    this.module.stringToUTF8(jsonText, ptr, byteLength)
    this.module._processJson(ptr)
    this.module._free(ptr)
  }

  async _loadVideo() {
    const video = document.createElement('video')
    video.src = `${this.options.assetBaseUrl}/01.mp4`
    video.preload = 'auto'
    video.loop = true
    video.muted = true
    video.playsInline = true
    video.crossOrigin = 'anonymous'

    await new Promise((resolve, reject) => {
      video.addEventListener('loadedmetadata', resolve, { once: true })
      video.addEventListener('error', () => reject(new Error('Failed to load DHLive video asset')), { once: true })
    })

    const width = video.videoWidth || 720
    const height = video.videoHeight || 974
    this.canvasVideo.width = width
    this.canvasVideo.height = height

    await video.play().catch(() => {})
    this.video = video
  }

  async _initializeGl() {
    const vertexShaderSource = `#version 300 es
      layout(location = 0) in vec3 a_position;
      layout(location = 1) in vec2 a_texture;
      uniform float bsVec[12];
      uniform mat4 gProjection;
      uniform mat4 gWorld0;
      uniform sampler2D texture_bs;
      uniform vec2 vertBuffer[209];
      out vec2 v_texture;
      out vec2 v_bias;

      vec4 calculateMorphPosition(vec3 position, vec2 textureCoord) {
        vec4 resultPosition = vec4(position, 1.0);
        if (textureCoord.x < 3.0 && textureCoord.x >= 0.0) {
          vec3 morphSum = vec3(0.0);
          for (int i = 0; i < 6; i++) {
            ivec2 coord = ivec2(int(textureCoord.y), i);
            vec3 morph = texelFetch(texture_bs, coord, 0).xyz * 2.0 - 1.0;
            morphSum += bsVec[i] * morph;
          }
          resultPosition.xyz += morphSum;
        } else if (textureCoord.x == 4.0) {
          vec3 morphSum = vec3(0.0, (bsVec[0] + bsVec[1]) / 2.7 + 6.0, 0.0);
          resultPosition.xyz += morphSum;
        }
        return resultPosition;
      }

      void main() {
        vec4 morphed = calculateMorphPosition(a_position, a_texture);
        vec4 worldPosition = gWorld0 * morphed;

        v_bias = vec2(0.0, 0.0);
        if (a_texture.y < 209.0 && a_texture.x >= 0.0 && a_texture.x < 3.0) {
          vec4 projected = gProjection * vec4(worldPosition.x, worldPosition.y, worldPosition.z, 1.0);
          v_bias = projected.xy - (vertBuffer[int(a_texture.y)].xy / 128.0 * 2.0 - 1.0);
        }

        if (a_texture.x >= 3.0) {
          gl_Position = gProjection * vec4(worldPosition.x, worldPosition.y, 500.0, 1.0);
        } else {
          gl_Position = gProjection * vec4(worldPosition.x, worldPosition.y, worldPosition.z, 1.0);
        }
        v_texture = a_texture;
      }
    `

    const fragmentShaderSource = `#version 300 es
      precision mediump float;
      in mediump vec2 v_texture;
      in mediump vec2 v_bias;
      out vec4 out_color;

      void main() {
        if (v_texture.x == 2.0) {
          out_color = vec4(1.0, 0.0, 0.0, 1.0);
        } else if (v_texture.x > 2.0 && v_texture.x < 2.1) {
          out_color = vec4(0.5, 0.0, 0.0, 1.0);
        } else if (v_texture.x == 3.0) {
          out_color = vec4(0.0, 1.0, 0.0, 1.0);
        } else if (v_texture.x == 4.0) {
          out_color = vec4(0.0, 0.0, 1.0, 1.0);
        } else if (v_texture.x > 3.0 && v_texture.x < 4.0) {
          out_color = vec4(0.0, 0.0, 0.0, 1.0);
        } else {
          vec2 wrap = (v_bias.xy + 1.0) / 2.0;
          out_color = vec4(wrap.xy, 0.5, 1.0);
        }
      }
    `

    const vertexShader = compileShader(this.gl, this.gl.VERTEX_SHADER, vertexShaderSource)
    const fragmentShader = compileShader(this.gl, this.gl.FRAGMENT_SHADER, fragmentShaderSource)
    const program = this.gl.createProgram()
    if (!program) {
      throw new Error('Failed to create GL program')
    }

    this.gl.attachShader(program, vertexShader)
    this.gl.attachShader(program, fragmentShader)
    this.gl.linkProgram(program)
    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      const message = this.gl.getProgramInfoLog(program) || 'Unknown GL program link error'
      this.gl.deleteProgram(program)
      throw new Error(message)
    }

    this.gl.deleteShader(vertexShader)
    this.gl.deleteShader(fragmentShader)

    this.program = program
    this.gl.useProgram(this.program)

    this.positionBuffer = this.gl.createBuffer()
    this.indexBuffer = this.gl.createBuffer()
    this.textureBs = this.gl.createTexture()
    if (!this.positionBuffer || !this.indexBuffer || !this.textureBs) {
      throw new Error('Failed to create GL buffers/textures')
    }

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer)
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(this.objData.vertices), this.gl.STATIC_DRAW)
    this.gl.enableVertexAttribArray(0)
    this.gl.vertexAttribPointer(0, 3, this.gl.FLOAT, false, 20, 0)
    this.gl.enableVertexAttribArray(1)
    this.gl.vertexAttribPointer(1, 2, this.gl.FLOAT, false, 20, 12)

    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer)
    this.gl.bufferData(this.gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(this.objData.faces), this.gl.STATIC_DRAW)

    const textureImage = new Image()
    textureImage.src = `${this.options.runtimeBaseUrl}/bs_texture_halfFace.png`
    await new Promise((resolve, reject) => {
      textureImage.addEventListener('load', resolve, { once: true })
      textureImage.addEventListener('error', () => reject(new Error('Failed to load blend-shape texture')), {
        once: true,
      })
    })

    this.gl.bindTexture(this.gl.TEXTURE_2D, this.textureBs)
    this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, textureImage)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR)
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR)
    this.gl.activeTexture(this.gl.TEXTURE0)
    this.gl.uniform1i(this.gl.getUniformLocation(this.program, 'texture_bs'), 0)
  }

  _initializeMemory() {
    const imageDataSize = WORK_WIDTH * WORK_HEIGHT * 4
    this.imageDataPtr = this.module._malloc(imageDataSize)
    this.imageDataGlPtr = this.module._malloc(imageDataSize)
    this.bsPtr = this.module._malloc(BLEND_SHAPE_SIZE * 4)
  }

  _tick(now) {
    if (!this.running || this.destroyed) {
      return
    }

    if (!this.video) {
      this.rafId = requestAnimationFrame(this._tick)
      return
    }

    if (now - this.lastTickAt < FRAME_INTERVAL_MS) {
      this.rafId = requestAnimationFrame(this._tick)
      return
    }

    this.lastTickAt = now
    this.ctxVideo.drawImage(this.video, 0, 0, this.canvasVideo.width, this.canvasVideo.height)

    const frameIndex = Math.floor(this.video.currentTime * this.options.frameRate) % this.frameCount
    this._processFrame(frameIndex)
    this.rafId = requestAnimationFrame(this._tick)
  }

  _processFrame(frameIndex) {
    const dataSet = this.frameData[frameIndex]
    if (!dataSet) {
      return
    }

    const rect = dataSet.rect
    const points = dataSet.points
    const matrix = new Float32Array(points.slice(0, 16))
    const subPoints = new Float32Array(points.slice(16))
    this.module._updateBlendShape(this.bsPtr, BLEND_SHAPE_SIZE * 4)
    const bsArray = new Float32Array(this.module.HEAPU8.buffer, this.bsPtr, BLEND_SHAPE_SIZE)

    this._renderGl(matrix, subPoints, bsArray)

    const faceWidth = Math.max(1, rect[2] - rect[0])
    const faceHeight = Math.max(1, rect[3] - rect[1])
    this.ctxWork.drawImage(
      this.canvasVideo,
      rect[0],
      rect[1],
      faceWidth,
      faceHeight,
      0,
      0,
      WORK_WIDTH,
      WORK_HEIGHT,
    )

    const imageData = this.ctxWork.getImageData(0, 0, WORK_WIDTH, WORK_HEIGHT)
    this.module.HEAPU8.set(imageData.data, this.imageDataPtr)
    this.module.HEAPU8.set(this.pixelsFbo, this.imageDataGlPtr)

    this.module._processImage(this.imageDataPtr, WORK_WIDTH, WORK_HEIGHT, this.imageDataGlPtr, WORK_WIDTH, WORK_HEIGHT)
    const result = this.module.HEAPU8.subarray(this.imageDataPtr, this.imageDataPtr + imageData.data.length)
    imageData.data.set(result)
    this.ctxWork.putImageData(imageData, 0, 0)

    this.ctxVideo.drawImage(
      this.workCanvas,
      0,
      0,
      WORK_WIDTH,
      WORK_HEIGHT,
      rect[0],
      rect[1],
      faceWidth,
      faceHeight,
    )
  }

  _renderGl(worldMatrix, subPoints, bsArray) {
    this.gl.useProgram(this.program)
    this.gl.uniformMatrix4fv(this.gl.getUniformLocation(this.program, 'gWorld0'), false, worldMatrix)
    this.gl.uniform2fv(this.gl.getUniformLocation(this.program, 'vertBuffer'), subPoints)
    this.gl.uniform1fv(this.gl.getUniformLocation(this.program, 'bsVec'), bsArray)
    this.gl.uniformMatrix4fv(this.gl.getUniformLocation(this.program, 'gProjection'), false, ORTHO_MATRIX)

    this.gl.enable(this.gl.DEPTH_TEST)
    this.gl.enable(this.gl.BLEND)
    this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA)
    this.gl.enable(this.gl.CULL_FACE)
    this.gl.cullFace(this.gl.BACK)
    this.gl.frontFace(this.gl.CW)
    this.gl.clearColor(0.5, 0.5, 0.5, 0)
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT)

    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer)
    this.gl.drawElements(this.gl.TRIANGLES, this.objData.faces.length, this.gl.UNSIGNED_SHORT, 0)
    this.gl.readPixels(
      0,
      0,
      this.gl.drawingBufferWidth,
      this.gl.drawingBufferHeight,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      this.pixelsFbo,
    )
  }
}
