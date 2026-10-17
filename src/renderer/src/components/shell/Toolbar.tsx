import { Search } from 'lucide-react'

export function Toolbar() {
  return (
    <header className="flex h-[var(--frame-toolbar-height)] shrink-0 items-center gap-3 border-b border-border px-5">
      <label className="flex w-full max-w-md items-center gap-2 rounded-md border border-border bg-surface px-3 py-1.5 text-sm text-muted focus-within:border-accent">
        <Search size={16} strokeWidth={1.75} aria-hidden />
        <span className="sr-only">Search library</span>
        <input
          type="search"
          placeholder="Search your library"
          className="w-full bg-transparent text-text placeholder:text-subtle focus:outline-none"
        />
      </label>
    </header>
  )
}
