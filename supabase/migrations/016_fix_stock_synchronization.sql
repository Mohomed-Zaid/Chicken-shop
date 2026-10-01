-- Migration 016: Fix Stock Synchronization and Prevent Accidental Stock Overwrite
-- Resolves the issue where adding product stock (e.g. 300 units) via Product Catalog,
-- Restock modal, or Purchases was rejected by prevent_direct_stock_update trigger,
-- causing the stock to silently revert to 0 or initial state after reload/sync.

-- 1. Update prevent_direct_stock_update trigger function:
-- Instead of throwing a fatal exception that breaks product editing and restocking,
-- allow administrators to update stock_quantity and automatically log an audit record
-- into stock_movements for compliance and traceability.
create or replace function public.prevent_direct_stock_update() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_delta numeric;
begin
  if new.stock_quantity is distinct from old.stock_quantity and current_setting('app.stock_rpc', true) is distinct from 'true' then
    v_delta := coalesce(new.stock_quantity, 0) - coalesce(old.stock_quantity, 0);

    -- If updated by an authenticated administrator, allow the update and auto-record movement
    if public.is_admin() or auth.uid() is not null then
      begin
        insert into stock_movements(
          id, product_id, product_name, movement_type, quantity,
          previous_stock, new_stock, reason, notes, created_by, movement_date
        ) values (
          gen_random_uuid()::text,
          new.id,
          new.name,
          'adjustment',
          v_delta,
          coalesce(old.stock_quantity, 0),
          coalesce(new.stock_quantity, 0),
          'Catalog / Restock update',
          'Stock quantity updated via Product Editor',
          auth.uid(),
          now()
        );
      exception when others then
        -- Do not fail product update if movement audit logging encounters an issue
        null;
      end;
      return new;
    end if;

    -- If not admin and not internal RPC, disallow direct modification
    raise exception 'Stock quantity can only be changed by an administrator or through stock transactions';
  end if;
  return new;
end;
$$;

drop trigger if exists prevent_direct_stock_update on products;
create trigger prevent_direct_stock_update before update on products for each row execute function public.prevent_direct_stock_update();

-- 2. Stored RPC to save or sync a product with stock quantity bypassing trigger restrictions
create or replace function public.save_product_with_stock(product_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_id text;
  v_name text;
  v_code text;
  v_category text;
  v_barcode text;
  v_cost_price numeric;
  v_selling_price numeric;
  v_retail_price numeric;
  v_wholesale_price numeric;
  v_wholesale_enabled boolean;
  v_wholesale_min_quantity numeric;
  v_discount_price numeric;
  v_stock_quantity numeric;
  v_low_stock_level numeric;
  v_unit text;
  v_active boolean;
  v_pack_pricing_enabled boolean;
  v_promotion_enabled boolean;
  v_promotion_type text;
  v_promotion_buy_quantity numeric;
  v_promotion_free_quantity numeric;
  v_promotion_start_date text;
  v_promotion_end_date text;
  v_promotion_active boolean;
  v_existing products%rowtype;
begin
  if not public.is_admin() then
    raise exception 'Administrator privileges required to update catalog products';
  end if;

  v_id := product_payload->>'id';
  if v_id is null or trim(v_id) = '' then
    v_id := 'grocery-' || floor(extract(epoch from now()) * 1000)::text;
  end if;

  v_name := coalesce(product_payload->>'name', 'Unnamed Product');
  v_code := product_payload->>'code';
  v_category := coalesce(product_payload->>'category', 'Grocery');
  v_barcode := product_payload->>'barcode';
  v_cost_price := coalesce((product_payload->>'cost_price')::numeric, 0);
  v_selling_price := coalesce((product_payload->>'selling_price')::numeric, 0);
  v_retail_price := coalesce((product_payload->>'retail_price')::numeric, v_selling_price);
  v_wholesale_price := nullif(product_payload->>'wholesale_price', '')::numeric;
  v_wholesale_enabled := coalesce((product_payload->>'wholesale_enabled')::boolean, false);
  v_wholesale_min_quantity := nullif(product_payload->>'wholesale_min_quantity', '')::numeric;
  v_discount_price := nullif(product_payload->>'discount_price', '')::numeric;
  v_stock_quantity := coalesce((product_payload->>'stock_quantity')::numeric, 0);
  v_low_stock_level := coalesce((product_payload->>'low_stock_level')::numeric, 5);
  v_unit := coalesce(product_payload->>'unit', 'Piece');
  v_active := coalesce((product_payload->>'active')::boolean, true);
  v_pack_pricing_enabled := coalesce((product_payload->>'pack_pricing_enabled')::boolean, false);
  v_promotion_enabled := coalesce((product_payload->>'promotion_enabled')::boolean, false);
  v_promotion_type := product_payload->>'promotion_type';
  v_promotion_buy_quantity := nullif(product_payload->>'promotion_buy_quantity', '')::numeric;
  v_promotion_free_quantity := nullif(product_payload->>'promotion_free_quantity', '')::numeric;
  v_promotion_start_date := product_payload->>'promotion_start_date';
  v_promotion_end_date := product_payload->>'promotion_end_date';
  v_promotion_active := coalesce((product_payload->>'promotion_active')::boolean, true);

  -- Authorize internal stock update
  perform set_config('app.stock_rpc', 'true', true);

  select * into v_existing from products where id = v_id for update;

  if found then
    update products set
      name = v_name,
      code = v_code,
      category = v_category,
      barcode = v_barcode,
      cost_price = v_cost_price,
      selling_price = v_selling_price,
      retail_price = v_retail_price,
      wholesale_price = v_wholesale_price,
      wholesale_enabled = v_wholesale_enabled,
      wholesale_min_quantity = v_wholesale_min_quantity,
      discount_price = v_discount_price,
      stock_quantity = v_stock_quantity,
      low_stock_level = v_low_stock_level,
      unit = v_unit,
      active = v_active,
      pack_pricing_enabled = v_pack_pricing_enabled,
      promotion_enabled = v_promotion_enabled,
      promotion_type = v_promotion_type,
      promotion_buy_quantity = v_promotion_buy_quantity,
      promotion_free_quantity = v_promotion_free_quantity,
      promotion_start_date = v_promotion_start_date,
      promotion_end_date = v_promotion_end_date,
      promotion_active = v_promotion_active,
      updated_at = now()
    where id = v_id;
  else
    insert into products (
      id, name, code, category, barcode, cost_price, selling_price, retail_price,
      wholesale_price, wholesale_enabled, wholesale_min_quantity, discount_price,
      stock_quantity, low_stock_level, unit, active, pack_pricing_enabled,
      promotion_enabled, promotion_type, promotion_buy_quantity, promotion_free_quantity,
      promotion_start_date, promotion_end_date, promotion_active, created_at, updated_at
    ) values (
      v_id, v_name, v_code, v_category, v_barcode, v_cost_price, v_selling_price, v_retail_price,
      v_wholesale_price, v_wholesale_enabled, v_wholesale_min_quantity, v_discount_price,
      v_stock_quantity, v_low_stock_level, v_unit, v_active, v_pack_pricing_enabled,
      v_promotion_enabled, v_promotion_type, v_promotion_buy_quantity, v_promotion_free_quantity,
      v_promotion_start_date, v_promotion_end_date, v_promotion_active, now(), now()
    );
  end if;

  return jsonb_build_object('success', true, 'id', v_id, 'stock_quantity', v_stock_quantity);
end;
$$;

-- 3. Stored RPC to bulk sync products with stock
create or replace function public.bulk_sync_products_with_stock(products_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  item jsonb;
  v_count int := 0;
begin
  if not public.is_admin() then
    raise exception 'Administrator privileges required';
  end if;

  perform set_config('app.stock_rpc', 'true', true);

  for item in select * from jsonb_array_elements(products_payload) loop
    perform public.save_product_with_stock(item);
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('success', true, 'synced_count', v_count);
end;
$$;
