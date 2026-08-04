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
const THEME_META_COLOR = { warm: '#F7EFE5', mist: '#EEF2F5', noir: '#101216' }

// ========== 图标 ==========
const Icon = {
  Menu: (p) => (
    <svg width={p.size || 20} height={p.size || 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <line x1="4" y1="7" x2="20" y2="7" />
      <line x1="4" y1="12" x2="20" y2="12" />
      <line x1="4" y1="17" x2="14" y2="17" />
    </svg>
  ),
  Edit: (p) => (
    <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  ),
  Trash: (p) => (
    <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16" />
      <path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
      <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
    </svg>
  ),
  Plus: (p) => (
    <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  ArrowUp: (p) => (
    <svg width={p.size || 16} height={p.size || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="19" x2="12" y2="5" />
      <polyline points="6 11 12 5 18 11" />
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
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
  </svg>
)

// ========== 头像 ==========
const UserAvatar = ({ size = 30 }) => (
  <div className="user-avatar" style={{ width: size, height: size }} />
)

const AIAvatar = ({ size = 30 }) => (
  <div className="ai-avatar" style={{ width: size, height: size }} />
)

// ========== 星空层 ==========
const StarField = ({ count = 30 }) => {
  const stars = useMemo(() => Array.from({ length: count }).map((_, i) => ({
    id: i,
    left: Math.random() * 100,
    top: Math.random() * 100,
    size: Math.random() * 1.6 + 0.7,
    delay: Math.random() * 6,
    duration: 2.8 + Math.random() * 3.2
  })), [count])

  return (
    <div className="starfield" aria-hidden="true">
      {stars.map(s => (
        <span
          key={s.id}
          className="star"
          style={{
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: `${s.size}px`,
            height: `${s.size}px`,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.duration}s`
          }}
        />
      ))}
    </div>
  )
}

// ========== 品牌字标 ==========
const Wordmark = ({ size = 'md' }) => (
  <span className={`wordmark wordmark-${size}`}>
    <span className="wordmark-part">ke</span>
    <span className="wordmark-amp">&amp;</span>
    <span className="wordmark-part">shu</span>
  </span>
)

// ========== 开屏页：星座粒子凝聚文字 ==========
const SplashScreen = ({ onEnter }) => {
  const canvasRef = useRef(null)
  const [visible, setVisible] = useState(true)
  const [fadeOut, setFadeOut] = useState(false)
  const animRef = useRef(null)
  const particlesRef = useRef([])
  const dustRef = useRef([])
  const targetsRef = useRef([])
  const startTimeRef = useRef(null)
  const phaseRef = useRef('gathering') // gathering -> formed -> floating
  const floatOffsetRef = useRef(0)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    const resize = () => {
      const dpr = window.devicePixelRatio || 1
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const w = window.innerWidth
    const h = window.innerHeight

    // 预渲染文字获取像素坐标
    const offCanvas = document.createElement('canvas')
    const offCtx = offCanvas.getContext('2d')
    offCanvas.width = w
    offCanvas.height = h

    offCtx.fillStyle = '#fff'
    offCtx.textAlign = 'center'
    offCtx.textBaseline = 'middle'

    // 主标题
    offCtx.font = '200 34px "Cormorant Garamond", Georgia, serif'
    offCtx.fillText('Tell me everything', w / 2, h / 2 - 28)

    // 副标题
    offCtx.font = 'italic 400 15px "Cormorant Garamond", Georgia, serif'
    offCtx.fillText("I'm here, always", w / 2, h / 2 + 24)

    const imageData = offCtx.getImageData(0, 0, w, h)
    const pixels = imageData.data

    // 收集文字像素坐标（采样）
    const targetPoints = []
    const step = 3
    for (let y = 0; y < h; y += step) {
      for (let x = 0; x < w; x += step) {
        const idx = (y * w + x) * 4
        if (pixels[idx + 3] > 100) {
          targetPoints.push({ x, y })
        }
      }
    }

    // 随机打乱
    for (let i = targetPoints.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[targetPoints[i], targetPoints[j]] = [targetPoints[j], targetPoints[i]]
    }

    targetsRef.current = targetPoints

    // 创建粒子（取部分目标点，避免性能问题）
    const maxParticles = Math.min(targetPoints.length, 600)
    const particles = []
    for (let i = 0; i < maxParticles; i++) {
      const tp = targetPoints[i]
      // 从屏幕四周随机出发
      const side = Math.floor(Math.random() * 4)
      let sx, sy
      switch (side) {
        case 0: sx = Math.random() * w; sy = -20; break
        case 1: sx = w + 20; sy = Math.random() * h; break
        case 2: sx = Math.random() * w; sy = h + 20; break
        default: sx = -20; sy = Math.random() * h; break
      }
      particles.push({
        x: sx,
        y: sy,
        targetX: tp.x,
        targetY: tp.y,
        size: Math.random() * 1.4 + 0.5,
        speed: Math.random() * 0.018 + 0.010,
        delay: Math.random() * 800,
        opacity: 0,
        arrived: false,
        twinkleOffset: Math.random() * Math.PI * 2
      })
    }
    particlesRef.current = particles

    // 环境星尘
    dustRef.current = Array.from({ length: 60 }, () => ({
      x: Math.random() * w,
      y: Math.random() * h,
      size: Math.random() * 1.2 + 0.2,
      opacity: Math.random() * 0.3 + 0.1,
      speed: Math.random() * 0.0008 + 0.0003,
      offset: Math.random() * Math.PI * 2
    }))

    const animate = (timestamp) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp
      const elapsed = timestamp - startTimeRef.current
      const ww = window.innerWidth
      const wh = window.innerHeight

      ctx.clearRect(0, 0, ww, wh)

      // 深空背景
      const bgGrad = ctx.createRadialGradient(ww / 2, wh / 2, 0, ww / 2, wh / 2, ww * 0.8)
      bgGrad.addColorStop(0, '#0c0c14')
      bgGrad.addColorStop(0.5, '#06060a')
      bgGrad.addColorStop(1, '#020203')
      ctx.fillStyle = bgGrad
      ctx.fillRect(0, 0, ww, wh)

      // 极淡中心光晕
      const glow = ctx.createRadialGradient(ww / 2, wh / 2, 0, ww / 2, wh / 2, 300)
      glow.addColorStop(0, 'rgba(100, 120, 180, 0.03)')
      glow.addColorStop(1, 'transparent')
      ctx.fillStyle = glow
      ctx.fillRect(0, 0, ww, wh)

      // 绘制环境星尘
      dustRef.current.forEach(d => {
        const twinkle = Math.sin(elapsed * d.speed + d.offset)
        const alpha = d.opacity * (0.5 + twinkle * 0.5)
        ctx.beginPath()
        ctx.arc(d.x, d.y, d.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(200, 215, 255, ${alpha})`
        ctx.fill()
      })

      // 检查是否全部到达
      let allArrived = true
      let arrivedCount = 0

      particlesRef.current.forEach(p => {
        if (elapsed < p.delay) {
          allArrived = false
          // 延迟期间绘制在起始位置，微弱闪烁
          ctx.beginPath()
          ctx.arc(p.x, p.y, p.size * 0.5, 0, Math.PI * 2)
          ctx.fillStyle = `rgba(180, 200, 255, 0.15)`
          ctx.fill()
          return
        }

        const dx = p.targetX - p.x
        const dy = p.targetY - p.y
        const dist = Math.sqrt(dx * dx + dy * dy)

        if (dist > 1.5) {
          allArrived = false
          p.x += dx * p.speed
          p.y += dy * p.speed
          p.opacity = Math.min(p.opacity + 0.03, 0.85)
        } else {
          p.x = p.targetX
          p.y = p.targetY
          p.arrived = true
          arrivedCount++
          // 到达后呼吸闪烁
          const breathe = Math.sin(elapsed * 0.002 + p.twinkleOffset)
          p.opacity = 0.5 + breathe * 0.35
        }

        // 绘制粒子发光
        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size * 2, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(200, 220, 255, ${p.opacity * 0.15})`
        ctx.fill()

        ctx.beginPath()
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
        ctx.fillStyle = `rgba(220, 235, 255, ${p.opacity})`
        ctx.fill()
      })

      // 星座连线（相邻且已到达的粒子之间）
      if (arrivedCount > 50) {
        ctx.strokeStyle = 'rgba(180, 200, 240, 0.08)'
        ctx.lineWidth = 0.5
        const pts = particlesRef.current.filter(p => p.arrived)
        for (let i = 0; i < pts.length; i += 3) {
          for (let j = i + 1; j < pts.length; j += 3) {
            const dx = pts[i].x - pts[j].x
            const dy = pts[i].y - pts[j].y
            const d = Math.sqrt(dx * dx + dy * dy)
            if (d < 28) {
              ctx.beginPath()
              ctx.moveTo(pts[i].x, pts[i].y)
              ctx.lineTo(pts[j].x, pts[j].y)
              ctx.stroke()
            }
          }
        }
      }

      // 阶段切换
      if (allArrived && phaseRef.current === 'gathering') {
        phaseRef.current = 'formed'
        floatOffsetRef.current = elapsed
      }

      // 整体浮动（形成后）
      if (phaseRef.current === 'formed' || phaseRef.current === 'floating') {
        phaseRef.current = 'floating'
        const floatY = Math.sin((elapsed - floatOffsetRef.current) * 0.0008) * 2
        // 所有粒子整体偏移
        particlesRef.current.forEach(p => {
          if (p.arrived) {
            p.targetY = p.targetY + floatY * 0.01 // 轻微调整目标
          }
        })
      }

      animRef.current = requestAnimationFrame(animate)
    }

    animRef.current = requestAnimationFrame(animate)

    return () => {
      cancelAnimationFrame(animRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [])

  const handleClick = () => {
    setFadeOut(true)
    setTimeout(() => {
      setVisible(false)
      onEnter()
    }, 800)
  }

  if (!visible) return null

  return (
    <div
      className="splash-screen"
      style={{
        position: 'fixed',
        inset: 0,
        background: '#050508',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        transition: 'opacity 0.8s cubic-bezier(0.65, 0, 0.35, 1), transform 0.8s cubic-bezier(0.65, 0, 0.35, 1)',
        opacity: fadeOut ? 0 : 1,
        transform: fadeOut ? 'scale(1.02)' : 'scale(1)'
      }}
    >
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%'
        }}
      />
      <button
        onClick={handleClick}
        className="splash-begin-btn"
      >
        BEGIN
      </button>
    </div>
  )
}

// ========== 主页面 ==========
const ChatPage = () => {
  const [showSplash, setShowSplash] = useState(() => {
    return !sessionStorage.getItem('hasVisited')
  })
  const [sessionList, setSessionList] = useState([])
  const [activeSessionId, setActiveSessionId] = useState(() => {
    return sessionStorage.getItem('activeSessionId') || null
  })
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
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 2500)
  }

  const messageBoxRef = useRef(null)
  const renameInputRef = useRef(null)

  const handleSplashEnter = () => {
    sessionStorage.setItem('hasVisited', 'true')
    setShowSplash(false)
  }

  const scrollBottom = () => {
    setTimeout(() => {
      if (messageBoxRef.current) {
        messageBoxRef.current.scrollTop = messageBoxRef.current.scrollHeight
      }
    }, 50)
  }

  const fetchSessions = async () => {
    try {
      const res = await axios.get(`${API_BASE}/sessions`)
      const sessions = res.data || []
      setSessionList(sessions)
      if (activeSessionId && !sessions.find(s => s.id === activeSessionId)) {
        sessionStorage.removeItem('activeSessionId')
        setActiveSessionId(null)
        setMessages([])
        setArchivedList([])
        setHasOlderArchive(false)
        setArchiveCursor(null)
      }
    } catch (err) {
      console.error('加载会话列表失败:', err.message)
      setSessionList([])
    }
  }

  const createSession = async () => {
    try {
      const res = await axios.post(`${API_BASE}/session/new`)
      const newSession = res.data
      setSessionList(prev => [newSession, ...prev])
      sessionStorage.setItem('activeSessionId', newSession.id)
      setActiveSessionId(newSession.id)
      setMessages([])
      setArchivedList([])
      setHasOlderArchive(false)
      setArchiveCursor(null)
      setShowSidebar(false)
    } catch (err) {
      console.error('创建会话失败:', err.message)
      showToast('创建会话失败：' + err.message)
    }
  }

  const switchSession = async (sid) => {
    try {
      sessionStorage.setItem('activeSessionId', sid)
      setActiveSessionId(sid)
      const res = await axios.get(`${API_BASE}/messages/${sid}`)
      setMessages(res.data || [])
      setArchivedList([])
      setHasOlderArchive(false)
      setArchiveCursor(null)
      setShowSidebar(false)
    } catch (err) {
      console.error('切换会话失败:', err.message)
      return
    }
    try {
      const archiveRes = await axios.get(`${API_BASE}/messages/archived/${sid}?limit=1`)
      if (archiveRes.data?.list?.length > 0) {
        setHasOlderArchive(true)
      }
    } catch (e) {
      console.error('归档检测失败:', e.message)
    }
  }

  const loadOlderArchive = async () => {
    if (!activeSessionId) return
    try {
      const params = new URLSearchParams()
      if (archiveCursor) params.append('cursor', archiveCursor)
      params.append('limit', '6')
      const res = await axios.get(`${API_BASE}/messages/archived/${activeSessionId}?${params.toString()}`)
      const { list, hasMore } = res.data
      if (list.length > 0) {
        setArchivedList(prev => [...list, ...prev])
        setArchiveCursor(list[0].id)
      }
      setHasOlderArchive(hasMore)
    } catch (err) {
      console.error('加载归档消息失败:', err.message)
    }
  }

  const renameSession = async (sid, newTitle) => {
    try {
      await axios.put(`${API_BASE}/session/${sid}`, { title: newTitle })
      setSessionList(prev => prev.map(s => s.id === sid ? { ...s, title: newTitle } : s))
      await fetchSessions()
    } catch (err) {
      console.error('重命名失败:', err.message)
      showToast('重命名失败：' + err.message)
      fetchSessions()
    }
  }

  const handleRenameClick = (sid, currentTitle) => {
    setRenameModal({ show: true, sessionId: sid, value: currentTitle || '' })
    setTimeout(() => renameInputRef.current?.focus(), 50)
  }

  const confirmRename = () => {
    const val = renameModal.value.trim()
    if (val && renameModal.sessionId) {
      renameSession(renameModal.sessionId, val)
    }
    setRenameModal({ show: false, sessionId: null, value: '' })
  }

  const handleDeleteClick = (sid, sname) => {
    setDeleteModal({ show: true, sessionId: sid, name: sname || '这个会话' })
  }

  const confirmDelete = async () => {
    if (!deleteModal.sessionId) return
    try {
      await axios.delete(`${API_BASE}/session/${deleteModal.sessionId}`)
      setSessionList(prev => prev.filter(s => s.id !== deleteModal.sessionId))
      if (activeSessionId === deleteModal.sessionId) {
        sessionStorage.removeItem('activeSessionId')
        setActiveSessionId(null)
        setMessages([])
        setArchivedList([])
        setHasOlderArchive(false)
        setArchiveCursor(null)
      }
    } catch (err) {
      console.error('删除失败:', err.message)
      showToast('删除失败：' + err.message)
      fetchSessions()
    }
    setDeleteModal({ show: false, sessionId: null, name: '' })
  }

  const sendMessage = async () => {
    if (!inputText.trim() || !activeSessionId || loading) return
    const content = inputText.trim()
    setInputText('')
    setLoading(true)

    const tempUserMsg = { role: 'user', content, created_at: new Date() }
    setMessages(prev => [...prev, tempUserMsg])
    scrollBottom()

    try {
      const res = await axios.post(`${API_BASE}/chat`, {
        sessionId: activeSessionId,
        content
      })
      const aiReply = { role: 'assistant', content: res.data.reply, created_at: new Date() }
      setMessages(prev => [...prev, aiReply])
    } catch (err) {
      setMessages(prev => prev.slice(0, -1))
      showToast('请求失败：' + err.message)
    }

    setLoading(false)
    scrollBottom()

    try {
      const archiveRes = await axios.get(`${API_BASE}/messages/archived/${activeSessionId}?limit=1`)
      setHasOlderArchive((archiveRes.data?.list?.length || 0) > 0)
    } catch (e) {
      console.error('归档检测失败:', e.message)
    }
  }

  const getSettings = async () => {
    try {
      const res = await axios.get(`${API_BASE}/settings`)
      setConfig(res.data)
    } catch (err) {
      console.error('加载设置失败:', err.message)
    }
  }

  const saveSettings = async () => {
    try {
      await axios.post(`${API_BASE}/settings`, config)
      setShowSetting(false)
      showToast('配置已保存')
    } catch (err) {
      console.error('保存设置失败:', err.message)
      showToast('保存失败：' + err.message)
    }
  }

  useEffect(() => {
    const init = async () => {
      try {
        const res = await axios.get(`${API_BASE}/sessions`)
        const sessions = res.data || []
        setSessionList(sessions)
        getSettings()
        const savedId = sessionStorage.getItem('activeSessionId')
        if (savedId && sessions.find(s => s.id === savedId)) {
          await switchSession(savedId)
        } else if (sessions.length > 0) {
          await switchSession(sessions[0].id)
        }
      } catch (err) {
        console.error('初始化失败:', err.message)
      }
    }
    init()
  }, [])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('ks_theme', theme)
    let meta = document.querySelector('meta[name="theme-color"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'theme-color'
      document.head.appendChild(meta)
    }
    meta.setAttribute('content', THEME_META_COLOR[theme] || '#F7EFE5')
  }, [theme])

  const cycleTheme = () => {
    const idx = THEMES.indexOf(theme)
    setTheme(THEMES[(idx + 1) % THEMES.length])
  }

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

  const formatTime = (timeStr) => {
    if (!timeStr) return ''
    let date
    if (!isNaN(Number(timeStr))) {
      date = new Date(Number(timeStr))
    } else {
      date = new Date(timeStr)
    }
    const timeNum = date.getTime()
    if (Number.isNaN(timeNum) || timeNum <= 0) {
      const raw = String(timeStr)
      return raw.slice(0, 16)
    }
    const h = String(date.getHours()).padStart(2, '0')
    const m = String(date.getMinutes()).padStart(2, '0')
    return `${h}:${m}`
  }

  const formatDate = (timeStr) => {
    if (!timeStr) return ''
    const date = new Date(timeStr)
    const now = new Date()
    const isToday = date.toDateString() === now.toDateString()
    if (isToday) return '今天'
    const yesterday = new Date(now)
    yesterday.setDate(yesterday.getDate() - 1)
    if (date.toDateString() === yesterday.toDateString()) return '昨天'
    return `${date.getMonth() + 1}月${date.getDate()}日`
  }

  const groupMessagesByDate = (msgs) => {
    const groups = {}
    msgs.forEach(msg => {
      const date = formatDate(msg.created_at)
      if (!groups[date]) groups[date] = []
      groups[date].push(msg)
    })
    return groups
  }

  const renderMsgItem = (msg, key) => (
    <div key={key} className={`message-row ${msg.role}`}>
      <div className="message-inner">
        {msg.role === 'user' ? <UserAvatar /> : <AIAvatar />}
        <div className={`message-bubble ${msg.role}`}>
          <div className="message-content">{msg.content}</div>
          <div className="message-time">{formatTime(msg.created_at)}</div>
        </div>
      </div>
    </div>
  )

  const groupedMessages = groupMessagesByDate(messages)

  return (
    <div
      data-theme={theme}
      className="chat-page-root"
      style={{
        flex: 1,
        display: 'flex',
        height: 'var(--app-height, 100dvh)',
        maxHeight: 'var(--app-height, 100dvh)',
        background: 'var(--c-bg-gradient)',
        color: 'var(--c-text)',
        fontFamily: 'var(--font-body)',
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      <div className="ambient-bg" />
      <div className="noise-overlay" />
      <StarField count={theme === 'noir' ? 42 : theme === 'mist' ? 20 : 18} />

      {showSplash && <SplashScreen onEnter={handleSplashEnter} />}

      {showSidebar && (
        <div
          className="sidebar-overlay"
          onClick={() => setShowSidebar(false)}
        />
      )}

      {/* 侧边栏 */}
      <div className={`sidebar ${showSidebar ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div className="sidebar-brand">
            <AIAvatar size={26} />
            <Wordmark size="md" />
          </div>
          <button
            className="icon-btn theme-toggle"
            onClick={cycleTheme}
            title={`当前主题：${THEME_LABELS[theme]}`}
          >
            <Icon.Moon size={13} />
          </button>
        </div>

        <button className="new-chat-btn" onClick={createSession}>
          <Icon.Plus size={12} /> 新建对话
        </button>

        <div className="sidebar-body">
          <div className="sidebar-section-title">最近对话</div>
          {sessionList.map(item => (
            <div
              key={item.id}
              className={`session-item ${activeSessionId === item.id ? 'active' : ''}`}
              onClick={() => switchSession(item.id)}
            >
              <span className="session-title">{item.title}</span>
              <div className="session-actions">
                <button
                  className="icon-btn"
                  onClick={(e) => { e.stopPropagation(); handleRenameClick(item.id, item.title) }}
                ><Icon.Edit /></button>
                <button
                  className="icon-btn"
                  onClick={(e) => { e.stopPropagation(); handleDeleteClick(item.id, item.title) }}
                ><Icon.Trash /></button>
              </div>
            </div>
          ))}
        </div>

        <div className="sidebar-footer">
          <button className="settings-btn" onClick={() => { setShowSidebar(false); setShowSetting(true) }}>
            <SettingsIcon size={14} /> 全局设置
          </button>
        </div>
      </div>

      {/* 主内容区 */}
      <div className="main-content">
        <div className="top-bar">
          <button className="icon-btn menu-btn" onClick={() => setShowSidebar(true)}>
            <Icon.Menu />
          </button>
          <div className="top-bar-title">
            {activeSessionId ? (sessionList.find(s => s.id === activeSessionId)?.title || '对话中') : 'ke&shu'}
          </div>
          <div style={{ width: '20px' }} />
        </div>

        <div ref={messageBoxRef} className="message-box">
          {!activeSessionId ? (
            <div className="empty-state">
              <AIAvatar size={44} />
              <div className="empty-text">选择或新建一个对话</div>
            </div>
          ) : (
            <>
              {hasOlderArchive && (
                <div className="load-more-wrap">
                  <span className="load-more-btn" onClick={loadOlderArchive}>
                    <Icon.ArrowUp size={11} /> 加载更早的历史
                  </span>
                </div>
              )}
              {archivedList.map((msg, idx) => renderMsgItem(msg, `arch-${idx}`))}
              {Object.entries(groupedMessages).map(([date, msgs]) => (
                <div key={date}>
                  <div className="date-divider">
                    <span>{date}</span>
                  </div>
                  {msgs.map((msg, idx) => renderMsgItem(msg, `live-${idx}`))}
                </div>
              ))}
              {loading && (
                <div className="loading-row">
                  <AIAvatar />
                  <div className="loading-dots">
                    <span style={{ animationDelay: '0s' }}>·</span>
                    <span style={{ animationDelay: '0.2s' }}>·</span>
                    <span style={{ animationDelay: '0.4s' }}>·</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="input-area">
          <div className="input-inner">
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.ctrlKey && e.key === 'Enter' && sendMessage()}
              placeholder="Tell me everything..."
              rows={1}
            />
            <button
              className="send-btn"
              onClick={sendMessage}
              disabled={loading || !activeSessionId}
            >
              <Icon.ArrowUp size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Toast */}
      <div className="toast-wrap">
        {toasts.map(t => (
          <div key={t.id} className="toast-item">{t.message}</div>
        ))}
      </div>

      {/* 重命名弹窗 */}
      {renameModal.show && (
        <div className="modal-overlay" onClick={() => setRenameModal({ show: false, sessionId: null, value: '' })}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-title">重命名对话</div>
            <input
              ref={renameInputRef}
              value={renameModal.value}
              onChange={(e) => setRenameModal(p => ({ ...p, value: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && confirmRename()}
              className="modal-input"
            />
            <div className="modal-actions">
              <button className="modal-btn secondary" onClick={() => setRenameModal({ show: false, sessionId: null, value: '' })}>取消</button>
              <button className="modal-btn primary" onClick={confirmRename}>确定</button>
            </div>
          </div>
        </div>
      )}

      {/* 删除弹窗 */}
      {deleteModal.show && (
        <div className="modal-overlay">
          <div className="modal-card center">
            <div className="modal-title">确定删除这段对话？</div>
            <div className="modal-desc">"{deleteModal.name}" 将被永久删除</div>
            <div className="modal-actions">
              <button className="modal-btn secondary" onClick={() => setDeleteModal({ show: false, sessionId: null, name: '' })}>取消</button>
              <button className="modal-btn primary" onClick={confirmDelete}>确定</button>
            </div>
          </div>
        </div>
      )}

      {/* 设置弹窗 */}
      {showSetting && (
        <div className="modal-overlay">
          <div className="modal-card wide">
            <h3 className="modal-title">全局设置</h3>

            <div className="setting-group">
              <label className="setting-label">外观</label>
              <div className="theme-pills">
                {THEMES.map(t => (
                  <button
                    key={t}
                    className={`theme-pill ${theme === t ? 'active' : ''}`}
                    onClick={() => setTheme(t)}
                  >
                    {THEME_LABELS[t]}
                  </button>
                ))}
              </div>
            </div>

            <div className="setting-group">
              <label className="setting-label">系统人设提示词</label>
              <textarea
                className="modal-textarea"
                value={config.system_prompt}
                onChange={(e) => setConfig(p => ({ ...p, system_prompt: e.target.value }))}
                rows={3}
              />
            </div>

            <div className="setting-group">
              <label className="setting-label">Temperature（随机性）</label>
              <input
                className="modal-input"
                type="number" step="0.1" min="0" max="1.5"
                value={config.temperature}
                onChange={(e) => setConfig(p => ({ ...p, temperature: Number(e.target.value) }))}
              />
            </div>

            <div className="setting-group">
              <label className="setting-label">记忆压缩阈值 token</label>
              <input
                className="modal-input"
                type="number"
                value={config.compress_threshold}
                onChange={(e) => setConfig(p => ({ ...p, compress_threshold: Number(e.target.value) }))}
              />
            </div>

            <div className="setting-group">
              <label className="setting-label">压缩后保留回合数</label>
              <input
                className="modal-input"
                type="number"
                value={config.compress_keep_rounds}
                onChange={(e) => setConfig(p => ({ ...p, compress_keep_rounds: Number(e.target.value) }))}
              />
            </div>

            <div className="modal-actions right">
              <button className="modal-btn secondary" onClick={() => setShowSetting(false)}>取消</button>
              <button className="modal-btn primary" onClick={saveSettings}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ChatPage
