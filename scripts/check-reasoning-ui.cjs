const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),base='http://127.0.0.1:4175/';
let server,browser,page;
(async()=>{
  fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
  server=spawn('python3',['-m','http.server','4175','--bind','127.0.0.1'],{cwd:path.join(root,'dist'),stdio:'ignore'});
  let ready=false;for(let i=0;i<40;i++){try{if((await fetch(base)).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,100));}assert.ok(ready);
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  page=await browser.newPage({viewport:{width:390,height:844},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const go=async(route,mode)=>{await page.goto(base+'#'+route);if(mode)await page.waitForFunction(mode=>document.querySelector('[data-reason-mode]')?.dataset.reasonMode===mode,mode);else await page.locator('.reason-case-card').first().waitFor();};
  const click=action=>page.locator(`[data-reason-action="${action}"]`).click();
  const overflow=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
  const param=async(key,value)=>page.locator('#reason-param-'+key).evaluate((el,v)=>{el.value=v;el.dispatchEvent(new Event('input',{bubbles:true}));},value);
  await go('reasoning');assert.equal(await page.locator('.reason-case-card').count(),6);await overflow();
  await go('mobile-lab','mobile');await click('lab-run');assert.match(await page.locator('#reason-observation').textContent(),/2 м/);await overflow();
  await page.locator('.reason-settings details summary').click();await param('slip',25);assert.equal(await page.locator('[data-reason-action="play"]').isDisabled(),true);await click('lab-run');assert.match(await page.locator('#reason-observation').textContent(),/1,5 м/);
  const note='<img src=x onerror="window.reasonInjected=true"> PRIVATE REASONING NOTES';await page.locator('#reason-notes').fill(note);await page.reload();await page.locator('#reason-notes').waitFor();assert.equal(await page.locator('#reason-notes').inputValue(),note);assert.equal(await page.locator('#reason-param-slip').inputValue(),'25');assert.equal(await page.evaluate(()=>window.reasonInjected),undefined);
  await click('lab-run');await page.screenshot({path:path.join(root,'test-results/reasoning-mobile-lab.png'),fullPage:true});await overflow();
  await go('conveyor-lab','conveyor');await page.locator('#reason-mode').selectOption('level');await click('lab-run');assert.match(await page.locator('#reason-observation').textContent(),/12/);await overflow();
  await param('speed',250);await click('lab-run');assert.match(await page.locator('#reason-observation').textContent(),/24/);
  await page.locator('#reason-mode').selectOption('edge');await click('lab-run');assert.match(await page.locator('#reason-observation').textContent(),/Итог счётчика3/);
  await page.locator('#reason-time').evaluate(el=>{el.value=50;el.dispatchEvent(new Event('input',{bubbles:true}));});assert.equal(await page.locator('#reason-time-label').textContent(),'50%');await click('play');assert.equal(await page.locator('#reason-time-label').textContent(),'100%');
  const cases=[['MR-01','wheels',['drive','geometry']],['MR-02','radius',['drive','geometry']],['MR-03','base',['drive','turn','geometry']],['MR-04','traction',['drive','geometry','floor']],['PL-01','filter',['trace','slow']],['PL-02','edge',['trace','slow']]];
  for(const [id,cause,checks] of cases){
    await go('reasoning-case/'+id,id);assert.equal(await page.locator('#reason-scene svg').count(),0);assert.equal(await page.locator('[data-reason-action="experiment"]').isDisabled(),true);
    await page.locator('#reason-hypothesis').selectOption('undecided');await click('experiment');assert.equal(await page.locator('[data-reason-record]').count(),0);
    for(const test of checks){
      await page.locator('#reason-test').selectOption(test);await page.locator('#reason-prediction').selectOption('unsure');await click('experiment');assert.equal(await page.locator(`[data-reason-record="${test}"]`).count(),1);assert.equal(await page.locator('#reason-prediction').count(),0);
    }
    await page.locator('#reason-hypothesis').selectOption(cause);await page.locator('input[name="reason-conclusion"][value="evidence"]').check();
    if(id==='MR-01'){await page.locator('#reason-repair').selectOption('traction');await click('verify');assert.match(await page.locator('#reason-verdict').textContent(),/не пройдена/);}
    await page.locator('#reason-repair').selectOption(cause);await click('assess');assert.match(await page.locator('#reason-verdict').textContent(),/новая проверка/);await click('verify');assert.match(await page.locator('#reason-verdict').textContent(),/Причина подтверждена/);
    assert.equal(await page.locator('.reason-validation-list .pass').count(),2);await overflow();
  }
  await page.locator('#reason-notes').fill(note);await page.getByRole('button',{name:'Сообщить об ошибке в сценарии'}).click();assert.match(await page.locator('#support-draft').inputValue(),/#reasoning-case\/PL-02/);assert.ok(!(await page.locator('#support-draft').inputValue()).includes('PRIVATE'));await page.locator('#support-close').click();
  await page.reload();await page.locator('#reason-verdict').waitFor();assert.match(await page.locator('#reason-verdict').textContent(),/Причина подтверждена/);assert.equal(await page.locator('#reason-notes').inputValue(),note);assert.equal(await page.evaluate(()=>window.reasonInjected),undefined);
  await page.locator('#reason-repair').selectOption('filter');await page.locator('#reason-repair').selectOption('edge');assert.doesNotMatch(await page.locator('#reason-verdict').textContent(),/Причина подтверждена/);await click('verify');
  await page.locator('#reason-solution summary').click();await page.waitForFunction(()=>document.querySelector('#reason-verdict').textContent.includes('с помощью'));await page.evaluate(()=>window.roboticsNativeBack());await page.waitForURL('**/#reasoning');await page.locator('.reason-case-card').first().waitFor();assert.equal(await page.locator('.reason-card-status').filter({hasText:/Причина подтверждена|Разобрано с помощью/}).count(),6);
  await page.setViewportSize({width:1440,height:1100});await go('reasoning-case/PL-02','PL-02');await page.screenshot({path:path.join(root,'test-results/reasoning-conveyor-desktop.png'),fullPage:true});await overflow();
  await page.emulateMedia({reducedMotion:'no-preference'});await go('mobile-lab','mobile');await click('lab-run');await click('play');await click('play');assert.equal(await page.locator('[data-reason-action="play"]').textContent(),'Воспроизвести');await click('play');await page.goto(base+'#topics');await page.locator('.topic-card').first().waitFor();
  await page.goto(base+'#reasoning-case/invalid');await page.getByRole('heading',{name:'Задание не найдено',exact:true}).waitFor();
  assert.deepEqual(errors,[]);
  console.log('PASS: two labs, six diagnosis flows, prediction gating, first predictions, independent evidence, repair validation, saved notes, escaping, private feedback, mobile layout, reduced motion, playback cleanup and Android Back.');
})().catch(async e=>{console.error(e);if(page)await page.screenshot({path:path.join(root,'test-results/reasoning-failure.png'),fullPage:true}).catch(()=>{});process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(server)server.kill('SIGTERM');});
