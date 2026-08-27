import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { Button, Pill, StateDot, type StateDotState } from '@deepseek-ai/dsh-client-ui-primitives'

export type StatusTone = 'neutral' | 'pending' | 'active' | 'success' | 'error'

const TONE_STATE: Record<StatusTone, StateDotState | undefined> = {
  neutral: undefined,
  pending: 'warning',
  active: 'ongoing',
  success: 'done',
  error: 'error',
}

export function statusPillClass(tone: StatusTone, extra?: string): string {
  return ['creatorPill', tone, extra].filter((part) => part !== undefined && part !== '').join(' ')
}

export function StatusPill({
  tone = 'neutral',
  title,
  children,
  onClick,
  ...rest
}: {
  tone?: StatusTone
  title?: string
  children: ReactNode
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>): JSX.Element {
  const state = TONE_STATE[tone]
  return (
    <Pill
      className={statusPillClass(tone)}
      {...(title === undefined ? {} : { title })}
      {...(onClick === undefined ? {} : { onClick })}
      {...rest}
    >
      {state !== undefined ? <StateDot state={state} size={10} /> : null}
      {children}
    </Pill>
  )
}

export type ActionTone = 'primary' | 'secondary' | 'ghost'

const VARIANT: Record<ActionTone, 'primary' | 'outline' | 'ghost'> = {
  primary: 'primary',
  secondary: 'outline',
  ghost: 'ghost',
}

export function ActionButton({
  tone = 'secondary',
  children,
  ...rest
}: {
  tone?: ActionTone
  children: ReactNode
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type'>): JSX.Element {
  return (
    <Button type="button" size="sm" variant={VARIANT[tone]} {...rest}>
      {children}
    </Button>
  )
}

export function ActionBar({ children }: { children: ReactNode }): JSX.Element {
  return <div className="creatorActionBar">{children}</div>
}

export function Surface({
  title,
  hint,
  children,
}: {
  title?: string
  hint?: string
  children?: ReactNode
}): JSX.Element {
  return (
    <section className="creatorSurface">
      {title !== undefined && <div className="creatorSurfaceTitle">{title}</div>}
      {hint !== undefined && <p className="creatorSurfaceHint">{hint}</p>}
      {children}
    </section>
  )
}
