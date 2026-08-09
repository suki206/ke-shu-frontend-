import { useState, useEffect, useRef, useMemo, Fragment } from 'react'
import { daysLabel } from './dustCommon'

// ============================================================
// 合墨 · INK —— 引力页右下角天体子页面，全屏跃迁。
//
// 接力写作，不是聊天记录：一篇笔记只有一段连续正文（note.content），
// 柯和枢轮流往同一段文字后面接着写，枢写的片段只用一个很轻的行内
// 徽标区分，不分段落卡片、不分时间流。entries 只是操作日志（给
// 徽标定位、给 Token 统计用），本页不把它当展示数据源。
//
// 枢写完一段后自己决定下一步（后端解析它输出的 [DECISION: ...]
// 标记），前端拿到 decision 直接调整"接下来该谁接"的默认状态，
// 不需要人为它的这一段再点一次确认。人只在"我要不要交给枢写"这件
// 事上点『让他续 / 让他另写』——这个动作永远是真人点的。
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

const daysSince = (iso) => (iso ? Math.max(0, (Date.now() - new Date(iso).getTime()) / 86400000) : null)
const fmtDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

const InkPage = ({
  notes, notesLoading, onFetchNotes, onCreateNote, onUpdateNote, onDeleteNote,
  activeNote, activeNoteLoading, onOpenNote,
  onSaveDraft, onFinalizeEntry, onGenerateEntry, onStopGenerate, generating, streamText,
  showToast, onClose,
}) => {
  const [view, setView]     = useState('list') // 'list' | 'note'
  const [openNoteId, setOpenNoteId] = useState(null)
  const [tailText, setTailText]     = useState('')
  const [modeOverride, setModeOverride] = useState(null) // null=跟着自动推断走，否则手动切换 'continue' | 'new'
  const [titleDraft, setTitleDraft] = useState('')
  const [tagInput, setTagInput]     = useState('')
  const [showTagInput, setShowTagInput] = useState(false)
  const [showMoreMenu, setShowMoreMenu] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [lastDecisionToast, setLastDecisionToast] = useState(null) // 防止同一次生成重复弹提示

  const tailRef = useRef(null)
  const prevGenerating = useRef(false)

  // 尾巴输入框自动撑高，跟随内容长高，不出现内部滚动条——这样它才
  // 能跟前面的正文严丝合缝地接成一整页，而不是一个小方框
  useEffect(() => {
    const el = tailRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [tailText, generating])

  const note    = activeNote?.note
  const entries = activeNote?.entries || []
  const lastEntry = entries[entries.length - 1]

  // 打开一篇笔记时，把草稿尾巴灌进输入框，光标落在末尾
  useEffect(() => {
    if (!note) return
    setTailText(note.draft_content || '')
    setModeOverride(null)
    setTitleDraft(note.title || '')
    setShowMoreMenu(false); setConfirmDelete(false)
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

  // 生成结束时，如果枢自己判断"写完了"，轻轻提示一下（不锁笔记，
  // 不强制任何操作，纯提醒）
  useEffect(() => {
    if (prevGenerating.current && !generating) {
      const d = lastEntry?.decision
      if (d === 'finalize' && lastEntry?.id !== lastDecisionToast) {
        showToast?.('枢觉得这篇写完了')
        setLastDecisionToast(lastEntry.id)
      }
      requestAnimationFrame(() => tailRef.current?.focus())
    }
    prevGenerating.current = generating
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const tags = note?.tags || []
  const addTag = () => {
    const t = tagInput.trim()
    setTagInput(''); setShowTagInput(false)
    if (!t || tags.includes(t)) return
    onUpdateNote?.(openNoteId, { tags: [...tags, t] })
  }
  const removeTag = (t) => onUpdateNote?.(openNoteId, { tags: tags.filter(x => x !== t) })

  const handleDeleteNote = () => {
    if (!confirmDelete) { setConfirmDelete(true); setTimeout(() => setConfirmDelete(false), 3000); return }
    onDeleteNote?.(openNoteId)
    goBackToList()
  }

  // 由枢刚才的决策（continue/new）推断"接下来这一段默认怎么接"；
  // 没有决策记录（比如从没生成过，或最后一段是柯自己写的）就按
  // 内容是否已经有东西来兜底
  const derivedMode = useMemo(() => {
    if (note?.draft_mode) return note.draft_mode
    if (lastEntry?.author === 'shu' && (lastEntry.decision === 'new' || lastEntry.decision === 'continue')) {
      return lastEntry.decision
    }
    return entries.length ? 'continue' : 'original'
  }, [note?.draft_mode, lastEntry, entries.length])

  const effectiveMode = entries.length === 0 ? 'original' : (modeOverride || derivedMode)

  const holdForLater = async () => {
    if (!tailText.trim()) return
    await onSaveDraft?.(openNoteId, { content: tailText, mode: effectiveMode })
    showToast?.('已存为待续')
    goBackToList()
  }

  // handoff: null(落笔到此为止) | 'continue' | 'new'
  const commit = async (handoff) => {
    if (generating) return
    const text = tailText.trim()
    if (text) {
      await onFinalizeEntry?.(openNoteId, { content: tailText, mode: effectiveMode })
      setTailText('')
    }
    setModeOverride(null)
    if (handoff) await onGenerateEntry?.(openNoteId, handoff)
  }

  const letShuStart = () => { if (!generating) onGenerateEntry?.(openNoteId, 'original') }

  const isTrulyEmpty = !note?.content && !tailText.trim() && entries.length === 0
  const hasTailText  = !!tailText.trim()
  const charCount    = (note?.content?.length || 0) + tailText.length

  // 正文分段：直接按 entries 顺序拼，每条 entry.content 就是当时
  // 追加进正文的那一段，枢写的打上行内徽标，new 模式的段落前面加
  // 一条极细光丝——跟合墨天体本体的光丝动效同一个视觉语言
  const segments = useMemo(() => entries.map((e, i) => ({
    key: e.id ?? `seg-${i}`,
    text: e.content || '',
    isShu: e.author === 'shu',
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
                      <span className="ink-draft-badge"><span className="ink-draft-dot" />待续</span>
                    )}
                  </div>
                  {n.preview && <div className="ink-note-card-preview">{n.preview}</div>}
                  {n.tags?.length > 0 && (
                    <div className="ink-note-card-tags">
                      {n.tags.map(t => <span key={t} className="ink-tag-chip" style={{ padding: '3px 9px' }}>{t}</span>)}
                    </div>
                  )}
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
            </div>

            <div className="ink-tag-row" style={{ marginTop: 10 }}>
              {tags.map(t => (
                <span key={t} className="ink-tag-chip">
                  {t}
                  <button className="ink-tag-chip-remove" onClick={() => removeTag(t)} aria-label={`删除标签 ${t}`}>×</button>
                </span>
              ))}
              {showTagInput ? (
                <input
                  className="ink-tag-input" autoFocus
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onBlur={addTag}
                  onKeyDown={e => {
                    if (e.key === 'Enter') addTag()
                    if (e.key === 'Escape') { setTagInput(''); setShowTagInput(false) }
                  }}
                  placeholder="标签…"
                />
              ) : (
                <button className="ink-tag-add" onClick={() => setShowTagInput(true)}>+ 标签</button>
              )}
            </div>

            {activeNoteLoading && <div className="ink-note-empty">加载中…</div>}

            {!activeNoteLoading && (
              <>
                <div className="ink-doc-body">
                  <span className="ink-doc-confirmed">
                    {segments.map(seg => (
                      <Fragment key={seg.key}>
                        {seg.divider && <span className="ink-doc-divider" />}
                        <span className={seg.isShu ? 'ink-doc-shu-span' : undefined}>{seg.text}</span>
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

                <div className="ink-doc-actionbar">
                  {isTrulyEmpty ? (
                    <button className="ink-empty-invite line-btn" onClick={letShuStart} disabled={generating}>
                      让枢先写
                    </button>
                  ) : (
                    <>
                      <div className="ink-doc-actionbar-top">
                        <button
                          className="ink-mode-toggle"
                          onClick={() => setModeOverride(m => (m || derivedMode) === 'new' ? 'continue' : 'new')}
                          disabled={generating}
                        >
                          {(modeOverride || derivedMode) === 'new' ? '✦ 新方向' : '⌇ 接着写'}
                        </button>
                        {hasTailText && !generating && (
                          <button className="ink-hold-btn" onClick={holdForLater}>待续</button>
                        )}
                      </div>
                      <div className="ink-action-row">
                        {hasTailText && (
                          <button className="ink-action-btn line-btn" onClick={() => commit(null)} disabled={generating}>
                            落笔
                          </button>
                        )}
                        <button className="ink-action-btn line-btn is-primary" onClick={() => commit('continue')} disabled={generating}>
                          让他续
                        </button>
                        <button className="ink-action-btn line-btn is-primary" onClick={() => commit('new')} disabled={generating}>
                          让他另写
                        </button>
                      </div>
                    </>
                  )}

                  {generating && (
                    <div className="ink-nudge-hint">
                      枢正在写……
                      <button className="ink-hold-btn" onClick={onStopGenerate} style={{ marginLeft: 8 }}>停止</button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

export default InkPage
