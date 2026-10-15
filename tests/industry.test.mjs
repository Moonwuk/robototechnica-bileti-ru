import test from 'node:test';
import assert from 'node:assert/strict';
import { industryCases } from '../industry-data.js';
import { simulateService, serviceProbe, serviceVerify } from '../service-core.js';
const by = kind => industryCases.find(s => s.kind === kind);
const near = (a,b) => assert.ok(Math.abs(a-b)<1e-8, `${a} != ${b}`);

test('cycle timeline is continuous; speeding motion alone misses the target', () => {
  const s=by('throughput'), r=serviceProbe(s,'timeline');
  near(r.metrics.cycle,42.35); near(r.metrics.rate,3600/42.35);
  for(let i=1;i<r.trace.length;i++) assert.equal(r.trace[i][1],r.trace[i-1][2]);
  assert.equal(serviceProbe(s,'fast').ok,false);
  near(serviceProbe(s,'event').metrics.rate,120);
});
test('tool error rotates; constant frame correction cannot solve all orientations', () => {
  const s=by('tcp');
  near(serviceProbe(s,'zero').metrics.x,6); near(serviceProbe(s,'quarter').metrics.y,6); near(serviceProbe(s,'half').metrics.x,-6);
  assert.equal(serviceVerify(s,'base').runs[0].ok,true);
  assert.equal(serviceVerify(s,'base').runs[1].ok,false);
  const r=simulateService(s,{angle:90,toolX:0,baseX:3,baseY:-2}); near(r.metrics.x,3);near(r.metrics.y,-2);
});
test('vacuum converts kPa and cm2, and includes acceleration plus specified reserve', () => {
  const s=by('vacuum'), r=serviceProbe(s,'heavy');
  near(r.metrics.force,39600/1000); near(r.metrics.required,2*(9.81+2)*2);
  assert.equal(serviceProbe(s,'light').ok,true); assert.equal(r.ok,false);
  const heavier=simulateService(s,{mass:5}); assert.equal(heavier.ok,false);
});
test('reset does not restart a held command; a fresh edge still starts the machine', () => {
  const s=by('plc');
  assert.equal(serviceProbe(s,'held').metrics.afterReset,2);
  for(const hold of [10,40,160,200]) { const r=simulateService(s,{hold}); assert.equal(r.metrics.afterReset,1); assert.equal(r.metrics.starts,2); assert.equal(r.ok,true); }
  assert.equal(serviceVerify(s,'disable').ok,false);
});
test('distance-dependent odometry error differs from a constant transform offset', () => {
  const s=by('navigation'); near(serviceProbe(s,'short').metrics.residual,.2);near(serviceProbe(s,'long').metrics.residual,.6);
  near(serviceProbe(s,'offset').metrics.residual,0);assert.equal(serviceVerify(s,'map').ok,false);
});
test('more robots increase contention; charger may become the new bottleneck', () => {
  const s=by('fleet');near(serviceProbe(s,'two').metrics.capacity,120);near(serviceProbe(s,'three').metrics.capacity,72);
  assert.ok(simulateService(s,{...s.fault,robots:4}).metrics.capacity<72);
  const charge=simulateService(s,{charge:1200});near(charge.metrics.capacity,60);assert.equal(charge.ok,false);
});
test('zero packet loss and low mean do not imply every command meets its deadline', () => {
  const s=by('timing'), r=serviceProbe(s,'trace');assert.equal(r.metrics.missed,2);near(r.metrics.maximum,13);
  assert.equal(serviceProbe(s,'mean').ok,false);
  assert.equal(simulateService(s,{base:9,jitter:1}).ok,true);
  assert.equal(simulateService(s,{base:10,jitter:1}).ok,false);
});
