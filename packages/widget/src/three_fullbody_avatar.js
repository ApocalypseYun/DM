const THREE_MODULE_URL = new URL('./vendor/three/three.module.js', import.meta.url).toString()
const GLTF_LOADER_URL = new URL('./vendor/three/GLTFLoader.js', import.meta.url).toString()

let runtimePromise = null

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function buildRegexMatcher(patterns) {
  const regex = new RegExp(patterns.join('|'), 'i')
  return (text) => regex.test(text)
}

const isHeadLike = buildRegexMatcher(['head', 'face'])
const isNeckLike = buildRegexMatcher(['neck'])
const isTorsoLike = buildRegexMatcher(['spine', 'torso', 'body', 'chest'])
const isRightArmLike = buildRegexMatcher(['upperarm\\.r', 'rightarm', 'arm_r', 'r_arm'])
const isLeftArmLike = buildRegexMatcher(['upperarm\\.l', 'leftarm', 'arm_l', 'l_arm'])
const isJawMorphLike = buildRegexMatcher(['jaw', 'mouth', 'viseme', '^a$', '^o$', '^aa$', 'open'])

async function loadRuntime() {
  if (!runtimePromise) {
    runtimePromise = (async () => {
      const THREE = await import(THREE_MODULE_URL)
      const { GLTFLoader } = await import(GLTF_LOADER_URL)
      return { THREE, GLTFLoader }
    })()
  }
  return runtimePromise
}

function pickIdleClip(animations) {
  if (!animations.length) {
    return null
  }
  return (
    animations.find((clip) => /idle|stand|breath/i.test(clip.name)) ??
    animations.find((clip) => /yes|no|wave/i.test(clip.name)) ??
    animations[0]
  )
}

export class ThreeFullBodyAvatar {
  constructor(stageEl, options = {}) {
    this.stageEl = stageEl
    this.options = {
      modelUrl: options.modelUrl || '/widget/models/RobotExpressive.glb',
    }

    this.THREE = null
    this.renderer = null
    this.scene = null
    this.camera = null
    this.clock = null
    this.mixer = null
    this.idleAction = null
    this.model = null
    this.canvas = null

    this.faceMesh = null
    this.mouthMorphIndex = -1
    this.headBone = null
    this.neckBone = null
    this.torsoBone = null
    this.rightArmBone = null
    this.leftArmBone = null
    this.baseBoneState = new Map()

    this.state = 'idle'
    this.targetMouthLevel = 0
    this.currentMouthLevel = 0
    this.time = 0

    this.resizeObserver = null
    this.rafId = 0
    this.destroyed = false

    this._renderLoop = this._renderLoop.bind(this)
    this._handleResize = this._handleResize.bind(this)
  }

  async init() {
    const { THREE, GLTFLoader } = await loadRuntime()
    if (this.destroyed) {
      return
    }

    this.THREE = THREE
    this._renderShell()
    this._initializeScene()

    const loader = new GLTFLoader()
    const gltf = await new Promise((resolve, reject) => {
      loader.load(this.options.modelUrl, resolve, undefined, reject)
    })

    if (this.destroyed) {
      return
    }

    this.model = gltf.scene
    this.scene.add(this.model)
    this._fitModelToStage()
    this._bindRigNodes()
    this._initializeAnimations(gltf.animations || [])

    this._handleResize()
    if (typeof ResizeObserver === 'function') {
      this.resizeObserver = new ResizeObserver(this._handleResize)
      this.resizeObserver.observe(this.stageEl)
    } else {
      window.addEventListener('resize', this._handleResize)
    }

    this.rafId = requestAnimationFrame(this._renderLoop)
  }

  setState(nextState) {
    this.state = nextState
  }

  setMouthLevel(level) {
    this.targetMouthLevel = clamp(Number(level) || 0, 0, 1)
  }

  pushAudioChunk(_audioBuffer) {
    // 3D renderer uses playback level-driven lip sync.
  }

  clearAudio() {
    this.targetMouthLevel = 0
  }

  destroy() {
    this.destroyed = true
    if (this.rafId) {
      cancelAnimationFrame(this.rafId)
      this.rafId = 0
    }

    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
      this.resizeObserver = null
    } else {
      window.removeEventListener('resize', this._handleResize)
    }

    if (this.mixer) {
      this.mixer.stopAllAction()
      this.mixer = null
    }

    if (this.model) {
      this.model.traverse((node) => {
        if (node.geometry) {
          node.geometry.dispose?.()
        }
        if (node.material) {
          if (Array.isArray(node.material)) {
            node.material.forEach((material) => material.dispose?.())
          } else {
            node.material.dispose?.()
          }
        }
      })
    }

    if (this.renderer) {
      this.renderer.dispose()
      this.renderer.forceContextLoss?.()
    }

    if (this.canvas) {
      this.canvas.remove()
      this.canvas = null
    }
  }

  _renderShell() {
    this.stageEl.innerHTML = '<div class="dh-three-shell"><canvas class="dh-three-canvas"></canvas></div>'
    this.canvas = this.stageEl.querySelector('.dh-three-canvas')
    if (!this.canvas) {
      throw new Error('Failed to create three.js canvas')
    }
  }

  _initializeScene() {
    this.scene = new this.THREE.Scene()
    this.scene.background = null

    const ambient = new this.THREE.HemisphereLight(0xffffff, 0x2a3442, 1.05)
    const keyLight = new this.THREE.DirectionalLight(0xffffff, 1.15)
    keyLight.position.set(1.2, 2.4, 2.2)
    const fillLight = new this.THREE.DirectionalLight(0x9dc5ff, 0.6)
    fillLight.position.set(-1.4, 1.2, 0.4)

    this.scene.add(ambient, keyLight, fillLight)

    this.camera = new this.THREE.PerspectiveCamera(28, 1, 0.1, 100)
    this.camera.position.set(0, 1.28, 4.2)
    this.camera.lookAt(0, 1.08, 0)

    this.renderer = new this.THREE.WebGLRenderer({
      canvas: this.canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'high-performance',
    })
    this.renderer.setClearAlpha(0)
    this.renderer.outputColorSpace = this.THREE.SRGBColorSpace
    this.renderer.toneMapping = this.THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 1.0

    this.clock = new this.THREE.Clock()
  }

  _fitModelToStage() {
    const box = new this.THREE.Box3().setFromObject(this.model)
    const size = box.getSize(new this.THREE.Vector3())
    const center = box.getCenter(new this.THREE.Vector3())
    const safeHeight = Math.max(size.y, 0.001)
    const targetHeight = 2.2
    const scale = targetHeight / safeHeight
    this.model.scale.setScalar(scale)

    const scaledBox = new this.THREE.Box3().setFromObject(this.model)
    const scaledCenter = scaledBox.getCenter(new this.THREE.Vector3())
    const minY = scaledBox.min.y
    this.model.position.x -= scaledCenter.x
    this.model.position.y -= minY
    this.model.position.z -= scaledCenter.z
    this.model.position.z -= 0.2
  }

  _bindRigNodes() {
    let firstMorphMesh = null
    let preferredMorphMesh = null

    this.model.traverse((node) => {
      if (node.isBone) {
        this._maybeBindBone(node)
        return
      }
      if (!node.isMesh && !node.isSkinnedMesh) {
        return
      }
      if (Array.isArray(node.morphTargetInfluences) && node.morphTargetInfluences.length > 0) {
        firstMorphMesh ??= node
        if (isHeadLike(node.name || '')) {
          preferredMorphMesh = node
        }
      }
    })

    this.faceMesh = preferredMorphMesh ?? firstMorphMesh
    if (this.faceMesh) {
      this.mouthMorphIndex = this._pickMouthMorphIndex(this.faceMesh)
    }

    this._captureBaseBoneState(this.torsoBone)
    this._captureBaseBoneState(this.neckBone)
    this._captureBaseBoneState(this.headBone)
    this._captureBaseBoneState(this.rightArmBone)
    this._captureBaseBoneState(this.leftArmBone)
  }

  _maybeBindBone(node) {
    const name = String(node.name || '')
    if (!this.headBone && isHeadLike(name)) {
      this.headBone = node
      return
    }
    if (!this.neckBone && isNeckLike(name)) {
      this.neckBone = node
      return
    }
    if (!this.torsoBone && isTorsoLike(name)) {
      this.torsoBone = node
      return
    }
    if (!this.rightArmBone && isRightArmLike(name)) {
      this.rightArmBone = node
      return
    }
    if (!this.leftArmBone && isLeftArmLike(name)) {
      this.leftArmBone = node
    }
  }

  _captureBaseBoneState(bone) {
    if (!bone || this.baseBoneState.has(bone)) {
      return
    }
    this.baseBoneState.set(bone, {
      x: bone.rotation.x,
      y: bone.rotation.y,
      z: bone.rotation.z,
    })
  }

  _pickMouthMorphIndex(mesh) {
    const dictionary = mesh.morphTargetDictionary || {}
    const names = Object.keys(dictionary)
    if (!names.length) {
      return mesh.morphTargetInfluences.length > 0 ? 0 : -1
    }
    const preferred = names.find((name) => isJawMorphLike(name))
    if (preferred) {
      return dictionary[preferred]
    }
    return dictionary[names[0]]
  }

  _initializeAnimations(animations) {
    if (!animations.length) {
      return
    }
    this.mixer = new this.THREE.AnimationMixer(this.model)
    const idleClip = pickIdleClip(animations)
    if (!idleClip) {
      return
    }
    this.idleAction = this.mixer.clipAction(idleClip)
    this.idleAction.reset()
    this.idleAction.enabled = true
    this.idleAction.setLoop(this.THREE.LoopRepeat, Infinity)
    this.idleAction.fadeIn(0.2)
    this.idleAction.play()
  }

  _handleResize() {
    if (!this.renderer || !this.camera || this.destroyed) {
      return
    }
    const width = Math.max(1, Math.floor(this.stageEl.clientWidth))
    const height = Math.max(1, Math.floor(this.stageEl.clientHeight))
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
    this.renderer.setSize(width, height, false)
    this.camera.aspect = width / height
    this.camera.updateProjectionMatrix()
  }

  _renderLoop() {
    if (this.destroyed) {
      return
    }

    const dt = this.clock?.getDelta() ?? 0.016
    this.time += dt
    this.mixer?.update(dt)

    this.currentMouthLevel += (this.targetMouthLevel - this.currentMouthLevel) * 0.35
    this._applyLipSync()
    this._applyBodyMotion()

    this.renderer?.render(this.scene, this.camera)
    this.rafId = requestAnimationFrame(this._renderLoop)
  }

  _applyLipSync() {
    const mouth = clamp(this.currentMouthLevel, 0, 1)

    if (this.faceMesh && this.mouthMorphIndex >= 0 && this.faceMesh.morphTargetInfluences) {
      this.faceMesh.morphTargetInfluences[this.mouthMorphIndex] = mouth * 0.95
    }

    if (this.headBone) {
      const base = this.baseBoneState.get(this.headBone)
      if (base) {
        this.headBone.rotation.x = base.x + mouth * 0.08
      }
    }
  }

  _applyBodyMotion() {
    const speaking = this.state === 'speaking'
    const thinking = this.state === 'thinking'
    const listening = this.state === 'listening'

    const speechPulse = speaking ? 1 : 0
    const torsoAmplitude = speaking ? 0.06 : thinking ? 0.03 : 0.012
    const neckAmplitude = speaking ? 0.03 : listening ? 0.02 : 0.01
    const armAmplitude = speaking ? 0.16 : thinking ? 0.08 : 0.02

    if (this.torsoBone) {
      const base = this.baseBoneState.get(this.torsoBone)
      if (base) {
        this.torsoBone.rotation.z = base.z + Math.sin(this.time * 1.8) * torsoAmplitude
        this.torsoBone.rotation.y = base.y + Math.sin(this.time * 1.1) * torsoAmplitude * 0.45
      }
    }

    if (this.neckBone) {
      const base = this.baseBoneState.get(this.neckBone)
      if (base) {
        this.neckBone.rotation.x = base.x + Math.sin(this.time * 2.2) * neckAmplitude
      }
    }

    if (this.rightArmBone) {
      const base = this.baseBoneState.get(this.rightArmBone)
      if (base) {
        this.rightArmBone.rotation.z = base.z + Math.sin(this.time * 3.4) * armAmplitude * (0.6 + speechPulse * 0.4)
      }
    }

    if (this.leftArmBone) {
      const base = this.baseBoneState.get(this.leftArmBone)
      if (base) {
        this.leftArmBone.rotation.z = base.z - Math.sin(this.time * 2.9 + 0.8) * armAmplitude * 0.55
      }
    }
  }
}
