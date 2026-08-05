import { useState, useEffect, useRef } from 'react'
import axios from 'axios'

const API_BASE = 'https://ke-shu-backend.onrender.com/api'

// 防缓存
axios.interceptors.request.use(config => {
  if (config.method === 'get') {
    config.params = { ...config.params, _t: Date.now() }
  }
  return config
})

// ========== 主题配置 ==========
const THEMES = ['warm', 'mist', 'noir']
const THEME_LABELS = { warm: 'Warm', mist: 'Mist', noir: 'Noir' }
const THEME_META_COLOR = { warm: '#F6EDE0', mist: '#EFF2F4', noir: '#16181C' }

// 每个主题对应的花种：暖阳蔷薇 / 雾霭铃兰 / 夜阑紫藤
const THEME_FLOWER = { warm: 'rose', mist: 'lily', noir: 'wisteria' }
const THEME_FLOWER_NAME = { warm: '蔷薇', mist: '铃兰', noir: '紫藤' }

// 开屏配色（三主题同一片夜空，星尘颜色不同）
const SPLASH_PALETTE = {
  warm: {
    bg: '#0B0906',
    dust: ['#FFE7C6', '#F2CFA6', '#FFFFFF', '#D9A96E'],
    nebula: ['rgba(148, 96, 44, 0.22)', 'rgba(96, 66, 118, 0.12)'],
    ring: 'rgba(214, 172, 124, 0.55)'
  },
  mist: {
    bg: '#06090D',
    dust: ['#DDEDFB', '#B5D2EC', '#FFFFFF', '#8CB3D8'],
    nebula: ['rgba(44, 88, 134, 0.22)', 'rgba(88, 118, 150, 0.14)'],
    ring: 'rgba(150, 190, 224, 0.5)'
  },
  noir: {
    bg: '#06070B',
    dust: ['#F0E8FF', '#C7B4E9', '#FFFFFF', '#C9AD86'],
    nebula: ['rgba(96, 62, 142, 0.24)', 'rgba(46, 72, 122, 0.18)'],
    ring: 'rgba(180, 155, 212, 0.55)'
  }
}

// ========== 图标 ==========
const Icon = {
  Menu: (p) => (
    <svg width={p.size || 20} height={p.size || 20} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <line x1="4" y1="7" x2="20" y2="7" /><line x1="4" y1="12" x2="20" y2="12" /><line x1="4" y1="17" x2="14" y2="17" />
    </svg>
  ),
  Edit: (p) => (
    <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  ),
  Trash: (p) => (
    <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 7h16" /><path d="M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" /><path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" />
    </svg>
  ),
  Plus: (p) => (
    <svg width={p.size || 14} height={p.size || 14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  Close: (p) => (
    <svg width={p.size || 16} height={p.size || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <line x1="5" y1="5" x2="19" y2="19" /><line x1="19" y1="5" x2="5" y2="19" />
    </svg>
  ),
  ArrowUp: (p) => (
    <svg width={p.size || 16} height={p.size || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <line x1="12" y1="19" x2="12" y2="5" /><polyline points="6 11 12 5 18 11" />
    </svg>
  ),
  Moon: (p) => (
    <svg width={p.size || 16} height={p.size || 16} viewBox="0 0 24 24" fill="currentColor" stroke="none">
      <path d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z" />
    </svg>
  )
}

const SettingsIcon = (p) => (
  <svg width={p.size || 16} height={p.size || 16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1" />
  </svg>
)

// ========== 头像 ==========
const UserAvatar = ({ size = 30 }) => (
  <div style={{
    width: size, height: size, borderRadius: '50%', flexShrink: 0,
    background: 'var(--c-bubble-user-bg)',
    border: '1px solid var(--c-bubble-user-border)',
    boxShadow: '0 2px 10px var(--c-shadow), inset 0 1px 0 var(--c-highlight)'
  }} />
)

const AIAvatar = ({ size = 30 }) => (
  <div style={{
    position: 'relative', width: size, height: size, borderRadius: '50%', flexShrink: 0, overflow: 'hidden',
    background: 'radial-gradient(circle at 32% 28%, var(--c-accent-soft), var(--c-accent) 68%, var(--c-text) 150%)',
    boxShadow: '0 2px 12px var(--c-shadow), inset 0 0 0 1px var(--c-border)'
  }}>
    <div style={{
      position: 'absolute', width: size * 0.86, height: size * 0.86, borderRadius: '50%',
      background: 'var(--c-bg-solid)', top: '-8%', left: '32%', opacity: 0.94
    }} />
  </div>
)

// ========== 品牌字标 ==========
const Wordmark = ({ size = 'md' }) => (
  <span className={`wordmark wordmark-${size}`}>
    <span className="wordmark-part">ke</span>
    <span className="wordmark-amp">&amp;</span>
    <span className="wordmark-part">shu</span>
  </span>
)

// ========== 六层氛围背景 ==========
const AmbientBackdrop = () => (
  <div className="ambient-bg">
    <div className="ambient-aurora" />
    <div className="blob" /><div className="blob" /><div className="blob" />
    <div className="blob" /><div className="blob" /><div className="blob" />
    <div className="ambient-stars" />
    <div className="ambient-grain" />
    <div className="ambient-vignette" />
  </div>
)

// ============================================================
// 1. 开屏页：星辰汇聚成 "I am here"
//    - 粒子从四周缓缓聚拢，成字后不再重播，只保留细微浮动
//    - BEGIN 始终可点，随时可以进去
// ============================================================
const SplashScreen = ({ onEnter, theme }) => {
  const canvasRef = useRef(null)
  const [fadeOut, setFadeOut] = useState(false)
  const [visible, setVisible] = useState(true)
  const pal = SPLASH_PALETTE[theme] || SPLASH_PALETTE.noir

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')

    let raf = 0
    let cancelled = false
    let W = 0, H = 0, cx = 0, cy = 0
    let particles = [], bgStars = [], rings = [], motes = []
    let shooting = null, nextShoot = 6200
    let startedAt = 0

    const hexToRgb = (h) => {
      const n = parseInt(h.replace('#', ''), 16)
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
    }

    const makeSprite = (hex) => {
      const [r, g, b] = hexToRgb(hex)
      const c = document.createElement('canvas')
      c.width = c.height = 26
      const x = c.getContext('2d')
      const grd = x.createRadialGradient(13, 13, 0, 13, 13, 13)
      grd.addColorStop(0, `rgba(${r},${g},${b},1)`)
      grd.addColorStop(0.3, `rgba(${r},${g},${b},0.6)`)
      grd.addColorStop(0.65, `rgba(${r},${g},${b},0.14)`)
      grd.addColorStop(1, `rgba(${r},${g},${b},0)`)
      x.fillStyle = grd
      x.fillRect(0, 0, 26, 26)
      return c
    }

    const sprites = pal.dust.map(makeSprite)
    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v)

    const setup = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2)
      W = canvas.clientWidth || window.innerWidth
      H = canvas.clientHeight || window.innerHeight
      canvas.width = Math.round(W * dpr)
      canvas.height = Math.round(H * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      cx = W / 2
      cy = H * 0.42

      // 把 "I am here" 画进离屏画布，再采样成粒子目标点
      const ow = Math.max(320, Math.min(Math.round(W), 1000))
      const oh = 240
      const off = document.createElement('canvas')
      off.width = ow
      off.height = oh
      const o = off.getContext('2d')
      const fs = Math.max(42, Math.min(ow * 0.145, 104))
      o.fillStyle = '#fff'
      o.textAlign = 'center'
      o.textBaseline = 'middle'
      try { o.letterSpacing = `${Math.round(fs * 0.09)}px` } catch (e) { /* 旧内核忽略 */ }
      o.font = `italic 500 ${fs}px "Cormorant Garamond", Georgia, serif`
      o.fillText('I am here', ow / 2, oh / 2)

      const data = o.getImageData(0, 0, ow, oh).data
      const gap = fs > 76 ? 3 : 2
      const pts = []
      for (let y = 0; y < oh; y += gap) {
        for (let x = 0; x < ow; x += gap) {
          if (data[(y * ow + x) * 4 + 3] > 118) pts.push([x, y])
        }
      }

      const far = Math.max(W, H)
      particles = pts.map(([px, py]) => {
        const tx = cx + (px - ow / 2) + (Math.random() - 0.5) * gap
        const ty = cy + (py - oh / 2) + (Math.random() - 0.5) * gap
        const a = Math.random() * Math.PI * 2
        const rad = far * (0.55 + Math.random() * 0.9)
        const norm = Math.abs(px - ow / 2) / (ow / 2)
        const roll = Math.random()
        return {
          tx, ty,
          sx: cx + Math.cos(a) * rad,
          sy: cy + Math.sin(a) * rad * 0.72,
          delay: 300 + norm * 340 + Math.random() * 640,
          dur: 1450 + Math.random() * 980,
          sprite: roll < 0.06 ? 3 : roll < 0.30 ? 2 : roll < 0.66 ? 1 : 0,
          size: 2.1 + Math.random() * 2.5,
          ph: Math.random() * Math.PI * 2,
          sp: 0.00055 + Math.random() * 0.0009,
          amp: 1.1 + Math.random() * 2.3
        }
      })

      bgStars = Array.from({ length: 190 }, () => ({
        x: Math.random() * W,
        y: Math.random() * H,
        r: 0.5 + Math.random() * 1.5,
        ph: Math.random() * 6.2832,
        sp: 0.0004 + Math.random() * 0.0013,
        a: 0.22 + Math.random() * 0.6
      }))

      rings = [
        { rx: W * 0.44, ry: W * 0.135, rot: -0.22, sp: 0.000032, a: 0.42 },
        { rx: W * 0.58, ry: W * 0.185, rot: 0.18, sp: -0.000024, a: 0.30 },
        { rx: W * 0.31, ry: W * 0.085, rot: 0.44, sp: 0.000046, a: 0.34 }
      ]
      motes = rings.map((r, i) => ({ ring: i, t: Math.random() * 6.2832, sp: 0.00042 + i * 0.00013 }))
    }

    const draw = (now) => {
      if (cancelled) return
      const t = now - startedAt

      // 底色 + 星云
      ctx.globalCompositeOperation = 'source-over'
      ctx.globalAlpha = 1
      ctx.fillStyle = pal.bg
      ctx.fillRect(0, 0, W, H)

      const drift = Math.sin(t * 0.00006) * 40
      const n1 = ctx.createRadialGradient(W * 0.32 + drift, H * 0.3, 0, W * 0.32 + drift, H * 0.3, W * 0.8)
      n1.addColorStop(0, pal.nebula[0])
      n1.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = n1
      ctx.fillRect(0, 0, W, H)

      const n2 = ctx.createRadialGradient(W * 0.74 - drift, H * 0.66, 0, W * 0.74 - drift, H * 0.66, W * 0.72)
      n2.addColorStop(0, pal.nebula[1])
      n2.addColorStop(1, 'rgba(0,0,0,0)')
      ctx.fillStyle = n2
      ctx.fillRect(0, 0, W, H)

      ctx.globalCompositeOperation = 'lighter'

      // 背景星点
      for (let i = 0; i < bgStars.length; i++) {
        const s = bgStars[i]
        const tw = 0.55 + 0.45 * Math.sin(t * s.sp + s.ph)
        ctx.globalAlpha = s.a * tw * 0.75
        const d = s.r * 7
        ctx.drawImage(sprites[2], s.x - d / 2, s.y - d / 2, d, d)
      }

      // 轨道环
      const ringFade = clamp((t - 700) / 2200, 0, 1)
      ctx.lineWidth = 1
      for (let i = 0; i < rings.length; i++) {
        const r = rings[i]
        ctx.save()
        ctx.translate(cx, cy)
        ctx.rotate(r.rot + t * r.sp)
        ctx.globalAlpha = r.a * ringFade * 0.5
        ctx.strokeStyle = pal.ring
        ctx.beginPath()
        ctx.ellipse(0, 0, r.rx, r.ry, 0, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }

      // 沿轨道游走的亮点
      for (let i = 0; i < motes.length; i++) {
        const m = motes[i]
        const r = rings[m.ring]
        const ang = m.t + t * m.sp
        const rot = r.rot + t * r.sp
        const ex = Math.cos(ang) * r.rx
        const ey = Math.sin(ang) * r.ry
        const x = cx + ex * Math.cos(rot) - ey * Math.sin(rot)
        const y = cy + ex * Math.sin(rot) + ey * Math.cos(rot)
        ctx.globalAlpha = 0.75 * ringFade
        ctx.drawImage(sprites[3], x - 9, y - 9, 18, 18)
      }

      // 字体粒子
      let done = 0
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i]
        const e = clamp((t - p.delay) / p.dur, 0, 1)
        const k = 1 - Math.pow(1 - e, 3)
        let x, y, sizeMul
        if (e >= 1) {
          done++
          x = p.tx + Math.sin(t * p.sp + p.ph) * p.amp
          y = p.ty + Math.cos(t * p.sp * 0.78 + p.ph) * p.amp * 0.62
          sizeMul = 1
        } else {
          x = p.sx + (p.tx - p.sx) * k
          y = p.sy + (p.ty - p.sy) * k
          sizeMul = 1.75 - 0.75 * k
        }
        ctx.globalAlpha = Math.min(1, e * 1.7) * (0.62 + 0.38 * Math.sin(t * p.sp * 1.5 + p.ph))
        const d = p.size * sizeMul * 4.2
        ctx.drawImage(sprites[p.sprite], x - d / 2, y - d / 2, d, d)
      }

      // 成字后的柔光
      const settle = particles.length ? done / particles.length : 0
      if (settle > 0.2) {
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.min(W * 0.5, 380))
        g.addColorStop(0, pal.ring)
        g.addColorStop(1, 'rgba(0,0,0,0)')
        ctx.globalAlpha = (settle - 0.2) * 0.14 * (0.8 + 0.2 * Math.sin(t * 0.0009))
        ctx.fillStyle = g
        ctx.fillRect(0, 0, W, H)
      }

      // 偶尔一颗流星
      if (!shooting && t > nextShoot) {
        shooting = {
          x: Math.random() * W * 0.7,
          y: Math.random() * H * 0.4,
          vx: 0.42 + Math.random() * 0.3,
          vy: 0.2 + Math.random() * 0.16,
          life: 0
        }
        nextShoot = t + 7000 + Math.random() * 7000
      }
      if (shooting) {
        shooting.life += 16
        shooting.x += shooting.vx * 16
        shooting.y += shooting.vy * 16
        const lf = clamp(1 - shooting.life / 1100, 0, 1)
        ctx.globalAlpha = lf * 0.55
        const grd = ctx.createLinearGradient(shooting.x - shooting.vx * 90, shooting.y - shooting.vy * 90, shooting.x, shooting.y)
        grd.addColorStop(0, 'rgba(255,255,255,0)')
        grd.addColorStop(1, pal.dust[2])
        ctx.strokeStyle = grd
        ctx.lineWidth = 1.4
        ctx.beginPath()
        ctx.moveTo(shooting.x - shooting.vx * 90, shooting.y - shooting.vy * 90)
        ctx.lineTo(shooting.x, shooting.y)
        ctx.stroke()
        if (lf <= 0) shooting = null
      }

      ctx.globalAlpha = 1
      ctx.globalCompositeOperation = 'source-over'
      raf = requestAnimationFrame(draw)
    }

    const begin = () => {
      if (cancelled) return
      setup()
      startedAt = performance.now()
      raf = requestAnimationFrame(draw)
    }

    // 等字体就绪再采样，最多等 1.2s
    if (document.fonts && document.fonts.ready) {
      Promise.race([
        document.fonts.ready,
        new Promise(r => setTimeout(r, 1200))
      ]).then(begin)
    } else {
      begin()
    }

    let rt = 0
    const onResize = () => {
      clearTimeout(rt)
      rt = setTimeout(() => { if (!cancelled && startedAt) setup() }, 220)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      clearTimeout(rt)
      window.removeEventListener('resize', onResize)
    }
  }, [theme])

  const handleClick = () => {
    setFadeOut(true)
    setTimeout(() => {
      setVisible(false)
      onEnter()
    }, 780)
  }

  if (!visible) return null

  return (
    <div
      className="splash-screen"
      data-sp={theme}
      style={{
        opacity: fadeOut ? 0 : 1,
        transform: fadeOut ? 'scale(1.06)' : 'scale(1)',
        filter: fadeOut ? 'blur(10px)' : 'blur(0px)'
      }}
      aria-label="I am here"
    >
      <canvas ref={canvasRef} className="splash-canvas" />
      <div className="splash-foot">
        <div className="splash-caption">
          ke <span className="amp">&amp;</span> shu
        </div>
        <button className="splash-begin" onClick={handleClick}>BEGIN</button>
      </div>
    </div>
  )
}

// ============================================================
// 2. 花藤：每个主题一种花
//    warm 蔷薇 · mist 铃兰 · noir 紫藤
// ============================================================
const rnd = (i, s = 1) => {
  const v = Math.sin(i * 127.1 + s * 311.7) * 43758.5453
  return v - Math.floor(v)
}

// 紫藤：垂坠花串，灰藤紫渐变
const Wisteria = ({ x, y, s = 1, seed = 1, delay = 0 }) => {
  const beads = []
  const n = 13
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    const yy = t * 70
    const spread = (1 - t) * 9.5 + 1.6
    const j = (rnd(i, seed) - 0.5) * 3.2
    beads.push({ cx: -spread * 0.5 + j, cy: yy, r: Math.max(1.2, 5.4 - t * 3.2) })
    if (i < n - 3) beads.push({ cx: spread * 0.5 + j * 0.5, cy: yy + 5, r: Math.max(1, 4.6 - t * 2.7) })
  }
  const body = beads.map((b, i) => (
    <circle key={i} className={i % 3 === 0 ? 'petal-pale' : i % 3 === 1 ? 'petal' : 'petal-back'} cx={b.cx} cy={b.cy} r={b.r} />
  ))
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g className="vine-cluster" style={{ animationDelay: `${delay}s` }}>
        <g className="sway" style={{ animationDelay: `${(delay * 0.6).toFixed(2)}s` }}>
          <g className="cluster-soft">{body}</g>
          <g className="cluster-crisp">{body}</g>
        </g>
      </g>
    </g>
  )
}

// 蔷薇：层叠花瓣的小玫瑰
const Rose = ({ x, y, s = 1, seed = 1, delay = 0 }) => {
  const body = (
    <>
      {[0, 1, 2, 3, 4, 5].map(i => (
        <ellipse key={`o${i}`} className="petal-back" cx="0" cy="-6.6" rx="7.6" ry="5.4" transform={`rotate(${i * 60 + rnd(i, seed) * 12})`} />
      ))}
      {[0, 1, 2, 3, 4].map(i => (
        <ellipse key={`m${i}`} className="petal" cx="0" cy="-4.4" rx="5.6" ry="4.2" transform={`rotate(${i * 72 + 30 + rnd(i, seed + 3) * 10})`} />
      ))}
      {[0, 1, 2].map(i => (
        <ellipse key={`i${i}`} className="petal-pale" cx="0" cy="-2.4" rx="3.4" ry="2.8" transform={`rotate(${i * 120 + 55})`} />
      ))}
      <circle className="flower-core" cx="0" cy="0" r="2.1" />
    </>
  )
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g className="vine-cluster" style={{ animationDelay: `${delay}s` }}>
        <g className="sway" style={{ animationDelay: `${(delay * 0.6).toFixed(2)}s` }}>
          <g className="cluster-soft">{body}</g>
          <g className="cluster-crisp">{body}</g>
        </g>
      </g>
    </g>
  )
}

// 铃兰：一串垂挂的小白铃铛
const Lily = ({ x, y, s = 1, seed = 1, delay = 0 }) => {
  const bells = []
  const n = 6
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    const bx = -1 + t * 19 + (rnd(i, seed) - 0.5) * 3.4
    const by = 8 + t * 44
    bells.push({ bx, by, r: 4.7 - t * 1.5 })
  }
  const body = (
    <>
      <path d="M0 0 Q 9 24 20 54" fill="none" stroke="var(--c-vine-mid)" strokeWidth="1.4" strokeLinecap="round" opacity="0.7" />
      {bells.map((b, i) => (
        <g key={i}>
          <path d={`M${b.bx * 0.42} ${b.by * 0.42} Q ${b.bx * 0.8} ${b.by * 0.7} ${b.bx} ${b.by - b.r}`} fill="none" stroke="var(--c-vine-mid)" strokeWidth="0.9" opacity="0.6" />
          <circle className={i % 2 ? 'petal' : 'petal-pale'} cx={b.bx} cy={b.by} r={b.r} />
          <path className={i % 2 ? 'petal' : 'petal-pale'} d={`M${b.bx - b.r} ${b.by} Q ${b.bx - b.r * 0.9} ${b.by + b.r * 1.3} ${b.bx} ${b.by + b.r * 1.35} Q ${b.bx + b.r * 0.9} ${b.by + b.r * 1.3} ${b.bx + b.r} ${b.by} Z`} />
          <circle className="flower-core" cx={b.bx} cy={b.by + b.r * 0.9} r="1" opacity="0.6" />
        </g>
      ))}
    </>
  )
  return (
    <g transform={`translate(${x} ${y}) scale(${s})`}>
      <g className="vine-cluster" style={{ animationDelay: `${delay}s` }}>
        <g className="sway" style={{ animationDelay: `${(delay * 0.6).toFixed(2)}s` }}>
          <g className="cluster-soft">{body}</g>
          <g className="cluster-crisp">{body}</g>
        </g>
      </g>
    </g>
  )
}

const FLOWER_COMP = { rose: Rose, lily: Lily, wisteria: Wisteria }

const VineDefs = () => (
  <defs>
    <linearGradient id="vineStroke" x1="0" y1="0" x2="0.35" y2="1">
      <stop offset="0%" style={{ stopColor: 'var(--c-vine-light)', stopOpacity: 0.15 }} />
      <stop offset="20%" style={{ stopColor: 'var(--c-vine-main)', stopOpacity: 0.95 }} />
      <stop offset="62%" style={{ stopColor: 'var(--c-vine-mid)', stopOpacity: 0.85 }} />
      <stop offset="100%" style={{ stopColor: 'var(--c-vine-light)', stopOpacity: 0.12 }} />
    </linearGradient>
    <filter id="vineSoft" x="-80%" y="-80%" width="260%" height="260%">
      <feGaussianBlur stdDeviation="3.4" />
    </filter>
  </defs>
)

// 侧边栏边框上攀附的花藤
const SidebarVines = ({ theme }) => {
  const Flower = FLOWER_COMP[THEME_FLOWER[theme]] || Wisteria
  const curly = theme === 'warm'

  const leftMain = curly
    ? 'M18 -10 C34 130, 4 236, 30 358 C58 486, 8 596, 26 728 C42 846, 14 940, 22 1080'
    : 'M20 -10 C30 148, 8 278, 38 402 C68 524, 12 654, 28 802 C44 950, 18 1010, 22 1080'
  const leftThin = curly
    ? 'M18 30 C6 140, 46 226, 20 340 C-4 452, 40 566, 16 690 C-6 800, 34 900, 20 1010'
    : 'M20 20 C14 124, 46 242, 20 384 C-6 526, 36 686, 20 848 C10 950, 28 1000, 22 1060'
  const rightMain = 'M262 -10 C240 176, 272 318, 250 480 C228 642, 266 782, 250 942 C238 1030, 262 1050, 258 1080'
  const rightThin = 'M262 60 C274 204, 240 352, 262 502 C284 652, 246 802, 260 952'

  return (
    <div className="vine-wrapper" aria-hidden="true">
      <svg className="vine-top" viewBox="0 0 280 1080" xmlns="http://www.w3.org/2000/svg">
        <VineDefs />

        <path className="vine-glow" d={leftMain} strokeWidth="9" pathLength="1" />
        <path className="vine-glow" d={rightMain} strokeWidth="8" pathLength="1" />

        <path className="vine-path" d={leftMain} strokeWidth="2.8" pathLength="1" />
        <path className="vine-path thin" d={leftThin} strokeWidth="1.3" pathLength="1" style={{ animationDelay: '0.25s' }} />
        <path className="vine-path" d={rightMain} strokeWidth="2.4" pathLength="1" style={{ animationDelay: '0.15s' }} />
        <path className="vine-path thin" d={rightThin} strokeWidth="1.2" pathLength="1" style={{ animationDelay: '0.4s' }} />

        <g transform="rotate(38 56 212)"><ellipse className="vine-leaf" cx="56" cy="212" rx="12" ry="4.6" style={{ animationDelay: '0.9s' }} /></g>
        <g transform="rotate(-32 8 486)"><ellipse className="vine-leaf" cx="8" cy="486" rx="14" ry="5" style={{ animationDelay: '1.15s' }} /></g>
        <g transform="rotate(24 44 612)"><ellipse className="vine-leaf" cx="44" cy="612" rx="10" ry="4" style={{ animationDelay: '1.3s' }} /></g>
        <g transform="rotate(52 234 392)"><ellipse className="vine-leaf" cx="234" cy="392" rx="11" ry="4.2" style={{ animationDelay: '1.0s' }} /></g>
        <g transform="rotate(-46 272 742)"><ellipse className="vine-leaf" cx="272" cy="742" rx="12.5" ry="5" style={{ animationDelay: '1.25s' }} /></g>
        <g transform="rotate(30 248 880)"><ellipse className="vine-leaf" cx="248" cy="880" rx="10" ry="4" style={{ animationDelay: '1.45s' }} /></g>

        <Flower x={17} y={118} s={1.05} seed={2} delay={0.85} />
        <Flower x={31} y={352} s={0.86} seed={5} delay={1.1} />
        <Flower x={15} y={640} s={0.95} seed={9} delay={1.35} />
        <Flower x={259} y={252} s={0.9} seed={4} delay={1.0} />
        <Flower x={263} y={598} s={1.02} seed={7} delay={1.25} />
        <Flower x={255} y={912} s={0.82} seed={11} delay={1.5} />
      </svg>

      <svg className="vine-bottom" viewBox="0 0 280 340" xmlns="http://www.w3.org/2000/svg">
        <path className="vine-path thin" d="M0 330 C56 316, 92 292, 126 262 C158 234, 196 220, 280 216" strokeWidth="1.5" pathLength="1" style={{ animationDelay: '0.6s' }} />
        <g transform="rotate(-28 96 288)"><ellipse className="vine-leaf" cx="96" cy="288" rx="11" ry="4.2" style={{ animationDelay: '1.5s' }} /></g>
        <g transform="rotate(18 196 222)"><ellipse className="vine-leaf" cx="196" cy="222" rx="10" ry="4" style={{ animationDelay: '1.65s' }} /></g>
        <Flower x={54} y={302} s={0.7} seed={13} delay={1.6} />
        <Flower x={228} y={214} s={0.62} seed={17} delay={1.75} />
      </svg>
    </div>
  )
}

// 聊天区右下角的一小枝
const CornerFlourish = ({ theme }) => {
  const Flower = FLOWER_COMP[THEME_FLOWER[theme]] || Wisteria
  return (
    <svg className="corner-flourish" viewBox="0 0 220 220" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <VineDefs />
      <path className="vine-path thin" d="M220 214 C168 206, 130 178, 106 140 C84 106, 62 88, 24 78" strokeWidth="1.6" pathLength="1" />
      <g transform="rotate(-34 128 164)"><ellipse className="vine-leaf" cx="128" cy="164" rx="11" ry="4.2" style={{ animationDelay: '1.1s' }} /></g>
      <g transform="rotate(22 72 94)"><ellipse className="vine-leaf" cx="72" cy="94" rx="10" ry="3.8" style={{ animationDelay: '1.3s' }} /></g>
      <Flower x={100} y={128} s={0.68} seed={21} delay={1.2} />
      <Flower x={34} y={72} s={0.56} seed={29} delay={1.45} />
    </svg>
  )
}

// ============================================================
// 3. 主组件 ChatPage
// ============================================================
const ChatPage = () => {
  const [showSplash, setShowSplash] = useState(() => !sessionStorage.getItem('hasVisited'))
  const [sessionList, setSessionList] = useState([])
  const [activeSessionId, setActiveSessionId] = useState(() => sessionStorage.getItem('activeSessionId') || null)
  const [messages, setMessages] = useState([])
  const [inputText, setInputText] = useState('')
  const [loading, setLoading] = useState(false)
  const [showSetting, setShowSetting] = useState(false)
  const [showSidebar, setShowSidebar] = useState(false)
  const [config, setConfig] = useState({
    system_prompt: '你是温柔贴心的AI伴侣，简短自然回复',
    temperature: 0.7,
    compress_threshold: 3000,
    compress_keep_rounds: 4
  })
  const [archivedList, setArchivedList] = useState([])
  const [hasOlderArchive, setHasOlderArchive] = useState(false)
  const [archiveCursor, setArchiveCursor] = useState(null)
  const [deleteModal, setDeleteModal] = useState({ show: false, sessionId: null, name: '' })
  const [renameModal, setRenameModal] = useState({ show: false, sessionId: null, value: '' })
  const [theme, setTheme] = useState(() => localStorage.getItem('ks_theme') || 'warm')
  const [toasts, setToasts] = useState([])

  const showToast = (message) => {
    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 2500)
  }

  const messageBoxRef = useRef(null)
  const renameInputRef = useRef(null)

  const handleSplashEnter = () => {
    sessionStorage.setItem('hasVisited', 'true')
    setShowSplash(false)
  }

  const scrollBottom = () => {
    setTimeout(() => {
      if (messageBoxRef.current) messageBoxRef.current.scrollTop = messageBoxRef.current.scrollHeight
    }, 50)
  }

  // ---------- API 函数 ----------
  const fetchSessions = async () => {
    try {
      const res = await axios.get(`${API_BASE}/sessions`)
      const sessions = res.data || []
      setSessionList(sessions)
      if (activeSessionId && !sessions.find(s => s.id === activeSessionId)) {
        sessionStorage.removeItem('activeSessionId')
        setActiveSessionId(null); setMessages([]); setArchivedList([]); setHasOlderArchive(false); setArchiveCursor(null)
      }
    } catch (err) { console.error('加载会话列表失败:', err.message); setSessionList([]) }
  }

  const createSession = async () => {
    try {
      const res = await axios.post(`${API_BASE}/session/new`)
      const newSession = res.data
      setSessionList(prev => [newSession, ...prev])
      sessionStorage.setItem('activeSessionId', newSession.id)
      setActiveSessionId(newSession.id); setMessages([]); setArchivedList([]); setHasOlderArchive(false); setArchiveCursor(null); setShowSidebar(false)
    } catch (err) { console.error('创建会话失败:', err.message); showToast('创建会话失败：' + err.message) }
  }

  const switchSession = async (sid) => {
    try {
      sessionStorage.setItem('activeSessionId', sid)
      setActiveSessionId(sid)
      const res = await axios.get(`${API_BASE}/messages/${sid}`)
      setMessages(res.data || [])
      setArchivedList([]); setHasOlderArchive(false); setArchiveCursor(null); setShowSidebar(false)
      try {
        const archiveRes = await axios.get(`${API_BASE}/messages/archived/${sid}?limit=1`)
        if (archiveRes.data?.list?.length > 0) setHasOlderArchive(true)
      } catch (e) { console.error('归档检测失败:', e.message) }
    } catch (err) { console.error('切换会话失败:', err.message) }
  }

  const loadOlderArchive = async () => {
    if (!activeSessionId) return
    try {
      const params = new URLSearchParams(); if (archiveCursor) params.append('cursor', archiveCursor); params.append('limit', '6')
      const res = await axios.get(`${API_BASE}/messages/archived/${activeSessionId}?${params.toString()}`)
      const { list, hasMore } = res.data
      if (list.length > 0) { setArchivedList(prev => [...list, ...prev]); setArchiveCursor(list[0].id) }
      setHasOlderArchive(hasMore)
    } catch (err) { console.error('加载归档失败:', err.message) }
  }

  const renameSession = async (sid, newTitle) => {
    try {
      await axios.put(`${API_BASE}/session/${sid}`, { title: newTitle })
      setSessionList(prev => prev.map(s => s.id === sid ? { ...s, title: newTitle } : s))
      await fetchSessions()
    } catch (err) { console.error('重命名失败:', err.message); showToast('重命名失败：' + err.message); fetchSessions() }
  }

  const handleRenameClick = (sid, currentTitle) => {
    setRenameModal({ show: true, sessionId: sid, value: currentTitle || '' })
    setTimeout(() => renameInputRef.current?.focus(), 50)
  }

  const confirmRename = () => {
    const val = renameModal.value.trim()
    if (val && renameModal.sessionId) renameSession(renameModal.sessionId, val)
    setRenameModal({ show: false, sessionId: null, value: '' })
  }

  const handleDeleteClick = (sid, sname) => setDeleteModal({ show: true, sessionId: sid, name: sname || '这个会话' })

  const confirmDelete = async () => {
    if (!deleteModal.sessionId) return
    try {
      await axios.delete(`${API_BASE}/session/${deleteModal.sessionId}`)
      setSessionList(prev => prev.filter(s => s.id !== deleteModal.sessionId))
      if (activeSessionId === deleteModal.sessionId) {
        sessionStorage.removeItem('activeSessionId'); setActiveSessionId(null); setMessages([]); setArchivedList([]); setHasOlderArchive(false); setArchiveCursor(null)
      }
    } catch (err) { console.error('删除失败:', err.message); showToast('删除失败：' + err.message); fetchSessions() }
    setDeleteModal({ show: false, sessionId: null, name: '' })
  }

  const sendMessage = async () => {
    if (!inputText.trim() || !activeSessionId || loading) return
    const content = inputText.trim()
    setInputText(''); setLoading(true)
    const tempUserMsg = { role: 'user', content, created_at: new Date() }
    setMessages(prev => [...prev, tempUserMsg]); scrollBottom()
    try {
      const res = await axios.post(`${API_BASE}/chat`, { sessionId: activeSessionId, content })
      const aiReply = { role: 'assistant', content: res.data.reply, created_at: new Date() }
      setMessages(prev => [...prev, aiReply])
    } catch (err) {
      setMessages(prev => prev.slice(0, -1))
      showToast('请求失败：' + err.message)
    }
    setLoading(false); scrollBottom()
    try {
      const archiveRes = await axios.get(`${API_BASE}/messages/archived/${activeSessionId}?limit=1`)
      setHasOlderArchive((archiveRes.data?.list?.length || 0) > 0)
    } catch (e) { console.error('归档检测失败:', e.message) }
  }

  const getSettings = async () => {
    try { const res = await axios.get(`${API_BASE}/settings`); setConfig(res.data) }
    catch (err) { console.error('加载设置失败:', err.message) }
  }

  const saveSettings = async () => {
    try { await axios.post(`${API_BASE}/settings`, config); setShowSetting(false); showToast('配置已保存') }
    catch (err) { console.error('保存设置失败:', err.message); showToast('保存失败：' + err.message) }
  }

  // ---------- 生命周期 ----------
  useEffect(() => {
    const init = async () => {
      try {
        const res = await axios.get(`${API_BASE}/sessions`)
        const sessions = res.data || []
        setSessionList(sessions)
        getSettings()
        const savedId = sessionStorage.getItem('activeSessionId')
        if (savedId && sessions.find(s => s.id === savedId)) await switchSession(savedId)
        else if (sessions.length > 0) await switchSession(sessions[0].id)
      } catch (err) { console.error('初始化失败:', err.message) }
    }
    init()
  }, [])

  // ---------- 主题 ----------
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('ks_theme', theme)
    let meta = document.querySelector('meta[name="theme-color"]')
    if (!meta) { meta = document.createElement('meta'); meta.name = 'theme-color'; document.head.appendChild(meta) }
    meta.setAttribute('content', THEME_META_COLOR[theme] || '#F6EDE0')
  }, [theme])

  const cycleTheme = () => {
    const idx = THEMES.indexOf(theme)
    setTheme(THEMES[(idx + 1) % THEMES.length])
  }

  // ---------- 视口适配 ----------
  useEffect(() => {
    const root = document.documentElement
    const updateHeight = () => {
      const h = window.visualViewport ? window.visualViewport.height : window.innerHeight
      root.style.setProperty('--app-height', `${h}px`)
    }
    updateHeight()
    window.visualViewport?.addEventListener('resize', updateHeight)
    window.addEventListener('resize', updateHeight)
    return () => {
      window.visualViewport?.removeEventListener('resize', updateHeight)
      window.removeEventListener('resize', updateHeight)
    }
  }, [])

  // ---------- 工具函数 ----------
  const formatTime = (timeStr) => {
    if (!timeStr) return ''
    const date = new Date(timeStr)
    if (Number.isNaN(date.getTime())) return String(timeStr).slice(0, 16)
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
  }

  const formatDate = (timeStr) => {
    if (!timeStr) return ''
    const date = new Date(timeStr); const now = new Date()
    if (date.toDateString() === now.toDateString()) return '今天'
    const yesterday = new Date(now); yesterday.setDate(yesterday.getDate() - 1)
    if (date.toDateString() === yesterday.toDateString()) return '昨天'
    return `${date.getMonth() + 1}月${date.getDate()}日`
  }

  const groupMessagesByDate = (msgs) => {
    const groups = {}
    msgs.forEach(msg => { const d = formatDate(msg.created_at); if (!groups[d]) groups[d] = []; groups[d].push(msg) })
    return groups
  }

  // ---------- 渲染消息项 ----------
  const renderMsgItem = (msg, key) => {
    const isUser = msg.role === 'user'
    return (
      <div key={key} className="msg-row" style={{ display: 'flex', justifyContent: isUser ? 'flex-end' : 'flex-start', marginBottom: '18px', padding: '0 16px' }}>
        <div style={{ maxWidth: '78%', display: 'flex', flexDirection: isUser ? 'row-reverse' : 'row', alignItems: 'flex-start', gap: '9px' }}>
          {isUser ? <UserAvatar /> : <AIAvatar />}
          <div
            className={`bubble-glass${isUser ? ' is-user' : ''}`}
            style={{ borderRadius: isUser ? '22px 22px 7px 22px' : '22px 22px 22px 7px' }}
          >
            <div className="msg-text">{msg.content}</div>
            <div className="msg-time">{formatTime(msg.created_at)}</div>
          </div>
        </div>
      </div>
    )
  }

  const groupedMessages = groupMessagesByDate(messages)

  return (
    <div
      data-theme={theme}
      style={{
        flex: 1, display: 'flex',
        height: 'var(--app-height, 100dvh)', maxHeight: 'var(--app-height, 100dvh)',
        background: 'var(--c-bg-gradient)', color: 'var(--c-text)',
        fontFamily: 'var(--font-body)', overflow: 'hidden', position: 'relative'
      }}
    >
      <AmbientBackdrop />

      {showSplash && <SplashScreen onEnter={handleSplashEnter} theme={theme} />}

      {/* 遮罩层 */}
      {showSidebar && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'var(--c-overlay)', backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', zIndex: 200, animation: 'fadeIn 0.35s ease' }}
          onClick={() => setShowSidebar(false)}
        />
      )}

      {/* ====== 侧边栏（花藤攀附） ====== */}
      <div
        className="sidebar-panel"
        style={{
          left: showSidebar ? 0 : '-320px',
          boxShadow: showSidebar ? '10px 0 60px var(--c-shadow-deep)' : 'none'
        }}
      >
        {showSidebar && <SidebarVines theme={theme} />}

        <div style={{ position: 'relative', zIndex: 20, display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ padding: '26px 22px 18px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
              <Wordmark size="md" />
              <button
                className="icon-btn"
                onClick={cycleTheme}
                title={`当前：${THEME_LABELS[theme]} · ${THEME_FLOWER_NAME[theme]}`}
                style={{ background: 'transparent', border: '1px solid var(--c-border)', borderRadius: '999px', width: '31px', height: '31px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--c-text-muted)' }}
              >
                <Icon.Moon size={13} />
              </button>
            </div>

            <div style={{ fontSize: '10.5px', color: 'var(--c-text-faint)', letterSpacing: '2.6px', marginBottom: '20px', fontFamily: "'Cormorant Garamond', serif" }}>
              {THEME_LABELS[theme].toUpperCase()} · {THEME_FLOWER_NAME[theme]}
            </div>

            <button
              className="pill-btn"
              onClick={createSession}
              style={{ width: '100%', padding: '13px', borderRadius: '17px', cursor: 'pointer', marginBottom: '4px', fontSize: '13.5px', fontFamily: 'var(--font-body)', letterSpacing: '1.2px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}
            >
              <Icon.Plus size={12} /> 新建对话
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '4px 16px' }}>
            <div style={{ fontSize: '10.5px', color: 'var(--c-text-faint)', marginBottom: '10px', paddingLeft: '6px', letterSpacing: '2.2px', textTransform: 'uppercase', fontFamily: "'Cormorant Garamond', serif" }}>
              最近对话
            </div>
            {sessionList.map(item => (
              <div
                key={item.id}
                className={`session-item${activeSessionId === item.id ? ' is-active' : ''}`}
                style={{
                  padding: '12px 14px 12px 16px', borderRadius: '15px',
                  background: activeSessionId === item.id ? 'var(--c-accent-soft)' : 'transparent',
                  cursor: 'pointer', marginBottom: '5px',
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  border: `1px solid ${activeSessionId === item.id ? 'var(--c-border)' : 'transparent'}`
                }}
                onClick={() => switchSession(item.id)}
              >
                <span style={{ fontSize: '13.5px', color: 'var(--c-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.title}</span>
                <div className="session-actions" style={{ display: 'flex', gap: '2px', flexShrink: 0 }}>
                  <button className="icon-btn" onClick={(e) => { e.stopPropagation(); handleRenameClick(item.id, item.title) }} style={{ background: 'transparent', border: 'none', color: 'var(--c-text-muted)', cursor: 'pointer', padding: '4px' }}><Icon.Edit /></button>
                  <button className="icon-btn" onClick={(e) => { e.stopPropagation(); handleDeleteClick(item.id, item.title) }} style={{ background: 'transparent', border: 'none', color: 'var(--c-text-muted)', cursor: 'pointer', padding: '4px' }}><Icon.Trash /></button>
                </div>
              </div>
            ))}
          </div>

          <div style={{ padding: '16px', borderTop: '1px solid var(--c-border)', position: 'relative', zIndex: 20 }}>
            <button
              className="ghost-btn"
              onClick={() => { setShowSidebar(false); setShowSetting(true) }}
              style={{ width: '100%', padding: '11px', borderRadius: '13px', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '7px' }}
            >
              <SettingsIcon size={14} /> 全局设置
            </button>
          </div>
        </div>
      </div>

      {/* ====== 主聊天区域 ====== */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0, position: 'relative' }}>
        <CornerFlourish theme={theme} />

        <div className="chat-header" style={{ padding: '15px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, zIndex: 2 }}>
          <button className="icon-btn" onClick={() => setShowSidebar(true)} style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--c-text-muted)', display: 'flex' }}>
            <Icon.Menu />
          </button>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: '15.5px', fontStyle: 'italic', color: 'var(--c-text-muted)', letterSpacing: '0.6px', maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {activeSessionId ? (sessionList.find(s => s.id === activeSessionId)?.title || '对话中') : 'ke & shu'}
          </div>
          <div style={{ width: '20px' }} />
        </div>

        <div ref={messageBoxRef} style={{ flex: 1, overflowY: 'auto', padding: '16px 0 8px', overscrollBehavior: 'contain', WebkitOverflowScrolling: 'touch', minHeight: 0, position: 'relative', zIndex: 1 }}>
          {!activeSessionId ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--c-text-faint)', gap: '18px' }}>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: '92px', height: '92px', borderRadius: '50%', border: '1px solid var(--c-border)', boxShadow: '0 0 60px var(--c-accent-soft), inset 0 0 30px var(--c-accent-soft)' }}>
                <AIAvatar size={44} />
              </div>
              <div style={{ fontSize: '14.5px', fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', letterSpacing: '1px' }}>选择或新建一个对话</div>
            </div>
          ) : (
            <>
              {hasOlderArchive && (
                <div style={{ textAlign: 'center', padding: '14px 0 18px' }}>
                  <span
                    onClick={loadOlderArchive}
                    className="ghost-btn"
                    style={{ cursor: 'pointer', padding: '8px 18px', borderRadius: '999px', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '12px', letterSpacing: '0.6px' }}
                  >
                    <Icon.ArrowUp size={11} /> 加载更早的历史
                  </span>
                </div>
              )}

              {archivedList.map((msg, idx) => renderMsgItem(msg, `arch-${idx}`))}

              {Object.entries(groupedMessages).map(([date, msgs]) => (
                <div key={date}>
                  <div className="date-divider">
                    <span className="rule" />
                    <span className="label">{date}</span>
                    <span className="rule" />
                  </div>
                  {msgs.map((msg, idx) => renderMsgItem(msg, `live-${idx}`))}
                </div>
              ))}

              {loading && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '0 16px 8px' }}>
                  <AIAvatar />
                  <div className="bubble-glass" style={{ borderRadius: '22px 22px 22px 7px', padding: '14px 20px' }}>
                    <div className="typing-dots"><span /><span /><span /></div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="composer" style={{ padding: '12px 16px calc(env(safe-area-inset-bottom, 0px) + 14px)', flexShrink: 0, zIndex: 2 }}>
          <div style={{ display: 'flex', gap: '11px', alignItems: 'flex-end' }}>
            <textarea
              className="composer-input"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.ctrlKey && e.key === 'Enter' && sendMessage()}
              placeholder="Tell me everything..."
              rows={1}
            />
            <button className="send-btn" onClick={sendMessage} disabled={loading || !activeSessionId}>
              <Icon.ArrowUp size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Toast 轻提示 */}
      <div className="toast-wrap">
        {toasts.map(t => <div key={t.id} className="toast-item">{t.message}</div>)}
      </div>

      {/* 重命名弹窗 */}
      {renameModal.show && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'var(--c-overlay)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2100, animation: 'fadeIn 0.2s ease' }}
          onClick={() => setRenameModal({ show: false, sessionId: null, value: '' })}
        >
          <div className="glass-modal" style={{ padding: '28px 26px 22px', width: '300px', maxWidth: '86vw' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ fontSize: '16px', fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', color: 'var(--c-text)', marginBottom: '16px', letterSpacing: '0.5px' }}>重命名对话</div>
            <input
              ref={renameInputRef}
              className="field-input"
              value={renameModal.value}
              onChange={(e) => setRenameModal(p => ({ ...p, value: e.target.value }))}
              onKeyDown={(e) => e.key === 'Enter' && confirmRename()}
              style={{ marginBottom: '18px', fontSize: '14px' }}
            />
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="ghost-btn" onClick={() => setRenameModal({ show: false, sessionId: null, value: '' })} style={{ flex: 1, padding: '11px 0', borderRadius: '14px', fontSize: '13.5px' }}>取消</button>
              <button className="pill-btn" onClick={confirmRename} style={{ flex: 1, padding: '11px 0', borderRadius: '14px', fontSize: '13.5px', cursor: 'pointer' }}>确定</button>
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deleteModal.show && (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--c-overlay)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 2000, animation: 'fadeIn 0.2s ease' }}>
          <div className="glass-modal" style={{ padding: '30px 26px 22px', width: '300px', maxWidth: '86vw', textAlign: 'center' }}>
            <div style={{ fontSize: '16px', fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', color: 'var(--c-text)', marginBottom: '8px' }}>确定删除这段对话？</div>
            <div style={{ fontSize: '12.5px', color: 'var(--c-text-muted)', marginBottom: '24px', lineHeight: 1.6 }}>"{deleteModal.name}" 将被永久删除</div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button className="ghost-btn" onClick={() => setDeleteModal({ show: false, sessionId: null, name: '' })} style={{ flex: 1, padding: '11px 0', borderRadius: '14px', fontSize: '13.5px' }}>取消</button>
              <button className="pill-btn" onClick={confirmDelete} style={{ flex: 1, padding: '11px 0', borderRadius: '14px', fontSize: '13.5px', cursor: 'pointer' }}>确定</button>
            </div>
          </div>
        </div>
      )}

      {/* 全局设置弹窗 */}
      {showSetting && (
        <div style={{ position: 'fixed', inset: 0, background: 'var(--c-overlay)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400, padding: '20px' }}>
          <div className="glass-modal" style={{ width: '480px', maxWidth: '100%', maxHeight: '86vh', overflowY: 'auto', padding: '30px' }}>
            <h3 style={{ marginTop: 0, fontWeight: 400, fontFamily: "'Cormorant Garamond', serif", fontStyle: 'italic', fontSize: '21px', color: 'var(--c-text)', marginBottom: '24px', letterSpacing: '0.5px' }}>全局设置</h3>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ fontSize: '10.5px', color: 'var(--c-text-faint)', display: 'block', marginBottom: '11px', letterSpacing: '2.2px', textTransform: 'uppercase' }}>外观</label>
              <div style={{ display: 'flex', gap: '8px' }}>
                {THEMES.map(t => (
                  <button
                    key={t}
                    className="theme-pill"
                    onClick={() => setTheme(t)}
                    style={{
                      flex: 1, padding: '11px 0', borderRadius: '999px',
                      border: `1px solid ${theme === t ? 'var(--c-accent)' : 'var(--c-border)'}`,
                      background: theme === t ? 'var(--c-accent)' : 'transparent',
                      color: theme === t ? 'var(--c-accent-text)' : 'var(--c-text-muted)',
                      fontSize: '12.5px', letterSpacing: '1.2px', cursor: 'pointer',
                      fontFamily: "'Cormorant Garamond', serif", lineHeight: 1.4
                    }}
                  >
                    {THEME_LABELS[t]}
                    <div style={{ fontSize: '9.5px', opacity: 0.7, letterSpacing: '1px', fontFamily: 'var(--font-body)' }}>{THEME_FLOWER_NAME[t]}</div>
                  </button>
                ))}
              </div>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ fontSize: '13px', color: 'var(--c-text-muted)', display: 'block', marginBottom: '7px' }}>系统人设提示词</label>
              <textarea className="field-input" value={config.system_prompt} onChange={(e) => setConfig(p => ({ ...p, system_prompt: e.target.value }))} rows={3} style={{ resize: 'vertical', lineHeight: 1.6 }} />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ fontSize: '13px', color: 'var(--c-text-muted)', display: 'block', marginBottom: '7px' }}>Temperature（随机性）</label>
              <input className="field-input" type="number" step="0.1" min="0" max="1.5" value={config.temperature} onChange={(e) => setConfig(p => ({ ...p, temperature: Number(e.target.value) }))} />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ fontSize: '13px', color: 'var(--c-text-muted)', display: 'block', marginBottom: '7px' }}>记忆压缩阈值 token</label>
              <input className="field-input" type="number" value={config.compress_threshold} onChange={(e) => setConfig(p => ({ ...p, compress_threshold: Number(e.target.value) }))} />
            </div>

            <div style={{ marginBottom: '24px' }}>
              <label style={{ fontSize: '13px', color: 'var(--c-text-muted)', display: 'block', marginBottom: '7px' }}>压缩后保留回合数</label>
              <input className="field-input" type="number" value={config.compress_keep_rounds} onChange={(e) => setConfig(p => ({ ...p, compress_keep_rounds: Number(e.target.value) }))} />
            </div>

            <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button className="ghost-btn" onClick={() => setShowSetting(false)} style={{ padding: '11px 20px', borderRadius: '13px', fontSize: '13px' }}>取消</button>
              <button className="pill-btn" onClick={saveSettings} style={{ padding: '11px 22px', borderRadius: '13px', fontSize: '13px', cursor: 'pointer' }}>保存</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default ChatPage
