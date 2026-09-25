-- Migration 014: System Data Reset for Production and Supporting Policies
-- Enables administrators to safely purge test transactions and reset invoice sequences

-- 1. Ensure administrator delete policies exist
drop policy if exists customers_admin_delete on customers;
create policy customers_admin_delete on customers for delete to authenticated using (public.is_admin());

drop policy if exists sale_items_admin_delete on sale_items;
create policy sale_items_admin_delete on sale_items for delete to authenticated using (public.is_admin());

-- 2. Stored RPC function for atomic system data reset
create or replace function public.reset_all_data_for_production(clear_products boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sales_count int;
  v_customers_count int;
  v_purchases_count int;
begin
  -- Require administrator privileges
  if not public.is_admin() then
    raise exception 'Unauthorized: Only administrators can reset business operational data.';
  end if;

  -- 1. Remove sales and sale items
  select count(*) into v_sales_count from sales;
  delete from sale_items;
  delete from sales;

  -- 2. Remove customer ledger and payments
  select count(*) into v_customers_count from customers;
  delete from customer_payments;
  delete from customers;

  -- 3. Remove purchases, suppliers and payments
  select count(*) into v_purchases_count from purchases;
  delete from purchase_items;
  delete from purchases;
  delete from supplier_payments;
  delete from suppliers;

  -- 4. Remove stock movements, expenses, and price history
  delete from stock_movements;
  delete from expenses;
  delete from chicken_price_history;

  -- 5. Optionally remove demo grocery products
  if clear_products then
    delete from products;
  end if;

  -- 6. Reset sequence counters so the first production invoice is INV-000001
  if exists (select 1 from pg_sequences where sequencename = 'invoice_number_seq') then
    perform setval('invoice_number_seq', 1, false);
  end if;

  if exists (select 1 from pg_sequences where sequencename = 'purchase_number_seq') then
    perform setval('purchase_number_seq', 1, false);
  end if;

  return jsonb_build_object(
    'success', true,
    'message', 'System operational data has been successfully reset for production.',
    'sales_cleared', v_sales_count,
    'customers_cleared', v_customers_count,
    'purchases_cleared', v_purchases_count,
    'products_cleared', clear_products
  );
end;
$$;
