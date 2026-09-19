-- Migration 009: Fix business_settings RLS and permissions
-- Allows authenticated users to view and update business settings without RLS restriction blocks

-- 1. Ensure table exists with all modern columns
create table if not exists public.business_settings (
  id text primary key,
  business_name text,
  address text,
  phone text,
  email text,
  footer_message text,
  show_customer boolean not null default true,
  show_cashier boolean not null default true,
  show_payment_method boolean not null default true,
  auto_print_receipt boolean not null default false,
  updated_at timestamptz not null default now()
);

-- Insert default row if not exists
insert into public.business_settings (
  id, business_name, address, phone, email, footer_message,
  show_customer, show_cashier, show_payment_method, auto_print_receipt
) values (
  'default', 'Chicken Kade & Grocery', '123 Main Street, Colombo, Sri Lanka', '+94 77 726 2600',
  'info@chickenkade.lk', 'Thank you for shopping with us! Please come again.',
  true, true, true, false
) on conflict (id) do nothing;

-- 2. Enable RLS
alter table public.business_settings enable row level security;

-- 3. Drop all previous restrictive policies
drop policy if exists settings_read on public.business_settings;
drop policy if exists settings_admin_write on public.business_settings;
drop policy if exists settings_write on public.business_settings;
drop policy if exists settings_select on public.business_settings;
drop policy if exists settings_insert on public.business_settings;
drop policy if exists settings_update on public.business_settings;
drop policy if exists settings_delete on public.business_settings;
drop policy if exists settings_anon_select on public.business_settings;
drop policy if exists authenticated_all on public.business_settings;

-- 4. Create wide-open authenticated policies for business settings
create policy settings_select on public.business_settings
  for select to authenticated
  using (true);

create policy settings_insert on public.business_settings
  for insert to authenticated
  with check (true);

create policy settings_update on public.business_settings
  for update to authenticated
  using (true)
  with check (true);

create policy settings_delete on public.business_settings
  for delete to authenticated
  using (true);

-- Allow public/anon read for receipts and customer displays if needed
create policy settings_anon_select on public.business_settings
  for select to anon
  using (true);

-- 5. Fix prevent_profile_escalation to permit SQL Editor / migrations (auth.uid() is null)
create or replace function public.prevent_profile_escalation() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Allow direct migrations and database administrator updates via SQL editor
  if auth.uid() is null or current_user in ('postgres', 'supabase_admin') then
    new.updated_at = now();
    return new;
  end if;

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

-- 6. Disable trigger safely during migration and promote admin emails
alter table public.profiles disable trigger protect_profile_changes;

update public.profiles
set role = 'admin', active = true, updated_at = now()
where lower(email) in ('zaidn2848@gmail.com', 'chickenkade@gmail.com');

alter table public.profiles enable trigger protect_profile_changes;
