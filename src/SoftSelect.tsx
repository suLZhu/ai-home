import { useEffect, useRef, useState } from 'react'

export type SoftOption = { value: string; label: string; disabled?: boolean }

// 统一的下拉：不用原生 <select>，Android WebView 就不会再弹那块又白又方的系统选择框。
// 点击后在页面内展开一张小卡片，选中项打勾，点外面 / 选中即收起。
export function SoftSelect({ value, options, onChange, ariaLabel, className = '', placeholder = '请选择' }: {
  value: string
  options: SoftOption[]
  onChange: (value: string) => void
  ariaLabel?: string
  className?: string
  placeholder?: string
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])
  const current = options.find(o => o.value === value)
  return <div ref={ref} className={'soft-select' + (className ? ' ' + className : '')}>
    <button type="button" className="soft-select-trigger" aria-label={ariaLabel} aria-expanded={open}
      onClick={() => setOpen(v => !v)}>
      <span>{current?.label || placeholder}</span><i aria-hidden="true">⌄</i>
    </button>
    {open && <div className="soft-select-menu" role="listbox" aria-label={ariaLabel}>
      {options.length === 0 && <p className="soft-select-empty">暂无选项</p>}
      {options.map(o => <button type="button" role="option" aria-selected={o.value === value} key={o.value}
        disabled={o.disabled} className={'soft-select-option' + (o.value === value ? ' active' : '')}
        onClick={() => { onChange(o.value); setOpen(false) }}>
        <span>{o.label}</span>{o.value === value && <b aria-hidden="true">✓</b>}
      </button>)}
    </div>}
  </div>
}
