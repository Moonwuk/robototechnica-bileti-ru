import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, mkdtempSync, readdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join, posix} from 'node:path';
import {execFileSync} from 'node:child_process';
const root = new URL('../', import.meta.url);
const read = name => readFileSync(new URL(name, root), 'utf8');

test('Android packages and serves every startup dependency from its generated index', () => {
  const folder = mkdtempSync(join(tmpdir(), 'robotics-assets-'));
  try {
    const site = join(folder, 'site');
    execFileSync('python3', [new URL('android/site_assets.py', root).pathname, site]);
    const allowed = new Set(readFileSync(join(folder, 'site-assets.txt'), 'utf8').trim().split('\n'));
    const actual = new Set(readdirSync(site, {recursive: true, withFileTypes: true})
      .filter(entry => entry.isFile()).map(entry => join(entry.parentPath ?? entry.path, entry.name).slice(site.length + 1)));
    assert.deepEqual(allowed, actual);
    const java = read('android/src/ru/moongametechnology/robotics/tickets/MainActivity.java');
    assert.match(java, /getAssets\(\)\.open\("site-assets\.txt"\)/);
    assert.match(java, /siteAssets\.contains\(name\)/);
    const visited = new Set();
    function visit(name) {
      if (visited.has(name)) return;
      visited.add(name);
      assert.ok(allowed.has(name), `Android returns 404 for ${name}`);
      const text = readFileSync(join(site, name), 'utf8');
      for (const m of text.matchAll(/(?:from\s*|import\s*)['"](\.\.?\/[^'"]+)['"]/g)) {
        visit(posix.normalize(posix.join(posix.dirname(name), m[1].split('?')[0])));
      }
    }
    const index = readFileSync(join(site, 'index.html'), 'utf8');
    for (const m of index.matchAll(/src="\.\/([^"?]+\.js)/g)) visit(m[1]);
    assert.ok(index.indexOf('android-adapter.js') < index.indexOf('startup.js'));
    assert.ok(index.indexOf('startup.js') < index.indexOf('app.js'));
    for (const m of index.matchAll(/href="\.\/([^"?]+\.css)/g)) assert.ok(allowed.has(m[1]), m[1]);
    const bootFiles = read('app.js').match(/const files = \[([^\]]+)\]/)[1];
    for (const m of bootFiles.matchAll(/'([^']+)'/g)) {
      const name = 'data/' + m[1];
      assert.ok(allowed.has(name), name);
      assert.doesNotThrow(() => JSON.parse(readFileSync(join(site, name), 'utf8')));
    }
    assert.ok(!allowed.has('../android/version.json'));
    assert.ok(!allowed.has('android/version.json'));
  } finally { rmSync(folder, {recursive: true, force: true}); }
});
