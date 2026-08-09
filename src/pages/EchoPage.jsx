import { useState } from 'react'

// ============================================================
// 回声 · ECHO —— 引力页气态巨行星子页面，全屏跃迁（与数据罗盘/
// 信标同款）。原本是弹窗里塞人格 / 模型切换 / Temperature 三块，
// 本批换成和其余功能天体一致的全屏骨架，三块各自成卡。
// 人格与 Temperature 沿用原本的交互——本地先改，点底部 SAVE 才落盘；
// 模型的选中 / 新增 / 删除维持原本"即改即存"，避免切完模型还要
// 多点一次保存、下一句话却用错了模型。
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

const EchoPage = ({ config, setConfig, onSaveConfig, showToast, onClose }) => {
  const [showAddModel, setShowAddModel] = useState(false)
  const [modelForm, setModelForm] = useState({ label: '', baseUrl: '', requestModel: '', apiKey: '' })
  const modelList = config?.models || []
  const activeModelId = config?.model || 'deepseek-chat'

  const persist = (next) => { setConfig(next); onSaveConfig(next) }

  const submitAddModel = () => {
    const label = modelForm.label.trim()
    const baseUrl = modelForm.baseUrl.trim()
    if (!label || !baseUrl) { showToast?.('至少要填名称和接口地址'); return }
    const id = `custom-${Date.now()}`
    const entry = { id, label, baseUrl, requestModel: modelForm.requestModel.trim() || id, apiKey: modelForm.apiKey.trim() }
    persist({ ...config, models: [...modelList, entry], model: id })
    setModelForm({ label: '', baseUrl: '', requestModel: '', apiKey: '' })
    setShowAddModel(false)
  }
  const removeModel = (id) => {
    persist({ ...config, models: modelList.filter(m => m.id !== id), model: activeModelId === id ? 'deepseek-chat' : activeModelId })
  }
  const selectModel = (id) => persist({ ...config, model: id })

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

          {/* 模型切换 */}
          <div className="echo-page-card">
            <div className="echo-page-card-label">MODEL · 模型</div>
            <div style={{ marginTop: 12 }}>
              <div
                className={`model-item${activeModelId === 'deepseek-chat' ? ' is-active' : ''}`}
                onClick={() => selectModel('deepseek-chat')}
              >
                <div className="model-item-main">
                  <span className="model-item-dot" />
                  <div>
                    <div className="model-item-label">DeepSeek</div>
                    <div className="model-item-sub">内置默认 · 无需填 key</div>
                  </div>
                </div>
              </div>
              {modelList.map(m => (
                <div key={m.id} className={`model-item${activeModelId === m.id ? ' is-active' : ''}`} onClick={() => selectModel(m.id)}>
                  <div className="model-item-main">
                    <span className="model-item-dot" />
                    <div style={{ minWidth: 0 }}>
                      <div className="model-item-label">{m.label}</div>
                      <div className="model-item-sub">{m.apiKey ? '已填 key' : '未填 key，走环境变量'}</div>
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
                <div className="model-add-title">新增模型</div>
                <input className="field-input" placeholder="名称（如 Claude）" value={modelForm.label} onChange={e => setModelForm(p => ({ ...p, label: e.target.value }))} />
                <input className="field-input" placeholder="接口地址 baseUrl（OpenAI 兼容 /chat/completions）" value={modelForm.baseUrl} onChange={e => setModelForm(p => ({ ...p, baseUrl: e.target.value }))} />
                <input className="field-input" placeholder="请求用的模型名（不填则用名称）" value={modelForm.requestModel} onChange={e => setModelForm(p => ({ ...p, requestModel: e.target.value }))} />
                <input className="field-input" type="password" placeholder="API Key" value={modelForm.apiKey} onChange={e => setModelForm(p => ({ ...p, apiKey: e.target.value }))} />
                <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                  <button onClick={() => setShowAddModel(false)} className="line-btn" style={{ flex: 1, padding: '10px 0', borderRadius: '10px', fontSize: '11px' }}>取消</button>
                  <button onClick={submitAddModel} className="solid-btn" style={{ flex: 1, padding: '10px 0', borderRadius: '10px', fontSize: '11px' }}>保存</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowAddModel(true)} className="line-btn" style={{ width: '100%', marginTop: 10, padding: '10px 0', borderRadius: '12px', fontSize: '11px', letterSpacing: '1.5px' }}>
                + 新增模型
              </button>
            )}
          </div>

          {/* Temperature */}
          <div className="echo-page-card">
            <div className="echo-page-card-label">TEMPERATURE · 温度</div>
            <input
              className="field-input" type="number" step="0.1" min="0" max="1.5"
              value={config?.temperature ?? 0.7}
              onChange={e => setConfig(p => ({ ...p, temperature: Number(e.target.value) }))}
              style={{ marginTop: 12 }}
            />
            <div className="sensitivity-hint" style={{ marginTop: 8 }}>越高越有创造性和随机性，越低越稳定保守</div>
          </div>

          <button onClick={saveAll} className="solid-btn" style={{ width: '100%', padding: '13px 0', borderRadius: '14px', fontSize: '12px', letterSpacing: '3px' }}>
            SAVE
          </button>
        </div>
      </div>
    </div>
  )
}

export default EchoPage
