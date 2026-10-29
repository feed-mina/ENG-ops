import { addCalendarYears } from "../../../packages/compliance/rules.js";
import {
  ContractValidationError,
  normalizeRestaurantIntake,
  normalizeWorkerIntake
} from "../../../packages/contracts/operations.js";
import { calculateFee } from "../../../public/domain.js";
import { encryptPersonalField } from "./crypto.js";

const encoder = new TextEncoder();
const PLACEMENT_STATES = new Set(["candidate", "contacting", "introduced", "contract_confirmed", "employed", "closed"]);
const ALLOWED_STATE_TRANSITIONS = Object.freeze({
  candidate: new Set(["contacting", "closed"]),
  contacting: new Set(["introduced", "closed"]),
  introduced: new Set(["contract_confirmed", "closed"]),
  contract_confirmed: new Set(["employed", "closed"]),
  employed: new Set(["closed"]),
  closed: new Set()
});

function hex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function stableHash(value) {
  return hex(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

function mockId(value, prefix, field) {
  const normalized = String(value ?? "").trim();
  if (!new RegExp(`^${prefix}[A-Z0-9-]{1,40}$`).test(normalized)) {
    throw new ContractValidationError("MOCK_ID_REQUIRED", `${field} Mock 번호를 확인해 주세요.`, [field]);
  }
  return normalized;
}

function oneYearAfter(dateOnly) {
  return `${addCalendarYears(dateOnly, 1)}T23:59:59Z`;
}

export async function saveMockIntake(db, type, input, principal, env) {
  const record = type === "restaurant"
    ? normalizeRestaurantIntake(input, { dataMode: env.DATA_MODE })
    : normalizeWorkerIntake(input, { dataMode: env.DATA_MODE });
  const idempotencyHash = await stableHash(`${type}|${record.id}|${record.receivedOn}|${record.contractVersion}|${type === "restaurant" ? record.jobRequestId : "worker"}`);
  const existing = await db.prepare(
    "SELECT id, status FROM intake_submissions WHERE idempotency_hash = ? LIMIT 1"
  ).bind(idempotencyHash).first();
  if (existing) return { id: existing.id, status: existing.status, idempotent: true, record };

  const submissionId = `MOCK-INTAKE-${idempotencyHash.slice(0, 24).toUpperCase()}`;
  const now = new Date().toISOString();
  const expiresAt = oneYearAfter(record.receivedOn);
  const payloadCipher = await encryptPersonalField(JSON.stringify(record), `intake_submissions:${submissionId}:payload`, env);
  const statements = [];

  if (type === "restaurant") {
    const businessNumberCipher = await encryptPersonalField(record.businessNumber, `restaurants:${record.id}:businessNumber`, env);
    const addressCipher = await encryptPersonalField(record.businessAddress, `restaurants:${record.id}:address`, env);
    statements.push(
      db.prepare(
        `INSERT INTO restaurants
          (id, display_name, business_number_cipher, address_cipher, verification_status, retention_category, retention_expires_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'general-operational', ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET display_name = excluded.display_name, business_number_cipher = excluded.business_number_cipher,
           address_cipher = excluded.address_cipher, verification_status = excluded.verification_status,
           retention_expires_at = excluded.retention_expires_at, updated_at = excluded.updated_at`
      ).bind(record.id, record.businessName, businessNumberCipher, addressCipher, record.verification.blockers.length ? "blocked" : "mock-verified", expiresAt, now, now),
      db.prepare(
        `INSERT INTO job_requests
          (id, restaurant_id, role, work_date, starts_at, ends_at, break_minutes, wage_amount, wage_unit, verification_status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET role = excluded.role, work_date = excluded.work_date, starts_at = excluded.starts_at,
           ends_at = excluded.ends_at, break_minutes = excluded.break_minutes, wage_amount = excluded.wage_amount,
           wage_unit = excluded.wage_unit, verification_status = excluded.verification_status`
      ).bind(
        record.jobRequestId, record.id, record.role, record.workStartDate, record.startsAt, record.endsAt,
        record.breakMinutes, record.wageAmount, record.wageUnit,
        record.verification.blockers.length ? "blocked" : "mock-verified", now
      )
    );
  } else {
    const phoneCipher = await encryptPersonalField(record.phone, `workers:${record.id}:phone`, env);
    statements.push(
      db.prepare(
        `INSERT INTO workers
          (id, display_alias, phone_cipher, status, health_certificate_status, health_certificate_expires_on,
           retention_category, retention_expires_at, created_at, updated_at)
         VALUES (?, ?, ?, 'active', ?, ?, 'general-operational', ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET display_alias = excluded.display_alias, phone_cipher = excluded.phone_cipher,
           health_certificate_status = excluded.health_certificate_status,
           health_certificate_expires_on = excluded.health_certificate_expires_on,
           retention_expires_at = excluded.retention_expires_at, updated_at = excluded.updated_at`
      ).bind(record.id, record.displayAlias, phoneCipher, record.healthCertificateStatus, record.healthCertificateExpiresOn, expiresAt, now, now)
    );
    for (const [purpose, accepted] of Object.entries(record.consents)) {
      statements.push(
        db.prepare(
          `INSERT INTO consents
            (id, worker_id, purpose, document_version, consented_at, withdrawn_at, retention_expires_at)
           VALUES (?, ?, ?, ?, ?, NULL, ?)
           ON CONFLICT(id) DO UPDATE SET consented_at = excluded.consented_at, withdrawn_at = NULL,
             document_version = excluded.document_version, retention_expires_at = excluded.retention_expires_at`
        ).bind(`MOCK-CONSENT-${record.id}-${purpose}`, record.id, purpose, record.contractVersion, accepted ? now : null, expiresAt)
      );
    }
  }

  statements.push(
    db.prepare(
      `INSERT INTO intake_submissions
        (id, intake_type, status, payload_cipher, consent_version, idempotency_hash, submitted_at, intake_channel, contract_version, created_by)
       VALUES (?, ?, 'review-pending', ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO NOTHING`
    ).bind(submissionId, type, payloadCipher, record.contractVersion, idempotencyHash, now, record.channel, record.contractVersion, principal.id),
    db.prepare(
      `INSERT INTO retention_items
        (id, record_type, record_id, retention_category, expires_at, legal_hold, status, created_at)
       VALUES (?, 'intake', ?, 'general-operational', ?, 0, 'active', ?)
       ON CONFLICT(id) DO UPDATE SET expires_at = excluded.expires_at`
    ).bind(`RET-${submissionId}`, submissionId, expiresAt, now)
  );
  await db.batch(statements);
  return { id: submissionId, status: "review-pending", idempotent: false, record };
}

export async function createMockPlacement(db, input, principal) {
  const id = mockId(input.id, "MOCK-PLACEMENT-", "id");
  const jobRequestId = mockId(input.jobRequestId, "MOCK-JOB-", "jobRequestId");
  const workerId = mockId(input.workerId, "MOCK-WORKER-", "workerId");
  const state = String(input.state ?? "candidate");
  if (!PLACEMENT_STATES.has(state)) throw new ContractValidationError("INVALID_PLACEMENT_STATE", "소개 진행 상태를 확인해 주세요.", ["state"]);
  if (state !== "candidate") throw new ContractValidationError("INITIAL_STATE_REQUIRED", "새 소개 기록은 후보 상태에서 시작해야 합니다.", ["state"]);
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(
      `INSERT INTO placements
        (id, job_request_id, worker_id, state, contract_confirmed_at, employed_at, decision_actor_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, jobRequestId, workerId, state, state === "contract_confirmed" || state === "employed" ? now : null, state === "employed" ? now : null, principal.id, now, now),
    db.prepare(
      `INSERT INTO placement_status_history (id, placement_id, from_state, to_state, changed_by, changed_at)
       VALUES (?, ?, NULL, ?, ?, ?)`
    ).bind(`MOCK-HISTORY-${crypto.randomUUID()}`, id, state, principal.id, now)
  ]);
  return { id, state };
}

export async function changeMockPlacementState(db, placementId, nextState, principal) {
  const id = mockId(placementId, "MOCK-PLACEMENT-", "placementId");
  const state = String(nextState ?? "");
  if (!PLACEMENT_STATES.has(state)) throw new ContractValidationError("INVALID_PLACEMENT_STATE", "소개 진행 상태를 확인해 주세요.", ["state"]);
  const placement = await db.prepare("SELECT state FROM placements WHERE id = ? LIMIT 1").bind(id).first();
  if (!placement) throw new ContractValidationError("PLACEMENT_NOT_FOUND", "소개 기록을 찾을 수 없습니다.", ["placementId"]);
  if (!ALLOWED_STATE_TRANSITIONS[placement.state]?.has(state)) {
    throw new ContractValidationError("INVALID_STATE_TRANSITION", `${placement.state} 상태에서 ${state} 상태로 바로 바꿀 수 없습니다.`, ["state"]);
  }
  const now = new Date().toISOString();
  await db.batch([
    db.prepare(
      `UPDATE placements SET state = ?, contract_confirmed_at = CASE WHEN ? IN ('contract_confirmed', 'employed') THEN COALESCE(contract_confirmed_at, ?) ELSE contract_confirmed_at END,
       employed_at = CASE WHEN ? = 'employed' THEN COALESCE(employed_at, ?) ELSE employed_at END, decision_actor_id = ?, updated_at = ? WHERE id = ?`
    ).bind(state, state, now, state, now, principal.id, now, id),
    db.prepare(
      `INSERT INTO placement_status_history (id, placement_id, from_state, to_state, changed_by, changed_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(`MOCK-HISTORY-${crypto.randomUUID()}`, id, placement.state, state, principal.id, now)
  ]);
  return { id, previousState: placement.state, state };
}

export async function recordMockFee(db, input, principal) {
  const id = mockId(input.id, "MOCK-FEE-", "id");
  const placementId = mockId(input.placementId, "MOCK-PLACEMENT-", "placementId");
  const payerType = String(input.payerType ?? "");
  if (!new Set(["employer", "worker"]).has(payerType)) throw new ContractValidationError("INVALID_PAYER", "요금 납부 주체를 확인해 주세요.", ["payerType"]);
  if (input.membership === true && payerType !== "worker") {
    throw new ContractValidationError("INVALID_MEMBERSHIP_PAYER", "일용근로자 회원 회비의 납부 주체를 확인해 주세요.", ["payerType"]);
  }
  const placement = await db.prepare(
    `SELECT p.state, j.wage_amount AS wageAmount FROM placements p
     JOIN job_requests j ON j.id = p.job_request_id WHERE p.id = ? LIMIT 1`
  ).bind(placementId).first();
  if (!placement) throw new ContractValidationError("PLACEMENT_NOT_FOUND", "소개 기록을 찾을 수 없습니다.", ["placementId"]);
  const result = calculateFee({
    placementState: placement.state,
    payer: payerType,
    wage: placement.wageAmount,
    requestedFee: input.amount,
    membership: input.membership === true
  });
  if (!result.ok) throw new ContractValidationError(result.code, result.message, ["amount"]);
  const now = new Date().toISOString();
  const ledgerType = input.membership === true ? "daily-membership-fee" : "introduction-fee";
  await db.batch([
    db.prepare(
      `INSERT INTO fee_transactions (id, placement_id, payer_type, amount, cap_amount, rule_version, charged_at)
       VALUES (?, ?, ?, ?, ?, 'mock-2026-07-16-v1', ?)`
    ).bind(id, placementId, payerType, result.fee, result.cap, now),
    db.prepare(
      `INSERT INTO ledger_entries
        (id, entry_type, placement_id, fee_transaction_id, amount, occurred_at, recorded_by, retention_expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(`MOCK-LEDGER-${crypto.randomUUID()}`, ledgerType, placementId, id, result.fee, now, principal.id, `${addCalendarYears(now, 2)}T23:59:59Z`)
  ]);
  return { id, placementId, fee: result.fee, cap: result.cap };
}
