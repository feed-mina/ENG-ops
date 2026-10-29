# Cloudflare 공개·내부 분리 배포 게이트

## 배포 대상

| 구분 | 프로젝트 | 공개 범위 | 현재 상태 |
|---|---|---|---|
| 홍보 페이지 | Pages `harmony-work` / `harmony-work.pages.dev` | 누구나 | 배포됨, 개인정보 입력 기능 없음 |
| 내부 업무 | Worker `harmony-ops` | Access 허용 사용자만 | 코드·D1 마이그레이션 Mock, 운영 배포 차단 |
| 내부 사이트(정적) | Worker `harmony-ops-site` (`wrangler.site.jsonc`) | Access 허용 사용자만 | Mock UI·ops-web 번들, Access 뒤 비공개 배포 |

## Staging 부트스트랩 상태

- [x] APAC D1 `harmony-ops-staging` 생성
- [x] 별도 `wrangler.staging.jsonc`에 Mock-only D1 바인딩 분리
- [x] `DATA_MODE=mock`, `INTAKE_ENABLED=false`, `SDUI_REVISION=1` 고정
- [x] 원격 D1 마이그레이션 적용 (`0001`~`0003`)
- [x] fail-closed Worker 배포와 인증 차단 확인
- [x] Access self-hosted 애플리케이션·지정 이메일 Allow·전역 MFA(TOTP) 정책 확인
- [x] Access 환경 변수와 암호화·감사 Workers Secrets 설정 (2026-07-19 사용자 보고 — Cloudflare 설정 화면 독립 증빙은 아직 없음)
- [x] 승인된 Mock 계정으로 로그인 후 내부 Mock Dashboard 렌더링 확인
- [x] 비공개 내부 사이트 Worker 배포 — `/`·`/admin`·`/ops-web/` 정적 번들 (재배포 설정: 루트 `wrangler.site.jsonc`)
- [ ] 허용 목록 밖 이메일로 `That account does not have access` 거부 확인

Staging은 SDUI 문서 검증을 위해 `SDUI_ENABLED=true`이지만, Access 설정 전에는 Worker 인증 단계에서
모든 요청을 차단한다. 운영 설정과 운영 D1은 이 파일의 staging 리소스를 재사용하지 않는다.

2026-07-17 원격 확인: 무토큰 요청은 `401 ACCESS_TOKEN_MISSING`, 임의 토큰 요청은
`503 ACCESS_NOT_CONFIGURED`를 반환했고 두 응답 모두 `no-store`, `noindex, nofollow` 보안 헤더를 유지했다.

2026-07-19 사용자 확인: 이메일 코드 → 인증 앱 TOTP → 내부 Mock Dashboard 흐름과 지정 이메일만
허용하는 정책을 staging에서 확인했다. 이 기록은 Cloudflare 설정 화면·Access 이벤트 로그의 독립 증빙을
대체하지 않는다. 허용 목록 밖 이메일 거부 테스트, Worker의 Access 환경 변수 2개와 비밀키 4개 설정은 남아 있다.

## 비공개 내부 사이트 재배포 절차

내부 정적 Mock UI와 `ops-web` 번들은 `dist/server/index.js` 단일 Worker 로 묶여 Access 뒤에 배포한다.
지금까지는 수동 배포였고, 2026-07-19부터 루트 `wrangler.site.jsonc` 로 재현 가능하게 배포한다.
이미 배포된 Worker 이름이 `harmony-ops-site` 와 다르면 설정의 `name` 을 기존 배포와 맞춘 뒤 실행한다.

```powershell
npm.cmd run check:site    # 빌드 + dry-run (원격 변경 없음)
npm.cmd run deploy:site   # 빌드 + 배포 (Access 뒤 workers.dev)
```

배포 뒤에는 루트 200, `/ops-web/` 200, 없는 경로 404와 `noindex, nofollow`·CSP 헤더를 확인한다.
이 Worker 에는 Access 없이 공개 route 를 절대 붙이지 않는다.

## Staging Worker 마무리 절차

값은 저장소, 셸 히스토리, 이슈 본문에 쓰지 않는다. `ACCESS_TEAM_DOMAIN`과 `ACCESS_AUD`는 Cloudflare
Worker 설정의 환경 변수로 입력하고, 아래 4개는 Worker Secrets로 대화형 입력한다.

```powershell
.\node_modules\.bin\wrangler.cmd secret put PII_ENCRYPTION_KEY --config apps/ops-app/wrangler.staging.jsonc
.\node_modules\.bin\wrangler.cmd secret put PII_KEY_CURRENT_ID --config apps/ops-app/wrangler.staging.jsonc
.\node_modules\.bin\wrangler.cmd secret put AUDIT_HMAC_KEY --config apps/ops-app/wrangler.staging.jsonc
.\node_modules\.bin\wrangler.cmd secret put AUDIT_KEY_ID --config apps/ops-app/wrangler.staging.jsonc
npm.cmd run check:worker:staging
npm.cmd run migrate:worker:staging
npm.cmd run deploy:worker:staging
```

배포 뒤에는 다음 순서로 증빙을 남긴다.

1. 로그아웃 상태에서 Access 로그인 리다이렉트 확인
2. 허용 계정에서 이메일 코드와 TOTP를 거쳐 Dashboard·준법 화면 확인
3. 허용 목록 밖 이메일에서 `That account does not have access` 확인
4. `/api/session`과 SDUI page/data 응답의 `no-store`, `noindex, nofollow` 확인
5. Workers Logs에 전사문·전화번호·이름 등 개인정보 원문이 없는지 확인
6. 배포 버전 ID, 확인 시각, 검사자, 실패·복구 결과만 증빙표에 기록

## 내부 Worker 운영 전 체크

- [ ] 실제 Cloudflare 계정과 배포 도메인을 확정한다.
- [ ] D1 운영 데이터베이스를 만들고 실제 UUID를 환경별 설정에 넣는다.
- [ ] Access self-hosted 애플리케이션을 만들고 기본 거부를 확인한다.
- [ ] 대표자·종사자 실제 계정만 Allow하고 MFA 요구 정책을 적용한다.
- [ ] 서비스 토큰이나 우회용 공용 헤더를 사람 로그인 경로에 두지 않는다.
- [ ] `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`를 환경 변수로 설정한다.
- [ ] `PII_ENCRYPTION_KEY`, `PII_KEY_CURRENT_ID`, `AUDIT_HMAC_KEY`, `AUDIT_KEY_ID`를 Workers Secret으로 설정한다.
- [ ] 비밀키는 각각 32바이트 이상 난수로 만들고 저장소·이슈에 기록하지 않는다.
- [ ] D1 마이그레이션을 preview에 먼저 적용하고 하루·1개월·회원제 Mock 테스트를 실행한다.
- [ ] Workers Logs에서 개인정보 원문이 남지 않는지 확인한다.
- [ ] 백업 생성·복구·파기 Mock을 실제 비개인 데이터로 재현한다.
- [ ] 운영 승인 전 `DATA_MODE=mock`, `INTAKE_ENABLED=false`, `SDUI_ENABLED=false`, `SDUI_REVISION=1`을 유지한다.

`npm.cmd run check:p0`는 실제·preview·추가 D1 binding, 환경별 override, `workers.dev`·공개 route, Access 값·비밀키 커밋을 발견하면 실패한다. `wrangler.mock.jsonc`는 주석 없는 strict JSON으로 유지한다.

## 안전한 실행 순서

```powershell
npm.cmd run check:p0
npm.cmd run lint
npm.cmd test
wrangler d1 migrations apply harmony-ops-mock --local -c apps/ops-app/wrangler.mock.jsonc
wrangler deploy --dry-run -c apps/ops-app/wrangler.mock.jsonc
```

실제 원격 적용 명령은 계정·도메인·허용 사용자·D1·비밀키 검토가 끝난 후 별도 승인된 배포 작업에서만 실행한다.
