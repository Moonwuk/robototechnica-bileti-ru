const {chromium}=require('playwright');
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process');
const root=path.resolve(__dirname,'..'),base='http://127.0.0.1:4176/';
let browser,server;
(async()=>{
 fs.mkdirSync(path.join(root,'test-results'),{recursive:true});
 server=spawn('python3',['-m','http.server','4176','--bind','127.0.0.1'],{cwd:path.join(root,'dist'),stdio:'ignore'});
 for(let i=0;i<40;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({headless:true,args:['--no-sandbox']});const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const go=async(route)=>{await page.goto(base+'#'+route);await page.locator('[data-service-mode]').waitFor();};
 const click=a=>page.locator(`[data-service-action="${a}"]`).click();
 const overflow=async()=>assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1),false);
 const cases=[['SV-01','enable',['status','target','enable']],['SV-02','encoder',['short','long','geometry']],['NW-01','address',['original','known','offline']],['NW-02','state',['sdo','value','state']],['NW-03','image',['inputs','command','image']],['RT-01','hold',['phase0','phase13','hold']],['DK-01','align',['voltage','approach','align']],['QA-01','power',['nominal','reverse','load','restart','loss']]];
 await page.goto(base+'#workshop');await page.locator('a[href="#service"]').click();assert.equal(await page.locator('.service-card').count(),8);await overflow();
 for(const [id,fix,probes] of cases){await go('service-case/'+id);assert.equal(await page.locator('[data-service-action="probe"]').isDisabled(),true);await page.locator('#service-hypothesis').selectOption('unknown');await click('probe');assert.equal(await page.locator('[data-service-record]').count(),0);
 for(const p of probes){await page.locator('#service-probe').selectOption(p);await page.locator('#service-prediction').selectOption('unknown');await click('probe');assert.equal(await page.locator(`[data-service-record="${p}"]`).count(),1);assert.equal(await page.locator('#service-prediction').count(),0);}
 if(id==='SV-02'){await page.locator('#service-number-scale').fill('2000*5/10');await page.locator('#service-number-travel').fill('50,0');}
 await page.locator('#service-cause').selectOption('0');await page.locator('#service-fix').selectOption(fix);await click('verify');assert.match(await page.locator('#service-verdict').textContent(),/Причина подтверждена/);await overflow();}
 const note='<img src=x onerror="window.injected=true"> PRIVATE SERVICE NOTES';await page.locator('#service-notes').fill(note);await page.reload();await page.locator('#service-notes').waitFor();assert.equal(await page.locator('#service-notes').inputValue(),note);assert.equal(await page.evaluate(()=>window.injected),undefined);assert.match(await page.locator('#service-verdict').textContent(),/Причина подтверждена/);assert.equal(await page.locator('#service-hypothesis').inputValue(),'unknown');
 await page.getByRole('button',{name:'Сообщить об ошибке в сценарии'}).click();assert.match(await page.locator('#support-draft').inputValue(),/#service-case\/QA-01/);assert.ok(!(await page.locator('#support-draft').inputValue()).includes('PRIVATE'));await page.locator('#support-close').click();
 await page.locator('#service-fix').selectOption('reset');await page.locator('#service-fix').selectOption('power');assert.doesNotMatch(await page.locator('#service-verdict').textContent(),/Причина подтверждена/);await click('verify');await click('hint');assert.match(await page.locator('#service-verdict').textContent(),/с помощью/);await page.screenshot({path:path.join(root,'test-results/service-mobile.png'),fullPage:true});
 await page.evaluate(()=>window.roboticsNativeBack());await page.waitForURL('**/#service');assert.equal(await page.locator('.service-card').count(),8);
 await go('service-lab/dock');await click('lab-run');assert.match(await page.locator('#service-observation').textContent(),/2 А/);await page.locator('#service-param-offset').fill('12');await page.locator('#service-param-offset').blur();assert.match(await page.locator('#service-observation').textContent(),/новый опыт/);await click('lab-run');assert.match(await page.locator('#service-observation').textContent(),/0 А/);await overflow();
 await page.setViewportSize({width:1440,height:1100});await go('service-case/RT-01');await page.locator('#service-probe').selectOption('hold');await page.screenshot({path:path.join(root,'test-results/service-handshake-desktop.png'),fullPage:true});await overflow();assert.deepEqual(errors,[]);console.log('Service: eight diagnoses, repeated verification, labs, persistence, privacy and responsive UI passed.');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();if(server)server.kill();});
