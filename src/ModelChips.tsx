import type { ReactNode } from 'react'
import { formatTokens, type ModelSpec } from './modelSpecs.mjs'
import { IconChevronRight, IconFile, IconGrid, IconMusic, IconPhoto, IconPlug, IconSparkles, IconVideo } from './icons'

// 模型行上的胶囊：聊天 / 输入输出模态 / 工具 / 推理 / 结构化 / 上下文。
// 小图标统一走 24×24 线性 SVG，避免 Android 字体符号粗细漂移。
function modalityIcon(mode: string, key: string): ReactNode {
  if (mode === 'text') return <span key={key} className="model-chip-textmod">T</span>
  if (mode === 'image') return <IconPhoto key={key} size={12}/>
  if (mode === 'audio') return <IconMusic key={key} size={12}/>
  if (mode === 'video') return <IconVideo key={key} size={12}/>
  if (mode === 'pdf') return <IconFile key={key} size={12}/>
  return <span key={key}>{mode}</span>
}

type Chip = { key: string; node: ReactNode; title?: string; tone?: string }

export function ModelChips({ spec, modelId, dense = false }: { spec: ModelSpec | null; modelId?: string; dense?: boolean }) {
  const chips: Chip[] = []
  if (!spec) {
    return <span className={'model-chips' + (dense ? ' dense' : '')}>{modelId ? <span className="model-chip">{modelId}</span> : null}</span>
  }
  chips.push({ key: 'type', node: spec.type === 'chat' ? '聊天' : spec.type === 'embedding' ? '嵌入' : '图像' })
  const inputs = (spec.input || []).map((m, i) => modalityIcon(m, 'in-' + i))
  const outputs = (spec.output || []).map((m, i) => modalityIcon(m, 'out-' + i))
  if (inputs.length || outputs.length) chips.push({ key: 'mod', node: <span className="model-chip-modalities">{inputs}<IconChevronRight size={10}/>{outputs}</span> })
  if ((spec.abilities || []).includes('tool')) chips.push({ key: 'tool', node: <IconPlug size={12}/>, title: '工具调用' })
  if ((spec.abilities || []).includes('reasoning')) chips.push({ key: 'think', node: <IconSparkles size={12}/>, title: '推理' })
  if ((spec.abilities || []).includes('structured')) chips.push({ key: 'struct', node: <IconGrid size={12}/>, title: '结构化输出' })
  const ctx = formatTokens(spec.contextWindow)
  if (ctx) chips.push({ key: 'ctx', node: ctx })
  return <span className={'model-chips' + (dense ? ' dense' : '')}>
    {chips.map(c => <span className="model-chip" key={c.key} title={c.title}>{c.node}</span>)}
  </span>
}
