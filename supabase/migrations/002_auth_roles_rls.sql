create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text,
  role text not null default 'cashier' check (role in ('admin', 'cashier')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1), 'Cashier'), new.email)
  on conflict (id) do update set email = excluded.email, updated_at = now();
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.is_active_user() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active = true);
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active = true and role = 'admin');
$$;

alter table profiles enable row level security;
alter table sales add column if not exists cashier_user_id uuid references auth.users(id);
alter table expenses add column if not exists created_by_user_id uuid references auth.users(id);
alter table purchases add column if not exists created_by_user_id uuid references auth.users(id);
alter table stock_movements add column if not exists created_by_user_id uuid references auth.users(id);
alter table customer_payments add column if not exists created_by_user_id uuid references auth.users(id);
alter table supplier_payments add column if not exists created_by_user_id uuid references auth.users(id);

create or replace function public.prevent_profile_escalation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.role = 'admin' and old.active and (new.role <> 'admin' or not new.active) and (select count(*) from public.profiles where role = 'admin' and active) <= 1 then
    raise exception 'The last active administrator cannot be removed';
  end if;
  if old.role <> 'admin' and new.role = 'admin' and not public.is_admin() then
    raise exception 'Only an administrator can grant administrator access';
  end if;
  if old.role <> new.role and not public.is_admin() then
    raise exception 'Only an administrator can change roles';
  end if;
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists protect_profile_changes on profiles;
create trigger protect_profile_changes before update on profiles for each row execute function public.prevent_profile_escalation();

create or replace function public.prevent_customer_financial_changes() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() and (new.credit_limit is distinct from old.credit_limit or new.opening_balance is distinct from old.opening_balance or new.active is distinct from old.active) then
    raise exception 'Only an administrator can change customer financial fields';
  end if;
  new.updated_at = now();
  return new;
end;
$$;
drop trigger if exists protect_customer_financial_changes on customers;
create trigger protect_customer_financial_changes before update on customers for each row execute function public.prevent_customer_financial_changes();

create or replace function public.complete_sale(sale_payload jsonb) returns jsonb
language plpgsql security invoker as $$
declare sale_item jsonb; item_id text; current_name text;
begin
  if not public.is_active_user() then raise exception 'Active account required'; end if;
  insert into sales(id, invoice_number, sold_at, cashier_user_id, cashier, customer_name, subtotal, discount, tax, service, total, payment_method, amount_received, change, status)
  values (sale_payload->>'id', sale_payload->>'invoice_number', (sale_payload->>'sold_at')::timestamptz, auth.uid(), sale_payload->>'cashier', sale_payload->>'customer_name', (sale_payload->>'subtotal')::numeric, (sale_payload->>'discount')::numeric, (sale_payload->>'tax')::numeric, (sale_payload->>'service')::numeric, (sale_payload->>'total')::numeric, sale_payload->>'payment_method', (sale_payload->>'amount_received')::numeric, (sale_payload->>'change')::numeric, 'completed');
  for sale_item in select * from jsonb_array_elements(sale_payload->'items') loop
    item_id := sale_payload->>'id' || '-item-' || (sale_item->>'product_id');
    insert into sale_items(id, sale_id, product_type, product_id, product_name, quantity, weight_grams, unit_price, price_per_kg, total)
    values (item_id, sale_payload->>'id', sale_item->>'product_type', sale_item->>'product_id', sale_item->>'product_name', (sale_item->>'quantity')::numeric, nullif(sale_item->>'weight_grams','')::numeric, (sale_item->>'unit_price')::numeric, nullif(sale_item->>'price_per_kg','')::numeric, (sale_item->>'total')::numeric);
    if sale_item->>'product_type' = 'grocery' then
      update products set stock_quantity = stock_quantity - (sale_item->>'quantity')::numeric, updated_at = now() where id = sale_item->>'product_id' and active and stock_quantity >= (sale_item->>'quantity')::numeric;
      if not found then raise exception 'Insufficient stock'; end if;
      insert into stock_movements(id, product_id, product_name, movement_type, quantity, reference_id, reference_number, created_by_user_id) values (item_id || '-movement', sale_item->>'product_id', sale_item->>'product_name', 'sale', -(sale_item->>'quantity')::numeric, sale_payload->>'id', sale_payload->>'invoice_number', auth.uid());
    end if;
  end loop;
  return sale_payload;
end;
$$;

do $$ declare table_name text; begin
  foreach table_name in array array['chicken_cuts','chicken_price_history','products','sales','sale_items','expenses','customers','customer_payments','suppliers','supplier_payments','purchases','purchase_items','stock_movements','business_settings'] loop
    execute format('alter table %I enable row level security', table_name);
    execute format('drop policy if exists authenticated_all on %I', table_name);
  end loop;
end $$;

drop policy if exists profiles_read_own on profiles; create policy profiles_read_own on profiles for select to authenticated using (id = auth.uid() or public.is_admin());
drop policy if exists profiles_admin_insert on profiles; create policy profiles_admin_insert on profiles for insert to authenticated with check (public.is_admin() and role = 'cashier');
drop policy if exists profiles_admin_update on profiles; create policy profiles_admin_update on profiles for update to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists cuts_read on chicken_cuts; create policy cuts_read on chicken_cuts for select to authenticated using (public.is_active_user() and (active or public.is_admin()));
drop policy if exists cuts_admin_write on chicken_cuts; create policy cuts_admin_write on chicken_cuts for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists history_admin on chicken_price_history; create policy history_admin on chicken_price_history for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists products_read on products; create policy products_read on products for select to authenticated using (public.is_active_user() and (active or public.is_admin()));
drop policy if exists products_admin_write on products; create policy products_admin_write on products for all to authenticated using (public.is_admin()) with check (public.is_admin());

drop policy if exists sales_insert on sales; create policy sales_insert on sales for insert to authenticated with check (public.is_active_user() and cashier_user_id = auth.uid());
drop policy if exists sales_read on sales; create policy sales_read on sales for select to authenticated using (public.is_admin() or (public.is_active_user() and cashier_user_id = auth.uid()));
drop policy if exists sales_admin_update on sales; create policy sales_admin_update on sales for update to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists sales_admin_delete on sales; create policy sales_admin_delete on sales for delete to authenticated using (public.is_admin());
drop policy if exists sale_items_insert on sale_items; create policy sale_items_insert on sale_items for insert to authenticated with check (exists (select 1 from sales where sales.id = sale_id and sales.cashier_user_id = auth.uid()));
drop policy if exists sale_items_read on sale_items; create policy sale_items_read on sale_items for select to authenticated using (public.is_admin() or exists (select 1 from sales where sales.id = sale_id and sales.cashier_user_id = auth.uid()));

drop policy if exists customers_read on customers; create policy customers_read on customers for select to authenticated using (public.is_active_user());
drop policy if exists customers_cashier_write on customers; create policy customers_cashier_write on customers for insert to authenticated with check (public.is_active_user());
drop policy if exists customers_update on customers; create policy customers_update on customers for update to authenticated using (public.is_active_user()) with check (public.is_active_user());
drop policy if exists customer_payments_admin on customer_payments; create policy customer_payments_admin on customer_payments for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists admin_expenses on expenses; create policy admin_expenses on expenses for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists admin_suppliers on suppliers; create policy admin_suppliers on suppliers for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists admin_supplier_payments on supplier_payments; create policy admin_supplier_payments on supplier_payments for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists admin_purchases on purchases; create policy admin_purchases on purchases for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists admin_purchase_items on purchase_items; create policy admin_purchase_items on purchase_items for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists admin_stock_movements on stock_movements; create policy admin_stock_movements on stock_movements for all to authenticated using (public.is_admin()) with check (public.is_admin());
drop policy if exists settings_read on business_settings; create policy settings_read on business_settings for select to authenticated using (public.is_active_user());
drop policy if exists settings_admin_write on business_settings; create policy settings_admin_write on business_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

create index if not exists sales_cashier_user_idx on sales(cashier_user_id);