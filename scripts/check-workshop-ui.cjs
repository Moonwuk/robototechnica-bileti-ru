const { chromium }=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),base='http://127.0.0.1:4174/';
let server,browser,page;
(async()=>{
  fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
  server=spawn('python3',['-m','http.server','4174','--bind','127.0.0.1'],{cwd:path.join(root,'dist'),stdio:'ignore'});
  let ready=false;for(let i=0;i<40;i++){try{if((await fetch(base)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const go=async(route,selector)=>{await page.goto(base+'#'+route);await page.locator(selector).first().waitFor();if(route.startsWith('workshop-case/'))await page.waitForFunction(id=>document.querySelector('.question-tools span')?.textContent===id,route.split('/')[1]);if(route==='workshop-lab')await page.waitForFunction(()=>document.querySelector('[data-workshop-mode]')?.dataset.workshopMode==='lab');};
  const run=async()=>{await page.locator('[data-ws-action="run"]').click();await page.waitForFunction(()=>/Цикл завершён|Перенос не начат/.test(document.querySelector('#ws-result')?.textContent||''));};
  const noOverflow=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  await go('workshop','.ws-case-card');assert.equal(await page.locator('.ws-case-card').count(),5);await noOverflow();
  await go('workshop-lab','#ws-tcpX');await run();assert.match(await page.locator('#ws-result').textContent(),/4 из 4/);
  await page.locator('#ws-tcpX').evaluate(el=>{el.value=24;el.dispatchEvent(new Event('input',{bubbles:true}));});
  await run();assert.match(await page.locator('#ws-result').textContent(),/Перенос не начат/);
  const note='<script>window.workshopInjected=true</script> мой прогноз';await page.locator('#ws-prediction').fill(note);
  await page.reload();await page.locator('#ws-tcpX').waitFor();assert.equal(await page.locator('#ws-tcpX').inputValue(),'24');assert.equal(await page.locator('#ws-prediction').inputValue(),note);assert.equal(await page.evaluate(()=>window.workshopInjected),undefined);
  await page.locator('[data-ws-action="lab-reset"]').click();await run();assert.match(await page.locator('#ws-result').textContent(),/4 из 4/);
  await page.screenshot({path:path.join(root,'test-results/workshop-lab-mobile.png'),fullPage:true});await noOverflow();
  const cases=[['WS-01','tcp',['tcp','vacuum']],['WS-02','pallet',['pallet','tcp']],['WS-03','vacuum',['vacuum','signals']],['WS-04','input',['signals','vacuum']],['WS-05','tracking',['timing','tcp']]];
  for(const [id,cause,checks] of cases){
    await go('workshop-case/'+id,'#ws-hypothesis');await page.waitForFunction(id=>document.querySelector('.question-tools span')?.textContent===id,id);
    assert.equal(await page.locator('[data-ws-action="repair"]').isDisabled(),true);
    await run();assert.ok(!/4 из 4/.test(await page.locator('#ws-result').textContent()));
    for(const check of checks)await page.locator(`[data-ws-action="probe"][data-id="${check}"]`).click();
    await page.locator('#ws-hypothesis').selectOption(cause);
    if(id==='WS-01'){
      await page.locator('#ws-repair').selectOption('vacuum');await page.locator('[data-ws-action="repair"]').click();await run();await page.locator('[data-ws-action="assess"]').click();assert.match(await page.locator('#ws-verdict').textContent(),/не восстановлен/);
    }
    await page.locator('#ws-repair').selectOption(cause);await page.locator('[data-ws-action="repair"]').click();
    await page.locator('[data-ws-action="assess"]').click();assert.match(await page.locator('#ws-verdict').textContent(),/повторным прогоном/);
    await run();await page.locator('[data-ws-action="assess"]').click();assert.match(await page.locator('#ws-verdict').textContent(),/Диагноз подтверждён/);
    await noOverflow();
  }
  await page.locator('#ws-notes').fill('PRIVATE WORKSHOP NOTES');
  await page.getByRole('button',{name:'Сообщить об ошибке в сценарии'}).click();assert.match(await page.locator('#support-draft').inputValue(),/#workshop-case\/WS-05/);assert.ok(!(await page.locator('#support-draft').inputValue()).includes('PRIVATE'));await page.locator('#support-close').click();
  await page.reload();await page.locator('#ws-verdict').waitFor();assert.match(await page.locator('#ws-verdict').textContent(),/Диагноз подтверждён/);assert.equal(await page.locator('#ws-notes').inputValue(),'PRIVATE WORKSHOP NOTES');
  await page.locator('[data-ws-action="hint"]').click();assert.match(await page.locator('#ws-verdict').textContent(),/с подсказкой/);
  await page.evaluate(()=>window.roboticsNativeBack());await page.waitForURL('**/#workshop');await page.locator('.ws-case-card').first().waitFor();assert.equal(await page.locator('.ws-card-status').filter({hasText:/Диагноз подтверждён|Разобрано с подсказкой/}).count(),5);
  await page.setViewportSize({width:1440,height:1050});await go('workshop-case/WS-04','#ws-hypothesis');await page.screenshot({path:path.join(root,'test-results/workshop-diagnostic-desktop.png'),fullPage:true});await noOverflow();
  await page.emulateMedia({reducedMotion:'no-preference'});await go('workshop-lab','#ws-tcpX');await page.locator('[data-ws-action="run"]').click();await page.locator('[data-ws-action="pause"]').click();assert.equal(await page.locator('[data-ws-action="run"]').isEnabled(),true);assert.match(await page.locator('#ws-result').textContent(),/Выполняется/);await page.locator('[data-ws-action="step"]').click();await go('topics','.topic-card');
  assert.deepEqual(errors,[]);
  console.log('PASS: workshop desktop/mobile, physical failure and repair, all five diagnostic flows, stale-run invalidation, saved notes/parameters/results, escaped input, private issue context, native back, reduced motion, pause/step/navigation cleanup.');
})().catch(async e=>{console.error(e);if(page)await page.screenshot({path:path.join(root,'test-results/workshop-failure.png'),fullPage:true}).catch(()=>{});process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(server)server.kill('SIGTERM');});
