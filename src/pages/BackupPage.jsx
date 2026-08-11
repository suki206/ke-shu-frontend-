import { useState, useEffect } from 'react'

// ============================================================
// 数据备份与恢复 · BACKUP —— 设置页"数据"那块点开的全屏中心。
// 原来这里只有一个"导出当前对话"按钮，只认当前正打开的这一个会话，
// 格式固定 Markdown，没有选择余地。现在换成一个真正的备份中心：
//   聊天记录：点"导出"弹出会话选择清单（单选/多选都行，带全选），
//     选完再选格式（Markdown 便于阅读 / JSON 结构化，适合以后恢复），
//     选中的多个会话会合并进同一个文件，不用一个个单独下载。
//   茧星记忆 / 日记 / 回声配置：各自数据量不大、也不是"挑一部分"的
//     场景，直接整体导出成 JSON，不需要选择清单那一套。
// 恢复（导入）这次没做——只做了导出这一半，见跟用户的约定。
// 回声配置导出时 API Key 会被清空，不把密钥明文写进备份文件。
// ============================================================

const BackIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M15 18l-6-6 6-6" />
  </svg>
)

const CheckIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6L9 17l-5-5" />
  </svg>
)

const StatCard = ({ num, label }) => (
  <div className="backup-stat-card">
    <div className="backup-stat-num">{num}</div>
    <div className="backup-stat-label">{label}</div>
  </div>
)

const BackupPage = ({
  sessionList = [], cocoonKeCount = 0, cocoonShuCount = 0, diaryCount = 0, echoModelCount = 0,
  onExportSessions, onExportCocoon, onExportDiary, onExportEchoConfig,
  showToast, onClose,
}) => {
  // 打开期间收起底部导航——跟回声/茧星同一个根因同一个做法
  useEffect(() => {
    document.documentElement.classList.add('backup-open')
    return () => document.documentElement.classList.remove('backup-open')
  }, [])

  // ── 聊天记录选择清单 ─────────────────────────────────────────
  const [pickerOpen,  setPickerOpen]  = useState(false)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [format,      setFormat]      = useState('md')
  const [exporting,   setExporting]   = useState(false)

  const openPicker = () => {
    if (sessionList.length === 0) { showToast?.('还没有任何对话'); return }
    setSelectedIds(new Set(sessionList.map(s => s.id))) // 默认全选，手动取消比手动一个个勾更省事
    setFormat('md')
    setPickerOpen(true)
  }
  const toggleId = (id) => setSelectedIds(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const allSelected = sessionList.length > 0 && selectedIds.size === sessionList.length
  const toggleAll = () => setSelectedIds(allSelected ? new Set() : new Set(sessionList.map(s => s.id)))

  const confirmExport = async () => {
    if (selectedIds.size === 0) { showToast?.('先选至少一个对话'); return }
    setExporting(true)
    try { await onExportSessions?.([...selectedIds], format); setPickerOpen(false) }
    finally { setExporting(false) }
  }

  return (
    <div className="backup-page">
      <div className="gravity-nebula" aria-hidden="true">
        <span className="gravity-nebula-layer l1" />
        <span className="gravity-nebula-layer l2" />
        <span className="gravity-nebula-layer l3" />
      </div>

      <div className="backup-page-header">
        <button className="backup-page-iconbtn" onClick={onClose} aria-label="返回">
          <BackIcon />
        </button>
        <div className="backup-page-title">数据备份与恢复</div>
        <span className="backup-page-header-spacer" />
      </div>

      <div className="backup-page-body">
        <div className="backup-page-content">

          <div className="backup-stat-grid">
            <StatCard num={sessionList.length} label="聊天记录" />
            <StatCard num={cocoonKeCount + cocoonShuCount} label="茧星记忆" />
            <StatCard num={diaryCount} label="日记" />
            <StatCard num={echoModelCount} label="回声模型" />
          </div>

          {/* 聊天记录 */}
          <div className="backup-section">
            <div className="backup-section-head">
              <div className="backup-section-title">聊天记录</div>
              <div className="backup-section-sub">挑一个或几个会话，合并导出成一个文件</div>
            </div>
            <div className="backup-section-count">当前共有 {sessionList.length} 段对话</div>
            <button className="line-btn backup-export-btn" onClick={openPicker}>导出</button>
          </div>

          {/* 茧星记忆 */}
          <div className="backup-section">
            <div className="backup-section-head">
              <div className="backup-section-title">茧星记忆</div>
              <div className="backup-section-sub">外层丝（柯写的）+ 内芯（枢写的），整体导出</div>
            </div>
            <div className="backup-section-count">当前共有 {cocoonKeCount + cocoonShuCount} 条记忆</div>
            <button className="line-btn backup-export-btn" onClick={onExportCocoon}>导出</button>
          </div>

          {/* 日记 */}
          <div className="backup-section">
            <div className="backup-section-head">
              <div className="backup-section-title">日记</div>
              <div className="backup-section-sub">枢写的、以及他选择不写的那些日子，整体导出</div>
            </div>
            <div className="backup-section-count">当前共有 {diaryCount} 篇</div>
            <button className="line-btn backup-export-btn" onClick={onExportDiary}>导出</button>
          </div>

          {/* 回声配置 */}
          <div className="backup-section">
            <div className="backup-section-head">
              <div className="backup-section-title">回声配置</div>
              <div className="backup-section-sub">人格、温度、模型与提供商列表</div>
            </div>
            <div className="backup-section-count">当前共有 {echoModelCount} 个已启用模型</div>
            <div className="sensitivity-hint" style={{ marginTop: 4, marginBottom: 10 }}>API Key 不会被导出，恢复后需要重新填写</div>
            <button className="line-btn backup-export-btn" onClick={onExportEchoConfig}>导出</button>
          </div>

        </div>
      </div>

      {/* 会话选择清单 */}
      {pickerOpen && (
        <div className="modal-veil" onClick={() => !exporting && setPickerOpen(false)}>
          <div className="modal-card backup-picker-card" onClick={e => e.stopPropagation()}>
            <div className="modal-title" style={{ marginBottom: 14 }}>选择要导出的对话</div>

            <div className="backup-picker-toolbar">
              <button className="backup-picker-selectall" onClick={toggleAll}>
                {allSelected ? '取消全选' : '全选'}
              </button>
              <span className="backup-picker-count">已选 {selectedIds.size} / {sessionList.length}</span>
            </div>

            <div className="backup-picker-list">
              {sessionList.map(s => {
                const checked = selectedIds.has(s.id)
                return (
                  <div key={s.id} className={`backup-picker-item${checked ? ' is-checked' : ''}`} onClick={() => toggleId(s.id)}>
                    <span className="backup-picker-checkbox">{checked && <CheckIcon />}</span>
                    <span className="backup-picker-item-title">{s.title || '对话'}</span>
                  </div>
                )
              })}
            </div>

            <div className="backup-picker-format">
              <span className="backup-picker-format-label">格式</span>
              <button
                className={format === 'md' ? 'solid-btn' : 'line-btn'}
                onClick={() => setFormat('md')}
                style={{ flex: 1, padding: '9px 0', borderRadius: 10, fontSize: '10.5px' }}
              >Markdown</button>
              <button
                className={format === 'json' ? 'solid-btn' : 'line-btn'}
                onClick={() => setFormat('json')}
                style={{ flex: 1, padding: '9px 0', borderRadius: 10, fontSize: '10.5px' }}
              >JSON</button>
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button className="line-btn" disabled={exporting} onClick={() => setPickerOpen(false)} style={{ flex: 1, padding: '11px 0', borderRadius: '999px', fontSize: '11.5px', color: 'var(--c-text-muted)' }}>取消</button>
              <button className="solid-btn" disabled={exporting} onClick={confirmExport} style={{ flex: 1, padding: '11px 0', borderRadius: '999px', fontSize: '11.5px' }}>
                {exporting ? '导出中…' : `导出（${selectedIds.size}）`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default BackupPage
