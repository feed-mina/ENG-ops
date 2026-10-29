import {SOURCES,SOURCE_VERSION,COST_KEYS,COST_LABELS,initialDraft,editDraft,editCost,applySource,reviewedDraft,missingConditions,canExportConfirmed,draftText} from './conditions.js';
const $=s=>document.querySelector(s);
let draft=initialDraft();
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const won=v=>v===null?'미기재':Number(v).toLocaleString('ko-KR')+'원';
const rows=[['초보 일급',...SOURCES.map(s=>won(s.daily))],['월급 지급 기준 하루 단가',...SOURCES.map(s=>won(s.monthlyDaily))],['일급 지급 시점',...SOURCES.map(s=>s.payment)],['숙소·식비',...SOURCES.map(s=>s.lodging)],['소개비',...SOURCES.map(s=>s.referral)],['안전교육비',...SOURCES.map(s=>won(s.education))],['안전화 구입비',...SOURCES.map(s=>won(s.shoes))]];
$('#source-table').innerHTML=rows.map(row=>'<tr>'+row.map((v,i)=>`<${i?'td':'th'}>${esc(v)}</${i?'td':'th'}>`).join('')+'</tr>').join('');
$('#source-cards').innerHTML=SOURCES.map(s=>`<article class="source-card"><span class="badge">자료 ${s.id}</span><h3>${esc(s.title)}</h3><p>${esc(s.filename)}</p><p><strong>근거 위치</strong><br>${esc(s.location)}</p><p>${s.conflicts.map(esc).join('<br>')}</p><span class="hint">적용 시점 미확인</span></article>`).join('');
$('#cost-fields').innerHTML=COST_KEYS.map(k=>`<div class="cost-row"><label>${COST_LABELS[k]} 부담<select data-cost="${k}" data-field="status"><option value="unknown">미확인</option><option value="free">무료로 확인(가상)</option><option value="not-required">해당 없음</option><option value="paid">비용 있음 · 확인 필요</option></select></label><label>금액(원)<input type="number" min="1" max="10000000" step="1" data-cost="${k}" data-field="amount" disabled></label><label>단위<select data-cost="${k}" data-field="unit" disabled><option value="unknown">미확인</option><option value="day">하루</option><option value="work-unit">1공수</option><option value="month">한 달</option><option value="once">1회</option></select></label></div>`).join('');
function sync(){
 for(const input of $('#consult-form').querySelectorAll('[name]'))input.value=draft[input.name];
 for(const input of $('#consult-form').querySelectorAll('[data-cost]')){
  const c=draft.costs[input.dataset.cost];input.value=c[input.dataset.field];
  if(input.dataset.field!=='status')input.disabled=c.status!=='paid';
 }
 $('#source-choice').value=draft.sourceId;
 $('#conditions-confirmed').checked=draft.conditionsConfirmed;
 $('#reviewed').checked=draft.reviewed;
 render();
}
function render(){
 const missing=missingConditions(draft),warnings=SOURCES.find(s=>s.id===draft.sourceId)?.conflicts||[];
 $('#missing-count').textContent=missing.length?`확인 필요 ${missing.length}개`:'입력 조건 확인 완료(가상)';
 $('#missing').innerHTML=missing.length?missing.map(t=>`<li>${esc(t)}</li>`).join(''):'<li>요약 원문 대조 후 확인 요약을 내려받을 수 있습니다.</li>';
 $('#revision').textContent=`조건 버전 ${draft.revision} · ${draft.reviewed&&draft.reviewedRevision===draft.revision?'현재 버전 원문 대조 완료':'원문 대조 필요'}`;
 $('#selected-source').textContent=draft.sourceId?`자료 ${draft.sourceId} · ${SOURCE_VERSION} · 금액은 확인 전 초안입니다.`:'참고 자료를 아직 적용하지 않았습니다.';
 $('#conflicts').innerHTML=warnings.length?'<strong>원본에서 확인한 충돌</strong><ul>'+warnings.map(t=>`<li>${esc(t)}</li>`).join('')+'</ul>':'자료를 선택하면 원본의 충돌 내용을 보여줍니다.';
 $('#download-confirmed').disabled=!canExportConfirmed(draft);
 $('#summary').textContent=draftText(draft,{confirmed:canExportConfirmed(draft)});
 $('#conditions-confirmed').checked=draft.conditionsConfirmed;$('#reviewed').checked=draft.reviewed;
}
function selectTab(id){
 for(const screen of document.querySelectorAll('.screen'))screen.hidden=screen.id!==id;
 for(const button of document.querySelectorAll('[data-tab]')){button.classList.toggle('on',button.dataset.tab===id);if(button.dataset.tab===id)button.setAttribute('aria-current','page');else button.removeAttribute('aria-current');}
 document.title=id==='sources'?'ENG-ops | 자료·조건 비교':'ENG-ops | 건설현장 상담 초안';
}
for(const button of document.querySelectorAll('[data-tab]'))button.addEventListener('click',()=>selectTab(button.dataset.tab));
$('#start').addEventListener('click',()=>{selectTab('consultation');$('#main').scrollIntoView({block:'start'});});
$('#consult-form').addEventListener('submit',e=>e.preventDefault());
$('#consult-form').addEventListener('input',event=>{
 const target=event.target;if(!target.matches('input[name]'))return;
 draft=editDraft(draft,target.name,target.value);render();
});
$('#consult-form').addEventListener('change',event=>{
 const target=event.target;
 if(target.matches('select[name]'))draft=editDraft(draft,target.name,target.value);
 else if(target.matches('[data-cost]')){draft=editCost(draft,target.dataset.cost,target.dataset.field,target.value);sync();return;}
 else if(target.id==='conditions-confirmed'){draft.conditionsConfirmed=target.checked;draft=reviewedDraft(draft,false);}
 else if(target.id==='reviewed')draft=reviewedDraft(draft,target.checked);
 else return;
 render();
});
$('#apply-source').addEventListener('click',()=>{try{draft=applySource(draft,$('#source-choice').value);sync();$('#feedback').textContent='자료 금액'+'만 초안에 넣었습니다. 지급일과 비용은 확인 후 선택해 주세요.';}catch(error){$('#feedback').textContent=error.message;}});
$('#fill-demo').addEventListener('click',()=>{
 const next=initialDraft();Object.assign(next,{workerId:'MOCK-WORKER-001',siteId:'MOCK-SITE-ANSAN',role:'조공',availableDate:next.recordDate,workHours:'8',breakMinutes:'60',education:'self-reported',shoes:'self-reported',lodgingPreference:'yes',companionCount:'0'});
 draft=applySource(next,'C');sync();$('#feedback').textContent='가상 예시를 채웠습니다. 지급일·준비 상태·비용은 미확인으로 남겨 두었습니다.';
});
function download(confirmed){try{
 const text=draftText(draft,{confirmed});const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=`ENG-ops-${confirmed?'reviewed':'draft'}-${draft.recordDate}.txt`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);$('#feedback').textContent=confirmed?'가상 확인 요약을 내려받았습니다.':'미확인 표시가 포함된 상담 초안을 내려받았습니다.';
}catch(error){$('#feedback').textContent=error.message;}}
$('#download-draft').addEventListener('click',()=>download(false));
$('#download-confirmed').addEventListener('click',()=>download(true));
$('#print-summary').addEventListener('click',()=>window.print());
sync();
