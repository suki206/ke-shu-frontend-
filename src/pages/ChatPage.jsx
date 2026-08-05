import { useState, useEffect, useRef, useMemo } from 'react'
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
const THEME_LABELS = { warm: 'Warm', mist: 'Mist', noir: 'Noir' }
const THEME_META_COLOR = { warm: '#F6EDE0', mist: '#EFF2F4', noir: '#16181C' }

// ========== 图标 ==========
const Icon = {
  Menu: (p) => (
    <svg width={p.size || 20} height={p.size || 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="14" y2="17" />
    </svg>
  ),
  Edit: (p) => (
    <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  ),
  Trash: (p) => (
    <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
    </svg>
  ),
  Plus: (p) => (
    <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  Close: (p) => (
    <svg width={p.size || 16} height={p.size || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" />
    </svg>
  ),
  ArrowUp: (p) => (
    <svg width={p.size || 16} height={p.size || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
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
  <svg width={p.size || 16} height={p.size || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
  </svg>
)

// ========== 头像 ==========
const UserAvatar = ({ size = 30 }) => (
  <div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, background: 'var(--c-bubble-user-bg)', border: '1px solid var(--c-bubble-user-border)', boxShadow: '0 2px 8px var(--c-shadow)' }} />
)
const AIAvatar = ({ size = 30 }) => (
  <div style={{ position: 'relative', width: size, height: size, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', background: 'radial-gradient(circle at 32% 28%, var(--c-accent-soft), var(--c-accent) 68%, var(--c-text) 150%)', boxShadow: '0 2px 10px var(--c-shadow), inset 0 0 0 1px var(--c-border)' }}>
    <div style={{ position: 'absolute', width: size * 0.86, height: size * 0.86, borderRadius: '50%', background: 'var(--c-bg-solid)', top: '-8%', left: '32%', opacity: 0.94 }} />
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
// 1. 开屏页：星辰汇聚 + I am here (无鲸鱼)
// ============================================================
const SplashScreen = ({ onEnter }) => {
  const [fadeOut, setFadeOut] = useState(false)
  const [showText, setShowText] = useState(false)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setShowText(true), 1200)
    return () => clearTimeout(timer)
  }, [])

  const handleClick = () => {
    setFadeOut(true)
    setTimeout(() => {
      setVisible(false)
      onEnter()
    }, 700)
  }

  if (!visible) return null

  const stars = useMemo(() => Array.from({ length: 60 }).map((_, i) => {
    const angle = Math.random() * 2 * Math.PI
    const radius = 600 + Math.random() * 900
    const tx = Math.cos(angle) * radius
    const ty = Math.sin(angle) * radius
    return { id: i, tx, ty, size: 2 + Math.random() * 4.5, delay: Math.random() * 0.7, duration: 1.3 + Math.random() * 0.8 }
  }), [])

  return (
    <div className="splash-screen" style={{ position: 'fixed', inset: 0, background: 'var(--c-bg-gradient)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 1000, transition: 'opacity 0.7s ease, transform 0.7s ease', opacity: fadeOut ? 0 : 1, transform: fadeOut ? 'scale(1.04)' : 'scale(1)' }}>
      <div className="ambient-bg"><div className="blob" /><div className="blob" /><div className="blob" /><div className="blob" /></div>
      <div style={{ position: 'relative', width: '220px', height: '140px', marginBottom: '16px' }}>
        {stars.map(s => (
          <span key={s.id} style={{ position: 'absolute', left: '50%', top: '50%', width: s.size, height: s.size, borderRadius: '50%', background: 'var(--c-star)', boxShadow: '0 0 16px var(--c-star-bright)', '--tx': `${s.tx}px`, '--ty': `${s.ty}px`, animation: `convergeStar ${s.duration}s ${s.delay}s cubic-bezier(0.2, 0.9, 0.3, 1) forwards`, opacity: 0 }} />
        ))}
      </div>
      {showText && (
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 'clamp(40px, 9vw, 72px)', fontWeight: 400, fontStyle: 'italic', letterSpacing: '8px', color: 'var(--c-text)', animation: 'textFadeUp 1.2s ease forwards, floatWord 5s ease-in-out infinite 1.5s', marginBottom: '40px', position: 'relative' }}>
          I am here
        </div>
      )}
      <button onClick={handleClick} style={{ position: 'relative', padding: '14px 52px', borderRadius: '999px', border: '1px solid var(--c-star-bright)', background: 'var(--c-surface)', backdropFilter: 'blur(16px) saturate(1.4)', color: 'var(--c-text)', fontSize: '13px', cursor: 'pointer', fontFamily: "'Cormorant Garamond', serif", letterSpacing: '5px', transition: 'all 0.3s ease', boxShadow: '0 4px 28px var(--c-shadow), inset 0 1px 0 var(--c-highlight), 0 0 60px var(--c-accent-soft)', zIndex: 20, pointerEvents: 'auto' }}>
        BEGIN
      </button>
    </div>
  )
}

// ============================================================
// 2. 侧边栏花藤 SVG
// ============================================================
const SidebarVines = () => (
  <div className="vine-wrapper">
    <svg viewBox="0 0 280 1000" preserveAspectRatio="none" fill="none" xmlns="http://www.w3.org/2000/svg">
      <path className="vine-path" d="M20 0 C30 150, 10 280, 40 400 C70 520, 15 650, 30 800 C45 950, 20 1000, 20 1000" strokeWidth="3" />
      <path className="vine-path" d="M20 0 C15 120, 45 240, 20 380 C-5 520, 35 680, 20 840" strokeWidth="1.5" opacity="0.5" />
      <path className="vine-path" d="M260 0 C240 180, 270 320, 250 480 C230 640, 265 780, 250 940 C240 1000, 260 1000, 260 1000" strokeWidth="2.5" />
      <path className="vine-path" d="M260 50 C270 200, 240 350, 260 500 C280 650, 245 800, 260 950" strokeWidth="1.5" opacity="0.4" />
      <ellipse className="vine-flower" cx="18" cy="120" rx="8" ry="14" transform="rotate(-15, 18, 120)" />
      <ellipse className="vine-flower" cx="32" cy="135" rx="6" ry="10" transform="rotate(10, 32, 135)" />
      <ellipse className="vine-flower-center" cx="18" cy="120" rx="3" ry="4" />
      <ellipse className="vine-flower" cx="42" cy="350" rx="10" ry="16" transform="rotate(-20, 42, 350)" />
      <ellipse className="vine-flower" cx="25" cy="370" rx="7" ry="12" transform="rotate(15, 25, 370)" />
      <ellipse className="vine-flower-center" cx="42" cy="350" rx="4" ry="5" />
      <ellipse className="vine-flower" cx="55" cy="365" rx="5" ry="8" transform="rotate(-5, 55, 365)" />
      <ellipse className="vine-flower" cx="248" cy="620" rx="9" ry="15" transform="rotate(25, 248, 620)" />
      <ellipse className="vine-flower" cx="265" cy="640" rx="7" ry="11" transform="rotate(-10, 265, 640)" />
      <ellipse className="vine-flower-center" cx="248" cy="620" rx="3.5" ry="4.5" />
      <ellipse className="vine-flower" cx="235" cy="635" rx="6" ry="9" transform="rotate(30, 235, 635)" />
      <ellipse className="vine-flower" cx="22" cy="850" rx="8" ry="13" transform="rotate(-12, 22, 850)" />
      <ellipse className="vine-flower" cx="40" cy="865" rx="6" ry="10" transform="rotate(8, 40, 865)" />
      <ellipse className="vine-flower-center" cx="22" cy="850" rx="3" ry="4" />
      <ellipse className="vine-leaf" cx="60" cy="220" rx="12" ry="5" transform="rotate(40, 60, 220)" />
      <ellipse className="vine-leaf" cx="5" cy="500" rx="14" ry="5" transform="rotate(-30, 5, 500)" />
      <ellipse className="vine-leaf" cx="230" cy="400" rx="10" ry="4" transform="rotate(50, 230, 400)" />
      <ellipse className="vine-leaf" cx="270" cy="780" rx="12" ry="5" transform="rotate(-45, 270, 780)" />
    </svg>
  </div>
)

// ============================================================
// 3. 主组件 ChatPage (状态、API、工具函数)
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
    meta.setAttribute('content', THEME_META_COLOR[theme] || '#F6EDE0')
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
    let date = new Date(timeStr)
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
  const renderMsgItem = (msg, key) => (
    <div key={key} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: '16px', padding: '0 16px' }}>
      <div style={{ maxWidth: '78%', display: 'flex', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', alignItems: 'flex-start', gap: '8px' }}>
        {msg.role === 'user' ? <UserAvatar /> : <AIAvatar />}
        <div className="bubble-glass" style={{ borderRadius: msg.role === 'user' ? '24px 24px 6px 24px' : '24px 24px 24px 6px' }}>
          <div className="msg-text">{msg.content}</div>
          <div style={{ fontSize: '11px', marginTop: '6px', color: 'var(--c-text-faint)', textAlign: 'right' }}>{formatTime(msg.created_at)}</div>
        </div>
      </div>
    </div>
  )

  const groupedMessages = groupMessagesByDate(messages)  return (
    <div data-theme={theme} style={{ flex: 1, display: 'flex', height: 'var(--app-height, 100dvh)', maxHeight: 'var(--app-height, 100dvh)', background: 'var(--c-bg-gradient)', color: 'var(--c-text)', fontFamily: 'var(--font-body)', overflow: 'hidden', position: 'relative' }}>
      
      {/* 4层光晕背景 */}
      <div className="ambient-bg"><div className="blob" /><div className="blob" /><div className="blob" /><div className="blob" /></div>

      {showSplash && <SplashScreen onEnter={handleSplashEnter} />}

      {/* 遮罩层 */}
      {showSidebar && (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--c-overlay)', backdropFilter: 'blur(4px)', zIndex: 200, animation: 'fadeIn 0.3s ease' }} onClick={() => setShowSidebar(false)} />
      )}

      {/* ====== 侧边栏 (含花藤) ====== */}
      <div style={{
        position: 'fixed', top: 0, left: showSidebar ? 0 : '-320px',
        width: '280px', height: 'var(--app-height, 100dvh)',
        background: 'var(--c-surface)', backdropFilter: 'blur(24px) saturate(1.2)',
        zIndex: 300, transition: 'left 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex', flexDirection: 'column',
        boxShadow: showSidebar ? '4px 0 40px var(--c-shadow)' : 'none',
        borderRight: '1px solid var(--c-border)',
        overflow: 'hidden'
      }}>
        {showSidebar && <SidebarVines />}
        <div style={{ position: 'relative', zIndex: 20, display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ padding: '26px 20px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '22px' }}>
              <Wordmark size="md" />
              <button className="icon-btn" onClick={cycleTheme} title={`当前主题：${THEME_LABELS[theme]}`} style={{ background: 'transparent', border: '1px solid var(--c-border)', borderRadius: '999px', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--c-text-muted)' }}>
                <Icon.Moon size={13} />
              </button>
            </div>
            <button onClick={createSession} style={{ width: '100%', padding: '12px', background: 'var(--c-accent)', border: '1px solid var(--c-accent)', borderRadius: '16px', color: 'var(--c-accent-text)', cursor: 'pointer', marginBottom: '4px', fontSize: '13.5px', fontFamily: 'var(--font-body)', letterSpacing: '1px', transition: 'all 0.3s ease', boxShadow: '0 2px 10px var(--c-shadow)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                <Icon.Plus size={12} /> 新建对话
              </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px' }}>
            <div style={{ fontSize: '11px', color: 'var(--c-text-faint)', marginBottom: '8px', paddingLeft: '4px', letterSpacing: '1.5px', textTransform: 'uppercase' }}>最近对话</div>
            {sessionList.map(item => (
              <div key={item.id} className="session-item" style={{ padding: '12px 14px', borderRadius: '14px', background: activeSessionId === item.id ? 'var(--c-accent-soft)' : 'transparent', cursor: 'pointer', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: activeSessionId === item.id ? '1px solid var(--c-border)' : '1px solid transparent' }} onClick={() => switchSession(item.id)}>
                <span style={{ fontSize: '13.5px', color: 'var(--c-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
                <div className="session-actions" style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                  <button className="icon-btn" onClick={(e) => { e.stopPropagation(); handleRenameClick(item.id, item.title) }} style={{ background: 'transparent', border: 'none', color: 'var(--c-text-muted)', cursor: 'pointer', padding: '4px' }}><Icon.Edit /></button>
                  <button className="icon-btn" onClick={(e) => { e.stopPropagation(); handleDeleteClick(item.id, item.title) }} style={{ background: 'transparent', border: 'none', color: 'var(--c-text-muted)', cursor: 'pointer', padding: '4px' }}><Icon.Trash /></button>
                </div>
              </div>
            ))}
          </div>
          <div style={{ padding: '16px', borderTop: '1px solid var(--c-border)', position: 'relative', zIndex: 20 }}>
            <button onClick={() => { setShowSidebar(false); setShowSetting(true) }} style={{ width: '100%', padding: '10px', background: 'transparent', border: '1px solid var(--c-border)', borderRadius: '12px', color: 'var(--c-text-muted)', cursor: 'pointer', fontSize: '13px', fontFamily: 'var(--font-body)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
              <SettingsIcon size={14} /> 全局设置
            </button>
          </div>
        </div>
      </div>

      {/* ====== 主聊天区域 ====== */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, position: 'relative' }}>
        <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--c-border)', flexShrink: 0 }}>
          <button className="icon-btn" onClick={() => setShowSidebar(true)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--c-text-muted)', display: 'flex' }}><Icon.Menu /></button>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '15px', fontStyle: 'italic', color: 'var(--c-text-muted)', letterSpacing: '0.5px' }}>
            {activeSessionId ? (sessionList.find(s => s.id === activeSessionId)?.title || '对话中') : 'ke&shu'}
          </div>
          <div style={{ width: '20px' }} />
        </div>

        <div ref={messageBoxRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 0', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', minHeight: 0 }}>
          {!activeSessionId ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--c-text-faint)', gap: '14px' }}>
              <AIAvatar size={44} />
              <div style={{ fontSize: '14px', fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic' }}>选择或新建一个对话</div>
            </div>
          ) : (
            <>
              {hasOlderArchive && (
                <div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--c-text-faint)', fontSize: '12px' }}>
                  <span onClick={loadOlderArchive} style={{ cursor: 'pointer', padding: '7px 16px', borderRadius: '999px', background: 'var(--c-surface)', border: '1px solid var(--c-border)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                    <Icon.ArrowUp size={11} /> 加载更早的历史
                  </span>
                </div>
              )}
              {archivedList.map((msg, idx) => renderMsgItem(msg, `arch-${idx}`))}
              {Object.entries(groupedMessages).map(([date, msgs]) => (
                <div key={date}>
                  <div style={{ textAlign: 'center', margin: '20px 0 12px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--c-text-faint)', background: 'var(--c-surface)', padding: '4px 14px', borderRadius: '999px', letterSpacing: '1px' }}>{date}</span>
                  </div>
                  {msgs.map((msg, idx) => renderMsgItem(msg, `live-${idx}`))}
                </div>
              ))}
              {loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 20px', color: 'var(--c-text-muted)', fontSize: '13px' }}>
                  <AIAvatar />
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <span style={{ animation: 'dotPulse 1.4s ease-in-out infinite', animationDelay: '0s' }}>·</span>
                    <span style={{ animation: 'dotPulse 1.4s ease-in-out infinite', animationDelay: '0.2s' }}>·</span>
                    <span style={{ animation: 'dotPulse 1.4s ease-in-out infinite', animationDelay: '0.4s' }}>·</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div style={{ padding: '12px 16px calc(env(safe-area-inset-bottom, 0px) + 14px)', borderTop: '1px solid var(--c-border)', background: 'var(--c-surface)', backdropFilter: 'blur(10px)', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
            <textarea value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => e.ctrlKey && e.key === 'Enter' && sendMessage()} placeholder="Tell me everything..." style={{ flex: 1, padding: '12px 16px', background: 'var(--c-input-bg)', border: '1px solid var(--c-border)', borderRadius: '18px', color: 'var(--c-text)', resize: 'none', fontFamily: 'inherit', fontSize: '14px', outline: 'none', lineHeight: '1.5', boxShadow: '0 2px 8px var(--c-shadow)', minHeight: '46px' }} rows={1} />
            <button onClick={sendMessage} disabled={loading || !activeSessionId} style={{ width: '46px', height: '46px', borderRadius: '50%', background: 'var(--c-accent)', border: '1px solid var(--c-accent)', color: 'var(--c-accent-text)', cursor: loading || !activeSessionId ? 'not-allowed' : 'pointer', opacity: loading || !activeSessionId ? 0.45 : 1, transition: 'all 0.3s ease', boxShadow: '0 2px 10px var(--c-shadow)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Icon.ArrowUp size={18} />
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
        <div style={{ position: 'fixed', inset: 0, background: 'var(--c-overlay)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2100, animation: 'fadeIn 0.2s ease' }} onClick={() => setRenameModal({ show: false, sessionId: null, value: '' })}>
          <div style={{ background: 'var(--c-surface-solid)', borderRadius: '22px', padding: '26px 24px 20px', width: '300px', maxWidth: '86vw', boxShadow: '0 20px 60px var(--c-shadow)', border: '1px solid var(--c-border)', animation: 'scaleIn 0.25s cubic-bezier(0.34,1.56,0.64,1)' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: '15px', fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', color: 'var(--c-text)', marginBottom: '14px' }}>重命名对话</div>
            <input ref={renameInputRef} value={renameModal.value} onChange={(e) => setRenameModal(p => ({ ...p, value: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && confirmRename()} style={{ width: '100%', padding: '10px 14px', background: 'var(--c-input-bg)', border: '1px solid var(--c-border)', borderRadius: '12px', color: 'var(--c-text)', fontFamily: 'inherit', fontSize: '14px', outline: 'none', marginBottom: '18px' }} />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setRenameModal({ show: false, sessionId: null, value: '' })} style={{ flex: 1, padding: '10px 0', borderRadius: '14px', border: '1px solid var(--c-border)', background: 'transparent', color: 'var(--c-text-muted)', fontSize: '13.5px', cursor: 'pointer', fontFamily: 'inherit' }}>取消</button>
              <button onClick={confirmRename} style={{ flex: 1, padding: '10px 0', borderRadius: '14px', border: '1px solid var(--c-accent)', background: 'var(--c-accent)', color: 'var(--c-accent-text)', fontSize: '13.5px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>确定</button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deleteModal.show && (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--c-overlay)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, animation: 'fadeIn 0.2s ease' }}>
          <div style={{ background: 'var(--c-surface-solid)', borderRadius: '22px', padding: '28px 24px 20px', width: '300px', maxWidth: '86vw', textAlign: 'center', boxShadow: '0 20px 60px var(--c-shadow)', border: '1px solid var(--c-border)', animation: 'scaleIn 0.25s cubic-bezier(0.34,1.56,0.64,1)' }}>
            <div style={{ fontSize: '15px', fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', color: 'var(--c-text)', marginBottom: '6px' }}>确定删除这段对话？</div>
            <div style={{ fontSize: '12.5px', color: 'var(--c-text-muted)', marginBottom: '22px' }}>"{deleteModal.name}" 将被永久删除</div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setDeleteModal({ show: false, sessionId: null, name: '' })} style={{ flex: 1, padding: '10px 0', borderRadius: '14px', border: '1px solid var(--c-border)', background: 'transparent', color: 'var(--c-text-muted)', fontSize: '13.5px', cursor: 'pointer', fontFamily: 'inherit' }}>取消</button>
              <button onClick={confirmDelete} style={{ flex: 1, padding: '10px 0', borderRadius: '14px', border: '1px solid var(--c-accent)', background: 'var(--c-accent)', color: 'var(--c-accent-text)', fontSize: '13.5px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>确定</button>
            </div>
          </div>
        </div>
      )}

      {/* 全局设置弹窗 */}
      {showSetting && (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--c-overlay)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400, padding: '20px' }}>
          <div style={{ width: '480px', maxWidth: '100%', maxHeight: '86vh', overflowY: 'auto', background: 'var(--c-surface-solid)', padding: '28px', borderRadius: '22px', boxShadow: '0 8px 40px var(--c-shadow)', border: '1px solid var(--c-border)' }}>
            <h3 style={{ marginTop: 0, fontWeight: 400, fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', fontSize: '20px', color: 'var(--c-text)', marginBottom: '22px' }}>全局设置</h3>
            <div style={{ marginBottom: '22px' }}>
              <label style={{ fontSize: '11px', color: 'var(--c-text-faint)', display: 'block', marginBottom: '10px', letterSpacing: '1.5px', textTransform: 'uppercase' }}>外观</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {THEMES.map(t => <button key={t} className="theme-pill" onClick={() => setTheme(t)} style={{ flex: 1, padding: '9px 0', borderRadius: '999px', border: `1px solid ${theme === t ? 'var(--c-accent)' : 'var(--c-border)'}`, background: theme === t ? 'var(--c-accent)' : 'transparent', color: theme === t ? 'var(--c-accent-text)' : 'var(--c-text-muted)', fontSize: '12.5px', letterSpacing: '1px', cursor: 'pointer', fontFamily: "'Cormorant Garamond', serif" }}>{THEME_LABELS[t]}</button>)}
              </div>
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '13px', color: 'var(--c-text-muted)', display: 'block', marginBottom: '6px' }}>系统人设提示词</label>
              <textarea value={config.system_prompt} onChange={(e) => setConfig(p => ({ ...p, system_prompt: e.target.value }))} style={{ width: '100%', padding: '10px 14px', background: 'var(--c-input-bg)', border: '1px solid var(--c-border)', borderRadius: '12px', color: 'var(--c-text)', fontFamily: 'inherit', fontSize: '13px', outline: 'none' }} rows={3} />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '13px', color: 'var(--c-text-muted)', display: 'block', marginBottom: '6px' }}>Temperature（随机性）</label>
              <input type="number" step="0.1" min="0" max="1.5" value={config.temperature} onChange={(e) => setConfig(p => ({ ...p, temperature: Number(e.target.value) }))} style={{ width: '100%', padding: '10px 14px', background: 'var(--c-input-bg)', border: '1px solid var(--c-border)', borderRadius: '12px', color: 'var(--c-text)', fontFamily: 'inherit', fontSize: '13px', outline: 'none' }} />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '13px', color: 'var(--c-text-muted)', display: 'block', marginBottom: '6px' }}>记忆压缩阈值 token</label>
              <input type="number" value={config.compress_threshold} onChange={(e) => setConfig(p => ({ ...p, compress_threshold: Number(e.target.value) }))} style={{ width: '100%', padding: '10px 14px', background: 'var(--c-input-bg)', border: '1px solid var(--c-border)', borderRadius: '12px', color: 'var(--c-text)', fontFamily: 'inherit', fontSize: '13px', outline: 'none' }} />
            </div>
            <div style={{ marginBottom: '22px' }}>
              <label style={{ fontSize: '13px', color: 'var(--c-text-muted)', display: 'block', marginBottom: '6px' }}>压缩后保留回合数</label>
              <input type="number" value={config.compress_keep_rounds} onChange={(e) => setConfig(p => ({ ...p, compress_keep_rounds: Number(e.target.value) }))} style={{ width: '100%', padding: '10px 14px', background: 'var(--c-input-bg)', border: '1px solid var(--c-border)', borderRadius: '12px', color: 'var(--c-text)', fontFamily: 'inherit', fontSize: '13px', outline: 'none' }} />
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowSetting(false)} style={{ padding: '10px 18px', background: 'transparent', border: '1px solid var(--c-border)', color: 'var(--c-text-muted)', borderRadius: '12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px' }}>取消</button>
              <button onClick={saveSettings} style={{ padding: '10px 18px', background: 'var(--c-accent)', border: '1px solid var(--c-accent)', color: 'var(--c-accent-text)', borderRadius: '12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px' }}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ChatPage