/**
 * MemoryDeepSpace — 星尘 · REVERIE 视图态
 * Three.js（react-three-fiber）记忆深空：每颗粒子对应一条真实记忆，
 * 位置按"新近度"分层（越新越靠近视点，越旧越沉入深处），明暗由
 * fadeLevel 驱动，颜色由 valence（效价）驱动，亮度呼吸由 arousal
 * （唤醒度）驱动。点击粒子展开详情（由父组件渲染浮层），拖拽旋转/
 * 滚轮缩放走 OrbitControls，与桌面/触控手势一致。
 *
 * 不在这里做请求——memories 数组、搜索关键词、选中态都由父组件
 * （StardustPage）传入，这个组件只负责"渲染一片可航行的深空"。
 */
import { useMemo, useRef, useState } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import { OrbitControls, Stars } from '@react-three/drei'
import * as THREE from 'three'

// ── 字符串 → 稳定伪随机数（同一 bucketId 每次渲染位置不跳动）──────
function hashSeed(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
function mulberry32(seed) {
  let a = seed
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// valence(-1..1) → 冷暖色；未知效价给中性暖灰，不武断判"好坏"
const COLD = new THREE.Color('#6f9fd8')   // 偏负效价
const NEUTRAL = new THREE.Color('#c9b98a') // 效价未知/居中
const WARM = new THREE.Color('#e6b45e')   // 偏正效价
function valenceColor(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return NEUTRAL.clone()
  const t = Math.max(-1, Math.min(1, v))
  return t >= 0 ? NEUTRAL.clone().lerp(WARM, t) : NEUTRAL.clone().lerp(COLD, -t)
}

function layoutFor(mem, index, total) {
  const rnd = mulberry32(hashSeed(mem.bucketId || String(index)))
  // 新近度：daysSinceActive 越小越"近"（半径越小），未知则按数组顺序退化
  const days = mem.daysSinceActive ?? (total > 1 ? (index / (total - 1)) * 14 : 3)
  const normDays = Math.max(0, Math.min(1, days / 14))
  const radius = 2.4 + normDays * 6.4 + rnd() * 0.6

  const theta = rnd() * Math.PI * 2
  const phi = Math.acos(2 * rnd() - 1)
  const x = radius * Math.sin(phi) * Math.cos(theta)
  const y = radius * Math.sin(phi) * Math.sin(theta) * 0.62 // 压扁一点，更像盘面而非正球
  const z = radius * Math.cos(phi)

  return { position: [x, y, z], phase: rnd() * Math.PI * 2, speed: 0.4 + rnd() * 0.5 }
}

function MemoryParticle({ mem, layout, highlighted, dimmed, onSelect, isSelected }) {
  const core = useRef(null)
  const halo = useRef(null)
  const [hovered, setHovered] = useState(false)

  const color = useMemo(() => valenceColor(mem.valence), [mem.valence])
  const arousalNorm = mem.arousal === null || mem.arousal === undefined
    ? 0.4
    : Math.max(0, Math.min(1, Math.abs(mem.arousal)))
  const baseOpacity = Math.max(0.04, 1 - (mem.fadeLevel ?? 0.5)) // 淡忘的记忆本就该几乎看不见
  const baseSize = 0.05 + (mem.importance ? mem.importance / 10 : 0.35) * 0.09

  useFrame(({ clock }) => {
    if (!core.current || !halo.current) return
    const t = clock.getElapsedTime()
    // 呼吸：唤醒度越高，明暗起伏越快越明显——跟设置页"呼吸光点"是同一套语感
    const pulse = Math.sin(t * layout.speed + layout.phase) * (0.12 + arousalNorm * 0.22) + 1
    let opacity = baseOpacity * pulse
    let scale = baseSize * (highlighted ? 1.8 : 1) * (hovered || isSelected ? 1.35 : 1)

    if (dimmed) opacity *= 0.12
    if (highlighted) opacity = Math.min(1, opacity + 0.5)

    core.current.material.opacity = Math.max(0.02, Math.min(1, opacity))
    core.current.scale.setScalar(scale)
    halo.current.material.opacity = Math.max(0, Math.min(0.5, opacity * 0.55))
    halo.current.scale.setScalar(scale * (3.6 + arousalNorm * 2.2))
  })

  return (
    <group position={layout.position}>
      <mesh
        ref={halo}
        onClick={(e) => { e.stopPropagation(); onSelect(mem) }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); document.body.style.cursor = 'pointer' }}
        onPointerOut={() => { setHovered(false); document.body.style.cursor = 'grab' }}
      >
        <sphereGeometry args={[1, 8, 8]} />
        <meshBasicMaterial color={color} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
      <mesh ref={core}>
        <sphereGeometry args={[1, 10, 10]} />
        <meshBasicMaterial color={isSelected ? '#ffffff' : color} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
      </mesh>
    </group>
  )
}

function CameraRig({ targetPosition }) {
  useFrame(({ camera }) => {
    const dest = targetPosition
      ? new THREE.Vector3(...targetPosition).multiplyScalar(0.42)
      : new THREE.Vector3(0, 0, 11)
    camera.position.lerp(dest.setZ(dest.z + (targetPosition ? 2.4 : 0)), 0.045)
  })
  return null
}

const MemoryDeepSpace = ({ memories = [], searchQuery = '', selectedBucketId = null, onSelect, bg = '#040608' }) => {
  const layouts = useMemo(() => {
    const map = new Map()
    memories.forEach((m, i) => map.set(m.bucketId, layoutFor(m, i, memories.length)))
    return map
  }, [memories])

  const query = searchQuery.trim().toLowerCase()
  const hasQuery = query.length > 0
  const selected = selectedBucketId ? memories.find(m => m.bucketId === selectedBucketId) : null

  return (
    <Canvas
      camera={{ position: [0, 0, 11], fov: 52 }}
      style={{ width: '100%', height: '100%', cursor: 'grab' }}
      gl={{ antialias: true, alpha: false }}
      onCreated={({ gl }) => gl.setClearColor(bg, 1)}
    >
      <Stars radius={60} depth={40} count={1400} factor={2.2} fade speed={0.35} />
      {memories.map((mem, i) => {
        const layout = layouts.get(mem.bucketId)
        if (!layout) return null
        const matched = hasQuery && (
          (mem.summary || '').toLowerCase().includes(query) ||
          (mem.domain || '').toLowerCase().includes(query)
        )
        const dimmed = hasQuery && !matched
        return (
          <MemoryParticle
            key={mem.bucketId || i}
            mem={mem}
            layout={layout}
            highlighted={matched}
            dimmed={dimmed}
            isSelected={selectedBucketId === mem.bucketId}
            onSelect={onSelect}
          />
        )
      })}
      <CameraRig targetPosition={selected ? layouts.get(selected.bucketId)?.position : null} />
      <OrbitControls
        enablePan={false}
        enableDamping
        dampingFactor={0.08}
        rotateSpeed={0.55}
        minDistance={3}
        maxDistance={20}
        autoRotate={!selected}
        autoRotateSpeed={0.28}
      />
    </Canvas>
  )
}

export default MemoryDeepSpace
