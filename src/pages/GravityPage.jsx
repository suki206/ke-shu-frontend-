import { useState, useEffect } from 'react'
import ChronosPage from './ChronosPage'
import TokenDashboardPage from './TokenDashboardPage'
import BeaconPage from './BeaconPage'
import EchoPage from './EchoPage'
import InkPage from './InkPage'
import CocoonPage from './CocoonPage'

// ============================================================
// 引力 · 六天体 —— 功能星系
// ============================================================
// 【2026-08-12 重做：构图 + 静态化】
// 柯的原话是"界面的布局看着也一般""静态的也可以，但要好看""不要烧机"。
// 这两件事其实是同一件事，一起改：
//
// ① 构图：从"日晷吊在最上面、五个天体散在下面、五条直线全部指向它"
//    改成真正的引力场——日晷（在一起的天数）落在正中当引力井，
//    五个天体按角度**精确落在两条椭圆轨道上**，轨道本身画出来。
//    原来那五条辐射直线像蜘蛛网，而且天体位置是拍脑袋定的百分比，
//    彼此间距忽宽忽窄；现在位置由"在哪条轨道、第几个角度"算出来，
//    自然是匀的。
//    坐标能对得这么准，靠的是背景 SVG 用 viewBox="0 0 100 100" +
//    preserveAspectRatio="none"：SVG 里的 1 个单位 = 容器宽/高的 1%，
//    跟天体用的 left/top 百分比是同一套坐标，圆在 SVG 里画出来正好
//    就是屏幕上那个椭圆，天体落上去严丝合缝，不需要 JS 量任何像素。
//
// ② 静态化：整页**一个无限循环动画都不留**。原来这一页同时跑着
//    十几条 infinite 动画——三层 150% 大小、blur(64px) 还叠了
//    mix-blend-mode 的星云在飘，光环在转，双星在公转，日晷刻度环在
//    转，光丝在摆……其中最贵的是那三层星云：每一帧都要把一张比屏幕
//    还大的图重新做一次 64 像素高斯模糊再混合，手机 GPU 一直满载，
//    这就是"烧机"的主要来源。现在改成一次画完就不动的渐变与描边，
//    绘制成本几乎为零，静止的画面反而更像一张星图。
//    交互反馈保留（按下回弹、键盘焦点圈），那是点了才播一次的过渡，
//    不占空闲时的每一帧。
//
// 各天体点开都是全屏子页（时轨/信标/回声/数据罗盘/合墨/茧星），
// 六天体全部点亮。
// ============================================================

// 轨道中心：略高于正中，给下方"轻触说明"留白
const ORBIT_CX = 50
const ORBIT_CY = 46
// 两条轨道的半径（SVG 单位 = 容器百分比）
const ORBIT_INNER = 27
const ORBIT_OUTER = 41

// 极坐标 → 百分比坐标。角度用"钟面度数"：0 = 正右，顺时针为正
const onOrbit = (radius, deg) => {
  const rad = (deg * Math.PI) / 180
  return { x: ORBIT_CX + radius * Math.cos(rad), y: ORBIT_CY + radius * Math.sin(rad) }
}

// 天体在轨道上的落点。角度是挑过的：内轨两颗对称地挂在日晷左右
// 斜上方，茧星（枢的自我）正下方压住中轴；外轨两颗落在更低更外的
// 位置，左右对称，整体是一个稳定的三角构图，不会一边重一边空。
const FIXED_POSITIONS = {
  sundial: { x: ORBIT_CX, y: ORBIT_CY },
  pulsar:  onOrbit(ORBIT_INNER, 208),   // 左上 · 信标
  giant:   onOrbit(ORBIT_INNER, 332),   // 右上 · 回声
  cocoon:  onOrbit(ORBIT_INNER, 90),    // 正下 · 茧星
  binary:  onOrbit(ORBIT_OUTER, 145),   // 左下 · 数据罗盘
  ink:     onOrbit(ORBIT_OUTER, 35),    // 右下 · 合墨
}

const BODIES = [
  { id: 'sundial', label: '时轨',     kind: 'sundial', size: 128, functional: true },
  { id: 'pulsar',  label: '信标',     kind: 'pulsar',  size: 54,  functional: true },
  { id: 'giant',   label: '回声',     kind: 'giant',   size: 68,  functional: true },
  { id: 'binary',  label: '数据罗盘', kind: 'binary',  size: 52,  functional: true },
  { id: 'ink',     label: '合墨',     kind: 'ink',     size: 46,  functional: true },
  { id: 'cocoon',  label: '茧星',     kind: 'cocoon',  size: 50,  functional: true },
]

// 【2026-08-12 修复】跟时轨页同一个毛病：原来是
// (b - a) / 86400000 直接四舍五入，而 anchor 是 'YYYY-MM-DD'，会被
// 解析成 UTC 零点——北京时间晚上八点之后差值就过了 X.5 天，四舍五入
// 进位，引力页正中那个大数字每天傍晚会提前跳到明天的数。现在两边都
// 先归到本地日历日零点再相减，跟人数日子的方式一致。
const startOfDay = (v) => {
  const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(v)
  d.setHours(0, 0, 0, 0)
  return d
}
const daysBetween = (a, b) => Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86400000)

const GravityPage = ({ beacons, beaconText, setBeaconText, onAddBeacon, onToggleBeacon, onDeleteBeacon, showToast,
  config, setConfig, onSaveConfig, onDiscoverModels, onEnablePush,
  tokenStats, tokenStatsLoading, onFetchTokenStats,
  inkNotes, inkNotesLoading, onFetchInkNotes, onCreateInkNote, onUpdateInkNote, onDeleteInkNote,
  activeInkNote, activeInkNoteLoading, onOpenInkNote,
  onSaveInkDraft, onFinalizeInkEntry, onGenerateInkEntry, onStopInkGenerate, onDeleteLastInkEntry, onUpdateInkEntry,
  inkGenerating, inkStreamText,
  cocoonKe, cocoonShu, cocoonShuLimit, cocoonLoading, onFetchCocoon, onAddCocoonKe, onDeleteCocoon, onSaveCocoonLimit }) => {
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
  const anchorDays = anchorDate ? daysBetween(anchorDate, new Date()) + 1 : null

  const handleBodyClick = (body) => {
    if (!body.functional) { showToast?.('即将抵达 · 敬请期待'); return }
    setOpenBody(body.id)
    // 数据罗盘：每次打开都拉一次最新用量，跟原设置页里"展开即拉取"的行为一致
    if (body.id === 'binary') onFetchTokenStats?.()
    // 合墨：每次打开都刷一遍笔记列表，拿到最新的"待续"标记和预览
    if (body.id === 'ink') onFetchInkNotes?.()
    // 茧星：每次打开都刷一遍，拿到聊天里刚触发写入的最新条目
    if (body.id === 'cocoon') onFetchCocoon?.()
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

      <div className="gravity-header">
        <div className="gravity-header-title">GRAVITY</div>
        <div className="gravity-header-sub">彼此牵引的引力场</div>
      </div>

      <div className="gravity-constellation">
        {/* 轨道层：一次画完就不动。两条椭圆是天体真正的落点所在，
            不是装饰——下面每个天体的 left/top 就是从同一组半径和
            角度算出来的（见文件顶部 onOrbit），所以它们一定精确
            压在线上。中间那圈更淡的短刻度是引力井的示意。 */}
        <svg className="gravity-orbits" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <circle className="gravity-orbit-ring" cx={ORBIT_CX} cy={ORBIT_CY} r={ORBIT_INNER} vectorEffect="non-scaling-stroke" />
          <circle className="gravity-orbit-ring is-outer" cx={ORBIT_CX} cy={ORBIT_CY} r={ORBIT_OUTER} vectorEffect="non-scaling-stroke" />
          <circle className="gravity-orbit-well" cx={ORBIT_CX} cy={ORBIT_CY} r={ORBIT_INNER * 0.52} vectorEffect="non-scaling-stroke" />
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
                      <span className="gravity-sundial-prompt">轻触 · 设定锚点</span>
                    )}
                  </div>
                </>
              )}
              {body.kind === 'pulsar' && (
                <>
                  <span className="gravity-body-orb" />
                  <span className="gravity-pulsar-crosshair" />
                </>
              )}
              {body.kind === 'giant' && (
                <>
                  <span className="gravity-body-orb" />
                  <span className="gravity-ring gravity-ring-1" />
                  <span className="gravity-ring gravity-ring-2" />
                </>
              )}
              {body.kind === 'binary' && (
                <>
                  <span className="gravity-binary-orbit" />
                </>
              )}
              {body.kind === 'ink' && (
                <>
                  <span className="gravity-body-orb" />
                  <span className="gravity-ink-thread" />
                </>
              )}
              {body.kind === 'cocoon' && (
                <>
                  <span className="gravity-cocoon-core" />
                  <span className="gravity-cocoon-wisp gravity-cocoon-wisp-1" />
                  <span className="gravity-cocoon-wisp gravity-cocoon-wisp-2" />
                </>
              )}
              {body.kind !== 'sundial' && <span className="gravity-body-label">{body.label}</span>}
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
      {/* 茧星子页面：全屏，枢的自我记忆——外层丝（柯写）+ 内芯（枢写），
          两边都是列表，只能删不能改；枢那边有条数上限，满了后端会拒绝
          写入并通过 SSE 的 cocoonFull 事件提示（在 ChatPage 里接住转成 toast） */}
      {openBody === 'cocoon' && (
        <CocoonPage
          keEntries={cocoonKe} shuEntries={cocoonShu} shuLimit={cocoonShuLimit}
          loading={cocoonLoading}
          onAddKe={onAddCocoonKe} onDelete={onDeleteCocoon} onSaveLimit={onSaveCocoonLimit}
          showToast={showToast}
          onClose={() => setOpenBody(null)}
        />
      )}
    </div>
  )
}

export default GravityPage
