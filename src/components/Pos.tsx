import type { Page } from '../App'
import type { UserProfile } from '../services/authService'
import { ConnectionIndicator, InstallAppButton } from './PwaManager'

export function Navigation({ active, onNavigate, profile, onLogout, isAdmin }: { active: Page; onNavigate: (page: Page) => void; profile: UserProfile | null; onLogout: () => Promise<void>; isAdmin: boolean }) {
  const pages: [Page, string][] = isAdmin ? [['Dashboard', '▦'], ['POS', '⊞'], ['Inventory', '▥'], ['Products', '◫'], ['Purchases', '⇩'], ['Suppliers', '♙'], ['Daily Chicken Prices', '◉'], ['Expenses', '◒'], ['Reports', '▤'], ['Users', '♙'], ['Settings', '⚙']] : [['Dashboard', '▦'], ['POS', '⊞'], ['Customers', '♙'], ['Reports', '▤']]
  return (
    <aside className="sidebar">
      <div className="brand">
        <img src="/logo2.jpeg" alt="Logo" style={{ height: '32px', borderRadius: '4px' }} />
        <span>Chicken Kade <small>POS</small></span>
      </div>
      <div style={{ padding: '0 12px 14px' }}>
        <ConnectionIndicator />
      </div>
      <nav>
        {pages.map(([page, icon]) => (
          <button className={active === page ? 'nav active' : 'nav'} onClick={() => onNavigate(page)} key={page}>
            <i>{icon}</i>
            <span>{page}</span>
          </button>
        ))}
      </nav>
      <div style={{ padding: '12px 12px 0' }}>
        <InstallAppButton />
      </div>
      <footer>
        <em /> Signed in as<br />
        <b>{profile?.full_name}</b>
        <small>{profile?.role?.toUpperCase()}</small>
        <button className="logout" onClick={() => void onLogout()}>Sign Out</button>
      </footer>
    </aside>
  )
}

export function PlaceholderPage({ title, description }: { title: string; description: string }) { return <section className="placeholder"><h1>{title}</h1><p>{description}</p></section> }
