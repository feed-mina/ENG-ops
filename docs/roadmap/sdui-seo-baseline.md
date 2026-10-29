# SDUI·SEO 개발 기준선

- 기준일: 2026-07-16
- 실행 계획: GitHub #19
- 브랜치: `codex/harmony-mock-mvp`

## 변경 전 검증 결과

| 명령 | 결과 | 비고 |
|---|---|---|
| `npm.cmd run lint` | 통과 | 기존 소스 25개 검사 |
| `npm.cmd test` | 통과 | 30개 성공, 실패·건너뜀 없음 |
| `npm.cmd run check:p0` | 통과 | Mock 전용·공개 접수 비활성·운영 배포 차단 |

PowerShell 실행 정책으로 `npm.ps1`을 실행할 수 없는 환경에서는 같은 npm CLI인 `npm.cmd`를 사용한다.

## 현재 구조

- `public`: 내부 운영 Mock UI와 Mock 데이터
- `apps/public-site`: 공개 홍보페이지
- `apps/ops-app`: Cloudflare Worker, Access/RBAC, 암호화, 감사, 보존·파기와 D1 migration
- `packages/contracts`, `packages/compliance`, `packages/validation`: 업무·준법 계약
- `tests`: 빌드, 업무, 보안과 내보내기 회귀 테스트

## 보존해야 하는 안전 게이트

- 실제 개인정보 대신 합성 Mock 데이터만 사용
- `DATA_MODE=mock`
- `INTAKE_ENABLED=false`
- `SDUI_ENABLED=false`, `SDUI_REVISION=1`
- 원격 D1 ID 미설정
- Access 설정과 비밀키 미커밋
- 공개 사이트와 내부 업무 배포 분리

## 이번 기반 변경의 완료 조건

- ADR 0002와 ADR 0003 승인 상태
- SDUI v1 JSON Schema, registry, validator와 Mock dashboard fixture 존재
- 유효 문서와 공격성·무효 문서 테스트
- 기존 30개 회귀 테스트 유지
- 새 `test:sdui`와 전체 lint/test/P0 게이트 통과

## PR 0·PR 1 구현 후 검증 결과

| 검증 | 결과 |
|---|---|
| `npm.cmd run lint` | 신규 SDUI 파일을 포함한 37개 소스 검사 통과 |
| `npm.cmd test` | 기존 30개와 신규 35개, 총 65개 테스트 통과 |
| `npm.cmd run check:p0` | Mock 전용·공개 접수 비활성·운영 배포 차단 유지 |
| `npm.cmd run test:sdui` | Ajv JSON Schema + runtime 의미 검증, manifest, 문서 10개 node, Mock fixture와 보안 실패 사례 35개 통과 |
| SDUI Template Kit CLI | `Manifest OK: harmony-ops@0.1.0` |
| `npm audit` | Ajv 8.18.0 기준 알려진 취약점 0개 |

내부 Mock HTML과 내부 Worker 응답에는 `noindex, nofollow`를 추가했다. 공개 홍보페이지의 검색 허용 설정과 정적 HTML은 변경하지 않았다.

## PR 2 Renderer Core·Web adapter 구현 결과

- 기준일: 2026-07-17
- 연결 이슈: GitHub #18, #19
- `packages/sdui-renderer-core`: DOM·네트워크 비의존 render plan, capability 협상, 역할·표시 조건, message/theme/data binding, formatter, 안전 상태 구현
- `packages/sdui-renderer-web`: dashboard가 사용하는 8개 component의 `createElement`·`textContent` 기반 DOM adapter와 360px·큰 글씨·focus-visible CSS 구현
- 미지원 component는 props·Action을 실행하지 않고 `UnsupportedComponent` 안내로 대체
- Worker fetch, Action 실행, 실제 개인정보, `apps/ops-web` 전환은 다음 PR로 분리

| 검증 | 결과 |
|---|---|
| 신규 renderer 단위·Web 테스트 | 15개 통과 |
| `npm.cmd run test:sdui` | 기존 계약과 신규 renderer를 합쳐 50개 통과 |
| `npm.cmd test` | 전체 108개 통과 |
| `npm.cmd run lint` | renderer 파일을 포함한 40개 소스 검사 통과 |
| `npm.cmd run check:p0` | Mock 전용·공개 접수 비활성·운영 배포 차단 유지 |
| CI | `test:sdui`를 필수 단계로 추가 |

## Worker UI API 전 SDUI·P0 안전 게이트 보강 결과

- 기준일: 2026-07-17
- 연결 이슈: GitHub #15, #18, #19
- `wrangler.mock.jsonc`에서 `SDUI_ENABLED=false`, `SDUI_REVISION=1`을 명시해 승인 전 SDUI 활성화를 차단
- P0 readiness는 strict JSON 설정, Mock mode, 접수·SDUI 비활성, revision, 단일 placeholder D1, env override·공개 route 부재, Access·secret 미커밋을 모두 검사
- 실제·preview·추가 D1 binding이나 `workers.dev`·route가 들어오면 fail-closed
- Worker JSON 요청은 큰 `Content-Length`를 즉시 거부하고, 헤더가 없거나 작아도 stream의 실제 UTF-8 바이트가 16KiB를 넘으면 취소 후 413으로 거부
- 운영 D1·Access·MFA·비밀키 연결과 실제 배포는 수행하지 않음

| 검증 | 결과 |
|---|---|
| P0·Worker 보안 표적 테스트 | 17개 통과 |
| `npm.cmd run check:p0` | 10개 안전 게이트 통과 |
| `npm.cmd run test:sdui` | 50개 통과 |
| `npm.cmd test` | 전체 117개 통과 |
| `npm.cmd run lint` | 40개 소스 검사 통과 |

## PR 3 Worker UI API·보안 경계 구현 결과

- 기준일: 2026-07-17
- 연결 이슈: GitHub #19
- `GET /api/ui/pages/:pageId`, `GET /api/ui/data/:resourceId`, `POST /api/ui/actions/:actionId` 경로를 기존 Access JWT·RBAC 라우팅 안에 연결
- dashboard 문서와 `dashboard.summary`는 `owner`·`staff`만 허용하고, `dashboard:read`가 있는 `system_admin`도 문서·resource 역할 검사에서 403으로 차단
- 역할별 node pruning 뒤 문서를 다시 검증하고, 권한·feature flag·revision 검사를 통과한 응답에만 ETag·304를 적용
- `resource.refresh`만 서버 Action allowlist로 노출하고 `{pageId, resourceId, revision}` 이외의 입력, 다른 대상·revision, 임의 Idempotency-Key를 거부
- 감사 로그에는 request ID·고정 route·결과 코드만 남기고 SDUI 문서·resource·Action payload는 기록하지 않음
- manifest를 `harmony-ops@0.2.0`으로 올리고 UI endpoint ID와 `DB` binding 요구사항을 선언
- P0 설정은 계속 `SDUI_ENABLED=false`이며 운영 D1·Access·MFA·비밀키 연결과 배포는 수행하지 않음

| 검증 | 결과 |
|---|---|
| Worker UI API 표적 테스트 | 10개 통과 |
| `npm.cmd run check:worker` | Wrangler 4.111.0 dry-run 번들 통과, 143.75 KiB (gzip 33.28 KiB) |
| `npm.cmd run check:p0` | 10개 안전 게이트 통과 |
| `npm.cmd run test:sdui` | 60개 통과 |
| `npm.cmd test` | 전체 127개 통과 |
| `npm.cmd run lint` | 41개 소스 검사 통과 |

## PR 4 읽기 전용 dashboard 수직 PoC 구현 결과

- 기준일: 2026-07-17
- 연결 이슈: GitHub #19
- `apps/ops-web`는 정적 shell에 서버가 전달한 dashboard 문서·resource만 렌더링하며 production bundle에 dashboard 문서나 fixture를 포함하지 않음
- 브라우저 요청은 동일 출처 `GET /api/session` → page → capability preflight → data 순서로 고정하고 POST·임의 URL·외부 분석 요청을 만들지 않음
- owner·staff만 진행하며 system_admin, 401/403, 비활성 기능, 계약 오류와 네트워크 실패는 일부 SDUI DOM을 남기지 않고 기존 `/admin#dashboard` 대체 링크로 종료
- 기본 build flag는 OFF라 API 호출이 0건이며, `dev:ops-web` 로컬 합성 미리보기에서만 저장소의 Worker SDUI helper와 Mock fixture를 재사용
- 내부 HTML과 로컬 응답에 `noindex, nofollow`, same-origin CSP, `no-store`를 적용하고 일반 `ArrowLeft` 키를 가로채지 않음
- 운영 D1·Access·MFA·비밀키 연결과 배포는 수행하지 않았으며 실제 Access 계정·Chrome staging 확인은 P1 전환 게이트로 유지

| 검증 | 결과 |
|---|---|
| `npm.cmd run test:ops-web` | 7개 통과 |
| `npm.cmd run check:p0` | 10개 안전 게이트 통과, SDUI 기본 OFF 유지 |
| `npm.cmd run test:sdui` | 60개 통과 |
| `npm.cmd test` | 전체 134개 통과 |
| `npm.cmd run lint` | 47개 소스 검사 통과 |
| `npm.cmd run check:worker` | Wrangler 4.111.0 dry-run 번들 통과, 143.75 KiB (gzip 33.28 KiB) |

## PR 5 공개 홍보페이지 SEO 자동 게이트 구현 결과

- 기준일: 2026-07-17
- 연결 이슈: GitHub #19, QA #22
- `PUBLIC_SITE_URL` 하나를 canonical·Open Graph·JSON-LD·`robots.txt`·`sitemap.xml`의 공개 origin으로 사용하고, HTTPS origin이 아니거나 `workers.dev` 주소이면 출력 폴더를 지우기 전에 빌드를 중단
- `/index.html`은 `/`로, `/privacy.html`은 `/privacy`로 301 정규화하고 canonical·sitemap에는 깨끗한 공개 경로만 포함
- 홈 구조화 데이터는 확인 가능한 상호·전화·공개 URL·공유 이미지만 포함한 `LocalBusiness`로 제한하고, 원본이 확인되지 않은 지번·우편번호·개업일·영업시간은 제거
- 내부 API·관리자·근로자 경로, `JobPosting`, 외부 분석 스크립트는 공개 산출물에 포함하지 않으며 404와 내부 화면의 `noindex` 경계를 자동 검사
- 주소·영업시간·외부 프로필은 [`public-business-profile-checklist.md`](../operations/public-business-profile-checklist.md)의 원본 확인 뒤에만 확장

| 검증 | 결과 |
|---|---|
| `npm.cmd run test:seo` | SEO 계약 11개 통과 |
| 공개 빌드·라우팅 표적 테스트 | 8개 통과 |
| `PUBLIC_SITE_URL=https://seo.example.test` | canonical·Open Graph·JSON-LD·robots·sitemap 동시 반영 확인 |
| `PUBLIC_SITE_URL=http://invalid.example` | 빌드 실패 및 기존 산출물 보존 확인 |
| `npm.cmd run lint` | 49개 소스 검사 통과 |
| `npm.cmd run check:p0` | 10개 안전 게이트 통과, 운영 배포 차단 유지 |
| `npm.cmd run test:sdui` | 60개 통과 |
| `npm.cmd run check:worker` | Wrangler 4.111.0 dry-run 번들 통과, 143.75 KiB (gzip 33.28 KiB) |
| `npm.cmd test` | 전체 145개 통과 |

## 다음 단계

1. [x] renderer core와 Web adapter
2. [x] SDUI·P0 안전 게이트 보강
3. [x] Worker UI schema/data/action API
4. [x] 읽기 전용 dashboard 수직 PoC
5. [x] 공개 홍보페이지 SEO 자동 검증 상태 정리와 독립 실행 명령
6. [ ] 개인정보 고지 검토 후 공개 통계 활성화
