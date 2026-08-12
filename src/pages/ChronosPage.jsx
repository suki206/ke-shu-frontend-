import { useState, useEffect, useMemo } from 'react'
import axios from 'axios'

const API_BASE = 'https://ke-shu-backend.onrender.com/api'

// ============================================================
// 时轨 · CHRONOS —— 全屏子页面，从引力页点「时轨」天体跃迁进入
// 本批重构：不再是"锚点/潮汐/倒计时"三个 tab + 表单 + 列表，
// 改成一个纯展示的星轨场景——
//   · 锚点（在一起天数）= 恒星，悬在场景正中
//   · 自定义倒计时      = 环绕恒星的行星，轨道环 + 剩余天数标注
//   · 经期预测          = 月相圆盘，盈亏用真实新月/满月弧线画出
//   · 经期历史          = 一条光带，有记录的日子是亮斑，没有的是暗区
// 页面本身只负责展示；新增倒计时 / 记录经期 / 设定锚点，都是点场景
// 里对应的天体弹出一张小面板，不铺在主视图里。
// ============================================================

const SYNODIC_MONTH = 29.530588861   // 朔望月，天
const KNOWN_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14)   // 一个公认的新月时刻，作基准
const MOON_NAMES = ['新月', '娥眉月', '上弦月', '盈凸月', '满月', '亏凸月', '下弦月', '残月']
const LIGHTBAND_DAYS = 90

function moonPhaseInfo(date = new Date()) {
  const days = (date.getTime() - KNOWN_NEW_MOON) / 86400000
  const age = ((days % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH
  const frac = age / SYNODIC_MONTH   // 0 = 新月，0.5 = 满月，1 = 下一个新月
  return { frac, age, name: MOON_NAMES[Math.floor(frac * 8) % 8] }
}

// 月相圆盘的 SVG 路径：outer 弧永远画半圆，inner 弧的椭圆横向半径
// 随 |cos(2π·frac)| 变化，两条弧的扫描方向在朔/望/两弦四个节点上
// 分别退化成"直线"或"整圆"，新月＝全暗、满月＝全亮、两弦＝半月。
function moonPhaseD(frac, r) {
  const cx = r, cy = r
  const theta = frac * Math.PI * 2
  const rx = Math.abs(r * Math.cos(theta))
  const sweepOuter = frac < 0.5 ? 1 : 0
  const sweepInner = (frac < 0.25 || frac > 0.75) ? sweepOuter : 1 - sweepOuter
  return `M ${cx} ${cy - r} A ${r} ${r} 0 0 ${sweepOuter} ${cx} ${cy + r} A ${rx} ${r} 0 0 ${sweepInner} ${cx} ${cy - r} Z`
}

const daysBetween = (a, b) => Math.round((b.getTime() - a.getTime()) / 86400000)
const dstr = (d) => d.toISOString().slice(0, 10)

const BackIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 18l-6-6 6-6" />
  </svg>
)

// 新增倒计时：原来是居中弹窗（.chronos-sheet-veil），键盘弹出时
// 弹窗要么被顶着爬升、要么在小尺寸浮层里躲键盘，体验别扭。改成
// 独立的全屏页面——输入框固定在页面自己的文档流里，键盘弹出只是
// 把可视区往上挤，不再有任何位置跳变，也更接近原生"添加新日子"
// 页面的操作习惯（返回 / 标题 / 保存 一行，下面是表单，底部再放
// 一个大按钮方便单手操作）。
const ChronosAddOrbitPage = ({ label, setLabel, date, setDate, onSubmit, onClose }) => {
  const canSubmit = label.trim() && date
  return (
    <div className="chronos-add-page">
      <div className="chronos-add-header">
        <button className="chronos-add-iconbtn" onClick={onClose} aria-label="返回">
          <BackIcon />
        </button>
        <div className="chronos-add-title">NEW ORBIT · 新的守候</div>
        <button className="chronos-add-save" onClick={onSubmit} disabled={!canSubmit}>保存</button>
      </div>
      <div className="chronos-add-body">
        <div className="chronos-add-content">
          <div className="chronos-add-eyebrow">为这一天，留一条专属的轨道</div>
          <div>
            <div className="chronos-add-field-label">标题</div>
            <input
              className="field-input"
              placeholder="标题，比如「生日」"
              value={label}
              onChange={e => setLabel(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <div className="chronos-add-field-label">目标时间</div>
            <input
              type="datetime-local"
              className="field-input"
              value={date}
              onChange={e => setDate(e.target.value)}
            />
          </div>
          <button className="solid-btn chronos-add-submit" onClick={onSubmit} disabled={!canSubmit}>放入轨道</button>
        </div>
      </div>
    </div>
  )
}

const ChronosPage = ({ onClose, showToast, anchorDate, onAnchorChange }) => {
  const [loading, setLoading] = useState(true)
  const [periodLogs, setPeriodLogs] = useState([])
  const [countdowns, setCountdowns] = useState([])

  // 场景里点开的小面板：null | 'anchor' | 'add-countdown' | 'period'
  // | { type:'countdown-detail', item }
  const [sheet, setSheet] = useState(null)
  const closeSheet = () => setSheet(null)

  const [anchorInput, setAnchorInput] = useState(anchorDate || '')
  const [periodInput, setPeriodInput] = useState('')
  const [periodEndInput, setPeriodEndInput] = useState('')
  const [cdLabel, setCdLabel] = useState('')
  const [cdDate, setCdDate] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [pRes, cRes] = await Promise.all([
          axios.get(`${API_BASE}/period/list`),
          axios.get(`${API_BASE}/countdowns`),
        ])
        if (!alive) return
        setPeriodLogs(pRes.data || [])
        setCountdowns(cRes.data || [])
      } catch (e) { showToast?.('时轨数据加载失败') }
      finally { if (alive) setLoading(false) }
    })()
    return () => { alive = false }
  }, [])

  // ── 锚点 ──────────────────────────────────────────────────
  const anchorDays = anchorDate ? daysBetween(new Date(anchorDate), new Date()) + 1 : null
  // 面板里的实时读数：跟着 anchorInput 走，而不是跟着已保存的 anchorDate
  // ——选日期的时候上面的大数字立刻变，确认的是"第 N 天"这个结果，
  // 不是一串抽象的 2025-04-06。纯计算，没有异步、没有任何测量；读数区
  // 在 CSS 里给了固定高度，位数从 9 变到 100 也不会顶动下面的控件
  const previewDays = anchorInput ? daysBetween(new Date(anchorInput), new Date()) + 1 : null
  const submitAnchor = () => {
    if (!anchorInput) return
    onAnchorChange?.(anchorInput)
    showToast?.('锚点已设定')
    closeSheet()
  }

  // ── 倒计时（按目标时间升序：越近的轨道半径越小）────────────
  const sortedCountdowns = useMemo(
    () => [...countdowns].sort((a, b) => a.target_at.localeCompare(b.target_at)),
    [countdowns]
  )
  const submitCountdown = async () => {
    if (!cdLabel.trim() || !cdDate) return
    try {
      const { data } = await axios.post(`${API_BASE}/countdown`, { label: cdLabel.trim(), target_at: cdDate })
      setCountdowns(prev => [...prev, data])
      setCdLabel(''); setCdDate('')
      closeSheet()
    } catch (e) { showToast?.('新增失败：' + e.message) }
  }
  const deleteCountdown = async (id) => {
    try {
      await axios.delete(`${API_BASE}/countdown/${id}`)
      setCountdowns(prev => prev.filter(c => c.id !== id))
      closeSheet()
    } catch (e) { showToast?.('删除失败：' + e.message) }
  }

  // ── 潮汐 · 经期 ───────────────────────────────────────────
  const sortedAsc = useMemo(() => [...periodLogs].sort((a, b) => a.start_date.localeCompare(b.start_date)), [periodLogs])
  const gaps = sortedAsc.slice(1).map((p, i) => daysBetween(new Date(sortedAsc[i].start_date), new Date(p.start_date)))
  const recentGaps = gaps.slice(-6)
  const avgCycle = recentGaps.length ? Math.round(recentGaps.reduce((a, b) => a + b, 0) / recentGaps.length) : null
  const lastStart = sortedAsc[sortedAsc.length - 1]?.start_date
  const predictedNext = (lastStart && avgCycle) ? new Date(new Date(lastStart).getTime() + avgCycle * 86400000) : null
  const moon = moonPhaseInfo()

  const addPeriodLog = async () => {
    if (!periodInput) return
    try {
      const { data } = await axios.post(`${API_BASE}/period/log`, { start_date: periodInput, end_date: periodEndInput || null })
      setPeriodLogs(prev => [data, ...prev])
      setPeriodInput(''); setPeriodEndInput('')
    } catch (e) { showToast?.('记录失败：' + e.message) }
  }
  const deletePeriodLog = async (id) => {
    try { await axios.delete(`${API_BASE}/period/${id}`); setPeriodLogs(prev => prev.filter(p => p.id !== id)) }
    catch (e) { showToast?.('删除失败：' + e.message) }
  }

  // ── 光带：过去 60 天 + 未来 29 天，共 LIGHTBAND_DAYS 格。只看
  // 过去的话，"预计下次开始"这个未来日期永远进不了窗口、is-predicted
  // 那个标记就成了死代码——所以窗口要跨到今天之后，才接得住预测。
  const LIGHTBAND_PAST = 60
  const lightband = useMemo(() => {
    const today = new Date(); today.setHours(0, 0, 0, 0)
    const ranges = periodLogs.map(p => {
      const s = new Date(p.start_date)
      const e = p.end_date ? new Date(p.end_date) : s
      return [s.getTime(), e.getTime()]
    })
    const predictedStr = predictedNext ? dstr(predictedNext) : null
    const todayStr = dstr(today)
    const cells = []
    for (let i = LIGHTBAND_PAST; i >= -(LIGHTBAND_DAYS - LIGHTBAND_PAST - 1); i--) {
      const d = new Date(today.getTime() - i * 86400000)
      const t = d.getTime()
      const lit = ranges.some(([s, e]) => t >= s && t <= e)
      cells.push({ key: dstr(d), lit, predicted: predictedStr === dstr(d), isToday: dstr(d) === todayStr })
    }
    return cells
  }, [periodLogs, predictedNext])

  // ── 行星轨道直径（stage 的百分比）：自适应而不是固定步长——
  // 固定步长在超过四五个倒计时时最外圈会冲出方形舞台，跟下面的
  // 潮汐区块撞在一起。这里按当前总数把半径压缩进一个安全区间，
  // 内圈 20%、外圈最多到 47%，几个都不会溢出。
  const ringDiameter = (i, total) => {
    const minR = 20, maxR = 47
    if (total <= 1) return minR * 2
    const step = (maxR - minR) / (total - 1)
    return (minR + i * step) * 2
  }

  return (
    <div className="chronos-page">
      <div className="chronos-header">
        <button className="chronos-back" onClick={onClose} aria-label="关闭">‹</button>
        <div className="chronos-title">CHRONOS · 时轨</div>
        <span className="chronos-header-spacer" />
      </div>

      {loading ? (
        <div className="chronos-body"><div className="beacon-empty">正在读取…</div></div>
      ) : (
        <div className="chronos-body chronos-body-scene">

          {/* ── 星轨舞台：锚点恒星 + 倒计时环绕行星 ── */}
          <div className="chronos-stage">
            {sortedCountdowns.map((c, i) => {
              const dia = ringDiameter(i, sortedCountdowns.length)
              const angle = (i * 63 + 20) % 360
              const rad = (angle * Math.PI) / 180
              const rPct = dia / 2
              const tagX = 50 + rPct * Math.cos(rad)
              const tagY = 50 + rPct * Math.sin(rad)
              const d = daysBetween(new Date(), new Date(c.target_at))
              return (
                <div key={c.id}>
                  <div className="chronos-orbit-ring" style={{ width: `${dia}%`, height: `${dia}%` }}>
                    <div className="chronos-orbit-pivot" style={{ animationDuration: `${16 + i * 6}s`, animationDelay: `${-i * 3}s` }}>
                      <span className="chronos-orbit-dot" />
                    </div>
                  </div>
                  <div
                    className="chronos-planet-tag"
                    style={{ left: `${tagX}%`, top: `${tagY}%` }}
                    onClick={() => setSheet({ type: 'countdown-detail', item: c })}
                    role="button"
                    tabIndex={0}
                    aria-label={c.label}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSheet({ type: 'countdown-detail', item: c }) } }}
                  >
                    <span className="chronos-planet-label">{c.label}</span>
                    <span className="chronos-planet-days">{d >= 0 ? `${d}天` : `已过${-d}天`}</span>
                  </div>
                </div>
              )
            })}

            <div
              className="chronos-star"
              onClick={() => { setAnchorInput(anchorDate || ''); setSheet('anchor') }}
              role="button"
              tabIndex={0}
              aria-label="锚点"
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setAnchorInput(anchorDate || ''); setSheet('anchor') } }}
            >
              <span className="chronos-star-core" />
              <span className="chronos-star-flare" />
              <div className="chronos-star-readout">
                {anchorDays != null ? (
                  <>
                    <span className="chronos-star-num">{anchorDays}</span>
                    <span className="chronos-star-caption">在一起的第 {anchorDays} 天</span>
                    <span className="chronos-star-since">自 {anchorDate}</span>
                  </>
                ) : (
                  <span className="chronos-star-caption">轻触设定锚点</span>
                )}
              </div>
            </div>

            <button className="chronos-add-orbit" onClick={() => setSheet('add-countdown')} aria-label="新增倒计时">+</button>
          </div>

          {/* ── 潮汐：月相圆盘 ── */}
          <div className="chronos-tide" onClick={() => setSheet('period')} role="button" tabIndex={0}>
            <div className="chronos-moon-wrap">
              <svg width="104" height="104" viewBox="0 0 104 104" className="chronos-moon-svg">
                <circle cx="52" cy="52" r="50" className="chronos-moon-base" />
                <path d={moonPhaseD(moon.frac, 50)} transform="translate(2,2)" className="chronos-moon-lit" />
              </svg>
            </div>
            <div className="chronos-moon-name">{moon.name}</div>
            {predictedNext && (
              <div className="chronos-predict">预计下次开始 · {dstr(predictedNext)}（平均周期 {avgCycle} 天）</div>
            )}
          </div>

          {/* ── 光带：经期历史 ── */}
          <div className="chronos-lightband" onClick={() => setSheet('period')} role="button" tabIndex={0}>
            {lightband.map(cell => (
              <span key={cell.key} className={`chronos-lb-cell${cell.lit ? ' is-lit' : ''}${cell.predicted ? ' is-predicted' : ''}${cell.isToday ? ' is-today' : ''}`} />
            ))}
          </div>
          <div className="chronos-lightband-caption">过去 {LIGHTBAND_PAST} 天 · 未来 {LIGHTBAND_DAYS - LIGHTBAND_PAST - 1} 天 · 轻触记录</div>

        </div>
      )}

      {/* ── 锚点面板 ──────────────────────────────────────────
          外壳（.modal-veil + .modal-card + 它们自带的进场动画）跟原来
          完全一样，只重写了卡片内部：把"填一个日期"变成"看着天数确认
          这一天"——选日期时上面的大数字实时跟着变，确认的是「第 N 天」
          这个结果，而不是一串抽象的 2025-04-06。

          刻意没有引入任何新 @keyframes、没有任何 JS 测量、没有自绘
          日历（点开仍然是系统原生日期选择器），多出来的全是静态样式。
          唯一的结构变化是把毛玻璃换成现成的 .modal-card-solid，这比
          原来少一层 backdrop-filter，GPU 开销只降不升，不存在"改完
          反而更容易卡"的可能 ───────────────────────────────── */}
      {sheet === 'anchor' && (
        <div className="modal-veil chronos-sheet-veil" onClick={closeSheet}>
          <div className="modal-card modal-card-solid chronos-anchor-card" onClick={e => e.stopPropagation()}>
            <div className="chronos-anchor-orn" aria-hidden="true">✦</div>
            <div className="chronos-anchor-title">ANCHOR</div>
            <div className="chronos-anchor-sub">锚点 · 你们开始的那一天</div>
            <div className="chronos-anchor-rule" aria-hidden="true" />

            <div className="chronos-anchor-readout">
              {previewDays != null ? (
                <>
                  <div className="chronos-anchor-num">{previewDays}</div>
                  <div className="chronos-anchor-unit">在一起的第 {previewDays} 天</div>
                </>
              ) : (
                <div className="chronos-anchor-blank">还没有锚点<br />选一个对你们有意义的日子</div>
              )}
            </div>

            <label className="chronos-anchor-field">
              <span className="chronos-anchor-field-label">起始日</span>
              <input
                type="date"
                className="chronos-anchor-input"
                value={anchorInput}
                onChange={e => setAnchorInput(e.target.value)}
              />
            </label>

            {anchorDate && anchorInput && anchorInput !== anchorDate && (
              <div className="chronos-anchor-note">现在是 {anchorDate}，保存后改成 {anchorInput}</div>
            )}

            <button className="chronos-anchor-save" onClick={submitAnchor} disabled={!anchorInput}>
              {anchorDate ? '重新锚定' : '锚定这一天'}
            </button>
            <button className="chronos-anchor-cancel" onClick={closeSheet}>关闭</button>
          </div>
        </div>
      )}

      {/* ── 新增倒计时：全屏页面 ── */}
      {sheet === 'add-countdown' && (
        <ChronosAddOrbitPage
          label={cdLabel} setLabel={setCdLabel}
          date={cdDate} setDate={setCdDate}
          onSubmit={submitCountdown}
          onClose={closeSheet}
        />
      )}

      {/* ── 倒计时详情 / 删除 ── */}
      {sheet?.type === 'countdown-detail' && (
        <div className="modal-veil chronos-sheet-veil" onClick={closeSheet}>
          <div className="modal-card chronos-sheet-card" onClick={e => e.stopPropagation()}>
            <div className="modal-title" style={{ marginBottom: 14 }}>{sheet.item.label}</div>
            <div className="sensitivity-hint" style={{ marginBottom: 4 }}>目标时间 · {sheet.item.target_at.replace('T', ' ').slice(0, 16)}</div>
            <button className="line-btn" style={{ width: '100%', marginTop: 16, padding: '12px 0', borderRadius: '14px', fontSize: '12px', letterSpacing: '2px', color: '#d98a7a', borderColor: 'rgba(217,138,122,.4)' }} onClick={() => deleteCountdown(sheet.item.id)}>
              移出轨道
            </button>
            <button className="line-btn" style={{ width: '100%', marginTop: 10, padding: '11px 0', borderRadius: '999px', fontSize: '11.5px', letterSpacing: '2px', color: 'var(--c-text-muted)' }} onClick={closeSheet}>关闭</button>
          </div>
        </div>
      )}

      {/* ── 潮汐 · 经期记录面板 ── */}
      {sheet === 'period' && (
        <div className="modal-veil chronos-sheet-veil" onClick={closeSheet}>
          <div className="modal-card chronos-sheet-card" onClick={e => e.stopPropagation()}>
            <div className="modal-title" style={{ marginBottom: 14 }}>TIDE · 潮汐记录</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input type="date" className="field-input" placeholder="开始" value={periodInput} onChange={e => setPeriodInput(e.target.value)} />
              <input type="date" className="field-input" placeholder="结束（可选）" value={periodEndInput} onChange={e => setPeriodEndInput(e.target.value)} />
            </div>
            <button className="solid-btn" style={{ width: '100%', marginTop: 12, padding: '12px 0', borderRadius: '14px', fontSize: '12px', letterSpacing: '2px' }} onClick={addPeriodLog}>记录</button>

            <div className="beacon-list" style={{ maxHeight: '30vh', overflowY: 'auto', marginTop: 14 }}>
              {periodLogs.length === 0 && <div className="beacon-empty">暂无记录</div>}
              {sortedAsc.slice().reverse().map(p => (
                <div key={p.id} className="beacon-item">
                  <span className="beacon-text">{p.start_date}{p.end_date ? ` ～ ${p.end_date}` : ''}</span>
                  <span className="icon-btn" onClick={() => deletePeriodLog(p.id)} style={{ cursor: 'pointer', color: 'var(--c-text-faint)', padding: '4px' }}>×</span>
                </div>
              ))}
            </div>

            <button className="line-btn" style={{ width: '100%', marginTop: 12, padding: '11px 0', borderRadius: '999px', fontSize: '11.5px', letterSpacing: '2px', color: 'var(--c-text-muted)' }} onClick={closeSheet}>关闭</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default ChronosPage
