// Supabase-compatible Neon API client

type QueryOptions = {
  table: string
  action: 'select' | 'insert' | 'upsert' | 'update' | 'delete'
  columns?: string
  eq?: Record<string, any>
  order?: { column: string; ascending?: boolean }
  limit?: number
  rows?: any[]
  row?: any
  changes?: Record<string, any>
  includeRelations?: string[]
}

class QueryBuilder<T = any> implements PromiseLike<{ data: T[] | T | null; error: any }> {
  private options: QueryOptions
  private isSingle = false

  constructor(table: string, action: QueryOptions['action']) {
    this.options = { table, action, eq: {} }
  }

  select(columns = '*') {
    this.options.columns = columns
    if (columns.includes('sale_items')) {
      this.options.includeRelations = (this.options.includeRelations || []).concat('sale_items')
    }
    if (columns.includes('product_pack_prices')) {
      this.options.includeRelations = (this.options.includeRelations || []).concat('product_pack_prices')
    }
    return this
  }

  eq(column: string, value: any) {
    this.options.eq = { ...this.options.eq, [column]: value }
    return this
  }

  order(column: string, { ascending = true }: { ascending?: boolean } = {}) {
    this.options.order = { column, ascending }
    return this
  }

  limit(count: number) {
    this.options.limit = count
    return this
  }

  single() {
    this.isSingle = true
    return this
  }

  async execute(): Promise<{ data: any; error: any }> {
    try {
      const res = await fetch('/api/db', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('neon-auth-token') || ''}`,
        },
        body: JSON.stringify(this.options),
      })

      if (!res.ok) {
        const text = await res.text()
        return { data: null, error: new Error(text || 'Network request failed') }
      }

      const json = await res.json()
      if (json.error) return { data: null, error: json.error }

      let data = json.data
      if (this.isSingle && Array.isArray(data)) {
        data = data[0] || null
      }
      return { data, error: null }
    } catch (err: any) {
      return { data: null, error: err }
    }
  }

  then<TResult1 = { data: any; error: any }, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }
}

export const neonClient = {
  from(table: string) {
    return {
      select(columns = '*') {
        const qb = new QueryBuilder(table, 'select')
        return qb.select(columns)
      },
      insert(rows: any | any[]) {
        const qb = new QueryBuilder(table, 'insert')
        const array = Array.isArray(rows) ? rows : [rows]
        ;(qb as any).options.rows = array
        return qb
      },
      upsert(rows: any | any[]) {
        const qb = new QueryBuilder(table, 'upsert')
        const array = Array.isArray(rows) ? rows : [rows]
        ;(qb as any).options.rows = array
        return qb
      },
      update(changes: Record<string, any>) {
        const qb = new QueryBuilder(table, 'update')
        ;(qb as any).options.changes = changes
        return qb
      },
      delete() {
        return new QueryBuilder(table, 'delete')
      },
    }
  },

  async rpc(fn: string, args?: Record<string, any>) {
    try {
      const res = await fetch('/api/db', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('neon-auth-token') || ''}`,
        },
        body: JSON.stringify({ action: 'rpc', fn, args }),
      })
      const json = await res.json()
      return json
    } catch (err: any) {
      return { data: null, error: err }
    }
  },

  auth: {
    async signInWithPassword({ email, password }: { email: string; password: string }) {
      const res = await fetch('/api/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'login', email, password }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        return { data: { user: null, session: null }, error: new Error(json.error || 'Login failed') }
      }
      localStorage.setItem('neon-auth-token', json.session.access_token)
      localStorage.setItem('neon-auth-user', JSON.stringify(json.user))
      window.dispatchEvent(new CustomEvent('auth-changed', { detail: json.session }))
      return { data: json, error: null }
    },

    async signOut() {
      localStorage.removeItem('neon-auth-token')
      localStorage.removeItem('neon-auth-user')
      window.dispatchEvent(new CustomEvent('auth-changed', { detail: null }))
      return { error: null }
    },

    async getUser() {
      const stored = localStorage.getItem('neon-auth-user')
      if (stored) {
        try {
          return { data: { user: JSON.parse(stored) }, error: null }
        } catch {}
      }
      const token = localStorage.getItem('neon-auth-token')
      if (!token) return { data: { user: null }, error: null }

      try {
        const res = await fetch('/api/auth', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ action: 'me' }),
        })
        const json = await res.json()
        if (json.user) {
          localStorage.setItem('neon-auth-user', JSON.stringify(json.user))
        }
        return { data: { user: json.user }, error: null }
      } catch {
        return { data: { user: null }, error: null }
      }
    },

    async getSession() {
      const token = localStorage.getItem('neon-auth-token')
      const stored = localStorage.getItem('neon-auth-user')
      if (!token || !stored) return { data: { session: null }, error: null }
      try {
        const user = JSON.parse(stored)
        return { data: { session: { access_token: token, user } }, error: null }
      } catch {
        return { data: { session: null }, error: null }
      }
    },

    onAuthStateChange(callback: (event: string, session: any) => void) {
      const listener = (e: any) => {
        callback('SIGNED_IN', e.detail)
      }
      window.addEventListener('auth-changed', listener)
      return {
        data: {
          subscription: {
            unsubscribe: () => window.removeEventListener('auth-changed', listener),
          },
        },
      }
    },
  },
}
