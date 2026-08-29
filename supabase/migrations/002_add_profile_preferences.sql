-- ============================================================
-- VANTAGE — Migration 002: Add Profile Preferences
-- Adds timezone and brief_delivery_time to the profiles table.
-- Run this in Supabase SQL Editor after 001_initial_schema.sql.
-- ============================================================

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS timezone text,
  ADD COLUMN IF NOT EXISTS brief_delivery_time text;
