export const ROLE_PERMISSIONS = Object.freeze({
  owner: Object.freeze([
    "dashboard:read", "records:list", "records:read", "records:write", "records:export",
    "audit:read", "retention:destroy", "roles:manage", "system:backup"
  ]),
  staff: Object.freeze(["dashboard:read", "records:list", "records:read", "records:write"]),
  system_admin: Object.freeze(["dashboard:read", "audit:read", "roles:manage", "system:backup"])
});

export class AuthorizationError extends Error {
  constructor(code = "PERMISSION_DENIED", message = "이 작업을 할 권한이 없습니다.") {
    super(message);
    this.name = "AuthorizationError";
    this.status = 403;
    this.code = code;
  }
}

export function hasPermission(role, permission) {
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
}

export function requirePermission(principal, permission) {
  if (!principal?.active) throw new AuthorizationError("ACCOUNT_DISABLED", "사용이 중지된 계정입니다.");
  if (!hasPermission(principal.role, permission)) throw new AuthorizationError();
  return principal;
}

export async function loadPrincipal(db, accessSubject) {
  const principal = await db.prepare(
    "SELECT id, access_subject AS accessSubject, role, active FROM app_principals WHERE access_subject = ? LIMIT 1"
  ).bind(accessSubject).first();
  if (!principal || principal.active !== 1) throw new AuthorizationError("PRINCIPAL_NOT_ALLOWED", "승인된 내부 사용자가 아닙니다.");
  return { ...principal, active: true };
}
