import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { defaults, scenarios, repairs } from '../workshop-data.js';
import { MODEL, WORKSHOP_KEY, normalizeParameters, simulateCell, vacuumAt, initialParameters, applyRepair, measurements, freshCase, caseParameters, assessCase, readWorkshop, armJoints } from '../workshop-core.js';
import { scene, cycleFrames } from '../workshop-scene.js';
import { buildIssueDraft } from '../core.js';

test('Healthy cell transfers four parts to independently computed 2x2 coordinates',()=>{
  const r=simulateCell(defaults);assert.ok(r.ok);assert.equal(r.actualPartX,200);assert.equal(r.pickError,0);
  assert.deepEqual(r.placements.map(p=>[p.x,p.y]),[[650,105],[750,105],[650,205],[750,205]]);
  assert.ok(Math.abs(r.pressure-(-60*(1-Math.exp(-1/.35))))<1e-10);
  assert.equal(r.good,4);assert.equal(r.p.input,'DI2');
});
test('Every fault prevents acceptance; only its causal repair restores that scenario',()=>{
  for(const s of scenarios){
    const p=initialParameters(s),r=simulateCell(p);assert.equal(r.ok,false,s.id);
    for(const fix of repairs)assert.equal(simulateCell(applyRepair(p,fix.id)).ok,fix.id===s.cause,`${s.id}/${fix.id}`);
  }
  assert.equal(simulateCell(initialParameters(scenarios[0])).pickError,-24);
  assert.deepEqual(simulateCell(initialParameters(scenarios[1])).placements.map(p=>p.error),[28,28,28,28]);
});
test('Delay error follows speed times elapsed time, TCP sign and pallet spacing are distinct',()=>{
  for(const speed of [50,100,200,250])for(const delay of [0,50,120,300]){
    const r=simulateCell({...defaults,speed,delay,tracking:false});assert.ok(Math.abs(r.pickError+speed*delay/1000)<1e-10);
    assert.equal(simulateCell({...defaults,speed,delay,tracking:true}).pickError,0);
  }
  assert.equal(simulateCell({...defaults,tcpX:-24}).pickError,24);
  const r=simulateCell({...defaults,pitch:120});assert.deepEqual(r.placements.map(p=>p.error),[0,20,0,20]);assert.equal(r.good,2);
});
test('Vacuum and PLC confirmation are physical prerequisites; time alone cannot heal a leak',()=>{
  const p={...defaults,leak:55};assert.ok(-vacuumAt(100,p)<40);
  const curve=simulateCell(p).trace;assert.ok(curve.every((v,i)=>!i||v.pressure<=curve[i-1].pressure));
  const wrongInput=simulateCell({...defaults,input:'DI3'});assert.equal(wrongInput.vacuumOK,true);assert.equal(wrongInput.inputOK,false);assert.equal(wrongInput.placements.length,0);
  assert.equal(cycleFrames(wrongInput).some(f=>f.carrying),false);
  const miss=simulateCell({...defaults,tcpX:30});assert.equal(miss.contact,false);assert.equal(miss.pressure,0);
  assert.ok(measurements('signals',{...defaults,input:'DI3'}).some(([k,v])=>k.startsWith('DI2')&&v==='1'));
});
test('Diagnostic credit needs evidence, hypothesis and a fresh successful run, not notes or a repair click',()=>{
  const s=scenarios[0],e=freshCase();e.hypothesis=s.cause;e.tests=[...s.evidence];e.notes='Правильный ответ';e.baselineRun=true;
  e.repairs=[s.cause];assert.equal(assessCase(s,e).complete,false);
  e.lastRun=[s.cause];assert.equal(assessCase(s,e).complete,true);
  e.repairs.push('input');assert.equal(assessCase(s,e).complete,false);e.lastRun=[...e.repairs];
  e.tests=[];assert.equal(assessCase(s,e).complete,false);e.tests=[...s.evidence];e.hypothesis='vacuum';assert.equal(assessCase(s,e).complete,false);
  e.hypothesis=s.cause;e.revealed=true;assert.equal(assessCase(s,e).assisted,true);
  assert.ok(simulateCell(caseParameters(s,e)).ok);
});
test('Storage restoration bounds user strings and rejects corrupt input without touching quiz keys',()=>{
  const calls=[];const x={version:1,lab:{parameters:{speed:Infinity,tcpX:999,tracking:'yes'},prediction:'x'.repeat(3000)},cases:{'WS-01':{tests:['tcp','tcp','unknown'],repairs:['tcp','evil'],lastRun:['evil'],hypothesis:'evil',notes:'n'.repeat(3000),baselineRun:true,runs:999999}}};
  const r=readWorkshop({getItem:k=>{calls.push(k);return JSON.stringify(x);}});assert.equal(r.error,false);assert.deepEqual(calls,[WORKSHOP_KEY]);
  assert.equal(r.state.lab.parameters.tcpX,30);assert.equal(r.state.lab.parameters.speed,100);assert.equal(r.state.lab.prediction.length,2000);
  assert.deepEqual(r.state.cases['WS-01'].tests,['tcp']);assert.equal(r.state.cases['WS-01'].lastRun,null);assert.equal(r.state.cases['WS-01'].notes.length,2000);
  for(const raw of ['{','{"version":2}', 'x'.repeat(70001)])assert.equal(readWorkshop({getItem:()=>raw}).error,true);
  assert.deepEqual(normalizeParameters(null),defaults);
  assert.deepEqual(normalizeParameters({tcpX:'<img>',input:'DI999',tracking:1}),defaults);
});
test('Scene remains a reachable schematic; stored strings never enter SVG or feedback drafts',()=>{
  for(const s of [{fault:{}},...scenarios]){const r=simulateCell(initialParameters(s));for(const f of cycleFrames(r)){
    const a=armJoints(f.x,f.y);assert.ok(a.reachable);assert.ok(Math.abs(Math.hypot(a.elbow.x-450,a.elbow.y-390)-290)<1e-8);
    assert.ok(Math.abs(Math.hypot(a.tip.x-a.elbow.x,a.tip.y-a.elbow.y)-260)<1e-8);
    assert.ok(a.elbow.x>=0&&a.elbow.x<=920&&a.elbow.y>=0&&a.elbow.y<=490);
    assert.ok(!scene(r,f).includes('NaN'));
  }}
  const q={id:'WS-01',type:'workshop',question:'Сценарий',revision:1,notes:'PRIVATE'};
  const draft=buildIssueDraft({kind:'error',question:q});assert.ok(draft.body.includes('#workshop-case/WS-01'));assert.ok(!draft.body.includes('PRIVATE'));
});
test('Web includes workshop modules and scenarios link to real learning routes',async()=>{
  const files=await Promise.all(['scripts/build.mjs'].map(x=>readFile(new URL('../'+x,import.meta.url),'utf8')));
  for(const f of files)for(const module of ['workshop-core.js','workshop-data.js','workshop-scene.js','workshop-ui.js'])assert.ok(f.includes(module));
  const bank=JSON.parse(await readFile(new URL('../data/question_bank.json',import.meta.url),'utf8'));
  const practice=JSON.parse(await readFile(new URL('../data/interview_practice.json',import.meta.url),'utf8'));
  for(const s of scenarios)for(const [,route] of s.links){const [type,id]=route.split('/');assert.ok(type==='topic'?bank.topics.some(t=>t.id===id):practice.exercises.some(t=>t.id===id),route);}
});
