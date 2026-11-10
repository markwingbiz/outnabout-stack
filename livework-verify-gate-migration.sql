-- ============================================================
-- Bownd venue verification gate — v1 (manual operator review)
--
-- Run this in the Supabase SQL editor (project outnabout-stack)
-- BEFORE deploying the verify-gate patch. It is safe to re-run:
-- every statement is idempotent.
--
-- What this creates:
--   1. verification_status (+ verified_at/by/method/note) on venues.
--      Default 'unverified' — fail-closed: nothing publishes until
--      the operator reviews it. is_test rows are EXEMPT in the
--      sync gate (operator test data, never public).
--   2. A protection trigger: tenants CANNOT grant themselves
--      verification. They may only move their own venue from
--      'unverified'/'rejected' into 'pending_review' (request review).
--      All other verification changes are operator-only.
--   3. review_venue_verification() — operator approve/reject RPC
--      (SECURITY DEFINER: works across tenants, RLS-bypassed,
--      writes a forge_audit_log row).
--   4. list_pending_venue_verifications() — operator review queue.
--
-- v2 phone codes slot in later by writing the same columns with
-- verification_method='phone_code' — the gate reads STATUS only,
-- so no schema change is needed then.
-- ============================================================

-- 1) Columns ---------------------------------------------------
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS verification_status text NOT NULL DEFAULT 'unverified',
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS verified_by uuid,
  ADD COLUMN IF NOT EXISTS verification_method text,
  ADD COLUMN IF NOT EXISTS verification_note text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'venues_verification_status_check'
  ) THEN
    ALTER TABLE public.venues
      ADD CONSTRAINT venues_verification_status_check
      CHECK (verification_status IN ('unverified','pending_review','verified','rejected'));
  END IF;
END $$;

-- 2) Protection trigger -----------------------------------------
-- A venue owner who could UPDATE verification_status='verified' on
-- their own row would make the whole gate theater. This trigger
-- rejects every verification change that is not operator-made,
-- except the single harmless move into the review queue.
CREATE OR REPLACE FUNCTION public.protect_venue_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid;
  is_op boolean;
  protected_touched boolean;
BEGIN
  caller := auth.uid();
  is_op := public.is_forge_operator(caller);

  protected_touched :=
       OLD.verification_status    IS DISTINCT FROM NEW.verification_status
    OR OLD.verified_at            IS DISTINCT FROM NEW.verified_at
    OR OLD.verified_by            IS DISTINCT FROM NEW.verified_by
    OR OLD.verification_method    IS DISTINCT FROM NEW.verification_method
    OR OLD.verification_note      IS DISTINCT FROM NEW.verification_note;

  IF NOT protected_touched THEN
    RETURN NEW; -- ordinary venue edit (name, hours, ...) — allowed.
  END IF;

  -- Edge Functions (service role) bypass.
  IF (SELECT (current_setting('request.jwt.claims', true)::jsonb ->> 'role')) = 'service_role' THEN
    RETURN NEW;
  END IF;

  -- Operators approve/reject through the review RPC below.
  IF is_op THEN
    RETURN NEW;
  END IF;

  -- Tenant members: the ONLY allowed self-move is into the queue.
  IF OLD.verification_status IN ('unverified','rejected')
     AND NEW.verification_status = 'pending_review'
     AND OLD.verified_at         IS NOT DISTINCT FROM NEW.verified_at
     AND OLD.verified_by         IS NOT DISTINCT FROM NEW.verified_by
     AND OLD.verification_method IS NOT DISTINCT FROM NEW.verification_method
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'venue verification can only be changed by the operator';
END;
$$;

DROP TRIGGER IF EXISTS venues_verification_protect ON public.venues;
CREATE TRIGGER venues_verification_protect
  BEFORE UPDATE ON public.venues
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_venue_verification();

-- 3) Operator review RPC -----------------------------------------
-- Approve or reject a pending venue. Operator-only (forge_operator or
-- admin). Writes an audit row. verification_method is stored so v2
-- (phone_code) can sit in the same column later.
CREATE OR REPLACE FUNCTION public.review_venue_verification(
  p_venue_id uuid,
  p_approve boolean,
  p_note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_old text;
  v_new text;
BEGIN
  IF NOT public.is_forge_operator(auth.uid()) THEN
    RAISE EXCEPTION 'only the operator can review venue verification';
  END IF;

  SELECT verification_status INTO v_old
    FROM public.venues WHERE id = p_venue_id;
  IF v_old IS NULL THEN
    RAISE EXCEPTION 'venue not found';
  END IF;

  v_new := CASE WHEN p_approve THEN 'verified' ELSE 'rejected' END;

  UPDATE public.venues
     SET verification_status = v_new,
         verified_at         = CASE WHEN p_approve THEN now() ELSE NULL END,
         verified_by         = CASE WHEN p_approve THEN auth.uid() ELSE NULL END,
         verification_method = CASE WHEN p_approve THEN 'manual_review' ELSE NULL END,
         verification_note   = p_note,
         updated_at          = now()
   WHERE id = p_venue_id;

  INSERT INTO public.forge_audit_log
    (actor_user_id, action, entity_type, entity_id, before, after, metadata)
  VALUES
    (auth.uid(), 'venue.verification.review', 'venue', p_venue_id::text,
     jsonb_build_object('status', v_old),
     jsonb_build_object('status', v_new, 'note', p_note),
     jsonb_build_object('method', 'manual_review'));

  RETURN jsonb_build_object('ok', true, 'status', v_new);
END;
$$;

-- 4) Operator review queue ----------------------------------------
-- Pending reviews across ALL tenants (SECURITY DEFINER bypasses the
-- tenant-scoped SELECT so the operator sees every claim — including
-- impersonation attempts of well-known venues).
CREATE OR REPLACE FUNCTION public.list_pending_venue_verifications()
RETURNS TABLE (
  id uuid, name text, address text, city text, state text,
  phone text, website text, tenant_id uuid,
  verification_status text, created_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_forge_operator(auth.uid()) THEN
    RAISE EXCEPTION 'only the operator can list pending verifications';
  END IF;
  RETURN QUERY
    SELECT v.id, v.name, v.address, v.city, v.state,
           v.phone, v.website, v.tenant_id,
           v.verification_status, v.created_at
      FROM public.venues v
     WHERE v.verification_status = 'pending_review'
     ORDER BY v.created_at ASC;
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_venue_verification(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_pending_venue_verifications() TO authenticated;

-- Sanity check (run me last, read the output):
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name = 'venues' AND column_name LIKE 'verif%';
