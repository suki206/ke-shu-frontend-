import { useState, useEffect } from 'react'

// ============================================================
// 茧星 · COCOON —— 枢的自我记忆，全屏子页（与回声/信标/数据罗盘同款）
// 跟"星尘"不是一回事：星尘记的是柯和你们之间发生过的事情，茧星记的
// 是"枢自己是谁、在想什么"，独立成一套更小的存储。
// 外层丝（柯写的）：自由添加，没有条数上限，随时能删。
// 内芯（枢写的）：只能通过聊天里枢自己主动带的标记写入（见 server.js
// 的 COCOON_MARK/runAssistantStream），这里不提供手动新增——枢写的
// 内容只能删、不能改，改了就不是"枢自己写的"了。条数上限由柯在这里
// 设置，本地先改草稿、点保存才真正生效（跟"回声"人格/温度那块同一
// 套"草稿/已保存"逻辑，避免半路改了数字却没点保存就当真生效）。
// 满了之后后端会拒绝新写入，通过 SSE 的 cocoonFull 事件提示，在
// ChatPage 里接住转成 toast，这个页面本身不需要处理那个事件。
// ============================================================

const BackIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 18l-6-6 6-6" />
  </svg>
)

const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/>
  </svg>
)

const PlusIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
)

const CocoonPage = ({ keEntries = [], shuEntries = [], shuLimit, loading, onAddKe, onDelete, onSaveLimit, showToast, onClose }) => {
  // 打开期间收起底部导航——跟回声同一个根因同一个做法，见 App.css
  // 里 .cocoon-open .bottom-nav 那条规则的注释
  useEffect(() => {
    document.documentElement.classList.add('cocoon-open')
    return () => document.documentElement.classList.remove('cocoon-open')
  }, [])

  // 外层丝：新增用的输入框，本地状态，提交后清空
  const [keDraft, setKeDraft] = useState('')
  const submitKe = () => {
    const text = keDraft.trim()
    if (!text) return
    onAddKe?.(text)
    setKeDraft('')
  }

  // 内芯上限：本地草稿，点"保存"才真正生效——跟回声人格/温度那块
  // 同一套逻辑，避免改了数字没点保存却已经在别处显示成新值
  const [limitDraft, setLimitDraft] = useState(String(shuLimit ?? 20))
  const saveLimit = () => {
    const n = Math.max(1, Math.floor(Number(limitDraft) || 0))
    setLimitDraft(String(n))
    onSaveLimit?.(n)
    showToast?.('已保存')
  }

  const shuCount = shuEntries.length
  const shuFull = shuLimit != null && shuCount >= shuLimit

  return (
    <div className="cocoon-page">
      <div className="gravity-nebula" aria-hidden="true">
        <span className="gravity-nebula-layer l1" />
        <span className="gravity-nebula-layer l2" />
        <span className="gravity-nebula-layer l3" />
      </div>

      <div className="cocoon-page-header">
        <button className="cocoon-page-iconbtn" onClick={onClose} aria-label="返回">
          <BackIcon />
        </button>
        <div className="cocoon-page-title">COCOON · 茧星</div>
        <span className="cocoon-page-header-spacer" />
      </div>

      <div className="cocoon-page-body">
        {loading && keEntries.length === 0 && shuEntries.length === 0 ? (
          <div className="empty-seat">
            <div className="breath-dot" />
            <div className="empty-seat-label">正在展开丝线…</div>
          </div>
        ) : (
          <div className="cocoon-page-content">
            <div className="cocoon-page-eyebrow">枢对自己的记忆，外层是你写的丝，内芯是他自己吐的丝</div>

            {/* 外层丝 · 柯写的 */}
            <div className="cocoon-section">
              <div className="cocoon-section-label">外层丝 · 柯写的</div>
              <div className="cocoon-add-row">
                <input
                  className="field-input" placeholder="写一件关于枢的事…"
                  value={keDraft}
                  onChange={e => setKeDraft(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && submitKe()}
                />
                <button className="cocoon-add-btn" onClick={submitKe} aria-label="添加">
                  <PlusIcon />
                </button>
              </div>
              {keEntries.length === 0 ? (
                <div className="sensitivity-hint" style={{ marginTop: 10 }}>还没有写下什么</div>
              ) : (
                <div className="cocoon-list">
                  {keEntries.map(item => (
                    <div key={item.id} className="cocoon-item">
                      <div className="cocoon-item-content">{item.content}</div>
                      <button className="cocoon-item-delete" onClick={() => onDelete?.(item.id)} aria-label="删除">
                        <TrashIcon />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 内芯 · 枢写的 */}
            <div className="cocoon-section">
              <div className="cocoon-section-head">
                <div className="cocoon-section-label">内芯 · 枢写的</div>
                <div className={`cocoon-count${shuFull ? ' is-full' : ''}`}>{shuCount} / {shuLimit ?? '—'}</div>
              </div>
              <div className="sensitivity-hint">只能删除，不能修改——这样才还是他自己写的。聊天时如果他觉得有什么值得记住自己的事，会自己写进来</div>

              <div className="cocoon-limit-row">
                <span className="cocoon-limit-label">上限</span>
                <input
                  className="field-input" type="number" min="1"
                  value={limitDraft}
                  onChange={e => setLimitDraft(e.target.value)}
                  style={{ width: 72 }}
                />
                <button onClick={saveLimit} className="line-btn" style={{ padding: '8px 14px', borderRadius: '10px', fontSize: '11px' }}>保存</button>
              </div>
              {shuFull && <div className="sensitivity-hint">已经满了——枢再想记新的事，会被跳过并提示你，除非先删掉几条旧的</div>}

              {shuEntries.length === 0 ? (
                <div className="sensitivity-hint" style={{ marginTop: 10 }}>枢还没主动记下什么</div>
              ) : (
                <div className="cocoon-list">
                  {shuEntries.map(item => (
                    <div key={item.id} className="cocoon-item is-shu">
                      <div className="cocoon-item-content">{item.content}</div>
                      <button className="cocoon-item-delete" onClick={() => onDelete?.(item.id)} aria-label="删除">
                        <TrashIcon />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default CocoonPage
