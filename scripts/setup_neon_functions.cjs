const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_FE8PS6KZLixf@ep-raspy-resonance-b5v6v2fq-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();

  await client.query(`
    -- Add password_hash to profiles if not present
    ALTER TABLE profiles ADD COLUMN IF NOT EXISTS password_hash text;

    CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true; $$;
    CREATE OR REPLACE FUNCTION public.is_active_user() RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true; $$;

    CREATE OR REPLACE FUNCTION public.adjust_stock(
      p_product_id text, p_delta numeric, p_movement_type text, p_reason text,
      p_notes text DEFAULT '', p_reference_id text DEFAULT NULL, p_reference_number text DEFAULT NULL
    ) RETURNS jsonb LANGUAGE plpgsql AS $$
    DECLARE product_row products%rowtype; next_stock numeric;
    BEGIN
      IF p_delta IS NULL OR p_delta = 0 THEN RAISE EXCEPTION 'Stock adjustment cannot be zero'; END IF;
      SELECT * INTO product_row FROM products WHERE id = p_product_id FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Product not found'; END IF;
      next_stock := product_row.stock_quantity + p_delta;
      IF next_stock < 0 THEN RAISE EXCEPTION 'Insufficient stock. Available quantity: %', product_row.stock_quantity; END IF;
      UPDATE products SET stock_quantity = next_stock, updated_at = now() WHERE id = p_product_id;
      INSERT INTO stock_movements(id, product_id, product_name, movement_type, quantity, reference_id, reference_number, movement_date)
      VALUES (gen_random_uuid()::text, product_row.id, product_row.name, p_movement_type, p_delta, p_reference_id, p_reference_number, now());
      RETURN jsonb_build_object('product_id', product_row.id, 'previous_stock', product_row.stock_quantity, 'new_stock', next_stock);
    END;
    $$;

    CREATE OR REPLACE FUNCTION public.complete_sale(sale_payload jsonb) RETURNS jsonb LANGUAGE plpgsql AS $$
    DECLARE sale_item jsonb; item_id text;
    BEGIN
      INSERT INTO sales(id, invoice_number, sold_at, cashier, customer_id, customer_name, subtotal, discount, tax, service, total, payment_method, amount_received, change, status)
      VALUES (
        sale_payload->>'id',
        sale_payload->>'invoice_number',
        (sale_payload->>'sold_at')::timestamptz,
        sale_payload->>'cashier',
        sale_payload->>'customer_id',
        sale_payload->>'customer_name',
        (sale_payload->>'subtotal')::numeric,
        (sale_payload->>'discount')::numeric,
        (sale_payload->>'tax')::numeric,
        (sale_payload->>'service')::numeric,
        (sale_payload->>'total')::numeric,
        sale_payload->>'payment_method',
        (sale_payload->>'amount_received')::numeric,
        (sale_payload->>'change')::numeric,
        COALESCE(sale_payload->>'status', 'completed')
      );
      FOR sale_item IN SELECT * FROM jsonb_array_elements(sale_payload->'items') LOOP
        item_id := sale_payload->>'id' || '-item-' || (sale_item->>'product_id');
        INSERT INTO sale_items(id, sale_id, product_type, product_id, product_name, quantity, weight_grams, unit_price, price_per_kg, total, cost_price, paid_quantity, free_quantity, total_quantity, selling_mode, price_type)
        VALUES (
          item_id,
          sale_payload->>'id',
          sale_item->>'product_type',
          sale_item->>'product_id',
          sale_item->>'product_name',
          (sale_item->>'quantity')::numeric,
          NULLIF(sale_item->>'weight_grams','')::numeric,
          (sale_item->>'unit_price')::numeric,
          NULLIF(sale_item->>'price_per_kg','')::numeric,
          (sale_item->>'total')::numeric,
          NULLIF(sale_item->>'cost_price','')::numeric,
          NULLIF(sale_item->>'paid_quantity','')::numeric,
          NULLIF(sale_item->>'free_quantity','')::numeric,
          NULLIF(sale_item->>'total_quantity','')::numeric,
          sale_item->>'selling_mode',
          sale_item->>'price_type'
        );
        IF sale_item->>'product_type' = 'grocery' THEN
          UPDATE products SET stock_quantity = stock_quantity - (sale_item->>'quantity')::numeric, updated_at = now()
          WHERE id = sale_item->>'product_id';
          INSERT INTO stock_movements(id, product_id, product_name, movement_type, quantity, reference_id, reference_number, movement_date)
          VALUES (item_id || '-movement', sale_item->>'product_id', sale_item->>'product_name', 'sale', -(sale_item->>'quantity')::numeric, sale_payload->>'id', sale_payload->>'invoice_number', now());
        END IF;
      END LOOP;
      RETURN sale_payload;
    END;
    $$;
  `);

  console.log('✓ Neon functions and profiles updated successfully!');
  await client.end();
}

run().catch(console.error);
