import { useState, useEffect, useRef, useCallback, Suspense } from 'react'
import axios from 'axios'
import StarCanvas from './StarCanvas'

// ============================================================
// Markdown 轻量渲染器（0依赖，保留原有实现）
// ============================================================
const MarkdownText = ({ text }) => {
  if (!text) return null
  const parts = []
  const codeBlockRegex = /```([\s\S]*?)```/g
  let lastIndex = 0, match
  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push({ type: 'text', content: text.slice(lastIndex, match.index) })
    parts.push({ type: 'code', content: match[1].trim() })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) parts.push({ type: 'text', content: text.slice(lastIndex) })

  const renderInline = (str) => {
    const html = str
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    return <span dangerouslySetInnerHTML={{ __html: html }} />
  }

  const renderTextBlock = (content) => {
    const lines = content.split('\n')
    const result = []
    let i = 0
    while (i < lines.length) {
      const line = lines[i]
      if (/^[-*•]\s*/.test(line.trim())) {
        const items = []
        while (i < lines.length && /^[-*•]\s*/.test(lines[i].trim())) { items.push(lines[i].trim().replace(/^[-*•]\s*/, '')); i++ }
        result.push(<ul key={`ul-${i}`} style={{ margin: '4px 0', paddingLeft: '18px' }}>{items.map((item, idx) => <li key={idx} style={{ marginBottom: '2px' }}>{renderInline(item)}</li>)}</ul>)
        continue
      }
      if (/^\d+[\.、]\s*/.test(line.trim())) {
        const items = []
        while (i < lines.length && /^\d+[\.、]\s*/.test(lines[i].trim())) { items.push(lines[i].trim().replace(/^\d+[\.、]\s*/, '')); i++ }
        result.push(<ol key={`ol-${i}`} style={{ margin: '4px 0', paddingLeft: '18px' }}>{items.map((item, idx) => <li key={idx} style={{ marginBottom: '2px' }}>{renderInline(item)}</li>)}</ol>)
        continue
      }
      if (/^>\s*/.test(line.trim())) {
        const items = []
        while (i < lines.length && /^>\s*/.test(lines[i].trim())) { items.push(lines[i].trim().replace(/^>\s*/, '')); i++ }
        result.push(<blockquote key={`bq-${i}`} style={{ borderLeft: '2px solid var(--c-accent)', paddingLeft: '10px', margin: '4px 0', color: 'var(--c-text-muted)', fontStyle: 'italic' }}>{items.map((item, idx) => <div key={idx}>{renderInline(item)}</div>)}</blockquote>)
        continue
      }
      if (line.trim() === '') { result.push(<div key={`sp-${i}`} style={{ height: '6px' }} />) }
      else { result.push(<p key={`p-${i}`} style={{ margin: '2px 0' }}>{renderInline(line)}</p>) }
      i++
    }
    return result
  }

  return (
    <div className="markdown-body">
      {parts.map((part, idx) => {
        if (part.type === 'code') return (
          <pre key={idx} style={{ background: 'rgba(0,0,0,0.38)', borderRadius: '10px', padding: '12px 14px', overflowX: 'auto', fontSize: '12.5px', lineHeight: '1.6', fontFamily: 'SF Mono, Monaco, "Courier New", monospace', color: '#e8e6e3', border: '1px solid rgba(255,255,255,0.06)', margin: '8px 0' }}>
            <code>{part.content}</code>
          </pre>
        )
        return <div key={idx}>{renderTextBlock(part.content)}</div>
      })}
    </div>
  )
}

// ============================================================
// 常量 & 配置
// ============================================================
const API_BASE = 'https://ke-shu-backend.onrender.com/api'

// ============================================================
// 密码锁（B级）—— X-Access-Key 透传
// ============================================================
const ACCESS_KEY_STORAGE = 'ks_access_key'

axios.interceptors.request.use(config => {
  if (config.method === 'get') config.params = { ...config.params, _t: Date.now() }
  const key = localStorage.getItem(ACCESS_KEY_STORAGE)
  if (key) config.headers['X-Access-Key'] = key
  return config
})

axios.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem(ACCESS_KEY_STORAGE)
      window.location.reload()
    }
    return Promise.reject(err)
  }
)

// ============================================================
// 引用 / 编辑 标记解析 —— 仅作为兼容早期版本遗留数据的兜底
// （早期版本曾把引用/编辑状态用零宽字符编码进 content 字段；
//   现在 messages 表已有 quoted_text / is_edited 等真实列，
//   新消息一律走真实列，这里只在旧数据里还带标记时兜底剥离）
// ============================================================
const QUOTE_MARK  = '\u2063QUOTE\u2063'
const EDITED_MARK = '\u2063EDITED\u2063'

function parseMsgContent(raw) {
  if (!raw) return { body: raw || '', quoted: null, edited: false }
  let text = raw, edited = false, quoted = null
  if (text.startsWith(EDITED_MARK)) { edited = true; text = text.slice(EDITED_MARK.length) }
  if (text.startsWith(QUOTE_MARK)) {
    const closeIdx = text.indexOf(QUOTE_MARK, QUOTE_MARK.length)
    if (closeIdx > -1) {
      quoted = text.slice(QUOTE_MARK.length, closeIdx)
      text   = text.slice(closeIdx + QUOTE_MARK.length)
    }
  }
  return { body: text, quoted, edited }
}

// 把后端返回的一条消息（quoted_text / is_edited / tokens_input / tokens_output / truncated
// 等真实列）归一化成前端内部统一使用的字段形状；对仍带旧版零宽标记的历史数据做兜底兼容。
function normalizeMsg(m) {
  if (!m) return m
  const legacy = parseMsgContent(m.content)
  return {
    ...m,
    content: legacy.body,
    quoted: m.quoted_text ?? legacy.quoted ?? null,
    edited: !!m.is_edited || legacy.edited,
    truncated: !!m.truncated,
    tokens: (m.tokens_input != null || m.tokens_output != null) ? { input: m.tokens_input, output: m.tokens_output } : null,
  }
}

const MERGE_WINDOW_MS = 3000   // 输入合并防抖：3 秒内连续发送合并为一条

// 3 秒合并倒计时环形指示（发送按钮上极简的小圆点即可，见 composer 部分）

// 双主题（深空 noir / 昼梦 warm）
const THEMES       = ['noir', 'warm']
const THEME_LABELS = { noir: 'Deep Space', warm: 'Day Dream' }
const THEME_SUB    = { noir: '深空',  warm: '昼梦' }
const THEME_META   = { noir: '#000002', warm: '#060300' }

// Tab 定义
const TABS = [
  { id: 'orbit',     label: 'ORBIT',     labelCN: '星轨' },
  { id: 'stardust',  label: 'DUST',      labelCN: '星尘' },
  { id: 'origin',    label: '',          labelCN: '' },   // 中央"归"按钮占位
  { id: 'chronicle', label: 'LOG',       labelCN: '星历' },
  { id: 'constant',  label: 'CONST',     labelCN: '常数' },
]

// ============================================================
// 图标
// ============================================================
const Icon = {
  Orbit:     (p) => (<svg width={p.size||18} height={p.size||18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-30 12 12)"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/></svg>),
  Stardust:  (p) => (<svg width={p.size||18} height={p.size||18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="5"  cy="6"  r="1"   fill="currentColor" stroke="none" opacity=".6"/><circle cx="19" cy="5"  r="0.8" fill="currentColor" stroke="none" opacity=".5"/><circle cx="7"  cy="18" r="1.2" fill="currentColor" stroke="none" opacity=".7"/><circle cx="18" cy="17" r="0.9" fill="currentColor" stroke="none" opacity=".55"/><circle cx="14" cy="7"  r="0.7" fill="currentColor" stroke="none" opacity=".4"/><circle cx="9"  cy="13" r="0.6" fill="currentColor" stroke="none" opacity=".45"/></svg>),
  Chronicle: (p) => (<svg width={p.size||18} height={p.size||18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>),
  Constant:  (p) => (<svg width={p.size||18} height={p.size||18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>),
  Origin:    (p) => (<svg width={p.size||20} height={p.size||20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/></svg>),
  Edit:      (p) => (<svg width={p.size||14} height={p.size||14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>),
  Trash:     (p) => (<svg width={p.size||14} height={p.size||14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/></svg>),
  Plus:      (p) => (<svg width={p.size||14} height={p.size||14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>),
  Close:     (p) => (<svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19"/><line x1="19" y1="5" x2="5" y2="19"/></svg>),
  ArrowUp:   (p) => (<svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="6 11 12 5 18 11"/></svg>),
  Moon:      (p) => (<svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"/></svg>),
  Sun:       (p) => (<svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>),
  Speak:     (p) => (<svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><path d="M4 10v4"/><path d="M8 7v10"/><path d="M12 4v16"/><path d="M16 7v10"/><path d="M20 10v4"/></svg>),
  Copy:      (p) => (<svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="8" width="12" height="12" rx="1"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>),
  Refresh:   (p) => (<svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 16h5v5"/></svg>),
  Pause:     (p) => (<svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><line x1="10" y1="15" x2="10" y2="9"/><line x1="14" y1="15" x2="14" y2="9"/></svg>),
  Play:      (p) => (<svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"/></svg>),
  Brain:     (p) => (<svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/></svg>),
  Export:    (p) => (<svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>),
  Quote:     (p) => (<svg width={p.size||14} height={p.size||14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 8c-2.2 0-4 1.8-4 4s1.8 4 4 4c0-3-.5-5.5-2-8Z"/><path d="M17 8c-2.2 0-4 1.8-4 4s1.8 4 4 4c0-3-.5-5.5-2-8Z"/></svg>),
  Bookmark:  (p) => (<svg width={p.size||14} height={p.size||14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z"/></svg>),
  StopSquare:(p) => (<svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>),
  Chevron:   (p) => (<svg width={p.size||10} height={p.size||10} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ transform: p.open ? 'rotate(90deg)' : 'none', transition: 'transform .2s ease' }}><polyline points="9 6 15 12 9 18"/></svg>),
}

// ============================================================
// 头像
// ============================================================
const UserAvatar = ({ size = 28 }) => (
  <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, background: 'var(--c-glass-bg-user)', border: '1px solid var(--c-line-strong)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }} />
)

const AIAvatar = ({ size = 28, memoryPulse = false }) => (
  <div style={{ position: 'relative', width: size, height: size, borderRadius: '50%', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--c-line-strong)', background: 'var(--c-accent-soft)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}>
    <div style={{ width: size * 0.3, height: size * 0.3, borderRadius: '50%', background: 'var(--c-accent)', opacity: .85 }} />
    {memoryPulse && <div className="mem-pulse-ring" />}
  </div>
)

// ============================================================
// 密码锁 · 全屏密码输入层（B级）
// ============================================================
const AccessGate = ({ onUnlock }) => {
  const [value, setValue] = useState('')
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 260) }, [])

  const submit = async () => {
    if (!value.trim() || checking) return
    setChecking(true); setError('')
    try {
      await axios.post(`${API_BASE}/auth/verify`, { key: value.trim() })
      localStorage.setItem(ACCESS_KEY_STORAGE, value.trim())
      onUnlock()
    } catch {
      setError('密钥不对，再试一次')
      setValue('')
    }
    setChecking(false)
  }

  return (
    <div className="access-gate">
      <div className="access-gate-inner">
        <div className="access-gate-title">在场</div>
        <div className="access-gate-sub">只对你打开</div>
        <input
          ref={inputRef}
          type="password"
          className="access-gate-input"
          value={value}
          onChange={e => { setValue(e.target.value); setError('') }}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="密钥"
          autoComplete="off"
        />
        {error && <div className="access-gate-error">{error}</div>}
        <button className="access-gate-btn" onClick={submit} disabled={checking}>
          {checking ? '···' : 'ENTER'}
        </button>
      </div>
    </div>
  )
}

// ============================================================
// 开屏页（改为"在场"语感）
// ============================================================
const SPLASH_DUST_COUNT = 22
const SPLASH_PHRASE = ['still', 'here', '·', 'still', 'yours']

const SplashScreen = ({ onEnter, theme }) => {
  const [fadeOut, setFadeOut] = useState(false)
  const [visible, setVisible] = useState(true)
  const themeLabel = THEME_LABELS[theme] || 'Deep Space'
  const themeSub   = THEME_SUB[theme]   || '深空'
  const [dust] = useState(() => Array.from({ length: SPLASH_DUST_COUNT }).map((_, i) => ({ id: i, left: Math.random()*100, size: (1+Math.random()*2.4).toFixed(2), delay: (Math.random()*10).toFixed(2), duration: (11+Math.random()*10).toFixed(2), drift: Math.round((Math.random()-.5)*70) })))
  const [twinkles] = useState(() => Array.from({ length: 34 }).map((_, i) => ({ id: i, left: Math.random()*100, top: Math.random()*100, size: (.6+Math.random()*1.3).toFixed(2), delay: (Math.random()*6).toFixed(2), duration: (3+Math.random()*4).toFixed(2) })))

  const wordStep = 0.3
  const phraseDoneAt = 0.3 + SPLASH_PHRASE.length * wordStep + 0.5

  const handleClick = () => {
    setFadeOut(true)
    setTimeout(() => { setVisible(false); onEnter() }, 680)
  }

  if (!visible) return null

  return (
    <div className="splash-screen" style={{ opacity: fadeOut ? 0 : 1, transform: fadeOut ? 'scale(1.05)' : 'scale(1)', filter: fadeOut ? 'blur(8px)' : 'blur(0px)' }}>
      <div className="splash-dim" />
      <div className="splash-twinkle-field" aria-hidden="true">
        {twinkles.map(t => <span key={t.id} className="splash-twinkle" style={{ left: `${t.left}%`, top: `${t.top}%`, width: `${t.size}px`, height: `${t.size}px`, '--tw-duration': `${t.duration}s`, '--tw-delay': `${t.delay}s` }} />)}
      </div>
      <div className="splash-glow" style={{ animationDelay: `${phraseDoneAt+.3}s` }} aria-hidden="true" />
      <div className="splash-dust-field" aria-hidden="true">
        {dust.map(d => <span key={d.id} className="splash-dust" style={{ left: `${d.left}%`, width: `${d.size}px`, height: `${d.size}px`, '--dust-duration': `${d.duration}s`, '--dust-delay': `${d.delay}s`, '--dust-drift': `${d.drift}px` }} />)}
      </div>
      <div className="splash-headline">
        {SPLASH_PHRASE.map((w, i) => <span key={i} className="splash-word" style={{ animationDelay: `${.3+i*wordStep}s`, fontStyle: w === '·' ? 'normal' : 'italic', opacity: w === '·' ? undefined : undefined }}>{w}</span>)}
      </div>
      <div className="splash-shimmer" style={{ animationDelay: `${phraseDoneAt}s` }} aria-hidden="true" />
      <div className="splash-frame" aria-hidden="true">
        <span className="splash-corner splash-corner-tl" /><span className="splash-corner splash-corner-tr" />
        <span className="splash-corner splash-corner-bl" /><span className="splash-corner splash-corner-br" />
      </div>
      <div className="splash-foot">
        <div className="splash-ornament" style={{ animationDelay: `${phraseDoneAt+.15}s` }} aria-hidden="true">
          <span className="splash-ornament-line" /><span className="splash-ornament-dot" /><span className="splash-ornament-line" />
        </div>
        <div className="splash-rule" style={{ animationDelay: `${phraseDoneAt+.3}s, ${phraseDoneAt+1.2}s` }} />
        <div className="splash-theme-tag">
          {`${themeLabel} · ${themeSub}`.split('').map((ch, i) => <span key={i} className="splash-theme-char" style={{ animationDelay: `${phraseDoneAt+.5+i*.045}s` }}>{ch === ' ' ? '\u00A0' : ch}</span>)}
        </div>
        <button onClick={handleClick} className="splash-begin-btn" style={{ animationDelay: `${phraseDoneAt+1.05}s` }}>
          <span className="splash-begin-tick" /><span className="splash-begin-label">ENTER</span><span className="splash-begin-tick" />
        </button>
      </div>
    </div>
  )
}

// ============================================================
// 坠入空白模式
// ============================================================
const VOID_DRIFTS = [
  { w:3, h:3, top:'22%', left:'18%', dur:20, delay:0,  x0:-10, y0:0,   x1:25,  y1:-20, oa:0.09, om:0.19, ob:0.06 },
  { w:2, h:2, top:'55%', left:'72%', dur:26, delay:3,  x0:15,  y0:5,   x1:-20, y1:18,  oa:0.07, om:0.15, ob:0.05 },
  { w:4, h:4, top:'38%', left:'88%', dur:18, delay:7,  x0:0,   y0:-15, x1:18,  y1:10,  oa:0.11, om:0.22, ob:0.07 },
  { w:2, h:2, top:'70%', left:'12%', dur:22, delay:2,  x0:-8,  y0:12,  x1:14,  y1:-8,  oa:0.06, om:0.13, ob:0.05 },
  { w:3, h:3, top:'15%', left:'55%', dur:30, delay:10, x0:20,  y0:-5,  x1:-15, y1:22,  oa:0.08, om:0.16, ob:0.05 },
  { w:2, h:2, top:'82%', left:'44%', dur:24, delay:5,  x0:-12, y0:8,   x1:10,  y1:-14, oa:0.07, om:0.14, ob:0.05 },
]

const VoidScreen = ({ onWake }) => (
  <div className="void-screen" onClick={onWake}>
    {VOID_DRIFTS.map((d, i) => (
      <div key={i} className="void-drift" style={{
        width: d.w, height: d.h,
        top: d.top, left: d.left,
        '--vd-dur':   `${d.dur}s`,
        '--vd-delay': `${d.delay}s`,
        '--vd-x0': `${d.x0}px`, '--vd-y0': `${d.y0}px`,
        '--vd-x1': `${d.x1}px`, '--vd-y1': `${d.y1}px`,
        '--vd-oa': d.oa, '--vd-om': d.om, '--vd-ob': d.ob,
      }} />
    ))}
  </div>
)

// ============================================================
// 归 · 弹出菜单
// ============================================================
const OriginMenu = ({ onNavigate, onVoid, onClose }) => (
  <>
    <div className="origin-menu-veil" onClick={onClose} />
    <div className="origin-menu">
      <button className="origin-menu-item" onClick={() => { onNavigate('orbit');     onClose() }}>
        <span className="origin-menu-dot" /> ORBIT · 星轨
      </button>
      <button className="origin-menu-item" onClick={() => { onNavigate('stardust'); onClose() }}>
        <span className="origin-menu-dot" /> DUST · 星尘
      </button>
      <button className="origin-menu-item" onClick={() => { onNavigate('chronicle'); onClose() }}>
        <span className="origin-menu-dot" /> LOG · 星历
      </button>
      <button className="origin-menu-item is-void" onClick={() => { onVoid(); onClose() }}>
        坠入空白
      </button>
    </div>
  </>
)

// ============================================================
// 长按消息菜单（A级）
// items: [{ key, label, icon, onClick }]
// ============================================================
const MsgContextMenu = ({ x, y, items, onClose }) => {
  const menuRef = useRef(null)
  const [pos, setPos] = useState({ left: x, top: y })

  useEffect(() => {
    // 避免菜单超出视口
    const el = menuRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    let left = x, top = y
    if (left + rect.width  > window.innerWidth  - 12) left = window.innerWidth  - rect.width  - 12
    if (top  + rect.height > window.innerHeight - 12) top  = y - rect.height - 10
    if (left < 12) left = 12
    if (top  < 12) top  = 12
    setPos({ left, top })
  }, [x, y])

  return (
    <>
      <div className="msg-menu-veil" onClick={onClose} onContextMenu={e => { e.preventDefault(); onClose() }} />
      <div ref={menuRef} className="msg-context-menu" style={{ left: pos.left, top: pos.top }}>
        {items.map(item => (
          <button key={item.key} className="msg-context-item" onClick={() => { item.onClick(); onClose() }}>
            <span className="msg-context-icon">{item.icon}</span>
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </>
  )
}

// ============================================================
// 星历 · 日记页（B级：接入 /api/diary/list /api/diary/generate）
// ============================================================
const ChroniclePage = () => {
  const [diaries,  setDiaries]  = useState([])
  const [loading,  setLoading]  = useState(true)
  const [openDate, setOpenDate] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')

  const fetchDiaries = async () => {
    setLoading(true)
    try {
      const res = await axios.get(`${API_BASE}/diary/list`)
      setDiaries(res.data || [])
    } catch { setDiaries([]) }
    setLoading(false)
  }

  useEffect(() => { fetchDiaries() }, [])

  const formatDiaryDate = (dateStr) => {
    const d = new Date(`${dateStr}T00:00:00`)
    if (Number.isNaN(d.getTime())) return dateStr
    return `${d.getMonth() + 1} 月 ${d.getDate()} 日`
  }

  const generateToday = async () => {
    if (generating) return
    setGenerating(true); setGenError('')
    try {
      await axios.post(`${API_BASE}/diary/generate`, {})
      await fetchDiaries()
    } catch (err) {
      setGenError(err.response?.data?.error || '今天还没有足够的对话，写不出日记')
    }
    setGenerating(false)
  }

  return (
    <div className="tab-page">
      <div style={{ padding: '22px 20px 14px', flexShrink: 0, borderBottom: '1px solid var(--c-line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '15px', letterSpacing: '4px', color: 'var(--c-text)' }}>CHRONICLE</div>
          <div style={{ fontSize: '11px', letterSpacing: '1px', color: 'var(--c-text-faint)', marginTop: 6, fontFamily: 'var(--font-accent)', fontStyle: 'italic' }}>不属于你的日记本</div>
        </div>
        <button onClick={generateToday} disabled={generating} className="line-btn" style={{ padding: '9px 16px', borderRadius: '999px', fontSize: '10.5px', letterSpacing: '1.5px', whiteSpace: 'nowrap' }}>
          {generating ? '生长中…' : '✦ 写今日'}
        </button>
      </div>

      {genError && <div style={{ padding: '10px 20px 0', fontSize: '11px', color: 'var(--c-accent-2)', letterSpacing: '.3px' }}>{genError}</div>}

      <div style={{ flex: 1, overflowY: 'auto', padding: '18px 0' }}>
        {loading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
            <div className="breath-dot" />
          </div>
        )}
        {!loading && diaries.length === 0 && (
          <div className="chronicle-empty">
            <div style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid var(--c-line)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--c-text-faint)', marginBottom: 8 }}>
              <Icon.Chronicle size={16} />
            </div>
            <div className="chronicle-empty-label">频率空白</div>
            <div style={{ fontSize: '11px', color: 'var(--c-text-faint)', lineHeight: 1.8, fontFamily: 'var(--font-accent)', letterSpacing: '.5px', maxWidth: 200, fontStyle: 'italic' }}>
              日记在深夜生长<br />有记录的日子，才会发光
            </div>
          </div>
        )}
        {!loading && diaries.map(d => {
          const open = openDate === d.date
          return (
            <div key={d.date} className="diary-item" onClick={() => setOpenDate(open ? null : d.date)}>
              <div className="diary-item-head">
                <span className="diary-item-dot" />
                <span className="diary-item-date">{formatDiaryDate(d.date)}</span>
              </div>
              {open
                ? <div className="diary-item-body">{d.content}</div>
                : <div className="diary-item-preview">{d.content}</div>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================
// 星尘 · 占位页（后续接入 Three.js 3D 粒子）
// ============================================================
const StardustPage = ({ memories, memoriesLoading, onFetch, onDream }) => (
  <div className="tab-page">
    {/* 顶部标签栏 */}
    <div style={{ padding: '22px 20px 0', display: 'flex', gap: 14, overflowX: 'auto', flexShrink: 0, borderBottom: '1px solid var(--c-line)' }}>
      {['REVERIE', 'CONSTELLATIONS'].map((label, i) => (
        <button key={label} style={{
          background: 'transparent', border: 'none',
          fontFamily: 'var(--font-accent)', fontSize: '10px', letterSpacing: '2.5px',
          color: i === 0 ? 'var(--c-accent)' : 'var(--c-text-faint)',
          paddingBottom: '12px', cursor: 'pointer',
          borderBottom: i === 0 ? '1px solid var(--c-accent)' : 'none',
          whiteSpace: 'nowrap', transition: 'color 0.2s',
        }}>{label}</button>
      ))}
      {['TRACES','BREATH','DRIFT','ECHOES','NOON','FRAGMENTS','AXIS'].map(label => (
        <button key={label} style={{ background: 'transparent', border: 'none', fontFamily: 'var(--font-accent)', fontSize: '10px', letterSpacing: '2.5px', color: 'var(--c-text-faint)', paddingBottom: '12px', cursor: 'default', whiteSpace: 'nowrap', opacity: .4 }}>{label}</button>
      ))}
    </div>

    {/* 记忆列表 */}
    <div style={{ flex: 1, overflowY: 'auto', padding: '18px 0' }}>
      {memoriesLoading && (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '40px 0' }}>
          <div className="breath-dot" />
        </div>
      )}
      {!memoriesLoading && memories.length === 0 && (
        <div style={{ padding: '40px 24px', textAlign: 'center', color: 'var(--c-text-faint)', fontSize: '12px', lineHeight: 1.8, fontFamily: 'var(--font-accent)', letterSpacing: '.5px', fontStyle: 'italic' }}>
          记忆池尚空<br />对话中会自然沉积
        </div>
      )}
      {!memoriesLoading && memories.map((mem, i) => (
        <div key={i} className="memory-card">
          <div className="memory-dot" />
          <div className="memory-text">{mem}</div>
        </div>
      ))}
    </div>

    <div className="hairline-top" style={{ padding: '12px 18px', flexShrink: 0, display: 'flex', gap: 10 }}>
      <button onClick={onFetch} className="line-btn" style={{ flex: 1, padding: '10px', borderRadius: '999px', fontSize: '11px', color: 'var(--c-text-muted)', borderColor: 'var(--c-line)', letterSpacing: '2px' }}>
        ↻ 刷新
      </button>
      <button onClick={onDream} className="line-btn" style={{ flex: 2, padding: '10px', borderRadius: '999px', fontSize: '11px', color: 'var(--c-text-muted)', borderColor: 'var(--c-line)', letterSpacing: '2px' }}>
        ✦ 让记忆沉淀
      </button>
    </div>
  </div>
)

// ============================================================
// 常数 · 设置页
// ============================================================
const ConstantPage = ({ config, setConfig, theme, setTheme, voices, selectedVoiceURI, setSelectedVoiceURI,
  onSave, onExport, onRefreshVoices, showToast }) => {
  return (
    <div className="tab-page">
      <div style={{ padding: '28px 22px 14px', flexShrink: 0, borderBottom: '1px solid var(--c-line)' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '15px', letterSpacing: '4px', color: 'var(--c-text)' }}>CONSTANT</div>
        <div style={{ fontSize: '11px', letterSpacing: '1.5px', color: 'var(--c-text-faint)', marginTop: 6, fontFamily: 'var(--font-accent)', fontStyle: 'italic' }}>调整宇宙的法则</div>
      </div>

      <div className="constant-page">

        {/* 外观 */}
        <div className="constant-section">
          <div className="constant-section-title">Appearance · 外观</div>
          <div style={{ display: 'flex', gap: 10 }}>
            {THEMES.map(t => (
              <button key={t} onClick={() => setTheme(t)}
                className={theme === t ? 'solid-btn' : 'line-btn'}
                style={{ flex: 1, padding: '14px 0', borderRadius: '14px', fontSize: '11.5px', lineHeight: 1.5, letterSpacing: '1.5px' }}
              >
                {THEME_LABELS[t]}
                <div style={{ fontSize: '10px', opacity: .65, letterSpacing: '1px', fontFamily: 'var(--font-body)', marginTop: 3 }}>{THEME_SUB[t]}</div>
              </button>
            ))}
          </div>
        </div>

        {/* 对话 */}
        <div className="constant-section">
          <div className="constant-section-title">Orbit · 星轨对话</div>
          <div className="const-switch-row">
            <div>
              <div className="const-switch-label">显示思考过程</div>
              <div className="const-switch-sub">默认展开 DeepSeek 的 reasoning_content（关闭则始终折叠）</div>
            </div>
            <button
              className={`const-switch${config.show_reasoning ? ' is-on' : ''}`}
              onClick={() => { const next = { ...config, show_reasoning: !config.show_reasoning }; setConfig(next); onSave(next) }}
            >
              <span className="const-switch-knob" />
            </button>
          </div>
        </div>

        {/* 语音 */}
        <div className="constant-section">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div className="constant-section-title" style={{ borderBottom: 'none', paddingBottom: 0 }}>Voice · 音色</div>
            <span onClick={onRefreshVoices} style={{ cursor: 'pointer', fontSize: '10px', color: 'var(--c-accent)', opacity: .7, letterSpacing: '1px', fontFamily: 'var(--font-accent)' }}>刷新</span>
          </div>
          <div style={{ height: 1, background: 'linear-gradient(90deg, var(--c-line), transparent)', margin: '8px 0 14px' }} />
          {voices.length === 0 && <div style={{ fontSize: '12px', color: 'var(--c-text-faint)', marginBottom: 10, lineHeight: 1.6 }}>未检测到可用音色</div>}
          <select className="field-input" value={selectedVoiceURI} onChange={e => { setSelectedVoiceURI(e.target.value); localStorage.setItem('ks_voice', e.target.value) }} style={{ cursor: 'pointer' }}>
            <option value="">系统默认</option>
            {voices.map(v => <option key={v.voiceURI} value={v.voiceURI}>{v.name||'未命名'} {v.lang?`(${v.lang})`:''}</option>)}
          </select>
        </div>

        {/* 人格 */}
        <div className="constant-section">
          <div className="constant-section-title">Persona · 人格</div>
          <textarea className="field-input" value={config.system_prompt} onChange={e => setConfig(p => ({ ...p, system_prompt: e.target.value }))} rows={4} style={{ resize: 'vertical', lineHeight: 1.7, fontSize: '13px' }} />
        </div>

        {/* 参数 */}
        <div className="constant-section">
          <div className="constant-section-title">Parameters · 参数</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div>
              <div style={{ fontSize: '10px', letterSpacing: '1.5px', color: 'var(--c-text-faint)', marginBottom: 8, fontFamily: 'var(--font-accent)' }}>Temperature</div>
              <input className="field-input" type="number" step="0.1" min="0" max="1.5" value={config.temperature} onChange={e => setConfig(p => ({ ...p, temperature: Number(e.target.value) }))} />
            </div>
            <div>
              <div style={{ fontSize: '10px', letterSpacing: '1.5px', color: 'var(--c-text-faint)', marginBottom: 8, fontFamily: 'var(--font-accent)' }}>压缩阈值 Token</div>
              <input className="field-input" type="number" value={config.compress_threshold} onChange={e => setConfig(p => ({ ...p, compress_threshold: Number(e.target.value) }))} />
            </div>
            <div>
              <div style={{ fontSize: '10px', letterSpacing: '1.5px', color: 'var(--c-text-faint)', marginBottom: 8, fontFamily: 'var(--font-accent)' }}>压缩后保留回合</div>
              <input className="field-input" type="number" value={config.compress_keep_rounds} onChange={e => setConfig(p => ({ ...p, compress_keep_rounds: Number(e.target.value) }))} />
            </div>
          </div>
        </div>

        {/* 数据 */}
        <div className="constant-section">
          <div className="constant-section-title">Data · 数据</div>
          <button onClick={onExport} className="line-btn" style={{ width: '100%', padding: '12px 0', borderRadius: '14px', fontSize: '11.5px', letterSpacing: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Icon.Export size={13} /> 导出当前对话
          </button>
        </div>

        {/* 保存 */}
        <button onClick={() => onSave()} className="solid-btn" style={{ width: '100%', padding: '14px 0', borderRadius: '14px', fontSize: '12px', letterSpacing: '3px', marginTop: 8 }}>
          SAVE
        </button>

      </div>
    </div>
  )
}

// ============================================================
// 主组件
// ============================================================
const ChatPage = () => {
  // ── Tab 导航状态
  const [activeTab,     setActiveTab]     = useState('orbit')
  const [showOriginMenu, setShowOriginMenu] = useState(false)
  const [voidMode,      setVoidMode]      = useState(false)

  // ── 密码锁（B级）
  const [unlocked, setUnlocked] = useState(() => !!localStorage.getItem(ACCESS_KEY_STORAGE))

  // ── 原有状态
  const [showSplash,    setShowSplash]    = useState(() => !sessionStorage.getItem('hasVisited'))
  const [sessionList,   setSessionList]   = useState([])
  const [activeSessionId, setActiveSessionId] = useState(() => sessionStorage.getItem('activeSessionId') || null)
  const [messages,      setMessages]      = useState([])
  const [inputText,     setInputText]     = useState('')
  const [loading,       setLoading]       = useState(false)
  const [config,        setConfig]        = useState({ system_prompt: '你是温柔贴心的AI伴侣，简短自然回复', temperature: 0.7, compress_threshold: 3000, compress_keep_rounds: 4, show_reasoning: false })
  const [archivedList,  setArchivedList]  = useState([])
  const [hasOlderArchive, setHasOlderArchive] = useState(false)
  const [archiveCursor, setArchiveCursor] = useState(null)
  const [deleteModal,   setDeleteModal]   = useState({ show: false, sessionId: null, name: '' })
  const [renameModal,   setRenameModal]   = useState({ show: false, sessionId: null, value: '' })
  const [theme,         setTheme]         = useState(() => localStorage.getItem('ks_theme') || 'noir')
  const [toasts,        setToasts]        = useState([])
  const [inputFocused,  setInputFocused]  = useState(false)
  const [speakingKey,   setSpeakingKey]   = useState(null)
  const [isSpeakingPaused, setIsSpeakingPaused] = useState(false)
  const [voices,        setVoices]        = useState([])
  const [selectedVoiceURI, setSelectedVoiceURI] = useState(() => localStorage.getItem('ks_voice') || '')
  const [memories,      setMemories]      = useState([])
  const [memoriesLoading, setMemoriesLoading] = useState(false)
  const [memoryPulse,   setMemoryPulse]   = useState(false)
  // 侧边会话列表（星轨内部展开）
  const [showSessionList, setShowSessionList] = useState(false)

  // ── A级：星轨交互补全 相关状态 ──────────────────────────
  const [msgMenu,       setMsgMenu]       = useState(null)   // { x, y, msg, key }
  const [quoteTarget,   setQuoteTarget]   = useState(null)   // { text }
  const [editingMsg,    setEditingMsg]    = useState(null)   // { id, key }
  const [expandedReasoning, setExpandedReasoning] = useState(() => new Map())

  const messageBoxRef  = useRef(null)
  const renameInputRef = useRef(null)
  const starCanvasRef  = useRef(null)
  const voidTimerRef   = useRef(null)
  const abortControllerRef = useRef(null)
  const pendingRef      = useRef([])      // 输入合并防抖：待合并发送的原始文本
  const mergeTimerRef   = useRef(null)
  const pressTimerRef   = useRef(null)
  const pressMovedRef   = useRef(false)

  const showToast = (message) => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2500)
  }

  // ── 语音 ─────────────────────────────────────────────────
  const startSpeak = (text, msgKey) => {
    const utter = new SpeechSynthesisUtterance(text)
    utter.lang = 'zh-CN'; utter.rate = 0.9; utter.pitch = 1.05
    if (selectedVoiceURI) { const v = voices.find(v => v.voiceURI === selectedVoiceURI); if (v) utter.voice = v }
    utter.onend  = () => { setSpeakingKey(null); setIsSpeakingPaused(false) }
    utter.onerror = () => { setSpeakingKey(null); setIsSpeakingPaused(false) }
    window.speechSynthesis.speak(utter)
    setSpeakingKey(msgKey); setIsSpeakingPaused(false)
  }

  const speakMessage = (text, msgKey) => {
    if (!window.speechSynthesis) { showToast('当前浏览器不支持语音朗读'); return }
    if (speakingKey === msgKey) {
      if (window.speechSynthesis.paused) { window.speechSynthesis.resume(); setIsSpeakingPaused(false) }
      else if (window.speechSynthesis.speaking) { window.speechSynthesis.pause(); setIsSpeakingPaused(true) }
      else startSpeak(text, msgKey)
      return
    }
    window.speechSynthesis.cancel(); startSpeak(text, msgKey)
  }

  // ── 复制 ─────────────────────────────────────────────────
  const copyMessage = async (text) => {
    try {
      if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); showToast('已捕获'); return }
    } catch {}
    const ta = document.createElement('textarea')
    ta.value = text; ta.style.cssText = 'position:fixed;top:-9999px;left:-9999px;opacity:0;'
    document.body.appendChild(ta); ta.focus(); ta.select()
    try { showToast(document.execCommand('copy') ? '已捕获' : '捕获失败') } catch { showToast('捕获失败') }
    document.body.removeChild(ta)
  }

  // ── 导出 ─────────────────────────────────────────────────
  const exportConversation = () => {
    if (!activeSessionId || messages.length === 0) { showToast('没有可导出的对话'); return }
    const sessionTitle = sessionList.find(s => s.id === activeSessionId)?.title || '对话'
    const dateStr = new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')
    let md = `# ${sessionTitle}\n\n> 导出时间：${dateStr}\n\n---\n\n`
    ;[...archivedList, ...messages].forEach(msg => {
      const time = formatTime(msg.created_at)
      md += `### ${msg.role === 'user' ? '**我**' : '**在场**'} · ${time}\n\n${msg.content}\n\n---\n\n`
    })
    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a'); a.href = url; a.download = `presence_${dateStr}.md`; a.click()
    URL.revokeObjectURL(url); showToast('已导出')
  }

  // ── 重新生成 ─────────────────────────────────────────────
  const regenerateLastMessage = async () => {
    if (!activeSessionId || loading) return
    setLoading(true)
    try {
      const res = await axios.post(`${API_BASE}/chat/regenerate`, { sessionId: activeSessionId })
      const newReply = res.data.reply
      setMessages(prev => {
        const msgs = [...prev]
        for (let i = msgs.length-1; i >= 0; i--) {
          if (msgs[i].role === 'assistant') { msgs[i] = { ...msgs[i], content: newReply }; break }
        }
        return msgs
      })
      showToast('已重新生成')
    } catch (err) { showToast('重新生成失败：' + err.message) }
    setLoading(false)
  }

  // ── 记忆 ─────────────────────────────────────────────────
  const fetchMemories = async () => {
    setMemoriesLoading(true)
    try {
      const res = await axios.get(`${API_BASE}/memories/list?q=用户 喜欢 是`)
      setMemories(res.data.memories || [])
    } catch { setMemories([]) }
    setMemoriesLoading(false)
  }

  const triggerDream = async () => {
    showToast('记忆正在沉淀…')
    try {
      await axios.post(`${API_BASE}/memories/dream`)
      showToast('已沉入星尘')
      fetchMemories()
    } catch { showToast('沉淀失败，稍后再试') }
  }

  // ── 开屏 ─────────────────────────────────────────────────
  const handleSplashEnter = () => { sessionStorage.setItem('hasVisited', 'true'); setShowSplash(false) }

  const scrollBottom = () => setTimeout(() => { if (messageBoxRef.current) messageBoxRef.current.scrollTop = messageBoxRef.current.scrollHeight }, 50)

  // ── API ──────────────────────────────────────────────────
  const fetchSessions = async () => {
    try {
      const res = await axios.get(`${API_BASE}/sessions`)
      const sessions = res.data || []
      setSessionList(sessions)
      if (activeSessionId && !sessions.find(s => s.id === activeSessionId)) {
        sessionStorage.removeItem('activeSessionId')
        setActiveSessionId(null); setMessages([]); setArchivedList([]); setHasOlderArchive(false); setArchiveCursor(null)
      }
    } catch { setSessionList([]) }
  }

  const createSession = async () => {
    try {
      const res = await axios.post(`${API_BASE}/session/new`)
      const s   = res.data
      setSessionList(prev => [s, ...prev])
      sessionStorage.setItem('activeSessionId', s.id)
      setActiveSessionId(s.id); setMessages([]); setArchivedList([]); setHasOlderArchive(false); setArchiveCursor(null)
      setShowSessionList(false)
    } catch (err) { showToast('创建失败：' + err.message) }
  }

  const switchSession = async (sid) => {
    window.speechSynthesis?.cancel(); setSpeakingKey(null); setIsSpeakingPaused(false)
    try {
      sessionStorage.setItem('activeSessionId', sid); setActiveSessionId(sid)
      const res = await axios.get(`${API_BASE}/messages/${sid}`)
      setMessages((res.data || []).map(normalizeMsg)); setArchivedList([]); setHasOlderArchive(false); setArchiveCursor(null)
      setShowSessionList(false)
      try {
        const ar = await axios.get(`${API_BASE}/messages/archived/${sid}?limit=1`)
        if (ar.data?.list?.length > 0) setHasOlderArchive(true)
      } catch {}
      axios.post(`${API_BASE}/memories/dream`).catch(() => {})
    } catch {}
  }

  const loadOlderArchive = async () => {
    if (!activeSessionId) return
    try {
      const params = new URLSearchParams(); if (archiveCursor) params.append('cursor', archiveCursor); params.append('limit', '6')
      const res = await axios.get(`${API_BASE}/messages/archived/${activeSessionId}?${params}`)
      const { list, hasMore } = res.data
      if (list.length > 0) { setArchivedList(prev => [...list.map(normalizeMsg), ...prev]); setArchiveCursor(list[0].id) }
      setHasOlderArchive(hasMore)
    } catch {}
  }

  const renameSession  = async (sid, newTitle) => {
    try { await axios.put(`${API_BASE}/session/${sid}`, { title: newTitle }); setSessionList(prev => prev.map(s => s.id === sid ? { ...s, title: newTitle } : s)); await fetchSessions() }
    catch (err) { showToast('重命名失败：' + err.message); fetchSessions() }
  }
  const handleRenameClick = (sid, t) => { setRenameModal({ show: true, sessionId: sid, value: t || '' }); setTimeout(() => renameInputRef.current?.focus(), 50) }
  const confirmRename     = () => { const v = renameModal.value.trim(); if (v && renameModal.sessionId) renameSession(renameModal.sessionId, v); setRenameModal({ show: false, sessionId: null, value: '' }) }
  const handleDeleteClick = (sid, sname) => setDeleteModal({ show: true, sessionId: sid, name: sname || '这个会话' })
  const confirmDelete     = async () => {
    if (!deleteModal.sessionId) return
    try {
      await axios.delete(`${API_BASE}/session/${deleteModal.sessionId}`)
      setSessionList(prev => prev.filter(s => s.id !== deleteModal.sessionId))
      if (activeSessionId === deleteModal.sessionId) { sessionStorage.removeItem('activeSessionId'); setActiveSessionId(null); setMessages([]); setArchivedList([]); setHasOlderArchive(false); setArchiveCursor(null) }
    } catch (err) { showToast('删除失败：' + err.message); fetchSessions() }
    setDeleteModal({ show: false, sessionId: null, name: '' })
  }

  // ── 流式读取 SSE（发送新消息 / 编辑重发 共用）──────────────
  const readSSEStream = async (res) => {
    const reader  = res.body.getReader()
    const decoder = new TextDecoder()
    let buf = '', done = false

    while (!done) {
      const { value, done: rd } = await reader.read()
      done = rd
      if (value) buf += decoder.decode(value, { stream: true })

      const lines = buf.split('\n')
      buf = lines.pop() || ''

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue
        try {
          const ev = JSON.parse(line.slice(6))
          if (ev.error) { showToast('错误: ' + ev.error); done = true; break }
          if (ev.reasoning) {
            setMessages(prev => {
              const msgs = [...prev]
              const last = msgs[msgs.length - 1]
              if (last?.streaming) msgs[msgs.length - 1] = { ...last, reasoning: (last.reasoning || '') + ev.reasoning }
              return msgs
            })
          }
          if (ev.token) {
            setMessages(prev => {
              const msgs = [...prev]
              const last = msgs[msgs.length - 1]
              if (last?.streaming) msgs[msgs.length - 1] = { ...last, content: last.content + ev.token }
              return msgs
            })
            scrollBottom()
          }
          if (ev.memoryHit) {
            setMemoryPulse(true)
            setTimeout(() => setMemoryPulse(false), 4000)
          }
          if (ev.done) {
            setMessages(prev => {
              const msgs = [...prev]
              const last = msgs[msgs.length - 1]
              if (last?.streaming) msgs[msgs.length - 1] = { ...last, streaming: false, id: ev.messageId, tokens: ev.tokens || null }
              return msgs
            })
            if (ev.autoTitle) setSessionList(prev => prev.map(s => s.id === activeSessionId ? { ...s, title: ev.autoTitle } : s))
          }
        } catch {}
      }
    }
  }

  // ── 真正发起一次请求（新消息 / 合并后的多条 / 编辑重发 都走这里）──
  const performRequest = async (url, body) => {
    setLoading(true)
    const tempAI = { role: 'assistant', content: '', created_at: new Date(), streaming: true }
    setMessages(prev => [...prev, tempAI])
    scrollBottom()

    const controller = new AbortController()
    abortControllerRef.current = controller

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Access-Key': localStorage.getItem(ACCESS_KEY_STORAGE) || '' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })
      if (res.status === 401) { localStorage.removeItem(ACCESS_KEY_STORAGE); window.location.reload(); return }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await readSSEStream(res)
    } catch (err) {
      if (err.name === 'AbortError') {
        // 用户主动停止：保留已生成的部分内容，标记为 truncated
        setMessages(prev => {
          const msgs = [...prev]
          const last = msgs[msgs.length - 1]
          if (last?.streaming) msgs[msgs.length - 1] = { ...last, streaming: false, truncated: true }
          return msgs
        })
      } else {
        setMessages(prev => {
          const msgs = [...prev]
          if (msgs[msgs.length - 1]?.streaming) msgs.pop()
          return msgs
        })
        showToast('请求失败：' + err.message)
      }
    }

    abortControllerRef.current = null

    try {
      const ar = await axios.get(`${API_BASE}/messages/archived/${activeSessionId}?limit=1`)
      setHasOlderArchive((ar.data?.list?.length || 0) > 0)
    } catch {}

    setLoading(false)
  }

  // ── 输入合并防抖：3 秒内连续发送的多条消息，视觉上保留多个气泡，
  //    但只向后端合并发送一次 ──────────────────────────────
  const flushPending = () => {
    const contents = pendingRef.current
    const quote     = pendingRef.current._quote
    pendingRef.current = []
    if (!contents.length || !activeSessionId) return
    const merged = contents.join('\n')
    performRequest(`${API_BASE}/chat/stream`, { sessionId: activeSessionId, content: merged, quote: quote || undefined })
  }

  const queueMessage = (text) => {
    if (!pendingRef.current.length) pendingRef.current._quote = quoteTarget?.text || null
    pendingRef.current.push(text)
    if (mergeTimerRef.current) clearTimeout(mergeTimerRef.current)
    mergeTimerRef.current = setTimeout(() => { mergeTimerRef.current = null; flushPending() }, MERGE_WINDOW_MS)
  }

  // ── 发送 / 编辑重发 的统一入口（输入框按钮、Ctrl+Enter 都走这里）──
  const sendMessage = () => {
    if (editingMsg) { submitEdit(); return }
    if (!inputText.trim() || !activeSessionId || loading) return
    const content = inputText.trim()
    setInputText('')

    const tempUser = { role: 'user', content, created_at: new Date(), _localId: `p-${Date.now()}-${Math.random()}`, quoted: quoteTarget?.text || null }
    setMessages(prev => [...prev, tempUser])
    scrollBottom()
    queueMessage(content)
    setQuoteTarget(null)
  }

  // ── 编辑重发 ──────────────────────────────────────────────
  const submitEdit = () => {
    if (!inputText.trim() || !editingMsg || loading) return
    const content = inputText.trim()
    const { id } = editingMsg
    setInputText(''); setEditingMsg(null)

    // 丢弃这条消息之后的本地消息，更新这条消息本身并标记 edited
    setMessages(prev => {
      const idx = prev.findIndex(m => m.id === id)
      if (idx === -1) return prev
      const kept = prev.slice(0, idx)
      kept.push({ ...prev[idx], content, edited: true })
      return kept
    })
    scrollBottom()
    performRequest(`${API_BASE}/chat/edit-stream`, { messageId: id, content })
  }

  // ── 停止生成 ──────────────────────────────────────────────
  const stopGeneration = () => { abortControllerRef.current?.abort() }

  // ── 长按消息菜单 → 引用 ────────────────────────────────────
  const startQuote = (bodyText) => { setQuoteTarget({ text: bodyText.slice(0, 400) }); setEditingMsg(null) }

  // ── 长按消息菜单 → 编辑（仅用户消息）────────────────────────
  const startEdit = (msg, key) => {
    if (!msg.id) { showToast('该消息尚未完成发送，暂不能编辑'); return }
    setInputText(msg.content)
    setEditingMsg({ id: msg.id, key })
    setQuoteTarget(null)
  }

  // ── 长按消息菜单 → 存入星尘 ──────────────────────────────────
  const holdToStardust = async (bodyText) => {
    try { await axios.post(`${API_BASE}/memories/hold`, { content: bodyText }); showToast('已存入星尘') }
    catch (err) { showToast('存入失败：' + err.message) }
  }

  const getSettings  = async () => { try { const res = await axios.get(`${API_BASE}/settings`); setConfig(prev => ({ ...prev, ...res.data })) } catch {} }
  const saveSettings = async (overrideConfig) => { try { await axios.post(`${API_BASE}/settings`, overrideConfig || config); if (!overrideConfig) showToast('已保存') } catch (err) { showToast('保存失败：' + err.message) } }

  // ── 生命周期 ─────────────────────────────────────────────
  useEffect(() => {
    if (!unlocked) return
    const init = async () => {
      try {
        const res = await axios.get(`${API_BASE}/sessions`)
        const sessions = res.data || []
        setSessionList(sessions); getSettings()
        const savedId = sessionStorage.getItem('activeSessionId')
        if (savedId && sessions.find(s => s.id === savedId)) await switchSession(savedId)
        else if (sessions.length > 0) await switchSession(sessions[0].id)
      } catch {}
    }
    init()
  }, [unlocked])

  useEffect(() => {
    const loadVoices = () => setVoices(window.speechSynthesis?.getVoices() || [])
    loadVoices()
    window.speechSynthesis?.addEventListener('voiceschanged', loadVoices)
    return () => window.speechSynthesis?.removeEventListener('voiceschanged', loadVoices)
  }, [])

  const refreshVoices = () => {
    const vs = window.speechSynthesis?.getVoices() || []
    setVoices(vs); showToast(vs.length ? `已加载 ${vs.length} 个音色` : '未检测到音色')
  }

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('ks_theme', theme)
    let meta = document.querySelector('meta[name="theme-color"]')
    if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta) }
    meta.setAttribute('content', THEME_META[theme] || '#000002')
  }, [theme])

  const cycleTheme = () => { const idx = THEMES.indexOf(theme); setTheme(THEMES[(idx+1) % THEMES.length]) }

  useEffect(() => {
    const root = document.documentElement
    const upH  = () => root.style.setProperty('--app-height', `${window.visualViewport ? window.visualViewport.height : window.innerHeight}px`)
    upH()
    window.visualViewport?.addEventListener('resize', upH); window.addEventListener('resize', upH)
    return () => { window.visualViewport?.removeEventListener('resize', upH); window.removeEventListener('resize', upH) }
  }, [])

  // 切到星尘时自动拉取记忆
  useEffect(() => {
    if (activeTab === 'stardust' && memories.length === 0) fetchMemories()
  }, [activeTab])

  // ── 工具函数 ─────────────────────────────────────────────
  const formatTime = (ts) => {
    if (!ts) return ''
    const d = new Date(ts)
    if (Number.isNaN(d.getTime())) return String(ts).slice(0, 16)
    return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`
  }

  const formatDate = (ts) => {
    if (!ts) return ''
    const d = new Date(ts), now = new Date()
    if (d.toDateString() === now.toDateString()) return '今天'
    const yest = new Date(now); yest.setDate(yest.getDate()-1)
    if (d.toDateString() === yest.toDateString()) return '昨天'
    return `${d.getMonth()+1}月${d.getDate()}日`
  }

  const groupMessagesByDate = (msgs) => {
    const groups = {}
    msgs.forEach(m => { const d = formatDate(m.created_at); if (!groups[d]) groups[d] = []; groups[d].push(m) })
    return groups
  }

  // ── 渲染消息 ─────────────────────────────────────────────
  // ── 长按 / 右键 打开消息操作菜单 ──────────────────────────
  const openMsgMenu = (clientX, clientY, msg, key, isUser, isLastAI, isArchived, body) => {
    const items = []
    if (!isUser) {
      items.push({ key: 'speak', label: speakingKey === key ? (isSpeakingPaused ? '继续朗读' : '暂停朗读') : '朗读', icon: <Icon.Speak size={13} />, onClick: () => speakMessage(body, key) })
    }
    items.push({ key: 'copy', label: '复制', icon: <Icon.Copy size={13} />, onClick: () => copyMessage(body) })
    items.push({ key: 'quote', label: '引用', icon: <Icon.Quote size={13} />, onClick: () => startQuote(body) })
    items.push({ key: 'hold', label: '存入星尘', icon: <Icon.Bookmark size={13} />, onClick: () => holdToStardust(body) })
    if (!isUser && isLastAI) {
      items.push({ key: 'regen', label: '重新生成', icon: <Icon.Refresh size={13} />, onClick: regenerateLastMessage })
    }
    if (isUser && !isArchived) {
      items.push({ key: 'edit', label: '编辑', icon: <Icon.Edit size={13} />, onClick: () => startEdit(msg, key) })
    }
    setMsgMenu({ x: clientX, y: clientY, items })
  }

  const renderMsgItem = (msg, key) => {
    const isUser    = msg.role === 'user'
    const isArchived = key.startsWith('arch-')
    const lastAIId = messages.length > 0 ? [...messages].reverse().find(m => m.role === 'assistant')?.id : null
    const isLastAI = !isUser && msg.id && msg.id === lastAIId

    const isStreaming = !isUser && msg.streaming
    const isWaiting   = isStreaming && !msg.content && !msg.reasoning

    const body = msg.content
    const quoted = msg.quoted || null
    const edited = !!msg.edited
    const hasReasoning = !isUser && !!msg.reasoning
    // 默认态取自设置(config.show_reasoning)，用户手动点开/收起后记录在 expandedReasoning 里覆盖默认态
    const reasoningOpen = expandedReasoning.has(key) ? expandedReasoning.get(key) : !!config.show_reasoning
    const toggleReasoning = () => setExpandedReasoning(prev => {
      const next = new Map(prev)
      next.set(key, !reasoningOpen)
      return next
    })

    // 长按检测（触屏 + 鼠标），移动或松开即取消；桌面端右键直接打开
    const onPressStart = (e) => {
      pressMovedRef.current = false
      const pt = e.touches ? e.touches[0] : e
      const x = pt.clientX, y = pt.clientY
      pressTimerRef.current = setTimeout(() => {
        if (pressMovedRef.current) return
        if (navigator.vibrate) navigator.vibrate(8)
        openMsgMenu(x, y, msg, key, isUser, isLastAI, isArchived, body)
      }, 480)
    }
    const onPressMove = () => { pressMovedRef.current = true; clearTimeout(pressTimerRef.current) }
    const onPressEnd  = () => clearTimeout(pressTimerRef.current)
    const onCtxMenu   = (e) => { e.preventDefault(); clearTimeout(pressTimerRef.current); openMsgMenu(e.clientX, e.clientY, msg, key, isUser, isLastAI, isArchived, body) }

    return (
      <div key={key} className="msg-row" style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: '18px', padding: '0 18px' }}>
        <div style={{ maxWidth: '82%', display: 'flex', flexDirection: isUser ? 'row-reverse' : 'row', alignItems: 'flex-start', gap: '10px' }}>
          {isUser ? <UserAvatar /> : <AIAvatar memoryPulse={memoryPulse && isLastAI} />}
          <div>
            <div
              className={`bubble-glass${isUser ? ' is-user' : ''}`}
              style={{ borderRadius: isUser ? '22px 22px 5px 22px' : '22px 22px 22px 5px' }}
              onTouchStart={onPressStart} onTouchMove={onPressMove} onTouchEnd={onPressEnd} onTouchCancel={onPressEnd}
              onMouseDown={onPressStart} onMouseMove={onPressMove} onMouseUp={onPressEnd} onMouseLeave={onPressEnd}
              onContextMenu={onCtxMenu}
            >
              {/* 被引用消息缩略条 */}
              {quoted && (
                <div className="quote-block">{quoted}</div>
              )}

              {/* 思考过程折叠（DeepSeek reasoning_content） */}
              {hasReasoning && (
                <div className="reasoning-block">
                  <button className="reasoning-toggle" onClick={toggleReasoning}>
                    <Icon.Chevron size={9} open={reasoningOpen} /> 思考过程
                  </button>
                  {reasoningOpen && <div className="reasoning-body">{msg.reasoning}</div>}
                </div>
              )}

              <div className="msg-text">
                {/* 等待中：单个呼吸光点（替代 typing-dots） */}
                {isWaiting
                  ? <div className="breath-dot" style={{ margin: '2px auto' }} />
                  : isStreaming
                    ? <><MarkdownText text={body} /><span className="stream-cursor" /></>
                    : <MarkdownText text={body} />
                }
              </div>
            </div>
            {/* 操作栏 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginTop: '7px', padding: isUser ? '0 4px 0 0' : '0 0 0 4px' }}>
              {!isUser && !isStreaming && (
                <>
                  <span onClick={() => speakMessage(body, key)} title={speakingKey===key ? (isSpeakingPaused?'继续':'暂停') : '朗读'} style={{ cursor: 'pointer', opacity: speakingKey===key?.9:.38, transition: 'opacity .2s', display: 'inline-flex', alignItems: 'center' }} onMouseEnter={e=>{if(speakingKey!==key)e.currentTarget.style.opacity='.85'}} onMouseLeave={e=>{if(speakingKey!==key)e.currentTarget.style.opacity='.38'}}>
                    {speakingKey===key&&!isSpeakingPaused ? <Icon.Pause size={13} /> : speakingKey===key&&isSpeakingPaused ? <Icon.Play size={13} /> : <Icon.Speak size={13} />}
                  </span>
                  <span onClick={() => copyMessage(body)} title="复制" style={{ cursor: 'pointer', opacity: .38, transition: 'opacity .2s', display: 'inline-flex', alignItems: 'center' }} onMouseEnter={e=>e.currentTarget.style.opacity='.85'} onMouseLeave={e=>e.currentTarget.style.opacity='.38'}>
                    <Icon.Copy size={13} />
                  </span>
                  {isLastAI && (
                    <span onClick={regenerateLastMessage} title="重新生成" style={{ cursor: 'pointer', opacity: .38, transition: 'opacity .2s', display: 'inline-flex', alignItems: 'center' }} onMouseEnter={e=>e.currentTarget.style.opacity='.85'} onMouseLeave={e=>e.currentTarget.style.opacity='.38'}>
                      <Icon.Refresh size={13} />
                    </span>
                  )}
                  {msg.tokens && (
                    <span className="token-label">↑{msg.tokens.input} ↓{msg.tokens.output}</span>
                  )}
                </>
              )}
              {edited && <span className="edited-tag">已编辑</span>}
              {msg.truncated && <span className="edited-tag">已中断</span>}
              <span style={{ fontSize: '10.5px', color: 'var(--c-text-faint)', fontFamily: 'var(--font-accent)', letterSpacing: '0.8px' }}>
                {formatTime(msg.created_at)}
              </span>
            </div>
          </div>
        </div>
      </div>
    )
  }

  const groupedMessages = groupMessagesByDate(messages)

  // ── 星轨页面 ─────────────────────────────────────────────
  const OrbitPage = () => (
    <div className="tab-page">
      {/* 顶栏 */}
      <div className="hairline-bottom" style={{ padding: '16px 18px 13px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        {/* 左：会话列表开关 */}
        <button
          onClick={() => setShowSessionList(p => !p)}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--c-text-muted)', display: 'flex', padding: '4px' }}
        >
          <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
            <line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="14" y2="17"/>
          </svg>
        </button>

        {/* 中：会话标题 */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '5px', maxWidth: '55%' }}>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '13.5px', letterSpacing: '3px', color: 'var(--c-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
            {activeSessionId ? (sessionList.find(s => s.id === activeSessionId)?.title || '交汇中') : '在场'}
          </div>
          <div style={{ width: '3px', height: '3px', transform: 'rotate(45deg)', background: 'var(--c-accent)', opacity: .5 }} />
        </div>

        {/* 右：主题切换 */}
        <button onClick={cycleTheme} title={`切换主题`} style={{ background: 'transparent', border: '1px solid var(--c-line)', borderRadius: '999px', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--c-text-muted)' }}>
          {theme === 'noir' ? <Icon.Moon size={12} /> : <Icon.Sun size={12} />}
        </button>
      </div>

      {/* 会话列表下拉（内嵌） */}
      {showSessionList && (
        <div style={{ flexShrink: 0, borderBottom: '1px solid var(--c-line)', background: 'var(--c-panel)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', maxHeight: 240, overflowY: 'auto', animation: 'riseIn 0.22s var(--ease)' }}>
          <div style={{ padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', letterSpacing: '2px', color: 'var(--c-text-faint)', fontFamily: 'var(--font-accent)' }}>SESSIONS</span>
            <button onClick={createSession} className="line-btn" style={{ padding: '6px 14px', borderRadius: '999px', fontSize: '10.5px', display: 'flex', alignItems: 'center', gap: 5 }}>
              <Icon.Plus size={10} /> NEW
            </button>
          </div>
          {sessionList.map(item => (
            <div key={item.id} className={`session-item${activeSessionId===item.id?' is-active':''}`} onClick={() => switchSession(item.id)}>
              <span style={{ fontSize: '13px', color: activeSessionId===item.id ? 'var(--c-text)' : 'var(--c-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '.3px' }}>{item.title}</span>
              <div className="session-actions" style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                <button className="icon-btn" onClick={e => { e.stopPropagation(); handleRenameClick(item.id, item.title) }} style={{ background: 'transparent', border: 'none', color: 'var(--c-text-muted)', cursor: 'pointer', padding: '4px' }}><Icon.Edit /></button>
                <button className="icon-btn" onClick={e => { e.stopPropagation(); handleDeleteClick(item.id, item.title) }} style={{ background: 'transparent', border: 'none', color: 'var(--c-text-muted)', cursor: 'pointer', padding: '4px' }}><Icon.Trash /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 消息区 */}
      <div ref={messageBoxRef} style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', minHeight: 0 }}>
        {!activeSessionId ? (
          /* 空席状态 */
          <div className="empty-seat">
            <div style={{ width: 1, height: 42, background: 'linear-gradient(180deg, transparent, var(--c-line-strong), transparent)' }} />
            <div className="empty-seat-label">尚未交汇</div>
            <button onClick={createSession} className="line-btn" style={{ marginTop: 8, padding: '10px 26px', borderRadius: '999px', fontSize: '11px', letterSpacing: '3px' }}>
              <Icon.Plus size={11} style={{ marginRight: 7 }} /> NEW
            </button>
          </div>
        ) : (
          <div style={{ padding: '18px 0 10px' }}>
            {hasOlderArchive && (
              <div style={{ textAlign: 'center', padding: '10px 0 20px' }}>
                <span onClick={loadOlderArchive} className="line-btn" style={{ cursor: 'pointer', padding: '8px 20px', borderRadius: '999px', display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '11px', color: 'var(--c-text-muted)', borderColor: 'var(--c-line)' }}>
                  <Icon.ArrowUp size={11} /> EARLIER
                </span>
              </div>
            )}
            {archivedList.map((msg, idx) => renderMsgItem(msg, `arch-${idx}`))}
            {Object.entries(groupedMessages).map(([date, msgs]) => (
              <div key={date}>
                <div className="date-divider">
                  <span className="rule" /><span className="lozenge" />
                  <span className="label">{date}</span>
                  <span className="lozenge" /><span className="rule" />
                </div>
                {msgs.map((msg, idx) => renderMsgItem(msg, `live-${idx}`))}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 输入框 */}
      <div style={{ padding: '10px 14px calc(env(safe-area-inset-bottom, 0px) + 78px)', flexShrink: 0 }}>
        {/* 编辑中提示条 */}
        {editingMsg && (
          <div className="compose-banner">
            <span>正在编辑消息</span>
            <span className="compose-banner-cancel" onClick={() => { setEditingMsg(null); setInputText('') }}>取消</span>
          </div>
        )}
        {/* 引用预览条：被引用消息缩略显示在输入框上方 */}
        {!editingMsg && quoteTarget && (
          <div className="quote-preview-bar">
            <div className="quote-preview-line" />
            <div className="quote-preview-text">{quoteTarget.text}</div>
            <span className="quote-preview-close" onClick={() => setQuoteTarget(null)}><Icon.Close size={11} /></span>
          </div>
        )}
        <div className={`composer-shell${inputFocused ? ' is-focused' : ''}`}>
          <textarea
            className="composer-input"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => e.ctrlKey && e.key === 'Enter' && sendMessage()}
            onFocus={() => setInputFocused(true)}
            onBlur={() => setInputFocused(false)}
            placeholder={editingMsg ? '编辑消息…' : '在这里说...'}
            rows={1}
          />
          {loading ? (
            <button onClick={stopGeneration} className="send-btn is-stop" title="停止生成">
              <Icon.StopSquare size={15} />
            </button>
          ) : (
            <button onClick={sendMessage} disabled={!activeSessionId} className="send-btn">
              <Icon.ArrowUp size={17} />
            </button>
          )}
        </div>
      </div>
    </div>
  )

  // ── 渲染 ─────────────────────────────────────────────────
  return (
    <div
      data-theme={theme}
      style={{ flex: 1, display: 'flex', height: 'var(--app-height, 100dvh)', maxHeight: 'var(--app-height, 100dvh)', color: 'var(--c-text)', fontFamily: 'var(--font-body)', overflow: 'hidden', position: 'relative', flexDirection: 'column' }}
    >
      {/* 星空 Canvas */}
      <StarCanvas ref={starCanvasRef} theme={theme} interactive={false} />

      {/* 颗粒 & 相框 */}
      <div className="grain-overlay" />
      <div className="app-frame" />

      {/* 密码锁：未解锁前遮住一切交互 */}
      {!unlocked && <AccessGate onUnlock={() => setUnlocked(true)} />}

      {/* 开屏 */}
      {unlocked && showSplash && <SplashScreen onEnter={handleSplashEnter} theme={theme} />}

      {/* 坠入空白模式 */}
      {voidMode && <VoidScreen onWake={() => { setVoidMode(false); setActiveTab('orbit') }} />}

      {/* 长按消息菜单 */}
      {msgMenu && (
        <MsgContextMenu x={msgMenu.x} y={msgMenu.y} items={msgMenu.items} onClose={() => setMsgMenu(null)} />
      )}

      {/* 归弹出菜单 */}
      {showOriginMenu && (
        <OriginMenu
          onNavigate={(tab) => setActiveTab(tab)}
          onVoid={() => setVoidMode(true)}
          onClose={() => setShowOriginMenu(false)}
        />
      )}

      {/* 主内容区 */}
      {!voidMode && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative', zIndex: 1 }}>

          {/* Tab 页面 */}
          {activeTab === 'orbit' && <OrbitPage key="orbit" />}
          {activeTab === 'stardust' && (
            <StardustPage key="stardust"
              memories={memories} memoriesLoading={memoriesLoading}
              onFetch={fetchMemories} onDream={triggerDream}
            />
          )}
          {activeTab === 'chronicle' && <ChroniclePage key="chronicle" />}
          {activeTab === 'constant' && (
            <ConstantPage key="constant"
              config={config} setConfig={setConfig}
              theme={theme} setTheme={setTheme}
              voices={voices} selectedVoiceURI={selectedVoiceURI} setSelectedVoiceURI={setSelectedVoiceURI}
              onSave={saveSettings} onExport={exportConversation}
              onRefreshVoices={refreshVoices} showToast={showToast}
            />
          )}

          {/* 底部导航栏 */}
          <nav className="bottom-nav">
            {/* 星轨 */}
            <button className={`nav-tab${activeTab==='orbit'?' is-active':''}`} onClick={() => setActiveTab('orbit')}>
              <span className="nav-tab-icon"><Icon.Orbit size={19} /></span>
              <span className="nav-tab-label">ORBIT</span>
            </button>

            {/* 星尘 */}
            <button className={`nav-tab${activeTab==='stardust'?' is-active':''}`} onClick={() => setActiveTab('stardust')}>
              <span className="nav-tab-icon"><Icon.Stardust size={19} /></span>
              <span className="nav-tab-label">DUST</span>
            </button>

            {/* 归（中央凸起） */}
            <div className="nav-origin-wrap">
              <button className="nav-origin-btn" onClick={() => setShowOriginMenu(p => !p)} title="归">
                <Icon.Origin size={20} />
              </button>
              <span className="nav-origin-label">归</span>
            </div>

            {/* 星历 */}
            <button className={`nav-tab${activeTab==='chronicle'?' is-active':''}`} onClick={() => setActiveTab('chronicle')}>
              <span className="nav-tab-icon"><Icon.Chronicle size={19} /></span>
              <span className="nav-tab-label">LOG</span>
            </button>

            {/* 常数 */}
            <button className={`nav-tab${activeTab==='constant'?' is-active':''}`} onClick={() => setActiveTab('constant')}>
              <span className="nav-tab-icon"><Icon.Constant size={19} /></span>
              <span className="nav-tab-label">CONST</span>
            </button>
          </nav>
        </div>
      )}

      {/* Toast */}
      <div className="toast-wrap">
        {toasts.map(t => <div key={t.id} className="toast-item">{t.message}</div>)}
      </div>

      {/* 重命名弹窗 */}
      {renameModal.show && (
        <div className="modal-veil" style={{ zIndex: 2100 }} onClick={() => setRenameModal({ show: false, sessionId: null, value: '' })}>
          <div className="modal-card" style={{ padding: '30px 26px 24px', width: '306px', maxWidth: '86vw' }} onClick={e => e.stopPropagation()}>
            <div className="modal-title" style={{ marginBottom: '18px' }}>RENAME</div>
            <input ref={renameInputRef} className="field-input" value={renameModal.value} onChange={e => setRenameModal(p => ({ ...p, value: e.target.value }))} onKeyDown={e => e.key === 'Enter' && confirmRename()} style={{ marginBottom: '20px', fontSize: '14px' }} />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="line-btn" onClick={() => setRenameModal({ show: false, sessionId: null, value: '' })} style={{ flex: 1, padding: '11px 0', borderRadius: '999px', fontSize: '11.5px', color: 'var(--c-text-muted)' }}>取消</button>
              <button className="solid-btn" onClick={confirmRename} style={{ flex: 1, padding: '11px 0', borderRadius: '999px', fontSize: '11.5px' }}>确定</button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deleteModal.show && (
        <div className="modal-veil" style={{ zIndex: 2000 }}>
          <div className="modal-card" style={{ padding: '32px 26px 24px', width: '306px', maxWidth: '86vw', textAlign: 'center' }}>
            <div className="modal-title" style={{ marginBottom: '12px' }}>DELETE</div>
            <div style={{ fontSize: '12.5px', color: 'var(--c-text-muted)', marginBottom: '26px', lineHeight: 1.7 }}>「{deleteModal.name}」将永久消散</div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="line-btn" onClick={() => setDeleteModal({ show: false, sessionId: null, name: '' })} style={{ flex: 1, padding: '11px 0', borderRadius: '999px', fontSize: '11.5px', color: 'var(--c-text-muted)' }}>取消</button>
              <button className="solid-btn" onClick={confirmDelete} style={{ flex: 1, padding: '11px 0', borderRadius: '999px', fontSize: '11.5px' }}>确定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ChatPage
