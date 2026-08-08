/**
 * ConstellationMap — 星尘 · CONSTELLATIONS 视图态
 * 轻量 SVG 情感坐标图：横轴效价（valence，悲伤 ←→ 愉悦），纵轴唤醒度
 * （arousal，平静 ←→ 激动），点的大小代表记忆的鲜明程度（1 - fadeLevel）。
 * 跟 Three.js 深空是并列的两个视图态，不是替代关系——0 额外依赖，
 * 纯 SVG，跟项目里 Markdown 渲染器"0依赖"的一贯做法保持一致。
 *
 * 没有 valence/arousal 的记忆不会被藏起来，而是标记为"情感未知"、
 * 聚在原点附近、用虚线圈跟正常点区分——不假装知道数据里没有的东西。
 */
import { useMemo } from 'react'

const SIZE = 380
const PAD = 40
const PLOT = SIZE - PAD * 2

const COLD = [111, 159, 216]
const NEUTRAL = [201, 185, 138]
const WARM = [230, 180, 94]

function lerpColor(a, b, t) {
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`
}
function valenceColor(v) {
  if (v === null || v === undefined) return `rgb(${NEUTRAL.join(',')})`
  const t = Math.max(-1, Math.min(1, v))
  return t >= 0 ? lerpColor(NEUTRAL, WARM, t) : lerpColor(NEUTRAL, COLD, -t)
}

function hashSeed(str) {
  let h = 2166136261
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) }
  return (h >>> 0) / 4294967296
}

function pointFor(mem, index) {
  const known = mem.valence !== null && mem.valence !== undefined && mem.arousal !== null && mem.arousal !== undefined
  let vx, ay
  if (known) {
    vx = Math.max(-1, Math.min(1, mem.valence))
    ay = Math.max(-1, Math.min(1, mem.arousal))
  } else {
    // 未知情感：以原点为中心做一圈稳定的小抖动，避免完全重叠
    const s1 = hashSeed((mem.bucketId || String(index)) + 'x')
    const s2 = hashSeed((mem.bucketId || String(index)) + 'y')
    const r = 0.08 + s1 * 0.1
    const angle = s2 * Math.PI * 2
    vx = Math.cos(angle) * r
    ay = Math.sin(angle) * r
  }
  const x = PAD + ((vx + 1) / 2) * PLOT
  const y = PAD + ((1 - ay) / 2) * PLOT
  const radius = 2.4 + (1 - (mem.fadeLevel ?? 0.5)) * 7
  return { x, y, radius, known }
}

const AXIS_STYLE = {
  fontFamily: 'var(--font-accent)', fontSize: 9.5, letterSpacing: '2px',
  fill: 'var(--c-text-faint)',
}

const ConstellationMap = ({ memories = [], searchQuery = '', selectedBucketId = null, onSelect }) => {
  const points = useMemo(() => memories.map((m, i) => ({ mem: m, ...pointFor(m, i) })), [memories])
  const query = searchQuery.trim().toLowerCase()
  const hasQuery = query.length > 0

  return (
    <svg viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ width: '100%', height: '100%', display: 'block' }}>
      {/* 坐标轴 */}
      <line x1={PAD} y1={SIZE / 2} x2={SIZE - PAD} y2={SIZE / 2} stroke="var(--c-line)" strokeWidth="1" />
      <line x1={SIZE / 2} y1={PAD} x2={SIZE / 2} y2={SIZE - PAD} stroke="var(--c-line)" strokeWidth="1" />

      <text x={SIZE - PAD} y={SIZE / 2 - 10} textAnchor="end" style={AXIS_STYLE}>愉悦</text>
      <text x={PAD} y={SIZE / 2 - 10} textAnchor="start" style={AXIS_STYLE}>悲伤</text>
      <text x={SIZE / 2 + 10} y={PAD + 4} textAnchor="start" style={AXIS_STYLE}>激动</text>
      <text x={SIZE / 2 + 10} y={SIZE - PAD} textAnchor="start" style={AXIS_STYLE}>平静</text>

      {points.map(({ mem, x, y, radius, known }, i) => {
        const matched = hasQuery && (
          (mem.summary || '').toLowerCase().includes(query) ||
          (mem.domain || '').toLowerCase().includes(query)
        )
        const dimmed = hasQuery && !matched
        const isSelected = selectedBucketId === mem.bucketId
        const opacity = dimmed ? 0.08 : Math.max(0.18, 1 - (mem.fadeLevel ?? 0.5))
        return (
          <circle
            key={mem.bucketId || i}
            cx={x} cy={y} r={isSelected ? radius * 1.6 : radius}
            fill={valenceColor(mem.valence)}
            opacity={matched ? 1 : opacity}
            stroke={isSelected ? '#ffffff' : (known ? 'none' : 'var(--c-text-faint)')}
            strokeWidth={isSelected ? 1.4 : (known ? 0 : 0.7)}
            strokeDasharray={known ? 'none' : '1.5 1.5'}
            style={{ cursor: 'pointer', transition: 'opacity .25s ease, r .2s ease' }}
            onClick={() => onSelect(mem)}
          >
            <title>{mem.summary}</title>
          </circle>
        )
      })}
    </svg>
  )
}

export default ConstellationMap
