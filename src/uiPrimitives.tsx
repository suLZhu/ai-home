import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { IconChevronRight, type IconComponent } from './icons'

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> & {
  icon: IconComponent
  label: string
  iconSize?: number
  children?: ReactNode
}

export function IconButton({
  icon: Icon,
  label,
  iconSize = 15,
  title,
  type = 'button',
  children,
  ...buttonProps
}: IconButtonProps) {
  return (
    <button type={type} aria-label={label} title={title || label} {...buttonProps}>
      <Icon size={iconSize} />
      {children}
    </button>
  )
}

type SettingsRowProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
  icon?: IconComponent
  title: string
  detail?: ReactNode
  meta?: ReactNode
  trailing?: ReactNode
  iconSize?: number
}

export function SettingsRow({
  icon: Icon,
  title,
  detail,
  meta,
  trailing,
  iconSize = 19,
  type = 'button',
  className = '',
  ...buttonProps
}: SettingsRowProps) {
  return (
    <button type={type} className={['settings-row', className].filter(Boolean).join(' ')} {...buttonProps}>
      {Icon ? <span className="settings-row-icon"><Icon size={iconSize} /></span> : null}
      <span className="settings-row-text">
        <b>{title}</b>
        {detail ? <small>{detail}</small> : null}
      </span>
      {meta ? <span className="settings-row-meta">{meta}</span> : null}
      {trailing ?? <span className="settings-row-chev" aria-hidden="true"><IconChevronRight size={14} /></span>}
    </button>
  )
}
