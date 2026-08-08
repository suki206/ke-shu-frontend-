/**
 * MemoryDeepSpace — 星尘 · REVERIE 视图态
 *
 * 一片可航行的记忆深空。每颗粒子是一条真实记忆：
 *   位置   按新近度分层，越新越靠近盘心，越旧越沉向外缘
 *   亮度   由 fadeLevel 驱动（淡忘的本就该几乎看不见）
 *   颜色   由 valence 驱动，全程在冷—青之间，不进暖区
 *   暖核   只有高 importance 的记忆才会在核心染上一点琥珀
 *   呼吸   由 arousal 驱动，唤醒度越高起伏越快
 *   拖尾   每颗粒子沿自己的轨道极慢公转，身后拖一段渐隐的弧
 *
 * 实现上跟旧版最大的差别：旧版给每条记忆挂一个 <mesh> + 一个 useFrame，
 * 记忆一多就是几百个逐帧回调 + 几百次 draw call。这里合并成一个
 * THREE.Points（自定义 shader）+ 一个 LineSegments，无论多少条记忆
 * 都只有两次绘制、一个逐帧回调。手机上能稳住帧率，动效才敢做慢。
 *
 * 拾取仍然精确：位置是 CPU 每帧写回 attribute 的，raycaster 读到的
 * 就是眼睛看到的位置，不存在 shader 里动、点击却打在原位的错位。
 */
import { useMemo, useRef, useEffect, useState, useCallback } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import * as THREE from 'three'
import {
  clamp, hashSeed, mulberry32,
  valenceRGB01, WARM_CORE,
  importanceNormSafe, warmth, matchMemory, daysOf, daysForPlot,
} from './dustCommon'

// ── 深空的三套底色（跟随全局主题，但始终保持"深"）────────────
const SPACE = {
  noir: { bg: '#000002', nebA: '#141a2e', nebB: '#2b2442', star: '#e8e6ff' },
  mist: { bg: '#010208', nebA: '#0d1b34', nebB: '#183048', star: '#d8ecff' },
  warm: { bg: '#060300', nebA: '#241a11', nebB: '#3b2a17', star: '#ffefcf' },
}

const CAM_KEY = 'presence.dust.camera.v1'
const HOME_POS = [0, 1.6, 11.5]
const SCRATCH_V = new THREE.Vector3()
const TRAIL_SEGS = 5       // 每条尾迹的段数
const TRAIL_SPAN = 5.0     // 尾迹总回溯时长（秒），越长弧越明显

// ── 视角持久化 ────────────────────────────────────────────────
function loadCam() {
  try {
    const o = JSON.parse(localStorage.getItem(CAM_KEY) || 'null')
    if (o && Array.isArray(o.p) && o.p.length === 3 && Array.isArray(o.t) && o.t.length === 3
        && o.p.every(Number.isFinite) && o.t.every(Number.isFinite)) return o
  } catch {}
  return null
}
function saveCam(camera, controls) {
  try {
    localStorage.setItem(CAM_KEY, JSON.stringify({
      p: [camera.position.x, camera.position.y, camera.position.z],
      t: [controls.target.x, controls.target.y, controls.target.z],
    }))
  } catch {}
}

// ── 轨道布局：同一条记忆每次进来位置都一样 ────────────────────
function buildLayouts(memories) {
  return memories.map((mem, i) => {
    const rnd = mulberry32(hashSeed(mem.bucketId || `idx-${i}`))
    const days = daysForPlot(mem)
    const nd = clamp(days / 21, 0, 1)

    const radius = 2.7 + nd * 6.1 + rnd() * 0.75
    const theta0 = rnd() * Math.PI * 2
    // 盘面很薄，越外圈越厚一点，像真实星系的翘曲
    const height = (rnd() - 0.5) * 2 * (0.85 + nd * 1.9)
    // 较差自转：内圈快、外圈慢，整体极慢（外圈一圈要几分钟）
    const omega = (0.052 / (0.62 + radius * 0.2)) * (0.78 + rnd() * 0.44)
    return {
      radius, theta0, height, omega,
      bobPhase: rnd() * Math.PI * 2,
      bobAmp: 0.05 + rnd() * 0.09,
      phase: rnd() * Math.PI * 2,
    }
  })
}
function posAt(L, t, out) {
  const ang = L.theta0 + L.omega * t
  out[0] = Math.cos(ang) * L.radius
  out[1] = L.height + Math.sin(t * 0.17 + L.bobPhase) * L.bobAmp
  out[2] = Math.sin(ang) * L.radius
  return out
}

// ── 记忆粒子 shader ───────────────────────────────────────────
const PARTICLE_VERT = /* glsl */`
attribute vec3  aColor;
attribute float aSize;
attribute float aOpacity;
attribute float aPhase;
attribute float aSpeed;
attribute float aArousal;
attribute float aWarm;
attribute float aMatch;
attribute float aSelected;

uniform float uTime;
uniform float uScale;
uniform float uSearch;

varying vec3  vColor;
varying float vAlpha;
varying float vWarm;

void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);

  float pulse = sin(uTime * aSpeed + aPhase) * (0.11 + aArousal * 0.25) + 1.0;
  float alpha = aOpacity * pulse;
  float size  = aSize;

  if (uSearch > 0.5) {
    if (aMatch > 0.5) {
      float p = sin(uTime * 3.1 + aPhase) * 0.5 + 0.5;
      alpha = min(1.0, alpha + 0.42 + p * 0.40);
      size *= 1.75 + p * 0.55;
    } else {
      alpha *= 0.07;
      size  *= 0.7;
    }
  }
  if (aSelected > 0.5) {
    alpha = min(1.0, alpha + 0.55);
    size *= 1.7;
  }

  vColor = aColor;
  vAlpha = clamp(alpha, 0.0, 1.0);
  vWarm  = aWarm;

  gl_PointSize = min(170.0, size * uScale / max(0.001, -mv.z));
  gl_Position  = projectionMatrix * mv;
}
`

const PARTICLE_FRAG = /* glsl */`
uniform vec3 uWarmCore;
varying vec3  vColor;
varying float vAlpha;
varying float vWarm;

void main() {
  vec2 uv = gl_PointCoord - 0.5;
  float d = length(uv);
  if (d > 0.5) discard;

  // 核心 + 外晕两段衰减：核心实、光晕软，边缘完全化开，不出现硬圆盘
  float core = smoothstep(0.17, 0.0, d);
  float halo = pow(max(0.0, 1.0 - d * 2.0), 2.6);

  vec3 col = mix(vColor, uWarmCore, vWarm * core * 0.92);
  float a  = (halo * 0.5 + core * 0.95) * vAlpha;

  gl_FragColor = vec4(col * (0.72 + core * 0.75), a);
}
`

// ── 引导星流 shader（记忆稀少时的装饰，不可拾取）──────────────
const GUIDE_VERT = /* glsl */`
attribute float aSeed;
uniform float uTime;
uniform float uScale;
varying float vAlpha;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  float tw = sin(uTime * (0.5 + aSeed * 0.8) + aSeed * 12.0) * 0.5 + 0.5;
  vAlpha = 0.10 + tw * 0.22;
  gl_PointSize = min(60.0, (0.045 + aSeed * 0.035) * uScale / max(0.001, -mv.z));
  gl_Position = projectionMatrix * mv;
}
`
const GUIDE_FRAG = /* glsl */`
uniform vec3 uColor;
varying float vAlpha;
void main() {
  float d = length(gl_PointCoord - 0.5);
  if (d > 0.5) discard;
  float a = pow(max(0.0, 1.0 - d * 2.0), 2.2) * vAlpha;
  gl_FragColor = vec4(uColor, a);
}
`

// ── 星云雾：一颗巨大的内翻球，三层 value noise，极淡 ──────────
const NEBULA_VERT = /* glsl */`
varying vec3 vPos;
void main() {
  vPos = position;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`
const NEBULA_FRAG = /* glsl */`
uniform float uTime;
uniform vec3  uA;
uniform vec3  uB;
uniform float uIntensity;
varying vec3 vPos;

float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453123); }
float vnoise(vec3 x) {
  vec3 i = floor(x), f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float n000 = hash(i), n100 = hash(i + vec3(1,0,0));
  float n010 = hash(i + vec3(0,1,0)), n110 = hash(i + vec3(1,1,0));
  float n001 = hash(i + vec3(0,0,1)), n101 = hash(i + vec3(1,0,1));
  float n011 = hash(i + vec3(0,1,1)), n111 = hash(i + vec3(1,1,1));
  return mix(mix(mix(n000,n100,f.x), mix(n010,n110,f.x), f.y),
             mix(mix(n001,n101,f.x), mix(n011,n111,f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float s = 0.0, a = 0.55;
  for (int i = 0; i < 3; i++) { s += a * vnoise(p); p *= 2.07; a *= 0.5; }
  return s;
}

void main() {
  vec3 dir = normalize(vPos);
  vec3 q = dir * 1.85 + vec3(uTime * 0.006, uTime * 0.009, uTime * 0.004);
  float n = smoothstep(0.40, 0.94, fbm(q));
  // 靠近盘面更浓，天顶天底几乎干净，避免整颗球糊成一片
  float band = smoothstep(0.92, 0.02, abs(dir.y));
  vec3 col = mix(uA, uB, clamp(n * 1.3, 0.0, 1.0));
  gl_FragColor = vec4(col, n * band * uIntensity);
}
`

/** 主题是在页面里随时可切的，clearColor 只在 onCreated 设一次会留在旧底色上 */
function ClearColor({ color }) {
  const gl = useThree(s => s.gl)
  useEffect(() => { gl.setClearColor(color, 1) }, [gl, color])
  return null
}

function NebulaVeil({ colorA, colorB, intensity = 0.5 }) {
  const mat = useMemo(() => new THREE.ShaderMaterial({
    vertexShader: NEBULA_VERT,
    fragmentShader: NEBULA_FRAG,
    uniforms: {
      uTime: { value: 0 },
      uA: { value: new THREE.Color(colorA) },
      uB: { value: new THREE.Color(colorB) },
      uIntensity: { value: intensity },
    },
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }), [colorA, colorB, intensity])

  const geo = useMemo(() => new THREE.SphereGeometry(46, 32, 20), [])
  useEffect(() => () => { mat.dispose(); geo.dispose() }, [mat, geo])
  useFrame(({ clock }) => { mat.uniforms.uTime.value = clock.getElapsedTime() })

  return <mesh geometry={geo} material={mat} renderOrder={-10} frustumCulled={false} />
}

// ── 引导星流：记忆越少，星流越明显，给空场一个"往哪看"的指向 ──
function GuideStream({ count, color }) {
  const built = useMemo(() => {
    if (count <= 0) return null
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-11, -3.2, -7),
      new THREE.Vector3(-5.5, 1.4, -2.6),
      new THREE.Vector3(0.4, -0.9, 1.8),
      new THREE.Vector3(5.8, 2.1, -1.4),
      new THREE.Vector3(10.4, -1.8, -6.2),
    ], false, 'catmullrom', 0.5)

    const pos = new Float32Array(count * 3)
    const seed = new Float32Array(count)
    const us = new Float32Array(count)
    const spread = new Float32Array(count * 3)
    const rnd = mulberry32(20260808)
    for (let i = 0; i < count; i++) {
      us[i] = rnd()
      seed[i] = rnd()
      spread[i * 3]     = (rnd() - 0.5) * 1.9
      spread[i * 3 + 1] = (rnd() - 0.5) * 1.1
      spread[i * 3 + 2] = (rnd() - 0.5) * 1.9
    }
    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1))
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 20)

    const mat = new THREE.ShaderMaterial({
      vertexShader: GUIDE_VERT,
      fragmentShader: GUIDE_FRAG,
      uniforms: { uTime: { value: 0 }, uScale: { value: 700 }, uColor: { value: new THREE.Color(color) } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    })
    const points = new THREE.Points(geo, mat)
    points.frustumCulled = false
    points.raycast = () => null   // 装饰物，不参与拾取
    return { curve, geo, mat, points, us, spread, pos }
  }, [count, color])

  useEffect(() => () => { if (built) { built.geo.dispose(); built.mat.dispose() } }, [built])

  useFrame(({ clock, size, viewport, camera }) => {
    if (!built) return
    const t = clock.getElapsedTime()
    built.mat.uniforms.uTime.value = t
    built.mat.uniforms.uScale.value =
      (size.height * (viewport.dpr || 1)) / (2 * Math.tan((camera.fov * Math.PI) / 360))

    const v = SCRATCH_V
    for (let i = 0; i < built.us.length; i++) {
      const u = (built.us[i] + t * 0.011) % 1
      built.curve.getPoint(u, v)
      built.pos[i * 3]     = v.x + built.spread[i * 3]
      built.pos[i * 3 + 1] = v.y + built.spread[i * 3 + 1]
      built.pos[i * 3 + 2] = v.z + built.spread[i * 3 + 2]
    }
    built.geo.attributes.position.needsUpdate = true
  })

  if (!built) return null
  return <primitive object={built.points} />
}

// ── 记忆本体：粒子场 + 尾迹 ───────────────────────────────────
function MemoryField({ memories, layouts, searchQuery, selectedBucketId, onSelect, clockRef }) {
  const built = useMemo(() => {
    const n = memories.length
    const position = new Float32Array(n * 3)
    const aColor = new Float32Array(n * 3)
    const aSize = new Float32Array(n)
    const aOpacity = new Float32Array(n)
    const aPhase = new Float32Array(n)
    const aSpeed = new Float32Array(n)
    const aArousal = new Float32Array(n)
    const aWarm = new Float32Array(n)
    const aMatch = new Float32Array(n)
    const aSelected = new Float32Array(n)

    memories.forEach((mem, i) => {
      const [r, g, b] = valenceRGB01(mem.valence)
      aColor[i * 3] = r; aColor[i * 3 + 1] = g; aColor[i * 3 + 2] = b

      const imp = importanceNormSafe(mem)
      aSize[i] = 0.10 + imp * 0.17
      // 淡忘的记忆不是消失，是变透明、变遥远
      aOpacity[i] = Math.max(0.05, 1 - clamp(mem.fadeLevel ?? 0.5, 0, 1)) * 0.92
      aPhase[i] = layouts[i].phase
      aSpeed[i] = 0.34 + (Number.isFinite(mem.arousal) ? Math.abs(mem.arousal) : 0.35) * 0.55
      aArousal[i] = Number.isFinite(mem.arousal) ? clamp(Math.abs(mem.arousal), 0, 1) : 0.35
      // 暖核只给 7 分及以上的那一小撮，6 分及以下完全不染色
      aWarm[i] = warmth(mem)
    })

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(position, 3))
    geo.setAttribute('aColor', new THREE.BufferAttribute(aColor, 3))
    geo.setAttribute('aSize', new THREE.BufferAttribute(aSize, 1))
    geo.setAttribute('aOpacity', new THREE.BufferAttribute(aOpacity, 1))
    geo.setAttribute('aPhase', new THREE.BufferAttribute(aPhase, 1))
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(aSpeed, 1))
    geo.setAttribute('aArousal', new THREE.BufferAttribute(aArousal, 1))
    geo.setAttribute('aWarm', new THREE.BufferAttribute(aWarm, 1))
    geo.setAttribute('aMatch', new THREE.BufferAttribute(aMatch, 1))
    geo.setAttribute('aSelected', new THREE.BufferAttribute(aSelected, 1))
    // 手动给一个足够大的包围球：位置每帧都在变，交给 three 自己算会
    // 每帧重算一次；固定住既省算力，又保证 raycaster 不会误判剔除
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 16)

    const mat = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VERT,
      fragmentShader: PARTICLE_FRAG,
      uniforms: {
        uTime: { value: 0 },
        uScale: { value: 700 },
        uSearch: { value: 0 },
        uWarmCore: { value: new THREE.Color(WARM_CORE[0] / 255, WARM_CORE[1] / 255, WARM_CORE[2] / 255) },
      },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    })
    const points = new THREE.Points(geo, mat)
    points.frustumCulled = false

    // 尾迹：每颗粒子 TRAIL_SEGS 段线，颜色里直接烘焙渐隐
    const tCount = n * TRAIL_SEGS * 2
    const tPos = new Float32Array(tCount * 3)
    const tCol = new Float32Array(tCount * 3)
    const tGeo = new THREE.BufferGeometry()
    tGeo.setAttribute('position', new THREE.BufferAttribute(tPos, 3))
    tGeo.setAttribute('color', new THREE.BufferAttribute(tCol, 3))
    tGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 16)
    const tMat = new THREE.LineBasicMaterial({
      vertexColors: true, transparent: true, opacity: 0.85,
      depthWrite: false, blending: THREE.AdditiveBlending,
    })
    const lines = new THREE.LineSegments(tGeo, tMat)
    lines.frustumCulled = false
    lines.raycast = () => null

    return { geo, mat, points, tGeo, tMat, lines, tPos, tCol, aColor, aOpacity, position }
  }, [memories, layouts])

  useEffect(() => () => {
    built.geo.dispose(); built.mat.dispose(); built.tGeo.dispose(); built.tMat.dispose()
  }, [built])

  // 搜索命中 / 选中态：只改两个 attribute，不重建几何
  useEffect(() => {
    const q = (searchQuery || '').trim()
    const mAttr = built.geo.attributes.aMatch
    const sAttr = built.geo.attributes.aSelected
    memories.forEach((mem, i) => {
      mAttr.array[i] = q && matchMemory(mem, q) ? 1 : 0
      sAttr.array[i] = mem.bucketId && mem.bucketId === selectedBucketId ? 1 : 0
    })
    mAttr.needsUpdate = true
    sAttr.needsUpdate = true
    built.mat.uniforms.uSearch.value = q ? 1 : 0
  }, [built, memories, searchQuery, selectedBucketId])

  const tmp = useMemo(() => [0, 0, 0], [])
  const tmp2 = useMemo(() => [0, 0, 0], [])

  useFrame(({ clock, size, viewport, camera, raycaster }) => {
    const t = clock.getElapsedTime()
    if (clockRef) clockRef.current = t

    built.mat.uniforms.uTime.value = t
    built.mat.uniforms.uScale.value =
      (size.height * (viewport.dpr || 1)) / (2 * Math.tan((camera.fov * Math.PI) / 360))

    // 拾取半径随距离放大：远景时点很小，固定阈值在手机上几乎点不中
    const dist = camera.position.length()
    raycaster.params.Points.threshold = clamp(dist * 0.034, 0.16, 0.72)

    const { position, tPos, tCol, aColor, aOpacity } = built
    const dt = TRAIL_SPAN / TRAIL_SEGS
    const q = built.mat.uniforms.uSearch.value > 0.5
    const mArr = built.geo.attributes.aMatch.array

    for (let i = 0; i < layouts.length; i++) {
      const L = layouts[i]
      posAt(L, t, tmp)
      position[i * 3] = tmp[0]; position[i * 3 + 1] = tmp[1]; position[i * 3 + 2] = tmp[2]

      // 尾迹亮度：跟着粒子本身的可见度走，搜索时非命中项一起隐掉
      let base = aOpacity[i] * 0.42
      if (q) base *= mArr[i] > 0.5 ? 2.1 : 0.06
      const cr = aColor[i * 3], cg = aColor[i * 3 + 1], cb = aColor[i * 3 + 2]

      let px = tmp[0], py = tmp[1], pz = tmp[2]
      for (let s = 0; s < TRAIL_SEGS; s++) {
        posAt(L, t - (s + 1) * dt, tmp2)
        const vi = (i * TRAIL_SEGS + s) * 2
        tPos[vi * 3] = px; tPos[vi * 3 + 1] = py; tPos[vi * 3 + 2] = pz
        tPos[(vi + 1) * 3] = tmp2[0]; tPos[(vi + 1) * 3 + 1] = tmp2[1]; tPos[(vi + 1) * 3 + 2] = tmp2[2]

        const f0 = base * (1 - s / TRAIL_SEGS)
        const f1 = base * (1 - (s + 1) / TRAIL_SEGS)
        tCol[vi * 3] = cr * f0; tCol[vi * 3 + 1] = cg * f0; tCol[vi * 3 + 2] = cb * f0
        tCol[(vi + 1) * 3] = cr * f1; tCol[(vi + 1) * 3 + 1] = cg * f1; tCol[(vi + 1) * 3 + 2] = cb * f1

        px = tmp2[0]; py = tmp2[1]; pz = tmp2[2]
      }
    }
    built.geo.attributes.position.needsUpdate = true
    built.tGeo.attributes.position.needsUpdate = true
    built.tGeo.attributes.color.needsUpdate = true
  })

  // Points 的 intersections 按"沿射线的深度"排序，不是按"离射线多近"，
  // 密集处会点中身后那颗。这里改成取离射线最近的一颗。
  const pick = useCallback((e) => {
    const hits = (e.intersections || []).filter(h => h.object === built.points && Number.isInteger(h.index))
    if (!hits.length) return -1
    let best = hits[0]
    for (const h of hits) {
      if ((h.distanceToRay ?? Infinity) < (best.distanceToRay ?? Infinity)) best = h
    }
    return best.index
  }, [built])

  return (
    <>
      <primitive object={built.lines} />
      <primitive
        object={built.points}
        onClick={(e) => {
          e.stopPropagation()
          const i = pick(e)
          if (i >= 0 && memories[i]) onSelect(memories[i])
        }}
        onPointerOver={(e) => { e.stopPropagation(); document.body.style.cursor = 'pointer' }}
        onPointerOut={() => { document.body.style.cursor = '' }}
      />
    </>
  )
}

// ── 相机导演：恢复视角、保存视角、平滑飞行 ────────────────────
function Director({ flight, onSettle }) {
  const controls = useThree(s => s.controls)
  const camera = useThree(s => s.camera)
  const restored = useRef(false)
  const userActive = useRef(false)
  const job = useRef(null)
  const settle = useRef(onSettle)
  useEffect(() => { settle.current = onSettle }, [onSettle])

  useEffect(() => {
    if (!controls || restored.current) return
    restored.current = true
    const saved = loadCam()
    if (saved) {
      camera.position.set(saved.p[0], saved.p[1], saved.p[2])
      controls.target.set(saved.t[0], saved.t[1], saved.t[2])
      controls.update()
    }
  }, [controls, camera])

  useEffect(() => {
    if (!controls) return
    let timer = null
    const onStart = () => {
      // 用户一动手就交还控制权：飞行中断，自转状态也要跟着复位，
      // 否则 flying 会永远停在 true，自动漫游再也不会启动
      userActive.current = true
      if (job.current) { job.current = null; if (settle.current) settle.current() }
    }
    const onEnd = () => {
      userActive.current = false
      clearTimeout(timer)
      timer = setTimeout(() => saveCam(camera, controls), 280)
    }
    controls.addEventListener('start', onStart)
    controls.addEventListener('end', onEnd)
    return () => {
      controls.removeEventListener('start', onStart)
      controls.removeEventListener('end', onEnd)
      clearTimeout(timer)
      saveCam(camera, controls)
    }
  }, [controls, camera])

  useEffect(() => {
    if (!flight || !controls) return
    const target = new THREE.Vector3(...(flight.target || [0, 0, 0]))
    const dir = new THREE.Vector3().subVectors(camera.position, target)
    if (dir.lengthSq() < 1e-6) dir.set(0, 0.16, 1)
    dir.normalize()
    const dest = flight.home
      ? new THREE.Vector3(...HOME_POS)
      : target.clone().addScaledVector(dir, flight.distance ?? 3.1)
    job.current = { target, dest, until: performance.now() + 7000 }
  }, [flight, controls, camera])

  useFrame(() => {
    const j = job.current
    if (!j || !controls || userActive.current) return
    // 0.032 / 0.042 是刻意慢的：推近应该像"沉下去"，不是"跳过去"
    camera.position.lerp(j.dest, 0.032)
    controls.target.lerp(j.target, 0.042)
    controls.update()
    const done = camera.position.distanceTo(j.dest) < 0.07 && controls.target.distanceTo(j.target) < 0.07
    if (done || performance.now() > j.until) {
      job.current = null
      saveCam(camera, controls)
      if (settle.current) settle.current()
    }
  })

  return null
}

// ── 外壳 ──────────────────────────────────────────────────────
const MemoryDeepSpace = ({
  memories = [], searchQuery = '', selectedBucketId = null,
  onSelect, theme = 'noir', bg,
}) => {
  const pal = SPACE[theme] || SPACE.noir
  const clearColor = bg || pal.bg

  const layouts = useMemo(() => buildLayouts(memories), [memories])
  const clockRef = useRef(0)
  const [flight, setFlight] = useState(null)
  const [flying, setFlying] = useState(false)

  const flyTo = useCallback((target, distance) => {
    setFlight({ target, distance, home: false, n: Date.now() })
    setFlying(true)
  }, [])

  // 点击记忆 → 相机缓慢推近到那颗粒子。
  // 记住上一次飞过的 bucketId：记忆列表刷新会让 memories/layouts 换掉引用，
  // 不加这个守卫的话，后台一刷新相机就会重新推一次，很晕。
  const flownRef = useRef(null)
  useEffect(() => {
    if (!selectedBucketId) { flownRef.current = null; return }
    if (flownRef.current === selectedBucketId) return
    const i = memories.findIndex(m => m.bucketId === selectedBucketId)
    if (i < 0 || !layouts[i]) return
    flownRef.current = selectedBucketId
    flyTo(posAt(layouts[i], clockRef.current, [0, 0, 0]), 2.9)
  }, [selectedBucketId, memories, layouts, flyTo])

  const focusRecent = useCallback(() => {
    if (!memories.length) return
    let best = 0, bestDays = Infinity
    memories.forEach((m, i) => {
      const d = daysOf(m)
      const v = d === null ? 9999 : d
      if (v < bestDays) { bestDays = v; best = i }
    })
    if (!layouts[best]) return
    flyTo(posAt(layouts[best], clockRef.current, [0, 0, 0]), 3.2)
    if (onSelect) onSelect(memories[best])
  }, [memories, layouts, flyTo, onSelect])

  const resetView = useCallback(() => {
    setFlight({ target: [0, 0, 0], home: true, n: Date.now() })
    setFlying(true)
    try { localStorage.removeItem(CAM_KEY) } catch {}
  }, [])

  // 记忆越少，引导星流越密——空场不该是一片死黑
  const guideCount = useMemo(() => {
    const n = memories.length
    if (n >= 12) return 0
    return Math.round((12 - n) * 22)
  }, [memories.length])

  return (
    <div className="dust-space">
      <Canvas
        camera={{ position: HOME_POS, fov: 52, near: 0.1, far: 200 }}
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance' }}
        onCreated={({ gl }) => gl.setClearColor(clearColor, 1)}
        style={{ width: '100%', height: '100%', cursor: 'grab' }}
      >
        <ClearColor color={clearColor} />
        <NebulaVeil colorA={pal.nebA} colorB={pal.nebB} intensity={0.5} />
        <Stars radius={70} depth={46} count={1500} factor={2.4} saturation={0} fade speed={0.28} />

        {guideCount > 0 && <GuideStream count={guideCount} color={pal.star} />}

        {memories.length > 0 && (
          <MemoryField
            memories={memories}
            layouts={layouts}
            searchQuery={searchQuery}
            selectedBucketId={selectedBucketId}
            onSelect={onSelect}
            clockRef={clockRef}
          />
        )}

        <Director flight={flight} onSettle={() => setFlying(false)} />
        <OrbitControls
          makeDefault
          enablePan={false}
          enableDamping
          dampingFactor={0.075}
          rotateSpeed={0.5}
          zoomSpeed={0.7}
          minDistance={2.2}
          maxDistance={26}
          autoRotate={!selectedBucketId && !flying}
          autoRotateSpeed={0.16}
        />
      </Canvas>

      <div className="dust-hud">
        <button className="dust-hud-btn" onClick={focusRecent} disabled={!memories.length}>
          聚焦最近
        </button>
        <button className="dust-hud-btn" onClick={resetView}>
          回到远景
        </button>
      </div>

      {memories.length === 0 && (
        <div className="dust-space-empty">
          <div className="dust-space-empty-title">记忆池尚空</div>
          <div className="dust-space-empty-sub">对话中会自然沉积</div>
        </div>
      )}
    </div>
  )
}

export default MemoryDeepSpace
