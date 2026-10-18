// Release checks through the actual DOM, including every circuit and a full exam.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {spawn}=require('node:child_process');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),base='http://127.0.0.1:4183/',KEY='robototehnika-bileti-ru:progress:v1';
let browser,server;
(async()=>{
  const {circuitProblems}=await import(pathToFileURL(path.join(root,'circuits-data.js')));
  const bank=JSON.parse(fs.readFileSync(path.join(root,'data/question_bank.json')));
  const extra=JSON.parse(fs.readFileSync(path.join(root,'data/teo/question_bank.json')));
  const questions=new Map([...bank.questions,...extra.questions].map(q=>[q.id,q]));
  server=spawn('python3',['-m','http.server','4183','--bind','127.0.0.1'],{cwd:path.join(root,'dist'),stdio:'ignore'});
  for(let i=0;i<50;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({viewport:{width:390,height:844}});
  const page=await context.newPage(),errors=[],failed=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)failed.push(r.url()+':'+r.status());});
  const go=async(route,selector='main h1')=>{await page.goto(base+'#'+route);await page.locator(selector).first().waitFor();};
  const overflow=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false,'Horizontal page overflow: '+page.url());
  let steps=0;
  for(const p of circuitProblems){
    await go('circuit/'+p.id,'#calc-summary');
    for(const s of p.steps){await page.locator('#calc-'+s.id).fill(String(s.answer));steps++;}
    await page.locator('[data-calc-action="check-all"]').click();
    assert.match(await page.locator('#calc-summary').textContent(),/Все шаги верны/);
    assert.equal(await page.locator('[aria-invalid="true"]').count(),0);
    await overflow();
  }
  await go('circuit/kvl-02','#calc-i');
  await page.locator('#calc-i').fill('');
  await page.locator('#calc-i').pressSequentially('30 MA');
  assert.equal(await page.locator('#calc-i').inputValue(),'30 MA');
  await page.locator('#calc-i').press('Enter');
  assert.equal(await page.locator('#calc-i').getAttribute('aria-invalid'),'true');
  await page.reload();await page.locator('#calc-i').waitFor();
  assert.equal(await page.locator('#calc-i').inputValue(),'30 MA');
  assert.equal(await page.locator('#calc-i').getAttribute('aria-invalid'),'true');
  await page.locator('#calc-i').fill('30 мА');await page.locator('#calc-i').press('Enter');
  assert.match(await page.locator('#result-i').textContent(),/Верно/);
  await page.locator('[data-calc-action="check-all"]').click();
  assert.match(await page.locator('#calc-summary').textContent(),/Все шаги верны/);
  for(const t of [...bank.topics,...extra.topics]){
    await go('topic/'+t.id,'#topic-difficulty');
    assert.equal(await page.locator('#topic-difficulty option:checked').isDisabled(),false);
    await overflow();
  }
  // Complete an actual multi-question exam: changes stay private until finish.
  await go('tickets','#ticket-mode');await page.locator('#ticket-mode').selectOption('exam');
  const ticket=JSON.parse(fs.readFileSync(path.join(root,'data/tickets.json'))).tickets[0];
  await page.locator(`[data-action="begin-ticket"][data-id="${ticket.id}"]`).click();
  await page.waitForURL('**/#session');
  let initial=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
  const before=Object.keys(initial.questions).length;
  for(let i=0;i<ticket.question_ids.length;i++){
    const active=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).active,KEY);
    const q=questions.get(active.questionIds[active.index]);
    const wrong=q.options.find(o=>o.id!==q.correct_option_id).id;
    await page.locator(`.answer[data-id="${wrong}"]`).click();
    await page.locator(`.answer[data-id="${q.correct_option_id}"]`).click();
    assert.equal(await page.locator('.answer-state').textContent(),'Ваш выбор');
    assert.equal(await page.evaluate(key=>Object.keys(JSON.parse(localStorage.getItem(key)).questions).length,KEY),before);
    if(i===1){await page.reload();await page.locator('#next-question').waitFor();}
    await page.locator('#next-question').click();
  }
  await page.waitForURL('**/#results');
  const saved=await page.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
  assert.equal(saved.sessions.length,1);
  assert.equal(saved.sessions[0].correct,ticket.question_ids.length);
  assert.equal(saved.sessions[0].total,ticket.question_ids.length);
  assert.ok(ticket.question_ids.every(id=>saved.questions[id].attempts===1));
  await page.reload();await page.locator('main h1').waitFor();
  assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).sessions.length,KEY),1);
  for(const viewport of [{width:390,height:844},{width:768,height:1024},{width:1440,height:980}]){
    await page.setViewportSize(viewport);
    for(const route of ['first-steps','tickets','topics','teo','circuits','practice','workshop','reasoning','service','progress','mistakes']){
      await go(route);await overflow();assert.equal(await page.locator('.loading-panel').count(),0);
    }
  }
  for(const route of ['topic/missing','path/missing','circuit/missing','exercise/missing','teo-calc/missing','service-case/missing','reasoning-case/missing']){
    await go(route);assert.equal(await page.locator('.loading-panel').count(),0);
  }
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
  const repair=await browser.newContext({viewport:{width:390,height:844}});
  await repair.addInitScript(({key,id})=>{
    localStorage.setItem(key,JSON.stringify({version:1,questions:{[id]:{attempts:1,correct:1,streak:1,lastCorrect:true,lastHinted:false,needsReview:false,lastAt:1,reviewAt:2},BROKEN:null},sessions:[null],completed:{},active:{title:'Broken'}}));
  },{key:KEY,id:bank.questions[0].id});
  const p=await repair.newPage();const repairErrors=[];p.on('pageerror',e=>repairErrors.push(e.message));
  await p.goto(base);await p.locator('.stats-strip').waitFor();
  assert.equal(await p.locator('.loading-panel').count(),0);
  assert.equal(await p.locator('#storage-warning').isVisible(),true);
  const recovered=await p.evaluate(key=>JSON.parse(localStorage.getItem(key)),KEY);
  assert.equal(recovered.questions[bank.questions[0].id].attempts,1);
  assert.equal(recovered.questions.BROKEN,undefined);assert.equal(recovered.active,null);
  assert.deepEqual(repairErrors,[]);
  // Missing dependencies must show a retry instead of a permanent loading screen.
  const broken=await browser.newContext();await broken.route('**/teo-core.js*',route=>route.abort());
  const bad=await broken.newPage();await bad.goto(base);await bad.locator('#reload').waitFor();
  assert.equal(await bad.locator('main h1').textContent(),'Не удалось загрузить вопросы');
  console.log(`PASS: ${circuitProblems.length} circuits / ${steps} steps, SI regression and drafts, 41 topics, full exam and reload, 3 viewports, invalid routes, repaired saved data and blocked-module recovery.`);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(server)server.kill('SIGTERM');});
