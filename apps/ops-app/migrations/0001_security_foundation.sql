PRAGMA foreign_keys = ON;

CREATE TABLE app_principals (
  id TEXT PRIMARY KEY,
  access_subject TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'staff', 'system_admin')),
  active INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0, 1)),
  access_review_due_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE restaurants (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  business_number_cipher TEXT,
  address_cipher TEXT,
  verification_status TEXT NOT NULL DEFAULT 'pending',
  retention_category TEXT NOT NULL,
  retention_expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE workers (
  id TEXT PRIMARY KEY,
  display_alias TEXT NOT NULL,
  phone_cipher TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  health_certificate_status TEXT NOT NULL DEFAULT 'not-checked',
  health_certificate_expires_on TEXT,
  retention_category TEXT NOT NULL,
  retention_expires_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE job_requests (
  id TEXT PRIMARY KEY,
  restaurant_id TEXT NOT NULL REFERENCES restaurants(id),
  role TEXT NOT NULL,
  work_date TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  break_minutes INTEGER NOT NULL,
  wage_amount INTEGER NOT NULL,
  wage_unit TEXT NOT NULL,
  verification_status TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE placements (
  id TEXT PRIMARY KEY,
  job_request_id TEXT NOT NULL REFERENCES job_requests(id),
  worker_id TEXT NOT NULL REFERENCES workers(id),
  state TEXT NOT NULL,
  contract_confirmed_at TEXT,
  employed_at TEXT,
  decision_actor_id TEXT NOT NULL REFERENCES app_principals(id),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE consents (
  id TEXT PRIMARY KEY,
  worker_id TEXT NOT NULL REFERENCES workers(id),
  purpose TEXT NOT NULL,
  document_version TEXT NOT NULL,
  consented_at TEXT,
  withdrawn_at TEXT,
  retention_expires_at TEXT
);

CREATE TABLE fee_transactions (
  id TEXT PRIMARY KEY,
  placement_id TEXT REFERENCES placements(id),
  payer_type TEXT NOT NULL,
  amount INTEGER NOT NULL,
  cap_amount INTEGER NOT NULL,
  rule_version TEXT NOT NULL,
  charged_at TEXT NOT NULL
);

CREATE TABLE compliance_tasks (
  id TEXT PRIMARY KEY,
  task_type TEXT NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL,
  document_ref_id TEXT,
  completed_at TEXT
);

CREATE TABLE document_refs (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  object_key_cipher TEXT NOT NULL,
  retention_expires_at TEXT,
  access_level TEXT NOT NULL,
  destroyed_at TEXT
);

CREATE TABLE intake_submissions (
  id TEXT PRIMARY KEY,
  intake_type TEXT NOT NULL CHECK (intake_type IN ('restaurant', 'worker')),
  status TEXT NOT NULL DEFAULT 'review-pending',
  payload_cipher TEXT NOT NULL,
  consent_version TEXT NOT NULL,
  idempotency_hash TEXT NOT NULL UNIQUE,
  submitted_at TEXT NOT NULL
);

CREATE TABLE audit_events (
  sequence_no INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  detail_json TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  previous_hash TEXT NOT NULL,
  event_hash TEXT NOT NULL UNIQUE,
  key_id TEXT NOT NULL
);

CREATE TRIGGER audit_events_no_update
BEFORE UPDATE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_events are append-only');
END;

CREATE TRIGGER audit_events_no_delete
BEFORE DELETE ON audit_events
BEGIN
  SELECT RAISE(ABORT, 'audit_events are append-only');
END;

CREATE TABLE retention_items (
  id TEXT PRIMARY KEY,
  record_type TEXT NOT NULL,
  record_id TEXT NOT NULL,
  retention_category TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  legal_hold INTEGER NOT NULL DEFAULT 0 CHECK (legal_hold IN (0, 1)),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending-approval', 'destroyed')),
  created_at TEXT NOT NULL,
  destroyed_at TEXT,
  destroyed_by TEXT
);

CREATE TABLE destruction_evidence (
  id TEXT PRIMARY KEY,
  retention_item_id TEXT NOT NULL REFERENCES retention_items(id),
  record_type TEXT NOT NULL,
  record_id TEXT NOT NULL,
  method TEXT NOT NULL,
  executed_by TEXT NOT NULL,
  verified_by TEXT NOT NULL,
  executed_at TEXT NOT NULL,
  result TEXT NOT NULL
);

CREATE INDEX app_principals_access_subject_idx ON app_principals(access_subject, active);
CREATE INDEX workers_retention_idx ON workers(retention_expires_at, status);
CREATE INDEX job_requests_work_date_idx ON job_requests(work_date, verification_status);
CREATE INDEX placements_worker_state_idx ON placements(worker_id, state);
CREATE INDEX compliance_tasks_due_date_idx ON compliance_tasks(due_date, status);
CREATE INDEX audit_events_target_idx ON audit_events(target_type, target_id, occurred_at);
CREATE INDEX retention_items_due_idx ON retention_items(status, legal_hold, expires_at);
