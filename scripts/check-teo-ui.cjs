const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const baseURL = 'http://127.0.0.1:4177/';
const bank = JSON.parse(fs.readFileSync(path.join(root, 'data/question_bank.json')));
const extension = JSON.parse(fs.readFileSync(path.join(root, 'data/teo/question_bank.json')));
const applications = JSON.parse(fs.readFileSync(path.join(root, 'data/teo/applications.json'))).applications;
const KEY = 'robototehnika-bileti-ru:progress:v1';
const TEO_KEY = 'robototehnika-bileti-ru:teo:v1';
let browser, server;
(async () => {
  fs.mkdirSync(path.join(root, 'test-results'), { recursive: true });
  server = spawn('python3', ['-m', 'http.server', '4177', '--bind', '127.0.0.1'], { cwd: path.join(root, 'dist'), stdio: 'ignore' });
  let ready = false;
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(baseURL)).ok) { ready = true; break; } } catch {}
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  assert.ok(ready, 'Static test server did not start');
  browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const oldQuestion = bank.questions[0];
  const oldRow = { attempts: 1, correct: 1, streak: 1, lastCorrect: true, lastHinted: false, lastOptionId: oldQuestion.correct_option_id, needsReview: false, lastAt: 1, reviewAt: 9999999999999 };
  const saved = { version: 1, questions: { [oldQuestion.id]: oldRow }, sessions: [], completed: {}, active: {
    id: 'legacy-active', title: 'Сохранённый билет', mode: 'learn', origin: 'first-steps', resourceId: null, pathId: null,
    questionIds: [oldQuestion.id], optionOrders: { [oldQuestion.id]: oldQuestion.options.map(o => o.id) },
    answers: {}, hints: {}, index: 0, startedAt: 1, finishedAt: null, recorded: false, draft: ''
  } };
  await context.addInitScript(({ key, saved }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify(saved)); }, { key: KEY, saved });
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const go = async (route, selector) => { await page.goto(baseURL + '#' + route); await page.locator(selector).first().waitFor(); };
  const overflow = async () => assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false);
  const savedProgress = () => page.evaluate(key => JSON.parse(localStorage.getItem(key)), KEY);
  await go('first-steps', '.stats-strip');
  assert.equal(await page.locator('.stat-inline strong').first().textContent(), String(bank.questions.length + 150));
  assert.equal((await savedProgress()).active.id, 'legacy-active');
  await go('teo', '[data-teo-search]');
  assert.equal(await page.locator('[data-teo-search]').count(), 10);
  await overflow();
  await page.screenshot({ path: path.join(root, 'test-results/teo-mobile-topics.png'), fullPage: true });
  await page.locator('#teo-search').fill('несуществующая');
  assert.equal(await page.locator('[data-teo-search]:visible').count(), 0);
  await page.locator('#teo-search').fill('шунт');
  assert.equal(await page.locator('[data-teo-search]:visible').count(), 1);
  await page.locator('#teo-search').fill('');
  for (const topic of extension.topics) {
    await go('teo-topic/' + topic.id, '[data-teo-quiz]');
    assert.equal(await page.locator('a[href^="#teo-calc/"]').count(), 5);
    assert.equal(await page.locator('a[href^="#teo-application/"]').count(), 1);
    await overflow();
    await go('topic/' + topic.id, '#topic-difficulty');
    assert.equal(await page.locator('#topic-difficulty option:checked').isDisabled(), false);
  }
  await go('teo-calc/TEO-006', '#teo-number');
  await page.getByRole('button', { name: 'Проверить число' }).click();
  assert.match(await page.locator('#teo-feedback').textContent(), /Нужно конечное число/);
  await page.locator('#teo-number').fill('72,0');
  await page.locator('#teo-reasoning').fill('120*180/(120+180)');
  await page.getByRole('button', { name: 'Проверить число' }).click();
  assert.match(await page.locator('#teo-feedback').textContent(), /Верно без просмотра/);
  await page.locator('#teo-number').fill('71');
  assert.equal(await page.locator('#teo-feedback').textContent(), '');
  await page.locator('[data-teo-solution] summary').click();
  await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).calculations['TEO-006'].solutionSeen, TEO_KEY);
  await page.locator('#teo-number').fill('72');
  await page.getByRole('button', { name: 'Проверить число' }).click();
  assert.match(await page.locator('#teo-feedback').textContent(), /Верно после просмотра/);
  await page.reload();
  await page.locator('#teo-number').waitFor();
  assert.equal(await page.locator('#teo-reasoning').inputValue(), '120*180/(120+180)');
  await overflow();
  await page.screenshot({ path: path.join(root, 'test-results/teo-mobile-calculation.png'), fullPage: true });
  // Every imported numeric task must actually be accessible and grade through the UI.
  for (const q of extension.questions.filter(q => q.numeric_answer)) {
    await go('teo-calc/' + q.id, '#teo-number');
    await page.locator('#teo-number').fill(String(q.numeric_answer.value).replace('.', ','));
    await page.getByRole('button', { name: 'Проверить число' }).click();
    assert.match(await page.locator('#teo-feedback').textContent(), /Верно/);
    await overflow();
  }
  for (const a of applications) {
    await go('teo-application/' + a.id, '#teo-oral');
    assert.equal(await page.locator('#main h1').textContent(), a.title);
    await overflow();
  }
  await go('teo-application/TEO-APP-01', '#teo-oral');
  const note = '<img src=x onerror="window.injected=true"> PRIVATE TEO NOTES';
  await page.locator('#teo-oral').fill(note);
  await page.reload(); await page.locator('#teo-oral').waitFor();
  assert.equal(await page.locator('#teo-oral').inputValue(), note);
  assert.equal(await page.evaluate(() => window.injected), undefined);
  await page.getByRole('button', { name: 'Сообщить об ошибке в материале' }).click();
  assert.match(await page.locator('#support-draft').inputValue(), /#teo-application\/TEO-APP-01/);
  assert.ok(!(await page.locator('#support-draft').inputValue()).includes('PRIVATE'));
  await page.locator('#support-close').click();
  await page.evaluate(() => window.roboticsNativeBack());
  await page.waitForURL('**/#teo-topic/teo_elements');
  await page.locator('[data-teo-kind="concept"]').click();
  await page.locator('#replace-session[open]').waitFor();
  assert.equal((await savedProgress()).active.id, 'legacy-active');
  await page.locator('#keep-session').click();
  await page.locator('.answer').first().waitFor();
  assert.equal((await savedProgress()).active.id, 'legacy-active');
  await go('teo-topic/teo_elements', '[data-teo-kind="concept"]');
  await page.locator('[data-teo-kind="concept"]').click();
  await page.locator('#new-session').click();
  await page.locator('[data-teo-question-terms] summary').click();
  await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).active.hints['TEO-001'], KEY);
  await page.locator('.answer[data-id="b"]').click();
  assert.match(await page.locator('.feedback').textContent(), /Верно, с подсказкой/);
  await go('teo-topic/teo_elements', '[data-teo-mode="exam"]');
  await page.locator('[data-teo-mode="exam"]').click();
  await page.locator('#new-session').click();
  await page.locator('.answer').first().waitFor();
  for (let i = 0; i < 15; i++) {
    const session = (await savedProgress()).active;
    const q = extension.questions.find(q => q.id === session.questionIds[session.index]);
    await page.locator(`.answer[data-id="${q.correct_option_id}"]`).click();
    assert.equal(await page.locator('.feedback, .answer.correct, [data-teo-question-terms]').count(), 0);
    await page.locator('#next-question').click();
  }
  await page.locator('.score-value').waitFor();
  assert.match(await page.locator('.score-value').textContent(), /15/);
  assert.ok(!(await page.locator('#main').textContent()).includes('Цель достигнута'));
  assert.deepEqual((await savedProgress()).questions[oldQuestion.id], oldRow);
  await go('tickets', '.ticket-grid');
  assert.equal(await page.locator('[data-id^="TEO-TICKET-"]').count(), 10);
  await go('topics', '.topic-card');
  assert.equal(await page.locator('.topic-card').count(), bank.topics.length + 10);
  await go('teo-glossary', '.glossary');
  assert.equal(await page.locator('.glossary dt').count(), 40);
  await go('teo-calc/not-a-task', '#main h1');
  await page.getByRole('heading', { name: 'Материал не найден' }).waitFor();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await go('teo-application/TEO-APP-07', '#teo-oral');
  await overflow();
  await page.screenshot({ path: path.join(root, 'test-results/teo-desktop-application.png'), fullPage: true });
  assert.deepEqual(errors, []);
  console.log('TEO UI: 10 modules, all 50 numeric tasks, 10 applications, 40 terms, 10 tickets; legacy progress, hidden exam answers, assistance, reload, privacy and responsive layouts passed.');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (browser) await browser.close();
  if (server) server.kill();
});
