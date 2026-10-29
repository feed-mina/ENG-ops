# ENG-ops · 건설현장 상담 초안

`mom-asked-ops`를 기반으로 독립 개발한 **자료 비교 + 가상 전화상담 화면**입니다. 기존 mom 프로젝트와 기존 하모니 Cloudflare 서비스는 변경하지 않았습니다.

## 구현한 1~2단계

1. **자료와 조건표**: 한글 매뉴얼 A·B와 모집 글 C의 급여·지급일·숙식비·소개비·교육비를 출처별로 비교합니다. 적용 시점은 모두 미확인으로 표시합니다.
2. **상담 화면**: 가상 대상 선택, 근무 가능일·희망 업무, 자료별 금액 반영, 지급일 충돌·교육·안전화·숙소·비용 확인, 빠진 질문, 로컬 TXT 다운로드와 인쇄를 제공합니다.

미확인 비용은 무료로 바뀌지 않습니다. 조건을 바꾸면 담당자 확인과 원문 대조가 해제됩니다. 확인 요약도 실제 계약·배정·급여 확정 문서가 아닌 가상 시험 결과입니다.

**현재 범위**: 가상 데이터 전용, 브라우저 메모리에서만 초안 관리, 새로고침 시 초기화. 서버 저장·실제 개인정보 입력·배정·수납·AI 호출은 포함되지 않습니다.

## 실행

Node.js 22.13 이상이 필요합니다.

```bash
npm ci
npm run dev
```

출력되는 로컬 주소를 엽니다. Cloudflare 계정 로그인 없이 로컬 화면을 확인할 수 있습니다.

## 검증

```bash
npm run lint
npm test
npm run check:eng
```

- `npm test`: 원본 소스의 회귀 검사와 새 건설 상담 검사
- `npm run check:eng`: 상담 검사와 Cloudflare 배포 패키지 dry-run(실제 배포하지 않음)
- `tests/construction-browser.cjs`: 실제 브라우저의 비교표·상담·내려받기·확인 해제·1280/420px 검사

## Cloudflare 배포 준비

이 프로젝트의 기본 설정은 `wrangler.jsonc`이며 Worker 이름은 **eng-ops**입니다.

| 항목 | 설정 |
|---|---|
| Git 저장소 | `feed-mina/ENG-ops` |
| 운영 브랜치 | `main` |
| 루트 디렉터리 | 저장소 루트 |
| 빌드 명령 | `npm run build` |
| 배포 명령 | `npx wrangler deploy --config wrangler.jsonc` |
| 배포 파일 | `dist/eng`의 상담용 정적 파일 4개 + `apps/construction/worker.js` |
| 별도 D1·R2·기존 하모니 API | 사용하지 않음 |
| 앱 환경변수·비밀키 | 현재 가상 화면에는 불필요 |

Cloudflare에 새 Worker와 이 저장소를 연결하면 배포할 수 있는 구성입니다. Wrangler dry-run 통과는 실제 계정의 권한·저장소 연결·도메인 생성까지 완료됐다는 뜻은 아닙니다. 실제 배포와 계정 설정은 이번 작업에서 실행하지 않았습니다.

CLI로 직접 배포할 경우, Cloudflare 인증 후 `npm run deploy`를 사용합니다. 자동 빌드 시 `wrangler.jsonc`의 build 설정도 실행되므로 건설 화면이 항상 먼저 생성됩니다.

[Cloudflare 반영 가이드와 작업 결과](docs/eng-ops/README.md)

## 소스 복사 범위

원본 기준 커밋: `feed-mina/mom-asked-ops@73fefa7c00bd030681010ff61340fc55e9c053fd`.

사용자의 **공개 유지·소스만 복사** 선택에 따라 실행 코드·테스트·문서 구조를 복사했습니다. `picture/`, `output/pdf/`의 원본 사진·문서와 `.openai/hosting.json`의 원본 호스팅 연결 정보는 옮기지 않았습니다. 기존 공개 사이트의 PNG 이미지 6개는 개인정보 없는 예시 이미지로 대체했습니다. 새 ENG 배포에는 이 기존 사이트 자산도 포함되지 않습니다.

[소스 유래와 제외·변경 내역](docs/eng-ops/SOURCE.md)

원본 식당 업무 소스는 `public`, `apps/ops-app`, `apps/ops-web`, `apps/public-site` 등에 보존했습니다. 참고용 기존 실행은 `npm run dev:legacy`, 기존 빌드는 `npm run build:legacy`입니다. **`legacy:deploy:*`는 원본 하모니 설정을 대상으로 하므로 ENG 배포에 사용하지 않습니다.** 원본 소스 구조·설명은 [복사한 원본 README](docs/upstream/mom-asked-ops-README.md)에 있습니다.
