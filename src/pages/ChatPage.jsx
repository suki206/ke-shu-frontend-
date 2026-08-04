import { useState, useEffect, useRef, useMemo } from 'react'
import axios from 'axios'

const API_BASE = 'https://ke-shu-backend.onrender.com/api'

// 防止浏览器/Service Worker 缓存 API 响应
axios.interceptors.request.use(config => {
  if (config.method === 'get') {
    config.params = { ...config.params, _t: Date.now() }
  }
  return config
})

// ========== 主题配置 ==========
const THEMES = ['warm', 'mist', 'noir']
const THEME_LABELS = { warm: 'Warm', mist: 'Mist', noir: 'Noir' }
const THEME_META_COLOR = { warm: '#FDF8F3', mist: '#F2F5F8', noir: '#14151A' }

// ========== 图标 ==========
const Icon = {
  Menu: (p) => (<svg width={p.size || 20} height={p.size || 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="14" y2="17" /></svg>),
  Edit: (p) => (<svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>),
  Trash: (p) => (<svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7h16" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" /></svg>),
  Plus: (p) => (<svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>),
  Close: (p) => (<svg width={p.size || 16} height={p.size || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" /></svg>),
  ArrowUp: (p) => (<svg width={p.size || 16} height={p.size || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5" /><polyline points="6 11 12 5 18 11" /></svg>),
  Moon: (p) => (<svg width={p.size || 16} height={p.size || 16} viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" /></svg>)
}

const SettingsIcon = (p) => (<svg width={p.size || 16} height={p.size || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" /></svg>)

// ========== 头像 ==========
const UserAvatar = ({ size = 30 }) => (<div style={{ width: size, height: size, borderRadius: '50%', flexShrink: 0, background: 'var(--c-bubble-user-bg)', border: '1px solid var(--c-bubble-user-border)', boxShadow: '0 2px 8px var(--c-shadow)' }} />)
const AIAvatar = ({ size = 30 }) => (<div style={{ position: 'relative', width: size, height: size, borderRadius: '50%', flexShrink: 0, overflow: 'hidden', background: 'radial-gradient(circle at 32% 28%, var(--c-accent-soft), var(--c-accent) 68%, var(--c-text) 150%)', boxShadow: '0 2px 10px var(--c-shadow), inset 0 0 0 1px var(--c-border)' }}><div style={{ position: 'absolute', width: size * 0.86, height: size * 0.86, borderRadius: '50%', background: 'var(--c-bg-solid)', top: '-8%', left: '32%', opacity: 0.94 }} /></div>)

// ========== 星空层 ==========
const StarField = ({ count = 30 }) => {
  const stars = useMemo(() => Array.from({ length: count }).map((_, i) => ({
    id: i, left: Math.random() * 100, top: Math.random() * 100,
    size: Math.random() * 1.6 + 0.7, delay: Math.random() * 6, duration: 2.8 + Math.random() * 3.2
  })), [count])
  return (<div className="starfield" aria-hidden="true">{stars.map(s => (<span key={s.id} className="star" style={{ left: `${s.left}%`, top: `${s.top}%`, width: `${s.size}px`, height: `${s.size}px`, animationDelay: `${s.delay}s`, animationDuration: `${s.duration}s` }} />))}</div>)
}

// ========== 花藤装饰 (立体攀附柔焦版 SVG) ==========
const VineDecoration = () => {
  return (
    <svg 
      style={{ position: 'absolute', top: 0, right: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }} 
      viewBox="0 0 280 800" 
      preserveAspectRatio="xMaxYMid slice"
    >
      <defs>
        {/* 柔焦模糊滤镜，制造朦胧立体感 */}
        <filter id="softBlur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="1.2" />
        </filter>
        <filter id="deepBlur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" />
        </filter>
      </defs>

      {/* 后景藤蔓：最模糊，垫在后面 */}
      <g filter="url(#deepBlur)" opacity="0.4" stroke="var(--c-vine)" fill="none" strokeLinecap="round">
        <path d="M270,-20 C250,80 280,180 260,280 C240,380 270,480 250,580 C230,680 260,780 240,820" strokeWidth="2" />
        <path d="M260,280 C240,290 230,320 210,310" strokeWidth="1.5" />
        <path d="M250,580 C230,590 220,620 200,610" strokeWidth="1.5" />
      </g>

      {/* 中景藤蔓：攀附边缘，半清晰 */}
      <g filter="url(#softBlur)" opacity="0.65" stroke="var(--c-vine)" fill="none" strokeLinecap="round">
        <path d="M255,-20 C235,70 265,160 245,260 C225,360 255,450 235,550 C215,650 245,750 225,820" strokeWidth="1.8" />
        {/* 向内延伸的枝蔓 */}
        <path d="M245,260 C215,250 195,270 165,260 C150,255 140,265 120,250" strokeWidth="1.2" />
        <path d="M235,550 C205,540 185,560 155,550 C140,545 130,555 110,540" strokeWidth="1.2" />
      </g>

      {/* 前景叶片与花朵：最清晰，立体感来源 */}
      <g fill="var(--c-vine)" filter="url(#softBlur)">
        {/* 攀附在右侧边缘的叶子 */}
        <path d="M245,260 C260,245 280,255 275,275 C265,285 250,280 245,260 Z" opacity="0.8" />
        <path d="M235,550 C250,535 270,545 265,565 C255,575 240,570 235,550 Z" opacity="0.8" />

        {/* 延伸出去的叶子串 */}
        <path d="M165,260 C150,245 130,255 135,275 C150,285 160,280 165,260 Z" opacity="0.7" />
        <path d="M120,250 C105,235 85,245 90,265 C105,275 115,270 120,250 Z" opacity="0.6" />
        
        <path d="M155,550 C140,535 120,545 125,565 C140,575 150,570 155,550 Z" opacity="0.7" />
        <path d="M110,540 C95,525 75,535 80,555 C95,565 105,560 110,540 Z" opacity="0.6" />
      </g>

      {/* 柔焦花串 (五瓣花) */}
      <g fill="none" stroke="var(--c-vine)" strokeWidth="1" filter="url(#softBlur)">
        {/* 第一簇花 */}
        <g transform="translate(120, 250)" opacity="0.85">
          <circle cx="0" cy="-6" r="3.5" fill="var(--c-vine)" fillOpacity="0.3" />
          <circle cx="6" cy="-2" r="3.5" fill="var(--c-vine)" fillOpacity="0.3" />
          <circle cx="3.5" cy="5" r="3.5" fill="var(--c-vine)" fillOpacity="0.3" />
          <circle cx="-3.5" cy="5" r="3.5" fill="var(--c-vine)" fillOpacity="0.3" />
          <circle cx="-6" cy="-2" r="3.5" fill="var(--c-vine)" fillOpacity="0.3" />
          <circle cx="0" cy="0" r="1.5" fill="var(--c-vine)" fillOpacity="0.6" />
        </g>

        {/* 第二簇花 */}
        <g transform="translate(110, 540)" opacity="0.85">
          <circle cx="0" cy="-5" r="3" fill="var(--c-vine)" fillOpacity="0.3" />
          <circle cx="5" cy="-1" r="3" fill="var(--c-vine)" fillOpacity="0.3" />
          <circle cx="3" cy="4" r="3" fill="var(--c-vine)" fillOpacity="0.3" />
          <circle cx="-3" cy="4" r="3" fill="var(--c-vine)" fillOpacity="0.3" />
          <circle cx="-5" cy="-1" r="3" fill="var(--c-vine)" fillOpacity="0.3" />
          <circle cx="0" cy="0" r="1.2" fill="var(--c-vine)" fillOpacity="0.6" />
        </g>

        {/* 散落小花苞 */}
        <circle cx="245" cy="100" r="2" fill="var(--c-vine)" fillOpacity="0.5" />
        <circle cx="240" cy="400" r="2" fill="var(--c-vine)" fillOpacity="0.5" />
        <circle cx="245" cy="700" r="2" fill="var(--c-vine)" fillOpacity="0.5" />
      </g>
    </svg>
  )
}

// ========== 品牌字标 ==========
const Wordmark = ({ size = 'md' }) => (<span className={`wordmark wordmark-${size}`}><span className="wordmark-part">ke</span><span className="wordmark-amp">&amp;</span><span className="wordmark-part">shu</span></span>)

// ========== 开屏页：星空凝聚 + "I am here" ==========
const SplashScreen = ({ onEnter }) => {
  const [visible, setVisible] = useState(true)
  const [fadeOut, setFadeOut] = useState(false)

  // 生成飞向中心的星星
  const convergeStars = useMemo(() => Array.from({ length: 40 }).map((_, i) => ({
    id: i,
    tx: (Math.random() - 0.5) * 800 + 'px',
    ty: (Math.random() - 0.5) * 800 + 'px',
    delay: Math.random() * 1.5,
    duration: 2 + Math.random() * 2
  })), [])

  const handleClick = () => {
    setFadeOut(true)
    setTimeout(() => { setVisible(false); onEnter() }, 700)
  }

  if (!visible) return null

  return (
    <div className="splash-screen" style={{
      position: 'fixed', inset: 0, background: 'var(--c-bg-gradient)',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      zIndex: 1000, transition: 'opacity 0.7s ease, transform 0.7s ease',
      opacity: fadeOut ? 0 : 1, transform: fadeOut ? 'scale(1.04)' : 'scale(1)', overflow: 'hidden'
    }}>
      <div className="ambient-bg" />
      <StarField count={30} />

      {/* 飞行凝聚的星星 */}
      <div style={{ position: 'absolute', width: '2px', height: '2px', top: '50%', left: '50%' }}>
        {convergeStars.map(s => (
          <span key={s.id} style={{
            position: 'absolute', width: '3px', height: '3px', borderRadius: '50%',
            background: 'var(--c-star-bright)', boxShadow: '0 0 6px var(--c-star-bright)',
            '--tx': s.tx, '--ty': s.ty,
            animation: `starConverge ${s.duration}s ease-out ${s.delay}s forwards`
          }} />
        ))}
      </div>

      {/* I am here 浮现 */}
      <div style={{ position: 'relative', marginBottom: '10px', animation: 'textReveal 3s ease-out forwards' }}>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontStyle: 'italic', fontWeight: 300,
          fontSize: '38px', color: 'var(--c-text)', margin: 0, letterSpacing: '2px',
          textShadow: '0 0 15px var(--c-bg-solid)', animation: 'gentleFloat 4s ease-in-out infinite 3s'
        }}>
          I am here
        </h1>
      </div>

      <button onClick={handleClick} style={{
        position: 'relative', marginTop: '40px', padding: '12px 40px', borderRadius: '999px',
        border: '1px solid var(--c-star-bright)', background: 'var(--c-surface)', backdropFilter: 'blur(14px)',
        color: 'var(--c-text)', fontSize: '12px', cursor: 'pointer', fontFamily: 'var(--font-display)',
        letterSpacing: '3px', transition: 'all 0.3s ease', boxShadow: '0 4px 20px var(--c-shadow)'
      }}>
        BEGIN
      </button>
    </div>
  )
}

// ========== 主页面 ==========
const ChatPage = () => {
  const [showSplash, setShowSplash] = useState(() => !sessionStorage.getItem('hasVisited'))
  const [sessionList, setSessionList] = useState([])
  const [activeSessionId, setActiveSessionId] = useState(() => sessionStorage.getItem('activeSessionId') || null)
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(false)
  const [showSetting, setShowSetting] = useState(false)
  const [showSidebar, setShowSidebar] = useState(false)
  const [config, setConfig] = useState({ system_prompt: '你是温柔贴心的AI伴侣，简短自然回复', temperature: 0.7, compress_threshold: 3000, compress_keep_rounds: 4 })
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

  const handleSplashEnter = () => { sessionStorage.setItem('hasVisited', 'true'); setShowSplash(false) }
  const scrollBottom = () => { setTimeout(() => { if (messageBoxRef.current) messageBoxRef.current.scrollTop = messageBoxRef.current.scrollHeight }, 50) }

  const fetchSessions = async () => {
    try {
      const res = await axios.get(`${API_BASE}/sessions`)
      const sessions = res.data || []
      setSessionList(sessions)
      if (activeSessionId && !sessions.find(s => s.id === activeSessionId)) {
        sessionStorage.removeItem('activeSessionId'); setActiveSessionId(null); setMessages([]); setArchivedList([]); setHasOlderArchive(false); setArchiveCursor(null)
      }
    } catch (err) { console.error('加载会话列表失败:', err.message); setSessionList([]) }
  }

  const createSession = async () => {
    try {
      const res = await axios.post(`${API_BASE}/session/new`)
      const newSession = res.data
      setSessionList(prev => [newSession, ...prev])
      sessionStorage.setItem('activeSessionId', newSession.id); setActiveSessionId(newSession.id)
      setMessages([]); setArchivedList([]); setHasOlderArchive(false); setArchiveCursor(null); setShowSidebar(false)
    } catch (err) { console.error('创建会话失败:', err.message); showToast('创建会话失败：' + err.message) }
  }

  const switchSession = async (sid) => {
    try {
      sessionStorage.setItem('activeSessionId', sid); setActiveSessionId(sid)
      const res = await axios.get(`${API_BASE}/messages/${sid}`)
      setMessages(res.data || []); setArchivedList([]); setHasOlderArchive(false); setArchiveCursor(null); setShowSidebar(false)
    } catch (err) { console.error('切换会话失败:', err.message); return }
    try {
      const archiveRes = await axios.get(`${API_BASE}/messages/archived/${sid}?limit=1`)
      if (archiveRes.data?.list?.length > 0) setHasOlderArchive(true)
    } catch (e) { console.error('归档检测失败:', e.message) }
  }

  const loadOlderArchive = async () => {
    if (!activeSessionId) return
    try {
      const params = new URLSearchParams()
      if (archiveCursor) params.append('cursor', archiveCursor)
      params.append('limit', '6')
      const res = await axios.get(`${API_BASE}/messages/archived/${activeSessionId}?${params.toString()}`)
      const { list, hasMore } = res.data
      if (list.length > 0) { setArchivedList(prev => [...list, ...prev]); setArchiveCursor(list[0].id) }
      setHasOlderArchive(hasMore)
    } catch (err) { console.error('加载归档消息失败:', err.message) }
  }

  const renameSession = async (sid, newTitle) => {
    try {
      await axios.put(`${API_BASE}/session/${sid}`, { title: newTitle })
      setSessionList(prev => prev.map(s => s.id === sid ? { ...s, title: newTitle } : s))
      await fetchSessions()
    } catch (err) { console.error('重命名失败:', err.message); showToast('重命名失败：' + err.message); fetchSessions() }
  }

  const handleRenameClick = (sid, currentTitle) => { setRenameModal({ show: true, sessionId: sid, value: currentTitle || '' }); setTimeout(() => renameInputRef.current?.focus(), 50) }
  const confirmRename = () => { const val = renameModal.value.trim(); if (val && renameModal.sessionId) renameSession(renameModal.sessionId, val); setRenameModal({ show: false, sessionId: null, value: '' }) }
  const handleDeleteClick = (sid, sname) => { setDeleteModal({ show: true, sessionId: sid, name: sname || '这个会话' }) }

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
    const content = inputText.trim(); setInputText(''); setLoading(true)
    const tempUserMsg = { role: 'user', content, created_at: new Date() }
    setMessages(prev => [...prev, tempUserMsg]); scrollBottom()
    try {
      const res = await axios.post(`${API_BASE}/chat`, { sessionId: activeSessionId, content })
      const aiReply = { role: 'assistant', content: res.data.reply, created_at: new Date() }
      setMessages(prev => [...prev, aiReply])
    } catch (err) { setMessages(prev => prev.slice(0, -1)); showToast('请求失败：' + err.message) }
    setLoading(false); scrollBottom()
    try {
      const archiveRes = await axios.get(`${API_BASE}/messages/archived/${activeSessionId}?limit=1`)
      setHasOlderArchive((archiveRes.data?.list?.length || 0) > 0)
    } catch (e) { console.error('归档检测失败:', e.message) }
  }

  const getSettings = async () => { try { const res = await axios.get(`${API_BASE}/settings`); setConfig(res.data) } catch (err) { console.error('加载设置失败:', err.message) } }
  const saveSettings = async () => { try { await axios.post(`${API_BASE}/settings`, config); setShowSetting(false); showToast('配置已保存') } catch (err) { console.error('保存设置失败:', err.message); showToast('保存失败：' + err.message) } }

  useEffect(() => {
    const init = async () => {
      try {
        const res = await axios.get(`${API_BASE}/sessions`); const sessions = res.data || []; setSessionList(sessions); getSettings()
        const savedId = sessionStorage.getItem('activeSessionId')
        if (savedId && sessions.find(s => s.id === savedId)) await switchSession(savedId)
        else if (sessions.length > 0) await switchSession(sessions[0].id)
      } catch (err) { console.error('初始化失败:', err.message) }
    }
    init()
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme); localStorage.setItem('ks_theme', theme)
    let meta = document.querySelector('meta[name="theme-color"]')
    if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta) }
    meta.setAttribute('content', THEME_META_COLOR[theme] || '#FDF8F3')
  }, [theme])

  const cycleTheme = () => { const idx = THEMES.indexOf(theme); setTheme(THEMES[(idx + 1) % THEMES.length]) }

  useEffect(() => {
    const root = document.documentElement
    const updateHeight = () => { const h = window.visualViewport ? window.visualViewport.height : window.innerHeight; root.style.setProperty('--app-height', `${h}px`) }
    updateHeight(); window.visualViewport?.addEventListener('resize', updateHeight); window.addEventListener('resize', updateHeight)
    return () => { window.visualViewport?.removeEventListener('resize', updateHeight); window.removeEventListener('resize', updateHeight) }
  }, [])

  const formatTime = (timeStr) => {
    if (!timeStr) return ''; let date; if (!isNaN(Number(timeStr))) date = new Date(Number(timeStr)); else date = new Date(timeStr)
    const timeNum = date.getTime(); if (Number.isNaN(timeNum) || timeNum <= 0) return String(timeStr).slice(0, 16)
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  }

  const formatDate = (timeStr) => {
    if (!timeStr) return ''; const date = new Date(timeStr); const now = new Date()
    if (date.toDateString() === now.toDateString()) return '今天'
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1)
    if (date.toDateString() === yesterday.toDateString()) return '昨天'
    return `${date.getMonth() + 1}月${date.getDate()}日`
  }

  const groupMessagesByDate = (msgs) => { const groups = {}; msgs.forEach(msg => { const date = formatDate(msg.created_at); if (!groups[date]) groups[date] = []; groups[date].push(msg) }); return groups }

  const renderMsgItem = (msg, key) => (
    <div key={key} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: '16px', padding: '0 16px' }}>
      <div style={{ maxWidth: '78%', display: 'flex', flexDirection: msg.role === 'user' ? 'row-reverse' : 'row', alignItems: 'flex-start', gap: '8px' }}>
        {msg.role === 'user' ? <UserAvatar /> : <AIAvatar />}
        <div style={{
          padding: '12px 17px', borderRadius: msg.role === 'user' ? '20px 20px 6px 20px' : '20px 20px 20px 6px',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
          background: msg.role === 'user' ? 'var(--c-bubble-user-bg)' : 'var(--c-bubble-ai-bg)',
          backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
          color: msg.role === 'user' ? 'var(--c-bubble-user-text)' : 'var(--c-bubble-ai-text)',
          fontSize: '14.5px', lineHeight: '1.7', boxShadow: '0 4px 20px var(--c-shadow), inset 0 1px 0 var(--c-highlight)',
          border: msg.role === 'user' ? '1px solid var(--c-bubble-user-border)' : '1px solid var(--c-bubble-ai-border)'
        }}>
          <div>{msg.content}</div>
          <div style={{ fontSize: '11px', marginTop: '6px', color: 'var(--c-text-faint)', textAlign: 'right' }}>{formatTime(msg.created_at)}</div>
        </div>
      </div>
    </div>
  )

  const groupedMessages = groupMessagesByDate(messages)

  return (
    <div data-theme={theme} style={{ flex: 1, display: 'flex', height: 'var(--app-height, 100dvh)', maxHeight: 'var(--app-height, 100dvh)', background: 'var(--c-bg-gradient)', color: 'var(--c-text)', fontFamily: 'var(--font-body)', overflow: 'hidden', position: 'relative' }}>
      <div className="ambient-bg" />
      <StarField count={theme === 'noir' ? 40 : 15} />

      {showSplash && <SplashScreen onEnter={handleSplashEnter} />}

      {showSidebar && (<div style={{ position: 'fixed', inset: 0, background: 'var(--c-overlay)', backdropFilter: 'blur(8px)', zIndex: 200, animation: 'fadeIn 0.3s ease' }} onClick={() => setShowSidebar(false)} />)}

      <div style={{
        position: 'fixed', top: 0, left: showSidebar ? 0 : '-320px', width: '280px', height: 'var(--app-height, 100dvh)',
        background: 'var(--c-surface)', backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)', zIndex: 300,
        transition: 'left 0.35s cubic-bezier(0.4, 0, 0.2, 1)', display: 'flex', flexDirection: 'column',
        boxShadow: showSidebar ? '4px 0 30px var(--c-shadow)' : 'none', borderRight: '1px solid var(--c-border)', overflow: 'hidden'
      }}>
        <VineDecoration />
        
        <div style={{ padding: '26px 20px 18px', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '22px' }}>
            <Wordmark size="md" />
            <button className="icon-btn" onClick={cycleTheme} title={`当前主题：${THEME_LABELS[theme]}`} style={{ background: 'transparent', border: '1px solid var(--c-border)', borderRadius: '999px', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--c-text-muted)' }}><Icon.Moon size={13} /></button>
          </div>
          <button onClick={createSession} style={{ width: '100%', padding: '12px', background: 'var(--c-accent)', border: '1px solid var(--c-accent)', borderRadius: '16px', color: 'var(--c-accent-text)', cursor: 'pointer', marginBottom: '4px', fontSize: '13.5px', letterSpacing: '1px', transition: 'all 0.3s ease', boxShadow: '0 4px 15px var(--c-shadow)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}><Icon.Plus size={12} /> 新建对话</button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px', position: 'relative', zIndex: 1 }}>
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

        <div style={{ padding: '16px', borderTop: '1px solid var(--c-border)', position: 'relative', zIndex: 1 }}>
          <button onClick={() => { setShowSidebar(false); setShowSetting(true) }} style={{ width: '100%', padding: '10px', background: 'transparent', border: '1px solid var(--c-border)', borderRadius: '12px', color: 'var(--c-text-muted)', cursor: 'pointer', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}><SettingsIcon size={14} /> 全局设置</button>
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, position: 'relative' }}>
        <div style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--c-border)', flexShrink: 0 }}>
          <button className="icon-btn" onClick={() => setShowSidebar(true)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--c-text-muted)', display: 'flex' }}><Icon.Menu /></button>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '15px', fontStyle: 'italic', color: 'var(--c-text-muted)', letterSpacing: '0.5px' }}>{activeSessionId ? (sessionList.find(s => s.id === activeSessionId)?.title || '对话中') : 'ke&shu'}</div>
          <div style={{ width: '20px' }} />
        </div>

        <div ref={messageBoxRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 0', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', minHeight: 0 }}>
          {!activeSessionId ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--c-text-faint)', gap: '14px' }}>
              <AIAvatar size={44} />
              <div style={{ fontSize: '14px', fontFamily: 'var(--font-display)', fontStyle: 'italic' }}>选择或新建一个对话</div>
            </div>
          ) : (
            <>
              {hasOlderArchive && (<div style={{ textAlign: 'center', padding: '16px 0', color: 'var(--c-text-faint)', fontSize: '12px' }}><span onClick={loadOlderArchive} style={{ cursor: 'pointer', padding: '7px 16px', borderRadius: '999px', background: 'var(--c-surface)', border: '1px solid var(--c-border)', display: 'inline-flex', alignItems: 'center', gap: '4px' }}><Icon.ArrowUp size={11} /> 加载更早的历史</span></div>)}
              {archivedList.map((msg, idx) => renderMsgItem(msg, `arch-${idx}`))}
              {Object.entries(groupedMessages).map(([date, msgs]) => (
                <div key={date}>
                  <div style={{ textAlign: 'center', margin: '20px 0 12px' }}><span style={{ fontSize: '11px', color: 'var(--c-text-faint)', background: 'var(--c-surface)', padding: '4px 14px', borderRadius: '999px', letterSpacing: '1px' }}>{date}</span></div>
                  {msgs.map((msg, idx) => renderMsgItem(msg, `live-${idx}`))}
                </div>
              ))}
              {loading && (<div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 20px', color: 'var(--c-text-muted)', fontSize: '13px' }}><AIAvatar /><div style={{ display: 'flex', gap: '4px' }}><span style={{ animation: 'dotPulse 1.4s ease-in-out infinite', animationDelay: '0s' }}>·</span><span style={{ animation: 'dotPulse 1.4s ease-in-out infinite', animationDelay: '0.2s' }}>·</span><span style={{ animation: 'dotPulse 1.4s ease-in-out infinite', animationDelay: '0.4s' }}>·</span></div></div>)}
            </>
          )}
        </div>

        <div style={{ padding: '12px 16px calc(env(safe-area-inset-bottom, 0px) + 14px)', borderTop: '1px solid var(--c-border)', background: 'var(--c-surface)', backdropFilter: 'blur(20px)', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
            <textarea value={inputText} onChange={(e) => setInputText(e.target.value)} onKeyDown={(e) => e.ctrlKey && e.key === 'Enter' && sendMessage()} placeholder="Tell me everything..." style={{ flex: 1, padding: '12px 16px', background: 'var(--c-input-bg)', border: '1px solid var(--c-border)', borderRadius: '18px', color: 'var(--c-text)', resize: 'none', fontFamily: 'inherit', fontSize: '14px', outline: 'none', lineHeight: '1.5', boxShadow: '0 2px 8px var(--c-shadow)', minHeight: '46px', backdropFilter: 'blur(8px)' }} rows={1} />
            <button onClick={sendMessage} disabled={loading || !activeSessionId} style={{ width: '46px', height: '46px', borderRadius: '50%', background: 'var(--c-accent)', border: '1px solid var(--c-accent)', color: 'var(--c-accent-text)', cursor: loading || !activeSessionId ? 'not-allowed' : 'pointer', opacity: loading || !activeSessionId ? 0.45 : 1, transition: 'all 0.3s ease', boxShadow: '0 4px 15px var(--c-shadow)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Icon.ArrowUp size={18} /></button>
          </div>
        </div>
      </div>

      <div className="toast-wrap">{toasts.map(t => (<div key={t.id} className="toast-item">{t.message}</div>))}</div>

      {renameModal.show && (<div style={{ position: 'fixed', inset: 0, background: 'var(--c-overlay)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2100, animation: 'fadeIn 0.2s ease' }} onClick={() => setRenameModal({ show: false, sessionId: null, value: '' })}><div style={{ background: 'var(--c-surface-solid)', borderRadius: '22px', padding: '26px 24px 20px', width: '300px', maxWidth: '86vw', boxShadow: '0 20px 60px var(--c-shadow)', border: '1px solid var(--c-border)', animation: 'scaleIn 0.25s cubic-bezier(0.34,1.56,0.64,1)' }} onClick={(e) => e.stopPropagation()}><div style={{ fontSize: '15px', fontFamily: 'var(--font-display)', fontStyle: 'italic', color: 'var(--c-text)', marginBottom: '14px' }}>重命名对话</div><input ref={renameInputRef} value={renameModal.value} onChange={(e) => setRenameModal(p => ({ ...p, value: e.target.value }))} onKeyDown={(e) => e.key === 'Enter' && confirmRename()} style={{ width: '100%', padding: '10px 14px', background: 'var(--c-input-bg)', border: '1px solid var(--c-border)', borderRadius: '12px', color: 'var(--c-text)', fontFamily: 'inherit', fontSize: '14px', outline: 'none', marginBottom: '18px' }} /><div style={{ display: 'flex', gap: '10px' }}><button onClick={() => setRenameModal({ show: false, sessionId: null, value: '' })} style={{ flex: 1, padding: '10px 0', borderRadius: '14px', border: '1px solid var(--c-border)', background: 'transparent', color: 'var(--c-text-muted)', fontSize: '13.5px', cursor: 'pointer', fontFamily: 'inherit' }}>取消</button><button onClick={confirmRename} style={{ flex: 1, padding: '10px 0', borderRadius: '14px', border: '1px solid var(--c-accent)', background: 'var(--c-accent)', color: 'var(--c-accent-text)', fontSize: '13.5px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>确定</button></div></div></div>)}

      {deleteModal.show && (<div style={{ position: 'fixed', inset: 0, background: 'var(--c-overlay)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, animation: 'fadeIn 0.2s ease' }}><div style={{ background: 'var(--c-surface-solid)', borderRadius: '22px', padding: '28px 24px 20px', width: '300px', maxWidth: '86vw', textAlign: 'center', boxShadow: '0 20px 60px var(--c-shadow)', border: '1px solid var(--c-border)', animation: 'scaleIn 0.25s cubic-bezier(0.34,1.56,0.64,1)' }}><div style={{ fontSize: '15px', fontFamily: 'var(--font-display)', fontStyle: 'italic', color: 'var(--c-text)', marginBottom: '6px' }}>确定删除这段对话？</div><div style={{ fontSize: '12.5px', color: 'var(--c-text-muted)', marginBottom: '22px' }}>"{deleteModal.name}" 将被永久删除</div><div style={{ display: 'flex', gap: '10px' }}><button onClick={() => setDeleteModal({ show: false, sessionId: null, name: '' })} style={{ flex: 1, padding: '10px 0', borderRadius: '14px', border: '1px solid var(--c-border)', background: 'transparent', color: 'var(--c-text-muted)', fontSize: '13.5px', cursor: 'pointer', fontFamily: 'inherit' }}>取消</button><button onClick={confirmDelete} style={{ flex: 1, padding: '10px 0', borderRadius: '14px', border: '1px solid var(--c-accent)', background: 'var(--c-accent)', color: 'var(--c-accent-text)', fontSize: '13.5px', fontWeight: 500, cursor: 'pointer', fontFamily: 'inherit' }}>确定</button></div></div></div>)}

      {showSetting && (<div style={{ position: 'fixed', inset: 0, background: 'var(--c-overlay)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400, padding: '20px' }}><div style={{ width: '480px', maxWidth: '100%', maxHeight: '86vh', overflowY: 'auto', background: 'var(--c-surface-solid)', padding: '28px', borderRadius: '22px', boxShadow: '0 8px 40px var(--c-shadow)', border: '1px solid var(--c-border)' }}><h3 style={{ marginTop: 0, fontWeight: 400, fontFamily: 'var(--font-display)', fontStyle: 'italic', fontSize: '20px', color: 'var(--c-text)', marginBottom: '22px' }}>全局设置</h3><div style={{ marginBottom: '22px' }}><label style={{ fontSize: '11px', color: 'var(--c-text-faint)', display: 'block', marginBottom: '10px', letterSpacing: '1.5px', textTransform: 'uppercase' }}>外观</label><div style={{ display: 'flex', gap: '8px' }}>{THEMES.map(t => (<button key={t} className="theme-pill" onClick={() => setTheme(t)} style={{ flex: 1, padding: '9px 0', borderRadius: '999px', border: `1px solid ${theme === t ? 'var(--c-accent)' : 'var(--c-border)'}`, background: theme === t ? 'var(--c-accent)' : 'transparent', color: theme === t ? 'var(--c-accent-text)' : 'var(--c-text-muted)', fontSize: '12.5px', letterSpacing: '1px', cursor: 'pointer', fontFamily: 'var(--font-display)' }}>{THEME_LABELS[t]}</button>))}</div></div><div style={{ marginBottom: '14px' }}><label style={{ fontSize: '13px', color: 'var(--c-text-muted)', display: 'block', marginBottom: '6px' }}>系统人设提示词</label><textarea value={config.system_prompt} onChange={(e) => setConfig(p => ({ ...p, system_prompt: e.target.value }))} style={{ width: '100%', padding: '10px 14px', background: 'var(--c-input-bg)', border: '1px solid var(--c-border)', borderRadius: '12px', color: 'var(--c-text)', fontFamily: 'inherit', fontSize: '13px', outline: 'none' }} rows={3} /></div><div style={{ marginBottom: '14px' }}><label style={{ fontSize: '13px', color: 'var(--c-text-muted)', display: 'block', marginBottom: '6px' }}>Temperature（随机性）</label><input type="number" step="0.1" min="0" max="1.5" value={config.temperature} onChange={(e) => setConfig(p => ({ ...p, temperature: Number(e.target.value) }))} style={{ width: '100%', padding: '10px 14px', background: 'var(--c-input-bg)', border: '1px solid var(--c-border)', borderRadius: '12px', color: 'var(--c-text)', fontFamily: 'inherit', fontSize: '13px', outline: 'none' }} /></div><div style={{ marginBottom: '14px' }}><label style={{ fontSize: '13px', color: 'var(--c-text-muted)', display: 'block', marginBottom: '6px' }}>记忆压缩阈值 token</label><input type="number" value={config.compress_threshold} onChange={(e) => setConfig(p => ({ ...p, compress_threshold: Number(e.target.value) }))} style={{ width: '100%', padding: '10px 14px', background: 'var(--c-input-bg)', border: '1px solid var(--c-border)', borderRadius: '12px', color: 'var(--c-text)', fontFamily: 'inherit', fontSize: '13px', outline: 'none' }} /></div><div style={{ marginBottom: '22px' }}><label style={{ fontSize: '13px', color: 'var(--c-text-muted)', display: 'block', marginBottom: '6px' }}>压缩后保留回合数</label><input type="number" value={config.compress_keep_rounds} onChange={(e) => setConfig(p => ({ ...p, compress_keep_rounds: Number(e.target.value) }))} style={{ width: '100%', padding: '10px 14px', background: 'var(--c-input-bg)', border: '1px solid var(--c-border)', borderRadius: '12px', color: 'var(--c-text)', fontFamily: 'inherit', fontSize: '13px', outline: 'none' }} /></div><div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}><button onClick={() => setShowSetting(false)} style={{ padding: '10px 18px', background: 'transparent', border: '1px solid var(--c-border)', color: 'var(--c-text-muted)', borderRadius: '12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px' }}>取消</button><button onClick={saveSettings} style={{ padding: '10px 18px', background: 'var(--c-accent)', border: '1px solid var(--c-accent)', color: 'var(--c-accent-text)', borderRadius: '12px', cursor: 'pointer', fontFamily: 'inherit', fontSize: '13px' }}>保存</button></div></div></div>)}
    </div>
  )
}

export default ChatPage