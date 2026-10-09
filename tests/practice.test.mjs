import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { checkNumericAnswer, practiceQuantity, freshExercise, readPractice, exerciseStatus, DRAFT_LIMIT } from '../practice-core.js';
import { buildIssueDraft } from '../core.js';

const practice = JSON.parse(await readFile(new URL('../data/interview_practice.json', import.meta.url), 'utf8'));
const tasks = new Map(practice.exercises.map(t => [t.id, t]));

test('All 37 numerical answers agree with independently evaluated models', () => {
  const rms = Math.hypot(4 * Math.sqrt(2 / 8), 1 * Math.sqrt(6 / 8));
  const mean = (4 * 2 + 1 * 6) / 8;
  const force = 10 * .5 + 2;
  const wheel = force / 2 * .1;
  const ff = .2 + 1.5 * 2 + .3 * 1;
  const weight = 1 / .04 + 1 / .01;
  const frame = 1280 * 720 * (3 * 8 / 8);
  const independent = {
    'TASK-001': [3 / 2048 / .01 * 60, 1 / 2048 / .01 * 60],
    'TASK-002': [(14 - 65530 + 65536) % 65536, 20 / 1e6 * 1e6],
    'TASK-003': [1 / (1 / 120 + 1 / 120), 1 / (3 / 120)],
    'TASK-004': [mean, rms, .5 * rms * rms, .5 * mean * mean],
    'TASK-005': [force, wheel, wheel / (.8 * 10)],
    'TASK-006': [ff, ff + 2, Math.min(5, ff + 2)],
    'TASK-007': [-0 + 1, 2 + 2, 4 - 2, -(1 - 1), 4 - 1, -1 - 2],
    'TASK-008': [.05 * (8 + 12) / 2, .05 * (12 - 8) / .3, .5 / (.05 * 4 / .3)],
    'TASK-009': [(1 / .04 + 1.3 / .01) / weight, 1 / weight, Math.sqrt(1 / weight)],
    'TASK-010': [.8 * .12, -.8 * .12],
    'TASK-011': [frame, frame * 30, frame * 30 * 8 / 1e6],
    'TASK-012': [1.2 * .15, 1.2 ** 2 / (2 * .8), 1.2 * .15 + 1.2 ** 2 / (2 * .8), .15 + 1.2 / .8]
  };
  let count = 0;
  for (const [id, values] of Object.entries(independent)) {
    assert.equal(tasks.get(id).numeric_checks.length, values.length);
    tasks.get(id).numeric_checks.forEach((check, i) => {
      assert.ok(Math.abs(values[i] - check.value) <= 1e-10 * Math.max(1, Math.abs(values[i])), `${id}/${check.name}`);
      assert.ok(checkNumericAnswer(check, String(values[i])).ok, `${id}/${check.name}`);
      count++;
    });
  }
  assert.equal(count, 37);
});

test('Arithmetic, decimal comma and unit conversions work without JS evaluation', () => {
  assert.equal(practiceQuantity('0,05*(8+12)/2', 'm/s'), .5);
  assert.equal(practiceQuantity('20 мкс', 'us'), 20);
  assert.equal(practiceQuantity('0.020 ms', 'us'), 20);
  assert.ok(Math.abs(practiceQuantity('9,6 см', 'm') - .096) < 1e-12);
  for (const input of ['1/0', 'NaN', 'Infinity', 'globalThis.alert(1)', '<script>1</script>', '2**4', '1'.repeat(161), '('.repeat(22)+'1'+')'.repeat(22)]) {
    assert.throws(() => practiceQuantity(input, 'm'), input);
  }
  assert.throws(() => practiceQuantity('20 А', 'm'));
});

test('Feedback distinguishes rounding, units, opposite sign and exact counts', () => {
  const speed = tasks.get('TASK-001').numeric_checks[0];
  assert.equal(checkNumericAnswer(speed, '8,7891').ok, true);
  assert.equal(checkNumericAnswer(speed, '8').ok, false);
  const error = tasks.get('TASK-010').numeric_checks[0];
  assert.equal(checkNumericAnswer(error, '-0,096').code, 'sign');
  assert.equal(checkNumericAnswer(error, '96').code, 'unit');
  const ticks = tasks.get('TASK-002').numeric_checks[0];
  assert.equal(checkNumericAnswer(ticks, '20.001').ok, false);
  assert.equal(checkNumericAnswer(ticks, '').code, 'empty');
});

test('Restoring drafts rejects corrupt state, limits strings and rechecks numbers', () => {
  const t = tasks.get('TASK-001');
  const entry = { ...freshExercise(t), draft: '<b>notes</b>' + 'x'.repeat(DRAFT_LIMIT), answers:{speed:'0'}, checked:true, checks:[true,true,true], revealed:true };
  const storage = {getItem:() => JSON.stringify({version:1, exercises:{[t.id]:entry, UNKNOWN:{draft:'ignored'}}})};
  const saved = readPractice(storage, practice.exercises);
  assert.equal(saved.error, false);
  assert.equal(saved.progress.exercises[t.id].draft.length, DRAFT_LIMIT);
  assert.equal(Object.keys(saved.progress.exercises).length, 1);
  assert.equal(exerciseStatus(t,saved.progress.exercises[t.id]).complete, false);
  for (const raw of ['{', '{"version":2,"exercises":{}}', '{"version":1,"exercises":[]}']) {
    assert.equal(readPractice({getItem:()=>raw}, practice.exercises).error,true);
  }
  entry.revision = 0;
  assert.deepEqual(readPractice(storage,practice.exercises).progress.exercises,{});
});

test('Numerical success is separate from self-review and revealing the solution', () => {
  const t = tasks.get('TASK-002'), entry = freshExercise(t);
  entry.answers = Object.fromEntries(t.numeric_checks.map(c => [c.name,String(c.value)]));
  entry.checked = true;
  assert.equal(exerciseStatus(t,entry).complete,false);
  entry.checks = t.acceptance_checks.map(()=>true);
  assert.equal(exerciseStatus(t,entry).label,'Самопроверка выполнена');
  entry.revealed = true;
  assert.equal(exerciseStatus(t,entry).label,'Самопроверка с разбором');
  entry.answers.ticks = '21'; entry.checked = false;
  assert.equal(exerciseStatus(t,entry).complete,false);
  const diagnostic = tasks.get('TASK-013'), review = freshExercise(diagnostic);
  review.checks = diagnostic.acceptance_checks.map(()=>true);
  assert.equal(exerciseStatus(diagnostic,review).label,'Самопроверка выполнена');
});

test('Issue draft links to the exercise and never includes stored answers or draft', () => {
  const t = tasks.get('TASK-001');
  const result = buildIssueDraft({kind:'error', question:{id:t.id,type:'practice',question:t.prompt,revision:t.revision,topic_id:t.topic_id,draft:'PRIVATE',answers:{speed:'PRIVATE'}}, message:'Уточните условие'});
  assert.ok(result.body.includes('#exercise/TASK-001'));
  assert.ok(!result.body.includes('PRIVATE'));
});

test('Both offline packagers and Android allowlist include all practice resources', async () => {
  const files = ['scripts/build.mjs','android/build.py','android/src/ru/moongametechnology/robotics/tickets/MainActivity.java'];
  const texts = await Promise.all(files.map(f=>readFile(new URL('../'+f,import.meta.url),'utf8')));
  for (const text of texts) for (const name of ['practice-core.js','practice-ui.js']) assert.ok(text.includes(name));
  assert.ok(texts[2].includes('data/interview_practice.json'));
});
