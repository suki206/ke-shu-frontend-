// ============================================================
// 信标 · BEACON —— 引力页脉冲星子页面，全屏跃迁（与数据罗盘同款）
// 本批把设置页里的「备忘」整块（Memo · 备忘 + 到点提醒开关）一并
// 搬到这里，与原本的便签清单合并成一个页面：便签管日常随手记的
// 短事项，备忘管带时间点、要拼进对话背景给 AI 记住的长文本，两者
// 场景相近，合并后不用再去设置页深处找备忘。
// ============================================================

import { useState, useEffect } from 'react'

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
  // 【2026-08-12 修复】"没点 SAVE，改过的备忘也留下了"
  // ------------------------------------------------------------------
  // 备忘原来是 onChange → setConfig 直接写进 ChatPage 那份全局 config，
  // SAVE 只是把已经被改过的 config 推去服务器。所以打了字不保存就返回，
  // 内存里那份早就变了，再进来看到的还是改了一半的内容；更糟的是别处
  // 只要触发一次保存，这段没确认过的文字就被顺手写进库、还会拼进对话
  // 背景喂给枢。现在改成本页草稿，只有 SAVE 才合并回 config 并落盘；
  // 不保存就返回，草稿随组件卸载一起丢掉（信标是 openBody === 'pulsar'
  // 时才挂载的，点返回就卸载），下次进来重新从 config 灌一遍。
  const [memoDraft, setMemoDraft] = useState(() => config?.memo || '')
  // 只在"已保存的备忘本身变了"时重新灌（比如刚从服务器把设置拉回来）。
  // 打字期间 config.memo 不动，不会把正在输入的内容冲掉
  useEffect(() => { setMemoDraft(config?.memo || '') },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [config?.memo])

  const saveMemo = () => {
    const next = { ...config, memo: memoDraft }
    setConfig(next)
    onSaveConfig(next)    // 带 override，saveSettings 就不会再自己弹一次 toast
    showToast?.('已保存')
  }

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
              value={memoDraft}
              onChange={e => setMemoDraft(e.target.value)}
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
