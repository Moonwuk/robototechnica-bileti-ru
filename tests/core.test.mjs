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
