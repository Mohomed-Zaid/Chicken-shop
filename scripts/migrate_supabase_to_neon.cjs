const { Client } = require('pg');

const SUPABASE_URL = 'postgresql://postgres.tbhmaxagsuuaujifdnfp:Nasheem0832@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres';
const NEON_URL = 'postgresql://neondb_owner:npg_FE8PS6KZLixf@ep-raspy-resonance-b5v6v2fq-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require';

const TABLES_IN_ORDER = [
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

async function syncTableColumns(supabase, neon, table) {
  const sColsRes = await supabase.query(`
    SELECT column_name, data_type, udt_name, character_maximum_length, numeric_precision, numeric_scale
    FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = $1
    ORDER BY ordinal_position;
  `, [table]);

  if (sColsRes.rows.length === 0) return;

  const pkRes = await supabase.query(`
    SELECT kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
      ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public' AND tc.table_name = $1;
  `, [table]);
  const pks = pkRes.rows.map(r => r.column_name);

  const nTableCheck = await neon.query(`
    SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1;
  `, [table]);

  if (nTableCheck.rows.length === 0) {
    const colDefs = sColsRes.rows.map(c => {
      let type = c.udt_name;
      if (type === 'varchar') type = c.character_maximum_length ? `varchar(${c.character_maximum_length})` : 'text';
      if (type === 'numeric' && c.numeric_precision) type = `numeric(${c.numeric_precision},${c.numeric_scale || 0})`;
      if (type === 'timestamptz') type = 'timestamptz';
      if (type === 'bool') type = 'boolean';
      if (type === 'int4') type = 'integer';
      if (type === 'int8') type = 'bigint';
      return `"${c.column_name}" ${type}`;
    });

    let pkClause = pks.length > 0 ? `, PRIMARY KEY (${pks.map(p => `"${p}"`).join(', ')})` : '';
    await neon.query(`CREATE TABLE IF NOT EXISTS "${table}" (${colDefs.join(', ')}${pkClause});`);
  } else {
    const nColsRes = await neon.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_schema = 'public' AND table_name = $1;
    `, [table]);
    const nCols = new Set(nColsRes.rows.map(r => r.column_name));

    for (const c of sColsRes.rows) {
      if (!nCols.has(c.column_name)) {
        let type = c.udt_name;
        if (type === 'varchar') type = c.character_maximum_length ? `varchar(${c.character_maximum_length})` : 'text';
        if (type === 'numeric' && c.numeric_precision) type = `numeric(${c.numeric_precision},${c.numeric_scale || 0})`;
        if (type === 'timestamptz') type = 'timestamptz';
        if (type === 'bool') type = 'boolean';
        if (type === 'int4') type = 'integer';
        if (type === 'int8') type = 'bigint';
        await neon.query(`ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${c.column_name}" ${type};`);
      }
    }
  }
}

async function main() {
  console.log('--- STARTING PRECISION MIGRATION TO NEON ---');

  const supabase = new Client({ connectionString: SUPABASE_URL, ssl: { rejectUnauthorized: false } });
  const neon = new Client({ connectionString: NEON_URL, ssl: { rejectUnauthorized: false } });

  await supabase.connect();
  console.log('✓ Connected to Supabase');

  await neon.connect();
  console.log('✓ Connected to Neon');

  // Sequences
  await neon.query(`
    CREATE SEQUENCE IF NOT EXISTS invoice_number_seq;
    CREATE SEQUENCE IF NOT EXISTS purchase_number_seq;
  `);

  // Step 1: Sync all schemas and columns dynamically
  console.log('\n1. Syncing exact table schemas from Supabase to Neon...');
  for (const table of TABLES_IN_ORDER) {
    await syncTableColumns(supabase, neon, table);
    console.log(`✓ Schema synced: ${table}`);
  }

  // Step 2: Copy data table by table
  console.log('\n2. Copying data rows from Supabase to Neon...');
  for (const table of TABLES_IN_ORDER) {
    const sRes = await supabase.query(`SELECT * FROM "${table}"`);
    const rows = sRes.rows;
    if (rows.length === 0) {
      console.log(` - ${table}: 0 rows (skipped)`);
      continue;
    }

    console.log(` - ${table}: copying ${rows.length} rows...`);
    const cols = Object.keys(rows[0]);
    const colNames = cols.map(c => `"${c}"`).join(', ');

    // Insert in batches of 50
    const BATCH_SIZE = 50;
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const values = [];
      const valueClauses = [];

      batch.forEach(row => {
        const placeholders = cols.map(col => {
          let val = row[col];
          // Properly stringify objects/json/jsonb so node-pg doesn't serialize as array
          if (val !== null && typeof val === 'object' && !(val instanceof Date)) {
            val = JSON.stringify(val);
          }
          values.push(val);
          return `$${values.length}`;
        });
        valueClauses.push(`(${placeholders.join(', ')})`);
      });

      const insertSql = `
        INSERT INTO "${table}" (${colNames}) 
        VALUES ${valueClauses.join(', ')}
        ON CONFLICT DO NOTHING;
      `;
      await neon.query(insertSql, values);
    }
  }

  // Step 3: Sequences sync
  console.log('\n3. Synchronizing sequences in Neon...');
  try {
    const sSeq = await supabase.query(`SELECT last_value FROM invoice_number_seq`);
    if (sSeq.rows[0]) {
      await neon.query(`SELECT setval('invoice_number_seq', $1, true)`, [sSeq.rows[0].last_value]);
      console.log(`✓ invoice_number_seq synced to ${sSeq.rows[0].last_value}`);
    }
  } catch (e) {
    console.warn('invoice_number_seq sync note:', e.message);
  }

  try {
    const sSeq2 = await supabase.query(`SELECT last_value FROM purchase_number_seq`);
    if (sSeq2.rows[0]) {
      await neon.query(`SELECT setval('purchase_number_seq', $1, true)`, [sSeq2.rows[0].last_value]);
      console.log(`✓ purchase_number_seq synced to ${sSeq2.rows[0].last_value}`);
    }
  } catch (e) {
    console.warn('purchase_number_seq sync note:', e.message);
  }

  // Step 4: Functions
  console.log('\n4. Creating database functions in Neon...');
  await neon.query(`
    CREATE OR REPLACE FUNCTION next_invoice_number() RETURNS text LANGUAGE plpgsql AS $$
    BEGIN
      RETURN 'INV-' || lpad(nextval('invoice_number_seq')::text, 6, '0');
    END;
    $$;

    CREATE OR REPLACE FUNCTION next_purchase_number() RETURNS text LANGUAGE plpgsql AS $$
    BEGIN
      RETURN 'PUR-' || lpad(nextval('purchase_number_seq')::text, 6, '0');
    END;
    $$;
  `);

  // Step 5: Verification
  console.log('\n=============================================');
  console.log('MIGRATION VERIFICATION (SUPABASE vs NEON)');
  console.log('=============================================');
  let allMatched = true;
  for (const table of TABLES_IN_ORDER) {
    const sCount = (await supabase.query(`SELECT count(*) FROM "${table}"`)).rows[0].count;
    const nCount = (await neon.query(`SELECT count(*) FROM "${table}"`)).rows[0].count;
    const match = sCount === nCount ? '✓ MATCH' : '✗ MISMATCH';
    if (sCount !== nCount) allMatched = false;
    console.log(` ${table.padEnd(25)} Supabase: ${sCount.padStart(5)} | Neon: ${nCount.padStart(5)} | ${match}`);
  }

  await supabase.end();
  await neon.end();

  if (allMatched) {
    console.log('\n🎉 ALL 18 TABLES MATCH 100% PERFECTLY IN NEON!');
  } else {
    console.log('\n⚠️ Some tables had mismatches, please check above.');
  }
}

main().catch(err => {
  console.error('\n Migration Error:', err);
  process.exit(1);
});
