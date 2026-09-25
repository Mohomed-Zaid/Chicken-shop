-- Migration 015: Pack / Bundle Pricing System
-- 1. Extend products table with pack_pricing_enabled
alter table if exists public.products
  add column if not exists pack_pricing_enabled boolean default false;

-- 2. Create product_pack_prices table for multiple pack rules per product
create table if not exists public.product_pack_prices (
  id text primary key,
  product_id text not null references public.products(id) on delete cascade,
  selling_mode text not null default 'RETAIL' check (selling_mode in ('RETAIL', 'WHOLESALE')),
  quantity numeric not null check (quantity > 1),
  pack_price numeric(12,2) not null check (pack_price > 0),
  active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint uq_product_pack_prices unique (product_id, selling_mode, quantity)
);

-- Indexes for lightning-fast POS product queries
create index if not exists idx_product_pack_prices_product_id on public.product_pack_prices(product_id);
create index if not exists idx_product_pack_prices_lookup on public.product_pack_prices(product_id, selling_mode, active);

-- 3. Row Level Security for product_pack_prices
alter table public.product_pack_prices enable row level security;

drop policy if exists product_pack_prices_select on public.product_pack_prices;
create policy product_pack_prices_select on public.product_pack_prices
  for select to authenticated using (true);

drop policy if exists product_pack_prices_anon_select on public.product_pack_prices;
create policy product_pack_prices_anon_select on public.product_pack_prices
  for select to anon using (true);

drop policy if exists product_pack_prices_insert on public.product_pack_prices;
create policy product_pack_prices_insert on public.product_pack_prices
  for insert to authenticated with check (public.is_active_user());

drop policy if exists product_pack_prices_update on public.product_pack_prices;
create policy product_pack_prices_update on public.product_pack_prices
  for update to authenticated using (public.is_active_user());

drop policy if exists product_pack_prices_delete on public.product_pack_prices;
create policy product_pack_prices_delete on public.product_pack_prices
  for delete to authenticated using (public.is_active_user());

-- 4. Extend sale_items table with pack pricing metadata
alter table if exists public.sale_items
  add column if not exists pack_pricing_applied boolean default false,
  add column if not exists pack_breakdown jsonb default null;

-- 5. Update complete_sale RPC to record pack pricing fields
create or replace function public.complete_sale(sale_payload jsonb) returns jsonb
language plpgsql security definer as $$
declare
  sale_item jsonb;
  item_id text;
  product_row products%rowtype;
  next_stock numeric;
  stock_reduction numeric;
  v_invoice_number text;
  v_sold_at timestamptz;
  v_selling_mode text;
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

  -- Ensure invoice number is unique and valid
  v_invoice_number := trim(coalesce(sale_payload->>'invoice_number', ''));
  if v_invoice_number = '' or exists (select 1 from sales where invoice_number = v_invoice_number) then
    v_invoice_number := public.next_invoice_number();
  end if;

  v_selling_mode := coalesce(nullif(sale_payload->>'selling_mode', ''), 'RETAIL');

  insert into sales(
    id, invoice_number, sold_at, cashier_user_id, cashier, customer_id, customer_name,
    subtotal, discount, tax, service, total, payment_method, amount_received, change, status,
    selling_mode
  ) values (
    sale_payload->>'id',
    v_invoice_number,
    v_sold_at,
    auth.uid(),
    coalesce(sale_payload->>'cashier', 'Cashier'),
    nullif(sale_payload->>'customer_id', ''),
    coalesce(sale_payload->>'customer_name', 'Walk-in Customer'),
    coalesce((sale_payload->>'subtotal')::numeric, 0),
    coalesce((sale_payload->>'discount')::numeric, 0),
    coalesce((sale_payload->>'tax')::numeric, 0),
    coalesce((sale_payload->>'service')::numeric, 0),
    coalesce((sale_payload->>'total')::numeric, 0),
    coalesce(sale_payload->>'payment_method', 'Cash'),
    coalesce((sale_payload->>'amount_received')::numeric, 0),
    coalesce((sale_payload->>'change')::numeric, 0),
    'completed',
    v_selling_mode
  );

  for sale_item in select * from jsonb_array_elements(coalesce(sale_payload->'items', '[]'::jsonb)) loop
    item_id := coalesce(sale_item->>'id', sale_payload->>'id' || '-item-' || coalesce(sale_item->>'product_id', 'item') || '-' || substr(md5(random()::text), 1, 8));

    -- Determine stock reduction: total_quantity (physical units given) takes precedence over paid quantity
    stock_reduction := coalesce((sale_item->>'total_quantity')::numeric, (sale_item->>'quantity')::numeric, 1);

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
          id, name, category, cost_price, selling_price, retail_price, stock_quantity, low_stock_level, unit, active, created_at, updated_at
        ) values (
          sale_item->>'product_id',
          coalesce(sale_item->>'product_name', 'Grocery Item'),
          'Grocery',
          coalesce((sale_item->>'cost_price')::numeric, 0),
          coalesce((sale_item->>'unit_price')::numeric, 0),
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

      -- 5. Calculate stock reduction based on total physical quantity
      next_stock := product_row.stock_quantity - stock_reduction;
      if next_stock < 0 then
        next_stock := 0;
      end if;
      
      perform set_config('app.stock_rpc', 'true', true);
      update products set stock_quantity = next_stock, updated_at = now() where id = product_row.id;
    end if;

    insert into sale_items(
      id, sale_id, product_type, product_id, product_name,
      quantity, weight_grams, unit_price, price_per_kg, cost_price, total,
      paid_quantity, free_quantity, total_quantity,
      promotion_applied, promotion_type, promotion_buy_quantity, promotion_free_quantity,
      selling_mode, price_type, pack_pricing_applied, pack_breakdown
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
      coalesce((sale_item->>'total')::numeric, 0),
      coalesce((sale_item->>'paid_quantity')::numeric, (sale_item->>'quantity')::numeric, 1),
      coalesce((sale_item->>'free_quantity')::numeric, 0),
      stock_reduction,
      coalesce((sale_item->>'promotion_applied')::boolean, false),
      sale_item->>'promotion_type',
      nullif(sale_item->>'promotion_buy_quantity', '')::numeric,
      nullif(sale_item->>'promotion_free_quantity', '')::numeric,
      coalesce(sale_item->>'selling_mode', v_selling_mode),
      coalesce(sale_item->>'price_type', 'RETAIL'),
      coalesce((sale_item->>'pack_pricing_applied')::boolean, false),
      case when sale_item->'pack_breakdown' is not null and jsonb_typeof(sale_item->'pack_breakdown') = 'array' then sale_item->'pack_breakdown' else null end
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
        -stock_reduction,
        product_row.stock_quantity,
        next_stock,
        sale_payload->>'id',
        v_invoice_number,
        'POS Sale (' || v_selling_mode || ')',
        'Customer: ' || coalesce(sale_payload->>'customer_name', 'Walk-in Customer'),
        auth.uid(),
        v_sold_at
      );
    end if;
  end loop;

  return sale_payload;
end;
$$;
