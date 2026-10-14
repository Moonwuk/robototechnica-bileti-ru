import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { mergeTeoBank, parseTeoNumber, checkTeoNumber, freshTeoTask, readTeoProgress, TEO_STORAGE_KEY, submitTeoNumber, teoTaskStatus } from '../teo-core.js';
import { STORAGE_KEY, freshProgress, createSession, submitAnswer, validateActive, finishSession } from '../core.js';
const read = name => JSON.parse(readFileSync(new URL(`../data/${name}`, import.meta.url), 'utf8'));
const base = read('question_bank.json');
const extension = read('teo/question_bank.json');
const applications = read('teo/applications.json').applications;
const terms = read('teo/glossary.json').entries;
const tickets = read('teo/teo_tickets.json').tickets;
const routes = read('teo/learning_routes.json').routes;
const coverage = read('teo/coverage_map.json').headings;
const bank = mergeTeoBank(base, extension);
const questionMap = new Map(bank.questions.map(q => [q.id, q]));
const numeric = extension.questions.filter(q => q.numeric_answer);

test('TEO is additive: all existing questions, topics, source IDs and objects remain intact', () => {
  const before = JSON.stringify(base);
  const merged = mergeTeoBank(base, extension);
  assert.equal(JSON.stringify(base), before);
  assert.deepEqual(merged.questions.slice(0, base.questions.length), base.questions);
  assert.deepEqual(merged.topics.slice(0, base.topics.length), base.topics);
  assert.deepEqual(merged.sources.slice(0, base.sources.length), base.sources);
  assert.equal(merged.questions.length, base.questions.length + 150);
  assert.equal(merged.topics.length, base.topics.length + 10);
  assert.equal(merged.metadata.question_count, merged.questions.length);
  assert.equal(merged.metadata.source_count, merged.sources.length);
  assert.equal(new Set(merged.topics.map(t => t.order)).size, merged.topics.length);
  for (const key of ['questions', 'topics', 'sources']) {
    assert.equal(new Set(merged[key].map(item => item.id)).size, merged[key].length);
    const broken = structuredClone(extension);
    broken[key][0].id = base[key][0].id;
    assert.throws(() => mergeTeoBank(base, broken), /Duplicate/);
  }
});

test('legacy active sessions and stored answers survive integration', () => {
  const progress = freshProgress();
  const q = base.questions[0];
  const s = createSession({ questions: [q, base.questions[1]], title: 'Старый подход' }, 123);
  progress.active = s;
  submitAnswer(progress, s, q, q.correct_option_id, 456);
  const before = JSON.stringify(progress);
  assert.equal(validateActive(s, questionMap), true);
  assert.equal(JSON.stringify(progress), before);
  assert.notEqual(STORAGE_KEY, TEO_STORAGE_KEY);
});

test('150 questions, 10 topics, 10 applications, 40 definitions and 72 headings are linked', () => {
  assert.equal(extension.questions.length, 150);
  assert.equal(numeric.length, 50);
  assert.equal(applications.length, 10);
  assert.equal(terms.length, 40);
  assert.equal(coverage.length, 72);
  const sources = new Set(extension.sources.map(s => s.id));
  const topics = new Set(extension.topics.map(t => t.id));
  for (const q of extension.questions) {
    assert.ok(topics.has(q.topic_id));
    assert.deepEqual(q.options.map(o => o.id).sort(), ['a', 'b', 'c', 'd']);
    assert.equal(q.options.filter(o => o.id === q.correct_option_id).length, 1);
    assert.ok(q.options.every(o => o.text && o.explanation));
    assert.ok(q.source_ids.every(id => sources.has(id)));
    assert.ok(q.worked_solution.length && q.application);
  }
  for (const t of extension.topics) {
    const questions = extension.questions.filter(q => q.topic_id === t.id);
    assert.equal(questions.length, 15);
    for (const kind of ['concept', 'calculation', 'scenario']) assert.equal(questions.filter(q => q.kind === kind).length, 5);
    assert.ok(t.prerequisites.every(id => topics.has(id)));
  }
  for (const row of [...applications, ...terms]) {
    assert.ok(topics.has(row.topic_id));
    assert.ok(row.source_ids.every(id => sources.has(id)));
  }
  for (const a of applications) {
    assert.equal(a.question_ids.length, 15);
    assert.ok(a.question_ids.every(id => questionMap.get(id).topic_id === a.topic_id));
    assert.ok(a.assumptions.length && a.limitations.length && a.oral_check.rubric.length);
  }
  for (const h of coverage) {
    assert.deepEqual(new Set(h.question_ids), new Set(extension.questions.filter(q => q.section_refs.includes(h.section_ref)).map(q => q.id)));
  }
});

test('10 thematic tickets cover exactly 150 questions once; routes have no broken links', () => {
  assert.equal(tickets.length, 10);
  assert.equal(routes.length, 10);
  const ids = tickets.flatMap(t => t.question_ids);
  assert.ok(tickets.every(t => t.question_ids.length === 15));
  assert.deepEqual(new Set(ids), new Set(extension.questions.map(q => q.id)));
  assert.equal(ids.length, new Set(ids).size);
  for (const route of routes) for (const step of route.steps) {
    if (step.question_ids) assert.ok(step.question_ids.every(id => questionMap.has(id)));
    if (step.application_id) assert.ok(applications.some(a => a.id === step.application_id));
  }
});

test('decimal parser accepts comma, sign and exponent but never evaluates code or units', () => {
  for (const [raw, expected] of [['0', 0], [' 72,0 ', 72], ['−2,5', -2.5], ['+1e-3', .001], ['.5', .5]]) assert.equal(parseTeoNumber(raw), expected);
  for (const raw of ['', ' ', '1/2', '2**3', 'NaN', 'Infinity', '1e309', '0x10', '12 В', '1,2,3', 'alert(1)', null, 12]) assert.equal(parseTeoNumber(raw), null);
});
for (const q of numeric) {
  test(`${q.id}: correct, rounded-comma and out-of-tolerance numeric grading`, () => {
    const a = q.numeric_answer;
    assert.equal(checkTeoNumber(String(a.value), a).correct, true);
    assert.equal(checkTeoNumber(String(a.value).replace('.', ','), a).correct, true);
    assert.equal(checkTeoNumber(String(a.value + 10 * a.absolute_tolerance + 1), a).correct, false);
    assert.equal(checkTeoNumber('', a).valid, false);
  });
}
test('tolerance is inclusive, including floating point rounding at the boundary', () => {
  const a = { value: .6, absolute_tolerance: .001 };
  assert.equal(checkTeoNumber('0,601', a).correct, true);
  assert.equal(checkTeoNumber('0,6011', a).correct, false);
  assert.throws(() => checkTeoNumber('1', { value: 1, absolute_tolerance: -1 }));
});
test('assistance is recorded at submission; a later review does not erase an independent answer', () => {
  const q = numeric[0], task = freshTeoTask();
  assert.equal(submitTeoNumber(task, q).valid, false);
  assert.equal(task.attempts, 0);
  task.answer = '72';
  submitTeoNumber(task, q);
  assert.equal(teoTaskStatus(task).state, 'correct');
  task.solutionSeen = true;
  assert.equal(teoTaskStatus(task).state, 'correct');
  submitTeoNumber(task, q);
  assert.equal(teoTaskStatus(task).state, 'assisted');
  task.answer = '300'; submitTeoNumber(task, q);
  assert.equal(teoTaskStatus(task).state, 'wrong');
});
test('draft storage survives reload and rejects malformed data without touching quiz storage', () => {
  const value = { version: 1, calculations: { 'TEO-006': { ...freshTeoTask(), answer: '72', reasoning: 'Черновик', solutionSeen: true } }, oral: { 'TEO-APP-01': 'PRIVATE текст' } };
  const storage = { getItem(key) { assert.equal(key, TEO_STORAGE_KEY); return JSON.stringify(value); } };
  const ids = numeric.map(q => q.id), aids = applications.map(a => a.id);
  const loaded = readTeoProgress(storage, ids, aids);
  assert.equal(loaded.error, false);
  assert.equal(loaded.progress.calculations['TEO-006'].reasoning, 'Черновик');
  assert.equal(loaded.progress.calculations['TEO-006'].solutionSeen, true);
  assert.equal(loaded.progress.oral['TEO-APP-01'], 'PRIVATE текст');
  for (const raw of ['{', 'null', '[]', '{"version":2}', '{"version":1,"calculations":[],"oral":{}}']) assert.equal(readTeoProgress({ getItem: () => raw }, ids, aids).error, true);
  assert.equal(readTeoProgress({ getItem() { throw new Error('blocked'); } }, ids, aids).error, true);
});
test('TEO exams do not record correctness until finish, and are recorded only once', () => {
  const progress = freshProgress();
  const q = extension.questions[0];
  const s = createSession({ questions: [q], title: 'ТОЭ', mode: 'exam', origin: 'teo' }, 1);
  submitAnswer(progress, s, q, q.correct_option_id, 2);
  assert.equal(progress.questions[q.id], undefined);
  finishSession(progress, s, questionMap, 3);
  finishSession(progress, s, questionMap, 4);
  assert.equal(progress.questions[q.id].attempts, 1);
});
