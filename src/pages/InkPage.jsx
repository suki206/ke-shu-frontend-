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

  const bodyRef   = useRef(null)   // 滚动容器
  const tailRef   = useRef(null)   // 尾巴输入框
  const mirrorRef = useRef(null)   // 量光标位置的隐藏镜像层

  const prevGenerating = useRef(false)
  const loadedNoteRef  = useRef(null)   // 已经把草稿灌进输入框的那篇 id
  const draftTimer     = useRef(null)
  const tailTextRef    = useRef('')
  const noteIdRef      = useRef(null)
  const lastSavedRef   = useRef('')

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

  // ── 草稿：写着写着自动存，不用等你点任何按钮 ────────────────
  const persistDraft = useCallback(async (text, noteId) => {
    const id = noteId ?? noteIdRef.current
    if (!id) return
    const t = (text ?? tailTextRef.current) || ''
    if (t === lastSavedRef.current) return
    lastSavedRef.current = t
    await onSaveDraft?.(id, { content: t, mode: 'continue' })
  }, [onSaveDraft])

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

  // 枢写完那一刻：给一次"保留/删除这段"的机会，不自动把输入框塞回来
  useEffect(() => {
    if (prevGenerating.current && !generating) {
      setJustGenerated(true)
      setForceWrite(false)
    }
    prevGenerating.current = generating
  }, [generating])

  // ── 导航 ──────────────────────────────────────────────────
  const openNote = async (id) => {
    loadedNoteRef.current = null
    lastSavedRef.current = ''
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

  const handleBack = () => { if (view === 'note') goBackToList(); else onClose?.() }

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
    const text = tailText.trim()
    await onFinalizeEntry?.(openNoteId, { content: text, mode: derivedMode })
    setTailText(''); lastSavedRef.current = ''
    setJustGenerated(false); setForceWrite(false)
    showToast?.('已落笔')
  }

  // 交给枢：有尾巴就先把我这段落下，然后让他一口气写完，中途不问
  const handOffToShu = async () => {
    if (generating) return
    clearTimeout(draftTimer.current)
    const text = tailText.trim()
    if (text) {
      await onFinalizeEntry?.(openNoteId, { content: text, mode: derivedMode })
      setTailText(''); lastSavedRef.current = ''
    }
    setJustGenerated(false); setForceWrite(false)
    await onGenerateEntry?.(openNoteId, (hasBody || text) ? 'continue' : 'original')
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
              onClick={handOffToShu}
              disabled={generating}
              aria-label="交给枢写完"
              title="交给枢写完"
            >
              <HandOffIcon />
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

            <button className="ink-note-new-btn" onClick={createNote}>
              <PlusIcon /> 新建一篇
            </button>

            {notesLoading && <div className="ink-note-empty">加载中…</div>}
            {!notesLoading && (!notes || notes.length === 0) && (
              <div className="ink-note-empty">还没有手记，点上面开始第一篇</div>
            )}

            <div className="ink-note-list">
              {notes?.map(n => (
                <div key={n.id} className="ink-note-card" onClick={() => openNote(n.id)}>
                  <div className="ink-note-card-top">
                    <span className="ink-note-card-title">{n.title || '未命名手记'}</span>
                    {n.hasDraft && (
                      <span className="ink-draft-badge"><span className="ink-draft-dot" />尚未完成</span>
                    )}
                  </div>
                  {n.preview && <div className="ink-note-card-preview">{n.preview}</div>}
                  <div className="ink-note-card-meta">
                    <span>{n.entryCount || 0} 次落笔</span>
                    <span>{daysLabel(daysSince(n.updated_at))}</span>
                  </div>
                </div>
              ))}
            </div>
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

                {/* 枢刚写完：保留 / 删除；撞到长度上限的话还能让他再接一段 */}
                {justGenerated && !generating && (
                  <div className="ink-keep-row">
                    <span className="ink-nudge-hint">
                      {lastEntry?.truncated ? '枢写到长度上限停下了——' : '枢把这一段写完了——'}
                    </span>
                    <button className="ink-hold-btn" onClick={keepLastEntry}>保留</button>
                    {lastEntry?.truncated && (
                      <button className="ink-hold-btn" onClick={handOffToShu}>让他接着写完</button>
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
                  <button className="ink-empty-invite line-btn" onClick={handOffToShu}>
                    让枢先起笔
                  </button>
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

  // 挂到 body 上：跳出 .tab-page 的层叠上下文和 transform 包含块，
  // 底部导航条才压不住这一页，滚动手势也不再受 .gravity-page 的
  // touch-action:none 影响
  return typeof document !== 'undefined' ? createPortal(page, document.body) : page
}

export default InkPage
