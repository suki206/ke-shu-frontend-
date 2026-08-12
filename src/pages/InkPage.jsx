import { useState, useEffect, useRef, useMemo, useCallback, Fragment } from 'react'
import { createPortal } from 'react-dom'
import { daysLabel } from './dustCommon'

// ============================================================
// 合墨 · INK —— 引力页右下角天体子页面，全屏跃迁。
//
// 【本轮重写解决的五件事】
// 1) 底部导航条不再压在写作页上。根因是 .tab-page 带了
//    z-index + transform：前者把这个 fixed 子页锁进它自己的层叠
//    上下文（子页的 2400 出了门只算 1，nav 的 200 反而在上面），
//    后者让 position:fixed 不再相对屏幕而是相对 .tab-page。
//    这里改用 createPortal 挂到 document.body 彻底跳出去，
//    同时给 <html> 加 .ink-open，CSS 把 nav 整条收下去。
// 2) 打字时光标停在屏幕中上部，不会被键盘顶到看不见：用隐藏的
//    镜像层量出光标真实 Y 坐标，把滚动容器滚到"距顶 38%"。
// 3)「✓」＝直接保存，不再弹三选一。交给枢是旁边单独一个图标，
//    点了就一路写完，中途不问。
// 4) 没点保存就返回，尾巴自动存成草稿，列表照常显示"尚未完成"；
//    输入停顿 1.2 秒、切后台、组件卸载也各存一次。
// 5) 轮次：枢接完之后不再默认给一个空输入框，想再添笔要主动点。
// 6) 头部新增「另起一篇」：跟「交给枢」并排，专门用来让枢基于已经
//    写下的内容，另开一个新方向/新场景写一整段——不是接着上一段的
//    情节往下接，而是单独成一段，正文里会有一条分隔线跟前面隔开。
//    只有正文已经有内容（或者尾巴里有还没存的字）时才能点；一张
//    白纸时没有"已经写下的内容"可供另起，跟「交给枢」共用起笔逻辑。
// 7) 段落标签改款：去掉行首【ke】/【shu】方括号标签——柯的段落不再
//    打任何标记（本来就是"我"在写，不需要自报家门），枢的每一段
//    落笔上方换成一枚安静的「· shu」小徽标：斜体、小号、字距拉开，
//    跟头部"INK · 合墨"、卡片meta这类微标签用的是同一套字体/间距
//    语言，不再是一整块加粗方括号杵在段首打断阅读。
// 8) "让枢先起笔"从正文中间一个满宽描边按钮，改成跟"我再添一笔"
//    同一套 .ink-nudge-hint + .ink-hold-btn 的极简文字链接——头部
//    「交给枢写完」图标在正文为空时其实就是同一个动作（交给枢／
//    让枢先起笔本就共用 handOffToShu），没必要在正文里另起一套
//    方框按钮的视觉语言，徒增一个突兀的"卡片"杵在空白页正中间。
// 9) 落笔相关的写请求（存草稿 / 正式落笔）统一走一条串行队列
//    （enqueueWrite）：草稿是 1.2 秒防抖自动发的后台请求，如果手速
//    快，前一次自动存草稿还没返回、后一次「自存」已经把草稿清空
//    发出去了，网络时序一旦乱序到达，姗姗来迟的草稿请求会把刚清空
//    的草稿标记又写回去——列表和详情页会诈尸出一个「尚未完成」。
//    现在同一篇笔记的写请求严格按发起顺序执行，后一个永远等前一个
//    真正落地了才发出，不会再被网络时序打乱。
// 10) 枢决策自动流转（第四批，第七批已废弃见 13①）：曾经的做法是
//    decision=continue/new 时自动接着触发下一轮生成，枢自己跟自己
//    写下去，到 AUTO_CHAIN_LIMIT 才停。这个自动接力已经整个去掉了。
// 11) 列表页板块系统（第五批）：顶部一条横向滑动的板块 tab（【全部】
//    +自定义板块），长按笔记卡片弹出【置顶】【移动到】【删除】——
//    这套菜单和"移动到"的板块选择器复用的是原来"落笔弹层"那一套
//    还没删掉的 .ink-sheet 系列样式（早年三选一改成头部图标之后
//    这套 CSS 一直空着没人用，现在正好接上）。置顶的笔记摘到最前面，
//    用一条跟"另起一篇"分隔线同款的渐隐光丝隔开，板块筛选和置顶
//    互不干扰，一篇笔记可以又置顶又挂在某个板块下。
// 12) 列表页美化（第六批）：卡片改铭文行——去掉背景板/圆角/阴影，
//    行与行之间只留一条极细分隔线，读起来更像手记目录而不是一堆
//    悬浮的 app 卡片。空板块／空列表不再放提示文字，就让页面本身的
//    深色背景空着，"新建一篇"已经是唯一需要的入口。返回时如果尾巴
//    还有没处理的字，弹窗问「存草稿」还是「保存」，不再默认悄悄存
//    成草稿——这一步顺带把 tailTextRef 和 tailText 状态没有严格同步
//    的一个小豁口也补上了（落笔/交给枢/另起一篇清空尾巴时，ref 现在
//    跟 state 同一时刻清零，不用等下一帧的 effect 才追上）。
// 14) 本轮·合墨美化三件事：① 返回列表 / 首次进入时，笔记卡片不再
//    "咔"一下齐刷刷出现——常驻挂载的时间线复用 riseIn 淡入上浮，靠
//    "隐藏态清空 animation → 显示态才有 animation"这条 CSS 选择器
//    切换本身触发重放，不需要额外状态也不需要测量任何像素；板块
//    筛选时新出现的卡片同理会自然带上同一次淡入，已经在场的不会
//    跟着抖一下。笔记详情页（.ink-page-content.is-note）本来就是
//    每次进入真实挂载/卸载，同一套动效直接套上去，点进一篇笔记也
//    有一次轻柔的浮现，不是硬切。② 去掉"先点一下选中展开标题、
//    再点一次才真正进入"这层——星尘墙年代为了在乱序散落的卡片间
//    先"确认"点的是哪一张才留下的手感阻力，时间线卡片顺序固定、
//    标题常驻可读，这层选中态已经没有存在的理由；单击直接进入，
//    长按弹菜单仍是完全独立的另一条通路，不受影响，选中态原本承担
//    的"点一下有反馈"改成一个干脆的按压回弹。③ 长按菜单／移动到／
//    返回确认这几个弹层，撤销"合墨专用降级"（去毛玻璃+去动画）——
//    当年降级是因为星尘墙一屏几十张卡片各自带 backdrop-filter，
//    弹层再叠一层毛玻璃就卡，根源在星尘墙本身；现在时间线已经是
//    不透明实色卡面、零 filter，这层"省下来的性能余量"没有必要
//    继续省，恢复成跟全局 .modal-veil/.modal-card 一样的标准款
//    （背景色淡入、卡片只动 transform 不动 opacity，本来就是设计
//    成不跟 backdrop-filter 打架的那一套），不会比别处已经在用的
//    同一套东西更卡。
// 13) 第七批：① 枢写笔记不再是跟对话完全脱钩的另一个模型——生成
//    请求现在也会拿题目/正文去 Ombre Brain 检索一遍「你记得的事」，
//    跟 /api/chat/stream 用的是同一套记忆，系统提示词里也把"你还是
//    平时聊天那个枢，不是从零开始不认识对方的新模型"这层说清楚，
//    不再让它套用"AI 无法感知痛苦"这类通用模板腔调（见 server.js
//    runInkStream）。② 列表卡片上的落款从"轮到谁写"的动态提示改成
//    "起笔人"——谁先落下第一笔这一篇就署谁的名，草稿阶段（还没有
//    任何 entries）落笔人只可能是真人，不再诈尸出一个「· shu」；
//    这个落款现在常驻显示（不再只在"轮到某人"时才出现），字号也
//    调大了一档。③ "尚未完成"从笔记详情页顶部挪到外部列表卡片上，
//    而且是看得见的文字标签，不再是只有 aria-label、肉眼看不出意思
//    的小圆点。④ 一篇笔记如果从头到尾没落过一个字，点返回就直接
//    删掉这篇，不再留一条空白笔记杵在列表里。⑤ 去掉了枢的决策自动
//    流转（原第 10 条那一套）——枢每写完一段一定会停下来，不会自己
//    接着往下接力写。justGenerated 那个面板现在只给一句状态：「他
//    写完了」/「他想让你续写」/「他想让你另起一篇」，对应 decision
//    的 finalize/continue/new；点"续写"是真人自己在原来这段后面接着
//    写（reopenTail），点"另起一篇"也是真人自己写，只是这一段落笔
//    时会强制标成 mode:'new'（nextModeRef），带上分隔线，视觉上跟
//    "枢自己另起一篇"（头部图标，handOffToShuNew）一致，但执笔的是
//    真人，不是又喊一次枢来写。
// ============================================================

const BackIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 18l-6-6 6-6" />
  </svg>
)
const PlusIcon = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
  </svg>
)
// 删除：一个简洁的垃圾桶，直接对应"删除这篇"这一个动作，不用再
// 经过"更多"菜单绕一层
const TrashIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 7h16" />
    <path d="M9 7V4.8c0-.44.36-.8.8-.8h4.4c.44 0 .8.36.8.8V7" />
    <path d="M6 7l1 12.2c.05.99.87 1.8 1.86 1.8h6.28c.99 0 1.81-.81 1.86-1.8L18 7" />
    <path d="M10 11v6" /><path d="M14 11v6" />
  </svg>
)
const CheckIcon = () => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)
// 交给枢：一道扫过去的笔锋 + 一颗小星
const HandOffIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3.5 19.5c5-.8 9-4 11.5-9.5" />
    <path d="M20.5 3.5C19.4 12 14 17.6 5.5 19.2" />
    <path d="M8.6 4.2l.75 1.55 1.55.75-1.55.75-.75 1.55-.75-1.55L6.3 6.5l1.55-.75z" />
  </svg>
)
// 另起一篇：从写好的这条主线上分出一条新枝
const BranchIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 21v-8" />
    <path d="M12 13c0-4.5-2.8-6.7-6.6-7.7" />
    <path d="M12 13c0-4.5 2.8-6.7 6.6-7.7" />
    <circle cx="12" cy="21" r="1.5" fill="currentColor" stroke="none" />
  </svg>
)
// 撤销/重做：一枚回旋箭头，方向相反
const UndoIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9 14L4 9l5-5" />
    <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
  </svg>
)
const RedoIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 14l5-5-5-5" />
    <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
  </svg>
)
// 置顶：一枚小图钉，钉头 + 一道竖线
const PinIcon = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="ink-pin-icon">
    <path d="M12 17v5" />
    <path d="M8 3h8l-1 6 3 3H6l3-3-1-6z" />
  </svg>
)

const daysSince = (iso) => (iso ? Math.max(0, (Date.now() - new Date(iso).getTime()) / 86400000) : null)
const fmtDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// 光标停在可视区自顶向下 38% 处——比正中稍高一点，眼睛最舒服，
// 下面还留得住刚写的两三行
const CARET_ANCHOR = 0.38
const DRAFT_DEBOUNCE = 1200
// 长按笔记卡片多久算"长按"，太短容易跟滚动手势打架
const LONG_PRESS_MS = 480

// ============================================================
// 时间线列表（第十四批·替换"星尘墙"）：返回列表会闪一下，根因
// 一直卡在"位置得靠 JS 现场算"——水平坐标要用墙的实际像素宽度
// （原来的 wallW）才能算，这个宽度只能等 ResizeObserver 量出来才
// 知道，从"还没测到宽度"到"测到了"之间必然多一帧改判；撕边、
// 多层阴影、"远近"模糊这些效果也都要靠内联 CSS 变量现场传参，
// 一返回就要重新合成整套图层。现在改成固定的"从上到下、一排左
// 一排右"交错排列——每张笔记该在左边还是右边只看它在列表里排第
// 几（奇偶），纯 CSS flex 定位，不再需要测量任何像素宽度，也就
// 没有"测量前/测量后"这一帧可跳。卡片本身也从半透光磨砂纸改成
// 不透明的实色卡面，撕边轮廓、多层阴影、进深模糊一并去掉，绘制
// 成本低很多。光丝网络也改成纯 CSS 画（竖线 + 每张卡片一小段
// 接到竖线上的短线），不再需要 SVG 坐标。
// ============================================================
const buildTimeline = (list) =>
  (list || []).map((n, i) => ({ note: n, side: i % 2 === 0 ? 'left' : 'right' }))

const InkPage = ({
  notes, notesLoading, onFetchNotes, onCreateNote, onUpdateNote, onDeleteNote,
  activeNote, activeNoteLoading, onOpenNote,
  onSaveDraft, onFinalizeEntry, onGenerateEntry, onStopGenerate, onDeleteLastEntry, onUpdateEntry,
  generating, streamText,
  showToast, onClose,
}) => {
  const [view, setView]     = useState('list') // 'list' | 'note'
  // 列表卡片的浮现动画只在"刚回到列表"那一小段时间里允许播放，见下方
  // useEffect 与 App.css 里 .ink-page-content.is-entering 那条规则
  const [listEntering, setListEntering] = useState(true)
  const [openNoteId, setOpenNoteId] = useState(null)
  const [tailText, setTailText]     = useState('')
  const [titleDraft, setTitleDraft] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [justGenerated, setJustGenerated] = useState(false) // 枢刚写完，给"保留/删除这段"的窗口
  const [forceWrite, setForceWrite]       = useState(false) // 枢接完之后，我主动要求再添一笔
  const [leaveConfirm, setLeaveConfirm]   = useState(false) // 返回时尾巴还有字，问"存草稿"还是"保存"

  // ── 编辑自己已经落笔的段落（第八批）：只有 author='ke' 的段落能点开编辑，
  //    枢写的段落没有编辑入口。────────────────────────────────
  const [editingEntry, setEditingEntry] = useState(null) // { id, text } | null

  // ── 撤销/重做（第九批，通用化）：不再只服务"编辑历史段落"这一种
  //    场景——只要真人在动笔（起笔、续写、编辑历史段落），撤销/重做
  //    就都在，固定摆在顶部跟返回箭头并排，不随场景挪位置、不跟着
  //    输入框走。writeHistory/writeHistoryIndex 记的是"当前这个输入
  //    目标"从进入这次书写起的文本快照序列；换一个目标（尾巴 ⇄ 某个
  //    历史段落）历史栈就重新起一条，互不混用。不依赖浏览器原生
  //    Ctrl+Z，手机上也能用 ──────────────────────────────────
  const [writeHistory, setWriteHistory] = useState([])
  const [writeHistoryIndex, setWriteHistoryIndex] = useState(0)
  const writeHistoryTimer = useRef(null)
  // 当前历史栈记的是谁：'tail' | 'entry'，配合 editingEntry 判断落回哪
  const writeHistoryTargetRef = useRef(null)
  // 跟 writeHistoryIndex 状态同步的 ref——防抖定时器里要读"当下真正
  // 最新"的下标，不能用闭包捕获时那一刻的旧值（否则连续快速打字、
  // 中途又撤销过一次的话，压栈会切错位置）
  const writeHistoryIndexRef = useRef(0)
  useEffect(() => { writeHistoryIndexRef.current = writeHistoryIndex }, [writeHistoryIndex])

  // ── 板块 tab（第五批）：null = 全部 ───────────────────────────
  const [activeBoard, setActiveBoard] = useState(null)
  // ── 长按笔记卡片弹出的菜单 / "移动到"面板（第五批）──────────────
  const [cardMenu, setCardMenu] = useState(null)   // { note } | null
  const [confirmCardDelete, setConfirmCardDelete] = useState(false)
  const [moveSheet, setMoveSheet] = useState(null) // { note, newBoard } | null

  // ── 卡片点击（本轮起单击直接进入）────────────────────────────
  // 原来是"先选中抬起标题、再点一次才真正进入"的塔罗牌式两段点击，
  // 星尘墙年代卡片散落无序，先"确认"点的是哪一张有意义；时间线
  // 卡片顺序固定、标题常驻可读，这层选中态已经没有存在的理由，见
  // 下方 handleCardClick——单击就直接开。长按走的是完全独立的另一
  // 条通路（绑在 onMouseDown/onTouchStart 的计时器上），互不打架。

  const bodyRef   = useRef(null)   // 滚动容器
  const tailRef   = useRef(null)   // 尾巴输入框
  const mirrorRef = useRef(null)   // 量光标位置的隐藏镜像层
  const editTextareaRef = useRef(null) // 编辑历史段落时的输入框

  const prevGenerating = useRef(false)
  const loadedNoteRef  = useRef(null)   // 已经把草稿灌进输入框的那篇 id
  const draftTimer     = useRef(null)
  const tailTextRef    = useRef('')
  const noteIdRef      = useRef(null)
  const lastSavedRef   = useRef('')
  const pendingWriteRef = useRef(Promise.resolve()) // 见下方 enqueueWrite
  const nextModeRef     = useRef(null)  // 下一次真人落笔要不要强制标成 'new'（枢建议"另起一篇"、真人自己落笔那一段要带分隔线）
  const longPressTimer = useRef(null)
  const longPressFired = useRef(false)
  // 打开这篇笔记那一刻尾巴长什么样——"恢复原样"就是退回这个快照，
  // 不落笔也不存草稿，正文/草稿状态跟打开前一模一样
  const originalTailRef = useRef('')

  // 【bug 修复】本篇笔记在"这次打开期间"是否已经真正落过笔——独立于
  // props 里的 entries/note.content。落笔（saveNow / handOffToShu /
  // handOffToShuNew）走的是"先调完成接口，再清空尾巴"，但父组件把
  // 新落的这段合并回 activeNote 是异步的；如果落笔接口一返回、还没
  // 等父组件那次 setState 真正传回新的 entries，人就手快点了返回，
  // goBackToList 里"正文和草稿都是空的就直接删掉这篇白纸"的判断此时
  // 拿到的还是旧的 entries（长度 0）——于是把刚存下来的这篇笔记当成
  // 白纸删掉了。手机上网络延迟更大，这个时间窗口被明显放大，看起来
  // 就是"保存了却什么都没留下"。用这个 ref 记一笔"我这次真的落过
  // 笔"，不依赖 props 是否已经追上，从根上堵住误删。
  const committedRef = useRef(false)

  const note    = activeNote?.note
  const entries = activeNote?.entries || []

  // ── 打开这一页期间，把底部导航条收起来 ─────────────────────
  useEffect(() => {
    document.documentElement.classList.add('ink-open')
    return () => document.documentElement.classList.remove('ink-open')
  }, [])

  useEffect(() => { tailTextRef.current = tailText }, [tailText])
  useEffect(() => { noteIdRef.current = openNoteId }, [openNoteId])

  // ── 尾巴输入框自动撑高：跟着内容长，不出现内部滚动条，这样它
  //    才能跟前面的正文严丝合缝接成一整页 ────────────────────
  useEffect(() => {
    const el = tailRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [tailText, generating, view])

  // 编辑历史段落时的输入框——同样跟着内容自动撑高，不出现内部
  // 滚动条，改一段长文字也能整段都看得见，不是挤在一个小方框里
  useEffect(() => {
    const el = editTextareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [editingEntry])

  // ── 光标居中：镜像层量出光标真实 Y，再滚容器 ──────────────
  const keepCaretInView = useCallback((smooth = true) => {
    const ta = tailRef.current, body = bodyRef.current, mirror = mirrorRef.current
    if (!ta || !body || !mirror) return
    if (document.activeElement !== ta) return

    // 把输入框的排版规则原样复制给镜像层，量出来才准
    const cs = getComputedStyle(ta)
    const copyKeys = [
      'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'lineHeight',
      'letterSpacing', 'textIndent', 'paddingTop', 'paddingRight',
      'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderLeftWidth',
    ]
    copyKeys.forEach(k => { mirror.style[k] = cs[k] })
    mirror.style.width = `${ta.clientWidth}px`

    const pos = ta.selectionStart ?? ta.value.length
    mirror.textContent = ta.value.slice(0, pos)
    const marker = document.createElement('span')
    marker.textContent = '\u200b'
    mirror.appendChild(marker)
    // ta 和 mirror 的 offsetParent 都是 .ink-page-body（position:relative）
    const caretTop = ta.offsetTop + marker.offsetTop
    mirror.textContent = ''

    const want = caretTop - body.clientHeight * CARET_ANCHOR
    const max  = Math.max(0, body.scrollHeight - body.clientHeight)
    const next = Math.max(0, Math.min(want, max))
    if (Math.abs(body.scrollTop - next) < 24) return
    body.scrollTo({ top: next, behavior: smooth ? 'smooth' : 'auto' })
  }, [])

  // 键盘弹出/收起会让这一页变高变矮（CSS 里 bottom 绑了 --kb-height），
  // 高度一变就把光标重新摆回中间
  useEffect(() => {
    const body = bodyRef.current
    if (!body || typeof ResizeObserver === 'undefined') return
    let last = body.clientHeight
    const ro = new ResizeObserver(() => {
      if (Math.abs(body.clientHeight - last) < 30) return
      last = body.clientHeight
      requestAnimationFrame(() => keepCaretInView(false))
    })
    ro.observe(body)
    return () => ro.disconnect()
  }, [keepCaretInView, view])

  // ── 写请求排队：草稿自动保存 / 自存 / 交给枢，都是"改这篇笔记"的
  //    请求，各自独立发起、互不等待的话，网络时序一乱就可能后发
  //    先至——比如自存已经把草稿清空了，稍早那次自动存草稿的请求才
  //    姗姗来迟，把刚清空的草稿标记又写了回去。这里让同一篇笔记的
  //    写请求排成一条队——不管成败，队里下一个永远等上一个先落地
  //    了才发出，保证服务端收到的顺序跟真人操作的顺序一致 ────────
  const enqueueWrite = useCallback((task) => {
    const run = pendingWriteRef.current.then(task, task)
    pendingWriteRef.current = run.catch(() => {})
    return run
  }, [])

  // ── 草稿：写着写着自动存，不用等你点任何按钮 ────────────────
  const persistDraft = useCallback(async (text, noteId) => {
    const id = noteId ?? noteIdRef.current
    if (!id) return
    const t = (text ?? tailTextRef.current) || ''
    if (t === lastSavedRef.current) return
    lastSavedRef.current = t
    await enqueueWrite(() => onSaveDraft?.(id, { content: t, mode: 'continue' }))
  }, [onSaveDraft, enqueueWrite])

  useEffect(() => {
    if (view !== 'note' || !openNoteId) return
    clearTimeout(draftTimer.current)
    draftTimer.current = setTimeout(() => { persistDraft(tailText, openNoteId) }, DRAFT_DEBOUNCE)
    return () => clearTimeout(draftTimer.current)
  }, [tailText, view, openNoteId, persistDraft])

  // 切后台 / 息屏也存一次，被系统回收不至于丢字
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') persistDraft() }
    document.addEventListener('visibilitychange', onHide)
    return () => document.removeEventListener('visibilitychange', onHide)
  }, [persistDraft])

  // 组件被整个卸下（切 tab、系统返回手势）时的最后一道保险
  useEffect(() => () => {
    const t = tailTextRef.current
    if (noteIdRef.current && t && t !== lastSavedRef.current) {
      onSaveDraft?.(noteIdRef.current, { content: t, mode: 'continue' })
    }
  }, [onSaveDraft])

  // ── 打开一篇笔记：只在换了一篇时才重灌输入框 ────────────────
  // （原来把 draft_updated_at 也放进依赖里，结果每自动存一次草稿就
  //   重灌一次，光标被踢到末尾，想在中间插字根本改不了）
  useEffect(() => {
    if (!note) return
    if (loadedNoteRef.current === note.id) return
    loadedNoteRef.current = note.id

    const draft = note.draft_content || ''
    setTailText(draft)
    lastSavedRef.current = draft
    originalTailRef.current = draft
    // 用这篇笔记真实的 content/entries 给 committedRef 定个准确的初始值
    // ——不是无脑清零，不然带着已有正文打开的笔记也会被判定成"还没
    // 落过笔"
    committedRef.current = entries.length > 0 || !!(note.content && note.content.trim())
    setConfirmDelete(false)
    setJustGenerated(false); setForceWrite(false)
    setEditingEntry(null)
    writeHistoryTargetRef.current = 'tail'
    writeHistoryIndexRef.current = 0
    setWriteHistory([draft]); setWriteHistoryIndex(0)

    if (draft) {
      requestAnimationFrame(() => {
        const el = tailRef.current
        if (!el) return
        el.focus()
        el.setSelectionRange(el.value.length, el.value.length)
        requestAnimationFrame(() => keepCaretInView(false))
      })
    }
  }, [note, keepCaretInView])

  // 枢写完那一刻：不管决策标记是什么，都停下来交给真人看——枢不会
  // 自己跟自己接力写下去，"continue/new"只是他自己的判断，摆给真人
  // 看之后要不要照做（续写/另起一篇）由真人决定，见下方 justGenerated
  // 那个面板
  useEffect(() => {
    if (prevGenerating.current && !generating) {
      setJustGenerated(true)
      setForceWrite(false)
      // 枢起笔（这一篇眼下只有他自己写的这一条）写完之后，后端可能顺手
      // 把标题也起好了——重新拉一次这篇笔记的详情，把新标题同步过来，
      // 顺便刷新列表（起笔人／预览都要跟着更新）
      if (entries.length === 1 && entries[0]?.author === 'shu') {
        onOpenNote?.(noteIdRef.current)
        onFetchNotes?.()
      }
    }
    prevGenerating.current = generating
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generating])

  // 标题输入框跟着 note.title 同步——枢起笔时后端可能顺手生成了标题，
  // 这里只认标题字符串本身变没变，不会被草稿自动保存这类不相关的
  // note 更新触发，也不会跟真人正在手动改标题打架（改完是 onBlur 才提交）
  useEffect(() => {
    setTitleDraft(note?.title || '')
  }, [note?.title])

  // ── 枢写字时的呈现效果：不要打字机那种逐字刷新+闪烁光标，改成
  //    一小块一小块地浮现。streamText 是父组件那边不断变长的整段
  //    文本，这里只把"这次新到的部分"切成一个独立的小块（带自己的
  //    key），已经出现过的部分不再重新渲染，所以只有新到的字会触发
  //    一次淡入动画，不会每次都让整段文字重新闪一下 ────────────
  const [streamChunks, setStreamChunks] = useState([])
  const streamChunksRef = useRef([])
  const streamLenRef    = useRef(0)
  const chunkKeyRef      = useRef(0)
  useEffect(() => {
    if (!generating) {
      streamLenRef.current = 0
      streamChunksRef.current = []
      setStreamChunks([])
      return
    }
    const full = streamText || ''
    if (full.length <= streamLenRef.current) return
    const delta = full.slice(streamLenRef.current)
    streamLenRef.current = full.length
    const next = [...streamChunksRef.current, { key: chunkKeyRef.current++, text: delta }]
    streamChunksRef.current = next
    setStreamChunks(next)
  }, [streamText, generating])

  // ── 导航 ──────────────────────────────────────────────────
  const openNote = async (id) => {
    loadedNoteRef.current = null
    lastSavedRef.current = ''
    committedRef.current = false
    setOpenNoteId(id); setView('note'); setConfirmDelete(false)
    await onOpenNote?.(id)
  }

  const goBackToList = async () => {
    clearTimeout(draftTimer.current)
    const pending = tailTextRef.current
    // 【bug 修复】这里不能用上面的 hasBody——hasBody 是这一次渲染时
    // 算好的一个普通常量，"保存并返回"（leaveAsSaved）是在同一次调用
    // 里紧接着 saveNow() 之后马上调这个函数，中间不会有真人重新点一下
    // 触发的新一轮渲染，goBackToList 这个闭包里的 hasBody 依然是
    // saveNow 落笔之前那个"还是空的"的旧值，根本没机会看到刚落笔
    // 这件事——于是前脚刚存的这段，后脚就被当成"从没写过"删掉了。
    // committedRef 是个 ref，任何时候读到的都是当下最新的值，不受
    // "这段代码是哪次渲染时闭包住的"影响，这里必须用它现读一次
    if (!committedRef.current && !pending.trim()) {
      await onDeleteNote?.(openNoteId)
    } else if (pending !== lastSavedRef.current) {
      // 没点保存就返回：这一段照样留成草稿，列表上会亮"尚未完成"
      await persistDraft(pending, openNoteId)
      if (pending.trim()) showToast?.('这段留着，标了尚未完成')
    }
    setView('list'); setOpenNoteId(null); setTailText('')
    setConfirmDelete(false)
    setJustGenerated(false); setForceWrite(false)
    setEditingEntry(null); resetWriteHistory()
    loadedNoteRef.current = null
    onFetchNotes?.()
  }

  // 返回时如果尾巴里还有没处理的字，弹窗问清楚"存草稿""保存"还是
  // "恢复原样"——真人自己决定这段是留着待续、现在就落定，还是干脆
  // 撤回这次改动、当作什么都没发生过
  const cancelLeave = () => setLeaveConfirm(false)
  const leaveAsDraft = () => { setLeaveConfirm(false); goBackToList() }
  const leaveAsSaved = async () => { setLeaveConfirm(false); await saveNow(); goBackToList() }
  // 恢复原样：把尾巴退回打开这篇笔记那一刻的样子，不落笔也不存草稿，
  // 正文和草稿状态跟没动过一样——如果原本就没有草稿，这一段就直接
  // 跟着"从头到尾没落过一个字"那条路走（goBackToList 会自动删掉这篇
  // 白纸笔记，行为跟原来一致）
  const leaveAsOriginal = () => {
    const original = originalTailRef.current || ''
    setTailText(original); tailTextRef.current = original
    lastSavedRef.current = original
    setLeaveConfirm(false)
    goBackToList()
  }

  const handleBack = () => {
    if (view !== 'note') { onClose?.(); return }
    const pending = tailTextRef.current
    if (pending.trim() && pending !== lastSavedRef.current) {
      // 键盘正在收起（离开写作视图时尾巴输入框跟着失焦），这段时间
      // 里可视视口本身还在变化——不管弹窗的 CSS 怎么写，只要它在
      // 这个当口挂载，就会跟着视口一起长大，看起来像从上往下滑。
      // 先手动失焦、让键盘开始收，等这个过程稳定下来了再让弹窗
      // 出现，它出来的时候视口已经不再变了，直接就在正中间。
      tailRef.current?.blur()
      setTimeout(() => setLeaveConfirm(true), 260)
      return
    }
    goBackToList()
  }

  const createNote = async () => {
    const created = await onCreateNote?.()
    if (created?.id) openNote(created.id)
  }

  const commitTitle = () => {
    const t = titleDraft.trim() || '未命名手记'
    if (note && t !== note.title) onUpdateNote?.(openNoteId, { title: t })
  }

  const handleDeleteNote = () => {
    if (!confirmDelete) { setConfirmDelete(true); setTimeout(() => setConfirmDelete(false), 3000); return }
    onDeleteNote?.(openNoteId)
    goBackToList()
  }

  // ── 正文状态 ──────────────────────────────────────────────
  // 【bug 修复】加上 committedRef：即使 props 里的 entries/note.content
  // 还没追上刚落的那一笔，本组件自己也记得"这次已经真落过笔"，
  // goBackToList 的误删判断和下面这几个派生状态都从这里一并堵住
  const hasBody      = entries.length > 0 || !!(note?.content && note.content.trim()) || committedRef.current
  const derivedMode  = hasBody ? 'continue' : 'original'
  const lastEntry    = entries.length ? entries[entries.length - 1] : null
  const lastAuthor   = lastEntry?.author || null
  const isTrulyEmpty = !hasBody && !tailText.trim()
  const hasTailText  = !!tailText.trim()
  const charCount    = (note?.content?.length || 0) + tailText.length

  // 轮到谁：空的、或上一段是我写的 → 我可以继续写；
  // 上一段是枢写的 → 这一篇到此为止，除非我主动点"我再添一笔"
  const myTurn   = lastAuthor !== 'shu'
  const showTail = !generating && !activeNoteLoading && (myTurn || forceWrite)

  // ── 三个动作：保存 / 交给枢 / 撤掉枢那段 ────────────────────
  // 真人这一段落笔时用什么 mode：平时就是 derivedMode（continue/original），
  // 但如果是从枢的"想让你另起一篇"建议点进来写的，nextModeRef 会被
  // 标成 'new'，这一段落笔就带上分隔线，跟"另起一篇"在正文里的视觉
  // 效果一致——用完立刻清空，只管这一次落笔，不影响后面
  const takeNextMode = () => {
    const m = nextModeRef.current || derivedMode
    nextModeRef.current = null
    return m
  }

  // 尾巴清空之后共用的收尾：历史栈重新起（起点是空字符串），
  // "恢复原样"的基准点也跟着挪到现在——已经落笔的字既成事实，
  // 不该再被"恢复原样"撤回去
  const clearTailAfterCommit = () => {
    setTailText(''); lastSavedRef.current = ''; tailTextRef.current = ''
    originalTailRef.current = ''
    writeHistoryTargetRef.current = 'tail'
    writeHistoryIndexRef.current = 0
    setWriteHistory(['']); setWriteHistoryIndex(0)
    // 这里只会在 onFinalizeEntry 真正成功之后才被调用——落笔已经
    // 落地了，不管父组件的 activeNote props 什么时候追上，本地先
    // 记一笔，防止刚返回列表就被 goBackToList 当白纸删掉
    committedRef.current = true
  }

  // ✓ ＝ 直接落笔存下，不弹任何选择
  const saveNow = async () => {
    if (generating || !hasTailText) return
    clearTimeout(draftTimer.current)
    const text = tailText.trim()
    await enqueueWrite(() => onFinalizeEntry?.(openNoteId, { content: text, mode: takeNextMode() }))
    clearTailAfterCommit()
    setJustGenerated(false); setForceWrite(false)
    showToast?.('已落笔')
  }

  // 交给枢：有尾巴就先把我这段落下，然后让他写完这一段，中途不问。
  // 枢写完之后不会自己接着往下写——一段写完永远停下来，交给真人在
  // justGenerated 那个面板里看他的决策标记、自己决定下一步
  const handOffToShu = async () => {
    if (generating) return
    clearTimeout(draftTimer.current)
    const text = tailText.trim()
    if (text) {
      await enqueueWrite(() => onFinalizeEntry?.(openNoteId, { content: text, mode: takeNextMode() }))
      clearTailAfterCommit()
    }
    setJustGenerated(false); setForceWrite(false)
    await onGenerateEntry?.(openNoteId, (hasBody || text) ? 'continue' : 'original')
  }

  // 另起一篇（头部图标）：尾巴里有字的话先落自己这段（跟交给枢一样，
  // 算我自己的落笔），然后让枢基于目前的全文，另开一个新方向/场景
  // 写完整一段——不承接上一段情节，是独立的新起点，接在后面
  const handOffToShuNew = async () => {
    if (generating || isTrulyEmpty) return
    clearTimeout(draftTimer.current)
    const text = tailText.trim()
    if (text) {
      await enqueueWrite(() => onFinalizeEntry?.(openNoteId, { content: text, mode: takeNextMode() }))
      clearTailAfterCommit()
    }
    setJustGenerated(false); setForceWrite(false)
    await onGenerateEntry?.(openNoteId, 'new')
  }

  const keepLastEntry   = () => setJustGenerated(false)
  const deleteLastEntry = async () => {
    setJustGenerated(false)
    await onDeleteLastEntry?.(openNoteId)
    showToast?.('这段和它留下的记忆都删掉了')
  }
  const reopenTail = () => {
    setForceWrite(true); setJustGenerated(false)
    requestAnimationFrame(() => {
      tailRef.current?.focus()
      requestAnimationFrame(() => keepCaretInView())
    })
  }
  // 枢建议"想让你另起一篇"：打开输入框让真人自己写，但这一段落笔时
  // 要标成 'new'（分隔线），不是真的再喊一次枢来写——跟头部"另起
  // 一篇"图标（handOffToShuNew，枢自己写）是两件不同的事
  const writeNewBranch = () => {
    nextModeRef.current = 'new'
    setForceWrite(true); setJustGenerated(false)
    requestAnimationFrame(() => {
      tailRef.current?.focus()
      requestAnimationFrame(() => keepCaretInView())
    })
  }

  // ── 撤销/重做：通用的一套，服务两个目标 ──────────────────────
  // 目标 A「尾巴」：正在起笔/续写，还没落笔的那一段
  // 目标 B「历史段落」：点开自己写过的某一段在原地改
  // 两者共用 writeHistory/writeHistoryIndex 这一条栈，谁在写就记谁的
  // 快照；切换目标（比如从尾巴切去编辑一段历史）栈会重新起一条。

  // 把新的一笔计入历史栈——防抖 500ms，不是按一下键就压一条，避免
  // 撤销要按几十次才退回一个字
  const pushWriteHistory = useCallback((text, target) => {
    if (writeHistoryTargetRef.current !== target) {
      // 目标换了（比如刚从编辑历史段落切回尾巴）：这条栈重新起，
      // 起点是这次进入时的文本本身，不然第一下撤销会撤到空
      writeHistoryTargetRef.current = target
      writeHistoryIndexRef.current = 0
      setWriteHistory([text]); setWriteHistoryIndex(0)
      return
    }
    clearTimeout(writeHistoryTimer.current)
    writeHistoryTimer.current = setTimeout(() => {
      const idx = writeHistoryIndexRef.current
      setWriteHistory(h => {
        const base = h.slice(0, idx + 1)
        if (base[base.length - 1] === text) return h // 没变化不重复压栈
        return [...base, text]
      })
      writeHistoryIndexRef.current = idx + 1
      setWriteHistoryIndex(idx + 1)
    }, 500)
  }, [])

  const resetWriteHistory = () => {
    clearTimeout(writeHistoryTimer.current)
    writeHistoryTargetRef.current = null
    writeHistoryIndexRef.current = 0
    setWriteHistory([]); setWriteHistoryIndex(0)
  }

  const canUndo = writeHistoryIndex > 0
  const canRedo = writeHistoryIndex < writeHistory.length - 1

  // 撤销/重做落到哪个输入框，看当前是不是在编辑历史段落
  const applyHistoryText = (text) => {
    if (editingEntry) {
      setEditingEntry(prev => (prev ? { ...prev, text } : prev))
    } else {
      setTailText(text); tailTextRef.current = text
    }
  }
  const undoWrite = () => {
    if (!canUndo) return
    clearTimeout(writeHistoryTimer.current)
    const idx = writeHistoryIndex - 1
    writeHistoryIndexRef.current = idx
    setWriteHistoryIndex(idx)
    applyHistoryText(writeHistory[idx])
  }
  const redoWrite = () => {
    if (!canRedo) return
    clearTimeout(writeHistoryTimer.current)
    const idx = writeHistoryIndex + 1
    writeHistoryIndexRef.current = idx
    setWriteHistoryIndex(idx)
    applyHistoryText(writeHistory[idx])
  }

  // 尾巴每次改动都记一笔快照（起笔、续写都走这条）
  const handleTailChange = (text) => {
    setTailText(text)
    pushWriteHistory(text, 'tail')
  }

  // ── 编辑自己已经落笔的段落：只有 author='ke' 的段落能点开，枢的
  //    段落没有编辑入口（渲染那边就没绑点击事件）。进入编辑时历史栈
  //    切换到这一段自己的轨道，退出时切回尾巴的轨道 ──────────────
  const startEditEntry = (id, text) => {
    if (generating || !id) return
    setEditingEntry({ id, text })
    writeHistoryTargetRef.current = 'entry'
    writeHistoryIndexRef.current = 0
    setWriteHistory([text]); setWriteHistoryIndex(0)
  }
  const cancelEditEntry = () => {
    setEditingEntry(null)
    // 退出编辑，历史栈交还给尾巴——如果尾巴当时有内容，从它现在的
    // 文本重新起一条，不残留刚才那段历史段落的撤销记录
    writeHistoryTargetRef.current = 'tail'
    writeHistoryIndexRef.current = 0
    setWriteHistory([tailTextRef.current]); setWriteHistoryIndex(0)
  }
  const saveEditEntry = async () => {
    if (!editingEntry) return
    const text = editingEntry.text.trim()
    if (!text) { showToast?.('内容不能为空'); return }
    await onUpdateEntry?.(openNoteId, editingEntry.id, { content: text })
    setEditingEntry(null)
    writeHistoryTargetRef.current = 'tail'
    writeHistoryIndexRef.current = 0
    setWriteHistory([tailTextRef.current]); setWriteHistoryIndex(0)
    showToast?.('已修改')
    onOpenNote?.(openNoteId) // 重新拉一次，拿服务端按 entries 顺序重新拼过的正文
  }

  // ── 板块（第五批）：从 notes 里出现过的 board 值去重，就是 tab 列表；
  //    activeBoard=null 表示【全部】。板块存在与否完全由笔记自己的
  //    board 字段决定，没有单独的板块表——新建板块就是"移动到"的时候
  //    直接给一篇笔记挂一个新名字，最后一篇挪走了，这个板块也就自然
  //    从 tab 栏上消失，不用另外清理 ────────────────────────────
  const boards = useMemo(() => {
    const set = new Set()
    notes?.forEach(n => { if (n.board) set.add(n.board) })
    return Array.from(set)
  }, [notes])

  // 当前选中的板块如果不在了（笔记全被移走/删了），退回【全部】
  useEffect(() => {
    if (activeBoard && !boards.includes(activeBoard)) setActiveBoard(null)
  }, [boards, activeBoard])

  // 置顶摘到最前面、按置顶时间新的在前；板块筛选只决定"现在看哪些"，
  // 跟置顶互不冲突，一篇笔记可以又置顶又挂在某个板块下
  const { pinnedNotes, restNotes } = useMemo(() => {
    const list = activeBoard ? (notes || []).filter(n => n.board === activeBoard) : (notes || [])
    const pinned = list.filter(n => n.pinned_at).slice().sort((a, b) => new Date(b.pinned_at).getTime() - new Date(a.pinned_at).getTime())
    const rest   = list.filter(n => !n.pinned_at)
    return { pinnedNotes: pinned, restNotes: rest }
  }, [notes, activeBoard])

  // 卡片浮现动画的开关。原来 App.css 里那条规则是"只要列表可见就播"，
  // 于是「置顶 / 移动到板块」这类操作也会连带触发一次全列表重播：
  // onUpdateNote → 重新拉列表 → 那张卡片在「置顶区」和「普通区」两个
  // section 之间挪窝 → React 视作卸载再挂载 → 当场从透明淡入一次。
  // 弹层刚关掉、下面的卡片跟着闪一下，很容易被算到"弹窗闪烁"头上。
  // 这里把动画窗口收窄成"只有刚回到列表的那 900ms"，之后任何因为数据
  // 更新导致的重新挂载都不再播动画——首次进入、写完返回列表这两个
  // 真正需要浮现的场景照旧。
  useEffect(() => {
    if (view !== 'list') { setListEntering(false); return }
    setListEntering(true)
    const t = setTimeout(() => setListEntering(false), 900)
    return () => clearTimeout(t)
  }, [view])

  // ── 长按笔记卡片：置顶 / 移动到 / 删除 ──────────────────────
  const startLongPress = (n) => {
    longPressFired.current = false
    clearTimeout(longPressTimer.current)
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true
      setCardMenu({ note: n }); setConfirmCardDelete(false)
      if (navigator.vibrate) { try { navigator.vibrate(12) } catch {} }
    }, LONG_PRESS_MS)
  }
  const cancelLongPress = () => clearTimeout(longPressTimer.current)
  // 单击一张卡片直接进入笔记
  const handleCardClick = (n) => {
    // 长按已经弹出过菜单了，松手触发的这次点击不再算一次"点开"
    if (longPressFired.current) { longPressFired.current = false; return }
    openNote(n.id)
  }
  const openCardMenu = (n) => { setCardMenu({ note: n }); setConfirmCardDelete(false) }
  const closeCardMenu = () => { setCardMenu(null); setConfirmCardDelete(false) }

  const togglePin = async (n) => {
    await onUpdateNote?.(n.id, { pinned: !n.pinned_at })
    showToast?.(n.pinned_at ? '已取消置顶' : '已置顶')
    closeCardMenu()
  }
  const handleCardDelete = (n) => {
    if (!confirmCardDelete) { setConfirmCardDelete(true); setTimeout(() => setConfirmCardDelete(false), 3000); return }
    onDeleteNote?.(n.id)
    closeCardMenu()
  }

  const openMoveSheet  = (n) => { setMoveSheet({ note: n, newBoard: '' }); setCardMenu(null) }
  const closeMoveSheet = () => setMoveSheet(null)
  const moveNoteToBoard = async (n, board) => {
    await onUpdateNote?.(n.id, { board: board || null })
    showToast?.(board ? `已移动到「${board}」` : '已移出板块')
    setMoveSheet(null)
  }

  const pinnedTimeline = useMemo(() => buildTimeline(pinnedNotes), [pinnedNotes])
  const restTimeline   = useMemo(() => buildTimeline(restNotes), [restNotes])

  // 时间线卡片：固定"左/右"两栏，不再有任何随内容/宽度现算的坐标。
  // 单击直接进入笔记，见上方 handleCardClick。--i 只用来给浮现动画
  // 算一个依次错开的延迟（见 App.css .ink-tl-row 动画规则），不参与
  // 布局，map 本身自带的 index 顺手传下来就够，不用额外测量什么
  const renderTimelineNote = (item, i) => {
    const n = item.note
    const rowClass = ['ink-tl-row', `is-${item.side}`].join(' ')
    const nodeClass = [
      'ink-tl-node',
      n.firstAuthor === 'shu' ? 'is-shu' : 'is-ke',
      n.pinned_at ? 'is-pinned' : '',
    ].filter(Boolean).join(' ')
    return (
      <div key={n.id} className={rowClass} style={{ '--i': i }}>
        {/* 短连接线 + 竖线上的落点，纯 CSS 定位，不需要任何测量出来的像素坐标 */}
        <span className="ink-tl-stub" aria-hidden="true" />
        <span className={nodeClass} aria-hidden="true" />
        <div
          className="ink-tl-card"
          onClick={() => handleCardClick(n)}
          onTouchStart={() => startLongPress(n)}
          onTouchEnd={cancelLongPress}
          onTouchMove={cancelLongPress}
          onMouseDown={() => startLongPress(n)}
          onMouseUp={cancelLongPress}
          onMouseLeave={cancelLongPress}
          onContextMenu={(e) => { e.preventDefault(); openCardMenu(n) }}
          role="button"
          tabIndex={0}
          aria-label={n.title || '未命名手记'}
        >
          {n.pinned_at && <span className="ink-tl-pinned-badge"><PinIcon /></span>}
          {n.hasDraft && <span className="ink-tl-draft-dot" aria-hidden="true" title="尚未完成" />}

          <div className="ink-tl-title">{n.title || '未命名手记'}</div>
          {n.preview && <div className="ink-tl-preview">{n.preview}</div>}

          <div className="ink-tl-meta">
            {n.firstAuthor && (
              <span className={`ink-tl-author${n.firstAuthor === 'shu' ? ' is-shu' : ' is-ke'}`}>
                · {n.firstAuthor}
              </span>
            )}
            <span className="ink-tl-meta-dot">{daysLabel(daysSince(n.updated_at))}</span>
          </div>
        </div>
      </div>
    )
  }

  // 正文分段：按 entries 顺序拼，柯/枢各自的字色与徽标；
  // 老数据（有 content 但没有 entries）整段按柯的字迹显示，
  // 不至于点开一片空白
  const segments = useMemo(() => {
    if (entries.length) {
      return entries.map((e, i) => ({
        key: e.id ?? `seg-${i}`,
        id: e.id ?? null,
        text: e.content || '',
        author: e.author,
        divider: e.mode === 'new' && i > 0,
      }))
    }
    if (note?.content) return [{ key: 'legacy', id: null, text: note.content, author: 'ke', divider: false }]
    return []
  }, [entries, note?.content])

  const page = (
    <div className={`ink-page${view === 'list' ? ' is-list' : ''}`}>
      <div className="ink-page-header">
        <div className="ink-head-actions">
          <button className="ink-page-iconbtn" onClick={handleBack} aria-label="返回">
            <BackIcon />
          </button>
          {/* 撤销/重做：只要真人在动笔（起笔/续写的尾巴，或者点开
              历史段落在原地改）就在，不随场景挪位置——跟返回箭头
              并排固定在左上角 */}
          {view === 'note' && (showTail || editingEntry) && (
            <>
              <button className="ink-page-iconbtn" onClick={undoWrite} disabled={!canUndo} aria-label="撤销" title="撤销">
                <UndoIcon />
              </button>
              <button className="ink-page-iconbtn" onClick={redoWrite} disabled={!canRedo} aria-label="重做" title="重做">
                <RedoIcon />
              </button>
            </>
          )}
        </div>
        <div className="ink-page-title">{view === 'list' ? 'INK · 合墨' : ''}</div>
        {view === 'note' ? (
          <div className="ink-head-actions">
            <button
              className="ink-page-iconbtn"
              onClick={saveNow}
              disabled={generating || !hasTailText}
              aria-label="保存"
              title="保存"
            >
              <CheckIcon />
            </button>
            <button
              className="ink-page-iconbtn"
              onClick={handOffToShu}
              disabled={generating || !myTurn}
              aria-label={isTrulyEmpty ? '让枢先起笔' : '交给枢写完'}
              title={isTrulyEmpty ? '让枢先起笔' : '交给枢写完'}
            >
              <HandOffIcon />
            </button>
            <button
              className="ink-page-iconbtn"
              onClick={handOffToShuNew}
              disabled={generating || isTrulyEmpty || !myTurn}
              aria-label="另起一篇"
              title="另起一篇"
            >
              <BranchIcon />
            </button>
            <button
              className={`ink-page-iconbtn${confirmDelete ? ' is-danger' : ''}`}
              onClick={handleDeleteNote}
              aria-label={confirmDelete ? '再点一次删除' : '删除这篇'}
              title={confirmDelete ? '再点一次删除' : '删除这篇'}
            >
              <TrashIcon />
            </button>
          </div>
        ) : <span className="ink-page-header-spacer" />}
      </div>

      <div className={`ink-page-body${view === 'note' ? ' is-writing' : ''}`} ref={bodyRef}>
        {/* 量光标位置的镜像层，用户看不见 */}
        <div className="ink-caret-mirror" ref={mirrorRef} aria-hidden="true" />

        {/* 列表常驻挂载，靠 CSS 隐藏切换，不再靠 {view==='list' &&}
            整段拆掉重建——挂载只做一次，切换视图只是 visibility 的
            开关。时间线布局本身也不再依赖任何测量出来的宽度，隐藏/
            显示之间没有任何坐标要重新算，自然也没有可跳的那一帧。 */}
        <div className={`ink-page-content${view !== 'list' ? ' is-hidden' : ''}${listEntering ? ' is-entering' : ''}`}>
            <div className="ink-page-eyebrow">柯与枢的接力手记</div>

            {boards.length > 0 && (
              <div className="ink-board-tabs">
                <button
                  className={`ink-board-tab${activeBoard === null ? ' is-active' : ''}`}
                  onClick={() => setActiveBoard(null)}
                >全部</button>
                {boards.map(b => (
                  <button
                    key={b}
                    className={`ink-board-tab${activeBoard === b ? ' is-active' : ''}`}
                    onClick={() => setActiveBoard(b)}
                  >{b}</button>
                ))}
              </div>
            )}

            <button className="ink-note-new-btn" onClick={createNote}>
              <PlusIcon /> 新建一篇
            </button>

            {notesLoading && <div className="ink-note-empty">加载中…</div>}
            {/* 空板块（或者压根还没有笔记）不放提示文字——就让深色的
                页面背景自己空着，"新建一篇"已经是唯一需要的入口了 */}

            {/* 时间线：置顶区/常规区各自一条竖线，笔记按顺序固定
                "左右交错"排列，没有笔记时这层本身也不占高度 */}
            <div className="ink-tl-wrap">
              {!notesLoading && pinnedNotes.length > 0 && (
                <div className="ink-tl-section">
                  {pinnedTimeline.map(renderTimelineNote)}
                </div>
              )}
              {!notesLoading && pinnedNotes.length > 0 && restNotes.length > 0 && (
                <div className="ink-pin-divider" />
              )}
              {!notesLoading && restNotes.length > 0 && (
                <div className="ink-tl-section">
                  {restTimeline.map(renderTimelineNote)}
                </div>
              )}
            </div>
        </div>

        {view === 'note' && (
          <div className="ink-page-content is-note">
            <input
              className="ink-doc-title"
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
              placeholder="标题"
            />
            <div className="ink-doc-meta">
              {fmtDate(note?.updated_at || note?.created_at)} · {charCount} 字
            </div>

            {activeNoteLoading && <div className="ink-note-empty">加载中…</div>}

            {!activeNoteLoading && (
              <>
                <div className="ink-doc-body">
                  <span className="ink-doc-confirmed">
                    {segments.map(seg => (
                      <Fragment key={seg.key}>
                        {seg.divider && <span className="ink-doc-divider" />}
                        {editingEntry?.id === seg.id ? (
                          <span className="ink-doc-ke-span ink-doc-editing">
                            <textarea
                              ref={editTextareaRef}
                              className="ink-doc-edit-textarea"
                              value={editingEntry.text}
                              onChange={e => {
                                const v = e.target.value
                                setEditingEntry(prev => (prev ? { ...prev, text: v } : prev))
                                pushWriteHistory(v, 'entry')
                                requestAnimationFrame(() => {
                                  const el = editTextareaRef.current
                                  if (!el) return
                                  el.style.height = 'auto'
                                  el.style.height = `${el.scrollHeight}px`
                                })
                              }}
                              autoFocus
                            />
                            <span className="ink-edit-controls">
                              <button className="ink-hold-btn" onClick={cancelEditEntry}>取消</button>
                              <button className="ink-hold-btn" onClick={saveEditEntry}>保存修改</button>
                            </span>
                          </span>
                        ) : (
                          <span
                            className={`${seg.author === 'shu' ? 'ink-doc-shu-span' : 'ink-doc-ke-span'}${seg.author === 'ke' && seg.id ? ' is-editable' : ''}`}
                            onClick={() => { if (seg.author === 'ke' && seg.id) startEditEntry(seg.id, seg.text) }}
                          >
                            {seg.text}
                          </span>
                        )}
                      </Fragment>
                    ))}
                  </span>

                  {generating && (
                    <span className="ink-doc-shu-span ink-doc-streaming">
                      {streamChunks.map(c => <span key={c.key} className="ink-fade-chunk">{c.text}</span>)}
                    </span>
                  )}

                  {showTail && (
                    <textarea
                      ref={tailRef}
                      className="ink-doc-tail"
                      value={tailText}
                      onChange={e => {
                        handleTailChange(e.target.value)
                        requestAnimationFrame(() => keepCaretInView())
                      }}
                      onKeyUp={() => keepCaretInView(false)}
                      onClick={() => keepCaretInView(false)}
                      onFocus={() => setTimeout(() => keepCaretInView(false), 300)}
                      placeholder={isTrulyEmpty ? '谁先起笔…' : '接着写…'}
                    />
                  )}
                </div>

                {/* 枢写完一段，一定会停下来，不会自己接着往下接力写。这里
                    只给一句清楚的状态——他写完了 / 他想让你续写 / 他想让你
                    另起一篇——告诉真人接下来轮到自己做什么，具体怎么做
                    永远是真人自己点出来的 */}
                {justGenerated && !generating && (
                  <div className="ink-keep-row">
                    <span className="ink-nudge-hint">
                      {lastEntry?.truncated ? '枢写到长度上限，先停在这儿了——'
                        : lastEntry?.decision === 'continue' ? '他写完了，想让你续写。'
                        : lastEntry?.decision === 'new' ? '他写完了，想让你根据这段另起一篇。'
                        : '他写完了。'}
                    </span>
                    {lastEntry?.truncated && (
                      <button className="ink-hold-btn" onClick={handOffToShu}>让他接着写完</button>
                    )}
                    {!lastEntry?.truncated && lastEntry?.decision === 'continue' && (
                      <button className="ink-hold-btn" onClick={reopenTail}>续写</button>
                    )}
                    {!lastEntry?.truncated && lastEntry?.decision === 'new' && (
                      <button className="ink-hold-btn" onClick={writeNewBranch}>另起一篇</button>
                    )}
                    <button className="ink-hold-btn" onClick={keepLastEntry}>自存</button>
                    <button className="ink-hold-btn is-danger" onClick={deleteLastEntry}>删除这段</button>
                  </div>
                )}

                {isTrulyEmpty && !generating && (
                  <div className="ink-keep-row">
                    <span className="ink-nudge-hint">还没有落笔——</span>
                    <button className="ink-hold-btn" onClick={handOffToShu}>让枢先起笔</button>
                  </div>
                )}

                {generating && (
                  <div className="ink-nudge-hint">
                    枢正在写……
                    <button className="ink-hold-btn" onClick={onStopGenerate} style={{ marginLeft: 8 }}>停止</button>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

    </div>
  )

  // ── 三个弹层：跟 .ink-page 平级，各自单独 Portal 到 body ──────
  // 它们原本是 .ink-page 的 DOM 子节点，那正是"合墨弹窗一出来就闪、
  // 别的页面同款弹窗却不闪"的真正根因。之前排查到过门口——「合墨这几个
  // 弹层挂在 Portal 到 body、自己也是 position:fixed 的 .ink-page 下面，
  // 跟别处平铺直叙挂在 body 下的弹窗不是同一种情况」——但当时的处理是
  // 把毛玻璃摘掉（治症状），结构本身没动。
  //
  // .ink-page 同时带着 position:fixed + overflow:hidden + z-index 层叠
  // 上下文 + transition:bottom + 一个 fill-mode:both 永久生效的 inkPageIn
  // 动画。这几样凑在一起，WebKit 会把它当成一个长期存在的合成层；弹层
  // 只要还是它的子节点，就只能跟着这一层一起被反复重新光栅化。而弹层
  // 自己的 position:fixed 又是相对视口的，两者节奏对不上，看起来就是"闪"。
  //
  // 搬成兄弟节点之后，合墨的弹层跟别的页面的弹窗处在完全相同的环境里
  // ——别处不闪，这里也就不会闪。inline 的 zIndex（2500/2510/2520）仍然
  // 高于 .ink-page 的 2400，两者现在同处 body 的根层叠上下文，照旧生效。
  const sheets = (
    <>
      {/* 长按笔记卡片：置顶 / 移动到 / 删除 */}
      {cardMenu && (
        <div className="modal-veil ink-modal-veil" style={{ zIndex: 2500 }} onClick={closeCardMenu}>
          <div className="modal-card ink-sheet" onClick={e => e.stopPropagation()}>
            <div className="ink-sheet-sub">{cardMenu.note.title || '未命名手记'}</div>
            <div className="ink-sheet-list">
              <button className="ink-sheet-btn" onClick={() => togglePin(cardMenu.note)}>
                {cardMenu.note.pinned_at ? '取消置顶' : '置顶'}
              </button>
              <button className="ink-sheet-btn" onClick={() => openMoveSheet(cardMenu.note)}>移动到</button>
              <button className="ink-sheet-btn" onClick={() => handleCardDelete(cardMenu.note)}>
                {confirmCardDelete ? '再点一次删除' : '删除'}
              </button>
            </div>
            <button className="ink-sheet-cancel" onClick={closeCardMenu}>取消</button>
          </div>
        </div>
      )}

      {/* 移动到：选一个已有板块，或者直接新建一个 */}
      {moveSheet && (
        <div className="modal-veil ink-modal-veil" style={{ zIndex: 2510 }} onClick={closeMoveSheet}>
          <div className="modal-card ink-sheet" onClick={e => e.stopPropagation()}>
            <div className="ink-sheet-sub">把「{moveSheet.note.title || '未命名手记'}」移动到</div>
            <div className="ink-sheet-list">
              {boards.filter(b => b !== moveSheet.note.board).map(b => (
                <button key={b} className="ink-sheet-btn" onClick={() => moveNoteToBoard(moveSheet.note, b)}>{b}</button>
              ))}
              {moveSheet.note.board && (
                <button className="ink-sheet-btn" onClick={() => moveNoteToBoard(moveSheet.note, null)}>移出板块（回到全部）</button>
              )}
            </div>
            <div className="beacon-add-row" style={{ marginTop: 12 }}>
              <input
                className="field-input"
                value={moveSheet.newBoard}
                onChange={e => setMoveSheet(m => ({ ...m, newBoard: e.target.value }))}
                onKeyDown={e => { if (e.key === 'Enter' && moveSheet.newBoard.trim()) moveNoteToBoard(moveSheet.note, moveSheet.newBoard.trim()) }}
                placeholder="新板块名字"
                maxLength={12}
              />
              <button
                className="solid-btn"
                style={{ padding: '0 16px', borderRadius: '12px', fontSize: '12px' }}
                disabled={!moveSheet.newBoard.trim()}
                onClick={() => moveNoteToBoard(moveSheet.note, moveSheet.newBoard.trim())}
              >新建</button>
            </div>
            <button className="ink-sheet-cancel" onClick={closeMoveSheet}>取消</button>
          </div>
        </div>
      )}

      {/* 返回时尾巴还有字：问清楚存草稿、直接保存，还是撤回这次改动 */}
      {leaveConfirm && (
        <div className="modal-veil ink-modal-veil ink-leave-veil" style={{ zIndex: 2520 }} onClick={cancelLeave}>
          <div className="modal-card ink-sheet" onClick={e => e.stopPropagation()}>
            <div className="ink-sheet-sub">这段还没个说法——</div>
            <div className="ink-sheet-list">
              <button className="ink-sheet-btn" onClick={leaveAsDraft}>存草稿</button>
              <button className="ink-sheet-btn" onClick={leaveAsSaved}>保存</button>
              <button className="ink-sheet-btn" onClick={leaveAsOriginal}>恢复原样</button>
            </div>
            <button className="ink-sheet-cancel" onClick={cancelLeave}>取消</button>
          </div>
        </div>
      )}
    </>
  )

  // 挂到 body 上：跳出 .tab-page 的层叠上下文和 transform 包含块，
  // 底部导航条才压不住这一页，滚动手势也不再受 .gravity-page 的
  // touch-action:none 影响
  if (typeof document === 'undefined') return <>{page}{sheets}</>
  return (
    <>
      {createPortal(page, document.body)}
      {createPortal(sheets, document.body)}
    </>
  )
}

export default InkPage
