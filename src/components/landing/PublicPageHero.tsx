type PublicPageHeroProps = {
  title: string
  subtitle: string
  lastUpdated?: string
}

export function PublicPageHero({ title, subtitle, lastUpdated }: PublicPageHeroProps) {
  return (
    <section className="mx-auto w-full max-w-5xl">
      <div className="rounded-2xl border border-gray-800 bg-gray-900/70 px-8 py-10 shadow-2xl">
        <p className="mb-2 text-sm font-semibold uppercase tracking-[0.24em] text-blue-300">MinistryVote</p>
        <h1 className="mb-3 text-4xl font-bold text-white md:text-5xl">{title}</h1>
        <p className="max-w-3xl text-lg leading-relaxed text-gray-300">{subtitle}</p>
        {lastUpdated ? (
          <p className="mt-5 text-sm text-gray-400">Last updated: {lastUpdated}</p>
        ) : null}
      </div>
    </section>
  )
}
