import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
const root = new URL('../', import.meta.url);
const dist = new URL('../dist/', import.meta.url);
await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });
for (const file of ['index.html', 'style.css', 'app.js', 'core.js', 'circuits-core.js', 'circuits-data.js', 'circuits-ui.js', 'practice-core.js', 'practice-ui.js', 'workshop-core.js', 'workshop-data.js', 'workshop-scene.js', 'workshop-ui.js', 'service-core.js', 'service-data.js', 'service-ui.js', 'reasoning-core.js', 'reasoning-data.js', 'reasoning-scene.js', 'reasoning-ui.js', 'privacy.html', 'data']) {
  await cp(new URL(file, root), new URL(file, dist), { recursive: true });
}
await writeFile(new URL('.nojekyll', dist), '');
console.log('Static site built in dist/. No dependencies or server required.');
