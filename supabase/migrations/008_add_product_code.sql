-- Migration 008: Add code column to products table
-- Allows products to have sequential codes starting from 100 onwards

alter table if exists public.products
  add column if not exists code text;

-- Create index on product code for quick lookups
create index if not exists idx_products_code on public.products(code);
