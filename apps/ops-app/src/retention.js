export function selectDestructionCandidates(records, now = new Date()) {
  const boundary = now instanceof Date ? now : new Date(now);
  return records.filter((record) => {
    if (record.legalHold || record.status !== "active" || !record.expiresAt) return false;
    return new Date(record.expiresAt) <= boundary;
  });
}

export async function destroyExpiredMockRecords(db, { actorId, now = new Date() }) {
  const nowIso = now.toISOString();
  const result = await db.prepare(
    `SELECT id, record_type AS recordType, record_id AS recordId,
            retention_category AS retentionCategory, expires_at AS expiresAt,
            legal_hold AS legalHold, status
       FROM retention_items
      WHERE status = 'active' AND legal_hold = 0 AND expires_at <= ?
      ORDER BY expires_at ASC LIMIT 100`
  ).bind(nowIso).all();
  const candidates = selectDestructionCandidates(
    (result.results ?? []).map((row) => ({ ...row, legalHold: row.legalHold === 1 })),
    now
  );

  for (const item of candidates) {
    const evidenceId = `DEST-${crypto.randomUUID()}`;
    await db.batch([
      db.prepare("UPDATE retention_items SET status = 'destroyed', destroyed_at = ?, destroyed_by = ? WHERE id = ? AND status = 'active'")
        .bind(nowIso, actorId, item.id),
      db.prepare(
        `INSERT INTO destruction_evidence
          (id, retention_item_id, record_type, record_id, method, executed_by, verified_by, executed_at, result)
         VALUES (?, ?, ?, ?, 'cryptographic-erasure-mock', ?, 'MOCK-VERIFIER-PENDING', ?, 'mock-complete')`
      ).bind(evidenceId, item.id, item.recordType, item.recordId, actorId, nowIso)
    ]);
  }
  return candidates;
}
