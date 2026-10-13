import { neon } from '@neondatabase/serverless'

const connectionString =
  process.env.DATABASE_URL ||
  process.env.NEON_DATABASE_URL ||
  'postgresql://neondb_owner:npg_FE8PS6KZLixf@ep-raspy-resonance-b5v6v2fq-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require'

export const sql = neon(connectionString)

export function getDatabaseUrl() {
  return connectionString
}
