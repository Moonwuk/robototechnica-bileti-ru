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
assert.equal(topics.size, 18);
assert.equal(bank.questions.length, 420);
const counts = (items, key) => Object.fromEntries([...new Set(items.map(x => String(x[key])))].sort().map(value => [value, items.filter(x => String(x[key]) === value).length]));
assert.deepEqual(counts(bank.questions, 'difficulty'), bank.metadata.difficulty_counts);
assert.deepEqual(counts(bank.questions, 'kind'), bank.metadata.kind_counts);
for (const q of bank.questions) {
  assert.ok(topics.has(q.topic_id), `Unknown topic: ${q.id}`);
  assert.equal(q.options.length, 4, `Four options required: ${q.id}`);
  assert.equal(new Set(q.options.map(o => o.id)).size, 4);
  assert.equal(q.options.filter(o => o.id === q.correct_option_id).length, 1);
  assert.ok(q.question && q.explanation && q.options.every(o => o.text && o.explanation));
  assert.ok(q.source_ids.length && q.source_ids.every(id => sources.has(id)));
  assert.ok([1, 2, 3].includes(q.difficulty));
}
for (const t of bank.topics) {
  const qs = bank.questions.filter(q => q.topic_id === t.id);
  assert.equal(qs.length, t.question_count, `Topic count: ${t.id}`);
  assert.ok(qs.length && [1, 2, 3].every(d => qs.some(q => q.difficulty === d)), `All difficulty choices need questions: ${t.id}`);
  assert.ok(t.prerequisites.every(id => topics.has(id) && id !== t.id));
  assert.ok(t.source_ids.every(id => sources.has(id)));
}
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
assert.equal(tickets.tickets.length, 15);
const beginnerIds = beginners.tickets.flatMap(t => { assert.equal(t.question_ids.length, 10); return t.question_ids; });
const mixedIds = tickets.tickets.flatMap(t => { assert.equal(t.question_ids.length, 20); return t.question_ids; });
assert.equal(new Set(beginnerIds).size, 120);
assert.equal(new Set(mixedIds).size, 300);
assert.equal(new Set([...beginnerIds, ...mixedIds]).size, 420);
assert.ok([...beginnerIds, ...mixedIds].every(id => questions.has(id)));
assert.equal(new Set(paths.paths.flatMap(p => p.question_ids)).size, 120);
const engineering = bank.questions.filter(q => q.id.startsWith('ENG-'));
assert.equal(engineering.length, 60);
assert.equal(engineering.length, bank.metadata.engineering_question_count);
const engineeringTickets = tickets.tickets.filter(t => t.category === 'engineering');
assert.equal(engineeringTickets.length, 3);
assert.deepEqual(engineeringTickets.flatMap(t => t.question_ids).sort(), engineering.map(q => q.id).sort());
for (const t of tickets.tickets) {
  const qs = t.question_ids.map(id => questions.get(id));
  assert.equal(new Set(t.question_ids).size, t.question_ids.length);
  assert.deepEqual(counts(qs, 'topic_id'), t.topic_counts, `Ticket topics: ${t.id}`);
  assert.deepEqual(counts(qs, 'difficulty'), t.difficulty_counts, `Ticket difficulty: ${t.id}`);
}
for (const companion of [paths, beginners, tickets, plan]) assert.equal(companion.bank_version, bank.metadata.bank_version);
console.log('Bank verified: 420 questions, 18 topics, 24 learning paths, 27 tickets, complete coverage.');
