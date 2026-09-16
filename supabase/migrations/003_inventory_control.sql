alter table stock_movements add column if not exists previous_stock numeric(12,3);
alter table stock_movements add column if not exists new_stock numeric(12,3);
alter table stock_movements add column if not exists reason text;
alter table stock_movements add column if not exists notes text;
alter table stock_movements add column if not exists created_by uuid references auth.users(id);

create or replace function public.prevent_stock_movement_changes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  raise exception 'Stock movements are append-only';
end;
$$;
drop trigger if exists stock_movements_append_only on stock_movements;
create trigger stock_movements_append_only before update or delete on stock_movements for each row execute function public.prevent_stock_movement_changes();

create or replace function public.adjust_stock(p_product_id text, p_delta numeric, p_movement_type text, p_reason text, p_notes text default '', p_reference_id text default null, p_reference_number text default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare product_row products%rowtype; next_stock numeric;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_delta is null or p_delta = 0 then raise exception 'Stock adjustment cannot be zero'; end if;
  if p_movement_type not in ('adjustment','return','damage','expired','lost','found') then raise exception 'Invalid stock movement type'; end if;
  if nullif(trim(coalesce(p_reason, '')), '') is null then raise exception 'A reason is required'; end if;
  select * into product_row from products where id = p_product_id for update;
  if not found then raise exception 'Product not found'; end if;
  next_stock := product_row.stock_quantity + p_delta;
  if next_stock < 0 then raise exception 'Insufficient stock. Available quantity: %', product_row.stock_quantity; end if;
  perform set_config('app.stock_rpc', 'true', true);
  update products set stock_quantity = next_stock, updated_at = now() where id = p_product_id;
  insert into stock_movements(id, product_id, product_name, movement_type, quantity, previous_stock, new_stock, reference_id, reference_number, reason, notes, created_by, movement_date)
  values (gen_random_uuid()::text, product_row.id, product_row.name, p_movement_type, p_delta, product_row.stock_quantity, next_stock, p_reference_id, p_reference_number, p_reason, p_notes, auth.uid(), now());
  return jsonb_build_object('product_id', product_row.id, 'previous_stock', product_row.stock_quantity, 'new_stock', next_stock);
end;
$$;

create or replace function public.receive_purchase_stock(p_product_id text, p_quantity numeric, p_reference_id text, p_reference_number text, p_reason text default 'Completed purchase') returns jsonb
language plpgsql security definer set search_path = public as $$
declare product_row products%rowtype; next_stock numeric;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if p_quantity is null or p_quantity <= 0 then raise exception 'Purchase quantity must be greater than zero'; end if;
  select * into product_row from products where id = p_product_id for update;
  if not found then raise exception 'Product not found'; end if;
  next_stock := product_row.stock_quantity + p_quantity;
  perform set_config('app.stock_rpc', 'true', true);
  update products set stock_quantity = next_stock, updated_at = now() where id = p_product_id;
  insert into stock_movements(id, product_id, product_name, movement_type, quantity, previous_stock, new_stock, reference_id, reference_number, reason, notes, created_by, movement_date)
  values (gen_random_uuid()::text, product_row.id, product_row.name, 'purchase', p_quantity, product_row.stock_quantity, next_stock, p_reference_id, p_reference_number, p_reason, '', auth.uid(), now());
  return jsonb_build_object('product_id', product_row.id, 'previous_stock', product_row.stock_quantity, 'new_stock', next_stock);
end;
$$;

create or replace function public.complete_sale(sale_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare sale_item jsonb; item_id text; product_row products%rowtype; next_stock numeric;
begin
  if not public.is_active_user() then raise exception 'Active account required'; end if;
  insert into sales(id, invoice_number, sold_at, cashier_user_id, cashier, customer_name, subtotal, discount, tax, service, total, payment_method, amount_received, change, status)
  values (sale_payload->>'id', sale_payload->>'invoice_number', (sale_payload->>'sold_at')::timestamptz, auth.uid(), sale_payload->>'cashier', sale_payload->>'customer_name', (sale_payload->>'subtotal')::numeric, (sale_payload->>'discount')::numeric, (sale_payload->>'tax')::numeric, (sale_payload->>'service')::numeric, (sale_payload->>'total')::numeric, sale_payload->>'payment_method', (sale_payload->>'amount_received')::numeric, (sale_payload->>'change')::numeric, 'completed');
  for sale_item in select * from jsonb_array_elements(sale_payload->'items') loop
    item_id := sale_payload->>'id' || '-item-' || (sale_item->>'product_id');
    insert into sale_items(id, sale_id, product_type, product_id, product_name, quantity, weight_grams, unit_price, price_per_kg, total)
    values (item_id, sale_payload->>'id', sale_item->>'product_type', sale_item->>'product_id', sale_item->>'product_name', (sale_item->>'quantity')::numeric, nullif(sale_item->>'weight_grams','')::numeric, (sale_item->>'unit_price')::numeric, nullif(sale_item->>'price_per_kg','')::numeric, (sale_item->>'total')::numeric);
    if sale_item->>'product_type' = 'grocery' then
      select * into product_row from products where id = sale_item->>'product_id' for update;
      if not found or not product_row.active then raise exception 'Product is unavailable'; end if;
      next_stock := product_row.stock_quantity - (sale_item->>'quantity')::numeric;
      if next_stock < 0 then raise exception 'Insufficient stock. Available quantity: %', product_row.stock_quantity; end if;
      perform set_config('app.stock_rpc', 'true', true);
      update products set stock_quantity = next_stock, updated_at = now() where id = product_row.id;
      insert into stock_movements(id, product_id, product_name, movement_type, quantity, previous_stock, new_stock, reference_id, reference_number, reason, notes, created_by, movement_date)
      values (item_id || '-movement', product_row.id, product_row.name, 'sale', -(sale_item->>'quantity')::numeric, product_row.stock_quantity, next_stock, sale_payload->>'id', sale_payload->>'invoice_number', 'Completed sale', '', auth.uid(), now());
    end if;
  end loop;
  return sale_payload;
end;
$$;

drop policy if exists stock_movements_read on stock_movements;
drop policy if exists stock_movements_admin on stock_movements;
drop policy if exists stock_movements_append on stock_movements;
create policy stock_movements_read on stock_movements for select to authenticated using (public.is_admin());
revoke insert, update, delete on stock_movements from authenticated;

create or replace function public.prevent_direct_stock_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.stock_quantity is distinct from old.stock_quantity and current_setting('app.stock_rpc', true) is distinct from 'true' then
    raise exception 'Stock quantity can only be changed through stock transactions';
  end if;
  return new;
end;
$$;
drop trigger if exists prevent_direct_stock_update on products;
create trigger prevent_direct_stock_update before update on products for each row execute function public.prevent_direct_stock_update();