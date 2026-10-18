import { Search, X } from 'lucide-react'

interface ToolbarProps {
  search: string
  onSearchChange: (value: string) => void
}

export function Toolbar({ search, onSearchChange }: ToolbarProps) {
  return (
    <header
      className="app-drag flex h-[var(--frame-toolbar-height)] shrink-0 items-center gap-3 border-b border-border pl-5"
      // Keep clear of the Windows caption buttons drawn over the top-right corner.
      style={{ paddingRight: 'calc(100vw - env(titlebar-area-width, 100vw) + 1.25rem)' }}
    >
      <label className="flex h-8 w-full max-w-md items-center gap-2 rounded-md border border-border bg-surface px-3 text-sm text-muted transition-colors focus-within:border-accent hover:border-subtle focus-within:hover:border-accent">
        <Search size={16} strokeWidth={1.75} aria-hidden />
        <span className="sr-only">Search library</span>
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.currentTarget.value)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') onSearchChange('')
          }}
          placeholder="Search titles, episodes, and file names"
          className="w-full bg-transparent text-text placeholder:text-subtle outline-none focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          dir="auto"
        />
        {search && (
          <button
            type="button"
            aria-label="Clear search"
            onClick={() => onSearchChange('')}
            className="rounded p-0.5 hover:text-text"
          >
            <X size={14} />
          </button>
        )}
      </label>
    </header>
  )
}
