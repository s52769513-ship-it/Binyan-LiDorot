-- Migration: Add birth_date to parents table
-- Run this in the Supabase SQL Editor (Dashboard > SQL)

ALTER TABLE parents ADD COLUMN IF NOT EXISTS birth_date DATE;
