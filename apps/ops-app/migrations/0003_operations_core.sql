PRAGMA foreign_keys = ON;

ALTER TABLE intake_submissions ADD COLUMN intake_channel TEXT CHECK (intake_channel IN ('phone', 'visit'));
ALTER TABLE intake_submissions ADD COLUMN contract_version TEXT;
ALTER TABLE intake_submissions ADD COLUMN created_by TEXT REFERENCES app_principals(id);
ALTER TABLE intake_submissions ADD COLUMN reviewed_by TEXT REFERENCES app_principals(id);
ALTER TABLE intake_submissions ADD COLUMN reviewed_at TEXT;

CREATE TABLE placement_status_history (
  sequence_no INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  placement_id TEXT NOT NULL REFERENCES placements(id),
  from_state TEXT,
  to_state TEXT NOT NULL,
  changed_by TEXT NOT NULL REFERENCES app_principals(id),
  changed_at TEXT NOT NULL
);

CREATE TRIGGER placement_status_history_no_update
BEFORE UPDATE ON placement_status_history
BEGIN
  SELECT RAISE(ABORT, 'placement_status_history is append-only');
END;

CREATE TRIGGER placement_status_history_no_delete
BEFORE DELETE ON placement_status_history
BEGIN
  SELECT RAISE(ABORT, 'placement_status_history is append-only');
END;

CREATE TABLE ledger_entries (
  sequence_no INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('introduction-fee', 'daily-membership-fee', 'refund', 'adjustment')),
  placement_id TEXT REFERENCES placements(id),
  fee_transaction_id TEXT REFERENCES fee_transactions(id),
  amount INTEGER NOT NULL,
  occurred_at TEXT NOT NULL,
  recorded_by TEXT NOT NULL REFERENCES app_principals(id),
  retention_expires_at TEXT NOT NULL
);

CREATE TABLE compliance_events (
  id TEXT PRIMARY KEY,
  event_type TEXT NOT NULL,
  occurred_on TEXT NOT NULL,
  due_on TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('mock-open', 'mock-complete', 'original-required')),
  evidence_label TEXT NOT NULL,
  completed_at TEXT,
  completed_by TEXT REFERENCES app_principals(id),
  rule_version TEXT NOT NULL
);

CREATE INDEX intake_submissions_type_status_idx ON intake_submissions(intake_type, status, submitted_at);
CREATE INDEX placement_status_history_idx ON placement_status_history(placement_id, changed_at);
CREATE INDEX ledger_entries_occurred_idx ON ledger_entries(occurred_at, entry_type);
CREATE INDEX ledger_entries_retention_idx ON ledger_entries(retention_expires_at);
CREATE INDEX compliance_events_due_idx ON compliance_events(status, due_on);
