# harmony-public

하모니직업소개소의 공개 홍보 사이트입니다. 내부 업무 시스템과 코드·배포 경계를 분리하며 Cloudflare Pages 프로젝트 `harmony-work`에 배포합니다.

- Build command: `npm run build:public`
- Build output: `dist/public-site`
- Pages project: `harmony-work`
- Default URL: `https://harmony-work.pages.dev`

`PUBLIC_SITE_URL`은 canonical, Open Graph URL, `robots.txt`, `sitemap.xml`, JSON-LD URL의 단일 기준입니다. 값은 path·query·fragment·credentials가 없는 HTTPS 공개 origin이어야 하며 `*.workers.dev`는 거부합니다. 값이 없으면 위 Default URL을 사용합니다.

문의전화 `010-9124-2537`과 `picture/0003.png` 연락 안내 이미지는 사용자의 명시적 공개 지시에 따라 사용합니다. `0003.png`에는 전화번호와 계좌정보가 포함되어 있다는 사실을 자산 결정 기록에 남깁니다. 운영시간은 확인되지 않아 전화 문의로 안내하고, 온라인 개인정보 접수는 보안 게이트 완료 전까지 제공하지 않습니다.

공개 사이트에는 선별한 사무실·외관·연락 안내·워드마크·공로패 이미지를 복사해 사용합니다. 구주소 또는 공개 승인을 받지 않은 개인정보가 포함된 이미지는 사용하지 않습니다.

빌드 단계는 `robots.txt`와 `sitemap.xml`을 생성하고 `/index.html`·`/privacy.html`을 clean URL로 301 이동시키는 `_redirects`를 포함합니다. 구조화 데이터는 `LocalBusiness`로만 발행하며 공개 상호·승인 전화·동일 출처 대표 이미지·URL에 더해 원본 확인(2026-07-17, GitHub #30)을 마친 도로명주소(`address`)와 소개 지역(`areaServed` 동작구·관악구·서초구)을 포함합니다. 우편번호, 영업시간, 등록번호, `EmploymentAgency`, `JobPosting`은 넣지 않습니다.

```powershell
npm.cmd run test:seo
```

사업장 사실 확인 상태와 Google·네이버 표기 점검은 [`docs/operations/public-business-profile-checklist.md`](../../docs/operations/public-business-profile-checklist.md)에 기록합니다.
