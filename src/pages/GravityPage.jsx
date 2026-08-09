import { useState } from 'react'
import ChronosPage from './ChronosPage'
import TokenDashboardPage from './TokenDashboardPage'
import BeaconPage from './BeaconPage'

// ============================================================
// 引力 · 五天体固定布局 —— 功能星系
// 时轨（日晷）：锚点"在一起天数"作为常驻读数悬在日晷上方，构成
// 整页唯一的视觉重心。
// 回声（气态巨行星）：点开是"调频面板"——人格 Persona（system
// prompt）、模型切换、Temperature，原本塞在设置页 ConstantPage
// 里的这三块整体搬到这里。
// 数据罗盘（双星系统）：本批从占位升级为功能天体，点开是全屏
// Token 仪表盘（TokenDashboardPage）——原本折叠在设置页最深处的
// 用量统计整体搬到这里。星历速览本批仍是视觉占位，点击给 toast，
// 留给下一批。
// 信标（脉冲星）：本批从弹窗改为全屏跃迁（BeaconPage），并把设置页
// 里的「备忘」整块一并迁来，与原有的便签清单合并展示。
// ============================================================

const FIXED_POSITIONS = {
  sundial: { x: 50, y: 22 },
  pulsar:  { x: 22, y: 33 },
  giant:   { x: 78, y: 30 },
  binary:  { x: 19, y: 75 },
  comet:   { x: 81, y: 77 },
}

const BODIES = [
  { id: 'sundial', label: '时轨',     kind: 'sundial', size: 112, functional: true  },
  { id: 'pulsar',  label: '信标',     kind: 'pulsar',  size: 58,  functional: true  },
  { id: 'giant',   label: '回声',     kind: 'giant',   size: 74,  functional: true  },
  { id: 'binary',  label: '数据罗盘', kind: 'binary',  size: 54,  functional: true  },
  { id: 'comet',   label: '星历速览', kind: 'comet',   size: 44,  functional: false },
]

const daysBetween = (a, b) => Math.round((b.getTime() - a.getTime()) / 86400000)

const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/>
  </svg>
)

// ============================================================
// 调频面板 · 回声天体点开的功能界面
// 从 ConstantPage 整体搬来的三块：人格 / 模型切换 / Temperature。
// 人格与 Temperature 沿用原本的交互——本地先改，点底部 SAVE 才落盘；
// 模型的选中 / 新增 / 删除维持原本"即改即存"，避免切完模型还要
// 多点一次保存、下一句话却用错了模型。
// ============================================================
const AttunementPanel = ({ config, setConfig, onSaveConfig, showToast, onClose }) => {
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

  return (
    <div className="modal-veil gravity-subpage-veil" style={{ zIndex: 2200 }} onClick={onClose}>
      <div className="modal-card gravity-subpage-card gravity-attune-card" onClick={e => e.stopPropagation()}>
        <div className="modal-title" style={{ marginBottom: 16 }}>ECHO · 调频</div>

        <div className="gravity-attune-body">
          {/* 人格 */}
          <div className="constant-section" style={{ marginTop: 0 }}>
            <div className="constant-section-title">Persona · 人格</div>
            <textarea
              className="field-input"
              value={config?.system_prompt || ''}
              onChange={e => setConfig(p => ({ ...p, system_prompt: e.target.value }))}
              rows={4}
              style={{ resize: 'vertical', lineHeight: 1.7, fontSize: '13px' }}
            />
          </div>

          {/* 模型切换 */}
          <div className="constant-section">
            <div className="constant-section-title">Model · 模型</div>
            <div>
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
          <div className="constant-section">
            <div className="constant-section-title">Temperature · 温度</div>
            <input
              className="field-input" type="number" step="0.1" min="0" max="1.5"
              value={config?.temperature ?? 0.7}
              onChange={e => setConfig(p => ({ ...p, temperature: Number(e.target.value) }))}
            />
            <div className="sensitivity-hint" style={{ marginTop: 8 }}>越高越有创造性和随机性，越低越稳定保守</div>
          </div>
        </div>

        <button
          onClick={() => { onSaveConfig(); showToast?.('已保存') }}
          className="solid-btn"
          style={{ width: '100%', marginTop: 16, padding: '13px 0', borderRadius: '14px', fontSize: '12px', letterSpacing: '3px' }}
        >
          SAVE
        </button>
        <button onClick={onClose} className="line-btn" style={{ width: '100%', marginTop: 10, padding: '11px 0', borderRadius: '999px', fontSize: '11.5px', letterSpacing: '2px', color: 'var(--c-text-muted)' }}>
          关闭
        </button>
      </div>
    </div>
  )
}

const GravityPage = ({ beacons, beaconText, setBeaconText, onAddBeacon, onToggleBeacon, onDeleteBeacon, showToast,
  config, setConfig, onSaveConfig, onEnablePush,
  tokenStats, tokenStatsLoading, onFetchTokenStats }) => {
  const [openBody, setOpenBody] = useState(null)

  const anchorDate = config?.anchor_date || ''
  const anchorDays = anchorDate ? daysBetween(new Date(anchorDate), new Date()) + 1 : null

  const handleBodyClick = (body) => {
    if (!body.functional) { showToast?.('即将抵达 · 敬请期待'); return }
    setOpenBody(body.id)
    // 数据罗盘：每次打开都拉一次最新用量，跟原设置页里"展开即拉取"的行为一致
    if (body.id === 'binary') onFetchTokenStats?.()
  }

  const onAnchorChange = (d) => {
    const next = { ...config, anchor_date: d }
    setConfig(next)
    onSaveConfig(next)
  }

  return (
    <div className="tab-page gravity-page">
      <div className="gravity-nebula" aria-hidden="true">
        <span className="gravity-nebula-layer l1" />
        <span className="gravity-nebula-layer l2" />
        <span className="gravity-nebula-layer l3" />
      </div>

      <div style={{ padding: '22px 22px 4px', flexShrink: 0, position: 'relative', zIndex: 2 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '15px', letterSpacing: '4px', color: 'var(--c-text)' }}>GRAVITY</div>
        <div style={{ fontSize: '11px', letterSpacing: '1.5px', color: 'var(--c-text-faint)', marginTop: 6, fontFamily: 'var(--font-accent)', fontStyle: 'italic' }}>彼此牵引的引力场</div>
      </div>

      <div className="gravity-constellation">
        <svg className="gravity-threads" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {BODIES.filter(b => b.id !== 'sundial').map((b, i) => {
            const p = FIXED_POSITIONS[b.id]
            const c = FIXED_POSITIONS.sundial
            return (
              <line key={b.id} x1={p.x} y1={p.y} x2={c.x} y2={c.y}
                className="gravity-thread" style={{ animationDelay: `${i * 0.7}s` }} vectorEffect="non-scaling-stroke" />
            )
          })}
        </svg>

        {BODIES.map(body => {
          const pos = FIXED_POSITIONS[body.id]
          return (
            <div
              key={body.id}
              className={`gravity-body gravity-body-${body.kind}`}
              style={{ left: `${pos.x}%`, top: `${pos.y}%`, width: body.size, height: body.size }}
              onClick={() => handleBodyClick(body)}
              role="button"
              tabIndex={0}
              aria-label={body.label}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleBodyClick(body) } }}
            >
              {body.kind === 'sundial' && (
                <>
                  <span className="gravity-sundial-rim" />
                  <span className="gravity-sundial-ticks" />
                  <span className="gravity-sundial-core" />
                  <span className="gravity-sundial-moon" />
                  <div className="gravity-sundial-readout">
                    {anchorDays != null ? (
                      <>
                        <span className="gravity-sundial-eyebrow">在一起的第</span>
                        <span className="gravity-sundial-numline">
                          <span className="gravity-sundial-num">{anchorDays}</span>
                          <span className="gravity-sundial-unit">天</span>
                        </span>
                      </>
                    ) : (
                      <span className="gravity-sundial-prompt">轻触 · 设定你们的锚点</span>
                    )}
                  </div>
                </>
              )}
              {body.kind === 'pulsar' && (
                <>
                  <span className="gravity-pulsar-trail" />
                  <span className="gravity-pulsar-crosshair" />
                </>
              )}
              {body.kind === 'giant' && (
                <>
                  <span className="gravity-ring gravity-ring-1" />
                  <span className="gravity-ring gravity-ring-2" />
                  <span className="gravity-ring gravity-ring-3" />
                </>
              )}
              {body.kind === 'binary' && (
                <>
                  <span className="gravity-binary-lens" />
                  <span className="gravity-binary-orbit" />
                </>
              )}
              {body.kind === 'comet' && (
                <>
                  <span className="gravity-comet-tail" />
                  <span className="gravity-comet-sparkle" />
                </>
              )}
              {body.kind !== 'binary' && body.kind !== 'sundial' && <span className="gravity-body-orb" />}
              {body.label && body.kind !== 'sundial' && <span className="gravity-body-label">{body.label}</span>}
            </div>
          )
        })}
      </div>

      {/* 时轨子页面：全屏跃迁，只负责展示；锚点/倒计时/经期的输入都在
          场景内点对应天体触发，不在这里传表单状态 */}
      {openBody === 'sundial' && (
        <ChronosPage
          onClose={() => setOpenBody(null)}
          showToast={showToast}
          anchorDate={anchorDate}
          onAnchorChange={onAnchorChange}
        />
      )}

      {/* 回声子页面：调频面板 */}
      {openBody === 'giant' && (
        <AttunementPanel
          config={config || {}}
          setConfig={setConfig}
          onSaveConfig={onSaveConfig}
          showToast={showToast}
          onClose={() => setOpenBody(null)}
        />
      )}

      {/* 信标子页面：全屏跃迁（与数据罗盘一致），并入原设置页的备忘 */}
      {openBody === 'pulsar' && (
        <BeaconPage
          beacons={beacons} beaconText={beaconText} setBeaconText={setBeaconText}
          onAddBeacon={onAddBeacon} onToggleBeacon={onToggleBeacon} onDeleteBeacon={onDeleteBeacon}
          config={config} setConfig={setConfig} onSaveConfig={onSaveConfig} onEnablePush={onEnablePush}
          showToast={showToast}
          onClose={() => setOpenBody(null)}
        />
      )}

      {/* 数据罗盘子页面：全屏 Token 仪表盘（原设置页用量统计整体迁至此） */}
      {openBody === 'binary' && (
        <TokenDashboardPage
          stats={tokenStats}
          loading={tokenStatsLoading}
          onRefresh={onFetchTokenStats}
          onClose={() => setOpenBody(null)}
        />
      )}
    </div>
  )
}

export default GravityPage
