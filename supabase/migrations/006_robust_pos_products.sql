-- Migration 006: Robust POS Product Checkout and Auto-Registration
-- Allows POS checkout to succeed even if demo/local products were not yet seeded to Supabase

create or replace function public.complete_sale(sale_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  sale_item jsonb;
  item_id text;
  product_row products%rowtype;
  next_stock numeric;
  v_sold_at timestamptz;
begin
  if not public.is_active_user() then
    raise exception 'Active account required';
  end if;

  if not public.is_subscription_active() then
    raise exception 'Subscription expired or inactive. Please renew subscription to continue business operations.';
  end if;

  begin
    v_sold_at := coalesce(nullif(sale_payload->>'sold_at', '')::timestamptz, now());
  exception when others then
    v_sold_at := now();
  end;

  insert into sales(
    id, invoice_number, sold_at, cashier_user_id, cashier, customer_name,
    subtotal, discount, tax, service, total, payment_method, amount_received, change, status
  ) values (
    sale_payload->>'id',
    sale_payload->>'invoice_number',
    v_sold_at,
    auth.uid(),
    coalesce(sale_payload->>'cashier', 'Cashier'),
    coalesce(sale_payload->>'customer_name', 'Walk-in Customer'),
    coalesce((sale_payload->>'subtotal')::numeric, 0),
    coalesce((sale_payload->>'discount')::numeric, 0),
    coalesce((sale_payload->>'tax')::numeric, 0),
    coalesce((sale_payload->>'service')::numeric, 0),
    coalesce((sale_payload->>'total')::numeric, 0),
    coalesce(sale_payload->>'payment_method', 'Cash'),
    coalesce((sale_payload->>'amount_received')::numeric, 0),
    coalesce((sale_payload->>'change')::numeric, 0),
    'completed'
  );

  for sale_item in select * from jsonb_array_elements(coalesce(sale_payload->'items', '[]'::jsonb)) loop
    item_id := coalesce(sale_item->>'id', sale_payload->>'id' || '-item-' || coalesce(sale_item->>'product_id', 'item') || '-' || substr(md5(random()::text), 1, 8));

    if (sale_item->>'product_type') = 'grocery' and (sale_item->>'product_id') is not null then
      -- 1. Try to find product by ID
      select * into product_row from products where id = sale_item->>'product_id' for update;
      
      -- 2. If not found by ID, try looking up by matching product name
      if not found then
        select * into product_row from products where lower(trim(name)) = lower(trim(sale_item->>'product_name')) for update;
      end if;

      -- 3. If product does not exist at all in database, auto-register it
      if not found then
        insert into products (
          id, name, category, cost_price, selling_price, stock_quantity, low_stock_level, unit, active, created_at, updated_at
        ) values (
          sale_item->>'product_id',
          coalesce(sale_item->>'product_name', 'Grocery Item'),
          'Grocery',
          coalesce((sale_item->>'cost_price')::numeric, 0),
          coalesce((sale_item->>'unit_price')::numeric, 0),
          100,
          10,
          'Piece',
          true,
          now(),
          now()
        )
        returning * into product_row;
      end if;

      -- 4. Reactivate if inactive
      if not product_row.active then
        update products set active = true, updated_at = now() where id = product_row.id;
        product_row.active := true;
      end if;

      -- 5. Calculate stock reduction
      next_stock := product_row.stock_quantity - coalesce((sale_item->>'quantity')::numeric, 1);
      if next_stock < 0 then
        next_stock := 0;
      end if;
      
      perform set_config('app.stock_rpc', 'true', true);
      update products set stock_quantity = next_stock, updated_at = now() where id = product_row.id;
    end if;

    insert into sale_items(
      id, sale_id, product_type, product_id, product_name,
      quantity, weight_grams, unit_price, price_per_kg, cost_price, total
    ) values (
      item_id,
      sale_payload->>'id',
      coalesce(sale_item->>'product_type', 'grocery'),
      sale_item->>'product_id',
      coalesce(sale_item->>'product_name', 'Item'),
      coalesce((sale_item->>'quantity')::numeric, 1),
      nullif(sale_item->>'weight_grams','')::numeric,
      coalesce((sale_item->>'unit_price')::numeric, 0),
      nullif(sale_item->>'price_per_kg','')::numeric,
      case when sale_item->>'product_type' = 'grocery' and product_row.cost_price is not null then product_row.cost_price else nullif(sale_item->>'cost_price','')::numeric end,
      coalesce((sale_item->>'total')::numeric, 0)
    );

    if (sale_item->>'product_type') = 'grocery' and product_row.id is not null then
      insert into stock_movements(
        id, product_id, product_name, movement_type, quantity,
        previous_stock, new_stock, reference_id, reference_number, reason, notes, created_by, movement_date
      ) values (
        item_id || '-movement',
        product_row.id,
        product_row.name,
        'sale',
        -coalesce((sale_item->>'quantity')::numeric, 1),
        product_row.stock_quantity,
        next_stock,
        sale_payload->>'id',
        sale_payload->>'invoice_number',
        'Completed sale',
        '',
        auth.uid(),
        now()
      );
    end if;
  end loop;

  return sale_payload;
end;
$$;
