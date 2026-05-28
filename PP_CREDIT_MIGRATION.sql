-- Migration: Add pp_credit field to parents table
-- Run this in the Supabase SQL Editor (Dashboard > SQL)

ALTER TABLE parents ADD COLUMN IF NOT EXISTS pp_credit NUMERIC DEFAULT 0;
