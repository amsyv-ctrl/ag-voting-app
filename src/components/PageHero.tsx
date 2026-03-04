import { ReactNode } from 'react'

type PageHeroProps = {
  title: string
  subtitle?: string
  rightActions?: ReactNode
}

export function PageHero({ title, subtitle, rightActions }: PageHeroProps) {
  return (
    <section className="ui-card page-hero">
      <div className="page-hero-head">
        <div>
          <h1>{title}</h1>
          {subtitle ? <p className="subtitle">{subtitle}</p> : null}
        </div>
        {rightActions ? <div className="page-hero-actions">{rightActions}</div> : null}
      </div>
    </section>
  )
}
