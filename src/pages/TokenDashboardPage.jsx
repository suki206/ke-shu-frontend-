// ============================================================
// 数据罗盘 · Token 仪表盘 —— 全屏子页面，纯展示
// 原「常数」页里藏在最深处、默认折叠的 Tokens 用量统计整体迁到
// 这里：引力页左下的双星系统点开即全屏跃迁，作为该天体的正式
// 功能界面（不再是占位 toast）。数据由 GravityPage 统一持有并
// 拉取（沿用原 ChatPage 里的 fetchTokenStats /api/stats/tokens），
// 本文件只负责渲染，跟「时轨」（ChronosPage）是同一种分工。
// 视觉上延续引力页的深空基调：复用 .gravity-nebula 星云背景层，
// 数字读数走 .gravity-sundial-num 那一路极简大字排版，卡片走
// 毛玻璃质感，byModel 拆分用堆叠的圆角小块而非表格行，避免任何
// 表格感。
// ============================================================

const fmt = (n) => (n ?? 0).toLocaleString('en-US')

const WEEKDAY_CN = ['一', '二', '三', '四', '五', '六', '日']
// trend7d 里的 date 是后端按北京日历日给的 'YYYY-MM-DD'，直接按
// UTC+8 解析，避免因浏览器本地时区不同而错位到前一天/后一天。
const dayLabel = (dateStr) => {
  const d = new Date(`${dateStr}T00:00:00+08:00`)
  return WEEKDAY_CN[(d.getUTCDay() + 6) % 7]
}

const BackIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
)
const RefreshIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
    <path d="M3 3v5h5" />
    <path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16" />
    <path d="M16 16h5v5" />
  </svg>
)

// ── 次级读数卡：本周 / 历史 / 当前会话 ──────────────────────────
const StatCard = ({ label, data, emptyHint }) => {
  const has = !!data
  const total = has ? (data.input || 0) + (data.output || 0) : 0
  return (
    <div className="token-dash-card token-dash-stat-card">
      <div className="token-dash-card-label">{label}</div>
      {has ? (
        <>
          <div className="token-dash-stat-total">{fmt(total)}</div>
          <div className="token-dash-stat-sub">↑{fmt(data.input)} ↓{fmt(data.output)}</div>
        </>
      ) : (
        <div className="token-dash-stat-empty">{emptyHint || '—'}</div>
      )}
    </div>
  )
}

// ── 7 日趋势 · 极简面积折线图（0 依赖 SVG，风格与信标/日晷一致）──
const TrendChart = ({ trend }) => {
  if (!trend?.length) return null
  const W = 640, H = 168, PAD_X = 6, PAD_TOP = 14, PAD_BOTTOM = 24
  const maxVal = Math.max(1, ...trend.map(d => Math.max(d.input, d.output)))
  const innerH = H - PAD_TOP - PAD_BOTTOM
  const stepX = (W - PAD_X * 2) / Math.max(1, trend.length - 1)
  const yFor = (v) => PAD_TOP + innerH * (1 - v / maxVal)
  const ptsFor = (key) => trend.map((d, i) => [PAD_X + i * stepX, yFor(d[key])])
  const lineFrom = (pts) => pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  const outPts = ptsFor('output')
  const inPts = ptsFor('input')
  const baseY = (H - PAD_BOTTOM).toFixed(1)
  const areaPath = `${lineFrom(outPts)} L${outPts[outPts.length - 1][0].toFixed(1)},${baseY} L${outPts[0][0].toFixed(1)},${baseY} Z`

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id="tdTrendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--c-accent)" stopOpacity=".36" />
          <stop offset="100%" stopColor="var(--c-accent)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#tdTrendFill)" stroke="none" />
      <path d={lineFrom(inPts)} fill="none" stroke="var(--c-text-faint)" strokeWidth="1.3" opacity=".6" strokeLinecap="round" strokeLinejoin="round" />
      <path d={lineFrom(outPts)} fill="none" stroke="var(--c-accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      {outPts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r="2.4" fill="var(--c-accent)" />)}
      {trend.map((d, i) => (
        <text key={d.date} x={PAD_X + i * stepX} y={H - 6} textAnchor="middle" fontSize="10" fontFamily="var(--font-accent)" fill="var(--c-text-faint)">
          {dayLabel(d.date)}
        </text>
      ))}
    </svg>
  )
}

const TokenDashboardPage = ({ stats, loading, onRefresh, onClose }) => {
  const grandTotal = stats?.byModel
    ? Object.values(stats.byModel).reduce((s, v) => s + (v.input || 0) + (v.output || 0), 0)
    : 0
  const modelEntries = stats?.byModel
    ? Object.entries(stats.byModel).sort((a, b) =>
        (b[1].input + b[1].output) - (a[1].input + a[1].output))
    : []

  return (
    <div className="token-dash-page">
      <div className="gravity-nebula" aria-hidden="true">
        <span className="gravity-nebula-layer l1" />
        <span className="gravity-nebula-layer l2" />
        <span className="gravity-nebula-layer l3" />
      </div>

      <div className="token-dash-header">
        <button className="token-dash-iconbtn" onClick={onClose} aria-label="返回">
          <BackIcon />
        </button>
        <div className="token-dash-title">数据罗盘</div>
        <button
          className={`token-dash-iconbtn${loading ? ' is-spinning' : ''}`}
          onClick={onRefresh}
          disabled={loading}
          aria-label="刷新"
        >
          <RefreshIcon />
        </button>
      </div>

      <div className="token-dash-body">
        {!stats && loading ? (
          <div className="empty-seat">
            <div className="breath-dot" />
            <div className="empty-seat-label">正在读取用量…</div>
          </div>
        ) : !stats ? (
          <div className="empty-seat">
            <div className="empty-seat-label">暂无统计数据</div>
          </div>
        ) : (
          <div className="token-dash-content">

            {/* 今日 · 全页视觉重心 */}
            <div className="token-dash-hero">
              <div className="token-dash-eyebrow">今日 · TODAY</div>
              <div className="token-dash-hero-row">
                <div className="token-dash-hero-figure">
                  <span className="token-dash-hero-num">{fmt(stats.today?.input)}</span>
                  <span className="token-dash-hero-tag">输入 · IN</span>
                </div>
                <span className="token-dash-hero-divider" />
                <div className="token-dash-hero-figure">
                  <span className="token-dash-hero-num">{fmt(stats.today?.output)}</span>
                  <span className="token-dash-hero-tag">输出 · OUT</span>
                </div>
              </div>
            </div>

            {/* 本周 / 历史 / 当前会话 */}
            <div className="token-dash-grid">
              <StatCard label="本周 · WEEK" data={stats.week} />
              <StatCard label="历史 · ALL TIME" data={stats.all} />
              <StatCard label="本次会话" data={stats.session} emptyHint="未在会话中" />
            </div>

            {/* 7 日趋势 */}
            <div className="token-dash-card token-dash-trend-card">
              <div className="token-dash-card-label">7 日趋势 · TREND</div>
              <TrendChart trend={stats.trend7d} />
              <div className="token-dash-legend">
                <span className="token-dash-legend-item"><i className="token-dash-dot is-accent" />输出 OUT</span>
                <span className="token-dash-legend-item"><i className="token-dash-dot is-faint" />输入 IN</span>
              </div>
            </div>

            {/* 按模型拆分：堆叠圆角小块，不做表格阵列 */}
            {modelEntries.length > 0 && (
              <div className="token-dash-card">
                <div className="token-dash-card-label">按模型 · BY MODEL</div>
                <div className="token-dash-model-list">
                  {modelEntries.map(([m, v]) => {
                    const total = (v.input || 0) + (v.output || 0)
                    const share = grandTotal ? total / grandTotal : 0
                    return (
                      <div key={m} className="token-dash-model-row">
                        <div className="token-dash-model-top">
                          <span className="token-dash-model-name">{m}</span>
                          <span className="token-dash-model-nums">↑{fmt(v.input)} ↓{fmt(v.output)}</span>
                        </div>
                        <div className="token-dash-model-bar">
                          <span style={{ width: `${Math.max(share * 100, share > 0 ? 2 : 0)}%` }} />
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

          </div>
        )}
      </div>
    </div>
  )
}

export default TokenDashboardPage
