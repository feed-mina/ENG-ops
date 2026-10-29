-- 미래의 영구 저장 단계를 검토하기 위한 비실행 데이터 구조 초안입니다.
-- 현재 Worker와 D1 스키마의 source of truth는 apps/ops-app/migrations/*입니다.
-- 현재 Mock 프로토타입은 이 파일의 스키마에 실제 개인정보를 저장하지 않습니다.

CREATE TABLE restaurants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  business_number_encrypted TEXT,
  address TEXT NOT NULL,
  verification_status TEXT NOT NULL,
  verified_at TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE workers (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  phone_encrypted TEXT NOT NULL,
  preferred_areas_json TEXT NOT NULL,
  health_certificate_status TEXT NOT NULL,
  health_certificate_checked_at TEXT,
  health_certificate_expires_on TEXT,
  created_at TEXT NOT NULL
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
  decision_actor_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE consents (
  id TEXT PRIMARY KEY,
  worker_id TEXT NOT NULL REFERENCES workers(id),
  purpose TEXT NOT NULL,
  document_version TEXT NOT NULL,
  consented_at TEXT,
  withdrawn_at TEXT
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
  object_key TEXT NOT NULL,
  retention_expires_on TEXT,
  access_level TEXT NOT NULL,
  destroyed_at TEXT
);

CREATE TABLE audit_events (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  detail_json TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);

CREATE INDEX job_requests_work_date_idx ON job_requests(work_date);
CREATE INDEX placements_worker_state_idx ON placements(worker_id, state);
CREATE INDEX compliance_tasks_due_date_idx ON compliance_tasks(due_date, status);
CREATE INDEX audit_events_target_idx ON audit_events(target_type, target_id, occurred_at);
