-- =============================================================================
-- Inventory Audit Tables
-- Owner creates audit sessions, locations submit responses
-- =============================================================================

-- Sessions table - Created by owner
CREATE TABLE IF NOT EXISTS inventory_audit_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  name TEXT
);

-- Responses table - Submitted by locations
CREATE TABLE IF NOT EXISTS inventory_audit_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES inventory_audit_sessions(id) ON DELETE CASCADE,
  location_id UUID NOT NULL REFERENCES locations(id),
  product_id UUID NOT NULL REFERENCES products(id),
  status TEXT NOT NULL CHECK (status IN ('confirmed', 'rejected')),
  reported_qty INTEGER, -- Only if rejected
  system_qty_at_submit INTEGER NOT NULL, -- Snapshot when submitted
  comment TEXT,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  submitted_by UUID REFERENCES auth.users(id),
  
  -- Each product can only have one response per session per location
  UNIQUE(session_id, location_id, product_id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_audit_responses_session ON inventory_audit_responses(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_responses_location ON inventory_audit_responses(location_id);

-- =============================================================================
-- RLS Policies
-- =============================================================================

-- Enable RLS
ALTER TABLE inventory_audit_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_audit_responses ENABLE ROW LEVEL SECURITY;

-- Sessions: Owner can create/read, all authenticated can read
CREATE POLICY "Authenticated can read audit sessions"
ON inventory_audit_sessions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert audit sessions"
ON inventory_audit_sessions FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update audit sessions"
ON inventory_audit_sessions FOR UPDATE TO authenticated USING (true);

-- Responses: Authenticated can read/insert
CREATE POLICY "Authenticated can read audit responses"
ON inventory_audit_responses FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert audit responses"
ON inventory_audit_responses FOR INSERT TO authenticated WITH CHECK (true);

-- =============================================================================
-- Verify
-- =============================================================================
SELECT 'inventory_audit_sessions' as table_name, count(*) as rows FROM inventory_audit_sessions
UNION ALL
SELECT 'inventory_audit_responses', count(*) FROM inventory_audit_responses;
