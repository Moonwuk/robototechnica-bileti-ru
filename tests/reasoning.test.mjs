import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reasoningCases, experiments, fixes } from '../reasoning-data.js';
import { simulateMobile, simulateConveyor, normalize, runExperiment, verifyRepair, freshReasoningCase, recordExperiment, assessReasoning, readReasoning } from '../reasoning-core.js';
import { mobileScene, conveyorScene } from '../reasoning-scene.js';
import { buildIssueDraft } from '../core.js';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-9,`${a} != ${b}`);

test('differential drive: exact straight, reverse, arc and in-place rotation in SI units',()=>{
  const straight=simulateMobile();near(straight.actual.x,2);near(straight.actual.y,0);near(straight.distance,2);
  const reverse=simulateMobile({left:-4,right:-4});near(reverse.actual.x,-2);near(reverse.distance,2);
  const arc=simulateMobile({left:2,right:4});near(arc.actual.x,.75*Math.sin(2));near(arc.actual.y,.75*(1-Math.cos(2)));near(arc.actual.angle,2);
  const turn=simulateMobile({left:-2,right:2,seconds:Math.PI/1.6});near(turn.actual.x,0);near(turn.actual.y,0);near(turn.actual.angle,Math.PI/2);
  const mirror=simulateMobile({left:4,right:2});near(mirror.actual.x,arc.actual.x);near(mirror.actual.y,-arc.actual.y);
  const stopped=simulateMobile({left:0,right:0});near(stopped.actual.x,0);near(stopped.actual.angle,0);
});

test('independent ground truth distinguishes geometry, odometry and slip',()=>{
  const baseline=simulateMobile(),calibration=simulateMobile({odomRadius:80}),slip=simulateMobile({slip:25}),base=simulateMobile({odomBase:400});
  assert.deepEqual(baseline.actual,calibration.actual);near(calibration.estimatedDistance,1.6);
  assert.deepEqual(baseline.actual,base.actual);assert.deepEqual(baseline.odom,base.odom);
  near(slip.distance,1.5);near(slip.estimatedDistance,2);
  const uneven=simulateMobile({radiusLeft:90});assert.ok(uneven.actual.y>0);near(uneven.actual.angle,.4);near(uneven.odom.angle,0);
});

test('PLC model: clean pulses, symmetric filter, level versus rising edge and sample phase',()=>{
  const healthy=simulateConveyor();near(healthy.width,40);assert.equal(healthy.count,3);assert.equal(healthy.pulses.length,3);
  assert.equal(simulateConveyor({filter:60}).count,0);assert.equal(simulateConveyor({filter:60,scan:2}).count,0);
  assert.equal(simulateConveyor({filter:60,speed:250}).count,3);
  assert.equal(simulateConveyor({filter:40}).count,3);
  assert.equal(simulateConveyor({mode:'level'}).count,12);assert.equal(simulateConveyor({mode:'level',speed:250}).count,24);
  assert.equal(simulateConveyor({sensor:false}).count,0);
  const sparse=[0,40].map(phase=>simulateConveyor({scan:100,phase}).count);assert.notEqual(sparse[0],sparse[1]);
  assert.ok(simulateConveyor({scan:100}).count<3);
  near(normalize('conveyor',{scan:10,phase:93}).phase,3);
});

test('each diagnostic fault is reproduced and only its causal repair passes both protocols',()=>{
  for(const s of reasoningCases){
    assert.ok(!verifyRepair(s,'').every(r=>r.pass),s.id+' needs a repair');
    for(const [fix]of fixes[s.kind])assert.equal(verifyRepair(s,fix).every(r=>r.pass),fix===s.cause,`${s.id}/${fix}`);
    for(const e of experiments[s.kind]){
      const result=runExperiment(s,e.id);assert.ok(e.predictions.some(([id])=>id===result.code),`${s.id}/${e.id}: answer is a listed observation`);
      assert.ok(result.rows.length>=3);
    }
  }
  const slip=reasoningCases.find(s=>s.id==='MR-04');assert.equal(runExperiment(slip,'drive').code,'long');assert.equal(runExperiment(slip,'floor').code,'match');
});

test('prediction is required before revealing and first prediction/hypothesis cannot be overwritten',()=>{
  const s=reasoningCases[0],e=freshReasoningCase();
  assert.equal(recordExperiment(s,e,'drive','curve'),false);
  e.hypothesis='undecided';assert.equal(recordExperiment(s,e,'drive',''),false);
  assert.equal(recordExperiment(s,e,'drive','__proto__'),false);
  assert.equal(recordExperiment(s,e,'drive','short'),true);
  e.hypothesis='wheels';recordExperiment(s,e,'drive','curve');
  assert.deepEqual(e.experiments.drive,{prediction:'short',hypothesis:'undecided'});
  assert.equal(recordExperiment(s,e,'no-such-experiment','curve'),false);
});

test('completion requires independent evidence, a causal conclusion and a fresh successful validation; wrong predictions are allowed',()=>{
  for(const s of reasoningCases){
    const e=freshReasoningCase();e.hypothesis=s.cause;e.conclusion='evidence';e.repair=s.cause;e.verifiedRepair=s.cause;
    assert.equal(assessReasoning(s,e).complete,false);
    for(const id of s.required)recordExperiment(s,e,id,'unsure');
    assert.equal(assessReasoning(s,e).complete,true);
    e.conclusion='';assert.equal(assessReasoning(s,e).complete,false);e.conclusion='evidence';
    e.verifiedRepair='';assert.equal(assessReasoning(s,e).complete,false);e.verifiedRepair=s.cause;
    e.hint=true;assert.equal(assessReasoning(s,e).assisted,true);
  }
});

test('saved state is bounded, restored by known IDs and does not trust supplied simulation output',()=>{
  const s=reasoningCases[0],e=freshReasoningCase();e.hypothesis=s.cause;e.notes='<script>bad()</script>';e.conclusion='evidence';e.repair=s.cause;e.verifiedRepair=s.cause;
  for(const id of s.required)recordExperiment(s,e,id,'unsure');
  e.experiments.drive.result={pass:true};e.experiments.fake={prediction:'match',hypothesis:s.cause};
  const saved={labs:{mobile:{parameters:{radiusLeft:0,left:Infinity},notes:'x'.repeat(4000)}},cases:{[s.id]:e,FAKE:e}};
  const loaded=readReasoning({getItem:()=>JSON.stringify(saved)});
  assert.equal(loaded.error,false);assert.equal(loaded.state.labs.mobile.parameters.radiusLeft,70);assert.equal(loaded.state.labs.mobile.notes.length,2000);
  assert.equal(loaded.state.cases[s.id].notes,e.notes);assert.equal(assessReasoning(s,loaded.state.cases[s.id]).complete,true);
  assert.equal(loaded.state.cases.FAKE,undefined);assert.equal(loaded.state.cases[s.id].experiments.drive.result,undefined);assert.equal(loaded.state.cases[s.id].experiments.fake,undefined);
  for(const raw of ['{','null','x'.repeat(100001)])assert.equal(readReasoning({getItem:()=>raw}).error,true);
  assert.equal(readReasoning({getItem(){throw Error('denied');}}).error,true);
  assert.ok(simulateMobile({left:NaN,base:0}).points.every(p=>Number.isFinite(p.actual.x)));
});

test('both SVGs remain finite across bounds and reports contain only public scenario context',()=>{
  for(const input of [{},{left:-6,right:6,seconds:10,base:300},{left:6,right:6,seconds:10,odomRadius:130,slip:40}]){
    const r=simulateMobile(input);for(const f of [0,50,100])assert.doesNotMatch(mobileScene(r,f),/NaN|Infinity/);
  }
  assert.doesNotMatch(conveyorScene(simulateConveyor({scan:2,speed:100,length:60}),50),/NaN|Infinity/);
  const s=reasoningCases[0],draft=buildIssueDraft({kind:'error',question:{id:s.id,question:s.brief,type:'reasoning',notes:'PRIVATE'},message:'Ошибка'});
  assert.match(draft.body,/#reasoning-case\/MR-01/);assert.doesNotMatch(draft.body,/PRIVATE/);
});

test('reasoning modules are packaged for Pages and their routes registered',()=>{
  for(const file of ['scripts/build.mjs']){
    const text=readFileSync(new URL('../'+file,import.meta.url),'utf8');
    for(const module of ['reasoning-core.js','reasoning-data.js','reasoning-scene.js','reasoning-ui.js'])assert.ok(text.includes(module),`${file} includes ${module}`);
  }
  const app=readFileSync(new URL('../app.js',import.meta.url),'utf8');
  for(const route of ['reasoning','reasoning-case','mobile-lab','conveyor-lab'])assert.ok(app.includes(`case '${route}'`));
});
