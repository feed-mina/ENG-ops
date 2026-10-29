const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const base=process.env.TEST_BASE_URL||'http://127.0.0.1:18810';
 if(new URL(base).hostname!=='127.0.0.1')throw Error('local only');
 const browser=await chromium.launch({executablePath:process.env.TEST_CHROMIUM||'/tmp/wc-chromium',headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu']});
 try{
 const context=await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true});
 const page=await context.newPage(),errors=[],apiCalls=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/'))apiCalls.push(r.url())});
 await page.goto(base);await page.getByRole('heading',{name:'어떤 조건이 서로 다른가요?'}).waitFor();
 assert((await page.locator('#source-table').innerText()).includes('155,000원'));
 for(const width of [1280,420]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'source comparison page overflow '+width);}
 fs.mkdirSync('test-artifacts',{recursive:true});await page.screenshot({path:'test-artifacts/eng-sources-mobile.png',fullPage:true});
 await page.locator('#start').click();assert(await page.locator('#download-confirmed').isDisabled());
 await page.locator('#fill-demo').click();assert.equal(await page.locator('[name=dailyRate]').inputValue(),'155000');
 assert.equal(await page.locator('[name=payTiming]').inputValue(),'unknown');assert.equal(await page.locator('[data-cost=lodging][data-field=status]').inputValue(),'unknown');
 assert((await page.locator('#conflicts').innerText()).includes('당일'));
 await page.locator('[name=payTiming]').selectOption('next-day');await page.locator('[name=payer]').selectOption('mock-employer');await page.locator('[name=overtime]').selectOption('not-planned');await page.locator('[name=education]').selectOption('verified');await page.locator('[name=shoes]').selectOption('verified');
 for(const key of ['lodging','meals','educationCost','shoesCost','referral'])await page.locator(`[data-cost=${key}][data-field=status]`).selectOption('not-required');
 await page.locator('#conditions-confirmed').check();assert(await page.locator('#download-confirmed').isDisabled());
 await page.locator('#reviewed').check();assert(await page.locator('#download-confirmed').isEnabled());
 const download=page.waitForEvent('download');await page.locator('#download-confirmed').click();const file=await download;const body=fs.readFileSync(await file.path(),'utf8');assert(body.includes('확인 요약'));assert(body.includes('실제 입금액: 계산하지 않음'));assert(body.includes('자료 위치')||body.includes('원문 위치'));
 await page.locator('[name=dailyRate]').fill('160000');assert(await page.locator('#download-confirmed').isDisabled());assert(!await page.locator('#reviewed').isChecked());assert(!await page.locator('#conditions-confirmed').isChecked());
 const draftDownload=page.waitForEvent('download');await page.locator('#download-draft').click();const draft=await draftDownload;assert(fs.readFileSync(await draft.path(),'utf8').includes('미확인 / 배정 불가'));
 for(const width of [1280,420]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'consultation overflow '+width);await page.screenshot({path:`test-artifacts/eng-consultation-${width}.png`,fullPage:true});}
 await page.reload();await page.locator('#start').click();assert.equal(await page.locator('[name=dailyRate]').inputValue(),'','reload clears unsaved draft');assert(await page.locator('#download-confirmed').isDisabled());
 assert.deepEqual(apiCalls,[]);assert.deepEqual(errors,[]);
 console.log('PASS browser: source comparison, unresolved conflicts, manual verification, local TXT exports, stale-review invalidation, reload reset, no API calls, 1280/420 overflow 0');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exit(1)});
