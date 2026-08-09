import { useState, useEffect, useRef, useMemo, Fragment } from 'react'
import { daysLabel } from './dustCommon'

// ============================================================
// 合墨 · INK —— 引力页右下角天体子页面，全屏跃迁。
//
// 接力写作：一篇笔记只有一段连续正文（note.content），柯和枢轮流
// 往同一段文字后面接着写。entries 只是操作日志（给徽标定位、给
// Token 统计用），本页不把它当展示数据源。
//
// 交互上不再有底部常驻操作条——写字时长文本会把它顶到看不见。
// 现在头部有一个「✓」，点开是居中的小弹层，三个选项一次选定、
// 立即执行：自存 = 直接落笔；让他续写 / 另起一篇 = 先落自己这段
// （如果有的话）再直接触发生成。枢写完之后不会再弹一轮同样的选
// 项，只在正文下面留一句轻的「保留 / 删除这段」，给个反悔的余地。
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
const CheckSmall = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="20 6 9 17 4 12" />
  </svg>
)

const daysSince = (iso) => (iso ? Math.max(0, (Date.now() - new Date(iso).getTime()) / 86400000) : null)
const fmtDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

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
  const [showActionSheet, setShowActionSheet] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [justGenerated, setJustGenerated] = useState(false) // 枢刚写完，给"保留/删除这段"的窗口

  const tailRef = useRef(null)
  const prevGenerating = useRef(false)

  const note    = activeNote?.note
  const entries = activeNote?.entries || []

  // 尾巴输入框自动撑高，跟随内容长高，不出现内部滚动条——这样它才
  // 能跟前面的正文严丝合缝地接成一整页，而不是一个小方框
  useEffect(() => {
    const el = tailRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [tailText, generating])

  // 打开一篇笔记时，把草稿尾巴灌进输入框，光标落在末尾
  useEffect(() => {
    if (!note) return
    setTailText(note.draft_content || '')
    setTitleDraft(note.title || '')
    setShowMoreMenu(false); setConfirmDelete(false); setShowActionSheet(false); setJustGenerated(false)
    if (note.draft_content) {
      requestAnimationFrame(() => {
        const el = tailRef.current
        if (!el) return
        el.focus()
        el.setSelectionRange(el.value.length, el.value.length)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id, note?.draft_updated_at])

  // 生成结束时给一个"保留/删除这段"的轻提示；不再自动弹出续写/
  // 另起一篇——那两个选项只在人主动点「✓」时才会出现
  useEffect(() => {
    if (prevGenerating.current && !generating) {
      setJustGenerated(true)
      requestAnimationFrame(() => tailRef.current?.focus())
    }
    prevGenerating.current = generating
  }, [generating])

  const openNote = async (id) => {
    setOpenNoteId(id); setView('note'); setConfirmDelete(false)
    await onOpenNote?.(id)
  }
  const goBackToList = () => {
    setView('list'); setOpenNoteId(null); setTailText(''); setConfirmDelete(false); setShowMoreMenu(false)
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
    goBackToList()
  }

  const derivedMode = entries.length ? 'continue' : 'original'

  const holdForLater = async () => {
    if (!tailText.trim()) return
    await onSaveDraft?.(openNoteId, { content: tailText, mode: derivedMode })
    showToast?.('已存为待续')
    goBackToList()
  }

  // handoff: null(自存，到此为止) | 'continue' | 'new' —— 选定就立即
  // 执行，不再有第二步确认
  const commit = async (handoff) => {
    setShowActionSheet(false); setJustGenerated(false)
    if (generating) return
    const text = tailText.trim()
    if (text) {
      await onFinalizeEntry?.(openNoteId, { content: text, mode: derivedMode })
      setTailText('')
    }
    if (handoff) await onGenerateEntry?.(openNoteId, handoff)
  }

  const letShuStart = () => { if (!generating) onGenerateEntry?.(openNoteId, 'original') }

  const keepLastEntry   = () => setJustGenerated(false)
  const deleteLastEntry = async () => {
    setJustGenerated(false)
    await onDeleteLastEntry?.(openNoteId)
    showToast?.('已删除这段')
  }

  const isTrulyEmpty = !note?.content && !tailText.trim() && entries.length === 0
  const hasTailText  = !!tailText.trim()
  const charCount    = (note?.content?.length || 0) + tailText.length

  // 正文分段：直接按 entries 顺序拼，每条 entry.content 就是当时
  // 追加进正文的那一段，柯/枢分别打上行内徽标 + 不同字色；
  // mode==='new' 的段落前面加一条极细光丝，跟"另起一篇"这个动作
  // 对应起来
  const segments = useMemo(() => entries.map((e, i) => ({
    key: e.id ?? `seg-${i}`,
    text: e.content || '',
    author: e.author,
    divider: e.mode === 'new' && i > 0,
  })), [entries])

  return (
    <div className="ink-page">
      <div className="ink-page-header">
        <button className="ink-page-iconbtn" onClick={handleBack} aria-label="返回">
          <BackIcon />
        </button>
        <div className="ink-page-title">INK · 合墨</div>
        {view === 'note' ? (
          <div style={{ display: 'flex', alignItems: 'center' }}>
            {!isTrulyEmpty && (
              <button
                className="ink-page-iconbtn"
                onClick={() => setShowActionSheet(true)}
                disabled={generating}
                aria-label="落笔"
              >
                <CheckIcon />
              </button>
            )}
            <div style={{ position: 'relative' }}>
              <button className="ink-page-iconbtn" onClick={() => setShowMoreMenu(v => !v)} aria-label="更多">
                <MoreIcon />
              </button>
              {showMoreMenu && (
                <div className="ink-more-menu">
                  <button onClick={handleDeleteNote}>{confirmDelete ? '再次点击删除' : '删除这篇'}</button>
                </div>
              )}
            </div>
          </div>
        ) : <span className="ink-page-header-spacer" />}
      </div>

      <div className="ink-page-body">
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
              {note?.draft_content ? <span className="ink-doc-draft-flag"> · 尚未完成</span> : null}
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

                  {!generating && (
                    <textarea
                      ref={tailRef}
                      className="ink-doc-tail"
                      value={tailText}
                      onChange={e => setTailText(e.target.value)}
                      placeholder={isTrulyEmpty ? '谁先起笔…' : '接着写…'}
                    />
                  )}
                </div>

                {justGenerated && !generating && (
                  <div className="ink-keep-row">
                    <span className="ink-nudge-hint">枢写完了这一段——</span>
                    <button className="ink-hold-btn" onClick={keepLastEntry}>保留</button>
                    <button className="ink-hold-btn is-danger" onClick={deleteLastEntry}>删除这段</button>
                  </div>
                )}

                {isTrulyEmpty && (
                  <button className="ink-empty-invite line-btn" onClick={letShuStart} disabled={generating}>
                    让枢先写
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

      {showActionSheet && (
        <div className="modal-veil" style={{ zIndex: 2400 }} onClick={() => setShowActionSheet(false)}>
          <div className="modal-card ink-sheet" onClick={e => e.stopPropagation()}>
            <div className="modal-title" style={{ marginBottom: 2 }}>落笔</div>
            <div className="ink-sheet-sub">选一个，立即执行</div>

            <div className="ink-sheet-list">
              {hasTailText && (
                <button className="ink-sheet-btn" onClick={() => commit(null)}>
                  <CheckSmall /> 自存
                </button>
              )}
              <button className="ink-sheet-btn" onClick={() => commit('continue')}>
                <CheckSmall /> 让他续写
              </button>
              <button className="ink-sheet-btn" onClick={() => commit('new')}>
                <CheckSmall /> 另起一篇
              </button>
            </div>

            {hasTailText && (
              <button className="ink-sheet-hold" onClick={holdForLater}>存为待续，先出去</button>
            )}
            <button className="ink-sheet-cancel" onClick={() => setShowActionSheet(false)}>取消</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default InkPage
