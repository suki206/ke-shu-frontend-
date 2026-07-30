import { useState, useEffect, useRef } from 'react'
import axios from 'axios'

const API_BASE = import.meta.env.DEV
  ? 'http://localhost:3000/api'
  : import.meta.env.VITE_BACKEND_URL + '/api'

const ChatPage = () => {
  const [sessionList, setSessionList] = useState([])
  const [activeSessionId, setActiveSessionId] = useState(null)
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(false)
  const [showSetting, setShowSetting] = useState(false)
  const [config, setConfig] = useState({
    system_prompt: '你是温柔贴心的AI伴侣，简短自然回复',
    temperature: 0.7,
    compress_threshold: 3000,
    compress_keep_rounds: 4
  })
  const messageBoxRef = useRef(null)

  // 加载更早历史相关状态
  const [archivedList, setArchivedList] = useState([])
  const [hasOlderArchive, setHasOlderArchive] = useState(false)
  const [archiveCursor, setArchiveCursor] = useState(null)

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
    // 新建会话清空展开的归档历史
    setArchivedList([])
    setHasOlderArchive(false)
    setArchiveCursor(null)
  }

  const switchSession = async (sid) => {
    setActiveSessionId(sid)
    const res = await axios.get(`${API_BASE}/messages/${sid}`)
    setMessages(res.data)
    // 切换会话清空已加载归档历史
    setArchivedList([])
    setHasOlderArchive(false)
    setArchiveCursor(null)

    // 判断是否存在归档消息，控制按钮显示
    const archiveRes = await axios.get(`${API_BASE}/messages/archived/${sid}?limit=1`)
    if (archiveRes.data.list.length > 0) {
      setHasOlderArchive(true)
    }
  }

  // 【最终修复版】加载归档历史，后端已排好旧→新，无需反转
  const loadOlderArchive = async () => {
    const params = new URLSearchParams()
    if (archiveCursor) params.append('cursor', archiveCursor)
    params.append('limit', '6')
    const res = await axios.get(`${API_BASE}/messages/archived/${activeSessionId}?${params.toString()}`)
    const { list, hasMore } = res.data

    if (list.length > 0) {
      // 新获取的更早对话放在归档列表最顶部
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

    // 临时气泡仅占位，不持久存列表避免计数重复
    const tempUserMsg = { role: 'user', content, created_at: new Date() }
    setMessages(prev => [...prev, tempUserMsg])
    scrollBottom()

    try {
      const res = await axios.post(`${API_BASE}/chat`, {
        sessionId: activeSessionId,
        content
      })
      const aiMsg = {
        role: 'assistant',
        content: res.data.reply,
        created_at: new Date()
      }
      // 请求完成后重新拉取数据库真实消息，彻底消除重复计数
      const freshMsgRes = await axios.get(`${API_BASE}/messages/${activeSessionId}`)
      setMessages(freshMsgRes.data)

      // 发送消息后重新检测是否存在归档历史
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

  // 时间格式化，兼容后端返回的created_at
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

  // 渲染单条消息组件
  const renderMsgItem = (msg, key) => (
    <div key={key} style={{ marginBottom: 18 }}>
      <div style={{ maxWidth: '65%', padding: '12px', borderRadius: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', background: msg.role === 'user' ? '#39304b' : '#242433', marginLeft: msg.role === 'user' ? 'auto' : 0 }}>
        <div>{msg.content}</div>
        <div style={{ fontSize: 11, marginTop: '6px', color: '#aaa', textAlign: msg.role === 'user' ? 'right' : 'left' }}>
          {formatTime(msg.created_at)}
        </div>
      </div>
    </div>
  )

  return (
    <div style={{ display: 'flex', height: '100vh', background: '#0f0f12', color: '#eee' }}>
      <div style={{ width: 260, background: '#17171f', padding: '16px', display: 'flex', flexDirection: 'column' }}>
        <button onClick={createSession} style={{ padding: '10px', background: '#725688', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', marginBottom: 12 }}>
          + 新建对话
        </button>
        <button onClick={() => setShowSetting(true)} style={{ padding: '8px', background: '#2a2a38', border: 'none', borderRadius: 8, color: '#ddd', cursor: 'pointer', marginBottom: 16 }}>
          ⚙ 全局设置
        </button>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {sessionList.map(item => (
            <div
              key={item.id}
              style={{ padding: '10px', borderRadius: 6, background: activeSessionId === item.id ? '#2c2c3d' : 'transparent', cursor: 'pointer', marginBottom: 6, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
              onClick={() => switchSession(item.id)}
            >
              <span style={{ fontSize: 14 }}>{item.title}</span>
              <div>
                <button onClick={(e) => { e.stopPropagation(); const name = prompt('输入新名称', item.title); if (name) renameSession(item.id, name) }} style={{ background: 'transparent', border: 'none', color: '#aaa', cursor: 'pointer' }}>✏</button>
                <button onClick={(e) => { e.stopPropagation(); if (window.confirm('确定删除会话？所有消息和记忆一并清除')) deleteSession(item.id) }} style={{ background: 'transparent', border: 'none', color: '#aaa', cursor: 'pointer' }}>🗑</button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
        <div ref={messageBoxRef} style={{ flex: 1, padding: '24px', overflowY: 'auto' }}>
          {!activeSessionId ? (
            <div style={{ textAlign: 'center', marginTop: 120, color: '#999' }}>请选择或者新建对话</div>
          ) : (
            <>
              {/* 加载更早历史按钮 */}
              {hasOlderArchive && (
                <div style={{ textAlign: "center", padding: "12px 0", color: "#999" }}>
                  <span onClick={loadOlderArchive} style={{ cursor: "pointer" }}>
                    点击加载更早的历史记录
                  </span>
                </div>
              )}

              {/* 已加载的归档历史消息（最古老对话，从上至下时间由旧到新） */}
              {archivedList.map((msg, idx) => renderMsgItem(msg, `arch-${idx}`))}

              {/* 当前正常可见最新消息 */}
              {messages.map((msg, idx) => renderMsgItem(msg, `live-${idx}`))}

              {loading && <div style={{ color: '#aaa' }}>正在回复中...</div>}
            </>
          )}
        </div>

        <div style={{ padding: '16px', borderTop: '1px solid #252530', display: 'flex', gap: '10px' }}>
          <textarea
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.ctrlKey && e.key === 'Enter' && sendMessage()}
            style={{ flex: 1, padding: '12px', background: '#191926', border: '1px solid #333', borderRadius: 8, color: '#eee', resize: 'none' }}
            rows={3}
          />
          <button onClick={sendMessage} disabled={loading || !activeSessionId} style={{ padding: '0 22px', background: '#725688', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer' }}>
            发送
          </button>
        </div>
      </div>

      {showSetting && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ width: 520, background: '#17171f', padding: '24px', borderRadius: 12 }}>
            <h3 style={{ marginTop: 0 }}>全局AI配置</h3>
            <div style={{ marginBottom: '12px' }}>
              <label>系统人设提示词</label>
              <textarea
                value={config.system_prompt}
                onChange={(e) => setConfig(p => ({ ...p, system_prompt: e.target.value }))}
                style={{ width: '100%', marginTop: '4px', padding: '8px', background: '#101018', color: '#fff' }}
                rows={4}
              />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label>Temperature（随机性）</label>
              <input
                type="number" step="0.1" min="0" max="1.5"
                value={config.temperature}
                onChange={(e) => setConfig(p => ({ ...p, temperature: Number(e.target.value) }))}
                style={{ width: '100%', padding: '8px', background: '#101018', color: '#fff' }}
              />
            </div>
            <div style={{ marginBottom: '12px' }}>
              <label>记忆压缩阈值token</label>
              <input
                type="number"
                value={config.compress_threshold}
                onChange={(e) => setConfig(p => ({ ...p, compress_threshold: Number(e.target.value) }))}
                style={{ width: '100%', padding: '8px', background: '#101018', color: '#fff' }}
              />
            </div>
            <div style={{ marginBottom: '16px' }}>
              <label>压缩后保留回合数</label>
              <input
                type="number"
                value={config.compress_keep_rounds}
                onChange={(e) => setConfig(p => ({ ...p, compress_keep_rounds: Number(e.target.value) }))}
                style={{ width: '100%', padding: '8px', background: '#101018', color: '#fff' }}
              />
            </div>
            <div style={{ display: 'flex', gap: '12px', justifyContent: 'flex-end' }}>
              <button onClick={() => setShowSetting(false)} style={{ padding: '8px 16px', background: '#333', border: 'none', color: '#fff', borderRadius: 6 }}>取消</button>
              <button onClick={saveSettings} style={{ padding: '8px 16px', background: '#725688', border: 'none', color: '#fff', borderRadius: 6 }}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ChatPage
