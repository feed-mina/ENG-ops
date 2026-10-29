# 사업자 증빙 OCR 필드와 준법 검토 경계

> 기준일: 2026-07-27. 실제 첨부 이미지·OCR 원문·등록번호·성명·생년월일·상세주소·공제 식별번호는 저장소와 GitHub에 넣지 않는다. 아래 예시는 모두 합성 값이며 운영 증빙이 아니다.

## 문서별 필드 구조

| 문서 종류 | 관찰되는 필드 유형 | OCR 처리 | 준법 대장 후보 |
|---|---|---|---|
| 사업자등록증 | 등록번호, 상호, 대표자, 개업일, 소재지, 업태, 종목, 발급일 | 등록번호·상호·대표자·상세주소 즉시 마스킹 | 문서 종류, 검토 상태, 발급일, 확인자 |
| 직업소개사업 등록증 | 등록·신고번호, 명칭, 소재지, 대표자, 생년월일, 등록일, 발급기관 | 등록번호·명칭·대표자·생년월일·상세주소 즉시 마스킹 | 문서 종류, 검토 상태, 발급일, 확인자 |
| 공제증서 | 공제번호, 피공제자·계약자, 주민번호 일부, 사무소 주소, 금액, 공제기간, 발급기관 | 공제번호·성명·주민번호·상세주소 즉시 마스킹 | 문서 종류, 검토 상태, 발급일, 만료일, 확인자 |

## 구조화 후보와 식당 접수 비교

| OCR 후보 | 식당 접수 대상 | 처리 |
|---|---|---|
| 합성 상호 별칭 | `businessName` | 원본 대조 후 운영자가 별도 입력 |
| 합성 업태·종목 | `industry` | 업무 관련 최소 요약만 사람 확인 |
| 합성 개업일 | 대상 없음 | 참고 후보로만 유지 |
| 마스킹 등록번호 | 대상 없음 | 원문 복사 금지, 원본 대조 후 `businessNumber` 별도 입력 |
| 마스킹 상세주소 | 대상 없음 | 원문 복사 금지, 필요한 주소를 별도 확인 입력 |

OCR 결과는 `normalizeRestaurantIntake()`를 호출하지 않으며 `businessVerified`, `permitVerified`, `minimumWageVerified`를 바꿀 수 없다.

## 준법 증빙 레코드

각 증빙은 다음 값만 가진다.

- `documentType`: `business-registration`, `employment-agency-registration`, `mutual-aid-certificate`
- `verificationStatus`: `mock-only`, `pending-original-review`, `verified-by-human`, `expired`
- `issuedOn`: 발급일
- `expiresOn`: 만료일이 있는 문서만 입력
- `verifiedBy`: 실제 운영에서는 승인된 확인자 내부 식별자
- `sourceRecord`: 원본 파일이 아닌 관리대장 참조명

원본 대조 전에는 `verified-by-human`으로 바꾸지 않는다. OCR만으로 자동 검증하지 않는다.

## 법령·운영 참고자료

| 참고자료 | 현재 상태 | 운영 반영 조건 |
|---|---|---|
| 최저임금 안내표 | `unverified-reference` | 공식 출처와 시행일을 확인한 뒤 별도 규칙 변경·테스트 |
| 소개요금 고시 | `pending-official-verification` | 공식 법령 원문의 고시 번호·시행일·개정 여부 확인 후 버전 등록 |
| 행동강령 | `unverified-reference` | 전문을 복제하지 않고 법령 준수·권익 보호·교육·공정성·자율시정만 요약 |

공식 원문 대조 전에는 `public/domain.js`의 `MOCK_FEE_RULES`와 Mock 최저임금 설정을 변경하지 않는다.

## 처리 순서

1. OCR 텍스트는 메모리에서 `analyzeBusinessEvidenceOcrText()`로 즉시 마스킹한다.
2. 원문 이미지와 OCR 원문은 저장하지 않는다.
3. 합성 후보만 `normalizeBusinessEvidenceOcrReview()`로 검증한다.
4. 원본을 사람이 확인한 뒤 준법 증빙대장의 상태·발급일·만료일·확인자를 기록한다.
5. 필요한 최소 항목은 식당 접수표에 별도로 입력한다.
6. OCR 결과만으로 식당 생성·사업자 검증·소개요금·최저임금 규칙 변경을 수행하지 않는다.