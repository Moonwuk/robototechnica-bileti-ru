import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { expression, equation, equivalentEquations, quantity, checkStep, solveLinear, readCircuitProgress, CIRCUIT_STORAGE_KEY } from '../circuits-core.js';
import { circuitProblems, circuitGroups } from '../circuits-data.js';
import { circuitDiagram, circuitReport } from '../circuits-ui.js';
import { buildIssueDraft, STORAGE_KEY } from '../core.js';
const near = (a, b) => assert.ok(Math.abs(a-b) < 1e-9, `${a} != ${b}`);

test('arithmetic supports decimal comma, fractions, signs and SI suffixes', () => {
  near(quantity('12/(2+4)', 'A'), 2);
  near(quantity('−0,5 А', 'A'), -.5);
  near(quantity('30 мА', 'A'), .03);
  near(quantity('(3*10) mA', 'A'), .03);
  near(quantity('2 кОм', 'Ω'), 2000);
  near(quantity('1.5 kΩ', 'Ω'), 1500);
  near(quantity('4.5e-1', 'A'), .45);
  near(quantity('6 ÷ 2 × 3', 'V'), 9);
  near(quantity('17/11', 'A'), 17/11);
});
test('linear equivalence checks the full equation, including scaling and rearrangement', () => {
  const target = equation('2*i1+2*(i1-i2)=10', ['i1','i2']);
  for (const answer of ['4i1-2i2=10', '10=4i1-2i2', '-2*i1+i2=-5', 'i2=2i1-5', '2I₁+2(I₁-I₂)=10']) {
    assert.ok(equivalentEquations(equation(answer, ['i1','i2']), target, ['i1','i2']), answer);
  }
  // Both hold at i1=4, i2=3, but they do not describe the same circuit.
  assert.equal(equivalentEquations(equation('i1+i2=7', ['i1','i2']), target, ['i1','i2']), false);
  assert.equal(equivalentEquations(equation('0=0', ['i1','i2']), target, ['i1','i2']), false);
  assert.equal(equivalentEquations(equation('4i1+2i2=10', ['i1','i2']), target, ['i1','i2']), false);
});
test('untrusted input never reaches evaluation and nonlinear/ambiguous syntax fails', () => {
  const bad = ['globalThis.pwned=1', '<img src=x onerror=alert(1)>', 'constructor.constructor(1)', '1;alert(1)', 'fetch(1)', '1/0', '1e999', '2**3', '2 3', '1+'];
  for (const value of bad) assert.throws(() => quantity(value, 'A'), undefined, value);
  assert.throws(() => expression('i1*i2', ['i1','i2']));
  assert.throws(() => expression('1/i1', ['i1']));
  assert.throws(() => expression('('.repeat(24)+'1'+')'.repeat(24)));
  assert.throws(() => expression('1'.repeat(161)));
  assert.throws(() => equation('i=2=3', ['i']));
  assert.throws(() => quantity('5 В', 'A'));
  assert.equal(globalThis.pwned, undefined);
});
test('all 12 physical circuits satisfy independent current, voltage and power balances', () => {
  assert.equal(circuitProblems.length, 12);
  assert.equal(new Set(circuitProblems.map(p=>p.id)).size, 12);
  for (const group of circuitGroups) assert.equal(circuitProblems.filter(p=>p.kind===group.id).length, 4);
  for (const problem of circuitProblems) {
    const p = problem.params;
    const answers = Object.fromEntries(problem.steps.map(s=>[s.id, String(s.answer)]));
    const a = Object.fromEntries(problem.steps.filter(s=>s.type==='number').map(s=>[s.id,s.answer]));
    for (const step of problem.steps) assert.equal(checkStep(problem, step, answers).ok, true, `${problem.id}/${step.id}`);
    if (problem.kind === 'node') near(p.incoming.reduce((a,b)=>a+b,0), p.outgoing.reduce((a,b)=>a+b,0)+a.i);
    if (problem.kind === 'loop') {
      near(p.e1+p.e2, a.u1+a.u2);
      near(a.u1/p.r1, a.i); near(a.u2/p.r2, a.i);
      near((p.e1+p.e2)*a.i, (p.r1+p.r2)*a.i*a.i);
    }
    if (problem.kind === 'mesh') {
      // Independent nodal solution at A, B=0; right source's top is -E2.
      const voltage = (p.e1/p.r1-p.e2/p.r2)/(1/p.r1+1/p.r2+1/p.shared);
      near(a.u3, voltage);
      near(a.i1, (p.e1-voltage)/p.r1); near(a.i2, (voltage+p.e2)/p.r2);
      near(a.branch, voltage/p.shared);
      near(p.e1*a.i1+p.e2*a.i2, p.r1*a.i1**2+p.r2*a.i2**2+p.shared*a.branch**2);
    }
  }
});
test('diagnostics identify sign, units, syntax, and errors carried from earlier steps', () => {
  const get = id => circuitProblems.find(p=>p.id===id);
  const run = (p,id,answers) => checkStep(p,p.steps.find(s=>s.id===id),answers);
  assert.equal(run(get('kcl-03'),'i',{ i:'1' }).code, 'sign');
  assert.equal(run(get('kvl-02'),'i',{ i:'30' }).code, 'unit');
  assert.equal(run(get('kvl-02'),'i',{ i:'30 мА' }).ok, true);
  assert.equal(run(get('kcl-01'),'i',{ balance:'5=2-i', i:'-3' }).code, 'upstream');
  assert.equal(run(get('kvl-01'),'u1',{ i:'3', u1:'6' }).code, 'upstream');
  assert.equal(run(get('mesh-01'),'i1',{ left:'i1=2', right:'i2=1', i1:'2' }).code, 'upstream');
  assert.equal(run(get('mesh-01'),'branch',{ i1:'5', i2:'3', branch:'2' }).code, 'upstream');
  assert.equal(run(get('mesh-03'),'branch',{ branch:'0.001' }).ok, false);
  assert.equal(run(get('mesh-02'),'i1',{ i1:'1.545' }).ok, true);
  assert.equal(run(get('mesh-02'),'i1',{ i1:'1.5' }).ok, false);
  assert.equal(run(get('kcl-01'),'i',{ i:'<script>' }).code, 'syntax');
  assert.equal(run(get('kcl-01'),'i',{ i:'' }).code, 'empty');
});
test('singular or dependent equations do not create a fake downstream diagnosis', () => {
  assert.equal(solveLinear([equation('i1+i2=3',['i1','i2']),equation('2i1+2i2=6',['i1','i2'])], ['i1','i2']), null);
  assert.equal(solveLinear([equation('0=1',['i'])], ['i']), null);
});
test('draft restore is bounded, versioned, isolated from quiz progress and handles unavailable storage', () => {
  assert.notEqual(CIRCUIT_STORAGE_KEY, STORAGE_KEY);
  const data={version:1,tasks:{'kcl-01':{revision:1,answers:{balance:'5=2+i',i:'3',evil:'abc'},checked:{i:true},notes:'<script>x</script>',revealed:true},'mesh-01':{revision:0,answers:{i1:'999'}}}};
  const restored=readCircuitProgress({getItem:key=>{assert.equal(key,CIRCUIT_STORAGE_KEY);return JSON.stringify(data);}},circuitProblems);
  assert.equal(restored.error,false);
  assert.equal(restored.state.tasks['kcl-01'].answers.i,'3');
  assert.equal(restored.state.tasks['kcl-01'].answers.evil,undefined);
  assert.equal(restored.state.tasks['kcl-01'].notes,'<script>x</script>');
  assert.equal(restored.state.tasks['mesh-01'],undefined);
  for (const value of ['{broken', 'null', '{}', 'a'.repeat(200001)]) assert.equal(readCircuitProgress({getItem:()=>value},circuitProblems).error,true);
  assert.equal(readCircuitProgress({getItem:()=>{throw Error('denied');}},circuitProblems).error,true);
});
test('diagrams have descriptions, source signs, bounded local paths and escaped text', () => {
  for (const p of circuitProblems) {
    const svg=circuitDiagram(p);
    assert.match(svg, /<desc /); assert.match(svg, /role="img"/);
    assert.doesNotMatch(svg, /<script|<foreignObject|onload=|https?:/);
    if(p.kind==='mesh') assert.match(svg, /I3 = i1 − i2/);
  }
  const evil={...circuitProblems[0],title:'<script>alert(1)</script>',prompt:'<img src=x>'};
  const html=circuitDiagram(evil);
  assert.doesNotMatch(html,/<script>|<img/); assert.match(html,/&lt;script&gt;/);
});
test('circuit feedback includes the exercise route but excludes private calculations', () => {
  const q=circuitReport('calc:mesh-01');
  const draft=buildIssueDraft({kind:'error',question:q,message:'Проверьте источник'});
  assert.match(draft.body,/#circuit\/mesh-01/);
  assert.doesNotMatch(draft.body,/undefined|черновик решения/i);
  assert.equal(circuitReport('calc:missing'),null);
});
test('web and Android packaging include every new offline module', () => {
  const web=readFileSync(new URL('../scripts/build.mjs',import.meta.url),'utf8');
  const android=readFileSync(new URL('../android/build.py',import.meta.url),'utf8');
  const allowlist=readFileSync(new URL('../android/src/ru/moongametechnology/robotics/tickets/MainActivity.java',import.meta.url),'utf8');
  for(const name of ['circuits-core.js','circuits-data.js','circuits-ui.js']) {
    assert.ok(existsSync(new URL('../'+name,import.meta.url)));
    for(const manifest of [web,android,allowlist]) assert.ok(manifest.includes(name),name);
  }
});
