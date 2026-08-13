/**
 * StardustPage — 星尘（记忆库）
 *
 * 原来这一页是内联在 ChatPage.jsx 里的一小段，只有 REVERIE 与
 * CONSTELLATIONS 两个视图，其余标签是纯装饰。现在拆成独立文件，
 * 并点亮三个：
 *
 *   TRACES         把深空摊平成时间线，用来"读"而不是"看"
 *   BREATH         搜索与回想历史，纯前端，零 AI 调用
 *   REVERIE        Three.js 记忆深空（默认）
 *   NOON           高光五条
 *   CONSTELLATIONS 时间 × 重要度星图，同域连成星座
 *
 * DRIFT / ECHOES / FRAGMENTS / AXIS 仍然留着但不可点，标记为"待点亮"，
 * 后期赋予功能时直接往 STARDUST_TABS 里把 ready 改成 true 即可。
 *
 * 详情从居中弹窗改成了底部浮层：点开一条记忆时，深空里的相机正在
 * 缓慢推近那颗粒子，居中弹窗会把这个过程整个盖住。
 */
import { useEffect, useRef } from 'react'
import MemoryDeepSpace from './MemoryDeepSpace'
import ConstellationMap from './ConstellationMap'
import { TracesView, BreathView, NoonView } from './StardustViews'
import { daysLabel, daysOf, domainColor, importanceText } from './dustCommon'

const STARDUST_TABS = [
  { key: 'traces',         label: 'TRACES',         ready: true,  cn: '时间线' },
  { key: 'breath',         label: 'BREATH',         ready: true,  cn: '回想' },
  { key: 'reverie',        label: 'REVERIE',        ready: true,  cn: '深空' },
  { key: 'drift',          label: 'DRIFT',          ready: false, cn: '漂移' },
  { key: 'echoes',         label: 'ECHOES',         ready: false, cn: '回声' },
  { key: 'noon',           label: 'NOON',           ready: true,  cn: '高光' },
  { key: 'constellations', label: 'CONSTELLATIONS', ready: true,  cn: '星图' },
  { key: 'fragments',      label: 'FRAGMENTS',      ready: false, cn: '碎片' },
  { key: 'axis',           label: 'AXIS',           ready: false, cn: '轴' },
]

const READY_KEYS = STARDUST_TABS.filter(t => t.ready).map(t => t.key)

// ── 记忆详情：底部浮层 ────────────────────────────────────────
const MemorySheet = ({ mem, onClose }) => {
  const color = domainColor(mem.domain)

  // onClose 是父组件每次渲染现给的新函数，直接放进依赖数组等于"每渲染
  // 一次就解绑再重绑一次"。用 ref 存最新的回调，监听只在挂载/卸载各做
  // 一次——行为完全一样，少掉一堆无谓的绑定/解绑
  const closeRef = useRef(onClose)
  useEffect(() => { closeRef.current = onClose }, [onClose])
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') closeRef.current?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="dust-sheet-veil" onClick={onClose}>
      <div className="dust-sheet" onClick={e => e.stopPropagation()}>
        <div className="dust-sheet-grip" />
        <div className="dust-sheet-head">
          <span className="dust-sheet-domain" style={{ color }}>
            <span className="dust-chip-dot" style={{ '--chip': color }} />
            {mem.domain || '未归域'}
          </span>
          <span className="dust-sheet-when">{daysLabel(daysOf(mem))}</span>
        </div>

        <div className="dust-sheet-text">
          {(mem.summary || '').trim() || '（这段记忆没有留下文字）'}
        </div>

        <div className="dust-sheet-facts">
          <span>效价 · {Number.isFinite(mem.valence) ? mem.valence.toFixed(2) : '未知'}</span>
          <span>唤醒度 · {Number.isFinite(mem.arousal) ? mem.arousal.toFixed(2) : '未知'}</span>
          <span>重要度 · {importanceText(mem)}</span>
          <span>鲜明度 · {Math.round((1 - (mem.fadeLevel ?? 0.5)) * 100)}</span>
          {mem.resolved === true && <span>已解决</span>}
          {mem.pinned === true && <span>已置顶</span>}
        </div>

        <button onClick={onClose} className="line-btn dust-sheet-close">收起</button>
      </div>
    </div>
  )
}

const StardustPage = ({
  memories = [], memoriesLoading, onFetch, onDream,
  activeSubTab, onSubTabChange, searchQuery, onSearchChange,
  selectedMemory, onSelectMemory, onCloseMemory, theme,
}) => {
  // 兼容旧的两值状态：不认识的 key 一律回落到深空
  const tab = READY_KEYS.includes(activeSubTab) ? activeSubTab : 'reverie'
  const showTopSearch = tab !== 'breath'

  return (
    <div className="tab-page dust-page">
      {/* ── 顶部标签栏 ── */}
      <div className="dust-tabbar">
        {STARDUST_TABS.map(({ key, label, ready, cn }) => (
          <button
            key={key}
            className={`dust-tab${tab === key ? ' is-active' : ''}${ready ? '' : ' is-locked'}`}
            onClick={() => ready && onSubTabChange(key)}
            disabled={!ready}
            title={ready ? cn : '尚未点亮'}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ── 搜索：纯前端过滤已拉取的 catalog，命中项在各视图里同时浮出 ── */}
      {showTopSearch && (
        <div className="dust-search">
          <input
            className="field-input dust-search-input"
            placeholder="搜索记忆…"
            value={searchQuery}
            onChange={e => onSearchChange(e.target.value)}
          />
          {searchQuery && (
            <button className="dust-search-clear" onClick={() => onSearchChange('')}>×</button>
          )}
        </div>
      )}

      {/* ── 主体 ── */}
      <div className="dust-body">
        {memoriesLoading && (
          <div className="dust-loading"><div className="breath-dot" /></div>
        )}

        {!memoriesLoading && tab === 'reverie' && (
          <MemoryDeepSpace
            memories={memories}
            searchQuery={searchQuery}
            selectedBucketId={selectedMemory?.bucketId || null}
            onSelect={onSelectMemory}
            theme={theme}
          />
        )}

        {!memoriesLoading && tab === 'constellations' && (
          memories.length === 0
            ? <div className="dust-empty"><div className="dust-empty-title">星图上还没有星</div>
                <div className="dust-empty-sub">对话中会自然沉积</div></div>
            : <ConstellationMap
                memories={memories}
                searchQuery={searchQuery}
                selectedBucketId={selectedMemory?.bucketId || null}
                onSelect={onSelectMemory}
              />
        )}

        {!memoriesLoading && tab === 'traces' && (
          <TracesView memories={memories} searchQuery={searchQuery} onSelect={onSelectMemory} />
        )}

        {!memoriesLoading && tab === 'breath' && (
          <BreathView memories={memories} searchQuery={searchQuery}
            onSearchChange={onSearchChange} onSelect={onSelectMemory} />
        )}

        {!memoriesLoading && tab === 'noon' && (
          <NoonView memories={memories} searchQuery={searchQuery} onSelect={onSelectMemory} />
        )}
      </div>

      {/* ── 底部动作条 ── */}
      <div className="dust-actions hairline-top">
        <button onClick={onFetch} className="line-btn dust-action">↻ 刷新</button>
        {/* 「让记忆沉淀」会调用记忆服务端的 dream——那一步在 Ombre 那边
            是要跑模型的，跟合墨生成、写日记一样属于"点一下就花钱"的
            动作，所以照柯定的规矩，按钮上得说明白，不能让人以为它跟
            旁边的「刷新」一样只是拉一次数据 */}
        <button onClick={onDream} className="line-btn dust-action is-wide" title="会调用记忆服务整理记忆，消耗 token">
          ✦ 让记忆沉淀
          <span className="dust-action-cost">消耗 token</span>
        </button>
      </div>

      {selectedMemory && (
        <MemorySheet mem={selectedMemory} onClose={onCloseMemory} />
      )}
    </div>
  )
}

export default StardustPage
export { STARDUST_TABS }
