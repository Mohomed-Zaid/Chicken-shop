import { neon } from '@neondatabase/serverless'

let connectionString =
  process.env.DATABASE_URL ||
  process.env.NEON_DATABASE_URL ||
  'postgresql://neondb_owner:npg_FE8PS6KZLixf@ep-raspy-resonance-b5v6v2fq.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require'

connectionString = connectionString.replace('-pooler.c-7.', '.c-7.')

const rawSql = neon(connectionString)

async function queryWithRetry(queryText: string, params: any[] = [], maxRetries = 2): Promise<any[]> {
  let lastError: any = null
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await rawSql.query(queryText, params)
    } catch (err: any) {
      lastError = err
      const msg = err?.message || String(err)
      console.warn(`Database query attempt ${attempt + 1} failed: ${msg}`)
      if (
        attempt < maxRetries &&
        (msg.includes('fetch failed') ||
          msg.includes('network') ||
          msg.includes('timeout') ||
          msg.includes('connection') ||
          msg.includes('socket') ||
          msg.includes('ECONNRESET'))
      ) {
        await new Promise(r => setTimeout(r, 700 * (attempt + 1)))
      } else {
        break
      }
    }
  }
  throw lastError
}

const sql = {
  query: queryWithRetry,
}

async function readBody(req: any): Promise<any> {
  if (req.body && typeof req.body === 'object') {
    return req.body
  }
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body)
    } catch {
      return {}
    }
  }
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk: any) => (body += chunk))
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch {
        resolve({})
      }
    })
    req.on('error', () => resolve({}))
  })
}

export default async function handler(req: any, res: any) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    return res.end()
  }

  try {
    const body = req.body || (await readBody(req))
    const action = body.action || req.query?.action || 'select'
    const table = body.table || req.query?.table

    // 1. SELECT
    if (action === 'select') {
      if (!table) {
        res.statusCode = 400
        return res.end(JSON.stringify({ error: 'Table is required' }))
      }

      let query = `SELECT * FROM "${table}"`
      const values: any[] = []
      const whereClauses: string[] = []

      // Special handling for sales with items join
      if (table === 'sales' && body.includeRelations?.includes('sale_items')) {
        query = `
          SELECT sales.*, 
            COALESCE((
              SELECT json_agg(sale_items.*) 
              FROM sale_items 
              WHERE sale_items.sale_id = sales.id
            ), '[]'::json) AS sale_items 
          FROM sales
        `
      } else if (table === 'products' && body.includeRelations?.includes('product_pack_prices')) {
        query = `
          SELECT products.*, 
            COALESCE((
              SELECT json_agg(product_pack_prices.*) 
              FROM product_pack_prices 
              WHERE product_pack_prices.product_id = products.id
            ), '[]'::json) AS product_pack_prices 
          FROM products
        `
      }

      // Filters
      if (body.eq && typeof body.eq === 'object') {
        for (const [col, val] of Object.entries(body.eq)) {
          values.push(val)
          whereClauses.push(`"${col}" = $${values.length}`)
        }
      }

      if (whereClauses.length > 0) {
        query += ` WHERE ${whereClauses.join(' AND ')}`
      }

      // Order
      if (body.order) {
        const col = body.order.column || 'created_at'
        const dir = body.order.ascending === false ? 'DESC' : 'ASC'
        query += ` ORDER BY "${col}" ${dir}`
      }

      // Limit
      if (body.limit && typeof body.limit === 'number') {
        values.push(body.limit)
        query += ` LIMIT $${values.length}`
      }

      const rows = await sql.query(query, values)
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      return res.end(JSON.stringify({ data: rows, error: null }))
    }

    // 2. UPSERT / INSERT
    if (action === 'upsert' || action === 'insert') {
      if (!table) {
        res.statusCode = 400
        return res.end(JSON.stringify({ error: 'Table is required' }))
      }

      const rows: any[] = Array.isArray(body.rows) ? body.rows : body.row ? [body.row] : []
      if (rows.length === 0) {
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        return res.end(JSON.stringify({ data: [], error: null }))
      }

      // Ensure all columns exist in the table before inserting
      try {
        const tableColsRes: any[] = await sql.query(
          'SELECT column_name FROM information_schema.columns WHERE table_schema = \'public\' AND table_name = $1;',
          [table]
        )
        const existingCols = new Set(tableColsRes.map(r => r.column_name))
        for (const col of Object.keys(rows[0])) {
          if (!existingCols.has(col)) {
            await sql.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${col}" text;`)
          }
        }
      } catch (colErr) {
        console.warn('Auto column check warning:', colErr)
      }

      const cols = Object.keys(rows[0])
      const colNames = cols.map(c => `"${c}"`).join(', ')
      const updateSet = cols
        .filter(c => c !== 'id')
        .map(c => `"${c}" = EXCLUDED."${c}"`)
        .join(', ')

      const insertedRows: any[] = []

      // Insert in small batches
      for (const row of rows) {
        const values = cols.map(c => {
          let val = row[c]
          if (c === 'barcode' && (val === '' || (typeof val === 'string' && val.trim() === ''))) {
            val = null
          }
          if (c === 'updated_at' && !val) {
            val = new Date().toISOString()
          }
          if (c === 'created_at' && !val) {
            val = new Date().toISOString()
          }
          if (val !== null && typeof val === 'object' && !(val instanceof Date)) {
            return JSON.stringify(val)
          }
          return val
        })
        const placeholders = cols.map((_, idx) => `$${idx + 1}`).join(', ')

        const sqlQuery = updateSet.length > 0
          ? `INSERT INTO "${table}" (${colNames}) VALUES (${placeholders}) ON CONFLICT ("id") DO UPDATE SET ${updateSet} RETURNING *;`
          : `INSERT INTO "${table}" (${colNames}) VALUES (${placeholders}) ON CONFLICT ("id") DO NOTHING RETURNING *;`

        const resRows: any[] = await sql.query(sqlQuery, values)
        if (resRows && resRows[0]) insertedRows.push(resRows[0])
      }

      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      return res.end(JSON.stringify({ data: insertedRows, error: null }))
    }

    // 3. UPDATE
    if (action === 'update') {
      if (!table || !body.changes) {
        res.statusCode = 400
        return res.end(JSON.stringify({ error: 'Table and changes are required' }))
      }

      const changes = body.changes

      // Ensure all update columns exist
      try {
        const tableColsRes: any[] = await sql.query(
          'SELECT column_name FROM information_schema.columns WHERE table_schema = \'public\' AND table_name = $1;',
          [table]
        )
        const existingCols = new Set(tableColsRes.map(r => r.column_name))
        for (const col of Object.keys(changes)) {
          if (!existingCols.has(col)) {
            await sql.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${col}" text;`)
          }
        }
      } catch (colErr) {
        console.warn('Auto column check warning on update:', colErr)
      }

      const cols = Object.keys(changes)
      const values: any[] = []
      const setClauses: string[] = []

      for (const col of cols) {
        let val = changes[col]
        if (col === 'barcode' && (val === '' || (typeof val === 'string' && val.trim() === ''))) {
          val = null
        }
        values.push(val !== null && typeof val === 'object' && !(val instanceof Date) ? JSON.stringify(val) : val)
        setClauses.push(`"${col}" = $${values.length}`)
      }

      const whereClauses: string[] = []
      if (body.eq && typeof body.eq === 'object') {
        for (const [col, val] of Object.entries(body.eq)) {
          values.push(val)
          whereClauses.push(`"${col}" = $${values.length}`)
        }
      }

      if (whereClauses.length === 0) {
        res.statusCode = 400
        return res.end(JSON.stringify({ error: 'Update requires at least one filter' }))
      }

      const query = `UPDATE "${table}" SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')} RETURNING *;`
      const updatedRows = await sql.query(query, values)

      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      return res.end(JSON.stringify({ data: updatedRows, error: null }))
    }

    // 4. DELETE
    if (action === 'delete') {
      if (!table) {
        res.statusCode = 400
        return res.end(JSON.stringify({ error: 'Table is required' }))
      }

      const values: any[] = []
      const whereClauses: string[] = []
      if (body.eq && typeof body.eq === 'object') {
        for (const [col, val] of Object.entries(body.eq)) {
          values.push(val)
          whereClauses.push(`"${col}" = $${values.length}`)
        }
      }

      if (whereClauses.length === 0) {
        res.statusCode = 400
        return res.end(JSON.stringify({ error: 'Delete requires at least one filter' }))
      }

      await sql.query(`DELETE FROM "${table}" WHERE ${whereClauses.join(' AND ')};`, values)
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      return res.end(JSON.stringify({ data: null, error: null }))
    }

    // 5. RPC
    if (action === 'rpc') {
      const fn = body.fn
      if (!fn) {
        res.statusCode = 400
        return res.end(JSON.stringify({ error: 'Function name is required for RPC' }))
      }

      let rpcResult: any = null

      if (fn === 'next_invoice_number') {
        const rows: any[] = await sql.query('SELECT next_invoice_number() AS result;')
        rpcResult = rows[0]?.result
      } else if (fn === 'next_purchase_number') {
        const rows: any[] = await sql.query('SELECT next_purchase_number() AS result;')
        rpcResult = rows[0]?.result
      } else if (fn === 'sync_invoice_number_sequence') {
        const lastVal = Number(body.args?.last_value || 0)
        await sql.query('SELECT setval(\'invoice_number_seq\', $1, true);', [Math.max(lastVal, 1)])
        rpcResult = null
      } else if (fn === 'complete_sale') {
        const payload = body.args?.sale_payload || body.args
        const rows: any[] = await sql.query('SELECT complete_sale($1) AS result;', [JSON.stringify(payload)])
        rpcResult = rows[0]?.result
      } else if (fn === 'adjust_stock') {
        const { p_product_id, p_delta, p_movement_type, p_reason, p_notes } = body.args || {}
        const rows: any[] = await sql.query(
          'SELECT adjust_stock($1, $2, $3, $4, $5) AS result;',
          [p_product_id, p_delta, p_movement_type, p_reason, p_notes || '']
        )
        rpcResult = rows[0]?.result
      } else if (fn === 'get_current_subscription') {
        const rows: any[] = await sql.query('SELECT * FROM subscriptions ORDER BY created_at DESC LIMIT 1;')
        const sub = rows[0]
        const now = new Date()
        const expiry = sub?.expiry_date ? new Date(sub.expiry_date) : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
        const isExpired = expiry <= now
        const isSuspended = sub?.status === 'suspended'
        const effective_status = isSuspended ? 'suspended' : isExpired ? 'expired' : 'active'
        const is_active = effective_status === 'active'
        const seconds_remaining = Math.max(0, Math.floor((expiry.getTime() - now.getTime()) / 1000))
        const days_remaining = Math.max(0, Math.ceil(seconds_remaining / 86400))

        rpcResult = {
          id: sub?.id || 'sub-1',
          business_id: sub?.business_id || 'default-business',
          business_name: sub?.business_name || 'Chicken Kade & Grocery',
          plan: sub?.plan || '30_days',
          start_date: sub?.start_date ? new Date(sub.start_date).toISOString() : now.toISOString(),
          expiry_date: expiry.toISOString(),
          stored_status: sub?.status || 'active',
          effective_status,
          is_active,
          server_time: now.toISOString(),
          days_remaining,
          seconds_remaining,
          created_at: sub?.created_at ? new Date(sub.created_at).toISOString() : now.toISOString(),
          updated_at: sub?.updated_at ? new Date(sub.updated_at).toISOString() : now.toISOString(),
        }
      } else if (fn === 'renew_subscription' || fn === 'activate_subscription' || fn === 'reactivate_subscription') {
        const now = new Date()
        const expiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
        await sql.query(`
          UPDATE subscriptions 
          SET status = 'active', start_date = $1, expiry_date = $2, updated_at = now()
          WHERE business_id = 'default-business';
        `, [now.toISOString(), expiry.toISOString()])

        const seconds_remaining = Math.floor((expiry.getTime() - now.getTime()) / 1000)
        const days_remaining = Math.ceil(seconds_remaining / 86400)
        rpcResult = {
          id: 'sub-1',
          business_id: 'default-business',
          business_name: 'Chicken Kade & Grocery',
          plan: '30_days',
          start_date: now.toISOString(),
          expiry_date: expiry.toISOString(),
          stored_status: 'active',
          effective_status: 'active',
          is_active: true,
          server_time: now.toISOString(),
          days_remaining,
          seconds_remaining,
        }
      } else if (fn === 'suspend_subscription') {
        await sql.query(`UPDATE subscriptions SET status = 'suspended', updated_at = now() WHERE business_id = 'default-business';`)
        rpcResult = {
          id: 'sub-1',
          business_id: 'default-business',
          business_name: 'Chicken Kade & Grocery',
          plan: '30_days',
          start_date: new Date().toISOString(),
          expiry_date: new Date().toISOString(),
          stored_status: 'suspended',
          effective_status: 'suspended',
          is_active: false,
          server_time: new Date().toISOString(),
          days_remaining: 0,
          seconds_remaining: 0,
        }
      } else {
        // Generic function call
        const args = body.args ? [JSON.stringify(body.args)] : []
        const rows: any[] = await sql.query(`SELECT "${fn}"(${args.length ? '$1' : ''}) AS result;`, args)
        rpcResult = rows[0]?.result
      }

      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      return res.end(JSON.stringify({ data: rpcResult, error: null }))
    }

    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: `Unknown action: ${action}` }))
  } catch (err: any) {
    console.error('API /db error:', err)
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ data: null, error: { message: err.message || 'Database error' } }))
  }
}
