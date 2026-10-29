# ADR 0003 — SDUI 문서·데이터·Action 계약 분리

- 상태: 승인
- 날짜: 2026-07-16
- 연결 이슈: #18, #19

## 배경

서버가 화면 전체를 자유 형식으로 전달하면 빠르게 변경할 수 있지만, 임의 코드 실행, 권한 누출, 오래된 앱 충돌과 개인정보 캐시 위험이 커진다. 하모니 내부 업무 시스템은 화면 배치를 서버에서 바꾸되 업무 규칙과 권한은 Worker가 최종 통제해야 한다.

## 결정

### 1. 문서

- 문서 schema는 `harmony.sdui.document.v1`로 시작한다.
- 문서는 화면 구조, message key, 등록된 data resource ID와 Action ID만 가진다.
- 가장 작은 단위는 allowlist에 등록된 원자 `SduiNode`다.
- component, formatter, resource, Action은 모두 버전 있는 registry에 등록한다.
- 알 수 없는 필수 capability가 있으면 화면을 실행하지 않고 안전한 업데이트 안내를 표시한다.
- JSON Schema는 전송 구조를 1차 검증하고, runtime validator는 component prop·권한·참조·registry 의미를 2차 검증한다. 배포 전 CI에서 두 검증을 모두 실행한다.

### 2. 데이터

- 실제 화면 데이터는 SDUI 문서와 별도 API에서 받는다.
- data binding은 등록된 resource ID와 제한된 JSON Pointer만 사용한다.
- 역할에 허용되지 않는 node와 데이터 필드는 서버에서 제거한다.
- schema, revision, snapshot, 오류 메시지와 감사로그에 개인정보 원문을 넣지 않는다.

### 3. Action

- 클라이언트는 임의 URL이나 HTTP 메서드를 실행하지 않고 등록된 Action ID만 요청한다.
- Worker는 Action 입력 schema, 역할, 상태 전이, idempotency와 업무 규칙을 다시 검증한다.
- 계약·요금·파기는 서버 성공 전 완료 상태로 표시하지 않는다.
- 모든 변경 Action은 request ID와 감사 이벤트를 연결한다.

### 4. 버전

- schema version: 계약의 breaking change
- document revision: 같은 계약 안의 화면 변경
- renderer version: 웹·앱 구현 버전
- Action contract version: 업무 명령의 입력·응답 버전
- renderer capability는 클라이언트가 지원하는 최대 component·Action·formatter version을 알린다. 서버가 아직 모르는 미래 capability는 무시하고, 현재 문서에 필요한 capability만 비교한다.

## 금지 항목

- raw HTML과 `dangerouslySetInnerHTML`
- JavaScript 표현식과 event handler 문자열
- raw CSS, 외부 URL, 임의 API endpoint
- SQL과 데이터베이스 query
- 비밀키, Access token, 개인정보 값
- 클라이언트 전용 권한 판정

## 결과

- 화면 변경과 업무 규칙 변경을 독립적으로 검토할 수 있다.
- 같은 fixture를 웹과 모바일 renderer에서 재사용할 수 있다.
- 초기 개발 시 registry와 validator 작성 비용이 생기지만 잘못된 문서를 배포 전에 차단할 수 있다.
