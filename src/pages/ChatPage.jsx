import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, Suspense } from 'react'
import axios from 'axios'
import StarCanvas from './StarCanvas'
import StardustPage from './StardustPage'
import GravityPage from './GravityPage'
import BackupPage from './BackupPage'

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
// 流式浮现渲染（替代打字机效果）
// 已经"稳定"的正文交给 MarkdownText 正常解析、静止不动；最近到达的
// 若干个数据块（chunks，即 SSE 里一次次 ev.token 的原始分片）各自
// 包一层 .reveal-tail 做淡入+虚焦→清晰的动画。
//
// 2026-08-11 修复：原来是拿"整条 tail 字符串"配 key={text.length}，
// 每来一个新字符 text.length 就变，React 会把整条尾巴当成全新元素
// 卸载重挂——哪怕某个字几帧前就已经淡入完成了，只要它还留在窗口内、
// 后面又来了新字符，它也会被强制打回 opacity:0 重新淡入一次。
// 一段 26 字符的窗口被这样反复重播，视觉上就是密集的连续闪烁，
// 跟"逐字蹦出来的打字机"没有本质区别，只是多了层模糊——这正是本该
// 替代的效果又变相重现了。
// 现在按 chunk 分别渲染，key 用该 chunk 在 chunks 数组里的下标（只增不减，
// 稳定不变）：一个 chunk 一旦挂载播完动画，后面无论再来多少新 chunk，
// 都不会让它重新播放——每一小段文字只从雾气里浮现一次，就定住不动了。
// 窗口改成按"最近 N 个 chunk"而不是"最近 N 个字符"圈定，逻辑更简单；
// chunk 粒度本来就细，效果上跟原来的字符窗口相近。
// 代价跟原来一样：尾巴窗口内如果正好卡在一个 markdown 符号中间（比如
// **加粗** 被切成两半），会有极短暂的原始符号闪现，等它滑入稳定区、
// 被 MarkdownText 完整解析后就恢复正常。
// ============================================================
const TAIL_CHUNKS = 10
const StreamingText = ({ text, chunks }) => {
  if (!text) return null
  // 兜底：没有分块信息（理论上不会发生，除非是老缓存数据），没法逐块
  // 稳定播放动画，直接整体展示，不强行拆分
  if (!chunks || chunks.length === 0) return <MarkdownText text={text} />

  const tailStart = Math.max(0, chunks.length - TAIL_CHUNKS)
  const settled = chunks.slice(0, tailStart).join('')
  const tail = chunks.slice(tailStart)
  return (
    <>
      {settled && <MarkdownText text={settled} />}
      {tail.map((c, i) => (
        <span key={tailStart + i} className="reveal-tail">{c}</span>
      ))}
    </>
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
//
// reasoning: m.reasoning_content —— 数据库列叫 reasoning_content，但下面
// renderMsgItem 里判断"这条消息有没有思考过程"用的是 msg.reasoning（跟
// 流式过程中 readSSEStream 边收边攒到 msg.reasoning 上的字段名保持一致）。
// 这两个名字之前没接上：凡是从后端重新拉回来的历史消息（切会话、翻旧
// 记录、刷新页面——包括应用一打开就会自动加载上次会话这一步），
// reasoning_content 里其实好好存着数据，却因为字段名对不上而显示不出来，
// 只有还停留在本次会话实时流式状态里、没经过这次"从后端重新加载"的
// 消息才显示得出来。这里补上映射，历史消息的思考过程就能正常展开了。
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
    reasoning: m.reasoning_content ?? m.reasoning ?? null,
  }
}

const MERGE_WINDOW_MS = 3000   // 输入合并防抖：3 秒内连续发送合并为一条

// 3 秒合并倒计时环形指示（发送按钮上极简的小圆点即可，见 composer 部分）

// 聊天字号四档：纯前端，写 localStorage，切换即时生效（零后端调用）
const FONT_SCALES = ['sm', 'md', 'lg', 'xl']
const FONT_LABELS = { sm: '小', md: '中', lg: '大', xl: '特大' }
const FONT_SUB    = { sm: 'Small', md: 'Medium', lg: 'Large', xl: 'X-Large' }
const FONT_STORAGE = 'ks_font_scale'

// 双主题（深空 noir / 昼梦 warm）
const THEMES       = ['noir', 'warm']
const THEME_LABELS = { noir: 'Deep Space', warm: 'Day Dream' }
const THEME_SUB    = { noir: '深空',  warm: '昼梦' }
const THEME_META   = { noir: '#000002', warm: '#060300' }

// ============================================================
// 信标（便签，C级）—— 纯前端增删改查，零 AI 调用
// 与后端保持一致，用固定 +8h 偏移换算北京日历日，不依赖系统时区，
// 用来判断"是否跨天了"，从而在打开应用时自动清空前一天已完成的项。
// ============================================================
const BEACON_STORAGE = 'ks_beacons'
const beaconTodayStr = () => {
  const bj = new Date(Date.now() + 8 * 3600 * 1000)
  return `${bj.getUTCFullYear()}-${String(bj.getUTCMonth() + 1).padStart(2, '0')}-${String(bj.getUTCDate()).padStart(2, '0')}`
}
function loadBeacons() {
  let saved
  try { saved = JSON.parse(localStorage.getItem(BEACON_STORAGE) || 'null') } catch { saved = null }
  const today = beaconTodayStr()
  if (!saved || saved.date !== today) {
    // 跨天了：清空"已完成"的项，未完成的项继续保留
    const kept = (saved?.items || []).filter(it => !it.done)
    const next = { date: today, items: kept }
    localStorage.setItem(BEACON_STORAGE, JSON.stringify(next))
    return next.items
  }
  return saved.items || []
}
function saveBeacons(items) {
  localStorage.setItem(BEACON_STORAGE, JSON.stringify({ date: beaconTodayStr(), items }))
}

// Tab 定义
const TABS = [
  { id: 'gravity',   label: 'GRAVITY',   labelCN: '引力' },
  { id: 'stardust',  label: 'DUST',      labelCN: '星尘' },
  { id: 'orbit',     label: 'CHAT',      labelCN: '对话' },   // 中央星核按钮，非常规 nav-tab
  { id: 'chronicle', label: 'LOG',       labelCN: '星历' },
  { id: 'constant',  label: 'CONST',     labelCN: '常数' },
]

// ============================================================
// 图标
// ============================================================
const Icon = {
  Orbit:     (p) => (<svg width={p.size||18} height={p.size||18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"><ellipse cx="12" cy="12" rx="10" ry="4" transform="rotate(-30 12 12)"/><circle cx="12" cy="12" r="2" fill="currentColor" stroke="none"/></svg>),
  Gravity:   (p) => (<svg width={p.size||18} height={p.size||18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.1"><circle cx="12" cy="12" r="9.2"/><circle cx="12" cy="12" r="5.4"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg>),
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
// 星尘专属：右下角悬浮毛玻璃圆点 → 扇形导航
// 只在 activeTab === 'stardust' 时挂载，离开星尘随卸载自动复位
// ============================================================
const DUST_FAB_ITEMS = [
  { id: 'gravity',   label: '引力', icon: 'Gravity' },
  { id: 'orbit',     label: '对话', icon: 'Orbit' },
  { id: 'stardust',  label: '星尘', icon: 'Stardust' },
  { id: 'chronicle', label: '日记', icon: 'Chronicle' },
  { id: 'constant',  label: '设置', icon: 'Constant' },
]
const DustFab = ({ activeTab, onNavigate }) => {
  const [open, setOpen] = useState(false)
  return (
    <>
      {open && <div className="dust-fab-veil" onClick={() => setOpen(false)} />}
      <div className="dust-fab-wrap">
        {DUST_FAB_ITEMS.map((item, i) => {
          const IconComp = Icon[item.icon]
          // 90° 扇形：从正上方摆到正左方，4 个点沿圆弧均匀展开
          const angle  = (i / (DUST_FAB_ITEMS.length - 1)) * 90
          const rad    = (angle * Math.PI) / 180
          const radius = 92
          const tx = open ? -Math.sin(rad) * radius : 0
          const ty = open ? -Math.cos(rad) * radius : 0
          return (
            <button
              key={item.id}
              className={`dust-fab-item${activeTab === item.id ? ' is-current' : ''}`}
              style={{
                transform: `translate(${tx}px, ${ty}px) scale(${open ? 1 : 0.3})`,
                opacity: open ? 1 : 0,
                transitionDelay: open ? `${i * 0.03}s` : '0s',
                pointerEvents: open ? 'auto' : 'none',
              }}
              onClick={() => { onNavigate(item.id); setOpen(false) }}
              aria-label={item.label}
            >
              <IconComp size={13} />
              <span className="dust-fab-item-label">{item.label}</span>
            </button>
          )
        })}
        <button className="dust-fab-dot" onClick={() => setOpen(p => !p)} title="导航">
          <span className={`dust-fab-dot-inner${open ? ' is-open' : ''}`} />
        </button>
      </div>
    </>
  )
}

// ============================================================
// 长按消息菜单（A级）
// items: [{ key, label, icon, onClick }]
// ============================================================
const MsgContextMenu = ({ anchor, alignRight, items, onClose }) => {
  const menuRef = useRef(null)
  const [pos, setPos] = useState(null)

  // 菜单锚在气泡上，不跟手指走：手指落在气泡哪个位置是随机的，
  // 菜单每次从不同地方冒出来会让人重新找一遍按钮。固定贴在气泡下沿、
  // 并与气泡靠头像那一侧对齐，位置就成了可预期的肌肉记忆。
  useLayoutEffect(() => {
    const el = menuRef.current
    if (!el) return
    const m = el.getBoundingClientRect()
    const vw = window.innerWidth, vh = window.innerHeight
    const GAP = 8, EDGE = 12
    const a = anchor || { top: vh / 2, bottom: vh / 2, left: vw / 2, right: vw / 2 }

    let top = a.bottom + GAP
    if (top + m.height > vh - EDGE) top = a.top - m.height - GAP   // 下方放不下就翻到上方
    if (top < EDGE) top = Math.max(EDGE, Math.min(vh - m.height - EDGE, a.top))

    let left = alignRight ? a.right - m.width : a.left
    left = Math.max(EDGE, Math.min(left, vw - m.width - EDGE))
    setPos({ left, top })
  }, [anchor, alignRight])

  return (
    <>
      <div className="msg-menu-veil" onClick={onClose} onContextMenu={e => { e.preventDefault(); onClose() }} />
      <div
        ref={menuRef}
        className="msg-context-menu"
        style={{ left: pos ? pos.left : 0, top: pos ? pos.top : 0, visibility: pos ? 'visible' : 'hidden' }}
      >
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
      const res = await axios.post(`${API_BASE}/diary/generate`, {})
      await fetchDiaries()
      // 现在写不写由枢自己判断，点了按钮不代表这次一定会有正文——
      // 这不算失败，只是给个提示，不走 catch 那条报错分支
      if (res.data?.skipped) setGenError('枢今天选择不写')
    } catch (err) {
      setGenError(err.response?.data?.error || '今天还没有足够的对话，写不出日记')
    }
    setGenerating(false)
  }

  // 删掉一条"枢选择不写"的占位——先从本地列表摘掉给个即时反馈，
  // 请求失败也不回滚，下次刷新列表时会自然纠正
  const dismissDiary = async (dateStr) => {
    setDiaries(prev => prev.filter(d => d.date !== dateStr))
    try { await axios.delete(`${API_BASE}/diary/${dateStr}`) } catch {}
  }

  return (
    <div className="tab-page">
      <div style={{ padding: '22px 20px 14px', flexShrink: 0, borderBottom: '1px solid var(--c-line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '15px', letterSpacing: '4px', color: 'var(--c-text)' }}>CHRONICLE</div>
          <div style={{ fontSize: '11px', letterSpacing: '1px', color: 'var(--c-text-faint)', marginTop: 6, fontFamily: 'var(--font-accent)', fontStyle: 'italic' }}>枢的日记本</div>
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
          if (d.skipped) {
            return (
              <div key={d.date} className="diary-item is-skipped">
                <div className="diary-item-head">
                  <span className="diary-item-dot is-skipped" />
                  <span className="diary-item-date">{formatDiaryDate(d.date)}</span>
                  <button
                    className="diary-item-dismiss"
                    onClick={e => { e.stopPropagation(); dismissDiary(d.date) }}
                    aria-label="删除"
                    title="删除"
                  >
                    <Icon.Close size={12} />
                  </button>
                </div>
                <div className="diary-item-skip-text">这天他选择不写</div>
              </div>
            )
          }
          const open = openDate === d.date
          return (
            <div key={d.date} className="diary-item" onClick={() => setOpenDate(open ? null : d.date)}>
              <div className="diary-item-head">
                <span className="diary-item-dot" />
                <span className="diary-item-date">{formatDiaryDate(d.date)}</span>
                <button
                  className="diary-item-dismiss"
                  onClick={e => { e.stopPropagation(); dismissDiary(d.date) }}
                  aria-label="删除"
                  title="删除这篇日记"
                >
                  <Icon.Close size={12} />
                </button>
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
// 常数 · 设置页
// ============================================================
const SENSITIVITY_LEVELS = ['low', 'medium', 'high']
const SENSITIVITY_LABELS = { low: '低', medium: '中', high: '高' }
const SENSITIVITY_HINTS = {
  low:    '只有同时满足"明确事实"且"情绪波动强烈"才会自动记住，平淡的陈述不会存。',
  medium: '默认档位：用户明确说出的具体事实会自动记住，闲聊、提问不会存。',
  high:   '判断标准与"中"档一致，作为最宽松的一档预留（后续可以再放宽）。',
}

const ConstantPage = ({ config, setConfig, theme, setTheme, fontScale, setFontScale,
  voices, selectedVoiceURI, setSelectedVoiceURI,
  onSave, onOpenBackup, onRefreshVoices, showToast }) => {

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

          {/* 聊天字号：写 localStorage，改完立刻生效，不走后端也不用保存 */}
          <div className="font-scale-row">
            <div className="font-scale-head">
              <span className="font-scale-title">聊天字号</span>
              <span className="font-scale-hint">{FONT_SUB[fontScale] || 'Medium'}</span>
            </div>
            <div className="font-scale-seg">
              {FONT_SCALES.map(f => (
                <button
                  key={f}
                  className={`font-scale-btn${fontScale === f ? ' is-on' : ''}`}
                  onClick={() => setFontScale(f)}
                >
                  <span style={{ fontSize: `${{ sm: 12, md: 14, lg: 16.5, xl: 19 }[f]}px` }}>字</span>
                  <em>{FONT_LABELS[f]}</em>
                </button>
              ))}
            </div>
            <div className="font-scale-preview">这行字就是当前的正文大小。</div>
          </div>
        </div>

        {/* 记忆敏感度 + 记忆暂停 */}
        <div className="constant-section">
          <div className="constant-section-title">Memory · 记忆</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <div style={{ fontSize: '10px', letterSpacing: '1.5px', color: 'var(--c-text-faint)', marginBottom: 8, fontFamily: 'var(--font-accent)' }}>敏感度</div>
              <div className="sensitivity-row">
                {SENSITIVITY_LEVELS.map(lv => (
                  <button key={lv}
                    className={`sensitivity-btn ${(config.memory_sensitivity || 'medium') === lv ? 'solid-btn' : 'line-btn'}`}
                    onClick={() => { const next = { ...config, memory_sensitivity: lv }; setConfig(next); onSave(next) }}
                  >{SENSITIVITY_LABELS[lv]}</button>
                ))}
              </div>
              <div className="sensitivity-hint">{SENSITIVITY_HINTS[config.memory_sensitivity || 'medium']}</div>
            </div>
            <div className="const-switch-row" style={{ marginTop: 4 }}>
              <div>
                <div className="const-switch-label">记忆暂停</div>
                <div className="const-switch-sub">开启后跳过所有自动存入星尘，只保留手动"存入星尘"</div>
              </div>
              <button
                className={`const-switch${config.memory_paused ? ' is-on' : ''}`}
                onClick={() => { const next = { ...config, memory_paused: !config.memory_paused }; setConfig(next); onSave(next) }}
              >
                <span className="const-switch-knob" />
              </button>
            </div>
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

        {/* 参数 */}
        <div className="constant-section">
          <div className="constant-section-title">Parameters · 参数</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
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
          <button onClick={onOpenBackup} className="line-btn" style={{ width: '100%', padding: '12px 0', borderRadius: '14px', fontSize: '11.5px', letterSpacing: '2px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <Icon.Export size={13} /> 数据备份与恢复
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

  // ── 密码锁（B级）
  const [unlocked, setUnlocked] = useState(() => !!localStorage.getItem(ACCESS_KEY_STORAGE))

  // ── 原有状态
  const [showSplash,    setShowSplash]    = useState(() => !sessionStorage.getItem('hasVisited'))
  const [sessionList,   setSessionList]   = useState([])
  const [activeSessionId, setActiveSessionId] = useState(() => sessionStorage.getItem('activeSessionId') || null)
  const [messages,      setMessages]      = useState([])
  const [inputText,     setInputText]     = useState('')
  const [loading,       setLoading]       = useState(false)
  const [config,        setConfig]        = useState({
    system_prompt: '你是温柔贴心的AI伴侣，简短自然回复', temperature: 0.7, compress_threshold: 3000, compress_keep_rounds: 4, show_reasoning: false,
    memory_sensitivity: 'medium',   // 记忆敏感度（C级）：low / medium / high
    memory_paused: false,           // 记忆暂停开关（C级）
    model: '',                      // 当前选中的模型 id（C级 模型切换）；留空时后端 resolveModel 兜底到 deepseek-v4-flash
    models: [],                     // 用户配置的模型列表（C级 模型切换，EchoPage「提供商」拉取或手动新增）
  })
  const [archivedList,  setArchivedList]  = useState([])
  const [hasOlderArchive, setHasOlderArchive] = useState(false)
  const [archiveCursor, setArchiveCursor] = useState(null)
  const [deleteModal,   setDeleteModal]   = useState({ show: false, sessionId: null, name: '' })
  const [renameModal,   setRenameModal]   = useState({ show: false, sessionId: null, value: '' })
  const [theme,         setTheme]         = useState(() => {
    // 2026-08-11：这里原来是 localStorage.getItem('ks_theme') || 'noir'，
    // 不管存的值是否还在 THEMES 里——如果谁的浏览器里还留着更早版本
    // 存下的主题名（比如曾经完整做过、后来确认不要了的第三套主题），
    // 这行会原样把它设成 data-theme，而 App.css 里那套主题的变量块
    // 已经删掉了，页面会静默退回一堆零散的默认值，Appearance 里两个
    // 主题按钮却都不会显示"当前选中"，是个不容易发现的糊涂状态。
    // 加一层校验：存的值不在当前 THEMES 里就直接当没存过，退回 noir。
    const saved = localStorage.getItem('ks_theme')
    return THEMES.includes(saved) ? saved : 'noir'
  })
  const [fontScale,     setFontScale]     = useState(() => {
    const v = localStorage.getItem(FONT_STORAGE)
    return FONT_SCALES.includes(v) ? v : 'md'
  })
  const [toasts,        setToasts]        = useState([])
  const [inputFocused,  setInputFocused]  = useState(false)
  const [speakingKey,   setSpeakingKey]   = useState(null)
  const [isSpeakingPaused, setIsSpeakingPaused] = useState(false)
  const [voices,        setVoices]        = useState([])
  const [selectedVoiceURI, setSelectedVoiceURI] = useState(() => localStorage.getItem('ks_voice') || '')
  const [memories,      setMemories]      = useState([])   // D级起：结构化记忆目录（catalog），不再是纯文本数组
  const [memoriesLoading, setMemoriesLoading] = useState(false)
  const [memoryPulse,   setMemoryPulse]   = useState(false)
  // ── D级：星尘 3D 粒子记忆库 ──────────────────────────────
  const [stardustTab,      setStardustTab]      = useState('reverie') // traces | breath | reverie | noon | constellations
  const [stardustSearch,   setStardustSearch]   = useState('')
  const [selectedMemory,   setSelectedMemory]   = useState(null)       // 单条展开
  // 侧边会话列表（星轨内部展开）
  const [showSessionList, setShowSessionList] = useState(false)

  // ── C级：信标（便签）── 纯前端，零 AI 调用
  const [beacons,    setBeacons]    = useState(() => loadBeacons())
  const [beaconText, setBeaconText] = useState('')
  const addBeacon = () => {
    const text = beaconText.trim()
    if (!text) return
    const next = [...beacons, { id: `${Date.now()}-${Math.random()}`, text, done: false }]
    setBeacons(next); saveBeacons(next); setBeaconText('')
  }
  const toggleBeacon = (id) => {
    const next = beacons.map(b => b.id === id ? { ...b, done: !b.done } : b)
    setBeacons(next); saveBeacons(next)
  }
  const deleteBeacon = (id) => {
    const next = beacons.filter(b => b.id !== id)
    setBeacons(next); saveBeacons(next)
  }

  // ── CHAT 星核：脉动亮度/频率 —— 纯前端根据已加载消息推算 ──────
  // 今日消息越多越亮越快；距最近一条消息越久越暗越慢，不产生任何新请求。
  const [nowTick, setNowTick] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 60000)
    return () => clearInterval(t)
  }, [])

  const coreVisual = useMemo(() => {
    const todayStr = beaconTodayStr()
    const all = [...archivedList, ...messages]
    let todayCount = 0, lastTs = null
    all.forEach(m => {
      if (!m.created_at) return
      const t = new Date(m.created_at).getTime()
      if (Number.isNaN(t)) return
      if (!lastTs || t > lastTs) lastTs = t
      const bj = new Date(t + 8 * 3600 * 1000)
      const ds = `${bj.getUTCFullYear()}-${String(bj.getUTCMonth() + 1).padStart(2, '0')}-${String(bj.getUTCDate()).padStart(2, '0')}`
      if (ds === todayStr) todayCount++
    })
    let activity = Math.min(1, todayCount / 24)
    if (lastTs) {
      const idleMin = (nowTick - lastTs) / 60000
      const idleFactor = idleMin <= 30 ? 1 : Math.max(0.12, 1 - (idleMin - 30) / 600)
      activity *= idleFactor
    } else {
      activity = 0.1
    }
    return {
      period:   (5.6 - activity * 3.4).toFixed(2),
      glowMax:  (0.35 + activity * 0.55).toFixed(2),
      glowMin:  (0.10 + activity * 0.12).toFixed(2),
      scaleMax: (1.05 + activity * 0.16).toFixed(3),
    }
  }, [messages, archivedList, nowTick])

  // ── CHAT 星核 · 长按 1.5s 触发"星核低语" ─────────────────────
  const CORE_WHISPER_FALLBACKS = ['光需要时间才能到达', '有些沉默，也是一种在场', '你不在的时候，轨道仍在']
  const [coreWhisper, setCoreWhisper] = useState(null)
  const extractSentence = (text) => {
    if (!text) return null
    const raw = text.replace(/\n+/g, '。').split(/[。！？.!?]/).map(s => s.trim()).filter(s => s.length >= 4)
    if (!raw.length) return text.trim().slice(0, 60)
    return raw[Math.floor(Math.random() * raw.length)]
  }
  const fetchTodayDiaryLine = async () => {
    try {
      const res = await axios.get(`${API_BASE}/diary/list`)
      const todayStr = beaconTodayStr()
      const today = (res.data || []).find(d => d.date === todayStr)
      if (today?.content) return extractSentence(today.content)
    } catch {}
    return null
  }
  const triggerCoreWhisper = async () => {
    if (coreWhisper) return
    let line = await fetchTodayDiaryLine()
    if (!line) {
      const pool = memories.length ? memories : await fetchMemories()
      const highEmotion = pool.filter(m => (m.valence != null && Math.abs(m.valence) > 0.7) || (m.arousal != null && m.arousal > 0.8))
      if (highEmotion.length) {
        const pick = highEmotion[Math.floor(Math.random() * highEmotion.length)]
        line = extractSentence(pick.summary) || pick.summary
      }
    }
    if (!line) line = CORE_WHISPER_FALLBACKS[Math.floor(Math.random() * CORE_WHISPER_FALLBACKS.length)]
    setCoreWhisper(line)
    setTimeout(() => setCoreWhisper(null), 5200)
  }

  // ── CHAT 星核 · 单击进星轨 / 长按触发低语 的按压判定 ──────────
  const CORE_LONGPRESS_MS = 1500
  // 真机触屏按住不动时，手指仍会有 1~3px 的自然抖动，每一次都会触发 touchmove；
  // 原逻辑只要 touchmove 就立刻取消长按计时，导致在真机上长按几乎永远不会触发
  // （鼠标静止按住不会产生 mousemove，所以电脑上没问题）。这里改为设置移动容差，
  // 只有位移超过 CORE_PRESS_MOVE_TOLERANCE(px) 才视为真正的滑动/取消。
  const CORE_PRESS_MOVE_TOLERANCE = 10
  const corePressTimerRef    = useRef(null)
  const corePressFiredRef    = useRef(false)
  const corePressMovedRef    = useRef(false)
  const corePressStartPosRef = useRef({ x: 0, y: 0 })
  const onCorePressStart = (e) => {
    corePressFiredRef.current = false
    corePressMovedRef.current = false
    const pt = e.touches ? e.touches[0] : e
    corePressStartPosRef.current = { x: pt.clientX, y: pt.clientY }
    corePressTimerRef.current = setTimeout(() => {
      if (corePressMovedRef.current) return
      corePressFiredRef.current = true
      if (navigator.vibrate) navigator.vibrate(12)
      triggerCoreWhisper()
    }, CORE_LONGPRESS_MS)
  }
  const onCorePressMove = (e) => {
    const pt = e.touches ? e.touches[0] : e
    const start = corePressStartPosRef.current
    if (start && pt) {
      const dx = pt.clientX - start.x, dy = pt.clientY - start.y
      if (Math.hypot(dx, dy) < CORE_PRESS_MOVE_TOLERANCE) return // 抖动幅度内，不取消
    }
    corePressMovedRef.current = true
    clearTimeout(corePressTimerRef.current)
  }
  const onCorePressCancel = () => clearTimeout(corePressTimerRef.current)
  const onCorePressEnd = () => {
    clearTimeout(corePressTimerRef.current)
    if (!corePressFiredRef.current && !corePressMovedRef.current) setActiveTab('orbit')
  }

  // ── Token 统计仪表盘：数据已迁至 引力·数据罗盘（TokenDashboardPage），
  //    这里只保留状态与拉取逻辑，展开数据罗盘时才请求
  const [tokenStats,     setTokenStats]     = useState(null)
  const [tokenStatsLoading, setTokenStatsLoading] = useState(false)
  const fetchTokenStats = async () => {
    setTokenStatsLoading(true)
    try {
      const res = await axios.get(`${API_BASE}/stats/tokens`, { params: activeSessionId ? { sessionId: activeSessionId } : {} })
      setTokenStats(res.data)
    } catch { setTokenStats(null) }
    setTokenStatsLoading(false)
  }

  // ── A级：星轨交互补全 相关状态 ──────────────────────────
  const [msgMenu,       setMsgMenu]       = useState(null)   // { anchor, alignRight, items }
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
  const pressTimerRef     = useRef(null)
  const pressMovedRef     = useRef(false)
  const pressStartPosRef  = useRef({ x: 0, y: 0 }) // 长按起点坐标，用于移动容差判定（见下方 onPressMove）
  // 重新切回聊天页后，第一次点输入框弹键盘时用一次，见下方 kb-open 相关
  // useEffect 与 composer-input 的 onFocus——避免与 .no-shell-transition
  // 重名的解释重复写两遍
  const chatKbFixDoneRef = useRef(false)

  // message: 文案；opts.action: { label, onClick } 在 Toast 里附一个可点的按钮（如"重试"）
  // opts.duration: 自定义存活时长（默认无按钮 2500ms，带按钮 5000ms，给用户留出点击时间）
  const showToast = (message, opts = {}) => {
    const { action, duration } = opts
    const id = Date.now() + Math.random()
    const life = duration || (action ? 5000 : 2500)
    setToasts(prev => [...prev, { id, message, action }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), life)
  }

  // ── 合墨（共笔·接力写作）：引力·右下角天体。数据同样统一由 ChatPage
  //    持有，GravityPage → InkPage 只管展示，不直接掉接口，跟信标/
  //    数据罗盘是同一套约定。一篇笔记只有一段正文（note.content），
  //    entries 只是操作日志，本文件负责把日志和正文追加保持同步 ──
  const [inkNotes,        setInkNotes]        = useState([])
  const [inkNotesLoading, setInkNotesLoading] = useState(false)
  const [activeInkNote,        setActiveInkNote]        = useState(null) // { note, entries }
  const [activeInkNoteLoading, setActiveInkNoteLoading] = useState(false)
  const [inkGenerating,   setInkGenerating]   = useState(false)
  const [inkStreamText,   setInkStreamText]   = useState('') // 枢正在写、还没落定的实时预览文本
  const inkAbortRef = useRef(null)

  const fetchInkNotes = async () => {
    setInkNotesLoading(true)
    try { const res = await axios.get(`${API_BASE}/notes`); setInkNotes(res.data || []) }
    catch { showToast('合墨：加载笔记列表失败') }
    setInkNotesLoading(false)
  }

  const fetchInkEntries = async (noteId) => {
    setActiveInkNoteLoading(true)
    try { const res = await axios.get(`${API_BASE}/notes/${noteId}/entries`); setActiveInkNote(res.data) }
    catch { showToast('合墨：加载这篇笔记失败') }
    setActiveInkNoteLoading(false)
  }

  // ── 茧星（枢的自我记忆）：引力·时轨正下方天体。柯写的（ke）+
  //    枢自己写的（shu）两份列表，都由 ChatPage 统一持有，跟信标/
  //    数据罗盘/合墨是同一套"数据在 ChatPage、展示在子页"的约定。
  //    枢那边只能删不能改，也没有手动新增接口——只能通过聊天里
  //    COCOON_MARK 自动写入（见 server.js），写满之后后端会通过
  //    SSE 的 cocoonFull 事件通知，接在 readSSEStream 里转成 toast ──
  const [cocoonKe,       setCocoonKe]       = useState([])
  const [cocoonShu,      setCocoonShu]      = useState([])
  const [cocoonShuLimit, setCocoonShuLimit] = useState(20)
  const [cocoonLoading,  setCocoonLoading]  = useState(false)

  const fetchCocoon = async () => {
    setCocoonLoading(true)
    try {
      const res = await axios.get(`${API_BASE}/cocoon/list`)
      setCocoonKe(res.data?.ke || [])
      setCocoonShu(res.data?.shu || [])
      setCocoonShuLimit(res.data?.shuLimit ?? 20)
    } catch { showToast('茧星：加载记忆失败') }
    setCocoonLoading(false)
  }

  const addCocoonKe = async (content) => {
    try {
      const res = await axios.post(`${API_BASE}/cocoon/add`, { content })
      setCocoonKe(prev => [...prev, res.data])
    } catch (err) { showToast(err.response?.data?.error || '添加失败') }
  }

  // 不分 ke/shu，两边共用一个删除入口——柯可以删自己写的，也可以删
  // 枢写的，先从本地摘掉给个即时反馈，失败也不回滚，下次刷新会自然纠正
  const deleteCocoon = async (id) => {
    setCocoonKe(prev => prev.filter(item => item.id !== id))
    setCocoonShu(prev => prev.filter(item => item.id !== id))
    try { await axios.delete(`${API_BASE}/cocoon/${id}`) } catch {}
  }

  const saveCocoonLimit = async (n) => {
    setCocoonShuLimit(n)
    try { await axios.post(`${API_BASE}/settings`, { cocoon_shu_limit: n }) } catch { showToast('保存上限失败') }
  }

  const createInkNote = async () => {
    try {
      const res = await axios.post(`${API_BASE}/notes/new`, {})
      setInkNotes(prev => [res.data, ...prev])
      return res.data
    } catch { showToast('新建失败'); return null }
  }

  const updateInkNote = async (noteId, patch) => {
    try {
      const res = await axios.put(`${API_BASE}/notes/${noteId}`, patch)
      setActiveInkNote(prev => (prev && prev.note?.id === noteId) ? { ...prev, note: res.data } : prev)
      setInkNotes(prev => prev.map(n => n.id === noteId ? { ...n, ...res.data } : n))
    } catch { showToast('保存失败') }
  }

  const deleteInkNote = async (noteId) => {
    try {
      await axios.delete(`${API_BASE}/notes/${noteId}`)
      setInkNotes(prev => prev.filter(n => n.id !== noteId))
      setActiveInkNote(prev => (prev?.note?.id === noteId) ? null : prev)
    } catch { showToast('删除失败') }
  }

  const saveInkDraft = async (noteId, { content, mode }) => {
    try {
      const res = await axios.post(`${API_BASE}/notes/${noteId}/draft`, { content, mode })
      setActiveInkNote(prev => (prev && prev.note?.id === noteId) ? { ...prev, note: res.data } : prev)
      setInkNotes(prev => prev.map(n => n.id === noteId ? { ...n, hasDraft: !!content?.trim() } : n))
    } catch { showToast('待续保存失败') }
  }

  // 落笔：把当前尾巴追加进 note.content（本地乐观更新），同时把
  // 服务端返回的正式 entries 行推进日志
  const finalizeInkEntry = async (noteId, { content, mode }) => {
    try {
      const res = await axios.post(`${API_BASE}/notes/${noteId}/entries`, { content, mode })
      setActiveInkNote(prev => (prev && prev.note?.id === noteId)
        ? {
            ...prev,
            entries: [...prev.entries, res.data],
            note: {
              ...prev.note,
              // 后端追加正文走的是 appendWithBreak（会补一个段落换行），
              // 本地乐观更新也补上，字数统计才不会跟刷新后对不上
              content: (prev.note.content ? `${prev.note.content}\n\n` : '') + content,
              draft_content: null, draft_mode: null,
            },
          }
        : prev)
      setInkNotes(prev => prev.map(n => n.id === noteId ? { ...n, hasDraft: false } : n))
    } catch { showToast('落笔失败') }
  }

  // 枢续写/另写：SSE 流式，token 事件只更新 inkStreamText（实时预览，
  // 不进 entries），done 事件才把清洗后的正文一次性并入
  // note.content 并追加一条 entries 日志，同时带回 decision；如果
  // 这次是枢起笔（后端顺手生成了标题），autoTitle 也一并同步过来
  const readInkSSEStream = async (res, noteId, mode) => {
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
          if (ev.error) { showToast('枢写不下去了：' + ev.error); done = true; break }
          if (ev.token) setInkStreamText(prev => prev + ev.token)
          if (ev.done) {
            setActiveInkNote(prev => {
              if (!prev || prev.note?.id !== noteId) return prev
              const newEntry = {
                id: ev.entryId, author: 'shu', mode, content: ev.content,
                // truncated：撞到模型输出长度上限被切断了，界面会给
                // 一个「让他接着写完」的入口
                truncated: !!ev.truncated,
                decision: ev.decision,
                tokens_input: ev.tokens?.input, tokens_output: ev.tokens?.output,
                created_at: new Date().toISOString(),
              }
              return {
                ...prev,
                entries: [...prev.entries, newEntry],
                note: {
                  ...prev.note,
                  content: (prev.note.content ? `${prev.note.content}\n\n` : '') + ev.content,
                  updated_at: new Date().toISOString(),
                  ...(ev.autoTitle ? { title: ev.autoTitle } : {}),
                },
              }
            })
            setInkNotes(nPrev => nPrev.map(n => n.id === noteId
              ? { ...n, updated_at: new Date().toISOString(), ...(ev.autoTitle ? { title: ev.autoTitle } : {}) }
              : n))
          }
        } catch {}
      }
    }
  }

  const generateInkEntry = async (noteId, mode) => {
    setInkGenerating(true)
    setInkStreamText('')

    const controller = new AbortController()
    inkAbortRef.current = controller
    try {
      const res = await fetch(`${API_BASE}/notes/${noteId}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Access-Key': localStorage.getItem(ACCESS_KEY_STORAGE) || '' },
        body: JSON.stringify({ mode }),
        signal: controller.signal,
      })
      if (res.status === 401) { localStorage.removeItem(ACCESS_KEY_STORAGE); window.location.reload(); return }
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      await readInkSSEStream(res, noteId, mode)
    } catch (err) {
      if (err.name !== 'AbortError') showToast('生成失败：' + err.message)
    }
    inkAbortRef.current = null
    setInkStreamText('')
    setInkGenerating(false)
  }

  const stopInkGenerate = () => { inkAbortRef.current?.abort() }

  // 编辑一条自己写的段落：只有柯自己的段落允许改，枢写的段落接口
  // 那边会直接拒绝（403）。改完之后正文不是简单"接在末尾"了——服务端
  // 按 entries 顺序把整篇 content 重新拼过，本地直接拿这份结果整个
  // 替换，不做本地拼接（编辑可能发生在正文中间，拼不对）
  const updateInkEntry = async (noteId, entryId, { content }) => {
    try {
      const res = await axios.put(`${API_BASE}/notes/${noteId}/entries/${entryId}`, { content })
      setActiveInkNote(prev => (prev && prev.note?.id === noteId)
        ? {
            ...prev,
            entries: prev.entries.map(e => e.id === entryId ? { ...e, content } : e),
            note: { ...prev.note, content: res.data.content },
          }
        : prev)
      setInkNotes(nPrev => nPrev.map(n => n.id === noteId ? { ...n, preview: res.data.content.slice(0, 60) } : n))
      return res.data
    } catch { showToast('修改失败'); return null }
  }

  // 撤销枢刚写的那一段（生成完之后的"删除这段"）：本地也把最后一条
  // entries 和对应长度的 content 尾巴一起摘掉，跟后端保持同步
  const deleteLastInkEntry = async (noteId) => {
    try {
      const res = await axios.delete(`${API_BASE}/notes/${noteId}/last-entry`)
      setActiveInkNote(prev => {
        if (!prev || prev.note?.id !== noteId) return prev
        const list = [...prev.entries]
        list.pop()
        return { ...prev, entries: list, note: { ...prev.note, content: res.data.content } }
      })
    } catch { showToast('删除失败') }
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

  // ── 数据备份与恢复：把原来"导出当前对话"（只认当前这一个会话）换成
  // 一整套备份中心，见 BackupPage.jsx。这里只负责数据的取用和打包，
  // 跟别的天体子页同一套约定：ChatPage 持有数据/接口，子页只管展示 ──
  const downloadFile = (content, filename, mime) => {
    const blob = new Blob([content], { type: `${mime};charset=utf-8` })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
    // 浏览器/PWA 不会把真实的绝对路径暴露给页面（安全限制），
    // 只能确定文件去向的是"下载"目录 + 文件名，如实告知即可
    showToast(`已导出至下载目录 · ${filename}`)
  }

  // 拉一个会话的完整消息——可见的 + 所有已归档的（分页翻到底），不像
  // 原来的单会话导出那样只带上"恰好已经加载到本地"的那一小截归档
  const fetchFullSessionMessages = async (sid) => {
    const visRes = await axios.get(`${API_BASE}/messages/${sid}`)
    let archived = []
    let cursor = null, hasMore = true
    while (hasMore) {
      const params = new URLSearchParams(); if (cursor) params.append('cursor', cursor); params.append('limit', '50')
      const ar = await axios.get(`${API_BASE}/messages/archived/${sid}?${params}`)
      const { list, hasMore: more } = ar.data || {}
      if (list?.length) { archived = [...list, ...archived]; cursor = list[0].id }
      hasMore = !!more && (list?.length || 0) > 0
    }
    return [...archived, ...visRes.data].map(normalizeMsg)
  }

  // 支持多选：把选中的几个会话合并进同一个文件，不用逐个下载
  const exportChatSessions = async (sessionIds, format) => {
    if (!sessionIds.length) { showToast('先选至少一个对话'); return }
    try {
      const dateStr = new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')
      const sessions = []
      for (const sid of sessionIds) {
        const title = sessionList.find(s => s.id === sid)?.title || '对话'
        const msgs = await fetchFullSessionMessages(sid)
        sessions.push({ id: sid, title, messages: msgs })
      }
      if (format === 'json') {
        const payload = { type: 'presence_chat_export', exportedAt: new Date().toISOString(), sessions }
        downloadFile(JSON.stringify(payload, null, 2), `presence_chat_${dateStr}.json`, 'application/json')
      } else {
        let md = `# 聊天记录备份\n\n> 导出时间：${dateStr}\n`
        sessions.forEach(s => {
          md += `\n---\n\n# ${s.title}\n\n`
          s.messages.forEach(msg => {
            const time = formatTime(msg.created_at)
            md += `### ${msg.role === 'user' ? '**我**' : '**在场**'} · ${time}\n\n${msg.content}\n\n`
          })
        })
        downloadFile(md, `presence_chat_${dateStr}.md`, 'text/markdown')
      }
    } catch (err) { showToast('导出失败：' + err.message) }
  }

  const exportCocoonBackup = () => {
    const dateStr = new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')
    const payload = { type: 'presence_cocoon_export', exportedAt: new Date().toISOString(), ke: cocoonKe, shu: cocoonShu, shuLimit: cocoonShuLimit }
    downloadFile(JSON.stringify(payload, null, 2), `presence_cocoon_${dateStr}.json`, 'application/json')
  }

  const exportDiaryBackup = async () => {
    try {
      const res = await axios.get(`${API_BASE}/diary/list`)
      const dateStr = new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')
      const payload = { type: 'presence_diary_export', exportedAt: new Date().toISOString(), diary: res.data || [] }
      downloadFile(JSON.stringify(payload, null, 2), `presence_diary_${dateStr}.json`, 'application/json')
    } catch { showToast('日记导出失败') }
  }

  // 模型/提供商配置里带着 API Key，原样导出等于把密钥明文写进一个可能
  // 会分享/存放到别处的备份文件——这里全部替换成空字符串，密钥本身
  // 不做备份，恢复后需要重新填一遍；这个不便换来的是备份文件可以
  // 放心保留，不用担心密钥泄露
  const exportEchoConfigBackup = () => {
    const dateStr = new Date().toLocaleDateString('zh-CN').replace(/\//g, '-')
    const redact = (list) => (list || []).map(item => ({ ...item, apiKey: '' }))
    const payload = {
      type: 'presence_echo_config_export', exportedAt: new Date().toISOString(),
      system_prompt: config.system_prompt, temperature: config.temperature, model: config.model,
      models: redact(config.models), providers: redact(config.providers),
      note: 'API Key 出于安全考虑没有导出，恢复后需要重新填写',
    }
    downloadFile(JSON.stringify(payload, null, 2), `presence_echo_config_${dateStr}.json`, 'application/json')
  }

  const [showBackup, setShowBackup] = useState(false)
  const [backupDiaryCount, setBackupDiaryCount] = useState(0)
  const openBackupPage = () => {
    setShowBackup(true)
    fetchCocoon()
    axios.get(`${API_BASE}/diary/list`).then(res => setBackupDiaryCount((res.data || []).length)).catch(() => {})
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

  // ── 记忆（D级：结构化目录，供 Three.js 深空 / SVG 星图共用）────
  const fetchMemories = async () => {
    setMemoriesLoading(true)
    let list = []
    try {
      const res = await axios.get(`${API_BASE}/memories/catalog`)
      list = res.data.memories || []
      setMemories(list)
    } catch { setMemories([]) }
    setMemoriesLoading(false)
    return list
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
              if (last?.streaming) msgs[msgs.length - 1] = { ...last, content: last.content + ev.token, chunks: [...(last.chunks || []), ev.token] }
              return msgs
            })
            scrollBottom()
          }
          if (ev.memoryHit) {
            setMemoryPulse(true)
            setTimeout(() => setMemoryPulse(false), 4000)
          }
          if (ev.cocoonFull) {
            showToast('茧星内芯已满，枢这次想记的事没有存下来——去茧星删几条旧的')
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
    // chunks：跟 content 平行攒着的原始分片数组，只给 StreamingText 的
    // 逐块浮现动画用（见该组件顶部注释），content 本身的用途不变
    const tempAI = { role: 'assistant', content: '', chunks: [], created_at: new Date(), streaming: true }
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
    try {
      await axios.post(`${API_BASE}/memories/hold`, { content: bodyText })
      showToast('已存入星尘')
      if (activeTab === 'stardust') fetchMemories()
    }
    catch (err) { showToast('存入失败：' + err.message) }
  }

  const getSettings  = async () => { try { const res = await axios.get(`${API_BASE}/settings`); setConfig(prev => ({ ...prev, ...res.data })) } catch {} }
  const saveSettings = async (overrideConfig) => { try { await axios.post(`${API_BASE}/settings`, overrideConfig || config); if (!overrideConfig) showToast('已保存') } catch (err) { showToast('保存失败：' + err.message) } }

  // ── EchoPage「提供商」卡片"获取模型列表"用：代理请求该提供商的
  //    /models 列表接口（真正的转发在后端 /api/models/discover，
  //    这里只是把 GravityPage → EchoPage 传下来的调用接到 API_BASE
  //    上）。不在这里 catch——让错误原样抛给 EchoPage 自己的 try/catch，
  //    它要读 err.response.data.error 里后端给的具体失败原因。
  const discoverModels = async (baseUrl, apiKey, providerId, protocol) => {
    const res = await axios.post(`${API_BASE}/models/discover`, { baseUrl, apiKey, providerId, protocol })
    return res.data?.models || []
  }

  // ── 到点提醒：Web Push 订阅 ──────────────────────────────────
  // VAPID 公钥是 base64url 字符串，pushManager.subscribe 要的是
  // Uint8Array，这个转换是标准写法，别处也这么写
  const urlBase64ToUint8Array = (base64String) => {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
    const raw = atob(base64)
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)))
  }
  const enablePushReminders = async () => {
    try {
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
        showToast('这台设备/浏览器不支持推送通知'); return
      }
      const perm = await Notification.requestPermission()
      if (perm !== 'granted') { showToast('没有获得通知权限，提醒推不出去'); return }
      const reg = await navigator.serviceWorker.ready
      let sub = await reg.pushManager.getSubscription()
      if (!sub) {
        const { data } = await axios.get(`${API_BASE}/push/vapid-public-key`)
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(data.key),
        })
      }
      await axios.post(`${API_BASE}/push/subscribe`, sub.toJSON())
      showToast('到点提醒通知已开启')
    } catch (err) { showToast('开启失败：' + err.message) }
  }

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

  // ── 字号：写 html 上的 data 属性，CSS 变量随之切换，改完立刻生效 ──
  useEffect(() => {
    document.documentElement.setAttribute('data-font-scale', fontScale)
    try { localStorage.setItem(FONT_STORAGE, fontScale) } catch {}
  }, [fontScale])

  // ── PWA 视口兜底 ────────────────────────────────────────────
  // 两件事都必须在 viewport meta 上声明，光靠 JS 量高度补不回来：
  //   viewport-fit=cover        内容才能画到刘海/手势条底下，否则四周留白
  //   interactive-widget=resizes-content
  //                             键盘弹出时让「布局视口」本身变矮，输入框会
  //                             自然被顶上去；默认的 resizes-visual 只缩可视
  //                             视口，布局高度不变，输入框就被压在键盘下面
  // index.html 里写死才是正解，这里做运行时兜底，避免漏改一处就前功尽弃。
  useEffect(() => {
    const setMeta = (name, content) => {
      let m = document.querySelector(`meta[name="${name}"]`)
      if (!m) { m = document.createElement('meta'); m.setAttribute('name', name); document.head.appendChild(m) }
      if (m.getAttribute('content') !== content) m.setAttribute('content', content)
    }
    setMeta('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content')
    setMeta('mobile-web-app-capable', 'yes')
    setMeta('apple-mobile-web-app-capable', 'yes')
    setMeta('apple-mobile-web-app-status-bar-style', 'black-translucent')
  }, [])

  // ── 可视高度 / 键盘高度 ─────────────────────────────────────
  // 安卓上键盘弹出会走三种完全不同的路子，光靠一种测量方式必定漏掉一种：
  //   A 布局视口自己变矮（interactive-widget=resizes-content 生效）
  //   B 只有可视视口变矮，布局视口不动（老一点的默认行为）
  //   C 键盘直接盖上去，两个视口都不动 —— 这种情况下 visualViewport
  //     量出来的数字和没弹键盘时一模一样，输入框自然就被埋在键盘底下了，
  //     这也是之前反复调 visualViewport 都修不好的原因
  // VirtualKeyboard API 能在 C 里给出键盘的精确矩形，所以这里主动接管；
  // 拿不到这个 API 时退回 visualViewport，A / B 依然工作。
  useEffect(() => {
    const root = document.documentElement
    const vk = (typeof navigator !== 'undefined' && navigator.virtualKeyboard) || null
    if (vk) { try { vk.overlaysContent = true } catch {} }

    const apply = () => {
      const vv = window.visualViewport
      const visual = vv ? vv.height : window.innerHeight
      const shrunk = Math.max(0, window.innerHeight - visual)   // 已经被谁扣掉的高度
      const vkH = vk && vk.boundingRect ? vk.boundingRect.height : 0
      // 只补"还没有人扣过"的那一截：两套机制同时生效时不会扣两遍，
      // 只有一套生效时也补得上，公式对 A/B/C 三种情况都成立
      const kb = Math.max(0, vkH - shrunk)

      root.style.setProperty('--app-height', `${Math.round(visual)}px`)
      root.style.setProperty('--kb-height', `${Math.round(kb)}px`)
      root.classList.toggle('kb-open', Math.max(vkH, shrunk) > 90)
      // 页面比可视区高时浏览器会自己滚一下来露出输入框，结果是顶栏被推出屏幕
      if (window.scrollY !== 0) window.scrollTo(0, 0)
    }
    apply()

    // resize 覆盖大多数场景；scroll 是安卓上部分机型键盘弹出时唯一会触发的事件，两个都要接
    window.visualViewport?.addEventListener('resize', apply)
    window.visualViewport?.addEventListener('scroll', apply)
    window.addEventListener('resize', apply)
    window.addEventListener('orientationchange', apply)
    vk?.addEventListener?.('geometrychange', apply)
    return () => {
      window.visualViewport?.removeEventListener('resize', apply)
      window.visualViewport?.removeEventListener('scroll', apply)
      window.removeEventListener('resize', apply)
      window.removeEventListener('orientationchange', apply)
      vk?.removeEventListener?.('geometrychange', apply)
      if (vk) { try { vk.overlaysContent = false } catch {} }
    }
  }, [])

  // 切到星尘时自动拉取记忆
  useEffect(() => {
    if (activeTab === 'stardust' && memories.length === 0) fetchMemories()
  }, [activeTab])

  // 每次切回聊天页（'orbit'）都重新武装一次"首次对焦抑制"——见下方
  // composer-input 的 onFocus 与 App.css 的 .no-shell-transition 注释：
  // 从别的 tab 切回来后，第一次点输入框弹键盘，.app-shell 的高度过渡
  // 容易跟这一页刚挂载的入场动画/首次滚动撞在一起，闪一下；同一次
  // 停留里后续再点输入框不会重复出现，所以只在"刚切回来"这次重置。
  useEffect(() => {
    if (activeTab === 'orbit') chatKbFixDoneRef.current = false
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
  const openMsgMenu = (anchorEl, msg, key, isUser, isLastAI, isArchived, body) => {
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
    // 只留下菜单定位需要的几个数字：DOM 节点不进 state，避免持有已卸载的元素
    const r = anchorEl && anchorEl.getBoundingClientRect ? anchorEl.getBoundingClientRect() : null
    setMsgMenu({
      anchor: r ? { top: r.top, bottom: r.bottom, left: r.left, right: r.right } : null,
      alignRight: isUser,
      items,
    })
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
    // 2026-08-11 改动：思考模式开关现在只管 AI 真的思不思考（见
    // server.js 的 deepseekThinking 调用），不再联动这里的默认展开/
    // 折叠——每条消息一律默认折叠，要看哪条就手动点那条上方的
    // "思考过程"小标识，展开状态只记在 expandedReasoning 里
    const reasoningOpen = expandedReasoning.get(key) ?? false
    const toggleReasoning = () => setExpandedReasoning(prev => {
      const next = new Map(prev)
      next.set(key, !reasoningOpen)
      return next
    })

    // 长按检测（触屏 + 鼠标），移动超过容差或松开即取消；桌面端右键直接打开
    // 真机触屏按住不动时手指仍有 1~3px 自然抖动，每次都会触发 touchmove——
    // 原逻辑一有 touchmove 就取消计时器，导致真机上长按基本不会触发（PC 用鼠标
    // 静止按住不产生 mousemove，所以电脑上一直是正常的）。这里加移动容差修复。
    const PRESS_MOVE_TOLERANCE = 10
    const onPressStart = (e) => {
      pressMovedRef.current = false
      const pt = e.touches ? e.touches[0] : e
      pressStartPosRef.current = { x: pt.clientX, y: pt.clientY }
      // 同步取下气泡节点：定时器里 e 已经不可靠了
      const bubbleEl = e.currentTarget
      pressTimerRef.current = setTimeout(() => {
        if (pressMovedRef.current) return
        if (navigator.vibrate) navigator.vibrate(8)
        openMsgMenu(bubbleEl, msg, key, isUser, isLastAI, isArchived, body)
      }, 480)
    }
    const onPressMove = (e) => {
      const pt = e.touches ? e.touches[0] : e
      const start = pressStartPosRef.current
      if (start && pt) {
        const dx = pt.clientX - start.x, dy = pt.clientY - start.y
        if (Math.hypot(dx, dy) < PRESS_MOVE_TOLERANCE) return // 抖动幅度内，不取消
      }
      pressMovedRef.current = true
      clearTimeout(pressTimerRef.current)
    }
    const onPressEnd  = () => clearTimeout(pressTimerRef.current)
    const onCtxMenu   = (e) => { e.preventDefault(); clearTimeout(pressTimerRef.current); openMsgMenu(e.currentTarget, msg, key, isUser, isLastAI, isArchived, body) }

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
                    ? <StreamingText text={body} chunks={msg.chunks} />
                    : <MarkdownText text={body} />
                }
              </div>
            </div>
            {/* 操作栏：时间戳一律靠头像那一侧——我的消息贴最右，祂的贴最左 */}
            <div className={`msg-meta${isUser ? ' is-user' : ''}`}>
              {isUser ? (
                <>
                  {edited && <span className="edited-tag">已编辑</span>}
                  {msg.truncated && <span className="edited-tag">已中断</span>}
                  <span className="msg-time">{formatTime(msg.created_at)}</span>
                </>
              ) : (
                <>
                  <span className="msg-time">{formatTime(msg.created_at)}</span>
                  {!isStreaming && (
                    <>
                      <button
                        className={`msg-meta-btn${speakingKey === key ? ' is-on' : ''}`}
                        onClick={() => speakMessage(body, key)}
                        title={speakingKey === key ? (isSpeakingPaused ? '继续朗读' : '暂停朗读') : '朗读'}
                      >
                        {speakingKey === key && !isSpeakingPaused
                          ? <Icon.Pause size={15} />
                          : speakingKey === key && isSpeakingPaused
                            ? <Icon.Play size={15} />
                            : <Icon.Speak size={15} />}
                      </button>
                      <button className="msg-meta-btn" onClick={() => copyMessage(body)} title="复制">
                        <Icon.Copy size={15} />
                      </button>
                      {isLastAI && (
                        <button className="msg-meta-btn" onClick={regenerateLastMessage} title="重新生成">
                          <Icon.Refresh size={15} />
                        </button>
                      )}
                      {msg.tokens && (
                        <span className="token-label">↑{msg.tokens.input} ↓{msg.tokens.output}</span>
                      )}
                    </>
                  )}
                  {edited && <span className="edited-tag">已编辑</span>}
                  {msg.truncated && <span className="edited-tag">已中断</span>}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }

  const groupedMessages = groupMessagesByDate(messages)

  // ── 星轨页面 ─────────────────────────────────────────────
  // 注意：这里故意不写成 `const OrbitPage = () => (...)` 再 <OrbitPage />。
  // 之前那样写，因为 OrbitPage 定义在 ChatPage 组件函数体内部，
  // 每次 ChatPage 重新渲染（哪怕只是输入框打一个字）都会生成一个全新的
  // 函数引用，React 会把它当成一个全新的组件类型，导致整棵子树被
  // 卸载再重新挂载——这正是"打字只能进一个字就失焦"、
  // "收发消息时画面一闪一闪"的根因。改成下面这样的纯 JSX 表达式后，
  // React 按标签/位置做正常的差异对比，不会整体重挂载。
  const orbitPageContent = activeTab !== 'orbit' ? null : (
    <div className="tab-page">
      {/* 顶栏 */}
      <div className="hairline-bottom" style={{ padding: '16px 18px 13px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        {/* 左：会话侧边栏开关 */}
        <button
          onClick={() => setShowSessionList(true)}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--c-text-muted)', display: 'flex', padding: '4px' }}
          aria-label="打开会话列表"
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

      {/* 会话侧边栏：原来是顶栏下方的内嵌下拉列表，改成侧滑抽屉——
          fixed 全屏浮层，z-index 高于 .bottom-nav，会话再多也不会有
          任何一条被底部导航栏挡住或够不着 */}
      {showSessionList && (
        <div className="chat-sidebar-veil" onClick={() => setShowSessionList(false)}>
          <div className="chat-sidebar" onClick={e => e.stopPropagation()}>
            <div className="chat-sidebar-head">
              <span className="chat-sidebar-title">SESSIONS</span>
              <button className="chat-sidebar-close" onClick={() => setShowSessionList(false)} aria-label="关闭">
                <Icon.Close size={15} />
              </button>
            </div>
            <button onClick={createSession} className="line-btn chat-sidebar-new">
              <Icon.Plus size={11} /> NEW
            </button>
            <div className="chat-sidebar-list">
              {sessionList.map(item => (
                <div key={item.id} className={`session-item${activeSessionId===item.id?' is-active':''}`} onClick={() => { switchSession(item.id); setShowSessionList(false) }}>
                  <span style={{ fontSize: '13px', color: activeSessionId===item.id ? 'var(--c-text)' : 'var(--c-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '.3px' }}>{item.title}</span>
                  <div className="session-actions" style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                    <button className="icon-btn" onClick={e => { e.stopPropagation(); handleRenameClick(item.id, item.title) }} style={{ background: 'transparent', border: 'none', color: 'var(--c-text-muted)', cursor: 'pointer', padding: '4px' }}><Icon.Edit /></button>
                    <button className="icon-btn" onClick={e => { e.stopPropagation(); handleDeleteClick(item.id, item.title) }} style={{ background: 'transparent', border: 'none', color: 'var(--c-text-muted)', cursor: 'pointer', padding: '4px' }}><Icon.Trash /></button>
                  </div>
                </div>
              ))}
              {sessionList.length === 0 && (
                <div style={{ padding: '20px 12px', fontSize: '12px', color: 'var(--c-text-faint)', textAlign: 'center' }}>暂无会话</div>
              )}
            </div>
          </div>
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

      {/* 输入框：内边距挪进 CSS，键盘弹出时可以收掉给底部导航预留的那 78px */}
      <div className="composer-dock">
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
        {/* 工具行：思考模式开关。只管 AI 回复前真的思不思考（server.js
            deepseekThinking() 读的就是这里存的 show_reasoning），跟
            "思考过程"展开/折叠已经解耦——2026-08-11 这天先把两者绑一起
            又拆开了：绑一起时开这颗按钮会让所有消息默认展开思考过程，
            用户反馈不想要这个联动，改成每条消息一律默认折叠，只由
            消息上方"思考过程"那个小标识手动点开/收起，跟这颗按钮
            无关，见下方 reasoningOpen 的处理。
            仅对 DeepSeek V4 系列模型生效（其它兼容供应商未必支持思考
            模式字段，服务端会自动忽略，详见 server.js 里的说明）。*/}
        <div className="composer-toolbar">
          <button
            className={`composer-tool-btn${config.show_reasoning ? ' is-on' : ''}`}
            onClick={() => { const next = { ...config, show_reasoning: !config.show_reasoning }; setConfig(next); saveSettings(next) }}
            title="开启后 AI 回复前会先思考（仅 DeepSeek V4 系列生效），思考过程默认折叠，点消息上方的「思考过程」手动展开"
          >
            <Icon.Brain size={12} /> 思考模式
          </button>
        </div>
        <div className={`composer-shell${inputFocused ? ' is-focused' : ''}`}>
          <textarea
            className="composer-input"
            value={inputText}
            onChange={e => setInputText(e.target.value)}
            onKeyDown={e => e.ctrlKey && e.key === 'Enter' && sendMessage()}
            onFocus={() => {
              setInputFocused(true)
              // 只在这次停留于聊天页的第一次对焦时处理——见上面
              // chatKbFixDoneRef 声明处与 App.css 的 .no-shell-transition
              // 注释。让 .app-shell 的高度变化直接跳变，避开这次键盘
              // 弹出的过渡窗口跟页面入场动画叠在一起造成的那次画面闪烁；
              // 260ms 后照常摘掉，不影响之后正常的键盘收起/弹出过渡。
              if (!chatKbFixDoneRef.current) {
                chatKbFixDoneRef.current = true
                const shell = document.querySelector('.app-shell')
                if (shell) {
                  shell.classList.add('no-shell-transition')
                  setTimeout(() => shell.classList.remove('no-shell-transition'), 260)
                }
              }
              setTimeout(() => { if (messageBoxRef.current) messageBoxRef.current.scrollTop = messageBoxRef.current.scrollHeight }, 300)
            }}
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
      className="app-shell"
      style={{ color: 'var(--c-text)', fontFamily: 'var(--font-body)' }}
    >
      {/* 星空 Canvas */}
      <StarCanvas ref={starCanvasRef} theme={theme} interactive={false} />

      {/* 颗粒 */}
      <div className="grain-overlay" />

      {/* 密码锁：未解锁前遮住一切交互 */}
      {!unlocked && <AccessGate onUnlock={() => setUnlocked(true)} />}

      {/* 开屏 */}
      {unlocked && showSplash && <SplashScreen onEnter={handleSplashEnter} theme={theme} />}

      {/* 长按消息菜单 */}
      {msgMenu && (
        <MsgContextMenu anchor={msgMenu.anchor} alignRight={msgMenu.alignRight} items={msgMenu.items} onClose={() => setMsgMenu(null)} />
      )}

      {/* CHAT 星核低语：长按星核触发，全屏大字浮现后消散 */}
      {coreWhisper && (
        <div className="core-whisper-overlay" aria-hidden="true">
          <span className="core-whisper-text">{coreWhisper}</span>
        </div>
      )}

      {/* 主内容区 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative', zIndex: 1 }}>

          {/* Tab 页面 */}
          {orbitPageContent}
          {activeTab === 'gravity' && (
            <GravityPage key="gravity"
              beacons={beacons} beaconText={beaconText} setBeaconText={setBeaconText}
              onAddBeacon={addBeacon} onToggleBeacon={toggleBeacon} onDeleteBeacon={deleteBeacon}
              showToast={showToast}
              config={config} setConfig={setConfig} onSaveConfig={saveSettings} onDiscoverModels={discoverModels}
              tokenStats={tokenStats} tokenStatsLoading={tokenStatsLoading} onFetchTokenStats={fetchTokenStats}
              onEnablePush={enablePushReminders}
              inkNotes={inkNotes} inkNotesLoading={inkNotesLoading} onFetchInkNotes={fetchInkNotes}
              onCreateInkNote={createInkNote} onUpdateInkNote={updateInkNote} onDeleteInkNote={deleteInkNote}
              activeInkNote={activeInkNote} activeInkNoteLoading={activeInkNoteLoading} onOpenInkNote={fetchInkEntries}
              onSaveInkDraft={saveInkDraft} onFinalizeInkEntry={finalizeInkEntry}
              onGenerateInkEntry={generateInkEntry} onStopInkGenerate={stopInkGenerate} inkGenerating={inkGenerating}
              onDeleteLastInkEntry={deleteLastInkEntry} onUpdateInkEntry={updateInkEntry}
              inkStreamText={inkStreamText}
              cocoonKe={cocoonKe} cocoonShu={cocoonShu} cocoonShuLimit={cocoonShuLimit} cocoonLoading={cocoonLoading}
              onFetchCocoon={fetchCocoon} onAddCocoonKe={addCocoonKe} onDeleteCocoon={deleteCocoon} onSaveCocoonLimit={saveCocoonLimit}
            />
          )}
          {activeTab === 'stardust' && (
            <StardustPage key="stardust"
              memories={memories} memoriesLoading={memoriesLoading}
              onFetch={fetchMemories} onDream={triggerDream}
              activeSubTab={stardustTab} onSubTabChange={setStardustTab}
              searchQuery={stardustSearch} onSearchChange={setStardustSearch}
              selectedMemory={selectedMemory} onSelectMemory={setSelectedMemory} onCloseMemory={() => setSelectedMemory(null)}
              theme={theme}
            />
          )}
          {activeTab === 'chronicle' && <ChroniclePage key="chronicle" />}
          {activeTab === 'constant' && (
            <ConstantPage key="constant"
              config={config} setConfig={setConfig}
              theme={theme} setTheme={setTheme}
              fontScale={fontScale} setFontScale={setFontScale}
              voices={voices} selectedVoiceURI={selectedVoiceURI} setSelectedVoiceURI={setSelectedVoiceURI}
              onSave={saveSettings} onOpenBackup={openBackupPage}
              onRefreshVoices={refreshVoices} showToast={showToast}
            />
          )}

          {/* 底部导航栏：星尘页替换为右下角悬浮扇形导航，离开星尘自动恢复 */}
          {activeTab === 'stardust' ? (
            <DustFab activeTab={activeTab} onNavigate={(tab) => setActiveTab(tab)} />
          ) : (
            <nav className="bottom-nav">
              {/* 引力 */}
              <button className={`nav-tab${activeTab==='gravity'?' is-active':''}`} onClick={() => setActiveTab('gravity')}>
                <span className="nav-tab-icon"><Icon.Gravity size={19} /></span>
                <span className="nav-tab-label">GRAVITY</span>
              </button>

              {/* 星尘 */}
              <button className={`nav-tab${activeTab==='stardust'?' is-active':''}`} onClick={() => setActiveTab('stardust')}>
                <span className="nav-tab-icon"><Icon.Stardust size={19} /></span>
                <span className="nav-tab-label">DUST</span>
              </button>

              {/* CHAT（中央星核）：单击直达星轨，长按 1.5s 触发星核低语 */}
              <div className="nav-origin-wrap">
                <button
                  className="nav-core-btn"
                  style={{
                    '--core-period':   `${coreVisual.period}s`,
                    '--core-glow-max': coreVisual.glowMax,
                    '--core-glow-min': coreVisual.glowMin,
                    '--core-scale-max': coreVisual.scaleMax,
                  }}
                  onTouchStart={onCorePressStart} onTouchMove={onCorePressMove} onTouchEnd={onCorePressEnd} onTouchCancel={onCorePressCancel}
                  onMouseDown={onCorePressStart} onMouseMove={onCorePressMove} onMouseUp={onCorePressEnd} onMouseLeave={onCorePressCancel}
                  title="CHAT"
                />
                <span className="nav-core-label">CHAT</span>
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
          )}
        </div>

      {/* Toast */}
      <div className="toast-wrap">
        {toasts.map(t => (
          <div key={t.id} className={`toast-item${t.action ? ' has-action' : ''}`}>
            <span>{t.message}</span>
            {t.action && (
              <button
                className="toast-action"
                onClick={() => { t.action.onClick(); setToasts(prev => prev.filter(x => x.id !== t.id)) }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
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

      {/* 数据备份与恢复：设置页"数据"那块点开的全屏中心，替代原来只能
          导出当前这一个会话的按钮。ChatPage 持有数据/接口，页面本身
          只管展示和交互，跟别的天体子页同一套约定 */}
      {showBackup && (
        <BackupPage
          sessionList={sessionList}
          cocoonKeCount={cocoonKe.length} cocoonShuCount={cocoonShu.length}
          diaryCount={backupDiaryCount}
          echoModelCount={(config.models || []).length}
          onExportSessions={exportChatSessions}
          onExportCocoon={exportCocoonBackup}
          onExportDiary={exportDiaryBackup}
          onExportEchoConfig={exportEchoConfigBackup}
          showToast={showToast}
          onClose={() => setShowBackup(false)}
        />
      )}
    </div>
  )
}

export default ChatPage
