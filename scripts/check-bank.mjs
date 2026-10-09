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
assert.equal(bank.questions.length, 472);
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
assert.equal(tickets.tickets.length, 18);
const beginnerIds = beginners.tickets.flatMap(t => { assert.equal(t.question_ids.length, 10); return t.question_ids; });
const mixedIds = tickets.tickets.flatMap(t => { assert.equal(t.question_ids.length, t.id === 'INTERVIEW-03' ? 12 : 20); return t.question_ids; });
assert.equal(new Set(beginnerIds).size, 120);
assert.equal(new Set(mixedIds).size, 352);
assert.equal(new Set([...beginnerIds, ...mixedIds]).size, bank.questions.length);
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
const practice = await read('interview_practice.json');
assert.equal(practice.metadata.bank_version, bank.metadata.bank_version);
assert.equal(practice.blocks.length, 12);
assert.equal(practice.role_paths.length, 5);
assert.equal(practice.learning_chains.length, 6);
assert.equal(practice.exercises.length, 20);
const exercises = new Map(practice.exercises.map(t => [t.id, t]));
const blocks = new Set(practice.blocks.map(b => b.id));
assert.equal(exercises.size, practice.exercises.length);
assert.equal(blocks.size, practice.blocks.length);
const interview = bank.questions.filter(q => q.id.startsWith('INT-'));
assert.equal(interview.length, 52);
assert.deepEqual(tickets.tickets.filter(t => t.category === 'interview').flatMap(t => t.question_ids).sort(), interview.map(q => q.id).sort());
assert.equal(new Set(practice.blocks.flatMap(b => b.question_ids)).size, 60);
for (const [alias, id] of Object.entries(practice.question_aliases)) {
  assert.ok(!questions.has(alias) && questions.has(id), `Question alias: ${alias}`);
}
for (const b of practice.blocks) {
  assert.equal(b.question_ids.length, 5);
  assert.ok(b.glossary.length && b.glossary.every(g => g.term && g.definition));
  assert.ok(b.question_ids.every(id => questions.has(id)));
  assert.ok(b.exercise_ids.every(id => exercises.has(id)));
  assert.ok(b.topic_ids.every(id => topics.has(id)));
}
for (const r of practice.role_paths) assert.ok(r.block_ids.length && r.block_ids.every(id => blocks.has(id)));
for (const c of practice.learning_chains) {
  assert.equal(c.question_ids.length, 5);
  assert.ok(c.question_ids.every(id => questions.has(id)));
  assert.ok(c.exercise_ids.every(id => exercises.has(id)));
}
for (const t of exercises.values()) {
  assert.ok(blocks.has(t.block_id) && topics.has(t.topic_id));
  assert.ok(t.prompt && t.solution_steps.length && t.acceptance_checks.length && t.common_mistakes.length);
  assert.ok(t.source_ids.length && t.source_ids.every(id => sources.has(id)));
  assert.ok(t.related_question_ids.every(id => questions.has(id)));
  assert.equal(new Set(t.numeric_checks.map(c => c.name)).size, t.numeric_checks.length);
  for (const c of t.numeric_checks) {
    assert.ok(c.label && c.display_unit && c.unit && /^[a-zA-Z_]+$/.test(c.name));
    assert.ok(Number.isFinite(c.value) && Number.isFinite(c.absolute_tolerance) && c.absolute_tolerance >= 0);
    assert.ok(Number.isFinite(c.relative_tolerance) && c.relative_tolerance >= 0 && c.relative_tolerance <= .001);
  }
}
const normalized = bank.questions.map(q => q.question.toLowerCase().replace(/[^\p{L}\p{N}]/gu, ''));
assert.equal(new Set(normalized).size, normalized.length, 'Question text duplicates');
console.log('Bank verified: 472 questions, 18 topics, 24 beginner paths, 30 tickets, 20 practice tasks, complete coverage.');
