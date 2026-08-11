import { useState, useEffect } from 'react'
import ChronosPage from './ChronosPage'
import TokenDashboardPage from './TokenDashboardPage'
import BeaconPage from './BeaconPage'
import EchoPage from './EchoPage'
import InkPage from './InkPage'

// ============================================================
// 引力 · 五天体固定布局 —— 功能星系
// 时轨（日晷）：锚点"在一起天数"作为常驻读数悬在日晷上方，构成
// 整页唯一的视觉重心。
// 回声（气态巨行星）：点开是全屏「调频面板」（EchoPage）——人格
// Persona（system prompt）、模型切换、Temperature，原本塞在设置页
// ConstantPage 里的这三块整体搬到这里，本批再从弹窗升级为全屏。
// 数据罗盘（双星系统）：本批从占位升级为功能天体，点开是全屏
// Token 仪表盘（TokenDashboardPage）——原本折叠在设置页最深处的
// 用量统计整体搬到这里。星历速览本批仍是视觉占位，点击给 toast，
// 留给下一批。
// 信标（脉冲星）：本批从弹窗改为全屏跃迁（BeaconPage），并把设置页
// 里的「备忘」整块一并迁来，与原有的便签清单合并展示。
// 合墨（原彗星 · 星历速览占位）：本批升级为功能天体，点开是全屏
// 共笔空间（InkPage）——柯与枢在同一条时间流里轮流落笔，不分左右。
// 视觉也从彗星换成墨滴+光丝，呼应笔记里"新"模式段落之间的分隔线。
// 目前时轨 / 信标 / 回声 / 数据罗盘 / 合墨五个功能天体点开均为全屏
// 子页，视觉与交互统一，五天体全部点亮。
// ============================================================

const FIXED_POSITIONS = {
  sundial: { x: 50, y: 22 },
  pulsar:  { x: 22, y: 33 },
  giant:   { x: 78, y: 30 },
  binary:  { x: 19, y: 75 },
  ink:     { x: 81, y: 77 },
}

const BODIES = [
  { id: 'sundial', label: '时轨',     kind: 'sundial', size: 112, functional: true  },
  { id: 'pulsar',  label: '信标',     kind: 'pulsar',  size: 58,  functional: true  },
  { id: 'giant',   label: '回声',     kind: 'giant',   size: 74,  functional: true  },
  { id: 'binary',  label: '数据罗盘', kind: 'binary',  size: 54,  functional: true  },
  { id: 'ink',     label: '合墨',     kind: 'ink',     size: 44,  functional: true  },
]

const daysBetween = (a, b) => Math.round((b.getTime() - a.getTime()) / 86400000)

const GravityPage = ({ beacons, beaconText, setBeaconText, onAddBeacon, onToggleBeacon, onDeleteBeacon, showToast,
  config, setConfig, onSaveConfig, onDiscoverModels, onEnablePush,
  tokenStats, tokenStatsLoading, onFetchTokenStats,
  inkNotes, inkNotesLoading, onFetchInkNotes, onCreateInkNote, onUpdateInkNote, onDeleteInkNote,
  activeInkNote, activeInkNoteLoading, onOpenInkNote,
  onSaveInkDraft, onFinalizeInkEntry, onGenerateInkEntry, onStopInkGenerate, onDeleteLastInkEntry, onUpdateInkEntry,
  inkGenerating, inkStreamText }) => {
  const [openBody, setOpenBody] = useState(null)

  // 从「回声/信标/数据罗盘」等全屏子页返回引力页时，若键盘还没收起，
  // .app-shell 会先按矮高度渲染出这一页，随后键盘收起、高度再用 CSS
  // 过渡撑高——五天体是按容器高度百分比定位的，会跟着这段过渡逐帧
  // 抖动。这里在引力页刚挂载的一小段时间内给 .app-shell 打上
  // no-shell-transition，让那次"矮→高"的变化直接跳变、不做过渡；
  // 短暂延时后移除，不影响聊天页等场景正常的键盘避让动画。
  useEffect(() => {
    const shell = document.querySelector('.app-shell')
    if (!shell) return
    shell.classList.add('no-shell-transition')
    const t = setTimeout(() => shell.classList.remove('no-shell-transition'), 220)
    return () => { clearTimeout(t); shell.classList.remove('no-shell-transition') }
  }, [])

  const anchorDate = config?.anchor_date || ''
  const anchorDays = anchorDate ? daysBetween(new Date(anchorDate), new Date()) + 1 : null

  const handleBodyClick = (body) => {
    if (!body.functional) { showToast?.('即将抵达 · 敬请期待'); return }
    setOpenBody(body.id)
    // 数据罗盘：每次打开都拉一次最新用量，跟原设置页里"展开即拉取"的行为一致
    if (body.id === 'binary') onFetchTokenStats?.()
    // 合墨：每次打开都刷一遍笔记列表，拿到最新的"待续"标记和预览
    if (body.id === 'ink') onFetchInkNotes?.()
  }

  const onAnchorChange = (d) => {
    const next = { ...config, anchor_date: d }
    setConfig(next)
    onSaveConfig(next)
  }

  return (
    <div className="tab-page gravity-page">
      <div className="gravity-nebula" aria-hidden="true">
        <span className="gravity-nebula-layer l1" />
        <span className="gravity-nebula-layer l2" />
        <span className="gravity-nebula-layer l3" />
      </div>

      <div style={{ padding: '22px 22px 4px', flexShrink: 0, position: 'relative', zIndex: 2 }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '15px', letterSpacing: '4px', color: 'var(--c-text)' }}>GRAVITY</div>
        <div style={{ fontSize: '11px', letterSpacing: '1.5px', color: 'var(--c-text-faint)', marginTop: 6, fontFamily: 'var(--font-accent)', fontStyle: 'italic' }}>彼此牵引的引力场</div>
      </div>

      <div className="gravity-constellation">
        <svg className="gravity-threads" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          {BODIES.filter(b => b.id !== 'sundial').map((b, i) => {
            const p = FIXED_POSITIONS[b.id]
            const c = FIXED_POSITIONS.sundial
            return (
              <line key={b.id} x1={p.x} y1={p.y} x2={c.x} y2={c.y}
                className="gravity-thread" style={{ animationDelay: `${i * 0.7}s` }} vectorEffect="non-scaling-stroke" />
            )
          })}
        </svg>

        {BODIES.map(body => {
          const pos = FIXED_POSITIONS[body.id]
          return (
            <div
              key={body.id}
              className={`gravity-body gravity-body-${body.kind}`}
              style={{ left: `${pos.x}%`, top: `${pos.y}%`, width: body.size, height: body.size }}
              onClick={() => handleBodyClick(body)}
              role="button"
              tabIndex={0}
              aria-label={body.label}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleBodyClick(body) } }}
            >
              {body.kind === 'sundial' && (
                <>
                  <span className="gravity-sundial-rim" />
                  <span className="gravity-sundial-ticks" />
                  <span className="gravity-sundial-core" />
                  <span className="gravity-sundial-moon" />
                  <div className="gravity-sundial-readout">
                    {anchorDays != null ? (
                      <>
                        <span className="gravity-sundial-eyebrow">在一起的第</span>
                        <span className="gravity-sundial-numline">
                          <span className="gravity-sundial-num">{anchorDays}</span>
                          <span className="gravity-sundial-unit">天</span>
                        </span>
                      </>
                    ) : (
                      <span className="gravity-sundial-prompt">轻触 · 设定你们的锚点</span>
                    )}
                  </div>
                </>
              )}
              {body.kind === 'pulsar' && (
                <>
                  <span className="gravity-pulsar-trail" />
                  <span className="gravity-pulsar-crosshair" />
                </>
              )}
              {body.kind === 'giant' && (
                <>
                  <span className="gravity-ring gravity-ring-1" />
                  <span className="gravity-ring gravity-ring-2" />
                  <span className="gravity-ring gravity-ring-3" />
                </>
              )}
              {body.kind === 'binary' && (
                <>
                  <span className="gravity-binary-lens" />
                  <span className="gravity-binary-orbit" />
                </>
              )}
              {body.kind === 'ink' && (
                <>
                  <span className="gravity-ink-thread" />
                  <span className="gravity-ink-drip" />
                </>
              )}
              {body.kind !== 'binary' && body.kind !== 'sundial' && <span className="gravity-body-orb" />}
              {body.label && body.kind !== 'sundial' && <span className="gravity-body-label">{body.label}</span>}
            </div>
          )
        })}
      </div>

      {/* 时轨子页面：全屏跃迁，只负责展示；锚点/倒计时/经期的输入都在
          场景内点对应天体触发，不在这里传表单状态 */}
      {openBody === 'sundial' && (
        <ChronosPage
          onClose={() => setOpenBody(null)}
          showToast={showToast}
          anchorDate={anchorDate}
          onAnchorChange={onAnchorChange}
        />
      )}

      {/* 回声子页面：全屏跃迁（与信标/数据罗盘一致） */}
      {openBody === 'giant' && (
        <EchoPage
          config={config || {}}
          setConfig={setConfig}
          onSaveConfig={onSaveConfig}
          onDiscoverModels={onDiscoverModels}
          showToast={showToast}
          onClose={() => setOpenBody(null)}
        />
      )}

      {/* 信标子页面：全屏跃迁（与数据罗盘一致），并入原设置页的备忘 */}
      {openBody === 'pulsar' && (
        <BeaconPage
          beacons={beacons} beaconText={beaconText} setBeaconText={setBeaconText}
          onAddBeacon={onAddBeacon} onToggleBeacon={onToggleBeacon} onDeleteBeacon={onDeleteBeacon}
          config={config} setConfig={setConfig} onSaveConfig={onSaveConfig} onEnablePush={onEnablePush}
          showToast={showToast}
          onClose={() => setOpenBody(null)}
        />
      )}

      {/* 数据罗盘子页面：全屏 Token 仪表盘（原设置页用量统计整体迁至此） */}
      {openBody === 'binary' && (
        <TokenDashboardPage
          stats={tokenStats}
          loading={tokenStatsLoading}
          onRefresh={onFetchTokenStats}
          onClose={() => setOpenBody(null)}
        />
      )}

      {/* 合墨子页面：全屏接力写作——一篇笔记只有一段连续正文，柯与枢
          轮流往后接着写，列表/详情两级视图在 InkPage 内部自行切换，
          这里只负责数据的进出 */}
      {openBody === 'ink' && (
        <InkPage
          notes={inkNotes} notesLoading={inkNotesLoading}
          onFetchNotes={onFetchInkNotes} onCreateNote={onCreateInkNote}
          onUpdateNote={onUpdateInkNote} onDeleteNote={onDeleteInkNote}
          activeNote={activeInkNote} activeNoteLoading={activeInkNoteLoading}
          onOpenNote={onOpenInkNote}
          onSaveDraft={onSaveInkDraft} onFinalizeEntry={onFinalizeInkEntry}
          onGenerateEntry={onGenerateInkEntry} onStopGenerate={onStopInkGenerate}
          onDeleteLastEntry={onDeleteLastInkEntry} onUpdateEntry={onUpdateInkEntry}
          generating={inkGenerating} streamText={inkStreamText}
          showToast={showToast}
          onClose={() => setOpenBody(null)}
        />
      )}
    </div>
  )
}

export default GravityPage
