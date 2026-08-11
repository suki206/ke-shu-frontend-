/**
 * StarCanvas — 全屏宇宙粒子背景
 * 神经网络节点连线 · 流星 · 星云渐变 · 可交互漫游
 * 通过 forwardRef + imperative handle 暴露 resetCamera()
 *
 * wallpaper（可选）：传入图片 URL 时，在纯色背景之上先铺一张
 * cover 方式填满画布的静态图（比如聊天页想用的星空摄影图），
 * 星云渐变、连线、粒子、流星这些原有效果全部照常叠在它上面绘制——
 * "漂浮的星星"不会因为换了背景图就消失，壁纸只是替换了最底层
 * 那块纯色 fillRect，其余图层次序完全不变。
 * 不传 wallpaper 时行为和原来完全一样（回退到纯色 + CSS 星云）。
 */
import { useRef, useEffect, forwardRef, useImperativeHandle } from 'react'

// 每套主题的星点 RGB、背景色、星云色
const PAL = {
  warm: { r: 255, g: 222, b: 158, bg: '#060300', na: 90, nb: 42, nc: 8 },
  mist: { r: 182, g: 210, b: 255, bg: '#010208', na: 12, nb: 22, nc: 65 },
  noir: { r: 238, g: 232, b: 255, bg: '#000002', na: 24, nb: 12, nc: 48 },
}

const N     = 150     // 粒子数量（神经网络节点，参与连线，连线开销已用 vis.slice(0,115) 卡死上限）
                       // 原为 290，同屏可见+连线偏密偏乱，调低到 150 让画面更清爽干净
const SPACE = 5200    // 虚拟宇宙尺寸（正方形）
const HALF  = SPACE / 2

const StarCanvas = forwardRef(({ theme = 'noir', interactive = false, wallpaper = null }, ref) => {
  const cvs   = useRef(null)
  const cam   = useRef({ x: 0, y: 0, z: 0.88 })   // z = zoom
  const pts   = useRef([])
  const mouse = useRef({ x: -1e6, y: -1e6 })
  const drag  = useRef({ on: false, px: 0, py: 0, vx: 0, vy: 0 })
  const t2d   = useRef(0)   // pinch 上一帧距离
  const raf   = useRef(null)
  const inter = useRef(false)
  const frame = useRef(0)
  // 壁纸图片对象 + 加载状态：图片是异步加载的，绘制循环每帧都会跑，
  // 用 ref（不是 state）记录，避免图片加载完触发一次不必要的 React
  // 重渲染——绘制循环本来就是 rAF 自己在跑，下一帧自然就能读到新值。
  // wallpaperOn 单独存一份"当前是否要用壁纸"，是因为下面主绘制循环
  // 那个 useEffect 依赖数组只有 [theme]——直接读 wallpaper 这个 prop
  // 会捕进闭包，wallpaper 单独变化（theme 没变）时绘制循环读到的还是
  // 旧值；改成读这个 ref 就没有闭包过期的问题，每帧都是当前最新值。
  const wallpaperImg    = useRef(null)
  const wallpaperReady  = useRef(false)
  const wallpaperSrc    = useRef(null)
  const wallpaperOn     = useRef(!!wallpaper)
  useEffect(() => { wallpaperOn.current = !!wallpaper }, [wallpaper])

  // 供父组件调用：重置视角
  useImperativeHandle(ref, () => ({
    resetCamera: () => { cam.current = { x: 0, y: 0, z: 0.88 } }
  }))

  // 同步 interactive prop → ref（在 draw loop 里使用 ref 避免闭包旧值）
  useEffect(() => { inter.current = interactive }, [interactive])

  // 加载壁纸图片：wallpaper prop 变化（比如切换页面/主题带来不同的图）
  // 时重新加载；传 null/undefined 时清空，绘制循环会自动回退到纯色背景
  useEffect(() => {
    if (!wallpaper) {
      wallpaperImg.current = null
      wallpaperReady.current = false
      wallpaperSrc.current = null
      return
    }
    if (wallpaperSrc.current === wallpaper && wallpaperImg.current) return // 同一张图不重复加载
    wallpaperReady.current = false
    wallpaperSrc.current = wallpaper
    const img = new Image()
    img.onload = () => {
      // 图片加载完成时 wallpaper 可能已经又变了（比如快速切换），
      // 只有仍然是当前这张图才生效，避免"旧图迟加载完覆盖新图"
      if (wallpaperSrc.current !== wallpaper) return
      wallpaperImg.current = img
      wallpaperReady.current = true
    }
    img.onerror = () => {
      wallpaperReady.current = false
    }
    img.src = wallpaper
  }, [wallpaper])

  // 更新 canvas pointer-events / z-index / cursor
  useEffect(() => {
    const c = cvs.current
    if (!c) return
    c.style.pointerEvents = interactive ? 'auto'   : 'none'
    c.style.zIndex        = interactive ? '500'    : '0'
    c.style.cursor        = interactive ? 'grab'   : 'default'
  }, [interactive])

  // ── 初始化粒子 ────────────────────────────────────────────
  useEffect(() => {
    pts.current = Array.from({ length: N }, () => ({
      x:  (Math.random() - .5) * SPACE,
      y:  (Math.random() - .5) * SPACE,
      vx: (Math.random() - .5) * .19,
      vy: (Math.random() - .5) * .19,
      r:  .45 + Math.random() * 2.1,
      a:  .22 + Math.random() * .78,
      ph: Math.random() * Math.PI * 2,
      ps: .0038 + Math.random() * .0085,
      glow: Math.random() < .07,
    }))
  }, [])

  // ── 主绘制循环 ────────────────────────────────────────────
  useEffect(() => {
    const c = cvs.current
    if (!c) return
    const ctx = c.getContext('2d', { alpha: false })

    const resize = () => {
      c.width  = innerWidth
      c.height = innerHeight
    }
    resize()
    addEventListener('resize', resize)

    const p = PAL[theme] ?? PAL.noir

    // 壁纸按 cover 方式绘制：等比缩放铺满整个画布并居中裁剪，
    // 跟 CSS background-size:cover 是同一套算法
    const drawWallpaperCover = (img, W, H) => {
      const ir = img.width / img.height
      const cr = W / H
      let dw, dh, dx, dy
      if (ir > cr) { dh = H; dw = H * ir; dx = (W - dw) / 2; dy = 0 }
      else         { dw = W; dh = W / ir; dx = 0; dy = (H - dh) / 2 }
      ctx.drawImage(img, dx, dy, dw, dh)
    }

    const draw = () => {
      frame.current++
      const { width: W, height: H } = c
      const { x: camX, y: camY, z } = cam.current
      const { x: mx, y: my } = mouse.current
      const zoom = Math.max(.2, Math.min(3, z))

      // —— 背景：有壁纸且已加载完成就画壁纸，否则回退纯色 ——
      if (wallpaperOn.current && wallpaperReady.current && wallpaperImg.current) {
        drawWallpaperCover(wallpaperImg.current, W, H)
        // 壁纸上叠一层极淡的主题色暗遮罩，让气泡/文字的对比度
        // 不会因为换了实景图而失衡，同时保留图片本身的可辨识度
        ctx.fillStyle = `rgba(${p.na},${p.nb},${p.nc},0.10)`
        ctx.fillRect(0, 0, W, H)
      } else {
        ctx.fillStyle = p.bg
        ctx.fillRect(0, 0, W, H)
      }

      // —— 星云渐变 ——
      const neb = ctx.createRadialGradient(W*.5, H*.42, 0, W*.5, H*.42, W*.72)
      neb.addColorStop(0,   `rgba(${p.na},${p.nb},${p.nc},.24)`)
      neb.addColorStop(.55, `rgba(${p.na},${p.nb},${p.nc},.07)`)
      neb.addColorStop(1,   `rgba(${p.na},${p.nb},${p.nc},0)`)
      ctx.fillStyle = neb
      ctx.fillRect(0, 0, W, H)

      // —— 相机惯性 ——
      if (!drag.current.on) {
        cam.current.x += drag.current.vx
        cam.current.y += drag.current.vy
        drag.current.vx *= .91
        drag.current.vy *= .91
      }

      const ox = W / 2 - cam.current.x
      const oy = H / 2 - cam.current.y
      const cd   = 138 * zoom
      const cdSq = cd * cd
      const { r: sr, g: sg, b: sb } = p

      // —— 更新粒子，收集可见 ——
      const vis = []
      for (const pt of pts.current) {
        pt.x += pt.vx;  pt.y += pt.vy;  pt.ph += pt.ps
        if (pt.x >  HALF) pt.x -= SPACE
        if (pt.x < -HALF) pt.x += SPACE
        if (pt.y >  HALF) pt.y -= SPACE
        if (pt.y < -HALF) pt.y += SPACE

        const sx = ox + pt.x * zoom
        const sy = oy + pt.y * zoom
        if (sx < -180 || sx > W+180 || sy < -180 || sy > H+180) continue

        // 鼠标引力（仅交互模式）
        let mg = 0
        if (inter.current) {
          const ddx = sx - mx, ddy = sy - my
          mg = Math.max(0, 1 - Math.sqrt(ddx*ddx + ddy*ddy) / 215)
        }

        const pulse = Math.sin(pt.ph) * .21 + .79
        pt._sx = sx;  pt._sy = sy
        pt._a  = Math.min(1, pt.a * pulse + mg * .52)
        pt._mg = mg
        pt._sz = (pt.r + mg * 2.6) * zoom
        vis.push(pt)
      }

      // —— 连接线（只取前 115 颗，O(n²) 可控）——
      const sl = vis.length > 115 ? vis.slice(0, 115) : vis
      ctx.lineWidth = .55
      for (let i = 0; i < sl.length; i++) {
        const a = sl[i]
        for (let j = i+1; j < sl.length; j++) {
          const b = sl[j]
          const dx = a._sx - b._sx, dy = a._sy - b._sy
          const dSq = dx*dx + dy*dy
          if (dSq > cdSq) continue
          const t  = 1 - Math.sqrt(dSq) / cd
          const bst = Math.max(a._mg, b._mg) * .22
          ctx.strokeStyle = `rgba(${sr},${sg},${sb},${(t*.16+bst).toFixed(3)})`
          ctx.beginPath()
          ctx.moveTo(a._sx, a._sy)
          ctx.lineTo(b._sx, b._sy)
          ctx.stroke()
        }
      }

      // —— 绘制星点 ——
      for (const pt of vis) {
        const sz = Math.max(.45, pt._sz)

        // 光晕（bright 粒子或鼠标靠近时）
        if (pt.glow || pt._mg > .06) {
          const gr = sz * (3.4 + pt._mg * 5.5)
          const g  = ctx.createRadialGradient(pt._sx, pt._sy, 0, pt._sx, pt._sy, gr)
          const ga = (pt._a * .42).toFixed(3)
          g.addColorStop(0, `rgba(${sr},${sg},${sb},${ga})`)
          g.addColorStop(1, `rgba(${sr},${sg},${sb},0)`)
          ctx.fillStyle = g
          ctx.beginPath()
          ctx.arc(pt._sx, pt._sy, gr, 0, 6.2832)
          ctx.fill()
        }

        // 核心
        ctx.fillStyle = `rgba(${sr},${sg},${sb},${pt._a.toFixed(3)})`
        ctx.beginPath()
        ctx.arc(pt._sx, pt._sy, sz, 0, 6.2832)
        ctx.fill()
      }

      // —— 流星（低概率）——
      if (frame.current % 500 === 0 && Math.random() < .6) {
        const x1  = Math.random() * W
        const y1  = Math.random() * H * .38
        const len = 85 + Math.random() * 165
        const ang = Math.PI / 4 + (Math.random() - .5) * .55
        const x2  = x1 + Math.cos(ang) * len
        const y2  = y1 + Math.sin(ang) * len
        const gl  = ctx.createLinearGradient(x1, y1, x2, y2)
        gl.addColorStop(0,   `rgba(${sr},${sg},${sb},0)`)
        gl.addColorStop(.3,  `rgba(${sr},${sg},${sb},.96)`)
        gl.addColorStop(1,   `rgba(${sr},${sg},${sb},0)`)
        ctx.strokeStyle = gl
        ctx.lineWidth = 1
        ctx.beginPath()
        ctx.moveTo(x1, y1)
        ctx.lineTo(x2, y2)
        ctx.stroke()
      }

      raf.current = requestAnimationFrame(draw)
    }

    draw()
    return () => {
      removeEventListener('resize', resize)
      cancelAnimationFrame(raf.current)
    }
  }, [theme])

  // ── 全局鼠标追踪（光晕用）────────────────────────────────
  useEffect(() => {
    const mv = e  => { mouse.current = { x: e.clientX,            y: e.clientY } }
    const tv = e  => { if (e.touches[0]) mouse.current = { x: e.touches[0].clientX, y: e.touches[0].clientY } }
    addEventListener('mousemove', mv, { passive: true })
    addEventListener('touchmove',  tv, { passive: true })
    return () => { removeEventListener('mousemove', mv); removeEventListener('touchmove', tv) }
  }, [])

  // ── 拖拽 / 缩放（interactive 模式下激活）────────────────
  useEffect(() => {
    const c = cvs.current
    if (!c) return

    // —— 鼠标 ——
    const dn = e => {
      if (!inter.current) return
      drag.current = { on: true, px: e.clientX, py: e.clientY, vx: 0, vy: 0 }
      c.style.cursor = 'grabbing'
    }
    const mm = e => {
      if (!drag.current.on) return
      const dx = e.clientX - drag.current.px
      const dy = e.clientY - drag.current.py
      drag.current.vx = dx;  drag.current.vy = dy
      cam.current.x  -= dx;  cam.current.y  -= dy
      drag.current.px = e.clientX;  drag.current.py = e.clientY
    }
    const up = () => {
      drag.current.on = false
      c.style.cursor  = inter.current ? 'grab' : 'default'
    }

    // —— 触控 ——
    const ts = e => {
      if (!inter.current) return
      if (e.touches.length === 1) {
        drag.current = { on: true, px: e.touches[0].clientX, py: e.touches[0].clientY, vx: 0, vy: 0 }
      } else if (e.touches.length === 2) {
        drag.current.on = false
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        t2d.current = Math.sqrt(dx*dx + dy*dy)
      }
    }
    const tm = e => {
      if (!inter.current) return
      e.preventDefault()
      if (e.touches.length === 1 && drag.current.on) {
        const dx = e.touches[0].clientX - drag.current.px
        const dy = e.touches[0].clientY - drag.current.py
        cam.current.x -= dx;  cam.current.y -= dy
        drag.current.px = e.touches[0].clientX
        drag.current.py = e.touches[0].clientY
      } else if (e.touches.length === 2) {
        const dx   = e.touches[0].clientX - e.touches[1].clientX
        const dy   = e.touches[0].clientY - e.touches[1].clientY
        const dist = Math.sqrt(dx*dx + dy*dy)
        cam.current.z = Math.max(.2, Math.min(3, cam.current.z + (dist - t2d.current) * .006))
        t2d.current   = dist
      }
    }
    const te = () => { drag.current.on = false }

    // —— 滚轮缩放 ——
    const wh = e => {
      if (!inter.current) return
      e.preventDefault()
      cam.current.z = Math.max(.2, Math.min(3, cam.current.z + (e.deltaY > 0 ? -.09 : .09)))
    }

    c.addEventListener('mousedown',  dn)
    addEventListener('mousemove',    mm, { passive: true })
    addEventListener('mouseup',      up)
    c.addEventListener('touchstart', ts, { passive: false })
    c.addEventListener('touchmove',  tm, { passive: false })
    c.addEventListener('touchend',   te, { passive: true  })
    c.addEventListener('wheel',      wh, { passive: false })

    return () => {
      c.removeEventListener('mousedown',  dn)
      removeEventListener('mousemove',    mm)
      removeEventListener('mouseup',      up)
      c.removeEventListener('touchstart', ts)
      c.removeEventListener('touchmove',  tm)
      c.removeEventListener('touchend',   te)
      c.removeEventListener('wheel',      wh)
    }
  }, [])

  return (
    <canvas
      ref={cvs}
      style={{
        position: 'fixed',
        inset: 0,
        display: 'block',
        zIndex: 0,
        pointerEvents: 'none',
      }}
    />
  )
})

StarCanvas.displayName = 'StarCanvas'
export default StarCanvas
