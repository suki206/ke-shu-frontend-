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
// 10) 枢决策自动流转（第四批）：后端在枢每次写完的正文末尾解析出
//    entries.decision（finalize/continue/new），前端拿它自动接着触发
//    下一轮——decision=continue 自动"交给枢"，=new 自动"另起一篇"，
//    =finalize（或者模型没交出这个标记）就落回今天这套"保留/删除
//    这段"的人工确认。为了不让枢自己跟自己写个没完，设了
//    AUTO_CHAIN_LIMIT 上限，连续自动接力到顶就把主动权交还给真人；
//    真人任何一次手动操作（点头部图标、点"我再添一笔"、开一篇新
//    笔记）都会把这个计数清零，重新攒一轮新的自动接力额度。
// 11) 列表页板块系统（第五批）：顶部一条横向滑动的板块 tab（【全部】
//    +自定义板块），长按笔记卡片弹出【置顶】【移动到】【删除】——
//    这套菜单和"移动到"的板块选择器复用的是原来"落笔弹层"那一套
//    还没删掉的 .ink-sheet 系列样式（早年三选一改成头部图标之后
//    这套 CSS 一直空着没人用，现在正好接上）。置顶的笔记摘到最前面，
//    用一条跟"另起一篇"分隔线同款的渐隐光丝隔开，板块筛选和置顶
//    互不干扰，一篇笔记可以又置顶又挂在某个板块下。
// 12) 列表页美化（第六批）：卡片改铭文行——去掉背景板/圆角/阴影，
//    行与行之间只留一条极细分隔线，读起来更像手记目录而不是一堆
//    悬浮的 app 卡片。状态也从"文字徽标+呼吸动画"改成纯静态小符号：
//    草稿是标题前一个不会动的小圆点，没有草稿就什么都不显示（不用
//    另一个"已完成"符号去填满，留白本身就是"没什么要看"）；轮到
//    枢写（最后一条是柯写的，或者笔记还空着）在标题末尾缀一个安静
//    的「· shu」，跟正文里枢的段落徽标同一套字体语言。空板块／空
//    列表不再放提示文字，就让页面本身的深色背景空着，"新建一篇"
//    已经是唯一需要的入口。返回时如果尾巴还有没处理的字，弹窗问
//    「存草稿」还是「保存」，不再默认悄悄存成草稿——这一步顺带把
//    tailTextRef 和 tailText 状态没有严格同步的一个小豁口也补上了
//    （落笔/交给枢/另起一篇清空尾巴时，ref 现在跟 state 同一时刻
//    清零，不用等下一帧的 effect 才追上）。
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
const MoreIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" />
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
// 枢决策自动流转最多连续接力几次：防止 decision 一直是 continue/new，
// 枢自己跟自己没完没了地写下去——到这个数就把主动权交还给真人
const AUTO_CHAIN_LIMIT = 3
// 长按笔记卡片多久算"长按"，太短容易跟滚动手势打架
const LONG_PRESS_MS = 480

const InkPage = ({
  notes, notesLoading, onFetchNotes, onCreateNote, onUpdateNote, onDeleteNote,
  activeNote, activeNoteLoading, onOpenNote,
  onSaveDraft, onFinalizeEntry, onGenerateEntry, onStopGenerate, onDeleteLastEntry,
  generating, streamText,
  showToast, onClose,
}) => {
  const [view, setView]     = useState('list') // 'list' | 'note'
  const [openNoteId, setOpenNoteId] = useState(null)
  const [tailText, setTailText]     = useState('')
  const [titleDraft, setTitleDraft] = useState('')
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [justGenerated, setJustGenerated] = useState(false) // 枢刚写完，给"保留/删除这段"的窗口
  const [forceWrite, setForceWrite]       = useState(false) // 枢接完之后，我主动要求再添一笔
  const [leaveConfirm, setLeaveConfirm]   = useState(false) // 返回时尾巴还有字，问"存草稿"还是"保存"

  // ── 板块 tab（第五批）：null = 全部 ───────────────────────────
  const [activeBoard, setActiveBoard] = useState(null)
  // ── 长按笔记卡片弹出的菜单 / "移动到"面板（第五批）──────────────
  const [cardMenu, setCardMenu] = useState(null)   // { note } | null
  const [confirmCardDelete, setConfirmCardDelete] = useState(false)
  const [moveSheet, setMoveSheet] = useState(null) // { note, newBoard } | null

  const bodyRef   = useRef(null)   // 滚动容器
  const tailRef   = useRef(null)   // 尾巴输入框
  const mirrorRef = useRef(null)   // 量光标位置的隐藏镜像层

  const prevGenerating = useRef(false)
  const loadedNoteRef  = useRef(null)   // 已经把草稿灌进输入框的那篇 id
  const draftTimer     = useRef(null)
  const tailTextRef    = useRef('')
  const noteIdRef      = useRef(null)
  const lastSavedRef   = useRef('')
  const pendingWriteRef = useRef(Promise.resolve()) // 见下方 enqueueWrite
  const autoChainRef   = useRef(0)      // 枢决策自动接力已经连续走了几轮
  const longPressTimer = useRef(null)
  const longPressFired = useRef(false)

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
    setTitleDraft(note.title || '')
    setShowMoreMenu(false); setConfirmDelete(false)
    setJustGenerated(false); setForceWrite(false)

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

  // 枢写完那一刻：先看这一段带没带决策标记——continue/new 就在自动
  // 接力额度没用完的情况下直接触发下一轮，不用真人每次都点；额度用完、
  // 标记是 finalize、或者模型压根没交出这个标记，都落回"保留/删除
  // 这段"的人工确认窗口，不自动把输入框塞回来
  useEffect(() => {
    if (prevGenerating.current && !generating) {
      const decision  = lastEntry?.author === 'shu' ? lastEntry?.decision : null
      const canAutoChain = !lastEntry?.truncated && autoChainRef.current < AUTO_CHAIN_LIMIT
      if (decision === 'continue' && canAutoChain) {
        autoChainRef.current += 1
        setJustGenerated(false); setForceWrite(false)
        handOffToShu()
      } else if (decision === 'new' && canAutoChain) {
        autoChainRef.current += 1
        setJustGenerated(false); setForceWrite(false)
        handOffToShuNew()
      } else {
        setJustGenerated(true)
        setForceWrite(false)
      }
    }
    prevGenerating.current = generating
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generating])

  // ── 导航 ──────────────────────────────────────────────────
  const openNote = async (id) => {
    loadedNoteRef.current = null
    lastSavedRef.current = ''
    autoChainRef.current = 0
    setOpenNoteId(id); setView('note'); setConfirmDelete(false)
    await onOpenNote?.(id)
  }

  const goBackToList = async () => {
    clearTimeout(draftTimer.current)
    const pending = tailTextRef.current
    // 没点保存就返回：这一段照样留成草稿，列表上会亮"尚未完成"
    if (pending !== lastSavedRef.current) {
      await persistDraft(pending, openNoteId)
      if (pending.trim()) showToast?.('这段留着，标了尚未完成')
    }
    setView('list'); setOpenNoteId(null); setTailText('')
    setConfirmDelete(false); setShowMoreMenu(false)
    setJustGenerated(false); setForceWrite(false)
    loadedNoteRef.current = null
    onFetchNotes?.()
  }

  // 返回时如果尾巴里还有没处理的字，弹窗问清楚要"存草稿"还是直接
  // "保存"（＝落笔），不再像以前那样直接默认存成草稿——真人自己
  // 决定这段是留着待续，还是现在就落定
  const cancelLeave = () => setLeaveConfirm(false)
  const leaveAsDraft = () => { setLeaveConfirm(false); goBackToList() }
  const leaveAsSaved = async () => { setLeaveConfirm(false); await saveNow(); goBackToList() }

  const handleBack = () => {
    if (view !== 'note') { onClose?.(); return }
    const pending = tailTextRef.current
    if (pending.trim() && pending !== lastSavedRef.current) { setLeaveConfirm(true); return }
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
    setShowMoreMenu(false)
    goBackToList()
  }

  // ── 正文状态 ──────────────────────────────────────────────
  const hasBody      = entries.length > 0 || !!(note?.content && note.content.trim())
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
  // ✓ ＝ 直接落笔存下，不弹任何选择
  const saveNow = async () => {
    if (generating || !hasTailText) return
    clearTimeout(draftTimer.current)
    autoChainRef.current = 0
    const text = tailText.trim()
    await enqueueWrite(() => onFinalizeEntry?.(openNoteId, { content: text, mode: derivedMode }))
    setTailText(''); lastSavedRef.current = ''; tailTextRef.current = ''
    setJustGenerated(false); setForceWrite(false)
    showToast?.('已落笔')
  }

  // 交给枢：有尾巴就先把我这段落下，然后让他一口气写完，中途不问
  const handOffToShu = async () => {
    if (generating) return
    clearTimeout(draftTimer.current)
    const text = tailText.trim()
    if (text) {
      await enqueueWrite(() => onFinalizeEntry?.(openNoteId, { content: text, mode: derivedMode }))
      setTailText(''); lastSavedRef.current = ''; tailTextRef.current = ''
    }
    setJustGenerated(false); setForceWrite(false)
    await onGenerateEntry?.(openNoteId, (hasBody || text) ? 'continue' : 'original')
  }

  // 另起一篇：尾巴里有字的话先落自己这段（跟交给枢一样，算我自己
  // 的落笔），然后让枢基于目前的全文，另开一个新方向/场景写完整
  // 一段——不承接上一段情节，是独立的新起点，接在后面
  const handOffToShuNew = async () => {
    if (generating || isTrulyEmpty) return
    clearTimeout(draftTimer.current)
    const text = tailText.trim()
    if (text) {
      await enqueueWrite(() => onFinalizeEntry?.(openNoteId, { content: text, mode: derivedMode }))
      setTailText(''); lastSavedRef.current = ''; tailTextRef.current = ''
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
    autoChainRef.current = 0 // 真人主动要求再添一笔，自动接力额度重新攒
    setForceWrite(true); setJustGenerated(false)
    requestAnimationFrame(() => {
      tailRef.current?.focus()
      requestAnimationFrame(() => keepCaretInView())
    })
  }
  // 头部图标 / 正文里的续写类按钮都是真人主动点的——点之前先把自动
  // 接力计数清零，这一次手动操作之后重新攒一轮新的自动接力额度
  const humanHandOffToShu    = () => { autoChainRef.current = 0; handOffToShu() }
  const humanHandOffToShuNew = () => { autoChainRef.current = 0; handOffToShuNew() }

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
  const handleCardClick = (n) => {
    // 长按已经弹出过菜单了，松手触发的这次点击不再当成"打开笔记"
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

  // 铭文行：草稿用一个静态小圆点标在标题前（不再是会呼吸的动画圆点
  // 配"尚未完成"文字），没有草稿就什么都不显示；轮到枢写（最后一条
  // 是柯写的，或者笔记还空着谁都没写）就在标题末尾缀一个安静的
  // "· shu"，跟正文里枢的段落徽标是同一套字体语言
  const renderNoteCard = (n) => (
    <div
      key={n.id}
      className="ink-note-row"
      onClick={() => handleCardClick(n)}
      onTouchStart={() => startLongPress(n)}
      onTouchEnd={cancelLongPress}
      onTouchMove={cancelLongPress}
      onMouseDown={() => startLongPress(n)}
      onMouseUp={cancelLongPress}
      onMouseLeave={cancelLongPress}
      onContextMenu={(e) => { e.preventDefault(); openCardMenu(n) }}
    >
      <div className="ink-note-row-title">
        {n.pinned_at && <PinIcon />}
        {n.hasDraft && <span className="ink-note-row-dot" aria-label="尚未完成" />}
        <span className="ink-note-row-title-text">{n.title || '未命名手记'}</span>
        {n.lastAuthor !== 'shu' && <span className="ink-note-row-shu">· shu</span>}
      </div>
      {n.preview && <div className="ink-note-row-preview">{n.preview}</div>}
      <div className="ink-note-row-meta">
        <span>{n.board ? `${n.board} · ` : ''}{n.entryCount || 0} 次落笔</span>
        <span>{daysLabel(daysSince(n.updated_at))}</span>
      </div>
    </div>
  )

  // 正文分段：按 entries 顺序拼，柯/枢各自的字色与徽标；
  // 老数据（有 content 但没有 entries）整段按柯的字迹显示，
  // 不至于点开一片空白
  const segments = useMemo(() => {
    if (entries.length) {
      return entries.map((e, i) => ({
        key: e.id ?? `seg-${i}`,
        text: e.content || '',
        author: e.author,
        divider: e.mode === 'new' && i > 0,
      }))
    }
    if (note?.content) return [{ key: 'legacy', text: note.content, author: 'ke', divider: false }]
    return []
  }, [entries, note?.content])

  const page = (
    <div className="ink-page">
      <div className="ink-page-header">
        <button className="ink-page-iconbtn" onClick={handleBack} aria-label="返回">
          <BackIcon />
        </button>
        <div className="ink-page-title">INK · 合墨</div>
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
              onClick={humanHandOffToShu}
              disabled={generating}
              aria-label={isTrulyEmpty ? '让枢先起笔' : '交给枢写完'}
              title={isTrulyEmpty ? '让枢先起笔' : '交给枢写完'}
            >
              <HandOffIcon />
            </button>
            <button
              className="ink-page-iconbtn"
              onClick={humanHandOffToShuNew}
              disabled={generating || isTrulyEmpty}
              aria-label="另起一篇"
              title="另起一篇"
            >
              <BranchIcon />
            </button>
            <div style={{ position: 'relative' }}>
              <button className="ink-page-iconbtn" onClick={() => setShowMoreMenu(v => !v)} aria-label="更多">
                <MoreIcon />
              </button>
              {showMoreMenu && (
                <div className="ink-more-menu">
                  <button onClick={handleDeleteNote}>{confirmDelete ? '再点一次删除' : '删除这篇'}</button>
                </div>
              )}
            </div>
          </div>
        ) : <span className="ink-page-header-spacer" />}
      </div>

      <div className={`ink-page-body${view === 'note' ? ' is-writing' : ''}`} ref={bodyRef}>
        {/* 量光标位置的镜像层，用户看不见 */}
        <div className="ink-caret-mirror" ref={mirrorRef} aria-hidden="true" />

        {view === 'list' && (
          <div className="ink-page-content">
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

            {!notesLoading && pinnedNotes.length > 0 && (
              <div className="ink-note-list">{pinnedNotes.map(renderNoteCard)}</div>
            )}
            {!notesLoading && pinnedNotes.length > 0 && restNotes.length > 0 && (
              <div className="ink-pin-divider" />
            )}
            {!notesLoading && restNotes.length > 0 && (
              <div className="ink-note-list">{restNotes.map(renderNoteCard)}</div>
            )}
          </div>
        )}

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
              {(hasTailText || note?.draft_content) ? <span className="ink-doc-draft-flag"> · 尚未完成</span> : null}
            </div>

            {activeNoteLoading && <div className="ink-note-empty">加载中…</div>}

            {!activeNoteLoading && (
              <>
                <div className="ink-doc-body">
                  <span className="ink-doc-confirmed">
                    {segments.map(seg => (
                      <Fragment key={seg.key}>
                        {seg.divider && <span className="ink-doc-divider" />}
                        <span className={seg.author === 'shu' ? 'ink-doc-shu-span' : 'ink-doc-ke-span'}>
                          {seg.text}
                        </span>
                      </Fragment>
                    ))}
                  </span>

                  {generating && (
                    <span className="ink-doc-shu-span ink-doc-streaming">{streamText}</span>
                  )}

                  {showTail && (
                    <textarea
                      ref={tailRef}
                      className="ink-doc-tail"
                      value={tailText}
                      onChange={e => {
                        setTailText(e.target.value)
                        requestAnimationFrame(() => keepCaretInView())
                      }}
                      onKeyUp={() => keepCaretInView(false)}
                      onClick={() => keepCaretInView(false)}
                      onFocus={() => setTimeout(() => keepCaretInView(false), 300)}
                      placeholder={isTrulyEmpty ? '谁先起笔…' : '接着写…'}
                    />
                  )}
                </div>

                {/* 枢刚写完：保留 / 删除。撞到长度上限、或者决策是 continue/new
                    但自动接力额度已经用完，都在这里给出对应的续写入口 */}
                {justGenerated && !generating && (
                  <div className="ink-keep-row">
                    <span className="ink-nudge-hint">
                      {lastEntry?.truncated ? '枢写到长度上限停下了——'
                        : lastEntry?.decision === 'continue' ? '枢还想接着写，先攒了几轮给你看看——'
                        : lastEntry?.decision === 'new' ? '枢想另起一段，先攒了几轮给你看看——'
                        : '枢把这一段写完了——'}
                    </span>
                    <button className="ink-hold-btn" onClick={keepLastEntry}>保留</button>
                    {(lastEntry?.truncated || lastEntry?.decision === 'continue') && (
                      <button className="ink-hold-btn" onClick={humanHandOffToShu}>让他接着写完</button>
                    )}
                    {!lastEntry?.truncated && lastEntry?.decision === 'new' && (
                      <button className="ink-hold-btn" onClick={humanHandOffToShuNew}>让他另起一篇</button>
                    )}
                    <button className="ink-hold-btn is-danger" onClick={deleteLastEntry}>删除这段</button>
                  </div>
                )}

                {/* 轮到枢收尾之后：默认不给输入框，想再添笔自己点 */}
                {!generating && !justGenerated && !showTail && (
                  <div className="ink-keep-row">
                    <span className="ink-nudge-hint">这一篇枢已经接完了。</span>
                    <button className="ink-hold-btn" onClick={reopenTail}>我再添一笔</button>
                  </div>
                )}

                {isTrulyEmpty && !generating && (
                  <div className="ink-keep-row">
                    <span className="ink-nudge-hint">还没有落笔——</span>
                    <button className="ink-hold-btn" onClick={humanHandOffToShu}>让枢先起笔</button>
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

      {/* 长按笔记卡片：置顶 / 移动到 / 删除 */}
      {cardMenu && (
        <div className="modal-veil" style={{ zIndex: 2500 }} onClick={closeCardMenu}>
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
        <div className="modal-veil" style={{ zIndex: 2510 }} onClick={closeMoveSheet}>
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

      {/* 返回时尾巴还有字：问清楚存草稿还是直接保存 */}
      {leaveConfirm && (
        <div className="modal-veil" style={{ zIndex: 2520 }} onClick={cancelLeave}>
          <div className="modal-card ink-sheet" onClick={e => e.stopPropagation()}>
            <div className="ink-sheet-sub">这段还没个说法——</div>
            <div className="ink-sheet-list">
              <button className="ink-sheet-btn" onClick={leaveAsDraft}>存草稿</button>
              <button className="ink-sheet-btn" onClick={leaveAsSaved}>保存</button>
            </div>
            <button className="ink-sheet-cancel" onClick={cancelLeave}>取消</button>
          </div>
        </div>
      )}
    </div>
  )

  // 挂到 body 上：跳出 .tab-page 的层叠上下文和 transform 包含块，
  // 底部导航条才压不住这一页，滚动手势也不再受 .gravity-page 的
  // touch-action:none 影响
  return typeof document !== 'undefined' ? createPortal(page, document.body) : page
}

export default InkPage
