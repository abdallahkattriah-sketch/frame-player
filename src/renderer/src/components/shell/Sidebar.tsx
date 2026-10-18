import { useState } from 'react'
import { ListMusic, Plus, Shapes } from 'lucide-react'
import { NameDialog } from '@renderer/features/collections/NameDialog'
import { useCollections } from '@renderer/features/collections/use-collections'
import {
  collectionViewId,
  primaryNavItems,
  secondaryNavItems,
  type NavItem,
  type ViewId,
} from './nav-items'

interface SidebarProps {
  activeView: ViewId
  onNavigate: (id: ViewId) => void
}

function NavButton({
  item,
  active,
  onSelect,
}: {
  item: NavItem
  active: boolean
  onSelect: () => void
}) {
  const Icon = item.icon
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={active ? 'page' : undefined}
      className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors ${
        active ? 'bg-elevated text-text' : 'text-muted hover:bg-elevated/60 hover:text-text'
      }`}
    >
      <Icon size={18} strokeWidth={1.75} className={active ? 'text-accent' : undefined} />
      <span>{item.label}</span>
    </button>
  )
}

function CollectionsNav({ activeView, onNavigate }: SidebarProps) {
  const { collections } = useCollections()
  const [creating, setCreating] = useState(false)
  return (
    <div className="mt-6 flex min-h-0 flex-col">
      <div className="flex items-center px-3 pb-1">
        <h2 className="flex-1 text-xs font-medium uppercase tracking-wide text-subtle">
          Collections
        </h2>
        <button
          type="button"
          aria-label="New collection"
          title="New collection or playlist"
          onClick={() => setCreating(true)}
          className="rounded p-0.5 text-subtle hover:bg-elevated hover:text-text"
        >
          <Plus size={14} />
        </button>
      </div>
      <ul className="flex min-h-0 flex-col gap-0.5 overflow-y-auto" aria-label="Collections">
        {collections.map((c) => {
          const id = collectionViewId(c.id)
          const active = activeView === id
          const Icon = c.kind === 'playlist' ? ListMusic : Shapes
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => onNavigate(id)}
                aria-current={active ? 'page' : undefined}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-1.5 text-sm ${
                  active
                    ? 'bg-elevated text-text'
                    : 'text-muted hover:bg-elevated/60 hover:text-text'
                }`}
              >
                <Icon size={16} strokeWidth={1.75} className={active ? 'text-accent' : undefined} />
                <span className="min-w-0 flex-1 truncate text-left">{c.name}</span>
                <span className="text-xs text-subtle">{c.itemCount}</span>
              </button>
            </li>
          )
        })}
        {collections.length === 0 && (
          <li className="px-3 py-1 text-xs text-subtle">
            Group videos into collections or playlists.
          </li>
        )}
      </ul>
      {creating && (
        <NameDialog
          title="New collection"
          chooseKind
          confirmLabel="Create"
          onSubmit={async (name, kind) => {
            const created = await window.frame.collections.create(name, kind)
            onNavigate(collectionViewId(created.id))
          }}
          onClose={() => setCreating(false)}
        />
      )}
    </div>
  )
}

export function Sidebar({ activeView, onNavigate }: SidebarProps) {
  return (
    <nav
      aria-label="Main"
      className="flex w-[var(--frame-sidebar-width)] shrink-0 flex-col border-r border-border bg-sidebar p-3"
    >
      <div className="app-drag -mx-3 -mt-3 px-6 pb-6 pt-5 text-lg font-semibold tracking-tight">
        Frame<span className="text-accent">.</span>
      </div>
      <ul className="flex flex-col gap-1">
        {primaryNavItems.map((item) => (
          <li key={item.id}>
            <NavButton
              item={item}
              active={activeView === item.id}
              onSelect={() => onNavigate(item.id)}
            />
          </li>
        ))}
      </ul>
      <CollectionsNav activeView={activeView} onNavigate={onNavigate} />
      <ul className="mt-auto flex flex-col gap-1 pt-3">
        {secondaryNavItems.map((item) => (
          <li key={item.id}>
            <NavButton
              item={item}
              active={activeView === item.id}
              onSelect={() => onNavigate(item.id)}
            />
          </li>
        ))}
      </ul>
    </nav>
  )
}
