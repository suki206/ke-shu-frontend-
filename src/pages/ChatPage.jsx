import { useState, useEffect, useRef } from 'react'
import axios from 'axios'

const API_BASE = 'https://ke-shu-backend.onrender.com/api'

// 防缓存
axios.interceptors.request.use(config => {
  if (config.method === 'get') {
    config.params = { ...config.params, _t: Date.now() }
  }
  return config
})

// ========== 主题配置 ==========
const THEMES = ['warm', 'mist', 'noir']
const THEME_LABELS = { warm: 'Aurum', mist: 'Lumen', noir: 'Lys' }
const THEME_SUB = { warm: '金烛', mist: '纸羽', noir: '夜百合' }
const THEME_META_COLOR = { warm: '#191108', mist: '#F2EEE6', noir: '#060608' }

// ========== 图标 ==========
const Icon = {
  Menu: (p) => (
    <svg width={p.size || 20} height={p.size || 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round">
      <line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="14" y2="17" />
    </svg>
  ),
  Edit: (p) => (
    <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  ),
  Trash: (p) => (
    <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
    </svg>
  ),
  Plus: (p) => (
    <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  Close: (p) => (
    <svg width={p.size || 16} height={p.size || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round">
      <line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" />
    </svg>
  ),
  ArrowUp: (p) => (
    <svg width={p.size || 16} height={p.size || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="19" x2="12" y2="5" /><polyline points="6 11 12 5 18 11" />
    </svg>
  ),
  Moon: (p) => (
    <svg width={p.size || 16} height={p.size || 16} viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" />
    </svg>
  )
}

const SettingsIcon = (p) => (
  <svg width={p.size || 16} height={p.size || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
  </svg>
)

// ========== 照片背景 ==========
const PhotoBackdrop = () => (
  <div className="photo-bg" aria-hidden="true">
    <div className="photo-layer" />
    <div className="photo-scrim" />
    <div className="photo-vignette" />
  </div>
)

// ========== 头像 ==========
const UserAvatar = ({ size = 28 }) => (
  <div style={{
    width: size, height: size, borderRadius: '50%', flexShrink: 0,
    background: 'var(--c-glass-bg-user)',
    border: '1px solid var(--c-line-strong)',
    backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)'
  }} />
)

const AIAvatar = ({ size = 28 }) => (
  <div style={{
    width: size, height: size, borderRadius: '50%', flexShrink: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    border: '1px solid var(--c-line-strong)',
    background: 'var(--c-accent-soft)',
    backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)'
  }}>
    <div style={{ width: size * 0.3, height: size * 0.3, borderRadius: '50%', background: 'var(--c-accent)', opacity: 0.85 }} />
  </div>
)

// ========== 品牌字标 ==========
const Wordmark = ({ size = 'md' }) => (
  <span className={`wordmark wordmark-${size}`}>
    <span className="wordmark-part">ke</span>
    <span className="wordmark-amp">&amp;</span>
    <span className="wordmark-part">shu</span>
  </span>
)

// ============================================================
// 1. 开屏页 —— 光从文字内部亮起
// ============================================================
const SPLASH_DUST_COUNT = 22
const SPLASH_PHRASE = ['every', 'word', 'finds', 'its', 'light']
const SplashScreen = ({ onEnter, theme }) => {
  const [fadeOut, setFadeOut] = useState(false)
  const [visible, setVisible] = useState(true)
  const themeLabel = THEME_LABELS[theme] || 'Aurum'
  const themeSub = THEME_SUB[theme] || '金烛'
  const [dust] = useState(() => Array.from({ length: SPLASH_DUST_COUNT }).map((_, i) => ({
    id: i,
    left: Math.random() * 100,
    size: (1 + Math.random() * 2.4).toFixed(2),
    delay: (Math.random() * 10).toFixed(2),
    duration: (11 + Math.random() * 10).toFixed(2),
    drift: Math.round((Math.random() - 0.5) * 70)
  })))
  const [twinkles] = useState(() => Array.from({ length: 34 }).map((_, i) => ({
    id: i,
    left: Math.random() * 100,
    top: Math.random() * 100,
    size: (0.6 + Math.random() * 1.3).toFixed(2),
    delay: (Math.random() * 6).toFixed(2),
    duration: (3 + Math.random() * 4).toFixed(2)
  })))

  const wordStep = 0.3
  const phraseDoneAt = 0.3 + SPLASH_PHRASE.length * wordStep + 0.5

  const handleClick = () => {
    setFadeOut(true)
    setTimeout(() => {
      setVisible(false)
      onEnter()
    }, 680)
  }

  if (!visible) return null

  return (
    <div
      className="splash-screen"
      style={{
        opacity: fadeOut ? 0 : 1,
        transform: fadeOut ? 'scale(1.05)' : 'scale(1)',
        filter: fadeOut ? 'blur(8px)' : 'blur(0px)'
      }}
    >
      <PhotoBackdrop />
      <div className="splash-dim" />

      <div className="splash-twinkle-field" aria-hidden="true">
        {twinkles.map(t => (
          <span
            key={t.id}
            className="splash-twinkle"
            style={{
              left: `${t.left}%`,
              top: `${t.top}%`,
              width: `${t.size}px`,
              height: `${t.size}px`,
              '--tw-duration': `${t.duration}s`,
              '--tw-delay': `${t.delay}s`
            }}
          />
        ))}
      </div>

      <div className="splash-glow" style={{ animationDelay: `${phraseDoneAt + 0.3}s` }} aria-hidden="true" />

      <div className="splash-dust-field" aria-hidden="true">
        {dust.map(d => (
          <span
            key={d.id}
            className="splash-dust"
            style={{
              left: `${d.left}%`,
              width: `${d.size}px`,
              height: `${d.size}px`,
              '--dust-duration': `${d.duration}s`,
              '--dust-delay': `${d.delay}s`,
              '--dust-drift': `${d.drift}px`
            }}
          />
        ))}
      </div>

      <div className="splash-headline">
        {SPLASH_PHRASE.map((w, i) => (
          <span
            key={i}
            className="splash-word"
            style={{
              animationDelay: `${0.3 + i * wordStep}s`,
              animationName: 'lightFromWithin',
              animationDuration: '1.8s',
              animationFillMode: 'forwards',
              opacity: 0,
            }}
          >
            {w}
          </span>
        ))}
      </div>

      <div className="splash-shimmer" style={{ animationDelay: `${phraseDoneAt}s` }} aria-hidden="true" />

      <div className="splash-frame" aria-hidden="true">
        <span className="splash-corner splash-corner-tl" />
        <span className="splash-corner splash-corner-tr" />
        <span className="splash-corner splash-corner-bl" />
        <span className="splash-corner splash-corner-br" />
      </div>

      <div className="splash-foot">
        <div className="splash-ornament" style={{ animationDelay: `${phraseDoneAt + 0.15}s` }} aria-hidden="true">
          <span className="splash-ornament-line" />
          <span className="splash-ornament-dot" />
          <span className="splash-ornament-line" />
        </div>
        <div className="splash-rule" style={{ animationDelay: `${phraseDoneAt + 0.3}s, ${phraseDoneAt + 1.2}s` }} />
        <div className="splash-theme-tag">
          {`${themeLabel} · ${themeSub}`.split('').map((ch, i) => (
            <span
              key={i}
              className="splash-theme-char"
              style={{ animationDelay: `${phraseDoneAt + 0.5 + i * 0.045}s` }}
            >
              {ch === ' ' ? '\u00A0' : ch}
            </span>
          ))}
        </div>
        <button onClick={handleClick} className="splash-begin-btn" style={{ animationDelay: `${phraseDoneAt + 1.05}s` }}>
          <span className="splash-begin-tick" />
          <span className="splash-begin-label">BEGIN</span>
          <span className="splash-begin-tick" />
        </button>
      </div>
    </div>
  )
}

// ============================================================
// 2. 侧边栏细线花藤（带呼吸）
// ============================================================
const Bloom = ({ x, y, s = 1, n = 5 }) => (
  <g transform={`translate(${x} ${y}) scale(${s})`}>
    {Array.from({ length: n }).map((_, i) => (
      <ellipse key={i} className="vine-petal" cx="0" cy="-5.4" rx="3" ry="5.1" transform={`rotate(${i * (360 / n)})`} />
    ))}
    <circle className="vine-core" r="1.7" />
  </g>
)

const Leaf = ({ x, y, r = 0, s = 1 }) => (
  <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`}>
    <path className="vine-leaf" d="M0 0 C6 -4.4 13.5 -3.2 17 0 C13.5 3.2 6 4.4 0 0 Z" />
    <path className="vine-leaf" d="M0 0 L17 0" />
  </g>
)

const SidebarVines = () => (
  <div className="vine-wrapper" aria-hidden="true">
    <svg viewBox="0 0 286 1120" xmlns="http://www.w3.org/2000/svg">
      <path className="vine-path" d="M17 -20 C29 130, 6 250, 30 380 C54 508, 8 620, 24 756 C40 890, 14 986, 20 1130" />
      <path className="vine-path faint" d="M17 40 C6 150, 42 246, 18 372 C-6 496, 34 640, 18 786 C6 900, 28 1000, 20 1100" />
      <path className="vine-path" d="M268 -20 C248 168, 278 306, 256 462 C234 620, 272 750, 256 906 C244 1000, 268 1040, 264 1130" />
      <path className="vine-path faint" d="M268 60 C280 196, 246 340, 268 486 C290 632, 252 776, 266 920" />

      <Leaf x={30} y={196} r={34} s={0.82} />
      <Leaf x={10} y={470} r={-28} s={0.9} />
      <Leaf x={36} y={664} r={22} s={0.72} />
      <Leaf x={16} y={928} r={-40} s={0.8} />
      <Leaf x={250} y={286} r={-46} s={0.78} />
      <Leaf x={264} y={556} r={30} s={0.86} />
      <Leaf x={242} y={824} r={-24} s={0.72} />

      <Bloom x={19} y={112} s={1.05} />
      <Bloom x={31} y={128} s={0.62} n={5} />
      <Bloom x={27} y={392} s={0.92} />
      <Bloom x={16} y={742} s={1} />
      <Bloom x={28} y={760} s={0.58} />
      <Bloom x={262} y={222} s={0.86} />
      <Bloom x={257} y={616} s={1.02} />
      <Bloom x={268} y={634} s={0.6} />
      <Bloom x={260} y={982} s={0.8} />
    </svg>
  </div>
)

// ============================================================
// 3. 主组件 ChatPage
// ============================================================
const ChatPage = () => {
  const [showSplash, setShowSplash] = useState(() => !sessionStorage.getItem('hasVisited'))
  const [sessionList, setSessionList] = useState([])
  const [activeSessionId, setActiveSessionId] = useState(() => sessionStorage.getItem('activeSessionId') || null)
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(false)
  const [showSetting, setShowSetting] = useState(false)
  const [showSidebar, setShowSidebar] = useState(false)
  const [config, setConfig] = useState({
    system_prompt: '你是温柔贴心的AI伴侣，简短自然回复',
    temperature: 0.7,
    compress_threshold: 3000,
    compress_keep_rounds: 4
  })
  const [archivedList, setArchivedList] = useState([])
  const [hasOlderArchive, setHasOlderArchive] = useState(false)
  const [archiveCursor, setArchiveCursor] = useState(null)
  const [deleteModal, setDeleteModal] = useState({ show: false, sessionId: null, name: '' })
  const [renameModal, setRenameModal] = useState({ show: false, sessionId: null, value: '' })
  const [theme, setTheme] = useState(() => localStorage.getItem('ks_theme') || 'warm')
  const [toasts, setToasts] = useState([])
  const [inputFocused, setInputFocused] = useState(false)

  const showToast = (message) => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2500)
  }

  const messageBoxRef = useRef(null)
  const renameInputRef = useRef(null)

  const handleSplashEnter = () => {
    sessionStorage.setItem('hasVisited', 'true')
    setShowSplash(false)
  }

  const scrollBottom = () => {
    setTimeout(() => {
      if (messageBoxRef.current) messageBoxRef.current.scrollTop = messageBoxRef.current.scrollHeight
    }, 50)
  }

  // ---------- API 函数 ----------
  const fetchSessions = async () => {
    try {
      const res = await axios.get(`${API_BASE}/sessions`)
      const sessions = res.data || []
      setSessionList(sessions)
      if (activeSessionId && !sessions.find(s => s.id === activeSessionId)) {
        sessionStorage.removeItem('activeSessionId')
        setActiveSessionId(null); setMessages([]); setArchivedList([]); setHasOlderArchive(false); setArchiveCursor(null)
      }
    } catch (err) { console.error('加载会话列表失败:', err.message); setSessionList([]) }
  }

  const createSession = async () => {
    try {
      const res = await axios.post(`${API_BASE}/session/new`)
      const newSession = res.data
      setSessionList(prev => [newSession, ...prev])
      sessionStorage.setItem('activeSessionId', newSession.id)
      setActiveSessionId(newSession.id); setMessages([]); setArchivedList([]); setHasOlderArchive(false); setArchiveCursor(null); setShowSidebar(false)
    } catch (err) { console.error('创建会话失败:', err.message); showToast('创建会话失败：' + err.message) }
  }

  const switchSession = async (sid) => {
    try {
      sessionStorage.setItem('activeSessionId', sid)
      setActiveSessionId(sid)
      const res = await axios.get(`${API_BASE}/messages/${sid}`)
      setMessages(res.data || [])
      setArchivedList([]); setHasOlderArchive(false); setArchiveCursor(null); setShowSidebar(false)
      try {
        const archiveRes = await axios.get(`${API_BASE}/messages/archived/${sid}?limit=1`)
        if (archiveRes.data?.list?.length > 0) setHasOlderArchive(true)
      } catch (e) { console.error('归档检测失败:', e.message) }
    } catch (err) { console.error('切换会话失败:', err.message) }
  }

  const loadOlderArchive = async () => {
    if (!activeSessionId) return
    try {
      const params = new URLSearchParams(); if (archiveCursor) params.append('cursor', archiveCursor); params.append('limit', '6')
      const res = await axios.get(`${API_BASE}/messages/archived/${activeSessionId}?${params.toString()}`)
      const { list, hasMore } = res.data
      if (list.length > 0) { setArchivedList(prev => [...list, ...prev]); setArchiveCursor(list[0].id) }
      setHasOlderArchive(hasMore)
    } catch (err) { console.error('加载归档失败:', err.message) }
  }

  const renameSession = async (sid, newTitle) => {
    try {
      await axios.put(`${API_BASE}/session/${sid}`, { title: newTitle })
      setSessionList(prev => prev.map(s => s.id === sid ? { ...s, title: newTitle } : s))
      await fetchSessions()
    } catch (err) { console.error('重命名失败:', err.message); showToast('重命名失败：' + err.message); fetchSessions() }
  }

  const handleRenameClick = (sid, currentTitle) => {
    setRenameModal({ show: true, sessionId: sid, value: currentTitle || '' })
    setTimeout(() => renameInputRef.current?.focus(), 50)
  }

  const confirmRename = () => {
    const val = renameModal.value.trim()
    if (val && renameModal.sessionId) renameSession(renameModal.sessionId, val)
    setRenameModal({ show: false, sessionId: null, value: '' })
  }

  const handleDeleteClick = (sid, sname) => setDeleteModal({ show: true, sessionId: sid, name: sname || '这个会话' })

  const confirmDelete = async () => {
    if (!deleteModal.sessionId) return
    try {
      await axios.delete(`${API_BASE}/session/${deleteModal.sessionId}`)
      setSessionList(prev => prev.filter(s => s.id !== deleteModal.sessionId))
      if (activeSessionId === deleteModal.sessionId) {
        sessionStorage.removeItem('activeSessionId'); setActiveSessionId(null); setMessages([]); setArchivedList([]); setHasOlderArchive(false); setArchiveCursor(null)
      }
    } catch (err) { console.error('删除失败:', err.message); showToast('删除失败：' + err.message); fetchSessions() }
    setDeleteModal({ show: false, sessionId: null, name: '' })
  }

  const sendMessage = async () => {
    if (!inputText.trim() || !activeSessionId || loading) return
    const content = inputText.trim()
    setInputText(''); setLoading(true)
    const tempUserMsg = { role: 'user', content, created_at: new Date() }
    setMessages(prev => [...prev, tempUserMsg]); scrollBottom()
    try {
      const res = await axios.post(`${API_BASE}/chat`, { sessionId: activeSessionId, content })
      const aiReply = { role: 'assistant', content: res.data.reply, created_at: new Date() }
      setMessages(prev => [...prev, aiReply])
    } catch (err) {
      setMessages(prev => prev.slice(0, -1))
      showToast('请求失败：' + err.message)
    }
    setLoading(false); scrollBottom()
    try {
      const archiveRes = await axios.get(`${API_BASE}/messages/archived/${activeSessionId}?limit=1`)
      setHasOlderArchive((archiveRes.data?.list?.length || 0) > 0)
    } catch (e) { console.error('归档检测失败:', e.message) }
  }

  const getSettings = async () => {
    try { const res = await axios.get(`${API_BASE}/settings`); setConfig(res.data) }
    catch (err) { console.error('加载设置失败:', err.message) }
  }

  const saveSettings = async () => {
    try { await axios.post(`${API_BASE}/settings`, config); setShowSetting(false); showToast('配置已保存') }
    catch (err) { console.error('保存设置失败:', err.message); showToast('保存失败：' + err.message) }
  }

  // ---------- 生命周期 ----------
  useEffect(() => {
    const init = async () => {
      try {
        const res = await axios.get(`${API_BASE}/sessions`)
        const sessions = res.data || []
        setSessionList(sessions)
        getSettings()
        const savedId = sessionStorage.getItem('activeSessionId')
        if (savedId && sessions.find(s => s.id === savedId)) await switchSession(savedId)
        else if (sessions.length > 0) await switchSession(sessions[0].id)
      } catch (err) { console.error('初始化失败:', err.message) }
    }
    init()
  }, [])

  // ---------- 主题 ----------
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('ks_theme', theme)
    let meta = document.querySelector('meta[name="theme-color"]')
    if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta) }
    meta.setAttribute('content', THEME_META_COLOR[theme] || '#191108')
  }, [theme])

  const cycleTheme = () => {
    const idx = THEMES.indexOf(theme)
    setTheme(THEMES[(idx + 1) % THEMES.length])
  }

  // ---------- 视口适配 ----------
  useEffect(() => {
    const root = document.documentElement
    const updateHeight = () => {
      const h = window.visualViewport ? window.visualViewport.height : window.innerHeight
      root.style.setProperty('--app-height', `${h}px`)
    }
    updateHeight()
    window.visualViewport?.addEventListener('resize', updateHeight)
    window.addEventListener('resize', updateHeight)
    return () => {
      window.visualViewport?.removeEventListener('resize', updateHeight)
      window.removeEventListener('resize', updateHeight)
    }
  }, [])

  // ---------- 工具函数 ----------
  const formatTime = (timeStr) => {
    if (!timeStr) return ''
    const date = new Date(timeStr)
    if (Number.isNaN(date.getTime())) return String(timeStr).slice(0, 16)
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  }

  const formatDate = (timeStr) => {
    if (!timeStr) return ''
    const date = new Date(timeStr); const now = new Date()
    if (date.toDateString() === now.toDateString()) return '今天'
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1)
    if (date.toDateString() === yesterday.toDateString()) return '昨天'
    return `${date.getMonth() + 1}月${date.getDate()}日`
  }

  const groupMessagesByDate = (msgs) => {
    const groups = {}
    msgs.forEach(msg => { const d = formatDate(msg.created_at); if (!groups[d]) groups[d] = []; groups[d].push(msg) })
    return groups
  }

  // ---------- 渲染消息项 ----------
  const renderMsgItem = (msg, key) => {
    const isUser = msg.role === 'user'
    const randomDelay = (Math.random() * 0.2 + 0.1).toFixed(2)
    return (
      <div
        key={key}
        className="msg-row"
        style={{
          display: 'flex',
          justifyContent: isUser ? 'flex-end' : 'flex-start',
          marginBottom: '18px',
          padding: '0 18px',
          animationDelay: `${randomDelay}s`,
        }}
      >
        <div style={{ maxWidth: '80%', display: 'flex', flexDirection: isUser ? 'row-reverse' : 'row', alignItems: 'flex-start', gap: '10px' }}>
          {isUser ? <UserAvatar /> : <AIAvatar />}
          <div className={`bubble-glass${isUser ? ' is-user' : ''}`} style={{ borderRadius: isUser ? '22px 22px 5px 22px' : '22px 22px 22px 5px' }}>
            <div className="msg-text">{msg.content}</div>
            <div className="msg-time">{formatTime(msg.created_at)}</div>
          </div>
        </div>
      </div>
    )
  }

  const groupedMessages = groupMessagesByDate(messages)

  return (
    <div
      data-theme={theme}
      style={{
        flex: 1, display: 'flex',
        height: 'var(--app-height, 100dvh)', maxHeight: 'var(--app-height, 100dvh)',
        color: 'var(--c-text)', fontFamily: 'var(--font-body)',
        overflow: 'hidden', position: 'relative'
      }}
    >
      <PhotoBackdrop />
      <div className="grain-overlay" />
      <div className="app-frame" />

      {showSplash && <SplashScreen onEnter={handleSplashEnter} theme={theme} />}

      {/* 遮罩层 */}
      {showSidebar && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'var(--c-overlay)', backdropFilter: 'blur(8px)', WebkitBackdropFilter: 'blur(8px)', zIndex: 200, animation: 'fadeIn 0.3s ease' }}
          onClick={() => setShowSidebar(false)}
        />
      )}

      {/* ====== 侧边栏 ====== */}
      <div
        className="sidebar-panel glass-panel"
        style={{ left: showSidebar ? 0 : '-330px', boxShadow: showSidebar ? '14px 0 60px var(--c-shadow)' : 'none' }}
      >
        <div style={{ opacity: showSidebar ? 1 : 0, transition: 'opacity 1.2s ease' }}>
          <SidebarVines />
        </div>
        <div style={{ position: 'relative', zIndex: 20, display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ padding: '30px 22px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
              <div>
                <Wordmark size="md" />
                <div className="eyebrow" style={{ marginTop: '8px' }}>{THEME_LABELS[theme]} · {THEME_SUB[theme]}</div>
              </div>
              <button
                className="icon-btn"
                onClick={cycleTheme}
                title={`切换主题（当前：${THEME_LABELS[theme]}）`}
                style={{ background: 'transparent', border: '1px solid var(--c-line)', borderRadius: '999px', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--c-text-muted)' }}
              >
                <Icon.Moon size={12} />
              </button>
            </div>

            <div style={{ height: '1px', background: 'linear-gradient(90deg, var(--c-line-strong), transparent)', margin: '22px 0 18px' }} />

            <button
              onClick={createSession}
              className="line-btn"
              style={{ width: '100%', padding: '12px', borderRadius: '999px', fontSize: '12.5px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <Icon.Plus size={11} /> NEW
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '0 14px 8px' }}>
            <div className="eyebrow" style={{ padding: '0 4px 10px' }}>Recent</div>
            {sessionList.map(item => (
              <div
                key={item.id}
                className={`session-item${activeSessionId === item.id ? ' is-active' : ''}`}
                onClick={() => switchSession(item.id)}
              >
                <span style={{ fontSize: '13px', color: activeSessionId === item.id ? 'var(--c-text)' : 'var(--c-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '0.3px' }}>{item.title}</span>
                <div className="session-actions" style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                  <button className="icon-btn" onClick={(e) => { e.stopPropagation(); handleRenameClick(item.id, item.title) }} style={{ background: 'transparent', border: 'none', color: 'var(--c-text-muted)', cursor: 'pointer', padding: '4px' }}><Icon.Edit /></button>
                  <button className="icon-btn" onClick={(e) => { e.stopPropagation(); handleDeleteClick(item.id, item.title) }} style={{ background: 'transparent', border: 'none', color: 'var(--c-text-muted)', cursor: 'pointer', padding: '4px' }}><Icon.Trash /></button>
                </div>
              </div>
            ))}
          </div>

          <div className="hairline-top" style={{ padding: '16px', position: 'relative', zIndex: 20 }}>
            <button
              onClick={() => { setShowSidebar(false); setShowSetting(true) }}
              className="line-btn"
              style={{ width: '100%', padding: '10px', borderRadius: '999px', fontSize: '11.5px', color: 'var(--c-text-muted)', borderColor: 'var(--c-line)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
            >
              <SettingsIcon size={13} /> SETTINGS
            </button>
          </div>
        </div>
      </div>

      {/* ====== 主聊天区域 ====== */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, position: 'relative', zIndex: 1 }}>
        <div className="hairline-bottom" style={{ padding: '16px 20px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <button className="icon-btn" onClick={() => setShowSidebar(true)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--c-text-muted)', display: 'flex' }}>
            <Icon.Menu />
          </button>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px', maxWidth: '64%' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '14px', letterSpacing: '3.4px', color: 'var(--c-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '100%' }}>
              {activeSessionId ? (sessionList.find(s => s.id === activeSessionId)?.title || '对话中') : 'ke & shu'}
            </div>
            <div style={{ width: '3px', height: '3px', transform: 'rotate(45deg)', background: 'var(--c-accent)', opacity: 0.6 }} />
          </div>
          <div style={{ width: '20px' }} />
        </div>

        <div ref={messageBoxRef} style={{ flex: 1, overflowY: 'auto', padding: '18px 0 10px', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', minHeight: 0 }}>
          {!activeSessionId ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: '18px', padding: '0 30px', textAlign: 'center' }}>
              <Wordmark size="lg" />
              <div style={{ width: '54px', height: '1px', background: 'linear-gradient(90deg, transparent, var(--c-line-strong), transparent)' }} />
              <div style={{ fontFamily: 'var(--font-accent)', fontStyle: 'italic', fontSize: '14px', letterSpacing: '1.4px', color: 'var(--c-text-muted)' }}>
                选择或新建一个对话
              </div>
            </div>
          ) : (
            <>
              {hasOlderArchive && (
                <div style={{ textAlign: 'center', padding: '10px 0 20px' }}>
                  <span
                    onClick={loadOlderArchive}
                    className="line-btn"
                    style={{ cursor: 'pointer', padding: '8px 20px', borderRadius: '999px', display: 'inline-flex', alignItems: 'center', gap: '7px', fontSize: '11px', color: 'var(--c-text-muted)', borderColor: 'var(--c-line)' }}
                  >
                    <Icon.ArrowUp size={11} /> EARLIER
                  </span>
                </div>
              )}

              {archivedList.map((msg, idx) => renderMsgItem(msg, `arch-${idx}`))}

              {Object.entries(groupedMessages).map(([date, msgs]) => (
                <div key={date}>
                  <div className="date-divider">
                    <span className="rule" />
                    <span className="lozenge" />
                    <span className="label">{date}</span>
                    <span className="lozenge" />
                    <span className="rule" />
                  </div>
                  {msgs.map((msg, idx) => renderMsgItem(msg, `live-${idx}`))}
                </div>
              ))}

              {loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '0 18px 10px' }}>
                  <AIAvatar />
                  <div className="bubble-glass" style={{ borderRadius: '22px 22px 22px 5px', padding: '15px 20px' }}>
                    <div className="typing-dots"><span /><span /><span /></div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="hairline-top" style={{ padding: '12px 16px calc(env(safe-area-inset-bottom, 0px) + 14px)', flexShrink: 0 }}>
          <div className={`composer-shell${inputFocused ? ' is-focused' : ''}`}>
            <textarea
              className="composer-input"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.ctrlKey && e.key === 'Enter' && sendMessage()}
              onFocus={() => setInputFocused(true)}
              onBlur={() => setInputFocused(false)}
              placeholder="Tell me everything..."
              rows={1}
            />
            <button onClick={sendMessage} disabled={loading || !activeSessionId} className="send-btn">
              <Icon.ArrowUp size={17} />
            </button>
          </div>
        </div>
      </div>

      {/* Toast 轻提示 */}
      <div className="toast-wrap">
        {toasts.map(t => <div key={t.id} className="toast-item">{t.message}</div>)}
      </div>

      {/* 重命名弹窗 */}
      {renameModal.show && (
        <div className="modal-veil" style={{ zIndex: 2100 }} onClick={() => setRenameModal({ show: false, sessionId: null, value: '' })}>
          <div className="modal-card" style={{ padding: '30px 26px 24px', width: '306px', maxWidth: '86vw' }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-title" style={{ marginBottom: '18px' }}>RENAME</div>
            <input
              ref={renameInputRef}
              className="field-input"
              value={renameModal.value}
              onChange={(e) => setRenameModal(p => ({ ...p, value: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && confirmRename()}
              style={{ marginBottom: '20px', fontSize: '14px' }}
            />
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
            <div style={{ fontSize: '12.5px', color: 'var(--c-text-muted)', marginBottom: '26px', lineHeight: 1.7 }}>「{deleteModal.name}」将被永久删除</div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="line-btn" onClick={() => setDeleteModal({ show: false, sessionId: null, name: '' })} style={{ flex: 1, padding: '11px 0', borderRadius: '999px', fontSize: '11.5px', color: 'var(--c-text-muted)' }}>取消</button>
              <button className="solid-btn" onClick={confirmDelete} style={{ flex: 1, padding: '11px 0', borderRadius: '999px', fontSize: '11.5px' }}>确定</button>
            </div>
          </div>
        </div>
      )}

      {/* 全局设置弹窗 */}
      {showSetting && (
        <div className="modal-veil" style={{ zIndex: 400, padding: '20px' }}>
          <div className="modal-card modal-card-solid" style={{ width: '480px', maxWidth: '100%', maxHeight: '86vh', overflowY: 'auto', padding: '32px' }}>
            <div className="modal-title" style={{ marginBottom: '28px' }}>SETTINGS</div>

            <div style={{ marginBottom: '26px' }}>
              <div className="eyebrow" style={{ marginBottom: '12px' }}>Appearance</div>
              <div style={{ display: 'flex', gap: '8px' }}>
                {THEMES.map(t => (
                  <button
                    key={t}
                    onClick={() => setTheme(t)}
                    className={theme === t ? 'solid-btn' : 'line-btn'}
                    style={{ flex: 1, padding: '11px 0', borderRadius: '14px', fontSize: '12px', lineHeight: 1.5, letterSpacing: '2px' }}
                  >
                    {THEME_LABELS[t]}
                    <div style={{ fontSize: '9.5px', opacity: 0.72, letterSpacing: '1.4px', fontFamily: 'var(--font-body)', marginTop: '2px' }}>{THEME_SUB[t]}</div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div className="eyebrow" style={{ marginBottom: '8px' }}>System prompt</div>
              <textarea className="field-input" value={config.system_prompt} onChange={(e) => setConfig(p => ({ ...p, system_prompt: e.target.value }))} rows={3} style={{ resize: 'vertical', lineHeight: 1.7 }} />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div className="eyebrow" style={{ marginBottom: '8px' }}>Temperature</div>
              <input className="field-input" type="number" step="0.1" min="0" max="1.5" value={config.temperature} onChange={(e) => setConfig(p => ({ ...p, temperature: Number(e.target.value) }))} />
            </div>

            <div style={{ marginBottom: '16px' }}>
              <div className="eyebrow" style={{ marginBottom: '8px' }}>压缩阈值 token</div>
              <input className="field-input" type="number" value={config.compress_threshold} onChange={(e) => setConfig(p => ({ ...p, compress_threshold: Number(e.target.value) }))} />
            </div>

            <div style={{ marginBottom: '28px' }}>
              <div className="eyebrow" style={{ marginBottom: '8px' }}>压缩后保留回合</div>
              <input className="field-input" type="number" value={config.compress_keep_rounds} onChange={(e) => setConfig(p => ({ ...p, compress_keep_rounds: Number(e.target.value) }))} />
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button className="line-btn" onClick={() => setShowSetting(false)} style={{ padding: '11px 22px', borderRadius: '999px', fontSize: '11.5px', color: 'var(--c-text-muted)' }}>取消</button>
              <button className="solid-btn" onClick={saveSettings} style={{ padding: '11px 26px', borderRadius: '999px', fontSize: '11.5px' }}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ChatPage