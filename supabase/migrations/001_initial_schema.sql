create sequence if not exists invoice_number_seq;
create sequence if not exists purchase_number_seq;

create table if not exists chicken_cuts (
  id text primary key, name text not null, price_per_kg numeric(12,2) not null default 0,
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists chicken_price_history (
  id text primary key, chicken_cut_id text references chicken_cuts(id), old_price numeric(12,2), new_price numeric(12,2) not null,
  changed_at timestamptz not null default now()
);
create table if not exists products (
  id text primary key, name text not null, category text, barcode text unique, cost_price numeric(12,2) not null default 0,
  selling_price numeric(12,2) not null default 0, stock_quantity numeric(12,3) not null default 0,
  low_stock_level numeric(12,3) not null default 0, unit text, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists customers (
  id text primary key, name text not null, phone text, address text, credit_limit numeric(12,2) not null default 0,
  opening_balance numeric(12,2) not null default 0, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists suppliers (
  id text primary key, name text not null, phone text, address text, email text, opening_balance numeric(12,2) not null default 0,
  active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists business_settings (
  id text primary key, business_name text, address text, phone text, email text, footer_message text,
  show_customer boolean not null default true, show_cashier boolean not null default true,
  show_payment_method boolean not null default true, auto_print_receipt boolean not null default false,
  updated_at timestamptz not null default now()
);
create table if not exists sales (
  id text primary key, invoice_number text unique not null, sold_at timestamptz not null, cashier text,
  customer_id text, customer_name text, subtotal numeric(12,2) not null default 0, discount numeric(12,2) not null default 0,
  tax numeric(12,2) not null default 0, service numeric(12,2) not null default 0, total numeric(12,2) not null default 0,
  payment_method text not null check (payment_method in ('Cash','Card','Other')), amount_received numeric(12,2) not null default 0,
  change numeric(12,2) not null default 0, status text not null default 'completed' check (status in ('completed','cancelled')),
  created_at timestamptz not null default now()
);
create table if not exists sale_items (
  id text primary key, sale_id text not null references sales(id) on delete cascade, product_type text not null check (product_type in ('chicken','grocery')),
  product_id text, product_name text not null, quantity numeric(12,3) not null default 1, weight_grams numeric(12,3),
  unit_price numeric(12,2) not null default 0, price_per_kg numeric(12,2), total numeric(12,2) not null default 0, created_at timestamptz not null default now()
);
create table if not exists expenses (
  id text primary key, expense_date date not null, expense_time time, category text not null, description text,
  amount numeric(12,2) not null, payment_method text, created_by text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists customer_payments (
  id text primary key, customer_id text not null references customers(id), payment_date date not null, payment_time time,
  amount numeric(12,2) not null, payment_method text, notes text, created_at timestamptz not null default now()
);
create table if not exists purchases (
  id text primary key, purchase_number text unique not null, supplier_id text references suppliers(id), supplier_name text,
  purchased_at timestamptz not null, subtotal numeric(12,2) not null default 0, discount numeric(12,2) not null default 0,
  total numeric(12,2) not null default 0, payment_method text, amount_paid numeric(12,2) not null default 0,
  balance_due numeric(12,2) not null default 0, status text not null default 'completed' check (status in ('completed','cancelled')), created_at timestamptz not null default now()
);
create table if not exists purchase_items (
  id text primary key, purchase_id text not null references purchases(id) on delete cascade, product_id text not null references products(id),
  product_name text not null, quantity numeric(12,3) not null, cost_price numeric(12,2) not null, total numeric(12,2) not null, created_at timestamptz not null default now()
);
create table if not exists supplier_payments (
  id text primary key, supplier_id text not null references suppliers(id), payment_date date not null, payment_time time,
  amount numeric(12,2) not null, payment_method text, notes text, created_at timestamptz not null default now()
);
create table if not exists stock_movements (
  id text primary key, product_id text not null references products(id), product_name text, movement_type text not null check (movement_type in ('purchase','sale','adjustment','return')),
  quantity numeric(12,3) not null, reference_id text, reference_number text, movement_date timestamptz not null default now(), created_at timestamptz not null default now()
);

create or replace function next_invoice_number() returns text language plpgsql security invoker as $$ begin return 'INV-' || lpad(nextval('invoice_number_seq')::text, 6, '0'); end $$;
create or replace function next_purchase_number() returns text language plpgsql security invoker as $$ begin return 'PUR-' || lpad(nextval('purchase_number_seq')::text, 6, '0'); end $$;
create or replace function sync_invoice_number_sequence(last_value bigint) returns void language plpgsql security invoker as $$ begin if last_value > 0 then perform setval('invoice_number_seq', last_value, true); else perform setval('invoice_number_seq', 1, false); end if; end $$;
create or replace function sync_purchase_number_sequence(last_value bigint) returns void language plpgsql security invoker as $$ begin if last_value > 0 then perform setval('purchase_number_seq', last_value, true); else perform setval('purchase_number_seq', 1, false); end if; end $$;

create or replace function complete_sale(sale_payload jsonb) returns jsonb language plpgsql security invoker as $$
declare sale_item jsonb; item_id text; begin
  insert into sales(id, invoice_number, sold_at, cashier, customer_name, subtotal, discount, tax, service, total, payment_method, amount_received, change, status)
  values (sale_payload->>'id', sale_payload->>'invoice_number', (sale_payload->>'sold_at')::timestamptz, sale_payload->>'cashier', sale_payload->>'customer_name', (sale_payload->>'subtotal')::numeric, (sale_payload->>'discount')::numeric, (sale_payload->>'tax')::numeric, (sale_payload->>'service')::numeric, (sale_payload->>'total')::numeric, sale_payload->>'payment_method', (sale_payload->>'amount_received')::numeric, (sale_payload->>'change')::numeric, sale_payload->>'status');
  for sale_item in select * from jsonb_array_elements(sale_payload->'items') loop
    item_id := sale_payload->>'id' || '-item-' || (sale_item->>'product_id');
    insert into sale_items(id, sale_id, product_type, product_id, product_name, quantity, weight_grams, unit_price, price_per_kg, total)
    values (item_id, sale_payload->>'id', sale_item->>'product_type', sale_item->>'product_id', sale_item->>'product_name', (sale_item->>'quantity')::numeric, nullif(sale_item->>'weight_grams','')::numeric, (sale_item->>'unit_price')::numeric, nullif(sale_item->>'price_per_kg','')::numeric, (sale_item->>'total')::numeric);
    if sale_item->>'product_type' = 'grocery' then
      update products set stock_quantity = stock_quantity - (sale_item->>'quantity')::numeric, updated_at = now() where id = sale_item->>'product_id' and stock_quantity >= (sale_item->>'quantity')::numeric;
      if not found then raise exception 'Insufficient stock'; end if;
      insert into stock_movements(id, product_id, product_name, movement_type, quantity, reference_id, reference_number) values (item_id || '-movement', sale_item->>'product_id', sale_item->>'product_name', 'sale', -(sale_item->>'quantity')::numeric, sale_payload->>'id', sale_payload->>'invoice_number');
    end if;
  end loop;
  return sale_payload;
end $$;

create index if not exists sales_sold_at_idx on sales(sold_at); create index if not exists sales_invoice_idx on sales(invoice_number); create index if not exists sales_customer_idx on sales(customer_id);
create index if not exists sale_items_sale_idx on sale_items(sale_id); create index if not exists products_barcode_idx on products(barcode); create index if not exists products_name_idx on products(name);
create index if not exists customers_phone_idx on customers(phone); create index if not exists customers_name_idx on customers(name); create index if not exists customer_payments_customer_idx on customer_payments(customer_id);
create index if not exists suppliers_name_idx on suppliers(name); create index if not exists purchases_purchased_at_idx on purchases(purchased_at); create index if not exists purchases_supplier_idx on purchases(supplier_id);
create index if not exists purchase_items_purchase_idx on purchase_items(purchase_id); create index if not exists stock_movements_product_idx on stock_movements(product_id); create index if not exists stock_movements_date_idx on stock_movements(movement_date);

alter table chicken_cuts enable row level security; alter table chicken_price_history enable row level security; alter table products enable row level security;
alter table sales enable row level security; alter table sale_items enable row level security; alter table expenses enable row level security;
alter table customers enable row level security; alter table customer_payments enable row level security; alter table suppliers enable row level security;
alter table supplier_payments enable row level security; alter table purchases enable row level security; alter table purchase_items enable row level security;
alter table stock_movements enable row level security; alter table business_settings enable row level security;

do $$ declare table_name text; begin foreach table_name in array array['chicken_cuts','chicken_price_history','products','sales','sale_items','expenses','customers','customer_payments','suppliers','supplier_payments','purchases','purchase_items','stock_movements','business_settings'] loop execute format('drop policy if exists authenticated_all on %I', table_name); execute format('create policy authenticated_all on %I for all to authenticated using (true) with check (true)', table_name); end loop; end $$;
