// 원본의 서로 다른 조건을 운영 확정값과 분리한다. 금액은 원문 기록이며 현재 단가가 아니다.
export const SOURCE_VERSION = 'construction-sources-2026-10-29-v1';
export const SOURCES = Object.freeze([
  Object.freeze({ id:'A', title:'기본 전화상담 매뉴얼', filename:'전화상담 메뉴얼.hwp', daily:110000, monthlyDaily:120000,
    payment:'근무 다음 날 / 토·일 근무분 월요일', lodging:'일급 1공수당 2,000원 / 월급 월 100,000원. 별도 비용 없다는 문구도 있음.',
    referral:'150,000원, 1회. 일급 50,000원씩 3회 / 월급 첫 달 공제.', education:40000, shoes:35000,
    conflicts:['숙소 별도 비용 없음과 숙식비 공제 안내가 함께 있습니다.'], location:'본문: 일급과 월급 / 소개비와 공수당 숙식비 / 교육·안전화 세부사항' }),
  Object.freeze({ id:'B', title:'전화상담 매뉴얼 · 기타양식', filename:'전화상담 메뉴얼_기타양식.hwp', daily:120000, monthlyDaily:130000,
    payment:'근무 다음 날 / 토·일 근무분 월요일', lodging:'별도 비용 없다는 설명과 공수에 따라 숙식비가 늘어난다는 설명 공존. 구체 단가 미기재.',
    referral:'150,000원, 1회. 일시납 120,000원 별도 표기.', education:50000, shoes:35000,
    conflicts:['숙식비 단가가 없어 무료인지 확인할 수 없습니다.','교육비가 A의 40,000원과 다릅니다.'], location:'본문: 급여 / 소개비 / 교육비 / 0.5공수 예시' }),
  Object.freeze({ id:'C', title:'건설현장 모집 글', filename:'사용자가 제공한 모집 텍스트', daily:155000, monthlyDaily:170000,
    payment:'제목: 당일 지급 / 본문: 근무 다음 날 지급', lodging:'안산·수원 숙식비 무료로 안내.',
    referral:'미기재', education:null, shoes:null,
    conflicts:['제목의 당일 지급과 본문의 익일 지급이 다릅니다.','17만 원은 월급 기준 하루 단가이고 28만 원은 기공·준기공의 최대 금액입니다.'], location:'제목 / 급여조건 / 숙소 항목' })
]);
export const MOCK_WORKERS = Object.freeze(['MOCK-WORKER-001','MOCK-WORKER-002']);
export const MOCK_SITES = Object.freeze(['MOCK-SITE-ANSAN','MOCK-SITE-SUWON']);
export const COST_KEYS = Object.freeze(['lodging','meals','educationCost','shoesCost','referral']);
export const COST_LABELS = Object.freeze({lodging:'숙소비',meals:'식비',educationCost:'교육비',shoesCost:'안전화 비용',referral:'소개비'});
export function kstDate(now = Date.now()){return new Date(now+9*3600000).toISOString().slice(0,10);}
export function initialDraft(){
 return {recordDate:kstDate(),workerId:'',siteId:'',role:'',availableDate:'',sourceId:'',sourceVersion:SOURCE_VERSION,
  payPlan:'daily',dailyRate:'',payTiming:'unknown',payDate:'',workHours:'',breakMinutes:'',overtime:'unknown',payer:'unknown',
  education:'unknown',shoes:'unknown',lodgingPreference:'unknown',companionCount:'0',
  costs:Object.fromEntries(COST_KEYS.map(k=>[k,{status:'unknown',amount:'',unit:'unknown'}])),
  conditionsConfirmed:false,reviewed:false,revision:1,reviewedRevision:null};
}
function clone(draft){return structuredClone(draft);}
export function editDraft(draft,field,value){
 if(!Object.hasOwn(initialDraft(),field)||['costs','sourceVersion','revision','reviewedRevision','reviewed','conditionsConfirmed'].includes(field))throw Error('허용되지 않은 입력 항목입니다.');
 const next=clone(draft);next[field]=String(value);next.revision++;next.reviewed=false;next.reviewedRevision=null;next.conditionsConfirmed=false;return next;
}
export function editCost(draft,key,field,value){
 if(!COST_KEYS.includes(key)||!['status','amount','unit'].includes(field))throw Error('허용되지 않은 비용 항목입니다.');
 const next=clone(draft);next.costs[key][field]=String(value);
 if(field==='status'&&value!=='paid'){next.costs[key].amount='';next.costs[key].unit='unknown';}
 next.revision++;next.conditionsConfirmed=false;next.reviewed=false;next.reviewedRevision=null;return next;
}
export function applySource(draft,sourceId){
 const source=SOURCES.find(x=>x.id===sourceId);if(!source)throw Error('자료를 먼저 선택해 주세요.');
 const next=editDraft(draft,'sourceId',sourceId);next.dailyRate=String(next.payPlan==='monthly'?source.monthlyDaily:source.daily);
 // 원본의 지급일·무료·공제 문구를 확정값으로 복사하지 않는다.
 next.payTiming='unknown';next.costs=initialDraft().costs;return next;
}
const number=(s,min,max)=>String(s).trim()!==''&&Number.isFinite(Number(s))&&Number(s)>=min&&Number(s)<=max;
const dateOk=s=>/^\d{4}-\d{2}-\d{2}$/.test(s)&&!Number.isNaN(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
export function missingConditions(draft){
 const items=[];
 if(!dateOk(draft.recordDate))items.push('상담 날짜를 확인해 주세요.');
 if(!MOCK_WORKERS.includes(draft.workerId))items.push('가상 상담 대상을 선택해 주세요.');
 if(!MOCK_SITES.includes(draft.siteId))items.push('가상 현장과 고용주를 선택해 주세요.');
 if(!['조공','준기공','기공'].includes(draft.role))items.push('희망 업무를 선택해 주세요.');
 if(!dateOk(draft.availableDate))items.push('근무 가능한 날짜를 확인해 주세요.');
 if(!SOURCES.some(s=>s.id===draft.sourceId))items.push('참고 자료를 선택하고 초안에 반영해 주세요.');
 if(!['daily','monthly'].includes(draft.payPlan))items.push('급여 지급 방식을 확인해 주세요.');
 if(!number(draft.dailyRate,1,1000000)||!Number.isInteger(Number(draft.dailyRate)))items.push('공제 전 하루 기준 금액을 확인해 주세요.');
 if(!['same-day','next-day','team-date'].includes(draft.payTiming))items.push('당일·익일 충돌을 확인하고 지급 시점을 선택해 주세요.');
 if(draft.payTiming==='team-date'&&!dateOk(draft.payDate))items.push('팀 급여일의 실제 지급 예정일을 확인해 주세요.');
 if(!number(draft.workHours,1,16))items.push('기본 근무시간을 확인해 주세요.');
 if(!number(draft.breakMinutes,0,240))items.push('별도 휴게시간을 확인해 주세요.');
 if(!['not-planned','separate-review'].includes(draft.overtime))items.push('잔업 예정 여부와 별도 확인 필요 상태를 선택해 주세요.');
 if(draft.payer!=='mock-employer')items.push('임금 지급 주체를 확인해 주세요.');
 if(draft.education!=='verified')items.push('교육 이수 응답과 이수증 확인을 구분해 확인해 주세요.');
 if(draft.shoes!=='verified')items.push('안전화 보유와 현장 적합 확인을 구분해 확인해 주세요.');
 if(!['yes','no'].includes(draft.lodgingPreference))items.push('숙소 생활 희망 여부를 확인해 주세요.');
 if(!number(draft.companionCount,0,10)||!Number.isInteger(Number(draft.companionCount)))items.push('동반 인원을 확인해 주세요.');
 for(const key of COST_KEYS){const c=draft.costs[key];
  if(!c||!['free','not-required','paid'].includes(c.status))items.push(`${COST_LABELS[key]} 부담을 확인해 주세요. 미확인은 무료가 아닙니다.`);
  else if(c.status==='paid'&&(!number(c.amount,1,10000000)||!Number.isInteger(Number(c.amount))||!['day','work-unit','month','once'].includes(c.unit)))items.push(`${COST_LABELS[key]}의 금액과 단위를 확인해 주세요.`);
 }
 if(draft.conditionsConfirmed!==true)items.push('가상 담당자의 조건 확인을 체크해 주세요.');
 return items;
}
export function reviewedDraft(draft,checked){const next=clone(draft);next.reviewed=Boolean(checked);next.reviewedRevision=checked?next.revision:null;return next;}
export function canExportConfirmed(draft){return missingConditions(draft).length===0&&draft.reviewed===true&&draft.reviewedRevision===draft.revision;}
export function sourceWarnings(draft){return SOURCES.find(s=>s.id===draft.sourceId)?.conflicts||[];}
const money=v=>number(v,0,1e8)?`${Number(v).toLocaleString('ko-KR')}원`:'미확인';
const unitLabels={day:'하루', 'work-unit':'1공수',month:'한 달',once:'1회'};
export function draftText(draft,{confirmed=false}={}){
 if(confirmed&&!canExportConfirmed(draft))throw Error('미확인 조건과 원문 대조를 먼저 확인해 주세요.');
 const missing=missingConditions(draft);
 const source=SOURCES.find(s=>s.id===draft.sourceId);
 return [confirmed?'ENG-ops 가상 상담 · 확인 요약':'ENG-ops 상담 초안 · 미확인 / 배정 불가',
  '가상 데이터로 검증하는 예시이며 실제 근무조건·계약·급여 확정 문서가 아닙니다.',
  `상담일: ${draft.recordDate}`,`상담 대상: ${MOCK_WORKERS.includes(draft.workerId)?draft.workerId:'미확인'}`,
  `현장: ${MOCK_SITES.includes(draft.siteId)?draft.siteId:'미확인'}`,`희망 업무: ${draft.role||'미확인'}`,`가능일: ${draft.availableDate||'미확인'}`,
  `참고 자료: ${source?source.id+' · '+source.filename:'미선택'} / ${SOURCE_VERSION}`,
  `원문 위치: ${source?.location||'미확인'}`,`조건 버전: ${draft.revision}`,
  `급여 방식: ${draft.payPlan==='monthly'?'월급 지급 기준 하루 단가':'일급'}`,`공제 전 하루 기준 금액: ${money(draft.dailyRate)}`,
  `지급 시점: ${({ 'same-day':'당일', 'next-day':'익일', 'team-date':'팀 급여일 '+(draft.payDate||'미확인') })[draft.payTiming]||'미확인'}`,
  `근무시간: ${draft.workHours||'미확인'}시간 / 별도 휴게 ${draft.breakMinutes||'미확인'}분`,
  `임금 지급 주체: ${draft.payer==='mock-employer'?'선택한 가상 현장의 고용주':'미확인'}`,
  `안전교육: ${draft.education==='verified'?'이수증 확인 완료(가상)':draft.education==='self-reported'?'이수했다고 응답 / 증빙 미확인':'미확인'}`,
  `안전화: ${draft.shoes==='verified'?'보유·현장 적합 확인 완료(가상)':draft.shoes==='self-reported'?'보유했다고 응답 / 현장 적합 미확인':'미확인'}`,
  `숙소 희망: ${{yes:'예',no:'아니오'}[draft.lodgingPreference]||'미확인'} / 동반 ${draft.companionCount}명(동반자 별도 상담 필요)`,
  ...COST_KEYS.map(k=>{const c=draft.costs[k];return `${COST_LABELS[k]}: ${c?.status==='free'?'무료로 확인(가상)':c?.status==='not-required'?'해당 없음':c?.status==='paid'?money(c.amount)+' / '+(unitLabels[c.unit]||'단위 미확인'):'미확인'}`;}),
  '실제 입금액: 계산하지 않음. 급여 공제 승인·시간·세금 등 확인 전 비용을 자동 차감하지 않습니다.',
  '잔업 3시간 = 0.5공수는 원본의 설명이며 이 상담의 자동 급여 산식이 아닙니다.',
  '원본 충돌 기록:',...sourceWarnings(draft).map(t=>'- '+t),
  '다시 확인할 것:',...(missing.length?missing.map(t=>'- '+t):['- 입력 조건 확인 완료(가상). 실제 배정·저장 기능은 제공하지 않습니다.']),
  `원문 대조: ${draft.reviewed&&draft.reviewedRevision===draft.revision?'현재 버전 확인':'확인 필요'}`].join('\n');
}
