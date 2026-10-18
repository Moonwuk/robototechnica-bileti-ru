import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const script = readFileSync(new URL('../startup.js', import.meta.url), 'utf8');
function setup() {
  const handlers = {}, children = [];
  let timeout, cleared = false, reloaded = false;
  const main = {textContent: 'Загружаем вопросы…', appendChild: node => children.push(node)};
  const window = {ROBOTICS_ANDROID: true, location: {reload() { reloaded = true; }},
    addEventListener: (type, handler) => {handlers[type] = handler;}};
  const document = {getElementById: () => main,
    createElement: () => ({addEventListener(type, handler) {this[type] = handler;}})};
  vm.runInNewContext(script, {window, document,
    setTimeout: (handler, delay) => {assert.equal(delay, 20000); timeout = handler; return 1;},
    clearTimeout: () => {cleared = true;}});
  return {window, handlers, main, children, timeout: () => timeout(), cleared: () => cleared, reloaded: () => reloaded};
}
test('missing or unparsable module replaces the spinner and offers a safe retry', () => {
  for (const event of [{target: {tagName: 'SCRIPT'}}, {error: new SyntaxError('old WebView')}]) {
    const s = setup(); s.handlers.error(event);
    assert.equal(s.main.textContent, '');
    assert.equal(s.children[0].textContent, 'Не удалось загрузить вопросы');
    assert.match(s.children[1].textContent, /Android System WebView/);
    s.children[2].click(); assert.equal(s.reloaded(), true);
    assert.equal(s.cleared(), true);
  }
});
test('unresolved startup and rejected initialization cannot leave an infinite spinner', () => {
  for (const trigger of [s => s.timeout(), s => s.handlers.unhandledrejection()]) {
    const s = setup(); trigger(s); assert.equal(s.children.length, 3);
    s.timeout(); assert.equal(s.children.length, 3);
  }
});
test('successful initialization cancels the guard without replacing the application', () => {
  const s = setup(); s.window.roboticsStartup.ready();
  s.timeout(); s.handlers.error({error: new Error('later UI error')});
  assert.equal(s.children.length, 0); assert.equal(s.cleared(), true);
});
