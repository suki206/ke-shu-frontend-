import { useState, useEffect, useRef, Fragment } from 'react'
import { daysLabel } from './dustCommon'

// ============================================================
// 合墨 · INK —— 引力页右下角天体子页面，全屏跃迁（与信标/数据罗盘
// 同款骨架）。柯与枢在同一条时间流里轮流落笔，不分左右，读起来是
// 一条连续文稿。内部自己切两级视图：笔记列表 ↔ 单篇时间流，数据
// 全部由 ChatPage 通过 props 传入/收回，本文件不直接掉接口。
//
// 三个选项的语义（无论谁写完，点按钮的永远是真人）：
//   落笔     —— 把手上这段存成正式段落，到此为止
//   让他/我续 —— 先存这段，再让对方接着写（不隔线，续在后面）
//   让他/我另写 —— 先存这段，再让对方另起一段（光丝隔开）
// 枢生成的段落写完即正式落笔（枢没有草稿态），所以枢那侧的三个按
// 钮只用来决定"接下来轮到谁、以什么方式接"，不做二次持久化。
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

const MODE_LABEL = { original: '原', continue: '续', parallel: '新' }
const daysSince = (iso) => (iso ? Math.max(0, (Date.now() - new Date(iso).getTime()) / 86400000) : null)
const fmtDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`
}

const InkPage = ({
  notes, notesLoading, onFetchNotes, onCreateNote, onUpdateNote, onDeleteNote,
  activeNote, activeNoteLoading, onOpenNote,
  onSaveDraft, onFinalizeEntry, onGenerateEntry, onStopGenerate, generating,
  showToast, onClose,
}) => {
  const [view, setView]           = useState('list') // 'list' | 'note'
  const [openNoteId, setOpenNoteId] = useState(null)
  const [composeText, setComposeText] = useState('')
  const [composeMode, setComposeMode] = useState('original')
  const [composeFocused, setComposeFocused] = useState(false)
  const [justGenerated, setJustGenerated]   = useState(false)
  const [titleDraft, setTitleDraft]   = useState('')
  const [tagInput, setTagInput]       = useState('')
  const [showTagInput, setShowTagInput] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const textareaRef = useRef(null)
  const prevGenerating = useRef(false)

  const note    = activeNote?.note
  const entries = activeNote?.entries || []
  const lastEntry = entries[entries.length - 1]

  // 打开一篇笔记（或它的草稿）时，把草稿灌进输入框，光标落在末尾
  useEffect(() => {
    if (!note) return
    setComposeText(note.draft_content || '')
    setComposeMode(note.draft_mode || (entries.length ? 'continue' : 'original'))
    setJustGenerated(false)
    setTitleDraft(note.title || '')
    if (note.draft_content) {
      requestAnimationFrame(() => {
        const el = textareaRef.current
        if (!el) return
        el.focus()
        const len = el.value.length
        el.setSelectionRange(len, len)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [note?.id, note?.draft_updated_at])

  // 生成结束的那一刻（true → false）弹出"落笔/让我续写/让我另写"轻提示，
  // 纯客户端瞬时状态，不持久化，翻页或开始打字就自然消失
  useEffect(() => {
    if (prevGenerating.current && !generating) setJustGenerated(true)
    prevGenerating.current = generating
  }, [generating])

  const openNote = async (id) => {
    setOpenNoteId(id)
    setView('note')
    setConfirmDelete(false)
    await onOpenNote?.(id)
  }
  const goBackToList = () => {
    setView('list'); setOpenNoteId(null); setComposeText(''); setConfirmDelete(false)
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

  const startCompose = (mode) => {
    setComposeMode(mode); setJustGenerated(false)
    requestAnimationFrame(() => textareaRef.current?.focus())
  }

  const holdForLater = async () => {
    if (!composeText.trim()) return
    await onSaveDraft?.(openNoteId, { content: composeText, mode: composeMode })
    showToast?.('已存为待续')
    goBackToList()
  }

  // nextAction: null(落笔到此为止) | 'continue' | 'parallel'
  const commitMine = async (nextAction) => {
    const text = composeText.trim()
    if (!text || generating) return
    await onFinalizeEntry?.(openNoteId, { content: text, mode: composeMode })
    setComposeText('')
    setComposeMode('continue')
    if (nextAction) await onGenerateEntry?.(openNoteId, nextAction)
  }

  const letShuStart = () => onGenerateEntry?.(openNoteId, 'original')

  const hasEntries     = entries.length > 0
  const hasComposeText = !!composeText.trim()
  const showEmptyState   = !hasEntries && !hasComposeText && !generating
  const showLetShuStart  = !hasEntries && !hasComposeText && !generating
  const showNudge        = justGenerated && !hasComposeText && lastEntry?.author === 'shu' && !generating
  const showModeToggle   = hasEntries && !generating

  return (
    <div className="ink-page">
      <div className="ink-page-header">
        <button className="ink-page-iconbtn" onClick={handleBack} aria-label="返回">
          <BackIcon />
        </button>
        <div className="ink-page-title">INK · 合墨</div>
        <span className="ink-page-header-spacer" />
      </div>

      <div className="ink-page-body">
        {view === 'list' && (
          <div className="ink-page-content">
            <div className="ink-page-eyebrow">柯与枢的共笔手记</div>

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
                    <span>{n.entryCount || 0} 段</span>
                    <span>{daysLabel(daysSince(n.updated_at))}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {view === 'note' && (
          <div className="ink-page-content is-note">
            <div className="ink-note-title-row">
              <input
                className="ink-note-title"
                value={titleDraft}
                onChange={e => setTitleDraft(e.target.value)}
                onBlur={commitTitle}
                onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
                placeholder="未命名手记"
              />
            </div>
            <div className="ink-note-submeta">
              <span>创建于 {fmtDate(note?.created_at)}</span>
              <span>更新于 {daysLabel(daysSince(note?.updated_at))}</span>
              <button className="ink-hold-btn" onClick={handleDeleteNote} style={{ marginLeft: 'auto' }}>
                {confirmDelete ? '再次点击删除' : '删除这篇'}
              </button>
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
                <div className="ink-timeline">
                  {entries.map((e, i) => (
                    <Fragment key={e.id || `tmp-${i}`}>
                      {e.mode === 'parallel' && <div className="ink-divider" />}
                      <div className={`ink-entry is-${e.author}${e.streaming ? ' is-streaming' : ''}`}>
                        <div className="ink-entry-head">
                          <span className="ink-entry-badge">【{e.author}】</span>
                          <span className="ink-entry-mode">{MODE_LABEL[e.mode] || '原'}</span>
                        </div>
                        <div className="ink-entry-content">{e.content}</div>
                      </div>
                    </Fragment>
                  ))}
                </div>

                {showEmptyState && (
                  <div className="ink-empty">
                    <span className="ink-empty-glow" />
                    <span className="ink-empty-text">还没有墨迹，谁先起笔？</span>
                  </div>
                )}

                {showNudge && (
                  <div className="ink-nudge-row">
                    <span className="ink-nudge-hint">枢写完了这一段——</span>
                    <button className="ink-action-btn line-btn" onClick={() => setJustGenerated(false)}>落笔</button>
                    <button className="ink-action-btn line-btn" onClick={() => startCompose('continue')}>让我续写</button>
                    <button className="ink-action-btn line-btn" onClick={() => startCompose('parallel')}>让我另写</button>
                  </div>
                )}

                {showLetShuStart && (
                  <button className="ink-empty-invite line-btn" onClick={letShuStart}>
                    让枢先写
                  </button>
                )}

                <div className="ink-composer">
                  <div className="ink-composer-toolbar">
                    {showModeToggle ? (
                      <button
                        className="ink-mode-toggle"
                        onClick={() => setComposeMode(m => (m === 'parallel' ? 'continue' : 'parallel'))}
                      >
                        {composeMode === 'parallel' ? '✦ 另起一段' : '⌇ 接着写'}
                      </button>
                    ) : <span />}
                    {hasComposeText && !generating && (
                      <button className="ink-hold-btn" onClick={holdForLater}>待续</button>
                    )}
                  </div>

                  {composeMode === 'parallel' && hasEntries && <div className="ink-divider" style={{ marginTop: 0 }} />}

                  <div className={`composer-shell ink-composer-shell${composeFocused ? ' is-focused' : ''}`}>
                    <textarea
                      ref={textareaRef}
                      className="ink-composer-textarea"
                      placeholder={hasEntries ? '接着写…' : '谁先起笔…'}
                      value={composeText}
                      onChange={e => setComposeText(e.target.value)}
                      onFocus={() => { setComposeFocused(true); setJustGenerated(false) }}
                      onBlur={() => setComposeFocused(false)}
                      disabled={generating}
                    />
                  </div>

                  {hasComposeText && (
                    <div className="ink-action-row">
                      <button className="ink-action-btn line-btn" onClick={() => commitMine(null)} disabled={generating}>
                        落笔
                      </button>
                      <button className="ink-action-btn line-btn is-primary" onClick={() => commitMine('continue')} disabled={generating}>
                        让他续
                      </button>
                      <button className="ink-action-btn line-btn is-primary" onClick={() => commitMine('parallel')} disabled={generating}>
                        让他另写
                      </button>
                    </div>
                  )}

                  {generating && (
                    <div className="ink-nudge-hint" style={{ marginTop: 8 }}>
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
