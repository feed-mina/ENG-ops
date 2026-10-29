# 소스 유래와 복사 범위

- 원본: `https://github.com/feed-mina/mom-asked-ops`
- 기준 커밋: `73fefa7c00bd030681010ff61340fc55e9c053fd`
- 대상: `https://github.com/feed-mina/ENG-ops`, main
- 사용자 결정: 공개 저장소 유지, 개인정보가 포함된 원본 사진·문서와 해당 사본 제외 또는 대체
- 작업일: 2026-10-29 한국시간

## 그대로 보존한 기반

식당 업무 정적 화면, 내부 Worker와 데이터 스키마, SDUI(서버 정의 화면) 구성, 상담 프롬프트, 출력 도구, 기존 테스트와 운영 문서의 소스 구조를 복사했습니다. 원본 저장소에 대한 쓰기는 수행하지 않았습니다.

## 제외

| 경로 | 이유 |
|---|---|
| `picture/` 전체 | 원본 사업장·명함 등 이미지의 공개 범위를 새 저장소로 확대하지 않음 |
| `output/pdf/` 전체 | 기존 원본 문서의 별도 공개 복사를 제외 |
| `.openai/hosting.json` | 기존 호스팅 프로젝트의 연결 식별정보를 새 프로젝트에 재사용하지 않음 |

## 대체한 파일

`apps/public-site/assets/`의 `harmony-award.png`, `harmony-contact-card.png`, `harmony-exterior.png`, `harmony-office.png`, `harmony-wordmark.png`와 `apps/public-site/og.png`는 개인정보가 없는 새 예시 PNG로 대체했습니다. 이미지 안에도 예시이며 원본 사진·개인정보가 포함되지 않았다고 표시했습니다.

## ENG 전용 변경

- `apps/construction/`, `packages/construction/`: 자료 비교와 가상 상담 초안
- `scripts/build-eng.mjs`, `wrangler.jsonc`: ENG만 빌드·배포. 원본 서비스 바인딩 없음
- `package.json`: 기본 dev/build/deploy는 ENG. 기존 명령은 legacy로 구분
- `package-lock.json`: ENG 패키지 이름 반영. 의존성 버전 유지
- `scripts/check.mjs`: 새 소스도 검사
- `tests/construction*`: 새 기능과 실제 브라우저 검증
- README·본 문서·Cloudflare 가이드: 새 프로젝트 실행 기준

이 작업은 원본의 전체 Git 커밋 이력이나 이슈를 복제하는 fork가 아니라 기준 커밋의 소스 스냅샷을 새 저장소로 옮긴 것입니다. 원본 README에 있는 운영 URL·상태·사진 공개 승인 기록은 원본 프로젝트의 과거 기록이며 ENG-ops의 운영 승인이나 실제 배포 상태를 의미하지 않습니다.
