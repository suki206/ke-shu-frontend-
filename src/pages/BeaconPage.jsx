// ============================================================
// 信标 · BEACON —— 引力页脉冲星子页面，全屏跃迁（与数据罗盘同款）
// 本批把设置页里的「备忘」整块（Memo · 备忘 + 到点提醒开关）一并
// 搬到这里，与原本的便签清单合并成一个页面：便签管日常随手记的
// 短事项，备忘管带时间点、要拼进对话背景给 AI 记住的长文本，两者
// 场景相近，合并后不用再去设置页深处找备忘。
// ============================================================

import { useEffect } from 'react'

const BackIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 18l-6-6 6-6" />
  </svg>
)

// 加一件小事：原来是个字号13px、只给了左右内边距的纯文本"+"字符，
// 跟旁边整条输入框比例失调，显得又小又单薄。换成描边图标，配一个
// 跟输入框同高的方形按钮（.beacon-add-btn），跟发送按钮（.send-btn）
// 是同一套图标语言
const PlusIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)

const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/>
  </svg>
)

const BeaconPage = ({
  beacons, beaconText, setBeaconText, onAddBeacon, onToggleBeacon, onDeleteBeacon,
  config, setConfig, onSaveConfig, onEnablePush, showToast, onClose,
}) => {
  const saveMemo = () => { onSaveConfig(); showToast?.('已保存') }

  // 信标打开期间收起底部导航——跟合墨/回声/茧星同一个做法，自己
  // 挂 .beacon-open，不指望父组件（GravityPage）那边记得处理。
  useEffect(() => {
    document.documentElement.classList.add('beacon-open')
    return () => document.documentElement.classList.remove('beacon-open')
  }, [])

  return (
    <div className="beacon-page">
      <div className="beacon-page-header">
        <button className="beacon-page-iconbtn" onClick={onClose} aria-label="返回">
          <BackIcon />
        </button>
        <div className="beacon-page-title">BEACON · 信标</div>
        <span className="beacon-page-header-spacer" />
      </div>

      <div className="beacon-page-body">
        <div className="beacon-page-content">
          <div className="beacon-page-eyebrow">随手记下的小事，与记得住的长事</div>

          {/* 便签清单 —— 原信标功能 */}
          <div className="beacon-page-card">
            <div className="beacon-page-card-label">TODAY · 便签</div>
            <div className="beacon-add-row beacon-todo-add" style={{ marginTop: 12 }}>
              <input
                className="field-input"
                placeholder="记一件小事…"
                value={beaconText}
                onChange={e => setBeaconText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && onAddBeacon()}
              />
              <button onClick={onAddBeacon} className="line-btn beacon-add-btn" aria-label="添加">
                <PlusIcon />
              </button>
            </div>
            <div className="beacon-list" style={{ marginTop: 6 }}>
              {(!beacons || beacons.length === 0) && <div className="beacon-empty">暂无信标</div>}
              {beacons?.map(b => (
                <div key={b.id} className="beacon-item">
                  <span className={`beacon-check${b.done ? ' is-done' : ''}`} onClick={() => onToggleBeacon(b.id)} />
                  <span className={`beacon-text${b.done ? ' is-done' : ''}`} onClick={() => onToggleBeacon(b.id)}>{b.text}</span>
                  <span className="icon-btn" onClick={() => onDeleteBeacon(b.id)} style={{ cursor: 'pointer', color: 'var(--c-text-faint)', padding: '4px', flexShrink: 0 }}>
                    <TrashIcon />
                  </span>
                </div>
              ))}
            </div>
            <div className="sensitivity-hint" style={{ marginTop: 10 }}>次日自动清空已完成项，未完成的项会保留</div>
          </div>

          {/* 备忘 —— 从设置页迁移而来 */}
          <div className="beacon-page-card">
            <div className="beacon-page-card-label">MEMO · 备忘</div>
            <textarea
              className="field-input"
              placeholder="记点什么，比如「明天下午3点买药」「周五交房租」…"
              value={config?.memo || ''}
              onChange={e => setConfig(p => ({ ...p, memo: e.target.value }))}
              rows={4}
              style={{ marginTop: 12, resize: 'vertical', lineHeight: 1.7, fontSize: '13px' }}
            />
            <div className="sensitivity-hint" style={{ marginTop: 8 }}>会拼进对话背景，AI 记得住；保存后带具体时间的句子会自动识别，到点通知你</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
              <button onClick={onEnablePush} className="line-btn" style={{ flex: 1, padding: '11px 0', borderRadius: '14px', fontSize: '11.5px', letterSpacing: '2px' }}>
                开启到点提醒通知
              </button>
              <button onClick={saveMemo} className="solid-btn" style={{ flex: 1, padding: '11px 0', borderRadius: '14px', fontSize: '11.5px', letterSpacing: '2px' }}>
                SAVE
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default BeaconPage
