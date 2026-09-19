import { useState, useEffect } from 'react'
import { DailyChickenPrices } from './components/ChickenPrices'
import { Navigation, PlaceholderPage } from './components/Pos'
import { PosPayment } from './components/PosPayment'
import { Products } from './components/Products'
import { Reports } from './components/Reports'
import { Expenses } from './components/Expenses'
import { Dashboard } from './components/Dashboard'
import { Suppliers } from './components/Suppliers'
import { Purchases } from './components/Purchases'
import { AccessDenied } from './components/AccessDenied'
import { Login } from './components/Login'
import { Users } from './components/Users'
import { Inventory } from './components/Inventory'
import { Settings } from './components/Settings'
import { SubscriptionLock } from './components/SubscriptionLock'
import { SubscriptionBanner } from './components/SubscriptionBanner'
import { PwaUpdatePrompt, PwaInstallPrompt } from './components/PwaManager'
import { useAuth } from './context/AuthContext'
import { useSubscription } from './context/SubscriptionContext'
import { chickenStore, type ChickenItem, type PriceHistoryEntry } from './data/chicken'
import { groceryStore, ensureGroceryCodes, type GroceryProduct } from './data/grocery'
import { storageAdapter } from './services/storageAdapter'
import { getProducts, saveProducts } from './services/supabase/productService'
import { getChickenCuts, saveChickenCuts, saveChickenPriceHistory } from './services/supabase/chickenService'
import { fetchSalesFromSupabase } from './services/supabase/salesService'
import './index.css'

export type Page = 'Dashboard' | 'POS' | 'Inventory' | 'Products' | 'Customers' | 'Daily Chicken Prices' | 'Expenses' | 'Reports' | 'Suppliers' | 'Purchases' | 'Settings' | 'Users'

const adminPages: Page[] = ['Inventory', 'Products', 'Daily Chicken Prices', 'Expenses', 'Suppliers', 'Purchases', 'Settings', 'Users']

const text: Record<Exclude<Page, 'POS' | 'Daily Chicken Prices' | 'Inventory' | 'Settings'>, string> = {
  Dashboard: 'A quick view of today’s sales and shop activity will appear here.',
  Products: 'Manage chicken cuts, grocery products, units, pricing and barcodes.',
  Customers: 'Search customers and manage permitted customer information.',
  Expenses: 'Track shop expenses and petty cash activity in one place.',
  Reports: 'Review sales, stock and cashier reports when reporting is connected.',
  Suppliers: 'Manage supplier accounts and outstanding balances.',
  Purchases: 'Record inventory purchases and stock-in.',
  Users: 'Manage user profiles and cashier access.',
}

export default function App() {
  const { loading: authLoading, isAuthenticated, isAdmin, profile, signOut } = useAuth()
  const { loading: subLoading, isActive, checkSubscription } = useSubscription()
  const [page, setPage] = useState<Page>('POS')
  const [items, setItems] = useState<ChickenItem[]>(() => chickenStore.loadItems())
  const [history, setHistory] = useState<PriceHistoryEntry[]>(() => chickenStore.loadHistory())
  const [grocery, setGrocery] = useState<GroceryProduct[]>(() => groceryStore.load())

  // Synchronize products, chicken cuts, and sales with Supabase on start
  useEffect(() => {
    if (!isAuthenticated || !storageAdapter.isSupabase()) return

    const initData = async () => {
      try {
        const [cloudProducts, cloudCuts, cloudSales] = await Promise.all([
          getProducts().catch(() => [] as GroceryProduct[]),
          getChickenCuts().catch(() => [] as ChickenItem[]),
          fetchSalesFromSupabase().catch(() => [] as any[]),
        ])

        if (cloudSales && cloudSales.length > 0) {
          const rawLocal = localStorage.getItem('sales-transactions')
          let localSales: any[] = []
          try { localSales = rawLocal ? JSON.parse(rawLocal) : [] } catch { localSales = [] }
          const salesMap = new Map<string, any>()
          cloudSales.forEach(s => salesMap.set(s.id, s))
          localSales.forEach(s => {
            if (s && s.id && !salesMap.has(s.id)) salesMap.set(s.id, s)
          })
          const merged = Array.from(salesMap.values()).sort((a, b) => {
            const dateA = new Date(`${a.date} ${a.time || '00:00:00'}`).getTime()
            const dateB = new Date(`${b.date} ${b.time || '00:00:00'}`).getTime()
            return dateB - dateA
          })
          localStorage.setItem('sales-transactions', JSON.stringify(merged))
        }

        if (cloudProducts && cloudProducts.length > 0) {
          const withCodes = ensureGroceryCodes(cloudProducts)
          setGrocery(withCodes)
          groceryStore.save(withCodes)
        } else {
          // Supabase products table is empty: seed with local products
          const localProducts = groceryStore.load()
          if (localProducts.length > 0) {
            await saveProducts(localProducts).catch(console.error)
          }
        }

        if (cloudCuts && cloudCuts.length > 0) {
          setItems(cloudCuts)
          chickenStore.saveItems(cloudCuts)
        } else {
          // Supabase chicken_cuts table is empty: seed with local cuts
          const localCuts = chickenStore.loadItems()
          if (localCuts.length > 0) {
            await saveChickenCuts(localCuts).catch(console.error)
          }
        }
      } catch (err) {
        console.error('Failed to sync initial items with Supabase:', err)
      }
    }

    initData()
  }, [isAuthenticated])

  // Re-verify subscription when navigating between protected pages (silent check)
  const handleNavigate = (targetPage: Page) => {
    checkSubscription(true)
    setPage(targetPage)
  }

  if (authLoading) {
    return (
      <main className="auth-page">
        <div className="auth-loading">Checking your session...</div>
      </main>
    )
  }

  if (!isAuthenticated) return <Login />

  if (subLoading) {
    return (
      <main className="auth-page">
        <div className="auth-loading">Checking subscription...</div>
      </main>
    )
  }

  // Full-screen lock if subscription is expired, suspended, or unverified
  if (!isActive) {
    return <SubscriptionLock />
  }

  const commitItems = (next: ChickenItem[]) => {
    setItems(next)
    chickenStore.saveItems(next)
    if (storageAdapter.isSupabase()) {
      saveChickenCuts(next).catch(console.error)
    }
  }

  const updatePrice = (id: string, code: string, name: string, price: number) => {
    const current = items.find(item => item.id === id)
    if (!current) return
    const nextItems = items.map(item =>
      item.id === id
        ? { ...item, code, name, cut: name, pricePerKg: price, updatedAt: new Date().toISOString() }
        : item
    )
    commitItems(nextItems)
    if (current.pricePerKg !== price) {
      const entry: PriceHistoryEntry = {
        id: `${Date.now()}-${Math.random()}`,
        productName: name || current.name,
        oldPrice: current.pricePerKg,
        newPrice: price,
        changedAt: new Date().toISOString(),
      }
      const next = [entry, ...history]
      setHistory(next)
      chickenStore.saveHistory(next)
      if (storageAdapter.isSupabase()) {
        saveChickenPriceHistory([
          {
            id: entry.id,
            chicken_cut_id: id,
            old_price: entry.oldPrice,
            new_price: entry.newPrice,
            changed_at: entry.changedAt,
          },
        ]).catch(console.error)
      }
    }
  }

  const addItem = (code: string, name: string, price: number) =>
    commitItems([
      ...items,
      {
        id: `custom-${Date.now()}`,
        code,
        name,
        cut: name,
        pricePerKg: price,
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ])

  const toggle = (id: string) =>
    commitItems(items.map(item => item.id === id ? { ...item, active: !item.active } : item))

  const saveGrocery = (next: GroceryProduct[]) => {
    setGrocery(next)
    groceryStore.save(next)
    if (storageAdapter.isSupabase()) {
      saveProducts(next).catch(console.error)
    }
  }

  const productProps = {
    items: grocery,
    onToggle: (id: string) =>
      saveGrocery(
        grocery.map(item => item.id === id ? { ...item, active: !item.active, updatedAt: new Date().toISOString() } : item)
      ),
    onSave: (product: Omit<GroceryProduct, 'id' | 'createdAt' | 'updatedAt'>, id?: string) =>
      saveGrocery(
        id
          ? grocery.map(item => item.id === id ? { ...product, stockQuantity: item.stockQuantity, id, createdAt: item.createdAt, updatedAt: new Date().toISOString() } : item)
          : [...grocery, { ...product, id: `grocery-${Date.now()}`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }]
      ),
  }


  const denied = adminPages.includes(page) && !isAdmin

  return (
    <div className="app-container" style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <PwaUpdatePrompt />
      <PwaInstallPrompt />
      <SubscriptionBanner />
      <main className="app" style={{ flex: 1 }}>
        <Navigation active={page} onNavigate={handleNavigate} profile={profile} onLogout={signOut} isAdmin={isAdmin} />
        {denied ? (
          <AccessDenied />
        ) : page === 'POS' ? (
          <PosPayment chickenItems={items} groceryItems={grocery} onStockChange={saveGrocery} />
        ) : page === 'Inventory' ? (
          <Inventory items={grocery} onChange={saveGrocery} userName={profile?.full_name || 'Administrator'} />
        ) : page === 'Dashboard' ? (
          <Dashboard isAdmin={isAdmin} onInventory={() => handleNavigate('Inventory')} />
        ) : page === 'Expenses' ? (
          <Expenses refresh={() => handleNavigate('Expenses')} />
        ) : page === 'Reports' ? (
          <Reports isAdmin={isAdmin} />
        ) : page === 'Suppliers' ? (
          <Suppliers />
        ) : page === 'Purchases' ? (
          <Purchases chickenItems={items} grocery={grocery} onStockChange={saveGrocery} />
        ) : page === 'Products' ? (
          <Products {...productProps} />
        ) : page === 'Daily Chicken Prices' ? (
          <DailyChickenPrices items={items} history={history} onUpdatePrice={updatePrice} onAdd={addItem} onToggle={toggle} />
        ) : page === 'Users' ? (
          <Users />
        ) : page === 'Settings' ? (
          <Settings />
        ) : (
          <PlaceholderPage title={page} description={text[page as Exclude<Page, 'POS' | 'Daily Chicken Prices' | 'Inventory' | 'Settings'>]} />
        )}
      </main>
    </div>
  )
}
