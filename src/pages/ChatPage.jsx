import { useState, useEffect, useRef } from 'react'
import axios from 'axios'

const API_BASE = import.meta.env.DEV
  ? 'http://localhost:3000/api'
  : 'https://ke-shu-backend.onrender.com/api'

// ========== 小鲸鱼桌宠组件 ==========
const WhalePet = () => {
  const [bubbles, setBubbles] = useState([])
  const [isWiggling, setIsWiggling] = useState(false)

  const handleClick = () => {
    setIsWiggling(true)
    const id = Date.now()
    setBubbles(prev => [...prev, { id, x: Math.random() * 40 - 20 }])
    setTimeout(() => setIsWiggling(false), 600)
    setTimeout(() => {
      setBubbles(prev => prev.filter(b => b.id !== id))
    }, 2000)
  }

  return (
    <div 
      className={`whale-container ${isWiggling ? 'wiggle' : ''}`}
      onClick={handleClick}
      style={{
        position: 'fixed',
        bottom: '100px',
        right: '20px',
        zIndex: 100,
        cursor: 'pointer',
        fontSize: '48px',
        userSelect: 'none',
        filter: 'drop-shadow(0 4px 12px rgba(59, 130, 246, 0.3))',
        transition: 'transform 0.3s ease'
      }}
    >
      <span role="img" aria-label="whale">🐳</span>
      {bubbles.map(b => (
        <span
          key={b.id}
          style={{
            position: 'absolute',
            bottom: '40px',
            left: `calc(50% + ${b.x}px)`,
            fontSize: '16px',
            animation: 'bubbleFloat 2s ease-out forwards',
            pointerEvents: 'none'
          }}
        >
          🫧
        </span>
      ))}
    </div>
  )
}

// ========== 开屏页 ==========
const SplashScreen = ({ onEnter }) => {
  const [visible, setVisible] = useState(true)
  const [fadeOut, setFadeOut] = useState(false)

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
      className={`splash-screen ${fadeOut ? 'fade-out' : ''}`}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        background: 'linear-gradient(135deg, #faf8f5 0%, #f5f0eb 50%, #faf8f5 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
        transition: 'opacity 0.8s ease, transform 0.8s ease',
        opacity: fadeOut ? 0 : 1,
        transform: fadeOut ? 'scale(1.05)' : 'scale(1)'
      }}
    >
      <div style={{ fontSize: '64px', marginBottom: '24px', animation: 'gentleFloat 3s ease-in-out infinite' }}>
        🐳
      </div>
      <h1 style={{
        fontFamily: '"Georgia", "Times New Roman", serif',
        fontSize: '28px',
        fontWeight: 400,
        color: '#5a4a42',
        letterSpacing: '2px',
        marginBottom: '8px'
      }}>
        Tell me everything
      </h1>
      <p style={{
        fontFamily: '"Georgia", serif',
        fontSize: '14px',
        color: '#a09088',
        fontStyle: 'italic',
        marginBottom: '40px'
      }}>
        I'm here, always
      </p>
      <button
        onClick={handleClick}
        style={{
          padding: '12px 36px',
          borderRadius: '24px',
          border: '1px solid #d4c4b8',
          background: 'rgba(255,255,255,0.6)',
          backdropFilter: 'blur(10px)',
          color: '#8a7a72',
          fontSize: '14px',
          cursor: 'pointer',
          fontFamily: '"Georgia", serif',
          letterSpacing: '1px',
          transition: 'all 0.3s ease',
          boxShadow: '0 2px 12px rgba(0,0,0,0.06)'
        }}
        onMouseEnter={e => {
          e.target.style.background = 'rgba(255,255,255,0.9)'
          e.target.style.transform = 'translateY(-2px)'
          e.target.style.boxShadow = '0 4px 20px rgba(0,0,0,0.1)'
        }}
        onMouseLeave={e => {
          e.target.style.background = 'rgba(255,255,255,0.6)'
          e.target.style.transform = 'translateY(0)'
          e.target.style.boxShadow = '0 2px 12px rgba(0,0,0,0.06)'
        }}
      >
        Begin
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
  const [activeSessionId, setActiveSessionId] = useState(null)
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(false)
  const [showSetting, setShowSetting] = useState(false)
  const [showSidebar, setShowSidebar] = useState(false)
  const [activeTab, setActiveTab] = useState('chat')
  const [config, setConfig] = useState({
    system_prompt: '你是温柔贴心的AI伴侣，简短自然回复',
    temperature: 0.7,
    compress_threshold: 3000,
    compress_keep_rounds: 4
  })
  const [archivedList, setArchivedList] = useState([])
  const [hasOlderArchive, setHasOlderArchive] = useState(false)
  const [archiveCursor, setArchiveCursor] = useState(null)
  const messageBoxRef = useRef(null)

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
    const res = await axios.get(`${API_BASE}/sessions`)
    setSessionList(res.data)
  }

  const createSession = async () => {
    const res = await axios.post(`${API_BASE}/session/new`)
    setSessionList(prev => [res.data, ...prev])
    setActiveSessionId(res.data.id)
    setMessages([])
    setArchivedList([])
    setHasOlderArchive(false)
    setArchiveCursor(null)
    setShowSidebar(false)
  }

  const switchSession = async (sid) => {
    setActiveSessionId(sid)
    const res = await axios.get(`${API_BASE}/messages/${sid}`)
    setMessages(res.data)
    setArchivedList([])
    setHasOlderArchive(false)
    setArchiveCursor(null)
    const archiveRes = await axios.get(`${API_BASE}/messages/archived/${sid}?limit=1`)
    if (archiveRes.data.list.length > 0) {
      setHasOlderArchive(true)
    }
    setShowSidebar(false)
  }

  const loadOlderArchive = async () => {
    const params = new URLSearchParams()
    if (archiveCursor) params.append('cursor', archiveCursor)
    params.append('limit', '6')
    const res = await axios.get(`${API_BASE}/messages/archived/${activeSessionId}?${params.toString()}`)
    const { list, hasMore } = res.data
    if (list.length > 0) {
      setArchivedList([...list, ...archivedList])
      setArchiveCursor(list[0].id)
    }
    setHasOlderArchive(hasMore)
  }

  const renameSession = async (sid, newTitle) => {
    await axios.put(`${API_BASE}/session/${sid}`, { title: newTitle })
    fetchSessions()
  }

  const deleteSession = async (sid) => {
    await axios.delete(`${API_BASE}/session/${sid}`)
    fetchSessions()
    if (activeSessionId === sid) {
      setActiveSessionId(null)
      setMessages([])
      setArchivedList([])
      setHasOlderArchive(false)
      setArchiveCursor(null)
    }
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
      const freshMsgRes = await axios.get(`${API_BASE}/messages/${activeSessionId}`)
      setMessages(freshMsgRes.data)
      const archiveRes = await axios.get(`${API_BASE}/messages/archived/${activeSessionId}?limit=1`)
      setHasOlderArchive(archiveRes.data.list.length > 0)
    } catch (err) {
      alert('请求失败：' + err.message)
    }
    setLoading(false)
    scrollBottom()
  }

  const getSettings = async () => {
    const res = await axios.get(`${API_BASE}/settings`)
    setConfig(res.data)
  }

  const saveSettings = async () => {
    await axios.post(`${API_BASE}/settings`, config)
    setShowSetting(false)
    alert('配置已保存')
  }

  useEffect(() => {
    fetchSessions()
    getSettings()
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

  // 按日期分组消息
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
    <div key={key} style={{ 
      display: 'flex', 
      justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
      marginBottom: '16px',
      padding: '0 16px'
    }}>
      <div style={{ 
        maxWidth: '75%', 
        display: 'flex',
        flexDirection: msg.role === 'user' ? 'row-reverse' : 'row',
        alignItems: 'flex-end',
        gap: '8px'
      }}>
        {/* 头像 */}
        <div style={{
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          background: msg.role === 'user' ? 'linear-gradient(135deg, #e8ddd5, #d4c4b8)' : 'linear-gradient(135deg, #a8c8ec, #7eb8da)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '14px',
          flexShrink: 0,
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
        }}>
          {msg.role === 'user' ? '👤' : '🐳'}
        </div>

        {/* 气泡 */}
        <div style={{ 
          padding: '12px 16px', 
          borderRadius: msg.role === 'user' ? '20px 20px 4px 20px' : '20px 20px 20px 4px', 
          whiteSpace: 'pre-wrap', 
          wordBreak: 'break-word', 
          background: msg.role === 'user' 
            ? 'linear-gradient(135deg, #f5e6dc, #f0ddd0)' 
            : 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(10px)',
          color: msg.role === 'user' ? '#5a4a42' : '#4a4a4a',
          fontSize: '14px',
          lineHeight: '1.7',
          boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
          border: msg.role === 'user' ? '1px solid rgba(212,196,184,0.3)' : '1px solid rgba(0,0,0,0.04)'
        }}>
          <div>{msg.content}</div>
          <div style={{ fontSize: '11px', marginTop: '6px', color: '#b0a090', textAlign: 'right' }}>
            {formatTime(msg.created_at)}
          </div>
        </div>
      </div>
    </div>
  )

  const groupedMessages = groupMessagesByDate(messages)

  return (
    <div style={{ 
      display: 'flex', 
      height: '100vh', 
      background: 'linear-gradient(135deg, #faf8f5 0%, #f5f0eb 50%, #faf8f5 100%)',
      color: '#5a4a42',
      fontFamily: '"Georgia", "Times New Roman", "PingFang SC", "Microsoft YaHei", serif',
      overflow: 'hidden',
      position: 'relative'
    }}>
      {/* 开屏页 */}
      {showSplash && <SplashScreen onEnter={handleSplashEnter} />}

      {/* 侧边栏遮罩 */}
      {showSidebar && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.2)',
            backdropFilter: 'blur(4px)',
            zIndex: 200,
            animation: 'fadeIn 0.3s ease'
          }}
          onClick={() => setShowSidebar(false)}
        />
      )}

      {/* 左侧抽屉 */}
      <div style={{
        position: 'fixed',
        top: 0,
        left: showSidebar ? 0 : '-320px',
        width: '280px',
        height: '100vh',
        background: 'rgba(255,255,255,0.92)',
        backdropFilter: 'blur(20px)',
        zIndex: 300,
        transition: 'left 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: showSidebar ? '4px 0 24px rgba(0,0,0,0.1)' : 'none',
        borderRight: '1px solid rgba(0,0,0,0.04)'
      }}>
        <div style={{ padding: '24px 20px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px' }}>
            <span style={{ fontSize: '28px' }}>🐳</span>
            <span style={{ fontSize: '18px', fontWeight: 400, letterSpacing: '1px' }}>可树</span>
          </div>

          <button 
            onClick={createSession}
            style={{ 
              width: '100%',
              padding: '12px', 
              background: 'linear-gradient(135deg, #f5e6dc, #f0ddd0)', 
              border: '1px solid rgba(212,196,184,0.4)', 
              borderRadius: '16px', 
              color: '#5a4a42', 
              cursor: 'pointer', 
              marginBottom: '16px',
              fontSize: '14px',
              fontFamily: 'inherit',
              letterSpacing: '1px',
              transition: 'all 0.3s ease',
              boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
            }}
            onMouseEnter={e => {
              e.target.style.transform = 'translateY(-1px)'
              e.target.style.boxShadow = '0 4px 16px rgba(0,0,0,0.08)'
            }}
            onMouseLeave={e => {
              e.target.style.transform = 'translateY(0)'
              e.target.style.boxShadow = '0 2px 8px rgba(0,0,0,0.04)'
            }}
          >
            + 新建对话
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '0 16px' }}>
          <div style={{ fontSize: '11px', color: '#b0a090', marginBottom: '8px', paddingLeft: '4px', letterSpacing: '1px' }}>
            最近对话
          </div>
          {sessionList.map(item => (
            <div
              key={item.id}
              style={{ 
                padding: '12px 14px', 
                borderRadius: '14px', 
                background: activeSessionId === item.id ? 'rgba(245,230,220,0.6)' : 'transparent', 
                cursor: 'pointer', 
                marginBottom: '6px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                transition: 'all 0.2s ease',
                border: activeSessionId === item.id ? '1px solid rgba(212,196,184,0.3)' : '1px solid transparent'
              }}
              onClick={() => switchSession(item.id)}
              onMouseEnter={e => {
                if (activeSessionId !== item.id) {
                  e.target.style.background = 'rgba(0,0,0,0.02)'
                }
              }}
              onMouseLeave={e => {
                if (activeSessionId !== item.id) {
                  e.target.style.background = 'transparent'
                }
              }}
            >
              <span style={{ fontSize: '13px', color: '#5a4a42' }}>{item.title}</span>
              <div style={{ display: 'flex', gap: '4px' }}>
                <button 
                  onClick={(e) => { e.stopPropagation(); const name = prompt('输入新名称', item.title); if (name) renameSession(item.id, name) }} 
                  style={{ background: 'transparent', border: 'none', color: '#c0b0a0', cursor: 'pointer', fontSize: '12px', padding: '2px 4px' }}
                >✏</button>
                <button 
                  onClick={(e) => { e.stopPropagation(); if (window.confirm('确定删除会话？')) deleteSession(item.id) }} 
                  style={{ background: 'transparent', border: 'none', color: '#c0b0a0', cursor: 'pointer', fontSize: '12px', padding: '2px 4px' }}
                >🗑</button>
              </div>
            </div>
          ))}
        </div>

        <div style={{ padding: '16px', borderTop: '1px solid rgba(0,0,0,0.04)' }}>
          <button 
            onClick={() => { setShowSidebar(false); setShowSetting(true) }}
            style={{ 
              width: '100%',
              padding: '10px', 
              background: 'transparent', 
              border: '1px solid rgba(0,0,0,0.08)', 
              borderRadius: '12px', 
              color: '#8a7a72', 
              cursor: 'pointer',
              fontSize: '13px',
              fontFamily: 'inherit'
            }}
          >
            ⚙ 全局设置
          </button>
        </div>
      </div>

      {/* 主内容区 */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        {/* 顶部导航 */}
        <div style={{ 
          padding: '12px 20px', 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          borderBottom: '1px solid rgba(0,0,0,0.04)'
        }}>
          <button 
            onClick={() => setShowSidebar(true)}
            style={{ background: 'transparent', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#8a7a72' }}
          >
            ☰
          </button>
          <div style={{ fontSize: '15px', color: '#8a7a72', letterSpacing: '1px' }}>
            {activeSessionId ? '对话中' : '可树'}
          </div>
          <div style={{ width: '24px' }} />
        </div>

        {/* 消息区域 */}
        <div 
          ref={messageBoxRef} 
          style={{ 
            flex: 1, 
            overflowY: 'auto',
            padding: '16px 0'
          }}
        >
          {!activeSessionId ? (
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column',
              alignItems: 'center', 
              justifyContent: 'center',
              height: '100%',
              color: '#c0b0a0'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '16px', opacity: 0.6 }}>🐳</div>
              <div style={{ fontSize: '16px', fontStyle: 'italic' }}>选择或新建一个对话</div>
            </div>
          ) : (
            <>
              {hasOlderArchive && (
                <div style={{ textAlign: 'center', padding: '16px 0', color: '#c0b0a0', fontSize: '12px' }}>
                  <span 
                    onClick={loadOlderArchive} 
                    style={{ cursor: 'pointer', padding: '8px 16px', borderRadius: '12px', background: 'rgba(0,0,0,0.02)' }}
                  >
                    ↑ 加载更早的历史
                  </span>
                </div>
              )}

              {archivedList.map((msg, idx) => renderMsgItem(msg, `arch-${idx}`))}

              {Object.entries(groupedMessages).map(([date, msgs]) => (
                <div key={date}>
                  <div style={{ textAlign: 'center', margin: '20px 0 12px' }}>
                    <span style={{ 
                      fontSize: '11px', 
                      color: '#c0b0a0', 
                      background: 'rgba(0,0,0,0.03)', 
                      padding: '4px 14px', 
                      borderRadius: '10px',
                      letterSpacing: '1px'
                    }}>
                      {date}
                    </span>
                  </div>
                  {msgs.map((msg, idx) => renderMsgItem(msg, `live-${idx}`))}
                </div>
              ))}

              {loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '0 20px', color: '#b0a090', fontSize: '13px' }}>
                  <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'linear-gradient(135deg, #a8c8ec, #7eb8da)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px' }}>
                    🐳
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <span style={{ animation: 'dotPulse 1.4s ease-in-out infinite', animationDelay: '0s' }}>.</span>
                    <span style={{ animation: 'dotPulse 1.4s ease-in-out infinite', animationDelay: '0.2s' }}>.</span>
                    <span style={{ animation: 'dotPulse 1.4s ease-in-out infinite', animationDelay: '0.4s' }}>.</span>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* 输入区域 */}
        <div style={{ 
          padding: '12px 20px 20px', 
          borderTop: '1px solid rgba(0,0,0,0.04)',
          background: 'rgba(255,255,255,0.6)',
          backdropFilter: 'blur(10px)'
        }}>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'flex-end' }}>
            <textarea
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.ctrlKey && e.key === 'Enter' && sendMessage()}
              placeholder="Tell me everything..."
              style={{ 
                flex: 1, 
                padding: '12px 16px', 
                background: 'rgba(255,255,255,0.8)', 
                border: '1px solid rgba(212,196,184,0.3)', 
                borderRadius: '20px', 
                color: '#5a4a42', 
                resize: 'none',
                fontFamily: 'inherit',
                fontSize: '14px',
                outline: 'none',
                lineHeight: '1.5',
                boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
              }}
              rows={2}
            />
            <button 
              onClick={sendMessage} 
              disabled={loading || !activeSessionId}
              style={{ 
                padding: '12px 20px', 
                background: 'linear-gradient(135deg, #f5e6dc, #f0ddd0)', 
                border: '1px solid rgba(212,196,184,0.4)', 
                borderRadius: '20px', 
                color: '#5a4a42', 
                cursor: loading || !activeSessionId ? 'not-allowed' : 'pointer',
                fontSize: '14px',
                fontFamily: 'inherit',
                opacity: loading || !activeSessionId ? 0.5 : 1,
                transition: 'all 0.3s ease',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
              }}
            >
              发送
            </button>
          </div>
        </div>
      </div>

      {/* 小鲸鱼桌宠 */}
      <WhalePet />

      {/* 设置弹窗 */}
      {showSetting && (
        <div style={{ 
          position: 'fixed', 
          top: 0, 
          left: 0, 
          width: '100vw', 
          height: '100vh', 
          background: 'rgba(0,0,0,0.2)', 
          backdropFilter: 'blur(8px)',
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'center',
          zIndex: 400
        }}>
          <div style={{ 
            width: '480px', 
            maxWidth: '90vw',
            background: 'rgba(255,255,255,0.95)', 
            padding: '28px', 
            borderRadius: '20px',
            backdropFilter: 'blur(20px)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.1)',
            border: '1px solid rgba(0,0,0,0.04)'
          }}>
            <h3 style={{ marginTop: 0, fontWeight: 400, fontSize: '18px', color: '#5a4a42', marginBottom: '20px' }}>
              全局AI配置
            </h3>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '13px', color: '#8a7a72', display: 'block', marginBottom: '6px' }}>系统人设提示词</label>
              <textarea
                value={config.system_prompt}
                onChange={(e) => setConfig(p => ({ ...p, system_prompt: e.target.value }))}
                style={{ 
                  width: '100%', 
                  padding: '10px 14px', 
                  background: 'rgba(0,0,0,0.02)', 
                  border: '1px solid rgba(0,0,0,0.06)', 
                  borderRadius: '12px',
                  color: '#5a4a42',
                  fontFamily: 'inherit',
                  fontSize: '13px',
                  outline: 'none'
                }}
                rows={3}
              />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '13px', color: '#8a7a72', display: 'block', marginBottom: '6px' }}>Temperature（随机性）</label>
              <input
                type="number" step="0.1" min="0" max="1.5"
                value={config.temperature}
                onChange={(e) => setConfig(p => ({ ...p, temperature: Number(e.target.value) }))}
                style={{ 
                  width: '100%', 
                  padding: '10px 14px', 
                  background: 'rgba(0,0,0,0.02)', 
                  border: '1px solid rgba(0,0,0,0.06)', 
                  borderRadius: '12px',
                  color: '#5a4a42',
                  fontFamily: 'inherit',
                  fontSize: '13px',
                  outline: 'none'
                }}
              />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ fontSize: '13px', color: '#8a7a72', display: 'block', marginBottom: '6px' }}>记忆压缩阈值token</label>
              <input
                type="number"
                value={config.compress_threshold}
                onChange={(e) => setConfig(p => ({ ...p, compress_threshold: Number(e.target.value) }))}
                style={{ 
                  width: '100%', 
                  padding: '10px 14px', 
                  background: 'rgba(0,0,0,0.02)', 
                  border: '1px solid rgba(0,0,0,0.06)', 
                  borderRadius: '12px',
                  color: '#5a4a42',
                  fontFamily: 'inherit',
                  fontSize: '13px',
                  outline: 'none'
                }}
              />
            </div>
            <div style={{ marginBottom: '18px' }}>
              <label style={{ fontSize: '13px', color: '#8a7a72', display: 'block', marginBottom: '6px' }}>压缩后保留回合数</label>
              <input
                type="number"
                value={config.compress_keep_rounds}
                onChange={(e) => setConfig(p => ({ ...p, compress_keep_rounds: Number(e.target.value) }))}
                style={{ 
                  width: '100%', 
                  padding: '10px 14px', 
                  background: 'rgba(0,0,0,0.02)', 
                  border: '1px solid rgba(0,0,0,0.06)', 
                  borderRadius: '12px',
                  color: '#5a4a42',
                  fontFamily: 'inherit',
                  fontSize: '13px',
                  outline: 'none'
                }}
              />
            </div>
            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button 
                onClick={() => setShowSetting(false)} 
                style={{ 
                  padding: '10px 18px', 
                  background: 'transparent', 
                  border: '1px solid rgba(0,0,0,0.1)', 
                  color: '#8a7a72', 
                  borderRadius: '12px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: '13px'
                }}
              >取消</button>
              <button 
                onClick={saveSettings} 
                style={{ 
                  padding: '10px 18px', 
                  background: 'linear-gradient(135deg, #f5e6dc, #f0ddd0)', 
                  border: '1px solid rgba(212,196,184,0.4)', 
                  color: '#5a4a42', 
                  borderRadius: '12px',
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  fontSize: '13px'
                }}
              >保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ChatPage
