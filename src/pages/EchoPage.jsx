import { useState, useEffect, useRef } from 'react'

// ============================================================
// 回声 · ECHO —— 引力页气态巨行星子页面，全屏跃迁（与数据罗盘/
// 信标同款）。人格 / 模型（提供商 + 已启用模型）/ Temperature
// 三块，各自成卡。
// 人格与 Temperature 沿用原本的交互——本地先改，点底部 SAVE 才落盘；
// 模型的选中 / 新增 / 删除维持原本"即改即存"，避免切完模型还要
// 多点一次保存、下一句话却用错了模型。
//
// 2026-08-11 改造记录：
// 之前"内置 DeepSeek · 无需填 key"是写死的一条，且后端真正发给 API
// 的模型名硬编码成了 deepseek-chat——这个名字 DeepSeek 官方已在
// 2026-07-24 15:59 UTC 下线，调用直接报错（官方文档：
// https://api-docs.deepseek.com/news/news260424/）。
// 现在把 MODEL 卡片拆成两层：
//   PROVIDERS·提供商——DeepSeek 变成一个普通条目，密钥可以直接在这
//     编辑（留空则退回服务器环境变量，兼容原来"不用填 key"的便利），
//     点"获取模型列表"通过 onDiscoverModels 这个 prop（一路从
//     ChatPage → GravityPage 传下来，实现在 ChatPage 的
//     discoverModels，跟 onFetchTokenStats/onCreateInkNote 那些是
//     同一种写法）请求该提供商官方的 /models 接口，勾选真实存在的
//     模型（如 deepseek-v4-flash / deepseek-v4-pro）。
//   已启用的模型——勾选后落进这里，交互跟原来完全一样：点选中、
//     垃圾桶删除、"即改即存"。
// 后端相应改动见 server.js 的 resolveModel() 与新增的
// /api/models/discover。
// ============================================================

const DEEPSEEK_PROVIDER_ID = 'deepseek'
const DEEPSEEK_DEFAULT_BASEURL = 'https://api.deepseek.com/chat/completions'
// 2026-08-11 新增：Anthropic 原生协议（Claude 官方 /v1/messages）——
// 跟 DeepSeek/Moonshot/Qwen/GLM 那套 OpenAI 兼容协议不是一回事，
// 请求/返回的形状完全不同，后端 server.js 的 buildChatRequest /
// parseChatCompletion / parseStreamEvent 三个函数按 protocol 字段分流。
// 这里只是给"新增提供商"表单一个方便的默认地址，选了 Anthropic 原生
// 且没自己填地址时用这个兜底。
const ANTHROPIC_DEFAULT_BASEURL = 'https://api.anthropic.com/v1/messages'

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

const EchoPage = ({ config, setConfig, onSaveConfig, showToast, onClose, onDiscoverModels }) => {
  // 回声打开期间收起底部导航——根因和合墨一样：.echo-page 嵌在
  // .gravity-page（也是一个 .tab-page）里，而 .tab-page 的入场动画
  // 以 transform:scale(1) 收尾，animation:...both 让这个非 none 的
  // transform 一直挂着，使 .tab-page 变成自己所有 position:fixed
  // 后代的包含块——.echo-page 内部再高的 z-index 也只在 .tab-page
  // 自己（z-index:1）这个局部层叠上下文里生效，跳不出去盖过真正
  // 在外层、z-index:200 的 .bottom-nav，所以底部导航会一直悬在
  // SAVE 按钮上面。这里给 <html> 打上 .echo-open，配合 App.css 里
  // `.echo-open .bottom-nav` 直接把导航条移出屏幕，跟 `.ink-open`
  // 同一个做法。
  useEffect(() => {
    document.documentElement.classList.add('echo-open')
    return () => document.documentElement.classList.remove('echo-open')
  }, [])

  // 键盘弹出时把当前聚焦的输入框滚到键盘上方——App.css 里 .echo-page
  // 已经用 bottom: var(--kb-height) 把自己收窄了（页面本身跟得上，
  // 见上面那条 bottom 过渡），但收窄之后具体要不要滚、滚到哪，还是
  // 得靠"对焦即滚入视野"来触发：.echo-page-body 收窄的过程中如果
  // scrollTop 不变，可视窗口是从底部往上收的，原本刚好露出来的输入框
  // 反而可能被重新盖住。用 focusin（事件委托，挂在 document 上、
  // 靠冒泡触发）而不是在每个 input/textarea 上分别绑 onFocus，是因为
  // 这一页表单字段很多（人格、模型、提供商……新增字段也不用记得
  // 再补一遍）。延时给 .echo-page 的 bottom 过渡和真机键盘动画留出
  // 结束的时间，早于这个点滚的话，容器还没收窄到位，算出来的目标
  // 位置也是错的。
  useEffect(() => {
    const onFocusIn = (e) => {
      const t = e.target
      if (!t || (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA')) return
      if (!t.closest('.echo-page')) return
      // Temperature 弹窗（.modal-veil）里的输入框不吃这段——弹窗本身
      // 已经用 fixed + flex 居中，并且全局 .modal-veil 自带
      // bottom: var(--kb-height,0px)，键盘一弹出就跟着收缩重新居中，
      // 是另一套跟键盘配合的机制。这里如果照样 scrollIntoView，对一个
      // position:fixed、已经居中的元素基本是空操作，但也可能意外滚动
      // 到某个无关的祖先容器上，索性跳过
      if (t.closest('.modal-veil')) return
      setTimeout(() => t.scrollIntoView({ behavior: 'smooth', block: 'center' }), 300)
    }
    document.addEventListener('focusin', onFocusIn)
    return () => document.removeEventListener('focusin', onFocusIn)
  }, [])

  const modelList     = config?.models || []
  const activeModelId = config?.model || ''
  const activeModelObj = modelList.find(m => m.id === activeModelId) || null

  const customProviders = config?.providers || []
  // DeepSeek 永远存在这个列表里；用户若编辑过它的 baseUrl/apiKey，
  // 存在 config.providers 里的那份会覆盖下面这份默认值
  const deepseekOverride = customProviders.find(p => p.id === DEEPSEEK_PROVIDER_ID)
  const providers = [
    { id: DEEPSEEK_PROVIDER_ID, label: 'DeepSeek', baseUrl: DEEPSEEK_DEFAULT_BASEURL, apiKey: '', protocol: 'openai', builtin: true, ...deepseekOverride },
    ...customProviders.filter(p => p.id !== DEEPSEEK_PROVIDER_ID),
  ]

  const persist = (next) => { setConfig(next); onSaveConfig(next) }

  // ── Temperature：本地草稿字符串，不直接把 <input> 的 value 绑定到
  //    Number(config.temperature) ──────────────────────────────
  // 根因：原来 onChange 里 e.target.value 一敲完立刻 Number() 转换回写
  // config，再用 config.temperature 反过来当 value——用户打"0."这种
  // 合法的中间态时，Number("0.") === 0，下一帧 value 就从 "0." 被程序
  // 强行改写成 "0"，等于在输入法还开着、光标还在输入框里的时候由
  // React 直接篡改了 DOM 的 value。手机端（尤其这种第三方输入法的自定义
  // 数字键盘）会把这种"聚焦中的输入框值被非用户操作改掉"当成一次布局
  // 变化，重新触发它自己的"把输入框滚到键盘上方"逻辑、进而带出
  // visualViewport resize——ChatPage.jsx 里 --kb-height 的测量/写入
  // 又是全局节流监听这个事件的，一乱就可能算出一个偏大的键盘高度，
  // .echo-page 的 bottom 被顶得过多，可视区域猛地收窄，底下引力页那层
  // 就从收窄出来的缝隙里露出来了——这正是"输入温度时跳到顶部、把引力页
  // 顶出来"的根因，只发生在温度这一个字段，也是因为整个回声页里只有它
  // 的 onChange 做了这种"输入即转数字回写"的处理，人格/模型/提供商那些
  // 字段全是原样存字符串，不会触发这个问题。
  // 现在改成：input 本身受控于这个纯字符串 state，中间态（"0."、""、
  // 单独一个"."）都原样保留、绝不用 Number() 转一圈再塞回去；只在能
  // 解析成合法数字时才顺手同步一份到 config.temperature（供其它地方
  // 读取最新值），失焦时再兜底纠正成合法范围内的数字。
  const [tempDraft, setTempDraft] = useState(() => String(config?.temperature ?? 0.7))

  // ── Temperature 弹窗：点下面显示当前值的那一行才打开，编辑态放在
  //    这个独立的模态草稿 tempModalDraft 里，跟 tempDraft/config.temperature
  //    完全隔离——只有点"确定"才把草稿钳制到 [0, 1.5] 后写回两边，点
  //    "取消"或点遮罩直接关掉、什么都不碰。这样"取消"才是真的取消：
  //    不会把编辑到一半、还没提交的中间值漏进 config 里（原来的内联输入框
  //    没有取消这个动作，所以没这个问题；换成弹窗之后如果照抄原来"每次
  //    合法按键都同步一份到 config"的写法，点取消就会变成"名义上取消，
  //    实际上没退"）。中间态放行（空字符串/单独一个"."）和收尾钳制的
  //    写法原样照搬上面 tempDraft 那段注释里诊断出的道理，只是把"失焦时
  //    兜底"换成了"点确定时兜底"。
  const [showTempModal, setShowTempModal] = useState(false)
  const [tempModalDraft, setTempModalDraft] = useState('')
  const tempModalInputRef = useRef(null)

  useEffect(() => {
    if (!showTempModal) return
    tempModalInputRef.current?.focus()
    tempModalInputRef.current?.select()
  }, [showTempModal])

  const openTempModal = () => { setTempModalDraft(tempDraft); setShowTempModal(true) }
  const closeTempModal = () => setShowTempModal(false)
  const confirmTempModal = () => {
    const n = Number(tempModalDraft)
    const safe = (tempModalDraft === '' || tempModalDraft === '.' || Number.isNaN(n))
      ? (config?.temperature ?? 0.7)
      : Math.min(1.5, Math.max(0, n))
    setTempDraft(String(safe))
    setConfig(p => ({ ...p, temperature: safe }))
    setShowTempModal(false)
  }

  // ── 手动新增模型（保留原有路径，适合不在"获取模型列表"里的情况）──
  const [showAddModel, setShowAddModel] = useState(false)
  const [modelForm, setModelForm] = useState({ label: '', baseUrl: '', requestModel: '', apiKey: '', protocol: 'openai' })

  const submitAddModel = () => {
    const label = modelForm.label.trim()
    const baseUrl = modelForm.baseUrl.trim()
    if (!label || !baseUrl) { showToast?.('至少要填名称和接口地址'); return }
    const id = `custom-${Date.now()}`
    const entry = { id, label, baseUrl, requestModel: modelForm.requestModel.trim() || id, apiKey: modelForm.apiKey.trim(), protocol: modelForm.protocol }
    persist({ ...config, models: [...modelList, entry], model: id })
    setModelForm({ label: '', baseUrl: '', requestModel: '', apiKey: '', protocol: 'openai' })
    setShowAddModel(false)
  }
  const removeModel = (id) => {
    const nextModels = modelList.filter(m => m.id !== id)
    const nextActive = activeModelId === id ? (nextModels[0]?.id || '') : activeModelId
    persist({ ...config, models: nextModels, model: nextActive })
  }
  const selectModel = (id) => persist({ ...config, model: id })

  // ── 提供商：展开编辑 + 获取模型列表 + 勾选 ─────────────────────
  const [expandedProviderId, setExpandedProviderId] = useState(null)
  const [providerForm, setProviderForm] = useState({ baseUrl: '', apiKey: '' })
  const [discovering, setDiscovering] = useState(false)
  const [discoverError, setDiscoverError] = useState('')
  const [discoverResult, setDiscoverResult] = useState(null) // { providerId, ids, picked: Set }

  const toggleProvider = (p) => {
    if (expandedProviderId === p.id) { setExpandedProviderId(null); return }
    setExpandedProviderId(p.id)
    setProviderForm({ baseUrl: p.baseUrl, apiKey: p.apiKey || '' })
    setDiscoverResult(null)
    setDiscoverError('')
  }

  const upsertProvider = (providerId, baseUrl, apiKey) => {
    const existing = providers.find(p => p.id === providerId)
    const label = existing?.label || providerId
    // protocol 是提供商创建时定下来的（见"新增提供商"表单），这里只是
    // 换密钥/换地址，不该跟着丢——之前这里没带这个字段，等于每次保存
    // 密钥都把 Anthropic 提供商悄悄冲回默认的 openai 协议，下次聊天
    // 请求就会拼错格式
    const protocol = existing?.protocol || 'openai'
    const others = customProviders.filter(p => p.id !== providerId)
    return [...others, { id: providerId, label, baseUrl, apiKey, protocol }]
  }

  // 只保存提供商的地址/密钥，不改动已选模型——换密钥场景走这个，
  // 已经勾过的模型条目会同步换成新密钥，不用重新勾一遍
  const saveProviderKey = (providerId) => {
    const baseUrl = providerForm.baseUrl.trim()
    const apiKey  = providerForm.apiKey.trim()
    const nextProviders = upsertProvider(providerId, baseUrl, apiKey)
    const nextModels = modelList.map(m => m.providerId === providerId ? { ...m, baseUrl, apiKey } : m)
    persist({ ...config, providers: nextProviders, models: nextModels })
    showToast?.('已保存')
  }

  const deleteProvider = (id) => {
    const nextModels = modelList.filter(m => m.providerId !== id)
    const removedActive = !nextModels.find(m => m.id === activeModelId)
    persist({
      ...config,
      providers: customProviders.filter(p => p.id !== id),
      models: nextModels,
      model: removedActive ? (nextModels[0]?.id || '') : activeModelId,
    })
    if (expandedProviderId === id) setExpandedProviderId(null)
  }

  const discoverModels = async (providerId) => {
    const baseUrl = providerForm.baseUrl.trim()
    if (!baseUrl) { showToast?.('先填接口地址'); return }
    if (!onDiscoverModels) { showToast?.('当前环境不支持获取模型列表'); return }
    const protocol = providers.find(p => p.id === providerId)?.protocol || 'openai'
    setDiscovering(true); setDiscoverError('')
    try {
      const ids = (await onDiscoverModels(baseUrl, providerForm.apiKey.trim(), providerId, protocol)).map(m => m.id)
      const already = new Set(modelList.filter(m => m.providerId === providerId).map(m => m.requestModel))
      setDiscoverResult({ providerId, ids, picked: new Set(ids.filter(id => already.has(id))) })
    } catch (err) {
      setDiscoverError(err.response?.data?.error || err.message)
      setDiscoverResult(null)
    }
    setDiscovering(false)
  }

  const togglePicked = (id) => setDiscoverResult(prev => {
    if (!prev) return prev
    const picked = new Set(prev.picked)
    picked.has(id) ? picked.delete(id) : picked.add(id)
    return { ...prev, picked }
  })

  // 确定勾选：保存提供商信息 + 把「这个提供商名下」的模型条目同步成
  // 勾中的那些（新增缺的、删掉取消勾的），不动其它提供商或手动加的模型
  const confirmDiscover = () => {
    if (!discoverResult) return
    const { providerId, picked } = discoverResult
    const baseUrl = providerForm.baseUrl.trim()
    const apiKey  = providerForm.apiKey.trim()
    const protocol = providers.find(p => p.id === providerId)?.protocol || 'openai'
    const nextProviders = upsertProvider(providerId, baseUrl, apiKey)

    const keepOthers = modelList.filter(m => m.providerId !== providerId)
    const fromThisProvider = [...picked].map(mid => {
      const existing = modelList.find(m => m.providerId === providerId && m.requestModel === mid)
      return { id: existing?.id || `${providerId}:${mid}`, label: mid, requestModel: mid, providerId, baseUrl, apiKey, protocol }
    })
    const nextModels = [...keepOthers, ...fromThisProvider]
    const nextActive = nextModels.find(m => m.id === activeModelId) ? activeModelId : (nextModels[0]?.id || '')

    persist({ ...config, providers: nextProviders, models: nextModels, model: nextActive })
    setDiscoverResult(null)
    setExpandedProviderId(null)
    showToast?.('已保存')
  }

  // ── 新增自定义提供商（DeepSeek 以外，任意 OpenAI 兼容服务，或 Anthropic 原生）──
  const [showAddProvider, setShowAddProvider] = useState(false)
  const [newProviderForm, setNewProviderForm] = useState({ label: '', baseUrl: '', apiKey: '', protocol: 'openai' })

  const submitAddProvider = () => {
    const label = newProviderForm.label.trim()
    const baseUrl = newProviderForm.baseUrl.trim()
    const apiKey = newProviderForm.apiKey.trim()
    const protocol = newProviderForm.protocol
    if (!label || !baseUrl) { showToast?.('至少要填名称和接口地址'); return }
    const id = `custom-provider-${Date.now()}`
    persist({ ...config, providers: [...customProviders, { id, label, baseUrl, apiKey, protocol }] })
    setNewProviderForm({ label: '', baseUrl: '', apiKey: '', protocol: 'openai' })
    setShowAddProvider(false)
    setExpandedProviderId(id)
    setProviderForm({ baseUrl, apiKey })
    setDiscoverResult(null)
  }

  const saveAll = () => { onSaveConfig(); showToast?.('已保存') }

  return (
    <div className="echo-page">
      <div className="echo-page-header">
        <button className="echo-page-iconbtn" onClick={onClose} aria-label="返回">
          <BackIcon />
        </button>
        <div className="echo-page-title">ECHO · 调频</div>
        <span className="echo-page-header-spacer" />
      </div>

      <div className="echo-page-body">
        <div className="echo-page-content">
          <div className="echo-page-eyebrow">人格、模型与温度，回声的三重调频</div>

          {/* 人格 */}
          <div className="echo-page-card">
            <div className="echo-page-card-label">PERSONA · 人格</div>
            <textarea
              className="field-input"
              value={config?.system_prompt || ''}
              onChange={e => setConfig(p => ({ ...p, system_prompt: e.target.value }))}
              rows={5}
              style={{ marginTop: 12, resize: 'vertical', lineHeight: 1.7, fontSize: '13px' }}
            />
          </div>

          {/* 模型：已启用的模型 + 提供商 */}
          <div className="echo-page-card">
            <div className="echo-page-card-label">MODEL · 模型</div>
            <div className="sensitivity-hint" style={{ marginTop: 10 }}>
              {activeModelObj
                ? `当前使用：${activeModelObj.label} · 实际请求模型名 ${activeModelObj.requestModel}`
                : '当前未指定具体模型，会使用默认值 deepseek-v4-flash（服务器环境变量密钥）'}
            </div>

            <div style={{ marginTop: 12 }}>
              {modelList.length === 0 && (
                <div className="sensitivity-hint">还没有已启用的模型——去下面「提供商」获取模型列表，或手动新增</div>
              )}
              {modelList.map(m => (
                <div key={m.id} className={`model-item${activeModelId === m.id ? ' is-active' : ''}`} onClick={() => selectModel(m.id)}>
                  <div className="model-item-main">
                    <span className="model-item-dot" />
                    <div style={{ minWidth: 0 }}>
                      <div className="model-item-label">{m.label}</div>
                      <div className="model-item-sub">{m.requestModel}</div>
                    </div>
                  </div>
                  <span className="icon-btn" onClick={e => { e.stopPropagation(); removeModel(m.id) }} style={{ cursor: 'pointer', color: 'var(--c-text-faint)', padding: '4px', flexShrink: 0 }}>
                    <TrashIcon />
                  </span>
                </div>
              ))}
            </div>

            {showAddModel ? (
              <div className="model-add-form">
                <div className="model-add-title">手动新增模型</div>
                <input className="field-input" placeholder="名称（如 Claude）" value={modelForm.label} onChange={e => setModelForm(p => ({ ...p, label: e.target.value }))} />
                {/* 协议：绝大多数国内模型（DeepSeek/Moonshot/Qwen/GLM…）走 OpenAI
                    兼容格式，选这个就对；Anthropic 官方 Claude 接口是完全不同的
                    形状，选 Anthropic 原生，后端会走另一套请求/解析逻辑 */}
                <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                  <button type="button" onClick={() => setModelForm(p => ({ ...p, protocol: 'openai' }))}
                    className={modelForm.protocol === 'openai' ? 'solid-btn' : 'line-btn'}
                    style={{ flex: 1, padding: '9px 0', borderRadius: '10px', fontSize: '10.5px' }}>OpenAI 兼容</button>
                  <button type="button" onClick={() => setModelForm(p => ({ ...p, protocol: 'anthropic', baseUrl: p.baseUrl || ANTHROPIC_DEFAULT_BASEURL }))}
                    className={modelForm.protocol === 'anthropic' ? 'solid-btn' : 'line-btn'}
                    style={{ flex: 1, padding: '9px 0', borderRadius: '10px', fontSize: '10.5px' }}>Anthropic 原生</button>
                </div>
                <input className="field-input" placeholder={modelForm.protocol === 'anthropic' ? '接口地址（Anthropic /v1/messages）' : '接口地址 baseUrl（OpenAI 兼容 /chat/completions）'} value={modelForm.baseUrl} onChange={e => setModelForm(p => ({ ...p, baseUrl: e.target.value }))} />
                <input className="field-input" placeholder={modelForm.protocol === 'anthropic' ? '请求用的模型名（如 claude-...，不填则用名称）' : '请求用的模型名（不填则用名称）'} value={modelForm.requestModel} onChange={e => setModelForm(p => ({ ...p, requestModel: e.target.value }))} />
                <input className="field-input" type="password" placeholder="API Key" value={modelForm.apiKey} onChange={e => setModelForm(p => ({ ...p, apiKey: e.target.value }))} />
                <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                  <button onClick={() => setShowAddModel(false)} className="line-btn" style={{ flex: 1, padding: '10px 0', borderRadius: '10px', fontSize: '11px' }}>取消</button>
                  <button onClick={submitAddModel} className="solid-btn" style={{ flex: 1, padding: '10px 0', borderRadius: '10px', fontSize: '11px' }}>保存</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowAddModel(true)} className="line-btn" style={{ width: '100%', marginTop: 10, padding: '10px 0', borderRadius: '12px', fontSize: '11px', letterSpacing: '1.5px' }}>
                + 手动新增模型
              </button>
            )}

            {/* 提供商 */}
            <div className="echo-page-card-label" style={{ marginTop: 26 }}>PROVIDERS · 提供商</div>
            <div className="sensitivity-hint" style={{ marginTop: 6 }}>选提供商、填密钥，"获取模型列表"里勾选要用的模型</div>

            <div style={{ marginTop: 12 }}>
              {providers.map(p => (
                <div key={p.id}>
                  <div className={`model-item${expandedProviderId === p.id ? ' is-active' : ''}`} onClick={() => toggleProvider(p)}>
                    <div className="model-item-main">
                      <span className="model-item-dot" />
                      <div style={{ minWidth: 0 }}>
                        <div className="model-item-label">{p.label}</div>
                        <div className="model-item-sub">
                          {p.protocol === 'anthropic' ? 'Anthropic 原生' : 'OpenAI 兼容'} · {p.apiKey ? '已设置密钥' : (p.builtin ? '未设置，使用服务器环境变量密钥' : '未设置密钥')}
                        </div>
                      </div>
                    </div>
                    {!p.builtin && (
                      <span className="icon-btn" onClick={e => { e.stopPropagation(); deleteProvider(p.id) }} style={{ cursor: 'pointer', color: 'var(--c-text-faint)', padding: '4px', flexShrink: 0 }}>
                        <TrashIcon />
                      </span>
                    )}
                  </div>

                  {expandedProviderId === p.id && (
                    <div className="model-add-form">
                      {/* 协议是新增这个提供商时定下来的，之后只改地址/密钥，不在这里
                          切换——中途换协议会让已经勾选的模型全部对不上格式，
                          真要换协议不如删掉重新建一个 */}
                      <div className="sensitivity-hint">协议：{p.protocol === 'anthropic' ? 'Anthropic 原生' : 'OpenAI 兼容'}（新增时选定，不可修改）</div>
                      <input className="field-input" placeholder={p.protocol === 'anthropic' ? '接口地址（Anthropic /v1/messages）' : '接口地址 baseUrl（OpenAI 兼容 /chat/completions）'} value={providerForm.baseUrl} onChange={e => setProviderForm(f => ({ ...f, baseUrl: e.target.value }))} />
                      <input
                        className="field-input" type="password"
                        placeholder={p.builtin ? 'API Key（留空则用服务器环境变量）' : 'API Key'}
                        value={providerForm.apiKey}
                        onChange={e => setProviderForm(f => ({ ...f, apiKey: e.target.value }))}
                      />

                      {discoverError && <div className="sensitivity-hint">获取失败：{discoverError}</div>}

                      {discoverResult?.providerId === p.id ? (
                        <>
                          <div className="model-pick-list">
                            {discoverResult.ids.length === 0 && <div className="sensitivity-hint">没有获取到可用模型</div>}
                            {discoverResult.ids.map(mid => (
                              <label key={mid} className="model-pick-row">
                                <input type="checkbox" checked={discoverResult.picked.has(mid)} onChange={() => togglePicked(mid)} />
                                <span>{mid}</span>
                              </label>
                            ))}
                          </div>
                          <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                            <button onClick={() => setDiscoverResult(null)} className="line-btn" style={{ flex: 1, padding: '10px 0', borderRadius: '10px', fontSize: '11px' }}>取消</button>
                            <button onClick={confirmDiscover} className="solid-btn" style={{ flex: 1, padding: '10px 0', borderRadius: '10px', fontSize: '11px' }}>确定（{discoverResult.picked.size}）</button>
                          </div>
                        </>
                      ) : (
                        <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                          <button onClick={() => saveProviderKey(p.id)} className="line-btn" style={{ flex: 1, padding: '10px 0', borderRadius: '10px', fontSize: '11px' }}>仅保存密钥</button>
                          <button onClick={() => discoverModels(p.id)} disabled={discovering} className="solid-btn" style={{ flex: 1, padding: '10px 0', borderRadius: '10px', fontSize: '11px' }}>
                            {discovering ? '获取中…' : '获取模型列表'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}

              {showAddProvider ? (
                <div className="model-add-form">
                  <div className="model-add-title">新增提供商</div>
                  <input className="field-input" placeholder="名称（如 Moonshot / Claude）" value={newProviderForm.label} onChange={e => setNewProviderForm(p => ({ ...p, label: e.target.value }))} />
                  {/* 协议：绝大多数国内模型（DeepSeek/Moonshot/Qwen/GLM…）走 OpenAI
                      兼容格式；GPT 官方接口本身也是这一套（这套"OpenAI 兼容"就是
                      照着它抄的），选这个就对。Anthropic 官方 Claude 接口形状完全
                      不同，选 Anthropic 原生 */}
                  <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                    <button type="button" onClick={() => setNewProviderForm(p => ({ ...p, protocol: 'openai' }))}
                      className={newProviderForm.protocol === 'openai' ? 'solid-btn' : 'line-btn'}
                      style={{ flex: 1, padding: '9px 0', borderRadius: '10px', fontSize: '10.5px' }}>OpenAI 兼容</button>
                    <button type="button" onClick={() => setNewProviderForm(p => ({ ...p, protocol: 'anthropic', baseUrl: p.baseUrl || ANTHROPIC_DEFAULT_BASEURL }))}
                      className={newProviderForm.protocol === 'anthropic' ? 'solid-btn' : 'line-btn'}
                      style={{ flex: 1, padding: '9px 0', borderRadius: '10px', fontSize: '10.5px' }}>Anthropic 原生</button>
                  </div>
                  <input className="field-input" placeholder={newProviderForm.protocol === 'anthropic' ? '接口地址（Anthropic /v1/messages）' : '接口地址 baseUrl（OpenAI 兼容 /chat/completions）'} value={newProviderForm.baseUrl} onChange={e => setNewProviderForm(p => ({ ...p, baseUrl: e.target.value }))} />
                  <input className="field-input" type="password" placeholder="API Key" value={newProviderForm.apiKey} onChange={e => setNewProviderForm(p => ({ ...p, apiKey: e.target.value }))} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                    <button onClick={() => setShowAddProvider(false)} className="line-btn" style={{ flex: 1, padding: '10px 0', borderRadius: '10px', fontSize: '11px' }}>取消</button>
                    <button onClick={submitAddProvider} className="solid-btn" style={{ flex: 1, padding: '10px 0', borderRadius: '10px', fontSize: '11px' }}>保存</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => setShowAddProvider(true)} className="line-btn" style={{ width: '100%', marginTop: 10, padding: '10px 0', borderRadius: '12px', fontSize: '11px', letterSpacing: '1.5px' }}>
                  + 新增提供商
                </button>
              )}
            </div>
          </div>

          {/* Temperature —— 原来是内联输入框，现在改成点这一行、弹窗
              居中编辑；校验/钳制逻辑原样保留，只是从"失焦时兜底"搬到了
              "点确定时兜底"（见上面 tempModalDraft 附近的注释） */}
          <div className="echo-page-card">
            <div className="echo-page-card-label">TEMPERATURE · 温度</div>
            <div className="echo-temp-display" onClick={openTempModal}>
              <span className="echo-temp-value">{tempDraft}</span>
              <span className="echo-temp-edit-hint">点击修改</span>
            </div>
            <div className="sensitivity-hint" style={{ marginTop: 8 }}>越高越有创造性和随机性，越低越稳定保守</div>
            {/^deepseek-v4/i.test(activeModelObj?.requestModel || 'deepseek-v4-flash') && (
              <div className="sensitivity-hint" style={{ marginTop: 4 }}>该模型默认开启思考模式，开启时这个参数不生效（DeepSeek 官方说明）</div>
            )}
          </div>

          <button onClick={saveAll} className="solid-btn" style={{ width: '100%', padding: '13px 0', borderRadius: '14px', fontSize: '12px', letterSpacing: '3px' }}>
            SAVE
          </button>
        </div>
      </div>

      {/* Temperature 编辑弹窗——特意放在 .echo-page-body 外面、跟它平级，
          不受 .echo-page-body 的 overflow-y:auto 影响；复用全局
          .modal-veil/.modal-card（不单独发明一套弹层样式），但降级掉了
          毛玻璃——原因见 App.css 里 .echo-modal-veil 那条注释：.echo-page
          跟合墨的 .ink-page 一样是 fixed 全屏 + overflow:hidden + 自己的
          z-index 层叠上下文，backdrop-filter 嵌在这种结构里现场采样背后
          内容会不稳定而一闪一闪，这是合墨那边已经诊断并修过的坑，这里
          直接照搬同一个降级方案，不用再踩一遍。点遮罩（不是卡片本体）
          等价于取消 */}
      {showTempModal && (
        <div
          className="modal-veil echo-modal-veil"
          onClick={e => { if (e.target === e.currentTarget) closeTempModal() }}
        >
          <div className="modal-card echo-sheet">
            <div className="modal-title">TEMPERATURE · 温度</div>
            <input
              ref={tempModalInputRef}
              className="field-input echo-temp-modal-input"
              type="text" inputMode="decimal"
              value={tempModalDraft}
              onChange={e => {
                const raw = e.target.value
                // 跟上面 tempDraft 的 onChange 同一个道理：只放行"数字 +
                // 最多一个小数点"的中间态，空字符串/单独一个"."也放行，
                // 都不急着转数字，等点确定时才由 confirmTempModal 兜底
                if (raw !== '' && !/^\d*\.?\d*$/.test(raw)) return
                setTempModalDraft(raw)
              }}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); confirmTempModal() }
                else if (e.key === 'Escape') { e.preventDefault(); closeTempModal() }
              }}
              style={{ marginTop: 16 }}
            />
            <div className="sensitivity-hint" style={{ marginTop: 10 }}>范围 0–1.5 · 越高越有创造性和随机性，越低越稳定保守</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
              <button onClick={closeTempModal} className="line-btn" style={{ flex: 1, padding: '10px 0', borderRadius: '10px', fontSize: '11px' }}>取消</button>
              <button onClick={confirmTempModal} className="solid-btn" style={{ flex: 1, padding: '10px 0', borderRadius: '10px', fontSize: '11px' }}>确定</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default EchoPage
