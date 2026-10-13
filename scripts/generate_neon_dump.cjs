const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const client = new Client({
  connectionString: 'postgresql://postgres.tbhmaxagsuuaujifdnfp:Nasheem0832@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

const TABLES = [
  'business_settings',
  'chicken_cuts',
  'chicken_price_history',
  'products',
  'product_pack_prices',
  'customers',
  'suppliers',
  'profiles',
  'sales',
  'sale_items',
  'expenses',
  'customer_payments',
  'purchases',
  'purchase_items',
  'supplier_payments',
  'stock_movements',
  'subscriptions',
  'subscription_history'
];

function formatValue(val) {
  if (val === null || val === undefined) return 'NULL';
  if (typeof val === 'number') return String(val);
  if (typeof val === 'boolean') return val ? 'TRUE' : 'FALSE';
  if (val instanceof Date) return `'${val.toISOString()}'`;
  if (typeof val === 'object') return `'${JSON.stringify(val).replace(/'/g, "''")}'::jsonb`;
  return `'${String(val).replace(/'/g, "''")}'`;
}

async function exportToSql() {
  await client.connect();
  console.log('Connected to Supabase for export...');

  let sql = `-- ====================================================\n`;
  sql += `-- CHICKEN SHOP COMPLETE DATA EXPORT FOR NEON\n`;
  sql += `-- Generated on ${new Date().toISOString()}\n`;
  sql += `-- ====================================================\n\n`;

  // Read migrations in order to build schema
  const migrationsDir = path.join(__dirname, '..', 'supabase', 'migrations');
  const migrationFiles = fs.readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort();

  sql += `-- 1. CREATE SEQUENCES & TABLES\n`;
  for (const f of migrationFiles) {
    let content = fs.readFileSync(path.join(migrationsDir, f), 'utf-8');
    // Clean up Supabase auth.users references so it runs cleanly on Neon
    content = content.replace(/references\s+auth\.users\(id\)(\s+on\s+delete\s+cascade)?/gi, '');
    content = content.replace(/references\s+auth\.users/gi, '');
    // Clean up Supabase-specific functions that require auth.uid()
    content = content.replace(/create\s+or\s+replace\s+function\s+public\.is_active_user[\s\S]*?\$\$;/gi, '-- skipped auth function');
    content = content.replace(/create\s+or\s+replace\s+function\s+public\.is_admin[\s\S]*?\$\$;/gi, '-- skipped auth function');
    content = content.replace(/alter\s+table\s+\w+\s+enable\s+row\s+level\s+security;/gi, '-- skipped RLS enable');
    content = content.replace(/create\s+policy[\s\S]*?;/gi, '-- skipped policy');
    sql += `\n-- Migration: ${f}\n` + content + '\n';
  }

  sql += `\n\n-- 2. INSERTING DATA ROWS\n`;
  for (const table of TABLES) {
    try {
      const res = await client.query(`SELECT * FROM "${table}"`);
      if (res.rows.length === 0) {
        console.log(`Table ${table}: 0 rows (skipped)`);
        continue;
      }
      console.log(`Table ${table}: exporting ${res.rows.length} rows...`);
      sql += `\n-- Table: ${table} (${res.rows.length} rows)\n`;
      
      const columns = Object.keys(res.rows[0]);
      const colList = columns.map(c => `"${c}"`).join(', ');

      for (const row of res.rows) {
        const valList = columns.map(c => formatValue(row[c])).join(', ');
        sql += `INSERT INTO "${table}" (${colList}) VALUES (${valList}) ON CONFLICT DO NOTHING;\n`;
      }
    } catch (err) {
      console.warn(`Warning on table ${table}:`, err.message);
    }
  }

  // Sync sequences
  sql += `\n\n-- 3. SYNC SEQUENCES\n`;
  try {
    const seqRes = await client.query(`SELECT last_value FROM invoice_number_seq`);
    if (seqRes.rows[0]) {
      sql += `SELECT setval('invoice_number_seq', ${seqRes.rows[0].last_value}, true);\n`;
    }
  } catch (e) {
    sql += `-- invoice_number_seq: setval fallback\nSELECT setval('invoice_number_seq', (SELECT COALESCE(MAX(SUBSTRING(invoice_number FROM 5)::bigint), 1) FROM sales), true);\n`;
  }

  try {
    const seqRes2 = await client.query(`SELECT last_value FROM purchase_number_seq`);
    if (seqRes2.rows[0]) {
      sql += `SELECT setval('purchase_number_seq', ${seqRes2.rows[0].last_value}, true);\n`;
    }
  } catch (e) {
    sql += `-- purchase_number_seq: fallback\n`;
  }

  const outputPath = path.join(__dirname, '..', 'neon_complete_dump.sql');
  fs.writeFileSync(outputPath, sql, 'utf-8');
  console.log(`\nExport complete! Written to: ${outputPath} (${(fs.statSync(outputPath).size / 1024).toFixed(1)} KB)`);
  await client.end();
}

exportToSql().catch(err => {
  console.error('Fatal export error:', err);
  process.exit(1);
});
