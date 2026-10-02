import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const read = async name => JSON.parse(await readFile(new URL(`../data/${name}`, import.meta.url), 'utf8'));
const [bank, paths, beginners, tickets, plan] = await Promise.all(['question_bank.json', 'interview_paths.json', 'beginner_tickets.json', 'tickets.json', 'study_plan.json'].map(read));
const questions = new Map(bank.questions.map(q => [q.id, q]));
const sources = new Set(bank.sources.map(s => s.id));
const topics = new Set(bank.topics.map(t => t.id));
assert.equal(questions.size, bank.questions.length, 'Question IDs must be unique');
assert.equal(bank.questions.length, bank.metadata.question_count);
assert.equal(bank.sources.length, bank.metadata.source_count);
assert.equal(sources.size, bank.sources.length);
assert.equal(bank.topics.length, 12);
assert.equal(bank.questions.length, 360);
for (const q of bank.questions) {
  assert.ok(topics.has(q.topic_id), `Unknown topic: ${q.id}`);
  assert.equal(q.options.length, 4, `Four options required: ${q.id}`);
  assert.equal(new Set(q.options.map(o => o.id)).size, 4);
  assert.equal(q.options.filter(o => o.id === q.correct_option_id).length, 1);
  assert.ok(q.question && q.explanation && q.options.every(o => o.text && o.explanation));
  assert.ok(q.source_ids.length && q.source_ids.every(id => sources.has(id)));
  assert.ok([1, 2, 3].includes(q.difficulty));
}
for (const t of bank.topics) assert.equal(bank.questions.filter(q => q.topic_id === t.id).length, 30);
assert.equal(paths.paths.length, 24);
assert.deepEqual(paths.recommended_path_order, plan.recommended_path_order);
for (const p of paths.paths) {
  assert.equal(p.question_ids.length, 5);
  assert.ok(p.glossary.length && p.plain_answer && p.answer_checklist.length);
  p.question_ids.forEach((id, i) => {
    const q = questions.get(id);
    assert.ok(q && q.learning_path_id === p.id && q.step_number === i + 1 && q.hint && q.beginner_explanation);
    assert.equal(q.topic_id, p.topic_id);
  });
}
assert.equal(beginners.tickets.length, 12);
assert.equal(tickets.tickets.length, 12);
const beginnerIds = beginners.tickets.flatMap(t => { assert.equal(t.question_ids.length, 10); return t.question_ids; });
const mixedIds = tickets.tickets.flatMap(t => { assert.equal(t.question_ids.length, 20); return t.question_ids; });
assert.equal(new Set(beginnerIds).size, 120);
assert.equal(new Set(mixedIds).size, 240);
assert.equal(new Set([...beginnerIds, ...mixedIds]).size, 360);
assert.ok([...beginnerIds, ...mixedIds].every(id => questions.has(id)));
assert.equal(new Set(paths.paths.flatMap(p => p.question_ids)).size, 120);
console.log('Bank verified: 360 questions, 12 topics, 24 learning paths, 24 tickets, complete coverage.');
