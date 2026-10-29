import { mockData } from "/mock-data.js";
import { calculateFee, complianceTone, daysUntil, rankWorkers, validateJobRequest } from "/domain.js";
import { downloadLedgerWorkbook } from "/excel-export.js";

const main = document.querySelector("#main-content");
const toast = document.querySelector("#toast");
const state = {
  selectedJobId: mockData.jobRequests[0].id,
  completedTasks: new Set(),
  selectedDocument: mockData.documents[0].file,
  documentContents: null,
  aiApproved: false
};

const adminRoutes = [
  ["dashboard", "오늘의 업무", "◫"],
  ["jobs", "식당 구인", "식"],
  ["workers", "근로자", "인"],
  ["matching", "매칭·배정", "↔"],
  ["ledger", "요금·장부", "₩"],
  ["compliance", "준법 캘린더", "✓"],
  ["field-audit", "현장 실사", "현"],
  ["documents", "Mock 문서함", "문"],
  ["ai", "AI 실증", "AI"],
  ["audit", "감사기록", "록"]
];

const labels = {
  verified: "검증 완료", blocked: "차단", open: "진행 전", recorded: "기록 완료",
  introduced: "소개 확인 중", contract_confirmed: "계약 확인", employed: "취업 완료",
  valid: "확인 유효", expired: "확인 만료", "not-required": "해당 없음", "mock-only": "Mock 전용",
  "mock-ready": "Mock 준비", "user-approved": "사용자 공개 승인", "original-required": "원본 확인 필요"
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}

function won(value) {
  return `${Number(value).toLocaleString("ko-KR")}원`;
}

function chip(value, tone) {
  const className = tone ? `chip chip-${tone}` : "chip";
  return `<span class="${className}">${escapeHtml(labels[value] ?? value)}</span>`;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => toast.classList.remove("is-visible"), 3600);
}

function currentRoute() {
  const hash = window.location.hash.replace("#", "");
  if (adminRoutes.some(([route]) => route === hash)) return hash;
  return "public";
}

function renderPublic() {
  document.body.dataset.mode = "public";
  return `
    <div class="public-page">
      <section class="hero" aria-labelledby="hero-title">
        <div>
          <p class="eyebrow">사당동 · 식당 인력소개</p>
          <h1 id="hero-title">일손과 일할 분을,<br><em>조건부터 정확하게.</em></h1>
          <p class="hero-lead">하모니직업소개소는 식당이 제시한 근로조건과 일할 분의 가능 조건을 확인해 고용계약 체결을 알선합니다. 근로계약·현장 지휘·임금 지급의 주체는 식당입니다.</p>
          <div class="hero-actions">
            <a class="button" href="#public-process">이용 절차 보기</a>
            <a class="button button-ghost" href="#dashboard">Mock 운영 화면 체험</a>
          </div>
          <p class="hero-note">문의전화 010-9124-2537은 사용자 제공·공개 승인 정보이며, 등록 원본과 운영시간은 현장에서 별도로 확인합니다.</p>
        </div>
        <aside class="hero-card" aria-label="근로조건 요약 예시">
          <span class="card-label">MOCK 근로조건 요약</span>
          <h2>식당과 근로자에게<br>같은 조건을 전달합니다.</h2>
          <div class="condition-list">
            <div class="condition-row"><span>근무일</span><strong>2026. 7. 18. 토요일</strong></div>
            <div class="condition-row"><span>시간</span><strong>10:00–16:00 · 휴게 30분</strong></div>
            <div class="condition-row"><span>업무</span><strong>주방보조 · 식품취급</strong></div>
            <div class="condition-row"><span>임금</span><strong>일당 90,000원 · 식당 직접 지급</strong></div>
          </div>
          <span class="verified-pill">✓ 양측 전화 확인 후 소개 확정</span>
        </aside>
      </section>

      <section class="section" aria-labelledby="trust-title">
        <div class="section-heading">
          <h2 id="trust-title">소개에 꼭 필요한 정보만,<br>순서대로 확인합니다.</h2>
          <p>주민등록번호나 신분증 원본을 받는 방식이 아니라 근무 가능 조건과 확인 상태를 중심으로 기록하는 것을 목표로 합니다.</p>
        </div>
        <div class="feature-grid">
          <article class="feature-card"><span class="number">01</span><h3>근로조건 먼저</h3><p>근무 날짜·시간·휴게·업무·임금·지급일을 빠짐없이 확인합니다.</p></article>
          <article class="feature-card"><span class="number">02</span><h3>필요 정보만</h3><p>식품취급 업무의 보건증은 원문이 아닌 확인 여부와 만료일만 관리합니다.</p></article>
          <article class="feature-card"><span class="number">03</span><h3>사람이 최종 결정</h3><p>검색과 추천은 보조 수단이며, 양측 확인과 최종 소개는 운영자가 수행합니다.</p></article>
        </div>
      </section>

      <section id="public-process" class="section section-forest" aria-labelledby="process-title">
        <div class="section-heading">
          <h2 id="process-title">식당과 일할 분,<br>각자의 이용 절차</h2>
          <p>소개소가 직접 고용하거나 지휘하는 방식이 아니라 양측이 근로조건을 확인하고 계약하도록 연결합니다.</p>
        </div>
        <div class="process-grid">
          <article class="process-card"><h3>식당</h3><ol class="process-list"><li>사업자와 담당자 정보를 확인합니다.</li><li>날짜·시간·업무·임금·지급방법을 접수합니다.</li><li>소개받을 후보의 최소정보를 확인합니다.</li><li>근로계약을 체결하고 임금을 직접 지급합니다.</li></ol></article>
          <article class="process-card"><h3>일할 분</h3><ol class="process-list"><li>가능 날짜·지역·업무·희망임금을 접수합니다.</li><li>필요한 자격의 확인 상태만 기록합니다.</li><li>소개 전 확정 근로조건을 전화로 확인합니다.</li><li>식당과 근로계약을 체결하고 근무합니다.</li></ol></article>
        </div>
      </section>

      <section class="section" aria-labelledby="info-title">
        <div class="info-panel">
          <div>
            <p class="eyebrow">사업장 안내</p>
            <h3 id="info-title">하모니직업소개소</h3>
            <dl class="info-list">
              <div><dt>도로명주소</dt><dd>${escapeHtml(mockData.company.roadAddress)}</dd></div>
              <div><dt>지번주소</dt><dd>${escapeHtml(mockData.company.lotAddress)}</dd></div>
              <div><dt>우편번호</dt><dd>${escapeHtml(mockData.company.postalCode)}</dd></div>
              <div><dt>개업일</dt><dd>${escapeHtml(mockData.company.openedOn)}</dd></div>
            </dl>
          </div>
          <div class="disabled-cta">
            <div><strong>전화로 상담하세요</strong><p>${escapeHtml(mockData.company.phoneStatus)}<br>운영시간은 전화로 먼저 확인해 주세요.</p><a class="button" href="tel:01091242537">010-9124-2537</a></div>
          </div>
        </div>
      </section>
    </div>`;
}

function adminNavigation(route) {
  return `<aside class="admin-sidebar"><div class="admin-profile"><strong>모의 운영자</strong><span>인증 비활성 · 합성 데이터 전용</span></div><nav class="side-nav" aria-label="내부 업무 메뉴">${adminRoutes.map(([key, label, icon]) => `<a href="#${key}" ${key === route ? 'aria-current="page"' : ""}><span aria-hidden="true">${icon}</span>${label}</a>`).join("")}</nav></aside>`;
}

function pageTitle(title, description) {
  return `<div class="page-title"><div><h1>${title}</h1><p>${description}</p></div><span class="date-chip">Mock 기준일 ${mockData.meta.asOf}</span></div>`;
}

function renderDashboard() {
  const verifiedJobs = mockData.jobRequests.filter((job) => job.status === "verified").length;
  const urgent = mockData.complianceTasks.filter((task) => daysUntil(mockData.meta.asOf, task.dueDate) <= 7).length;
  return `${pageTitle("오늘의 업무", "구인·배정·준법 일정을 한눈에 확인합니다.")}
    <section class="metric-grid" aria-label="업무 현황">
      <article class="metric"><span>검증된 구인</span><strong>${verifiedJobs}</strong><small>차단 1건</small></article>
      <article class="metric"><span>가용 근로자</span><strong>${mockData.workers.length}</strong><small>전원 가명</small></article>
      <article class="metric"><span>진행 중 소개</span><strong>${mockData.placements.length}</strong><small>계약 확인 1건</small></article>
      <article class="metric"><span>7일 내 준법업무</span><strong>${urgent}</strong><small>확인 필요</small></article>
    </section>
    <div class="dashboard-grid">
      <div><section class="panel"><div class="panel-header"><div><h2>다가오는 구인</h2><p>검증 완료된 요청만 배정할 수 있습니다.</p></div><a href="#jobs" class="button button-small button-ghost">전체 보기</a></div>${jobTable(mockData.jobRequests)}</section>
      <section class="panel"><div class="panel-header"><div><h2>최근 감사기록</h2><p>조회·수정·요금 기록을 추적합니다.</p></div></div>${auditTimeline(mockData.auditEvents.slice(0, 3))}</section></div>
      <div><section class="panel"><div class="panel-header"><div><h2>우선 확인</h2><p>마감이 가까운 순서입니다.</p></div></div><div class="card-list">${mockData.complianceTasks.sort((a,b) => a.dueDate.localeCompare(b.dueDate)).slice(0, 3).map(complianceCard).join("")}</div></section>
      <section class="panel"><div class="notice"><strong>Mock 보안 경계</strong><br>이 화면은 인증이 없는 기능 검증용입니다. 실제 개인정보를 입력하거나 운영에 사용하지 마세요.</div></section></div>
    </div>`;
}

function jobTable(jobs) {
  return `<div class="table-wrap"><table><thead><tr><th>요청</th><th>식당</th><th>근무</th><th>임금</th><th>상태</th></tr></thead><tbody>${jobs.map((job) => `<tr><td><strong>${job.id}</strong><br>${escapeHtml(job.role)}</td><td>${escapeHtml(job.restaurantName)}<br><small>${escapeHtml(job.area)}</small></td><td>${job.workDate}<br><small>${escapeHtml(job.timeLabel)}</small></td><td>${won(job.dailyWage)}</td><td>${chip(job.status, job.status === "blocked" ? "danger" : "")}</td></tr>`).join("")}</tbody></table></div>`;
}

function renderJobs() {
  return `${pageTitle("식당 구인", "사업자·근로조건 검증 결과와 차단 사유를 확인합니다.")}<div class="filter-bar"><p class="notice">${escapeHtml(mockData.meta.mockMinimumHourlyWageLabel)}</p><span>${mockData.jobRequests.length}건</span></div><section class="card-list">${mockData.jobRequests.map((job) => {
    const result = validateJobRequest(job, mockData.meta);
    return `<article class="list-card"><div><h3>${escapeHtml(job.restaurantName)} · ${escapeHtml(job.role)}</h3><p>${job.workDate} · ${escapeHtml(job.timeLabel)} · ${escapeHtml(job.periodLabel)}</p><div class="meta"><span>근무지 ${escapeHtml(job.area)}</span><span>일당 ${won(job.dailyWage)}</span><span>식품취급 ${job.foodHandling ? "예" : "아니오"}</span></div>${result.ok ? "" : `<ul class="validation-list">${result.blockers.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`}</div><div>${result.ok ? chip("verified") : chip("blocked", "danger")}</div></article>`;
  }).join("")}</section>`;
}

function renderWorkers() {
  return `${pageTitle("근로자", "소개에 필요한 최소정보와 확인 상태만 표시합니다.")}<p class="notice">주민등록번호·신분증 원본·건강진단 상세결과는 수집하지 않습니다. 아래 이름과 번호는 모두 가명·마스킹 예시입니다.</p><section class="card-list" style="margin-top:18px">${mockData.workers.map((worker) => `<article class="list-card"><div><h3>${escapeHtml(worker.displayName)}</h3><p>${escapeHtml(worker.phoneMasked)} · ${worker.memberType === "daily" ? "일용 회원제" : "일반 구직"}</p><div class="meta"><span>${worker.roles.map(escapeHtml).join(" · ")}</span><span>선호 ${worker.preferredAreas.map(escapeHtml).join(" · ")}</span><span>희망 ${won(worker.minimumDailyWage)} 이상</span></div></div><div>${chip(worker.healthCertificateStatus, worker.healthCertificateStatus === "expired" ? "danger" : "")}</div></article>`).join("")}</section>`;
}

function renderMatching() {
  const job = mockData.jobRequests.find((item) => item.id === state.selectedJobId) ?? mockData.jobRequests[0];
  const validation = validateJobRequest(job, mockData.meta);
  const candidates = rankWorkers(job, mockData.workers);
  return `${pageTitle("매칭·배정", "조건 일치 이유와 차단 사유를 보여주며 최종 결정은 운영자가 합니다.")}
    <div class="filter-bar"><label for="job-select"><strong>구인 요청 선택</strong></label><select id="job-select" class="select">${mockData.jobRequests.map((item) => `<option value="${item.id}" ${item.id === job.id ? "selected" : ""}>${item.id} · ${escapeHtml(item.restaurantName)}</option>`).join("")}</select></div>
    ${validation.ok ? "" : `<p class="notice">이 구인은 검증 미완료로 소개 확정이 차단됩니다: ${validation.blockers.map(escapeHtml).join(", ")}</p>`}
    <div class="matching-grid" style="margin-top:18px"><aside class="job-summary"><span class="chip chip-mock">MOCK 요청</span><h2>${escapeHtml(job.role)} ${job.headcount}명</h2><dl><div><dt>식당</dt><dd>${escapeHtml(job.restaurantName)}</dd></div><div><dt>근무</dt><dd>${job.workDate} · ${escapeHtml(job.timeLabel)}</dd></div><div><dt>지역</dt><dd>${escapeHtml(job.area)}</dd></div><div><dt>임금</dt><dd>${won(job.dailyWage)} · 식당 직접 지급</dd></div></dl></aside>
    <section class="panel"><div class="panel-header"><div><h2>후보 ${candidates.length}명</h2><p>규칙 기반 정렬 · 자동 배정 없음</p></div></div>${candidates.map((candidate) => `<article class="candidate"><div class="candidate-top"><div><strong>${escapeHtml(candidate.displayName)}</strong><br><small>${candidate.eligible ? "소개 후보" : "확인/차단 항목 있음"}</small></div><span class="score">${candidate.score}점</span></div><div class="reason-row">${candidate.reasons.map((reason) => `<span class="reason">${escapeHtml(reason)}</span>`).join("")}${candidate.blockers.map((reason) => `<span class="reason reason-block">${escapeHtml(reason)}</span>`).join("")}</div></article>`).join("")}</section></div>`;
}

function renderLedger() {
  return `${pageTitle("요금·장부", "계약 확인 전 청구와 Mock 상한 초과를 규칙으로 차단합니다.")}<div class="export-toolbar"><div><strong>점검자료 내보내기</strong><span>현재 화면을 PDF로 인쇄하거나 장부별 Excel(.xlsx)을 생성합니다.</span></div><div><button class="button button-small button-ghost" type="button" data-export-pdf>PDF 내보내기</button><button class="button button-small" type="button" data-export-excel>Excel 내보내기</button></div></div><p class="notice">요금률과 회원회비는 Mock 설정값입니다. 운영 전 최신 고시와 관할기관 확인이 필요합니다.</p><section class="panel" style="margin-top:18px"><div class="panel-header"><div><h2>소개요금 검증</h2><p>버튼을 눌러 상태 기반 검증 결과를 확인합니다.</p></div></div>${mockData.placements.map((placement) => `<article class="fee-card"><div><h3>${placement.id} · ${escapeHtml(placement.restaurantName)}</h3><p>${escapeHtml(placement.workerName)} · 상태 ${labels[placement.state]} · 임금 ${won(placement.wage)} · 요청요금 ${won(placement.requestedFee)}</p></div><button class="button button-small button-ghost" type="button" data-fee="${placement.id}">요금 검증</button></article>`).join("")}</section><section class="panel"><div class="panel-header"><div><h2>Mock 금전출납부</h2><p>실제 결제·회계자료가 아닙니다.</p></div></div><div class="table-wrap"><table><thead><tr><th>일자</th><th>구분</th><th>상대</th><th>금액</th><th>방법</th><th>상태</th></tr></thead><tbody>${mockData.ledger.map((entry) => `<tr><td>${entry.date}</td><td>${escapeHtml(entry.type)}</td><td>${escapeHtml(entry.counterparty)}</td><td><strong>${won(entry.amount)}</strong></td><td>${escapeHtml(entry.method)}</td><td>${chip(entry.status)}</td></tr>`).join("")}</tbody></table></div></section>`;
}

function complianceCard(task) {
  const days = daysUntil(mockData.meta.asOf, task.dueDate);
  const complete = state.completedTasks.has(task.id);
  const tone = complete ? "neutral" : complianceTone(days);
  return `<article class="list-card"><div><h3>${escapeHtml(task.title)}</h3><p>${escapeHtml(task.rule)}</p><div class="meta"><span>기한 ${task.dueDate}</span><span>${days >= 0 ? `D-${days}` : `${Math.abs(days)}일 지남`}</span><span>담당 ${escapeHtml(task.owner)}</span></div></div><button class="button button-small ${complete ? "button-ghost" : ""}" type="button" data-task="${task.id}">${complete ? "Mock 완료" : tone === "warning" || tone === "danger" ? "확인 필요" : "Mock 완료 처리"}</button></article>`;
}

function renderCompliance() {
  return `${pageTitle("준법 캘린더", "기한·담당자·증빙을 Mock 자료로 연결합니다.")}<p class="notice">완료 처리는 브라우저를 새로고침하면 초기화되는 데모 상태입니다. 실제 관할기관 제출을 의미하지 않습니다.</p><section class="card-list" style="margin-top:18px">${mockData.complianceTasks.map(complianceCard).join("")}</section>`;
}

function renderFieldAudit() {
  const audit = mockData.fieldAudit;
  return `${pageTitle("현장 실사 Mock", "실제 원본과 업무를 확인하기 전에 필요한 항목과 흐름을 합성 자료로 점검합니다.")}
    <p class="notice">${escapeHtml(audit.mode)}입니다. Mock 준비와 실제 원본 확인 완료를 구분합니다.</p>
    <section class="field-audit-summary" aria-label="현장 실사 요약">
      <article><span>공개 결정</span><strong>0003.png 공개</strong><small>${escapeHtml(audit.publicAssetDecision)}</small></article>
      <article><span>전화</span><strong>${escapeHtml(mockData.company.publicPhone)}</strong><small>${escapeHtml(mockData.company.phoneStatus)}</small></article>
      <article><span>운영시간</span><strong>확인 필요</strong><small>${escapeHtml(mockData.company.hoursStatus)}</small></article>
    </section>
    <section class="panel"><div class="panel-header"><div><h2>증빙 준비 상태</h2><p>Mock 문서가 있어도 실제 원본 확인을 대신하지 않습니다.</p></div><a class="button button-small button-ghost" href="#documents">Mock 문서함</a></div>
      <div class="evidence-grid">${audit.evidence.map((item) => `<article><div>${chip(item.status, item.status === "original-required" ? "danger" : item.status === "user-approved" ? "verified" : "mock")}</div><h3>${escapeHtml(item.label)}</h3><p>${escapeHtml(item.detail)}</p></article>`).join("")}</div>
    </section>
    <section class="panel"><div class="panel-header"><div><h2>대표 업무 흐름 3가지</h2><p>실제 현장 인터뷰에서 순서와 예외 처리를 교체합니다.</p></div></div>
      <div class="workflow-grid">${audit.workflows.map((workflow) => `<article class="workflow-card"><span class="chip chip-mock">MOCK</span><h3>${escapeHtml(workflow.label)}</h3><p>${escapeHtml(workflow.summary)}</p><ol>${workflow.steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol></article>`).join("")}</div>
    </section>
    <section class="boundary-grid">
      <article class="panel"><h2>식당이 하는 일</h2><ul>${audit.restaurantResponsibilities.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></article>
      <article class="panel"><h2>소개소가 하는 일</h2><ul>${audit.agencyResponsibilities.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></article>
    </section>
    <section class="panel"><div class="panel-header"><div><h2>현장에서 꼭 확인할 것</h2><p>답을 받기 전에는 실제 확인 완료로 표시하지 않습니다.</p></div></div><ul class="question-list">${audit.unresolvedQuestions.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul></section>`;
}

function renderDocuments() {
  const selected = mockData.documents.find((document) => document.file === state.selectedDocument);
  return `${pageTitle("Mock 문서함", "실제 증빙 대신 형식과 만료·검토 흐름을 검증합니다.")}<div class="doc-grid"><div class="doc-list">${mockData.documents.map((document) => `<button class="doc-button" type="button" data-document="${document.file}" aria-pressed="${document.file === state.selectedDocument}"><strong>${escapeHtml(document.title)}</strong><span>${escapeHtml(document.category)} · 실제 제출 불가</span></button>`).join("")}</div><section class="document-preview"><div class="panel-header"><div><h2>${escapeHtml(selected.title)}</h2><p>${escapeHtml(selected.file)}</p></div>${chip("mock-only", "mock")}</div>${state.documentContents ? `<pre>${escapeHtml(state.documentContents)}</pre>` : `<div class="empty"><p>문서를 선택하면 비식별 JSON Mock 원문을 불러옵니다.</p><button class="button button-small button-ghost" type="button" data-document="${selected.file}">Mock 문서 열기</button></div>`}</section></div>`;
}

function renderAi() {
  return `${pageTitle("AI 실증", "OCR·음성메모·매칭 보조를 사람 승인 전제로 시뮬레이션합니다.")}<p class="notice">${escapeHtml(mockData.aiLab.modelPolicy)}</p><section class="ai-source" style="margin-top:18px"><span class="chip chip-mock">가림 처리된 Mock 수기 메모</span><blockquote>“${escapeHtml(mockData.aiLab.sourceNote)}”</blockquote></section><section class="panel"><div class="panel-header"><div><h2>OCR 필드 후보</h2><p>원문 위치와 신뢰도를 표시합니다.</p></div><button class="button button-small" type="button" data-ai-approve ${state.aiApproved ? "disabled" : ""}>${state.aiApproved ? "Mock 승인 완료" : "사람 검수 후 승인"}</button></div><div class="confidence-grid">${mockData.aiLab.extracted.map((item) => `<article class="confidence-card"><header><strong>${escapeHtml(item.field)}</strong><span>${Math.round(item.confidence * 100)}%</span></header><div class="confidence-bar"><i style="width:${Math.round(item.confidence * 100)}%"></i></div><p>후보값 ${escapeHtml(item.value)} · 원문 “${escapeHtml(item.source)}”</p></article>`).join("")}</div></section><section class="panel"><div class="panel-header"><div><h2>통화 후 음성메모 구조화</h2><p>통화 자체를 녹음하지 않는 우선안</p></div></div><p>${escapeHtml(mockData.aiLab.voiceMemo)}</p><div class="reason-row"><span class="reason">식당: 목련식당 (모의)</span><span class="reason">날짜: 토요일</span><span class="reason">업무: 주방보조</span><span class="reason">재확인: 근로자 조건</span></div></section>`;
}

function auditTimeline(events) {
  return `<div class="timeline">${events.map((event) => `<div class="timeline-item"><time>${escapeHtml(event.at.split(" ")[1])}</time><span class="timeline-dot"></span><p><strong>${escapeHtml(event.action)}</strong><br>${escapeHtml(event.target)} · ${escapeHtml(event.detail)}</p></div>`).join("")}</div>`;
}

function renderAudit() {
  return `${pageTitle("감사기록", "개인정보 조회·상태변경·요금 기록의 추적 예시입니다.")}<section class="panel">${auditTimeline(mockData.auditEvents)}</section><section class="panel"><p class="notice">Mock 로그는 변경 불가능한 운영 감사저장이 아닙니다. 실제 구축에서는 운영 DB와 분리된 접근제어·보존정책이 필요합니다.</p></section>`;
}

function renderAdmin(route) {
  document.body.dataset.mode = "admin";
  const content = {
    dashboard: renderDashboard, jobs: renderJobs, workers: renderWorkers, matching: renderMatching,
    ledger: renderLedger, compliance: renderCompliance, "field-audit": renderFieldAudit, documents: renderDocuments, ai: renderAi, audit: renderAudit
  }[route]?.() ?? renderDashboard();
  return `<div class="admin-shell">${adminNavigation(route)}<div class="admin-main"><div class="admin-alert"><strong>Mock 내부 업무시스템</strong><span>인증·영구저장이 없는 기능 검증용입니다. 실제 개인정보 입력 금지.</span></div>${content}</div></div>`;
}

function render() {
  const route = currentRoute();
  main.innerHTML = route === "public" ? renderPublic() : renderAdmin(route);
  if (window.location.hash === "#public-process") requestAnimationFrame(() => document.querySelector("#public-process")?.scrollIntoView());
  else window.scrollTo({ top: 0, behavior: "instant" });
}

main.addEventListener("change", (event) => {
  if (event.target.matches("#job-select")) {
    state.selectedJobId = event.target.value;
    render();
  }
});

main.addEventListener("click", async (event) => {
  if (event.target.closest("[data-export-excel]")) {
    downloadLedgerWorkbook(mockData);
    showToast("장부별 워크시트가 포함된 Mock Excel(.xlsx) 파일을 생성했습니다.");
    return;
  }
  if (event.target.closest("[data-export-pdf]")) {
    showToast("인쇄 창에서 ‘PDF로 저장’을 선택해 주세요.");
    window.print();
    return;
  }
  const feeButton = event.target.closest("[data-fee]");
  if (feeButton) {
    const placement = mockData.placements.find((item) => item.id === feeButton.dataset.fee);
    const result = calculateFee({ placementState: placement.state, payer: placement.payer, wage: placement.wage, requestedFee: placement.requestedFee });
    showToast(`${result.ok ? "통과" : "차단"}: ${result.message}`);
    return;
  }
  const taskButton = event.target.closest("[data-task]");
  if (taskButton) {
    const id = taskButton.dataset.task;
    if (state.completedTasks.has(id)) state.completedTasks.delete(id); else state.completedTasks.add(id);
    render();
    showToast("Mock 상태만 변경되었습니다. 실제 제출 완료가 아닙니다.");
    return;
  }
  const documentButton = event.target.closest("[data-document]");
  if (documentButton) {
    state.selectedDocument = documentButton.dataset.document;
    try {
      const response = await fetch(`/mock-documents/${state.selectedDocument}`);
      state.documentContents = await response.text();
    } catch {
      state.documentContents = "Mock 문서를 불러오지 못했습니다.";
    }
    render();
    return;
  }
  if (event.target.closest("[data-ai-approve]")) {
    state.aiApproved = true;
    render();
    showToast("사람 검수 승인 흐름을 시뮬레이션했습니다. 운영 DB에는 저장되지 않습니다.");
  }
});

window.addEventListener("hashchange", render);
render();
