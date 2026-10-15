import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root=new URL('../',import.meta.url);
const read=name=>readFileSync(new URL(name,root),'utf8');
test('Android can serve the complete imported module graph, styles and boot JSON',()=>{
  const java=read('android/src/ru/moongametechnology/robotics/tickets/MainActivity.java');
  const declaration=java.match(/ASSETS = new HashSet<>\(Arrays.asList\(([\s\S]*?)\)\);/)[1];
  const allowed=new Set([...declaration.matchAll(/"([^"]+)"/g)].map(m=>m[1]));
  const visited=new Set();
  function visit(name){
    if(visited.has(name))return;visited.add(name);
    assert.ok(allowed.has(name),`Android returns 404 for module: ${name}`);
    for(const m of read(name).matchAll(/from ['"]\.\/([^'"]+)['"]/g))visit(m[1].split('?')[0]);
  }
  visit('app.js');
  for(const m of read('index.html').matchAll(/href="\.\/([^"?]+\.css)/g)) assert.ok(allowed.has(m[1]),m[1]);
  for(const name of ['question_bank','applications','glossary','teo_tickets','learning_routes'])assert.ok(allowed.has(`data/teo/${name}.json`),name);
});
