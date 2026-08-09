import { useState } from 'react'

// ============================================================
// 引力 · 五天体固定布局
// 本批：拿掉长按拖拽，位置写死；五颗天体全部换上正式视觉——
// 时轨（环形日晷，替代原来占位的"暗星核"，本批仍非功能性，
// 只是视觉上的枢纽）、信标（蓝白脉冲星，功能性，点开信标便签
// 子页面）、回声（气态巨行星）、数据罗盘（双星系统）、
// 星历速览（彗星），后四颗本批仍是视觉占位，点击给 toast。
// 交互只剩点击，不再需要 Pointer Events / 拖拽判定那一整套。
// ============================================================

const FIXED_POSITIONS = {
  sundial: { x: 50, y: 19 },
  pulsar:  { x: 22, y: 33 },
  giant:   { x: 78, y: 30 },
  binary:  { x: 19, y: 75 },
  comet:   { x: 81, y: 77 },
}

const BODIES = [
  { id: 'sundial', label: '时轨',     kind: 'sundial', size: 96, functional: false },
  { id: 'pulsar',  label: '信标',     kind: 'pulsar',  size: 58, functional: true  },
  { id: 'giant',   label: '回声',     kind: 'giant',   size: 74, functional: false },
  { id: 'binary',  label: '数据罗盘', kind: 'binary',  size: 54, functional: false },
  { id: 'comet',   label: '星历速览', kind: 'comet',   size: 44, functional: false },
]

const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/>
  </svg>
)

const GravityPage = ({ beacons, beaconText, setBeaconText, onAddBeacon, onToggleBeacon, onDeleteBeacon, showToast }) => {
  const [openBody, setOpenBody] = useState(null)   // 目前只有 'pulsar' 会真正打开子页面

  const handleBodyClick = (body) => {
    if (body.functional) setOpenBody(body.id)
    else showToast?.('即将抵达 · 敬请期待')
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
            {body.label && <span className="gravity-body-label">{body.label}</span>}
          </div>
        )
      })}

      {/* 信标子页面：跃迁（缩放+淡入） */}
      {openBody === 'pulsar' && (
        <div className="modal-veil gravity-subpage-veil" style={{ zIndex: 2200 }} onClick={() => setOpenBody(null)}>
          <div className="modal-card gravity-subpage-card" onClick={e => e.stopPropagation()}>
            <div className="modal-title" style={{ marginBottom: 16 }}>BEACON · 信标</div>
            <div className="beacon-add-row">
              <input
                className="field-input"
                placeholder="记一件小事…"
                value={beaconText}
                onChange={e => setBeaconText(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && onAddBeacon()}
              />
              <button onClick={onAddBeacon} className="line-btn" style={{ padding: '0 16px', borderRadius: '12px', fontSize: '13px' }}>+</button>
            </div>
            <div className="beacon-list" style={{ maxHeight: '44vh', overflowY: 'auto' }}>
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
            <button onClick={() => setOpenBody(null)} className="line-btn" style={{ width: '100%', marginTop: 18, padding: '11px 0', borderRadius: '999px', fontSize: '11.5px', letterSpacing: '2px', color: 'var(--c-text-muted)' }}>
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default GravityPage
