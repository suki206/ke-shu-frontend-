/**
 * dustCommon — 星尘各视图共用的度量与配色
 *
 * 三个视图（深空 REVERIE / 星图 CONSTELLATIONS / 列表 TRACES·BREATH·NOON）
 * 必须对同一条记忆给出同一个颜色、同一个"有多亮"的判断，否则在深空里
 * 是暖核的那颗，到了星图里变成另一种蓝，人会立刻觉得这不是同一片宇宙。
 * 所以所有跟"记忆长什么样"有关的计算都收在这里，只有一份。
 *
 * 整体基调：冷。效价（valence）只在冷—青之间摆动，暖色是留给
 * 高重要度记忆的唯一特权，出现得越少越像"高光"。
 */

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v))

// ── 字符串 → 稳定伪随机（同一 bucketId / domain 每次结果一致）────
export function hashSeed(str) {
  let h = 2166136261
  for (let i = 0; i < String(str).length; i++) {
    h ^= String(str).charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}
export function mulberry32(seed) {
  let a = seed
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ── 冷邃基调的效价色轴 ────────────────────────────────────────
// 负效价沉向深蓝，中性是石板灰蓝，正效价浮向淡青——全程不进暖区。
const V_NEG = [74, 110, 168]
const V_MID = [132, 151, 173]
const V_POS = [143, 196, 192]
// 暖核：只有高重要度记忆的核心才会染上这一点琥珀
export const WARM_CORE = [242, 201, 140]
export const WARM_CORE_HEX = '#f2c98c'

function lerp3(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}
export function valenceRGB(v) {
  if (!Number.isFinite(v)) return V_MID.slice()
  const t = clamp(v, -1, 1)
  return t >= 0 ? lerp3(V_MID, V_POS, t) : lerp3(V_MID, V_NEG, -t)
}
export function valenceHex(v) {
  const [r, g, b] = valenceRGB(v).map(n => Math.round(n))
  return `rgb(${r},${g},${b})`
}
export function valenceRGB01(v) {
  return valenceRGB(v).map(n => n / 255)
}

// ── 域分色 ────────────────────────────────────────────────────
// 八个彼此可辨、又都偏冷的色相；最后一个沙金留给"杂项"类的域，
// 数量上是少数，不会破坏整体冷调。
export const DOMAIN_PALETTE = [
  '#6f9fd8', // 天青
  '#8fc4c0', // 海绿
  '#9b8fd0', // 紫罗兰
  '#79b39c', // 苔绿
  '#c0a2c7', // 藕紫
  '#6d8cb8', // 钢蓝
  '#a9b8cf', // 银蓝
  '#cbb18a', // 沙金
]
export const DOMAIN_UNKNOWN = '#7d8fa6'

export function domainColor(domain) {
  if (!domain) return DOMAIN_UNKNOWN
  return DOMAIN_PALETTE[hashSeed(domain) % DOMAIN_PALETTE.length]
}

/** 按出现频次排序的域列表，附带颜色与计数 —— 图例、快捷筛选都用它 */
export function domainStats(memories) {
  const map = new Map()
  memories.forEach(m => {
    const d = m.domain || ''
    if (!d) return
    map.set(d, (map.get(d) || 0) + 1)
  })
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([domain, count]) => ({ domain, count, color: domainColor(domain) }))
}

// ── 重要度 ────────────────────────────────────────────────────
// 后端给的是固定 0–10 整数评分，尺度锁死，不做自适应。
// 自适应看起来更"聪明"，实际是有害的：记忆池里恰好没有高分记忆时，
// 一条 5 分的会被推成满分、错误地染上暖核。暖核要有绝对意义，
// 分母就必须是常数。
export const IMPORTANCE_MAX = 10

export function importanceNorm(mem) {
  if (!mem || !Number.isFinite(mem.importance)) return null
  return clamp(mem.importance / IMPORTANCE_MAX, 0, 1)
}
/**
 * 缺重要度时的兜底。定位用的场合传 0.5（老实地摆在中位），
 * 评分用的场合走默认 0.45（略低于中位——不知道就不该被奖励）。
 * 两种场合都会另外用虚线圈标出来。
 */
export function importanceNormSafe(mem, fallback = 0.45) {
  const n = importanceNorm(mem)
  return n === null ? fallback : n
}
/** 给人看的原始分：整数评分直接显示 7/10，比换算成百分比更贴近后端语义 */
export function importanceText(mem) {
  return Number.isFinite(mem?.importance) ? `${mem.importance}/${IMPORTANCE_MAX}` : '未知'
}
/**
 * 暖核强度：7 分开始泛暖，10 分满暖。三个视图共用这一条，
 * 深空里的暖核、星图里的暖心、列表里的暖点才会同时亮起。
 */
export function warmth(mem) {
  if (!Number.isFinite(mem?.importance)) return 0
  return clamp((mem.importance - 6.5) / 3.5, 0, 1)
}

// ── 鲜明度 / 情绪强度 / 高光评分 ──────────────────────────────
export function vividness(mem) {
  return 1 - clamp(Number.isFinite(mem?.fadeLevel) ? mem.fadeLevel : 0.5, 0, 1)
}
export function emotionIntensity(mem) {
  const v = Number.isFinite(mem?.valence) ? Math.abs(mem.valence) : 0
  const a = Number.isFinite(mem?.arousal) ? Math.abs(mem.arousal) : 0
  return clamp(Math.max(v, a), 0, 1)
}
/**
 * NOON 用的高光分：重要度占大头，情绪强度次之，还没被遗忘的加成。
 * 置顶记忆直接抬一档——用户手动 pin 过的东西不该被算法排下去。
 */
export function highlightScore(mem) {
  const imp = importanceNormSafe(mem)
  const base = 0.46 * imp + 0.30 * emotionIntensity(mem) + 0.24 * vividness(mem)
  return mem?.pinned === true ? Math.min(1, base + 0.18) : base
}

// ── 搜索匹配 ──────────────────────────────────────────────────
export function matchMemory(mem, query) {
  const q = (query || '').trim().toLowerCase()
  if (!q) return true
  return (mem.summary || '').toLowerCase().includes(q)
      || (mem.domain || '').toLowerCase().includes(q)
}

// ── 时间 ──────────────────────────────────────────────────────
// 后端按「最后活跃」时间戳算 daysSinceActive，正常每条都有；
// 拿不到时返回 null，前端统一按 3 天兜底。兜底只影响位置，
// 标签仍然如实写"时间未知"，不假装知道。
export const DEFAULT_DAYS = 3

export function daysOf(mem) {
  return Number.isFinite(mem?.daysSinceActive) ? Math.max(0, mem.daysSinceActive) : null
}
/** 必须有坐标的场合用这个：null → 3 天 */
export function daysForPlot(mem) {
  const d = daysOf(mem)
  return d === null ? DEFAULT_DAYS : d
}
export function daysLabel(days) {
  if (days === null) return '时间未知'
  if (days < 1) return '今天'
  if (days < 2) return '昨天'
  if (days < 7) return `${Math.round(days)} 天前`
  if (days < 30) return `${Math.round(days / 7)} 周前`
  if (days < 365) return `${Math.round(days / 30)} 个月前`
  return `${Math.floor(days / 365)} 年前`
}
/** TRACES 的分组：越近的桶越细，越远的桶越粗，符合人回忆的粒度 */
export const DAY_BUCKETS = [
  { key: 'today',   label: '今天',     max: 1 },
  { key: 'yest',    label: '昨天',     max: 2 },
  { key: 'week',    label: '本周',     max: 7 },
  { key: 'fort',    label: '两周内',   max: 14 },
  { key: 'month',   label: '一个月内', max: 30 },
  { key: 'older',   label: '更早',     max: Infinity },
]
export function bucketOf(mem) {
  // 用兜底值分组，缺时间戳的会落进「本周」；条目自己的 meta 仍写"时间未知"，
  // 所以不会骗人，也不会为几条异常数据多开一个孤零零的分组
  const d = daysForPlot(mem)
  for (let i = 0; i < DAY_BUCKETS.length; i++) {
    if (d < DAY_BUCKETS[i].max) return { ...DAY_BUCKETS[i], order: i }
  }
  return { ...DAY_BUCKETS[DAY_BUCKETS.length - 1], order: DAY_BUCKETS.length - 1 }
}

// ── 摘要裁剪 ──────────────────────────────────────────────────
export function trimSummary(text, max = 46) {
  const s = (text || '').replace(/\s+/g, ' ').trim()
  if (!s) return '（这段记忆没有留下文字）'
  return s.length > max ? s.slice(0, max) + '…' : s
}

// ── 搜索历史（BREATH 用，纯前端，零后端调用）────────────────
const HISTORY_KEY = 'presence.dust.searchHistory.v1'
const HISTORY_MAX = 10
export function loadSearchHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    const arr = raw ? JSON.parse(raw) : []
    return Array.isArray(arr) ? arr.filter(s => typeof s === 'string') : []
  } catch { return [] }
}
export function pushSearchHistory(query) {
  const q = (query || '').trim()
  if (!q) return loadSearchHistory()
  const next = [q, ...loadSearchHistory().filter(s => s !== q)].slice(0, HISTORY_MAX)
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(next)) } catch {}
  return next
}
export function clearSearchHistory() {
  try { localStorage.removeItem(HISTORY_KEY) } catch {}
  return []
}
