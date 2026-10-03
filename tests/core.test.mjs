import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { STORAGE_KEY, freshProgress, readProgress, createSession, submitAnswer, finishSession, validateActive, summarize } from '../core.js';
const bank = JSON.parse(await readFile(new URL('../data/question_bank.json', import.meta.url), 'utf8'));
const questionMap = new Map(bank.questions.map(q => [q.id, q]));
const q = bank.questions[0];
const wrongId = q.options.find(o => o.id !== q.correct_option_id).id;
test('a mistake survives a hinted answer and clears only after an independent correct answer', () => {
  const p = freshProgress();
  for (const [option, hinted] of [[wrongId, false], [q.correct_option_id, true]]) {
    const s = createSession({ questions: [q], title: 'Review' });
    s.hints[q.id] = hinted;
    submitAnswer(p, s, q, option, 1000);
    assert.deepEqual(summarize(p, questionMap, 1000).mistakes, [q.id]);
  }
  const s = createSession({ questions: [q], title: 'Review' });
  submitAnswer(p, s, q, q.correct_option_id, 2000);
  assert.deepEqual(summarize(p, questionMap, 2000).mistakes, []);
  assert.deepEqual(summarize(p, questionMap, 2000 + 86400000).due, [q.id]);
  assert.equal(p.questions[q.id].attempts, 3);
});
test('exam changes are private until finish, and completion is counted once', () => {
  const p = freshProgress();
  const s = createSession({ questions: [q], title: 'Exam', mode: 'exam', resourceId: 'TICKET-01' });
  submitAnswer(p, s, q, wrongId);
  submitAnswer(p, s, q, q.correct_option_id);
  assert.equal(Object.keys(p.questions).length, 0);
  assert.equal(finishSession(p, s, questionMap, 3000), 1);
  finishSession(p, s, questionMap, 4000);
  assert.equal(p.questions[q.id].attempts, 1);
  assert.equal(p.sessions.length, 1);
  assert.equal(p.completed['TICKET-01'], 3000);
});
test('study mode cannot re-answer a question or change a finished result', () => {
  const p = freshProgress();
  const s = createSession({ questions: [q], title: 'Learn' });
  assert.equal(submitAnswer(p, s, q, wrongId), true);
  assert.equal(submitAnswer(p, s, q, q.correct_option_id), false);
  assert.equal(finishSession(p, s, questionMap), 0);
  assert.equal(submitAnswer(p, s, q, q.correct_option_id), false);
  assert.equal(p.questions[q.id].attempts, 1);
});
test('unfinished session and shuffled option IDs survive a reload', () => {
  const p = freshProgress();
  p.active = createSession({ questions: bank.questions.slice(0, 5), title: 'Saved session' });
  submitAnswer(p, p.active, q, q.correct_option_id);
  const storage = { getItem: key => key === STORAGE_KEY ? JSON.stringify(p) : null };
  const saved = readProgress(storage);
  assert.equal(saved.error, false);
  assert.equal(validateActive(saved.progress.active, questionMap), true);
  assert.deepEqual(saved.progress.active.optionOrders, p.active.optionOrders);
  assert.equal(saved.progress.active.answers[q.id], q.correct_option_id);
  assert.throws(() => finishSession(saved.progress, saved.progress.active, questionMap), /Unanswered/);
});
test('invalid saved data is handled, and invalid answer does not mutate progress', () => {
  assert.equal(readProgress({ getItem: () => '{broken' }).error, true);
  assert.equal(readProgress({ getItem: () => { throw new Error('storage blocked'); } }).error, true);
  const p = freshProgress();
  const s = createSession({ questions: [q], title: 'Test' });
  assert.throws(() => submitAnswer(p, s, q, 'unknown'));
  assert.deepEqual(s.answers, {});
  s.optionOrders[q.id] = ['a', 'a', 'a', 'a'];
  assert.equal(validateActive(s, questionMap), false);
});


test('public issue draft includes question context and preserves Unicode without exposing answers or progress', async () => {
  const { buildIssueDraft } = await import('../core.js');
  const q = { id: 'ENG-TEST-001', topic_id: 'math', revision: 2, question: 'Ток < 2 А & угол 90°?', correct_option_id: 'SECRET', options: [{ id: 'SECRET', text: 'HIDDEN_ANSWER' }] };
  const message = 'Ссылка: https://example.com/?a=1&b=2\nКавычки "и" #знак + пробел';
  const draft = buildIssueDraft({ kind: 'error', question: q, topic: 'Математика', bankVersion: '1.2.0', message, progress: { personal: 'PRIVATE_PROGRESS' } });
  const url = new URL(draft.url);
  assert.equal(url.origin, 'https://github.com');
  assert.equal(url.pathname, '/Moonwuk/robototechnica-bileti-ru/issues/new');
  assert.equal(url.searchParams.get('body'), draft.body);
  assert.ok(draft.body.includes(message));
  assert.ok(draft.body.includes(q.question));
  assert.ok(draft.body.includes('Редакция вопроса: 2'));
  assert.ok(draft.body.includes('#topic/math'));
  assert.doesNotMatch(draft.text, /SECRET|HIDDEN_ANSWER|PRIVATE_PROGRESS/);
  assert.equal(draft.needsPaste, false);
});

test('suggestions work before data loads and long drafts are never silently truncated', async () => {
  const { buildIssueDraft } = await import('../core.js');
  assert.match(buildIssueDraft().body, /не загружен/);
  const message = 'Пожалуйста, добавьте новую тему! '.repeat(150);
  const draft = buildIssueDraft({ message });
  assert.equal(draft.needsPaste, true);
  assert.ok(draft.text.includes(message.trim()));
  assert.equal(new URL(draft.url).searchParams.get('body'), null);
  assert.ok(draft.url.length < 7500);
  assert.throws(() => buildIssueDraft({ kind: 'error' }), /Question required/);
  assert.throws(() => buildIssueDraft({ kind: 'other' }), /Unknown feedback kind/);
});
