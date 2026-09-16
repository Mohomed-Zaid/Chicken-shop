-- 005_subscription_system.sql
-- 30-Day Subscription and License System

create table if not exists subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id text not null default 'default-business',
  business_name text not null default 'Chicken Kade & Grocery',
  plan text not null default '30_days',
  start_date timestamptz not null default now(),
  expiry_date timestamptz not null default (now() + interval '30 days'),
  status text not null default 'active' check (status in ('active', 'expired', 'suspended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists subscription_history (
  id uuid primary key default gen_random_uuid(),
  subscription_id uuid references subscriptions(id) on delete cascade,
  action text not null check (action in ('activated', 'renewed', 'suspended', 'reactivated')),
  old_start_date timestamptz,
  old_expiry_date timestamptz,
  new_start_date timestamptz,
  new_expiry_date timestamptz,
  performed_by text,
  created_at timestamptz not null default now()
);

create index if not exists subscriptions_business_idx on subscriptions(business_id);
create index if not exists subscription_history_sub_idx on subscription_history(subscription_id);

-- Initialize default 30-day active subscription if none exists
do $$
declare
  v_sub_id uuid;
begin
  if not exists (select 1 from public.subscriptions where business_id = 'default-business') then
    insert into public.subscriptions (
      business_id,
      business_name,
      plan,
      start_date,
      expiry_date,
      status
    ) values (
      'default-business',
      'Chicken Kade & Grocery',
      '30_days',
      now(),
      now() + interval '30 days',
      'active'
    ) returning id into v_sub_id;

    insert into public.subscription_history (
      subscription_id,
      action,
      old_start_date,
      old_expiry_date,
      new_start_date,
      new_expiry_date,
      performed_by
    ) values (
      v_sub_id,
      'activated',
      null,
      null,
      now(),
      now() + interval '30 days',
      'system-init'
    );
  end if;
end $$;

-- Server time function
create or replace function public.get_server_time()
returns timestamptz
language sql
stable
security definer
set search_path = public
as $$
  select now();
$$;

-- Authoritative check whether subscription is active
create or replace function public.is_subscription_active(p_business_id text default 'default-business')
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_active boolean;
begin
  select (status = 'active' and expiry_date > now()) into v_active
  from public.subscriptions
  where business_id = p_business_id
  order by created_at desc
  limit 1;

  return coalesce(v_active, false);
end;
$$;

-- Server-authoritative subscription status retriever
create or replace function public.get_current_subscription(p_business_id text default 'default-business')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.subscriptions%rowtype;
  v_server_now timestamptz := now();
  v_effective_status text;
  v_is_active boolean;
  v_days_remaining int;
  v_seconds_remaining bigint;
begin
  select * into v_sub
  from public.subscriptions
  where business_id = p_business_id
  order by created_at desc
  limit 1;

  if not found then
    -- Create default 30-day subscription automatically if none found
    insert into public.subscriptions (
      business_id, business_name, plan, start_date, expiry_date, status
    ) values (
      p_business_id, 'Chicken Kade & Grocery', '30_days', v_server_now, v_server_now + interval '30 days', 'active'
    ) returning * into v_sub;

    insert into public.subscription_history (
      subscription_id, action, new_start_date, new_expiry_date, performed_by
    ) values (
      v_sub.id, 'activated', v_sub.start_date, v_sub.expiry_date, 'system-init'
    );
  end if;

  if v_sub.status = 'suspended' then
    v_effective_status := 'suspended';
    v_is_active := false;
  elsif v_sub.expiry_date <= v_server_now then
    v_effective_status := 'expired';
    v_is_active := false;
  else
    v_effective_status := 'active';
    v_is_active := true;
  end if;

  v_seconds_remaining := greatest(0::bigint, floor(extract(epoch from (v_sub.expiry_date - v_server_now)))::bigint);
  v_days_remaining := greatest(0, ceil(extract(epoch from (v_sub.expiry_date - v_server_now)) / 86400.0)::int);

  return jsonb_build_object(
    'id', v_sub.id,
    'business_id', v_sub.business_id,
    'business_name', v_sub.business_name,
    'plan', v_sub.plan,
    'start_date', v_sub.start_date,
    'expiry_date', v_sub.expiry_date,
    'stored_status', v_sub.status,
    'effective_status', v_effective_status,
    'is_active', v_is_active,
    'server_time', v_server_now,
    'days_remaining', v_days_remaining,
    'seconds_remaining', v_seconds_remaining,
    'created_at', v_sub.created_at,
    'updated_at', v_sub.updated_at
  );
end;
$$;

-- Activate a new subscription period (Admin operation)
create or replace function public.activate_subscription(
  p_business_id text default 'default-business',
  p_business_name text default 'Chicken Kade & Grocery',
  p_plan text default '30_days',
  p_duration_days int default 30
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.subscriptions%rowtype;
  v_server_now timestamptz := now();
  v_old_start timestamptz;
  v_old_expiry timestamptz;
  v_new_expiry timestamptz := v_server_now + (p_duration_days || ' days')::interval;
  v_user_identifier text := coalesce(auth.uid()::text, 'admin');
begin
  select * into v_sub from public.subscriptions where business_id = p_business_id order by created_at desc limit 1;

  if found then
    v_old_start := v_sub.start_date;
    v_old_expiry := v_sub.expiry_date;

    update public.subscriptions
    set business_name = coalesce(p_business_name, v_sub.business_name),
        plan = coalesce(p_plan, v_sub.plan),
        start_date = v_server_now,
        expiry_date = v_new_expiry,
        status = 'active',
        updated_at = v_server_now
    where id = v_sub.id
    returning * into v_sub;
  else
    insert into public.subscriptions (
      business_id, business_name, plan, start_date, expiry_date, status, created_at, updated_at
    ) values (
      p_business_id, p_business_name, p_plan, v_server_now, v_new_expiry, 'active', v_server_now, v_server_now
    ) returning * into v_sub;
  end if;

  insert into public.subscription_history (
    subscription_id, action, old_start_date, old_expiry_date, new_start_date, new_expiry_date, performed_by
  ) values (
    v_sub.id, 'activated', v_old_start, v_old_expiry, v_sub.start_date, v_sub.expiry_date, v_user_identifier
  );

  return public.get_current_subscription(p_business_id);
end;
$$;

-- Renew subscription (Preserves remaining days if active; starts from now if expired)
create or replace function public.renew_subscription(
  p_business_id text default 'default-business',
  p_duration_days int default 30
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.subscriptions%rowtype;
  v_server_now timestamptz := now();
  v_old_start timestamptz;
  v_old_expiry timestamptz;
  v_new_start timestamptz;
  v_new_expiry timestamptz;
  v_user_identifier text := coalesce(auth.uid()::text, 'admin');
begin
  select * into v_sub from public.subscriptions where business_id = p_business_id order by created_at desc limit 1;

  if not found then
    return public.activate_subscription(p_business_id, 'Chicken Kade & Grocery', '30_days', p_duration_days);
  end if;

  v_old_start := v_sub.start_date;
  v_old_expiry := v_sub.expiry_date;

  -- If current subscription is still active and valid, add duration from current expiry_date
  if v_sub.status = 'active' and v_sub.expiry_date > v_server_now then
    v_new_start := v_sub.start_date;
    v_new_expiry := v_sub.expiry_date + (p_duration_days || ' days')::interval;
  else
    -- Expired or suspended: start fresh 30-day period from current server time
    v_new_start := v_server_now;
    v_new_expiry := v_server_now + (p_duration_days || ' days')::interval;
  end if;

  update public.subscriptions
  set start_date = v_new_start,
      expiry_date = v_new_expiry,
      status = 'active',
      updated_at = v_server_now
  where id = v_sub.id
  returning * into v_sub;

  insert into public.subscription_history (
    subscription_id, action, old_start_date, old_expiry_date, new_start_date, new_expiry_date, performed_by
  ) values (
    v_sub.id, 'renewed', v_old_start, v_old_expiry, v_new_start, v_new_expiry, v_user_identifier
  );

  return public.get_current_subscription(p_business_id);
end;
$$;

-- Suspend subscription (Admin operation)
create or replace function public.suspend_subscription(
  p_business_id text default 'default-business'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.subscriptions%rowtype;
  v_server_now timestamptz := now();
  v_user_identifier text := coalesce(auth.uid()::text, 'admin');
begin
  select * into v_sub from public.subscriptions where business_id = p_business_id order by created_at desc limit 1;
  if not found then raise exception 'Subscription not found'; end if;

  update public.subscriptions
  set status = 'suspended', updated_at = v_server_now
  where id = v_sub.id
  returning * into v_sub;

  insert into public.subscription_history (
    subscription_id, action, old_start_date, old_expiry_date, new_start_date, new_expiry_date, performed_by
  ) values (
    v_sub.id, 'suspended', v_sub.start_date, v_sub.expiry_date, v_sub.start_date, v_sub.expiry_date, v_user_identifier
  );

  return public.get_current_subscription(p_business_id);
end;
$$;

-- Reactivate subscription (Admin operation)
create or replace function public.reactivate_subscription(
  p_business_id text default 'default-business'
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sub public.subscriptions%rowtype;
  v_server_now timestamptz := now();
  v_new_expiry timestamptz;
  v_user_identifier text := coalesce(auth.uid()::text, 'admin');
begin
  select * into v_sub from public.subscriptions where business_id = p_business_id order by created_at desc limit 1;
  if not found then raise exception 'Subscription not found'; end if;

  if v_sub.expiry_date <= v_server_now then
    v_new_expiry := v_server_now + interval '30 days';
  else
    v_new_expiry := v_sub.expiry_date;
  end if;

  update public.subscriptions
  set status = 'active', expiry_date = v_new_expiry, updated_at = v_server_now
  where id = v_sub.id
  returning * into v_sub;

  insert into public.subscription_history (
    subscription_id, action, old_start_date, old_expiry_date, new_start_date, new_expiry_date, performed_by
  ) values (
    v_sub.id, 'reactivated', v_sub.start_date, v_sub.expiry_date, v_sub.start_date, v_new_expiry, v_user_identifier
  );

  return public.get_current_subscription(p_business_id);
end;
$$;

-- Profiles RLS & Self-healing User Verification
alter table if exists public.profiles enable row level security;
drop policy if exists profiles_read_own on public.profiles;
drop policy if exists profiles_read_all on public.profiles;
drop policy if exists profiles_insert_all on public.profiles;
drop policy if exists profiles_update_own on public.profiles;

create policy profiles_read_all on public.profiles for select to authenticated using (true);
create policy profiles_insert_all on public.profiles for insert to authenticated with check (id = auth.uid() or exists (select 1 from profiles where id = auth.uid() and role = 'admin'));
create policy profiles_update_own on public.profiles for update to authenticated using (id = auth.uid() or exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

-- Resilient user verification
create or replace function public.is_active_user() returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_user_email text;
begin
  if v_uid is null then
    return false;
  end if;

  if exists (select 1 from public.profiles where id = v_uid and active = true) then
    return true;
  end if;

  -- Auto-provision or activate if user is authenticated in Supabase
  select email into v_user_email from auth.users where id = v_uid;
  if found then
    insert into public.profiles (id, full_name, email, role, active)
    values (
      v_uid,
      coalesce(split_part(v_user_email, '@', 1), 'User'),
      v_user_email,
      case when v_user_email in ('zaidn2848@gmail.com', 'chickenkade@gmail.com') then 'admin' else 'cashier' end,
      true
    )
    on conflict (id) do update set active = true, updated_at = now();
    return true;
  end if;

  return false;
end;
$$;

create or replace function public.is_admin() returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_user_email text;
begin
  if v_uid is null then
    return false;
  end if;

  if exists (select 1 from public.profiles where id = v_uid and active = true and role = 'admin') then
    return true;
  end if;

  select email into v_user_email from auth.users where id = v_uid;
  if found and v_user_email in ('zaidn2848@gmail.com', 'chickenkade@gmail.com') then
    insert into public.profiles (id, full_name, email, role, active)
    values (v_uid, split_part(v_user_email, '@', 1), v_user_email, 'admin', true)
    on conflict (id) do update set role = 'admin', active = true, updated_at = now();
    return true;
  end if;

  return false;
end;
$$;

-- Update complete_sale to strictly enforce active subscription at the database level with bulletproof parsing
create or replace function public.complete_sale(sale_payload jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
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
      select * into product_row from products where id = sale_item->>'product_id' for update;
      if not found or not product_row.active then
        raise exception 'Product is unavailable: %', coalesce(sale_item->>'product_name', sale_item->>'product_id');
      end if;
      next_stock := product_row.stock_quantity - coalesce((sale_item->>'quantity')::numeric, 1);
      if next_stock < 0 then
        raise exception 'Insufficient stock for %. Available quantity: %', product_row.name, product_row.stock_quantity;
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

-- Update adjust_stock to verify subscription
create or replace function public.adjust_stock(
  p_product_id text, p_delta numeric, p_movement_type text, p_reason text, p_notes text default '', p_reference_id text default null, p_reference_number text default null
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  product_row products%rowtype;
  next_stock numeric;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if not public.is_subscription_active() then raise exception 'Subscription expired or inactive.'; end if;
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

-- Update receive_purchase_stock to verify subscription
create or replace function public.receive_purchase_stock(
  p_product_id text, p_quantity numeric, p_reference_id text, p_reference_number text, p_reason text default 'Completed purchase'
) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  product_row products%rowtype;
  next_stock numeric;
begin
  if not public.is_admin() then raise exception 'Administrator access required'; end if;
  if not public.is_subscription_active() then raise exception 'Subscription expired or inactive.'; end if;
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

-- Row Level Security for subscriptions & subscription_history
alter table subscriptions enable row level security;
alter table subscription_history enable row level security;

drop policy if exists subscriptions_read on subscriptions;
create policy subscriptions_read on subscriptions for select to authenticated using (true);

drop policy if exists subscription_history_read on subscription_history;
create policy subscription_history_read on subscription_history for select to authenticated using (true);

revoke insert, update, delete on subscriptions from authenticated;
revoke insert, update, delete on subscription_history from authenticated;

