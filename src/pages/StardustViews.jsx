/**
 * StardustViews — 星尘顶部标签里三个"读文字"的视图
 *
 *   TRACES  时间线：把深空里那些光点按时间摊平成可读的列表
 *   BREATH  搜索与历史：一次呼吸就是一次回想，纯前端，零 AI 调用
 *   NOON    高光：一天里最亮的那一刻，只留五条
 *
 * 三个视图共用 dustCommon 的度量与配色，所以同一条记忆在深空里是什么
 * 颜色、有多亮，在这里就是同一个颜色、同一个亮度。
 */
import { useMemo, useState, useEffect } from 'react'
import {
  clamp, domainColor, domainStats, trimSummary, daysLabel, daysOf, daysForPlot,
  bucketOf, DAY_BUCKETS, importanceNormSafe, importanceText, warmth,
  highlightScore, matchMemory, vividness, emotionIntensity,
  loadSearchHistory, pushSearchHistory, clearSearchHistory,
} from './dustCommon'

// ── 通用记忆条目 ──────────────────────────────────────────────
const MemoryRow = ({ mem, query, onSelect, rank }) => {
  const color = domainColor(mem.domain)
  const vivid = vividness(mem)
  const warm = warmth(mem)

  // 命中的关键词在正文里点亮，不换行不加粗，只是亮一点
  const body = (mem.summary || '').trim() || '（这段记忆没有留下文字）'
  const q = (query || '').trim()
  let content = body
  if (q) {
    const idx = body.toLowerCase().indexOf(q.toLowerCase())
    if (idx >= 0) {
      content = (
        <>
          {body.slice(0, idx)}
          <span className="dust-hit">{body.slice(idx, idx + q.length)}</span>
          {body.slice(idx + q.length)}
        </>
      )
    }
  }

  return (
    <button className="dust-row" onClick={() => onSelect && onSelect(mem)}>
      <span className="dust-row-mark">
        {rank ? <span className="dust-row-rank">{rank}</span> : null}
        <span
          className="dust-row-dot"
          style={{
            background: warm > 0.3 ? '#f2c98c' : color,
            opacity: 0.28 + vivid * 0.72,
            boxShadow: `0 0 ${4 + vivid * 9}px ${warm > 0.3 ? 'rgba(242,201,140,.55)' : color}`,
          }}
        />
      </span>
      <span className="dust-row-body">
        <span className="dust-row-text" style={{ opacity: 0.42 + vivid * 0.58 }}>{content}</span>
        <span className="dust-row-meta">
          <span style={{ color }}>{mem.domain || '未归域'}</span>
          <span>{daysLabel(daysOf(mem))}</span>
          {Number.isFinite(mem.importance) && <span>重要度 {importanceText(mem)}</span>}
          {mem.pinned === true && <span className="dust-row-pin">置顶</span>}
        </span>
      </span>
    </button>
  )
}

const EmptyNote = ({ title, sub }) => (
  <div className="dust-empty">
    <div className="dust-empty-title">{title}</div>
    {sub && <div className="dust-empty-sub">{sub}</div>}
  </div>
)

// ── TRACES · 时间线 ───────────────────────────────────────────
export const TracesView = ({ memories, searchQuery, onSelect }) => {
  const groups = useMemo(() => {
    const filtered = memories.filter(m => matchMemory(m, searchQuery))
    const map = new Map()
    filtered.forEach(m => {
      const b = bucketOf(m)
      if (!map.has(b.key)) map.set(b.key, { ...b, items: [] })
      map.get(b.key).items.push(m)
    })
    const out = [...map.values()].sort((a, b) => a.order - b.order)
    // 组内按活跃时间从近到远；缺时间戳的走 3 天兜底，跟分组用的是同一个值，
    // 不会出现"分到本周却排在最后面"的怪现象
    out.forEach(g => g.items.sort((a, b) => daysForPlot(a) - daysForPlot(b)))
    return out
  }, [memories, searchQuery])

  if (!groups.length) {
    return <EmptyNote title={searchQuery ? '没有落在这段时间里的记忆' : '时间线上还没有痕迹'}
      sub={searchQuery ? '换个词试试' : '对话中会自然沉积'} />
  }

  return (
    <div className="dust-scroll">
      {groups.map(g => (
        <section key={g.key} className="dust-group">
          <header className="dust-group-head">
            <span className="dust-group-label">{g.label}</span>
            <span className="dust-group-rule" />
            <span className="dust-group-count">{g.items.length}</span>
          </header>
          {g.items.map((m, i) => (
            <MemoryRow key={m.bucketId || `${g.key}-${i}`} mem={m}
              query={searchQuery} onSelect={onSelect} />
          ))}
        </section>
      ))}
      <div className="dust-scroll-tail" />
    </div>
  )
}

// ── BREATH · 搜索与历史 ───────────────────────────────────────
export const BreathView = ({ memories, searchQuery, onSearchChange, onSelect }) => {
  const [history, setHistory] = useState(() => loadSearchHistory())
  const [draft, setDraft] = useState(searchQuery || '')

  useEffect(() => { setDraft(searchQuery || '') }, [searchQuery])

  const commit = (value) => {
    const v = (value ?? draft).trim()
    onSearchChange(v)
    if (v) setHistory(pushSearchHistory(v))
  }

  const domains = useMemo(() => domainStats(memories).slice(0, 6), [memories])

  const results = useMemo(() => {
    const q = (searchQuery || '').trim()
    if (!q) return []
    return memories
      .filter(m => matchMemory(m, q))
      .sort((a, b) => highlightScore(b) - highlightScore(a))
  }, [memories, searchQuery])

  return (
    <div className="dust-scroll">
      <div className="dust-breath-field">
        <input
          className="field-input dust-breath-input"
          placeholder="回想些什么…"
          value={draft}
          onChange={e => { setDraft(e.target.value); onSearchChange(e.target.value) }}
          onKeyDown={e => { if (e.key === 'Enter') { commit(); e.currentTarget.blur() } }}
          onBlur={() => commit()}
        />
        {draft && (
          <button className="dust-breath-clear" onClick={() => { setDraft(''); onSearchChange('') }}>清空</button>
        )}
      </div>

      {history.length > 0 && (
        <section className="dust-group">
          <header className="dust-group-head">
            <span className="dust-group-label">RECENT</span>
            <span className="dust-group-rule" />
            <button className="dust-group-action" onClick={() => setHistory(clearSearchHistory())}>清除</button>
          </header>
          <div className="dust-chip-row">
            {history.map(h => (
              <button key={h} className="dust-chip" onClick={() => { setDraft(h); commit(h) }}>{h}</button>
            ))}
          </div>
        </section>
      )}

      {domains.length > 0 && (
        <section className="dust-group">
          <header className="dust-group-head">
            <span className="dust-group-label">DOMAINS</span>
            <span className="dust-group-rule" />
          </header>
          <div className="dust-chip-row">
            {domains.map(({ domain, count, color }) => (
              <button key={domain} className="dust-chip" style={{ '--chip': color }}
                onClick={() => { setDraft(domain); commit(domain) }}>
                <span className="dust-chip-dot" />
                {domain}
                <span className="dust-chip-num">{count}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="dust-group">
        <header className="dust-group-head">
          <span className="dust-group-label">{searchQuery ? 'ECHO' : 'WAITING'}</span>
          <span className="dust-group-rule" />
          {searchQuery && <span className="dust-group-count">{results.length}</span>}
        </header>
        {!searchQuery && <EmptyNote title="尚未交汇" sub="输入一个词，让它去找对应的光" />}
        {searchQuery && results.length === 0 && <EmptyNote title="这一片没有回声" sub="也许它已经沉得太深" />}
        {results.map((m, i) => (
          <MemoryRow key={m.bucketId || i} mem={m}
            query={searchQuery} onSelect={onSelect} />
        ))}
      </section>
      <div className="dust-scroll-tail" />
    </div>
  )
}

// ── NOON · 高光五条 ───────────────────────────────────────────
const NOON_NUM = ['Ⅰ', 'Ⅱ', 'Ⅲ', 'Ⅳ', 'Ⅴ']

export const NoonView = ({ memories, searchQuery, onSelect }) => {
  const top = useMemo(() => {
    return [...memories]
      .filter(m => matchMemory(m, searchQuery))
      .map(m => ({ mem: m, score: highlightScore(m) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
  }, [memories, searchQuery])

  if (!top.length) {
    return <EmptyNote title="正午还没有到来" sub="等记忆多一些，最亮的那几条会自己浮上来" />
  }

  return (
    <div className="dust-scroll">
      <div className="dust-noon-intro">
        一天里光最足的时刻。按重要度、情绪强度与鲜明程度挑出五条，
        它们会随着记忆的增减自己换位。
      </div>
      {top.map(({ mem, score }, i) => {
        const color = domainColor(mem.domain)
        const imp = importanceNormSafe(mem)
        const emo = emotionIntensity(mem)
        return (
          <button key={mem.bucketId || i} className="dust-noon-card" onClick={() => onSelect && onSelect(mem)}
            style={{ '--glow': `${clamp(score, 0, 1) * 0.5 + 0.12}` }}>
            <span className="dust-noon-rank">{NOON_NUM[i]}</span>
            <span className="dust-noon-body">
              <span className="dust-noon-text">{trimSummary(mem.summary, 96)}</span>
              <span className="dust-noon-bars">
                <span className="dust-noon-bar">
                  <i style={{ width: `${imp * 100}%`, background: '#f2c98c' }} />
                  <em>重要度 {importanceText(mem)}</em>
                </span>
                <span className="dust-noon-bar">
                  <i style={{ width: `${emo * 100}%`, background: color }} />
                  <em>情绪强度</em>
                </span>
                <span className="dust-noon-bar">
                  <i style={{ width: `${vividness(mem) * 100}%`, background: 'var(--c-text-muted)' }} />
                  <em>鲜明度</em>
                </span>
              </span>
              <span className="dust-row-meta">
                <span style={{ color }}>{mem.domain || '未归域'}</span>
                <span>{daysLabel(daysOf(mem))}</span>
              </span>
            </span>
          </button>
        )
      })}
      <div className="dust-scroll-tail" />
    </div>
  )
}

export { DAY_BUCKETS }
