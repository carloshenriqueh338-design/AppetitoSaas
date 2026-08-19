/*
# Add subscription_status column to restaurants

## Overview
Adds a `subscription_status` column to the `restaurants` table so the Super-Admin
dashboard can manage each tenant's subscription state (active, trial, suspended, etc.).

## Security
- No RLS policy changes needed — existing policies already allow full CRUD.
- The column is nullable with a default so existing rows get a sensible value.
*/

ALTER TABLE restaurants
  ADD COLUMN IF NOT EXISTS subscription_status text DEFAULT 'active';

UPDATE restaurants
  SET subscription_status = 'active'
  WHERE subscription_status IS NULL;
