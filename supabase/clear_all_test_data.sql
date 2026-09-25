-- ==============================================================================
-- CHICKEN SHOP POS - CLEAR ALL TEST DATA FOR PRODUCTION USE
-- ==============================================================================
-- Run this script in your Supabase SQL Editor to wipe all test / demo data
-- and start fresh for real use in your shop.
--
-- WHAT THIS CLEARS:
--   ✓ All sales transactions and sold line items
--   ✓ All customer accounts and customer credit payments
--   ✓ All purchases, supplier records, and supplier payments
--   ✓ All inventory stock movement history
--   ✓ All shop expense records
--   ✓ All chicken price change history
--   ✓ All demo grocery products
--   ✓ Resets invoice counter sequence back to INV-000001
--   ✓ Resets purchase counter sequence back to PUR-000001
--
-- WHAT THIS PRESERVES (NOT DELETED):
--   ✓ User logins, cashier & administrator accounts (profiles)
--   ✓ Subscriptions and license history
--   ✓ Business settings (store name, phone, address, receipt layout)
--   ✓ Standard chicken cuts (Fresh Chicken, Breast, Legs, Wings, etc.)
-- ==============================================================================

BEGIN;

-- 1. Wipe Sales Transactions & Line Items
TRUNCATE TABLE sale_items CASCADE;
TRUNCATE TABLE sales CASCADE;

-- 2. Wipe Customers & Customer Credit Payments
TRUNCATE TABLE customer_payments CASCADE;
TRUNCATE TABLE customers CASCADE;

-- 3. Wipe Purchases, Suppliers & Supplier Payments
TRUNCATE TABLE purchase_items CASCADE;
TRUNCATE TABLE purchases CASCADE;
TRUNCATE TABLE supplier_payments CASCADE;
TRUNCATE TABLE suppliers CASCADE;

-- 4. Wipe Inventory History, Expenses & Price History
TRUNCATE TABLE stock_movements CASCADE;
TRUNCATE TABLE expenses CASCADE;
TRUNCATE TABLE chicken_price_history CASCADE;

-- 5. Wipe Demo Grocery Products
TRUNCATE TABLE products CASCADE;

-- 6. Reset Sequences to 1 (So next invoice is INV-000001)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_sequences WHERE sequencename = 'invoice_number_seq') THEN
    PERFORM setval('invoice_number_seq', 1, false);
  END IF;

  IF EXISTS (SELECT 1 FROM pg_sequences WHERE sequencename = 'purchase_number_seq') THEN
    PERFORM setval('purchase_number_seq', 1, false);
  END IF;
END $$;

COMMIT;

-- Verify results
SELECT 
  (SELECT count(*) FROM sales) AS sales_count,
  (SELECT count(*) FROM customers) AS customers_count,
  (SELECT count(*) FROM purchases) AS purchases_count,
  (SELECT count(*) FROM products) AS products_count,
  (SELECT count(*) FROM chicken_cuts) AS chicken_cuts_count,
  (SELECT count(*) FROM business_settings) AS business_settings_count,
  (SELECT count(*) FROM profiles) AS user_profiles_count;
