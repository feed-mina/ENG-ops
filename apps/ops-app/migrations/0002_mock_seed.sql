-- 이 파일의 값은 기능 검증용 가상 데이터이며 실제 사람·식당·계정 정보가 아닙니다.
INSERT INTO app_principals (id, access_subject, role, active, access_review_due_at, created_at) VALUES
  ('MOCK-PRINCIPAL-OWNER', 'mock-access-owner-subject', 'owner', 1, '2026-10-01T00:00:00Z', '2026-07-16T00:00:00Z'),
  ('MOCK-PRINCIPAL-STAFF', 'mock-access-staff-subject', 'staff', 1, '2026-10-01T00:00:00Z', '2026-07-16T00:00:00Z'),
  ('MOCK-PRINCIPAL-ADMIN', 'mock-access-admin-subject', 'system_admin', 1, '2026-10-01T00:00:00Z', '2026-07-16T00:00:00Z'),
  ('MOCK-PRINCIPAL-REVOKED', 'mock-access-revoked-subject', 'staff', 0, '2026-07-01T00:00:00Z', '2026-07-16T00:00:00Z');

INSERT INTO restaurants
  (id, display_name, verification_status, retention_category, retention_expires_at, created_at, updated_at)
VALUES
  ('MOCK-RESTAURANT-A', '가상 한식당 A', 'mock-verified', 'statutory-ledger-2y', '2028-07-16T00:00:00Z', '2026-07-16T00:00:00Z', '2026-07-16T00:00:00Z');

INSERT INTO workers
  (id, display_alias, status, health_certificate_status, retention_category, retention_expires_at, created_at)
VALUES
  ('MOCK-WORKER-A', '가상 근로자 A', 'active', 'mock-valid', 'general-operational', '2027-07-16T00:00:00Z', '2026-07-16T00:00:00Z');

INSERT INTO job_requests
  (id, restaurant_id, role, work_date, starts_at, ends_at, break_minutes, wage_amount, wage_unit, verification_status, created_at)
VALUES
  ('MOCK-JOB-A', 'MOCK-RESTAURANT-A', '주방보조', '2026-08-01', '10:00', '20:00', 60, 120000, 'daily', 'mock-verified', '2026-07-16T00:00:00Z');

INSERT INTO retention_items
  (id, record_type, record_id, retention_category, expires_at, legal_hold, status, created_at)
VALUES
  ('MOCK-RETENTION-A', 'worker', 'MOCK-WORKER-A', 'general-operational', '2027-07-16T00:00:00Z', 0, 'active', '2026-07-16T00:00:00Z'),
  ('MOCK-RETENTION-LEGAL-HOLD', 'document', 'MOCK-DOCUMENT-A', 'statutory-ledger-2y', '2026-01-01T00:00:00Z', 1, 'active', '2026-07-16T00:00:00Z');
