import { useState, useRef } from 'react'

// ============================================================
// 引力 · 五天体壳子
// 本批唯一功能天体：左上脉冲星「信标」（原常数页信标模块整体迁入）
// 其余四颗（回声 / 数据罗盘 / 星历速览 / 暗星核）本批仅视觉占位，
// 点击给 toast，具体功能留待后续批次。
// 位置可长按拖拽调整，存 localStorage（ks_gravity_positions），
// 每颗独立动画周期，互不同步。
// ============================================================

const GRAVITY_POS_STORAGE = 'ks_gravity_positions'

// 有机散布的默认坐标（百分比），刻意避免对称网格
const DEFAULT_POSITIONS = {
  pulsar: { x: 26, y: 23 },
  giant:  { x: 75, y: 15 },
  binary: { x: 17, y: 67 },
  comet:  { x: 83, y: 73 },
  core:   { x: 55, y: 43 },
}

const BODIES = [
  { id: 'pulsar', label: '信标',     kind: 'pulsar', size: 56, functional: true  },
  { id: 'giant',  label: '回声',     kind: 'giant',  size: 70, functional: false },
  { id: 'binary', label: '数据罗盘', kind: 'binary', size: 52, functional: false },
  { id: 'comet',  label: '星历速览', kind: 'comet',  size: 40, functional: false },
  { id: 'core',   label: '',        kind: 'core',   size: 38, functional: false },
]

// ── 关于"信标点不动" ─────────────────────────────────────────
// 旧实现里，松手时的判定是 `if (!d.dragging && !d.moved) 触发点击`。
// dragging 由一个 380ms 的定时器置位，只表示"现在允许拖了"，跟手指有没有
// 真的移动无关。手机上点一颗直径 56px 的小球，手指落下到抬起经常超过
// 380ms——于是 dragging 已经是 true，点击就被整个吞掉，表现为怎么点都没反应。
// 电脑上鼠标单击通常只有 80~150ms，从来碰不到这条线，所以桌面端一直是好的。
//
// 现在把两件事彻底分开：
//   dragging  只决定"移动时要不要真的挪动天体"
//   moved     才是唯一能取消点击的条件
// 按住不动多久都算点击，一旦移动超过阈值才算拖拽。
//
// 另外整体从 touch/mouse 双套事件换成 Pointer Events：一次交互只走一条
// 事件流，浏览器不会在触摸后补发合成鼠标事件，原来那套"幽灵事件时间窗口"
// 的补丁就可以整个删掉；配合 setPointerCapture，手指滑出天体范围后也能
// 继续接到移动，拖拽不再中途断掉。
const DRAG_ARM_MS = 420   // 按住超过这个时长才允许进入拖拽
const MOVE_THRESH = 10    // px，超过视为移动（唯一取消点击的条件）

function loadPositions() {
  try {
    const saved = JSON.parse(localStorage.getItem(GRAVITY_POS_STORAGE) || 'null')
    if (saved && typeof saved === 'object') return { ...DEFAULT_POSITIONS, ...saved }
  } catch {}
  return { ...DEFAULT_POSITIONS }
}

const TrashIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 7h16"/><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13"/>
  </svg>
)

const GravityPage = ({ beacons, beaconText, setBeaconText, onAddBeacon, onToggleBeacon, onDeleteBeacon, showToast }) => {
  const [positions, setPositions] = useState(loadPositions)
  const [openBody,  setOpenBody]  = useState(null)   // 目前只有 'pulsar' 会真正打开子页面
  const [armedId,   setArmedId]   = useState(null)   // 已进入可拖拽状态的天体，给一点视觉反馈
  const containerRef = useRef(null)
  const dragRef      = useRef(null)   // { id, startX, startY, dragging, moved }
  const armTimerRef  = useRef(null)
  const posRef       = useRef(positions)   // 拖拽过程中读最新值，避免闭包拿到旧 state

  const persistPositions = (next) => {
    posRef.current = next
    setPositions(next)
    try { localStorage.setItem(GRAVITY_POS_STORAGE, JSON.stringify(next)) } catch {}
  }

  const clientToPercent = (clientX, clientY) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect || !rect.width || !rect.height) return null
    return {
      x: Math.min(94, Math.max(6, ((clientX - rect.left) / rect.width) * 100)),
      y: Math.min(92, Math.max(8, ((clientY - rect.top) / rect.height) * 100)),
    }
  }

  const handleBodyClick = (body) => {
    if (body.functional) setOpenBody(body.id)
    else showToast?.('即将抵达 · 敬请期待')
  }

  const onPointerDown = (id, e) => {
    // 捕获这个指针：之后就算手指滑出天体范围，move / up 也还会送到这里
    try { e.currentTarget.setPointerCapture?.(e.pointerId) } catch {}
    dragRef.current = { id, startX: e.clientX, startY: e.clientY, dragging: false, moved: false }
    clearTimeout(armTimerRef.current)
    armTimerRef.current = setTimeout(() => {
      if (!dragRef.current) return
      dragRef.current.dragging = true
      setArmedId(dragRef.current.id)
      if (navigator.vibrate) navigator.vibrate(8)
    }, DRAG_ARM_MS)
  }

  const onPointerMove = (e) => {
    const d = dragRef.current
    if (!d) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (Math.abs(dx) <= MOVE_THRESH && Math.abs(dy) <= MOVE_THRESH) return

    d.moved = true
    if (!d.dragging) { clearTimeout(armTimerRef.current); return }   // 还没到时长就滑走了，当成误触
    const pos = clientToPercent(e.clientX, e.clientY)
    if (pos) persistPositions({ ...posRef.current, [d.id]: pos })
  }

  const onPointerUp = (body, e) => {
    try { e.currentTarget.releasePointerCapture?.(e.pointerId) } catch {}
    clearTimeout(armTimerRef.current)
    const d = dragRef.current
    dragRef.current = null
    setArmedId(null)
    // 只要手指没有真的挪动，无论按了多久都算一次点击
    if (d && !d.moved) handleBodyClick(body)
  }

  const onPointerCancel = () => {
    clearTimeout(armTimerRef.current)
    dragRef.current = null
    setArmedId(null)
  }

  return (
    <div className="tab-page gravity-page" ref={containerRef}>
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
        {BODIES.filter(b => b.id !== 'core').map((b, i) => {
          const p = positions[b.id] || DEFAULT_POSITIONS[b.id]
          const c = positions.core || DEFAULT_POSITIONS.core
          return (
            <line key={b.id} x1={p.x} y1={p.y} x2={c.x} y2={c.y}
              className="gravity-thread" style={{ animationDelay: `${i * 0.7}s` }} vectorEffect="non-scaling-stroke" />
          )
        })}
      </svg>

      {BODIES.map(body => {
        const pos = positions[body.id] || DEFAULT_POSITIONS[body.id]
        return (
          <div
            key={body.id}
            className={`gravity-body gravity-body-${body.kind}${armedId === body.id ? ' is-armed' : ''}`}
            style={{ left: `${pos.x}%`, top: `${pos.y}%`, width: body.size, height: body.size }}
            onPointerDown={e => onPointerDown(body.id, e)}
            onPointerMove={onPointerMove}
            onPointerUp={e => onPointerUp(body, e)}
            onPointerCancel={onPointerCancel}
            role="button"
            tabIndex={0}
            aria-label={body.label || '暗星核'}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleBodyClick(body) } }}
          >
            {body.kind === 'giant'  && <span className="gravity-ring" />}
            {body.kind === 'binary' && <span className="gravity-binary-orbit" />}
            {body.kind === 'comet'  && <span className="gravity-comet-tail" />}
            {body.kind !== 'binary' && <span className="gravity-body-orb" />}
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
