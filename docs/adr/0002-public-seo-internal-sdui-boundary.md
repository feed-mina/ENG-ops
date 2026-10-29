# ADR 0002 — 공개 SEO와 내부 SDUI 배포 경계

- 상태: 승인
- 날짜: 2026-07-16
- 연결 이슈: #9, #15, #18, #19
- 대체 범위: ADR 0001의 단일 정적 배포 결정만 대체한다. Mock 우선 원칙은 유지한다.

## 배경

하모니직업소개소 프로젝트에는 목적이 다른 두 화면이 있다.

1. 누구나 보는 홍보 홈페이지
2. 사장님과 허가된 종사자만 사용하는 내부 업무 화면

홍보 홈페이지는 검색엔진이 회사명, 주소, 전화번호, 서비스 설명을 안정적으로 읽을 수 있어야 한다. 내부 화면은 근로자·식당·소개·요금 정보를 다루므로 검색 노출과 외부 방문자 분석을 허용할 수 없다. 향후 모바일 앱까지 고려하면 내부 화면의 구조와 업무 Action은 웹에 종속되지 않아야 한다.

## 결정

### 공개 홍보페이지

- `apps/public-site`를 Cloudflare Pages에 별도로 배포한다.
- 검색에 중요한 제목, 설명, 연락처와 사업장 정보는 정적 HTML에 포함한다.
- canonical, robots, sitemap, JSON-LD는 공개 빌드 단계에서 생성·검증한다.
- GA4와 Cloudflare Web Analytics는 운영 공개 도메인에서만 선택적으로 사용한다.
- 공개 콘텐츠가 추후 SDUI 모델을 공유하더라도 브라우저 런타임에서 그리지 않고 빌드 시 정적 HTML로 변환한다.

### 내부 업무 웹·향후 앱

- 현재 `public` 내부 Mock은 검증 기준선으로 보존하고 `apps/ops-web`로 점진 전환한다.
- 화면은 `SduiDocument -> SduiPage -> SduiNode` 계약을 사용한다.
- Cloudflare Access 뒤에서만 제공하고 Worker가 JWT, RBAC, 입력, 상태 전이와 보존 규칙을 재검증한다.
- 내부 응답은 `noindex, nofollow`를 유지하고 GA4·Cloudflare Web Analytics 등 외부 방문 분석 스크립트를 넣지 않는다.
- 개인정보 API 응답은 `Cache-Control: no-store`를 사용한다.

### 공통 안전 원칙

- SDUI 문서에는 비밀키, 개인정보 값, 임의 URL, JavaScript, HTML, CSS 또는 SQL을 넣지 않는다.
- 클라이언트의 숨김이나 비활성화는 보안 통제가 아니다.
- 실제 개인정보 운영 승인 전에는 합성 Mock 데이터만 사용한다.
- `DATA_MODE=mock`, `INTAKE_ENABLED=false` 게이트를 유지한다.

## 결과

- 공개 SEO 변경이 내부 업무 renderer와 독립적으로 배포될 수 있다.
- 내부 웹과 모바일 앱이 같은 화면 의미와 Action 계약을 공유할 수 있다.
- 공개 검색·통계와 내부 개인정보 처리의 경계가 테스트 가능한 조건이 된다.
- 두 빌드와 배포 절차를 별도로 관리해야 하므로 CI 항목이 늘어난다.

## 롤백

- 공개 사이트는 직전 Cloudflare Pages 배포로 되돌린다.
- 내부 SDUI는 `SDUI_ENABLED=false`로 기존 Mock 화면을 사용한다.
- SDUI 문서는 변경 불가능한 revision으로 발행하고 이전 정상 revision을 유지한다.

