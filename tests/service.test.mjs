import test from 'node:test';
import assert from 'node:assert/strict';
import {serviceCases} from '../service-data.js';
import {normalizeService,simulateService,serviceProbe,serviceVerify,freshService,numericService,assessService,readService} from '../service-core.js';
const by=id=>serviceCases.find(s=>s.id===id);
for(const s of serviceCases)test(`${s.id}: fault, independent fixes and evidence gate`,()=>{
 assert.equal(simulateService(s,s.defaults).ok,true);
 // Acceptance starts with a passing unloaded test; the required loaded test exposes the fault.
 assert.ok(s.probes.some(p=>!serviceProbe(s,p.id).ok));
 for(const f of s.fixes)assert.equal(serviceVerify(s,f.id).ok,f.id===s.answer,f.id);
 const e=freshService();e.fix=s.answer;e.verified=s.answer;e.cause=String(s.cause);for(const [id,,v] of s.numeric||[])e.numbers[id]=String(v);
 assert.equal(assessService(s,e).complete,false);
 for(const p of s.probes)e.experiments[p.id]='unknown';assert.equal(assessService(s,e).complete,true);
 e.verified='';assert.equal(assessService(s,e).complete,false);
});
test('scale uses decoded counts, gear and pitch without hiding independent measurement',()=>{const r=serviceProbe(by('SV-02'),'short');assert.deepEqual(r.rows.at(-1),['Экран / линейка','100 / 50 мм']);assert.ok(numericService('2000*5/10',1000));assert.ok(numericService('50,0',50));assert.equal(numericService('globalThis.alert(1)',50),false);assert.equal(numericService('1/0',50),false);});
test('communication states distinguish timeout, exception, SDO/PDO and SAFEOP',()=>{assert.match(serviceProbe(by('NW-01'),'original').rows[1][1],/83 02/);assert.match(serviceProbe(by('NW-01'),'offline').rows[1][1],/Тайм-аут/);assert.match(serviceProbe(by('NW-02'),'sdo').rows[1][1],/120/);assert.equal(serviceProbe(by('NW-02'),'sdo').ok,false);assert.equal(serviceProbe(by('NW-03'),'inputs').rows[0][1],'SAFEOP');});
test('handshake holds across every polling phase, short pulse is not a robust repair',()=>{const s=by('RT-01');for(let phase=0;phase<20;phase++){const r=simulateService(s,{...s.defaults,phase});assert.equal(r.ok,true);assert.equal(r.rows[1][1],1);assert.equal(r.rows[2][1],'0 / 0');}assert.equal(serviceProbe(s,'phase0').ok,false);assert.equal(serviceProbe(s,'phase13').ok,true);assert.equal(serviceVerify(s,'shift').runs[0].ok,true);assert.equal(serviceVerify(s,'shift').ok,false);});
test('docking needs electrical contact and permission, acceptance covers five tests',()=>{const s=by('DK-01');assert.equal(simulateService(s,{offset:5}).ok,true);assert.equal(simulateService(s,{offset:6}).ok,false);assert.equal(simulateService(s,{permission:0}).ok,false);assert.equal(serviceVerify(by('QA-01'),'power').runs.length,5);assert.equal(serviceProbe(by('QA-01'),'load').ok,false);assert.equal(serviceProbe(by('QA-01'),'nominal').ok,true);});
test('untrusted stored data is bounded and evaluated again',()=>{assert.equal(normalizeService(by('SV-02'),{actual:Infinity,pitch:-5}).pitch,1);const raw={cases:{'SV-01':{hypothesis:'unknown',notes:'x'.repeat(3000),fix:'enable',verified:'evil',experiments:{status:'yes',evil:'yes'},numbers:{}}},labs:{servo:{target:1e9}}};const r=readService({getItem:()=>JSON.stringify(raw)});assert.equal(r.state.cases['SV-01'].notes.length,2000);assert.equal(r.state.cases['SV-01'].verified,'');assert.equal(r.state.cases['SV-01'].hypothesis,'unknown');assert.deepEqual(Object.keys(r.state.cases['SV-01'].experiments),['status']);assert.equal(r.state.labs.servo.target,200);assert.equal(readService({getItem:()=>'{'}).error,true);});
