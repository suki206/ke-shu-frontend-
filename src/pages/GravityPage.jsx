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

const DRAG_ARM_MS  = 380   // 按住超过这个时长才允许进入拖拽
// 真机手指按住不动时天然会有几像素的抖动（触屏采样噪声），原来 6px 的容差太紧，
// 稍微一抖就被当成"移动"，导致 endPress 里 !d.moved 恒为 false、点击永远不触发——
// 这就是"信标点不了"的根因（电脑鼠标悬停不动没有这种抖动，所以桌面端一直正常）。
// 放宽到 10px，和 ChatPage.jsx 里长按判定用的容差保持一致。
const MOVE_THRESH  = 10    // px，超过视为移动（用于取消"点击"判定）
// 触屏松手（touchend）后，浏览器通常会紧接着补发一整套"合成鼠标事件"
// （mousedown→mouseup→click），用来兼容只监听鼠标事件的老页面。这里同一个
// 天体上同时绑了触摸和鼠标两套事件，如果不拦掉合成事件，一次真实点击会被
// 触摸路径和鼠标路径各处理一遍，表现为 toast 弹两次——这是"点其他项弹两次
// 提示"的根因。GHOST_EVENT_WINDOW_MS 内紧跟在一次真实触摸后到来的鼠标事件，
// 一律当成幽灵事件丢弃。
const GHOST_EVENT_WINDOW_MS = 600

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
  const containerRef = useRef(null)
  const dragRef       = useRef(null)   // { id, startX, startY, dragging, moved }
  const armTimerRef   = useRef(null)
  const lastTouchRef  = useRef(0)      // 最近一次真实触摸时间戳，用于识别并丢弃触摸后补发的幽灵鼠标事件

  const persistPositions = (next) => {
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

  const startPress = (id, e) => {
    if (e.type === 'touchstart') {
      lastTouchRef.current = Date.now()
      // 阻止浏览器为这次触摸补发合成鼠标事件（部分安卓机型/webview上即使
      // preventDefault 也拦不住，下面的时间窗口判断作为第二重保险）
      if (e.cancelable) e.preventDefault()
    } else if (Date.now() - lastTouchRef.current < GHOST_EVENT_WINDOW_MS) {
      return // 紧跟在真实触摸后到来的鼠标事件，是浏览器补发的幽灵事件，直接丢弃
    }
    const pt = e.touches ? e.touches[0] : e
    dragRef.current = { id, startX: pt.clientX, startY: pt.clientY, dragging: false, moved: false }
    armTimerRef.current = setTimeout(() => {
      if (dragRef.current) { dragRef.current.dragging = true; if (navigator.vibrate) navigator.vibrate(8) }
    }, DRAG_ARM_MS)
  }

  const movePress = (e) => {
    const d = dragRef.current
    if (!d) return
    const pt = e.touches ? e.touches[0] : e
    const dx = pt.clientX - d.startX, dy = pt.clientY - d.startY
    if (Math.abs(dx) > MOVE_THRESH || Math.abs(dy) > MOVE_THRESH) {
      d.moved = true
      if (!d.dragging) { clearTimeout(armTimerRef.current); return }
      const pos = clientToPercent(pt.clientX, pt.clientY)
      if (pos) persistPositions({ ...positions, [d.id]: pos })
    }
  }

  const endPress = (body) => {
    clearTimeout(armTimerRef.current)
    const d = dragRef.current
    dragRef.current = null
    if (d && !d.dragging && !d.moved) handleBodyClick(body)
  }

  const cancelPress = () => { clearTimeout(armTimerRef.current); dragRef.current = null }

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
            className={`gravity-body gravity-body-${body.kind}`}
            style={{ left: `${pos.x}%`, top: `${pos.y}%`, width: body.size, height: body.size }}
            onTouchStart={e => startPress(body.id, e)} onTouchMove={movePress} onTouchEnd={() => endPress(body)} onTouchCancel={cancelPress}
            onMouseDown={e => startPress(body.id, e)} onMouseMove={movePress} onMouseUp={() => endPress(body)} onMouseLeave={cancelPress}
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
