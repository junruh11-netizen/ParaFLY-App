import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {JSDOM} from 'jsdom';
import {finalTaskSettings,publicRoom,paragraphTypes,perspectives} from '../lib.js';
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const flush=async()=>{for(let i=0;i<4;i++)await new Promise(r=>setImmediate(r));};
test('final task defaults, accepted combinations, invalid choices and required DBQ question',()=>{
 assert.deepEqual(finalTaskSettings({}),{paragraphType:'summary',perspective:'none',dbqEnabled:false,dbqQuestion:'',finalPrompt:''});
 for(const paragraphType of paragraphTypes)for(const perspective of perspectives)assert.equal(finalTaskSettings({paragraphType,perspective}).perspective,perspective);
 for(const input of [{paragraphType:'bad'},{perspective:'bad'},{dbqEnabled:'true'},{dbqEnabled:true,dbqQuestion:'  '},{dbqEnabled:true,dbqQuestion:'a'.repeat(1001)}])assert.throws(()=>finalTaskSettings(input));
 assert.equal(finalTaskSettings({dbqEnabled:false,dbqQuestion:'old question'}).dbqQuestion,'');
 const room=publicRoom({paragraphs:[],dbq_enabled:true,dbq_question:'Question?',paragraph_type:'compare',perspective:'first'});assert.equal(room.dbqQuestion,'Question?');assert.equal(room.paragraphType,'compare');
});
test('creation offers seven types and four perspectives; DBQ question required only while on',async()=>{
 const dom=new JSDOM('<main id="app"></main><div id="toast"></div>',{url:'https://test/teacher/create',runScripts:'outside-only'});const w=dom.window;
 w.fetch=async()=>({ok:true,json:async()=>({aiFactCheckAvailable:false})});w.eval(source);await flush();
 const d=w.document;assert.equal(d.querySelectorAll('#paragraphType option').length,7);assert.equal(d.querySelectorAll('#perspective option').length,4);
 const toggle=d.getElementById('dbqEnabled'),question=d.getElementById('dbqQuestion');assert.equal(question.required,false);
 toggle.checked=true;toggle.dispatchEvent(new w.Event('change'));assert.equal(question.required,true);assert.equal(question.disabled,false);assert.equal(question.checkValidity(),false);assert.equal(d.getElementById('paragraphType').disabled,true);
 question.value='Why did this happen?';assert.equal(question.checkValidity(),true);toggle.checked=false;toggle.dispatchEvent(new w.Event('change'));assert.equal(question.required,false);assert.equal(question.disabled,true);assert.equal(d.getElementById('paragraphType').disabled,false);w.close();
});
test('all types and perspectives render consistent writing and reviewing criteria',()=>{
 const dom=new JSDOM('<main id="app"></main><div id="toast"></div>',{url:'https://test/',runScripts:'outside-only'}),w=dom.window;
 w.eval(source+"\nwindow.taskHelpers={qualityLevels,summaryGuide};");
 for(const paragraphType of paragraphTypes)for(const perspective of perspectives){
  const r={paragraphType,perspective};w.__testTask=r;
  const levels=w.taskHelpers.qualityLevels(r);assert.equal(levels.length,4);
  if(perspective!=='none')assert.match(levels[2][2],new RegExp(perspective+' person'));
  const guide=w.taskHelpers.summaryGuide(r);assert.ok(guide.includes(levels[2][2]));
  if(paragraphType==='narrative')assert.ok(!guide.includes('three accurate'));
 }
 w.close();
});
