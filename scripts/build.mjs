import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const dist = new URL('../dist/', import.meta.url);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const file of ['index.html', 'style.css', 'app.js', 'core.js', 'circuits-core.js', 'circuits-data.js', 'circuits-ui.js', 'practice-core.js', 'practice-ui.js', 'privacy.html', 'data']) {
  await cp(new URL(file, root), new URL(file, dist), { recursive: true });
}
await writeFile(new URL('.nojekyll', dist), '');
console.log('Static site built in dist/. No dependencies or server required.');
