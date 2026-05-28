-- Migration: Add planned_payment_id to transactions table + pp_credit to parents
-- Run this in the Supabase SQL Editor (Dashboard > SQL)

ALTER TABLE transactions ADD COLUMN IF NOT EXISTS planned_payment_id TEXT;
ALTER TABLE parents      ADD COLUMN IF NOT EXISTS pp_credit NUMERIC DEFAULT 0;
