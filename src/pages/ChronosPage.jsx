import { useState, useEffect } from 'react'
import axios from 'axios'

const API_BASE = 'https://ke-shu-backend.onrender.com/api'

// ============================================================
// 时轨 · CHRONOS —— 全屏子页面，从引力页点「时轨」天体跃迁进入
// 三块：锚点（在一起第几天）、潮汐（经期记录 + 月相 + 周期预测）、
// 自定义倒计时。月相是纯前端算法，不查表不调接口；其余数据走
// server.js 里新增的 /api/countdown(s)、/api/period/*、
// 以及复用已有的 /api/settings（存 anchor_date）。
// ============================================================

const SYNODIC_MONTH = 29.530588861   // 朔望月，天
const KNOWN_NEW_MOON = Date.UTC(2000, 0, 6, 18, 14)   // 一个公认的新月时刻，作基准
const MOON_NAMES = ['新月', '娥眉月', '上弦月', '盈凸月', '满月', '亏凸月', '下弦月', '残月']

function moonPhaseInfo(date = new Date()) {
  const days = (date.getTime() - KNOWN_NEW_MOON) / 86400000
  const age = ((days % SYNODIC_MONTH) + SYNODIC_MONTH) % SYNODIC_MONTH
  const frac = age / SYNODIC_MONTH
  return { frac, age, name: MOON_NAMES[Math.floor(frac * 8) % 8] }
}

const daysBetween = (a, b) => Math.round((b.getTime() - a.getTime()) / 86400000)

const ChronosPage = ({ onClose, showToast }) => {
  const [tab, setTab] = useState('anchor')   // anchor | tide | countdown
  const [loading, setLoading] = useState(true)

  const [anchorDate, setAnchorDate] = useState('')
  const [anchorInput, setAnchorInput] = useState('')

  const [periodLogs, setPeriodLogs] = useState([])
  const [periodInput, setPeriodInput] = useState('')

  const [countdowns, setCountdowns] = useState([])
  const [cdLabel, setCdLabel] = useState('')
  const [cdDate, setCdDate] = useState('')

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        const [sRes, pRes, cRes] = await Promise.all([
          axios.get(`${API_BASE}/settings`),
          axios.get(`${API_BASE}/period/list`),
          axios.get(`${API_BASE}/countdowns`),
        ])
        if (!alive) return
        setAnchorDate(sRes.data?.anchor_date || '')
        setPeriodLogs(pRes.data || [])
        setCountdowns(cRes.data || [])
      } catch (e) { showToast?.('时轨数据加载失败') }
      finally { if (alive) setLoading(false) }
    })()
    return () => { alive = false }
  }, [])

  const saveAnchor = async () => {
    if (!anchorInput) return
    try {
      await axios.post(`${API_BASE}/settings`, { anchor_date: anchorInput })
      setAnchorDate(anchorInput); setAnchorInput('')
      showToast?.('锚点已设定')
    } catch (e) { showToast?.('保存失败：' + e.message) }
  }

  const addPeriodLog = async () => {
    if (!periodInput) return
    try {
      const { data } = await axios.post(`${API_BASE}/period/log`, { start_date: periodInput })
      setPeriodLogs(prev => [data, ...prev].sort((a, b) => b.start_date.localeCompare(a.start_date)))
      setPeriodInput('')
    } catch (e) { showToast?.('记录失败：' + e.message) }
  }
  const deletePeriodLog = async (id) => {
    try { await axios.delete(`${API_BASE}/period/${id}`); setPeriodLogs(prev => prev.filter(p => p.id !== id)) }
    catch (e) { showToast?.('删除失败：' + e.message) }
  }

  const addCountdown = async () => {
    if (!cdLabel.trim() || !cdDate) return
    try {
      const { data } = await axios.post(`${API_BASE}/countdown`, { label: cdLabel.trim(), target_at: cdDate })
      setCountdowns(prev => [...prev, data].sort((a, b) => a.target_at.localeCompare(b.target_at)))
      setCdLabel(''); setCdDate('')
    } catch (e) { showToast?.('新增失败：' + e.message) }
  }
  const deleteCountdown = async (id) => {
    try { await axios.delete(`${API_BASE}/countdown/${id}`); setCountdowns(prev => prev.filter(c => c.id !== id)) }
    catch (e) { showToast?.('删除失败：' + e.message) }
  }

  // 在一起第几天：锚点当天算第 1 天
  const anchorDays = anchorDate ? daysBetween(new Date(anchorDate), new Date()) + 1 : null

  // 周期预测：拿最近几次的间隔天数取平均，加到最后一次开始日期上
  const sortedAsc = [...periodLogs].sort((a, b) => a.start_date.localeCompare(b.start_date))
  const gaps = sortedAsc.slice(1).map((p, i) => daysBetween(new Date(sortedAsc[i].start_date), new Date(p.start_date)))
  const recentGaps = gaps.slice(-6)
  const avgCycle = recentGaps.length ? Math.round(recentGaps.reduce((a, b) => a + b, 0) / recentGaps.length) : null
  const lastStart = sortedAsc[sortedAsc.length - 1]?.start_date
  const predictedNext = (lastStart && avgCycle) ? new Date(new Date(lastStart).getTime() + avgCycle * 86400000) : null

  const moon = moonPhaseInfo()

  return (
    <div className="chronos-page">
      <div className="chronos-header">
        <button className="chronos-back" onClick={onClose} aria-label="关闭">‹</button>
        <div className="chronos-title">CHRONOS · 时轨</div>
        <span className="chronos-header-spacer" />
      </div>

      <div className="chronos-tabbar">
        {[['anchor', '锚点'], ['tide', '潮汐'], ['countdown', '倒计时']].map(([k, label]) => (
          <button key={k} className={`chronos-tab${tab === k ? ' is-active' : ''}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      <div className="chronos-body">
        {loading && <div className="beacon-empty">正在读取…</div>}

        {!loading && tab === 'anchor' && (
          <div className="chronos-section">
            {anchorDate ? (
              <div className="chronos-anchor-display">
                <div className="chronos-anchor-days">{anchorDays}</div>
                <div className="chronos-anchor-caption">在一起的第 {anchorDays} 天</div>
                <div className="chronos-anchor-since">自 {anchorDate}</div>
              </div>
            ) : (
              <div className="beacon-empty">还没有设定锚点</div>
            )}
            <div className="beacon-add-row">
              <input type="date" className="field-input" value={anchorInput} onChange={e => setAnchorInput(e.target.value)} />
              <button className="line-btn" onClick={saveAnchor} style={{ padding: '0 16px', borderRadius: '12px', fontSize: '13px' }}>{anchorDate ? '重设' : '设定'}</button>
            </div>
          </div>
        )}

        {!loading && tab === 'tide' && (
          <div className="chronos-section">
            <div className="chronos-moon">
              <span className="chronos-moon-disc" style={{ '--moon-frac': moon.frac }} />
              <div className="chronos-moon-name">{moon.name}</div>
            </div>
            {predictedNext && (
              <div className="chronos-predict">预计下次开始 · {predictedNext.toISOString().slice(0, 10)}（平均周期 {avgCycle} 天）</div>
            )}
            <div className="beacon-add-row">
              <input type="date" className="field-input" value={periodInput} onChange={e => setPeriodInput(e.target.value)} />
              <button className="line-btn" onClick={addPeriodLog} style={{ padding: '0 16px', borderRadius: '12px', fontSize: '13px' }}>记录</button>
            </div>
            <div className="beacon-list">
              {periodLogs.length === 0 && <div className="beacon-empty">暂无记录</div>}
              {periodLogs.map(p => (
                <div key={p.id} className="beacon-item">
                  <span className="beacon-text">{p.start_date}</span>
                  <span className="icon-btn" onClick={() => deletePeriodLog(p.id)} style={{ cursor: 'pointer', color: 'var(--c-text-faint)', padding: '4px' }}>×</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {!loading && tab === 'countdown' && (
          <div className="chronos-section">
            <div className="beacon-add-row">
              <input className="field-input" placeholder="标题" value={cdLabel} onChange={e => setCdLabel(e.target.value)} style={{ flex: 1.4 }} />
              <input type="datetime-local" className="field-input" value={cdDate} onChange={e => setCdDate(e.target.value)} />
              <button className="line-btn" onClick={addCountdown} style={{ padding: '0 16px', borderRadius: '12px', fontSize: '13px' }}>+</button>
            </div>
            <div className="beacon-list">
              {countdowns.length === 0 && <div className="beacon-empty">暂无倒计时</div>}
              {countdowns.map(c => {
                const d = daysBetween(new Date(), new Date(c.target_at))
                return (
                  <div key={c.id} className="beacon-item">
                    <span className="beacon-text">{c.label}</span>
                    <span className="chronos-countdown-days">{d >= 0 ? `还剩 ${d} 天` : `已过 ${-d} 天`}</span>
                    <span className="icon-btn" onClick={() => deleteCountdown(c.id)} style={{ cursor: 'pointer', color: 'var(--c-text-faint)', padding: '4px' }}>×</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default ChronosPage
