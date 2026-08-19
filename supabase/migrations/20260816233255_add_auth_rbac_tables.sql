/*
# Add Authentication, RBAC, and Staff Membership Tables

## Overview
Adds auth/RBAC infrastructure: restaurant_users (auth user → restaurant + role),
platform_users (Super Admin), and helper functions for authorization checks.

## New Tables
1. `platform_users` — Marks auth users as platform-level Super Admins.
2. `restaurant_users` — Maps auth users to a restaurant with a role.

## New Functions
1. `is_super_admin()` — true if current user is in platform_users.
2. `get_user_restaurant_id()` — returns restaurant_id for current user.
3. `get_user_role()` — returns role for current user.
4. `is_staff_member(p_restaurant_id)` — true if user has active membership at restaurant.

## Security
- platform_users: only self-read and super-admin read; no frontend INSERT/UPDATE/DELETE.
- restaurant_users: self-read + Owner/Manager read for their restaurant; Owner-only write.
*/

-- =========================================================
-- 1. PLATFORM_USERS (must exist before is_super_admin function)
-- =========================================================
CREATE TABLE IF NOT EXISTS platform_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE platform_users ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- 2. RESTAURANT_USERS
-- =========================================================
CREATE TABLE IF NOT EXISTS restaurant_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'Staff',
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (user_id, restaurant_id)
);

ALTER TABLE restaurant_users ENABLE ROW LEVEL SECURITY;

-- =========================================================
-- 3. HELPER FUNCTIONS (tables exist now, safe to create)
-- =========================================================
CREATE OR REPLACE FUNCTION is_super_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM platform_users WHERE user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION get_user_restaurant_id()
RETURNS uuid
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT restaurant_id FROM restaurant_users
  WHERE user_id = auth.uid() AND is_active
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM restaurant_users
  WHERE user_id = auth.uid() AND is_active
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION is_staff_member(p_restaurant_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM restaurant_users
    WHERE user_id = auth.uid()
      AND restaurant_id = p_restaurant_id
      AND is_active
  );
$$;

-- =========================================================
-- 4. RLS POLICIES
-- =========================================================

-- platform_users: self-read + super-admin read only
DROP POLICY IF EXISTS "select_platform_users" ON platform_users;
CREATE POLICY "select_platform_users" ON platform_users FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR is_super_admin());

-- restaurant_users: self-read, Owner/Manager read all for their restaurant
DROP POLICY IF EXISTS "select_own_restaurant_users" ON restaurant_users;
CREATE POLICY "select_own_restaurant_users" ON restaurant_users FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR (
      is_active
      AND restaurant_id IN (
        SELECT ru.restaurant_id FROM restaurant_users ru
        WHERE ru.user_id = auth.uid() AND ru.is_active AND ru.role IN ('Owner', 'Manager')
      )
    )
    OR is_super_admin()
  );

-- INSERT: only Owner of the restaurant
DROP POLICY IF EXISTS "insert_restaurant_users" ON restaurant_users;
CREATE POLICY "insert_restaurant_users" ON restaurant_users FOR INSERT
  TO authenticated
  WITH CHECK (
    restaurant_id IN (
      SELECT ru.restaurant_id FROM restaurant_users ru
      WHERE ru.user_id = auth.uid() AND ru.is_active AND ru.role = 'Owner'
    )
    OR is_super_admin()
  );

-- UPDATE: only Owner
DROP POLICY IF EXISTS "update_restaurant_users" ON restaurant_users;
CREATE POLICY "update_restaurant_users" ON restaurant_users FOR UPDATE
  TO authenticated
  USING (
    restaurant_id IN (
      SELECT ru.restaurant_id FROM restaurant_users ru
      WHERE ru.user_id = auth.uid() AND ru.is_active AND ru.role = 'Owner'
    )
    OR is_super_admin()
  )
  WITH CHECK (
    restaurant_id IN (
      SELECT ru.restaurant_id FROM restaurant_users ru
      WHERE ru.user_id = auth.uid() AND ru.is_active AND ru.role = 'Owner'
    )
    OR is_super_admin()
  );

-- DELETE: only Owner
DROP POLICY IF EXISTS "delete_restaurant_users" ON restaurant_users;
CREATE POLICY "delete_restaurant_users" ON restaurant_users FOR DELETE
  TO authenticated
  USING (
    restaurant_id IN (
      SELECT ru.restaurant_id FROM restaurant_users ru
      WHERE ru.user_id = auth.uid() AND ru.is_active AND ru.role = 'Owner'
    )
    OR is_super_admin()
  );

-- =========================================================
-- 5. INDEXES
-- =========================================================
CREATE INDEX IF NOT EXISTS idx_restaurant_users_user ON restaurant_users(user_id);
CREATE INDEX IF NOT EXISTS idx_restaurant_users_restaurant ON restaurant_users(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_platform_users_user ON platform_users(user_id);

-- =========================================================
-- 6. UPDATED_AT TRIGGER
-- =========================================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_restaurant_users_updated_at ON restaurant_users;
CREATE TRIGGER trigger_restaurant_users_updated_at
  BEFORE UPDATE ON restaurant_users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at();
