export const mockData = {
  meta: {
    isMock: true,
    asOf: "2026-07-16",
    warning: "화면의 사람·식당·문서·금액은 전부 합성 데이터이며 실제 제출·영업에 사용할 수 없습니다.",
    mockMinimumHourlyWage: 11000,
    mockMinimumHourlyWageLabel: "Mock 검증값 11,000원 — 법정 최저임금 아님"
  },
  company: {
    name: "하모니직업소개소",
    postalCode: "07025",
    roadAddress: "서울특별시 동작구 남부순환로 2069 (사당동)",
    lotAddress: "서울특별시 동작구 사당동 1044-13",
    openedOn: "2015-01-28",
    publicPhone: "010-9124-2537",
    phoneStatus: "사용자 제공·홈페이지 공개 승인 / 원본 미확인",
    hoursStatus: "현장 확인 전 미정"
  },
  restaurants: [
    { id: "R-MOCK-001", name: "목련식당 (모의)", area: "사당", businessVerified: true, permitVerified: true, arrearsCheck: "clear" },
    { id: "R-MOCK-002", name: "늘봄찬방 (모의)", area: "이수", businessVerified: true, permitVerified: true, arrearsCheck: "clear" },
    { id: "R-MOCK-003", name: "테스트분식 (모의·차단)", area: "방배", businessVerified: false, permitVerified: false, arrearsCheck: "pending" }
  ],
  workers: [
    {
      id: "W-MOCK-001", displayName: "김모아 (가명)", phoneMasked: "010-****-0101", roles: ["주방보조", "설거지"],
      preferredAreas: ["사당", "이수"], availableDates: ["2026-07-18", "2026-07-19"], minimumDailyWage: 85000,
      healthCertificateStatus: "valid", healthCertificateExpiresOn: "2026-11-30", consentStatus: "mock-consented", memberType: "daily"
    },
    {
      id: "W-MOCK-002", displayName: "이도움 (가명)", phoneMasked: "010-****-0202", roles: ["홀서빙", "주방보조"],
      preferredAreas: ["사당", "방배"], availableDates: ["2026-07-18", "2026-08-01"], minimumDailyWage: 90000,
      healthCertificateStatus: "valid", healthCertificateExpiresOn: "2027-01-15", consentStatus: "mock-consented", memberType: "general"
    },
    {
      id: "W-MOCK-003", displayName: "박온기 (가명)", phoneMasked: "010-****-0303", roles: ["설거지"],
      preferredAreas: ["사당"], availableDates: ["2026-07-18"], minimumDailyWage: 80000,
      healthCertificateStatus: "expired", healthCertificateExpiresOn: "2026-06-30", consentStatus: "mock-consented", memberType: "daily"
    },
    {
      id: "W-MOCK-004", displayName: "최한결 (가명)", phoneMasked: "010-****-0404", roles: ["홀서빙"],
      preferredAreas: ["이수"], availableDates: ["2026-08-01"], minimumDailyWage: 95000,
      healthCertificateStatus: "not-required", healthCertificateExpiresOn: null, consentStatus: "mock-consented", memberType: "general"
    }
  ],
  jobRequests: [
    {
      id: "J-MOCK-0718-A", restaurantId: "R-MOCK-001", restaurantName: "목련식당 (모의)", role: "주방보조", headcount: 1,
      workDate: "2026-07-18", periodLabel: "하루", timeLabel: "10:00–16:00 · 휴게 30분", area: "사당", workplaceAddress: "서울 동작구 사당로 MOCK",
      dailyWage: 90000, hourlyRate: 16364, foodHandling: true, businessVerified: true, wageVerified: true, arrearsCheck: "clear", status: "verified"
    },
    {
      id: "J-MOCK-0801-B", restaurantId: "R-MOCK-002", restaurantName: "늘봄찬방 (모의)", role: "홀서빙", headcount: 1,
      workDate: "2026-08-01", periodLabel: "1개월", timeLabel: "12:00–20:00 · 휴게 60분", area: "이수", workplaceAddress: "서울 동작구 동작대로 MOCK",
      dailyWage: 100000, monthlyWage: 2400000, hourlyRate: 14286, foodHandling: false, businessVerified: true, wageVerified: true, arrearsCheck: "clear", status: "verified"
    },
    {
      id: "J-MOCK-BLOCKED", restaurantId: "R-MOCK-003", restaurantName: "테스트분식 (모의·차단)", role: "설거지", headcount: 1,
      workDate: "2026-07-19", periodLabel: "하루", timeLabel: "09:00–18:00 · 휴게 미입력", area: "방배", workplaceAddress: "",
      dailyWage: 64000, hourlyRate: 8000, foodHandling: true, businessVerified: false, wageVerified: false, arrearsCheck: "pending", status: "blocked"
    }
  ],
  placements: [
    { id: "P-MOCK-001", jobId: "J-MOCK-0718-A", workerId: "W-MOCK-001", workerName: "김모아 (가명)", restaurantName: "목련식당 (모의)", state: "contract_confirmed", wage: 90000, payer: "employer", requestedFee: 27000, updatedAt: "2026-07-15 14:10" },
    { id: "P-MOCK-002", jobId: "J-MOCK-0801-B", workerId: "W-MOCK-004", workerName: "최한결 (가명)", restaurantName: "늘봄찬방 (모의)", state: "introduced", wage: 2400000, payer: "employer", requestedFee: 720000, updatedAt: "2026-07-15 15:25" }
  ],
  ledger: [
    { id: "L-MOCK-001", date: "2026-07-15", type: "소개요금", counterparty: "목련식당 (모의)", amount: 27000, method: "계좌이체 (모의)", placementId: "P-MOCK-001", status: "recorded" },
    { id: "L-MOCK-002", date: "2026-07-15", type: "일용회원 회비", counterparty: "김모아 (가명)", amount: 40000, method: "현금 (모의)", placementId: "-", status: "recorded" }
  ],
  complianceTasks: [
    { id: "C-MOCK-001", title: "보증보험 갱신 준비", dueDate: "2026-10-31", evidence: "mock-guarantee-insurance.json", owner: "대표자", rule: "만료일까지 갱신 · 증빙 10일 이내 제출", status: "open" },
    { id: "C-MOCK-002", title: "2026 대표자·종사자 교육 확인", dueDate: "2026-09-30", evidence: "mock-training-certificate.json", owner: "운영자", rule: "연 4시간 기준 · 수료증 보관", status: "open" },
    { id: "C-MOCK-003", title: "반기 자체점검", dueDate: "2026-07-22", evidence: "mock-inspection-checklist.json", owner: "대표자", rule: "관할기관 지도점검 대비", status: "open" },
    { id: "C-MOCK-004", title: "문의전화 원본·운영시간 확인", dueDate: "2026-07-18", evidence: "mock-field-audit-report.json", owner: "현장확인", rule: "전화 공개 승인과 원본 확인을 구분 · 운영시간은 확인 전 미정", status: "open" }
  ],
  fieldAudit: {
    mode: "사용자 제공 정보와 합성 자료를 사용한 비대면 Mock 실사",
    publicAssetDecision: "0003.png 공개 승인 · 전화번호와 계좌정보 포함 사실 기록",
    evidence: [
      { label: "직업소개사업 등록증", status: "mock-ready", detail: "원본 대조 필요" },
      { label: "사업자등록증", status: "mock-ready", detail: "새 Mock 생성 · 원본 대조 필요" },
      { label: "보증보험 증권", status: "mock-ready", detail: "가입금액·만료일 원본 확인 필요" },
      { label: "교육 수료증", status: "mock-ready", detail: "실제 수료일 확인 필요" },
      { label: "문의전화", status: "user-approved", detail: "공개 승인 · 등록/원본 확인 별도" },
      { label: "운영시간·휴무일", status: "original-required", detail: "현장 확인 전 미정" }
    ],
    workflows: [
      { label: "하루 근무", summary: "당일 조건 확인과 출근 결과 중심", steps: ["식당 구인 접수", "조건·사업자 확인", "후보 연락", "양측 전화 확인", "식당과 근로자 계약", "식당 직접 임금 지급", "결과·요금 기록"] },
      { label: "1개월 근무", summary: "계약기간·지급일·변경사항까지 확인", steps: ["기간·월임금 접수", "사업자·최저임금 확인", "장기근무 후보 연락", "양측 조건 확인", "근로계약서 작성", "식당 근태·임금 관리", "취업·요금 기록"] },
      { label: "회원제 일용근로자", summary: "회원명부·소개기록·회비를 분리 기록", steps: ["회원 조건 등록", "회원 약정 확인", "식당 요청 대조", "양측 전화 확인", "하루 근로계약", "식당 직접 임금 지급", "회원·소개·회비 기록"] }
    ],
    restaurantResponsibilities: ["근로계약", "현장 지휘와 안전 안내", "근로시간 확인", "임금 계산과 직접 지급"],
    agencyResponsibilities: ["구인·구직 접수", "조건 검증", "후보 연락과 양측 확인", "소개·요금 장부 기록"],
    unresolvedQuestions: ["실제 운영시간과 휴무일", "실제 종사자와 교육 수료일", "보험 증권번호·만료일", "현재 수첩·서식의 필수항목", "취소·결근·사고·분쟁 처리"]
  },
  documents: [
    { id: "D-MOCK-001", title: "직업소개사업 등록증 Mock", file: "mock-business-registration.json", category: "등록", status: "mock-only", expiresOn: null },
    { id: "D-MOCK-002", title: "사업자등록증 Mock", file: "mock-business-certificate.json", category: "등록", status: "mock-only", expiresOn: null },
    { id: "D-MOCK-003", title: "보증보험 증권 Mock", file: "mock-guarantee-insurance.json", category: "보험", status: "mock-only", expiresOn: "2026-10-31" },
    { id: "D-MOCK-004", title: "교육 수료증 Mock", file: "mock-training-certificate.json", category: "교육", status: "mock-only", expiresOn: null },
    { id: "D-MOCK-005", title: "현장점검표 Mock", file: "mock-inspection-checklist.json", category: "점검", status: "mock-only", expiresOn: null },
    { id: "D-MOCK-006", title: "현장 실사 결과 Mock", file: "mock-field-audit-report.json", category: "현장실사", status: "mock-only", expiresOn: null },
    { id: "D-MOCK-007", title: "대표 업무 흐름 Mock", file: "mock-workflow-scenarios.json", category: "업무흐름", status: "mock-only", expiresOn: null }
  ],
  auditEvents: [
    { at: "2026-07-16 16:20", actor: "mock-owner", action: "PUBLIC_ASSET_APPROVED", target: "picture/0003.png", detail: "사용자 공개 승인 · 전화·계좌정보 포함 사실 기록" },
    { at: "2026-07-16 16:10", actor: "mock-operator", action: "FIELD_AUDIT_MOCK_CREATED", target: "AUDIT-MOCK-2026-001", detail: "사업자·증빙·3개 업무흐름 Mock 작성" },
    { at: "2026-07-15 15:25", actor: "mock-operator", action: "PLACEMENT_STATE_UPDATED", target: "P-MOCK-002", detail: "contacting → introduced" },
    { at: "2026-07-15 14:12", actor: "mock-owner", action: "FEE_RECORDED", target: "L-MOCK-001", detail: "27,000원 · 계약확인 후" },
    { at: "2026-07-15 11:03", actor: "mock-operator", action: "WORKER_VIEWED", target: "W-MOCK-001", detail: "최소정보 화면 조회" }
  ],
  aiLab: {
    sourceNote: "7/18 목련 주방 10-4 휴게30 9만, 김모아 가능, 보건증 11월까지",
    extracted: [
      { field: "workDate", value: "2026-07-18", confidence: 0.97, source: "7/18" },
      { field: "role", value: "주방보조", confidence: 0.91, source: "주방" },
      { field: "time", value: "10:00–16:00", confidence: 0.88, source: "10-4" },
      { field: "dailyWage", value: "90,000원", confidence: 0.96, source: "9만" },
      { field: "healthCertificate", value: "2026-11 만료 확인 후보", confidence: 0.72, source: "보건증 11월까지" }
    ],
    voiceMemo: "목련식당에서 토요일 주방보조 한 분 요청. 10시부터 4시, 휴게 30분, 일당 9만원. 김모아 님께 조건 다시 확인 필요.",
    modelPolicy: "규칙 기반 Mock 결과. 외부 모델 전송 없음 · 자동 저장/배정 금지"
  }
};
