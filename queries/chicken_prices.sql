-- ==============================================================================
-- NEON SQL QUERIES: DAILY CHICKEN PRICES & TYPES
-- Run these queries directly in Neon Console -> SQL Editor
-- ==============================================================================

-- 1. VIEW ALL CHICKEN TYPES & PRICES (ORDERED BY CODE)
SELECT 
  code, 
  name, 
  price_per_kg AS "Retail Price (Rs/kg)", 
  wholesale_price_per_kg AS "Wholesale Price (Rs/kg)", 
  active
FROM chicken_cuts
ORDER BY CAST(NULLIF(regexp_replace(code, '\D', '', 'g'), '') AS integer) ASC;


-- 2. ADD A SINGLE NEW CHICKEN TYPE
INSERT INTO chicken_cuts (code, name, price_per_kg, wholesale_price_per_kg, active)
VALUES ('33', 'Chicken Curry Cut', 1450.00, 1350.00, true);


-- 3. ADD MULTIPLE CHICKEN TYPES AT ONCE (BATCH INSERT)
INSERT INTO chicken_cuts (code, name, price_per_kg, wholesale_price_per_kg, active)
VALUES 
  ('34', 'Chicken Boneless', 1800.00, 1700.00, true),
  ('35', 'Chicken Lollipop', 1650.00, 1550.00, true),
  ('36', 'Chicken Keema',    1600.00, 1500.00, true),
  ('37', 'Chicken Tikka',    1900.00, 1800.00, true);


-- 4. UPDATE TODAY'S DAILY PRICE FOR AN EXISTING CHICKEN
UPDATE chicken_cuts
SET 
  price_per_kg = 1500.00,
  wholesale_price_per_kg = 1400.00,
  updated_at = now()
WHERE code = '33';


-- 5. DEACTIVATE OR ACTIVATE A CHICKEN ITEM
-- Deactivate (hides it from the POS cashier):
UPDATE chicken_cuts SET active = false, updated_at = now() WHERE code = '33';

-- Reactivate:
UPDATE chicken_cuts SET active = true, updated_at = now() WHERE code = '33';


-- 6. DELETE A CHICKEN CUT PERMANENTLY
DELETE FROM chicken_cuts WHERE code = '33';
