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
  // 【2026-08-12 bug 修复】上面这个初始值只在组件**第一次挂载**时取一次。
  // 而茧星的数据是异步拉回来的（onFetchCocoon），页面往往先挂载、
  // shuLimit 才到；也可能在别的地方被改过。结果是输入框一直显示兜底的
  // 20，跟右上角真实的"12 / 35"对不上，更糟的是这时候点一下保存，
  // 会拿这个假的 20 把真实上限覆盖掉。这里跟着已保存的值同步一次——
  // 只依赖 shuLimit，打字期间它不会变，所以不会把正在输入的数字冲掉。
  useEffect(() => { setLimitDraft(String(shuLimit ?? 20)) }, [shuLimit])
  const saveLimit = () => {
    const n = Math.max(1, Math.floor(Number(limitDraft) || 0))
    setLimitDraft(String(n))
    onSaveLimit?.(n)
    showToast?.('已保存')
  }

  const shuCount = shuEntries.length
  const shuFull = shuLimit != null && shuCount >= shuLimit

  // ── 这段守则每轮要占多少 token ────────────────────────────────
  // 柯问过"茧星是每轮都灌进去多花 token，还是像人格设定那样"。答案是
  // 两者其实是**同一件事**：模型没有跨请求的记忆，人格设定同样每一轮
  // 都要原样重发一遍，茧星和它花的是同一种钱。所以与其藏着，不如把
  // 数字直接摆出来——删几条、加几条，这里立刻跟着变，贵不贵一眼看得见。
  // 估法跟后端 estimateToken 一致：汉字按 0.7、其余按 4 字符 1 token。
  // 注：这段落在提示词最前面的静态区，命中前缀缓存后实际只按约一折
  // 计费，所以真实成本比这个数还低不少。
  const estTokens = (() => {
    const text = [...keEntries, ...shuEntries].map(i => i.content || '').join('')
    const cjk = (text.match(/[\u3400-\u9FFF]/g) || []).length
    // 120 是那段固定说明文字（怎么写入、这是守则不是资料）的大致开销
    return Math.ceil(cjk * 0.7 + (text.length - cjk) / 4) + 120
  })()

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
            <div className="cocoon-page-eyebrow">枢对自己的守则，外层是你写的丝，内芯是他自己吐的丝</div>

            {/* 每轮固定开销：见上面 estTokens 那段注释 */}
            <div className="cocoon-budget">
              <span className="cocoon-budget-label">这些守则每轮对话都会带给他</span>
              <span className="cocoon-budget-num">≈ {estTokens} token</span>
            </div>

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
