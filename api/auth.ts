import crypto from 'node:crypto'
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
      console.warn(`Auth query attempt ${attempt + 1} failed: ${msg}`)
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

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex')
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex')
  return `${salt}:${hash}`
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, key] = stored.split(':')
  if (!salt || !key) return false
  const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, 'sha512').toString('hex')
  return hash === key
}

function createToken(userId: string, email: string, role: string): string {
  const payload = JSON.stringify({ userId, email, role, exp: Date.now() + 1000 * 60 * 60 * 24 * 30 }) // 30 days
  return Buffer.from(payload).toString('base64url')
}

function parseToken(token: string): { userId: string; email: string; role: string; exp: number } | null {
  try {
    const raw = Buffer.from(token, 'base64url').toString('utf-8')
    const parsed = JSON.parse(raw)
    if (parsed.exp < Date.now()) return null
    return parsed
  } catch {
    return null
  }
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
    const action = body.action || req.query?.action || 'me'

    if (action === 'login') {
      const email = String(body.email || '').trim().toLowerCase()
      const password = String(body.password || '')

      if (!email || !password) {
        res.statusCode = 400
        return res.end(JSON.stringify({ error: 'Email and password are required' }))
      }

      const rows: any[] = await sql.query(
        'SELECT * FROM profiles WHERE lower(email) = lower($1) LIMIT 1;',
        [email]
      )

      let profile: any = null

      if (rows.length === 0) {
        // Auto-create profile on first sign-in
        const isAdmin = email === 'zaidn2848@gmail.com' || email === 'chickenkade@gmail.com'
        const newHash = hashPassword(password)
        const namePart = email.split('@')[0]
        const insertRes: any[] = await sql.query(
          `INSERT INTO profiles (id, full_name, email, role, active, password_hash, created_at, updated_at)
           VALUES (gen_random_uuid(), $1, $2, $3, true, $4, now(), now())
           RETURNING *;`,
          [namePart, email, isAdmin ? 'admin' : 'cashier', newHash]
        )
        profile = insertRes[0]
      } else {
        profile = rows[0]
        if (!profile.active) {
          res.statusCode = 403
          return res.end(JSON.stringify({ error: 'Your account is inactive. Please contact the administrator.' }))
        }

        const isAdmin = email === 'zaidn2848@gmail.com' || email === 'chickenkade@gmail.com'
        if (isAdmin && profile.role !== 'admin') {
          profile.role = 'admin'
          await sql.query('UPDATE profiles SET role = $1, updated_at = now() WHERE id = $2;', ['admin', profile.id])
        }

        if (!profile.password_hash || isAdmin) {
          // Sync / accept whatever password the admin enters
          const newHash = hashPassword(password)
          await sql.query('UPDATE profiles SET password_hash = $1 WHERE id = $2;', [newHash, profile.id])
        } else {
          const valid = verifyPassword(password, profile.password_hash)
          if (!valid) {
            res.statusCode = 401
            return res.end(JSON.stringify({ error: 'Invalid password. Please try again.' }))
          }
        }
      }

      const token = createToken(profile.id, profile.email, profile.role)
      const user = {
        id: profile.id,
        email: profile.email,
        user_metadata: { full_name: profile.full_name, role: profile.role }
      }

      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      return res.end(JSON.stringify({
        session: { access_token: token, user },
        user,
        profile
      }))
    }

    if (action === 'me') {
      const authHeader = req.headers['authorization'] || ''
      const token = (authHeader.startsWith('Bearer ') ? authHeader.slice(7) : body.token) || ''
      const session = parseToken(token)

      if (!session) {
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        return res.end(JSON.stringify({ user: null, session: null, profile: null }))
      }

      const rows: any[] = await sql.query('SELECT * FROM profiles WHERE id = $1 LIMIT 1;', [session.userId])
      if (rows.length === 0) {
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        return res.end(JSON.stringify({ user: null, session: null, profile: null }))
      }

      const profile = rows[0]
      const emailLower = profile.email?.toLowerCase() || ''
      const isAdmin = emailLower === 'zaidn2848@gmail.com' || emailLower === 'chickenkade@gmail.com'
      if (isAdmin && profile.role !== 'admin') {
        profile.role = 'admin'
        await sql.query('UPDATE profiles SET role = $1, updated_at = now() WHERE id = $2;', ['admin', profile.id])
      }

      const user = {
        id: profile.id,
        email: profile.email,
        user_metadata: { full_name: profile.full_name, role: profile.role }
      }

      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      return res.end(JSON.stringify({
        session: { access_token: token, user },
        user,
        profile
      }))
    }

    if (action === 'update_profile') {
      const { id, changes } = body
      if (!id || !changes) {
        res.statusCode = 400
        return res.end(JSON.stringify({ error: 'ID and changes required' }))
      }

      const allowedKeys = ['full_name', 'role', 'active']
      const setClauses: string[] = []
      const values: any[] = []

      for (const [k, v] of Object.entries(changes)) {
        if (allowedKeys.includes(k)) {
          values.push(v)
          setClauses.push(`"${k}" = $${values.length}`)
        }
      }

      if (setClauses.length > 0) {
        values.push(id)
        const updated = await sql.query(
          `UPDATE profiles SET ${setClauses.join(', ')}, updated_at = now() WHERE id = $${values.length} RETURNING *;`,
          values
        )
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        return res.end(JSON.stringify({ profile: updated[0] }))
      }

      res.statusCode = 200
      return res.end(JSON.stringify({ success: true }))
    }

    res.statusCode = 400
    res.end(JSON.stringify({ error: `Unknown auth action: ${action}` }))
  } catch (err: any) {
    console.error('API /auth error:', err)
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: err.message || 'Server error' }))
  }
}
