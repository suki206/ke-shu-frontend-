/**
 * ConstellationMap — 星尘 · CONSTELLATIONS 视图态
 *
 * 从"情绪散点图"改成真正的星图。两条轴换成了记忆本身的两个维度：
 *   横轴  daysSinceActive —— 右边是今天，越往左越沉入过去。
 *         用对数刻度：最近几天的记忆本来就密，线性轴会把它们挤成一团。
 *   纵轴  importance      —— 越高的记忆浮得越高，像亮星在天顶。
 *
 * 同一个 domain 的记忆按时间顺序连成一条细线，就是一个星座：
 * 一条线读下来，是这件事在时间里怎么起伏的。
 *
 * 效价不再占轴，但没有被丢掉——它变成点的色温微调；域决定基色，
 * 高重要度的点额外镀一圈暖边，跟深空里"暖核"是同一套语言。
 *
 * 依然 0 额外依赖，纯 SVG。
 */
import { useMemo, useState } from 'react'
import {
  clamp, hashSeed, domainColor, domainStats, DOMAIN_UNKNOWN,
  IMPORTANCE_MAX, importanceNorm, warmth,
  matchMemory, daysOf, daysForPlot, daysLabel, trimSummary,
} from './dustCommon'

const W = 400, H = 400
const X0 = 46, X1 = 380
const Y0 = 26, Y1 = 356
const PW = X1 - X0, PH = Y1 - Y0

const DAY_TICKS = [0, 1, 3, 7, 14, 30, 90, 365]
// 重要度是 0–10 整数，刻度就照整数走，隔一档画一条，11 条太密
const IMP_TICKS = [0, 2, 4, 6, 8, 10]
const yOf = (score) => Y1 - (score / IMPORTANCE_MAX) * PH

const AXIS_TEXT = {
  fontFamily: 'var(--font-accent)',
  fontSize: 9,
  letterSpacing: '1.6px',
  fill: 'var(--c-text-faint)',
}

/** 同坐标的点会完全重叠，按 bucketId 给一个稳定的小抖动错开 */
function jitter(id, salt, span) {
  return ((hashSeed(String(id) + salt) % 1000) / 1000 - 0.5) * span
}

const ConstellationMap = ({
  memories = [], searchQuery = '', selectedBucketId = null, onSelect,
}) => {
  const [hoverId, setHoverId] = useState(null)
  const [activeDomain, setActiveDomain] = useState(null)

  const maxDays = useMemo(() => {
    let m = 14
    memories.forEach(mem => { const d = daysOf(mem); if (d !== null) m = Math.max(m, d) })
    return m
  }, [memories])

  const logMax = Math.log1p(maxDays)
  const xOf = (d) => X0 + (1 - Math.log1p(clamp(d, 0, maxDays)) / logMax) * PW

  const points = useMemo(() => memories.map((mem, i) => {
    const impRaw = importanceNorm(mem)
    const known = daysOf(mem) !== null && impRaw !== null
    // 缺时间戳按 3 天摆，缺评分按中位 5 分摆，两种都会画成虚线圈
    const days = daysForPlot(mem)
    const imp = impRaw === null ? 0.5 : impRaw

    const x = clamp(xOf(days) + jitter(mem.bucketId || i, 'x', 9), X0 - 6, X1 + 6)
    // 评分只有 11 档，同分的点会精确落在同一条水平线上。档距是 PH/10≈33px，
    // 纵向抖动放到 ±7px：错得开，又不会串到隔壁档去
    const y = clamp(Y1 - imp * PH + jitter(mem.bucketId || i, 'y', 14), Y0 - 6, Y1 + 6)
    const r = 2.2 + imp * 5.4
    return {
      mem, x, y, r, known, imp,
      color: domainColor(mem.domain),
      vivid: clamp(1 - (mem.fadeLevel ?? 0.5), 0.08, 1),
      warm: warmth(mem),
    }
  }), [memories, maxDays, logMax])

  const domains = useMemo(() => domainStats(memories), [memories])

  // 同域按时间顺序串成一条星座线
  const links = useMemo(() => {
    const byDomain = new Map()
    points.forEach(p => {
      const d = p.mem.domain
      if (!d) return
      if (!byDomain.has(d)) byDomain.set(d, [])
      byDomain.get(d).push(p)
    })
    const out = []
    byDomain.forEach((list, domain) => {
      if (list.length < 2) return
      const sorted = [...list].sort((a, b) => a.x - b.x)
      for (let i = 0; i < sorted.length - 1; i++) {
        out.push({ domain, color: sorted[i].color, a: sorted[i], b: sorted[i + 1] })
      }
    })
    return out
  }, [points])

  const query = (searchQuery || '').trim()
  const hasQuery = query.length > 0

  const stateOf = (p) => {
    const matched = hasQuery && matchMemory(p.mem, query)
    const domainOff = activeDomain && p.mem.domain !== activeDomain
    const dimmed = (hasQuery && !matched) || domainOff
    return { matched, dimmed }
  }

  const focus = points.find(p => p.mem.bucketId === (hoverId || selectedBucketId)) || null

  return (
    <div className="dust-const">
      <svg className="dust-const-svg" viewBox={`0 0 ${W} ${H}`}>
        <defs>
          <linearGradient id="dustAxisFade" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%"   stopColor="var(--c-line)" stopOpacity="0" />
            <stop offset="45%"  stopColor="var(--c-line)" stopOpacity="1" />
            <stop offset="100%" stopColor="var(--c-line)" stopOpacity="1" />
          </linearGradient>
        </defs>

        {/* ── 淡网格：横向是重要度层，纵向是时间刻度 ── */}
        <g opacity="0.5">
          {IMP_TICKS.map(t => (
            <line key={`h${t}`} x1={X0} y1={yOf(t)} x2={X1} y2={yOf(t)}
              stroke="var(--c-line)" strokeWidth="0.6"
              strokeDasharray={t === 0 || t === IMPORTANCE_MAX ? 'none' : '2 6'} />
          ))}
          {DAY_TICKS.filter(d => d <= maxDays).map(d => (
            <line key={`v${d}`} x1={xOf(d)} y1={Y0} x2={xOf(d)} y2={Y1}
              stroke="var(--c-line)" strokeWidth="0.6"
              strokeDasharray={d === 0 ? 'none' : '2 6'} />
          ))}
        </g>

        {/* ── 轴与刻度 ── */}
        <line x1={X0} y1={Y1} x2={X1} y2={Y1} stroke="url(#dustAxisFade)" strokeWidth="1" />
        <line x1={X0} y1={Y0} x2={X0} y2={Y1} stroke="var(--c-line)" strokeWidth="1" />

        {DAY_TICKS.filter(d => d <= maxDays).map(d => (
          <text key={`t${d}`} x={xOf(d)} y={Y1 + 16} textAnchor="middle" style={AXIS_TEXT}>
            {d === 0 ? '今天' : d < 30 ? `${d}天` : d < 365 ? `${Math.round(d / 30)}月` : `${Math.round(d / 365)}年`}
          </text>
        ))}
        {IMP_TICKS.map(t => (
          <text key={`it${t}`} x={X0 - 8} y={yOf(t) + 3.2} textAnchor="end" style={AXIS_TEXT}>{t}</text>
        ))}
        <text x={X0 - 33} y={(Y0 + Y1) / 2} textAnchor="middle" style={AXIS_TEXT}
          transform={`rotate(-90 ${X0 - 33} ${(Y0 + Y1) / 2})`}>IMPORTANCE</text>
        <text x={X1} y={Y1 + 32} textAnchor="end" style={{ ...AXIS_TEXT, letterSpacing: '2.4px' }}>RECENCY →</text>

        {/* ── 星座连线 ── */}
        <g>
          {links.map((l, i) => {
            const sa = stateOf(l.a), sb = stateOf(l.b)
            const dimmed = sa.dimmed && sb.dimmed
            const lit = (hasQuery && (sa.matched || sb.matched)) || activeDomain === l.domain
            return (
              <line key={`l${i}`} x1={l.a.x} y1={l.a.y} x2={l.b.x} y2={l.b.y}
                stroke={l.color} strokeWidth={lit ? 0.9 : 0.55}
                opacity={dimmed ? 0.03 : lit ? 0.42 : 0.16}
                style={{ transition: 'opacity .3s ease' }} />
            )
          })}
        </g>

        {/* ── 记忆点：外晕 + 中晕 + 核心，三层叠出光感 ── */}
        <g>
          {points.map((p, i) => {
            const { matched, dimmed } = stateOf(p)
            const selected = p.mem.bucketId === selectedBucketId
            const hovered = p.mem.bucketId === hoverId
            const base = dimmed ? 0.06 : Math.max(0.2, p.vivid)
            const boost = matched || selected || hovered ? 1 : 0
            const r = p.r * (selected ? 1.75 : hovered ? 1.35 : 1)

            return (
              <g key={p.mem.bucketId || i}
                className={matched ? 'dust-const-pulse' : undefined}
                style={{ cursor: 'pointer', transition: 'opacity .3s ease' }}
                opacity={dimmed ? 0.32 : 1}
                onClick={() => onSelect && onSelect(p.mem)}
                onMouseEnter={() => setHoverId(p.mem.bucketId)}
                onMouseLeave={() => setHoverId(null)}
              >
                <circle cx={p.x} cy={p.y} r={r * 3.4} fill={p.color} opacity={base * 0.07 + boost * 0.06} />
                <circle cx={p.x} cy={p.y} r={r * 1.9} fill={p.color} opacity={base * 0.16 + boost * 0.12} />
                <circle cx={p.x} cy={p.y} r={r}
                  fill={p.color} opacity={Math.min(1, base * 0.85 + boost * 0.3)}
                  stroke={p.known ? 'none' : 'var(--c-text-faint)'}
                  strokeWidth={p.known ? 0 : 0.7}
                  strokeDasharray={p.known ? 'none' : '1.4 1.6'} />
                {p.warm > 0.02 && (
                  <circle cx={p.x} cy={p.y} r={r * 0.46} fill="#f2c98c" opacity={base * p.warm * 0.95} />
                )}
                {selected && (
                  <circle cx={p.x} cy={p.y} r={r + 5.5} fill="none"
                    stroke="var(--c-text)" strokeWidth="0.8" opacity="0.55" />
                )}
              </g>
            )
          })}
        </g>

        {/* ── 悬停/选中摘要 ── */}
        {focus && (() => {
          const text = trimSummary(focus.mem.summary, 42)
          const lines = []
          for (let i = 0; i < text.length; i += 15) lines.push(text.slice(i, i + 15))
          const boxW = 132, boxH = 20 + lines.length * 13
          const flipX = focus.x > W - boxW - 20
          const bx = clamp(flipX ? focus.x - boxW - 10 : focus.x + 10, 6, W - boxW - 6)
          const by = clamp(focus.y - boxH / 2, 6, H - boxH - 6)
          return (
            <g pointerEvents="none">
              <line x1={focus.x} y1={focus.y} x2={flipX ? bx + boxW : bx} y2={by + boxH / 2}
                stroke="var(--c-line-strong)" strokeWidth="0.6" />
              <rect x={bx} y={by} width={boxW} height={boxH} rx="6"
                fill="var(--c-modal-solid)" stroke="var(--c-line)" strokeWidth="0.7" opacity="0.94" />
              {lines.map((ln, i) => (
                <text key={i} x={bx + 9} y={by + 15 + i * 13}
                  style={{ fontSize: 9.5, fill: 'var(--c-text)', letterSpacing: '.3px' }}>{ln}</text>
              ))}
              <text x={bx + 9} y={by + boxH - 5}
                style={{ ...AXIS_TEXT, fontSize: 8, fill: focus.color }}>
                {`${focus.mem.domain || '未归域'} · ${daysLabel(daysOf(focus.mem))} · ${focus.mem.importance ?? '—'}/${IMPORTANCE_MAX}`}
              </text>
            </g>
          )
        })()}
      </svg>

      {/* ── 图例：点一个域，只留下它的星座 ── */}
      <div className="dust-const-legend">
        {domains.slice(0, 10).map(({ domain, count, color }) => (
          <button
            key={domain}
            className={`dust-chip${activeDomain === domain ? ' is-on' : ''}`}
            style={{ '--chip': color }}
            onClick={() => setActiveDomain(activeDomain === domain ? null : domain)}
          >
            <span className="dust-chip-dot" />
            {domain}
            <span className="dust-chip-num">{count}</span>
          </button>
        ))}
        {domains.length === 0 && (
          <span className="dust-legend-note" style={{ color: DOMAIN_UNKNOWN }}>
            这些记忆还没有归域
          </span>
        )}
        {domains.length > 0 && (
          <span className="dust-legend-note">虚线圈 · 时间或评分缺失，按兜底位置摆放</span>
        )}
      </div>
    </div>
  )
}

export default ConstellationMap
