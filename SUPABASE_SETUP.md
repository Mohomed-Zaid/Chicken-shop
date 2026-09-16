# Supabase setup

1. Apply `supabase/migrations/001_initial_schema.sql`, then `002_auth_roles_rls.sql` in the Supabase SQL editor or with the Supabase CLI.
2. In Supabase Authentication, create the first user deliberately with email and password.
3. Confirm that the trigger created a row in `profiles`, then set that row's `role` to `admin` in the SQL editor. Do not put credentials in the application.
4. Copy `.env.example` to `.env.local`, set `VITE_STORAGE_MODE=supabase`, and provide the project URL and publishable key. Never use or commit a `service_role` key.
5. Create additional auth users from Supabase Authentication. The trigger creates them with the `cashier` role; an administrator can activate and manage them in the Users page.

The browser client never receives a service-role key. User creation and password reset requiring the Admin API must be performed through Supabase Authentication tooling or a separately deployed, authenticated server-side function.

## Security verification

Sign in as an admin and a cashier. Confirm that the admin can read and update admin tables, while a cashier can read active products and cuts and complete a sale but receives an RLS error for price, product, expense, supplier, purchase, stock, settings, and completed-sale mutation attempts. Verify that a cashier cannot update `profiles.role` or deactivate the last active administrator.