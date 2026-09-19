-- Migration 010: Add discount_price column to products table
-- Allows products to have an optional discounted selling price

alter table if exists public.products
  add column if not exists discount_price numeric;
