import { primaryNavItems, secondaryNavItems, type NavItem, type NavItemId } from './nav-items'

interface SidebarProps {
  activeView: NavItemId
  onNavigate: (id: NavItemId) => void
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

export function Sidebar({ activeView, onNavigate }: SidebarProps) {
  return (
    <nav
      aria-label="Main"
      className="flex w-[var(--frame-sidebar-width)] shrink-0 flex-col border-r border-border bg-surface p-3"
    >
      <div className="px-3 pb-6 pt-2 text-lg font-semibold tracking-tight">
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
      <ul className="mt-auto flex flex-col gap-1">
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
