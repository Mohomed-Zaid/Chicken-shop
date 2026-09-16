alter table sale_items add column if not exists cost_price numeric(12,2);
alter table sales drop constraint if exists sales_payment_method_check;
alter table sales add constraint sales_payment_method_check check (payment_method in ('Cash','Card','Credit','Other'));
create index if not exists sales_status_sold_at_idx on sales(status, sold_at);
create index if not exists expenses_date_idx on expenses(expense_date);
create index if not exists sale_items_product_type_idx on sale_items(product_type);

create or replace function public.complete_sale(sale_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare sale_item jsonb; item_id text; product_row products%rowtype; next_stock numeric;
begin
  if not public.is_active_user() then raise exception 'Active account required'; end if;
  insert into sales(id, invoice_number, sold_at, cashier_user_id, cashier, customer_name, subtotal, discount, tax, service, total, payment_method, amount_received, change, status)
  values (sale_payload->>'id', sale_payload->>'invoice_number', (sale_payload->>'sold_at')::timestamptz, auth.uid(), sale_payload->>'cashier', sale_payload->>'customer_name', (sale_payload->>'subtotal')::numeric, (sale_payload->>'discount')::numeric, (sale_payload->>'tax')::numeric, (sale_payload->>'service')::numeric, (sale_payload->>'total')::numeric, sale_payload->>'payment_method', (sale_payload->>'amount_received')::numeric, (sale_payload->>'change')::numeric, 'completed');
  for sale_item in select * from jsonb_array_elements(sale_payload->'items') loop
    item_id := sale_payload->>'id' || '-item-' || (sale_item->>'product_id');
    if sale_item->>'product_type' = 'grocery' then
      select * into product_row from products where id = sale_item->>'product_id' for update;
      if not found or not product_row.active then raise exception 'Product is unavailable'; end if;
      next_stock := product_row.stock_quantity - (sale_item->>'quantity')::numeric;
      if next_stock < 0 then raise exception 'Insufficient stock. Available quantity: %', product_row.stock_quantity; end if;
      perform set_config('app.stock_rpc', 'true', true);
      update products set stock_quantity = next_stock, updated_at = now() where id = product_row.id;
    end if;
    insert into sale_items(id, sale_id, product_type, product_id, product_name, quantity, weight_grams, unit_price, price_per_kg, cost_price, total)
    values (item_id, sale_payload->>'id', sale_item->>'product_type', sale_item->>'product_id', sale_item->>'product_name', (sale_item->>'quantity')::numeric, nullif(sale_item->>'weight_grams','')::numeric, (sale_item->>'unit_price')::numeric, nullif(sale_item->>'price_per_kg','')::numeric, case when sale_item->>'product_type' = 'grocery' then product_row.cost_price else null end, (sale_item->>'total')::numeric);
    if sale_item->>'product_type' = 'grocery' then
      insert into stock_movements(id, product_id, product_name, movement_type, quantity, previous_stock, new_stock, reference_id, reference_number, reason, notes, created_by, movement_date)
      values (item_id || '-movement', product_row.id, product_row.name, 'sale', -(sale_item->>'quantity')::numeric, product_row.stock_quantity, next_stock, sale_payload->>'id', sale_payload->>'invoice_number', 'Completed sale', '', auth.uid(), now());
    end if;
  end loop;
  return sale_payload;
end;
$$;