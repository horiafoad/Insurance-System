-- Rollback script for claims replacement 2026-10-25T12-06-03
-- Generated from a live backup of https://epfppicdvkklzryworzu.supabase.co
-- WARNING: this removes all current claims and restores the backed-up rows.

BEGIN;
DELETE FROM public.claim_installments;
DELETE FROM public.claims;
COMMIT;
