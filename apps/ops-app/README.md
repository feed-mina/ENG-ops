# harmony-ops Mock 보안 기반

`harmony-ops`는 공개 홍보 사이트와 분리되는 내부 Cloudflare Worker입니다. 현재 코드는 실제 개인정보가 아닌 Mock 데이터만 허용하며 운영 배포용 설정은 포함하지 않습니다.

## 현재 구현

- `Cf-Access-Jwt-Assertion`의 RS256 서명·발급자·대상·만료 검증
- 대표자(`owner`), 종사자(`staff`), 시스템관리자(`system_admin`) 앱 권한 분리
- D1 번호형 마이그레이션과 Mock 사용자·식당·근로자·보존자료
- AES-256-GCM 필드 암호화와 키 식별자
- HMAC 연결값과 UPDATE/DELETE 차단 트리거를 가진 감사 이벤트
- 법적 보류를 제외하는 Mock 보존 만료·파기 작업
- 식당·근로자 전화/방문 접수 허용목록, 목적별 동의와 금지 개인정보 차단
- 암호화된 접수 원문, 소개 상태 추가전용 이력, 계약 확인 뒤 요금·장부 생성
- 변경·보험·폐업 사건 기한과 연간 교육·반기 점검 Mock 캘린더
- JSON 요청은 선언 길이가 16KiB를 넘으면 즉시 거부하고, 실제 UTF-8 stream이 경계를 넘으면 파싱 전에 취소
- 실제·preview·추가 D1, 환경 override, 공개 route와 SDUI 활성화를 차단하는 P0 readiness
- `owner`·`staff` 전용 SDUI page/data API, 서버 node pruning, revision·ETag와 304 응답
- 서버 allowlist의 읽기 전용 `resource.refresh` Action과 엄격한 입력·감사 로그 검증
- 모든 응답의 `no-store` 및 브라우저 보안 헤더

## 의도적인 차단 상태

`wrangler.mock.jsonc`에는 실제 Access 팀 도메인, 애플리케이션 AUD, D1 ID, 암호화 키가 없습니다. 또한 `SDUI_ENABLED=false`, `SDUI_REVISION=1`로 고정되어 있습니다. 따라서 그대로 배포해도 내부 자료를 열 수 없고, 실제 배포 대신 로컬 검증에만 사용해야 합니다.

운영 전에는 Cloudflare 대시보드에서 Access 애플리케이션과 MFA 정책을 만들고 다음 값을 환경별로 별도 설정합니다.

- 일반 변수: `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `DATA_MODE`, `SDUI_ENABLED`, `SDUI_REVISION`
- Workers Secrets: `PII_ENCRYPTION_KEY`, `PII_KEY_CURRENT_ID`, `AUDIT_HMAC_KEY`, `AUDIT_KEY_ID`
- 실제 D1 바인딩 `DB`

키나 Access 토큰을 저장소, GitHub 이슈, Mock 문서에 기록하지 않습니다.

## Mock staging Worker

`wrangler.staging.jsonc`는 Cloudflare의 `harmony-ops-staging` D1에 연결되는 합성 Mock 전용 설정입니다.
공개 접수는 꺼져 있고 실제 개인정보를 넣지 않습니다. SDUI 화면 계약은 켜지만 `ACCESS_TEAM_DOMAIN`과
`ACCESS_AUD`를 저장소에 두지 않으므로, Access 구성이 끝나기 전 모든 원격 요청은
`ACCESS_NOT_CONFIGURED`로 닫힌 상태에서 실패해야 합니다.

- Worker: `harmony-ops-staging`
- URL: `https://harmony-ops-staging.kibayerin.workers.dev`
- D1: `harmony-ops-staging` (APAC)

```powershell
npm.cmd run check:worker:staging
npm.cmd run migrate:worker:staging
npm.cmd run deploy:worker:staging
```

배포 후 먼저 인증 없는 요청이 503과 `ACCESS_NOT_CONFIGURED`를 반환하는지 확인합니다. 그 다음에만
Cloudflare Access self-hosted 애플리케이션과 MFA Allow 정책을 만들고, 환경 변수와 Workers Secrets를
Cloudflare에서 설정합니다. 비밀 값은 이 설정 파일에 추가하지 않습니다.

## 로컬 D1 검증

저장소에 있는 Wrangler를 사용해 앱 폴더에서 실행합니다.

```powershell
wrangler d1 migrations apply harmony-ops-mock --local -c wrangler.mock.jsonc
wrangler dev -c wrangler.mock.jsonc
```

Access 검증을 우회하는 개발용 헤더는 제공하지 않습니다. 인증 흐름은 단위 테스트의 서명된 일회성 가상 JWT로 검증합니다.

실제 업로드 없이 Worker 번들과 binding 설정을 검증합니다.

```powershell
npm.cmd run check:worker
```

## 내부 API (Mock)

SDUI API는 코드와 테스트만 구현되어 있으며 P0 설정의 `SDUI_ENABLED=false` 때문에 현재 실행되지 않습니다. Access 인증 뒤에도 문서·resource·Action의 역할 허용목록을 각각 다시 검사하며, `system_admin`은 이번 dashboard slice를 받을 수 없습니다.

- `GET /api/ui/pages/dashboard?surface=web&locale=ko`
- `GET /api/ui/data/dashboard.summary`
- `GET /api/ui/pages/compliance?surface=web&locale=ko`
- `GET /api/ui/data/compliance.calendar`
- `POST /api/ui/actions/resource.refresh`

page와 data 응답은 `ETag`, `X-SDUI-Revision`, `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`를 반환합니다. Action 본문은 `{ "pageId": "dashboard", "resourceId": "dashboard.summary", "revision": 1 }` 세 필드만 허용하고, 등록됐더라도 서버 실행 allowlist에 없는 Action은 거부합니다. 감사 로그에는 request ID·고정 route·결과 코드만 기록하며 문서나 요청 payload는 남기지 않습니다.

기존 Mock 업무 API:

- `GET|POST /api/mock/intake/restaurant`
- `GET|POST /api/mock/intake/worker`
- `POST /api/mock/intake/restaurant/preview`
- `POST /api/mock/placements`
- `POST /api/mock/placements/:id/state`
- `POST /api/mock/fees`
- `GET /api/compliance/calendar?year=2026`
- `POST /api/compliance/events`

공개 홈페이지에는 이 API를 연결하지 않습니다. 실제 D1·Access·MFA·비밀키를 갖춘 내부 도메인에서만 운영 전환합니다.
