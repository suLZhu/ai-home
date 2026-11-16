import type { ReactNode } from 'react'
import { formatTokens, type ModelSpec } from './modelSpecs.mjs'

// 模型行上的胶囊：聊天 / 模态（T🖼📄 > T）/ 工具 / 推理 / 结构化 / 上下文。
// 和 Kelivo 的 ModelTagWrap 对齐，供应商模型列表、拉取面板、聊天选择器共用一套。
const MODALITY_ICON: Record<string, string> = { text: 'T', image: '▣', audio: '♪', video: '▷', pdf: '▤' }

type Chip = { key: string; node: ReactNode; title?: string; tone?: string }

export function ModelChips({ spec, modelId, dense = false }: { spec: ModelSpec | null; modelId?: string; dense?: boolean }) {
  const chips: Chip[] = []
  if (!spec) {
    return <span className={'model-chips' + (dense ? ' dense' : '')}>{modelId ? <span className="model-chip">{modelId}</span> : null}</span>
  }
  chips.push({ key: 'type', node: spec.type === 'chat' ? '聊天' : spec.type === 'embedding' ? '嵌入' : '图像' })
  const inputs = (spec.input || []).map(m => MODALITY_ICON[m] || m).join('')
  const outputs = (spec.output || []).map(m => MODALITY_ICON[m] || m).join('')
  if (inputs || outputs) chips.push({ key: 'mod', node: <>{inputs}<i className="model-chip-arrow">&gt;</i>{outputs}</> })
  if ((spec.abilities || []).includes('tool')) chips.push({ key: 'tool', node: '⚒', title: '工具调用' })
  if ((spec.abilities || []).includes('reasoning')) chips.push({ key: 'think', node: '◑', title: '推理' })
  if ((spec.abilities || []).includes('structured')) chips.push({ key: 'struct', node: '⬡', title: '结构化输出' })
  const ctx = formatTokens(spec.contextWindow)
  if (ctx) chips.push({ key: 'ctx', node: ctx })
  return <span className={'model-chips' + (dense ? ' dense' : '')}>
    {chips.map(c => <span className="model-chip" key={c.key} title={c.title}>{c.node}</span>)}
  </span>
}
