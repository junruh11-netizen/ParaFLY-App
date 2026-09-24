import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const flush = async () => { for(let i=0;i<5;i++) await new Promise(r=>setImmediate(r)); };
async function setup() {
 const dom=new JSDOM('<main id="app"></main><div id="toast"></div>',{url:'https://test/teacher/1',runScripts:'outside-only'});
 const w=dom.window;
 w.localStorage.setItem('parafly-teacher',JSON.stringify({roomId:1,token:'teacher'}));
 w.confirm=()=>true;
 const state={room:{title:'Test',joinCode:'TEST',phase:'writing',currentRound:0,paragraphCount:2,paragraphs:['First passage','Second passage'],scoresReleasedRounds:[],timerRemaining:0,timerRunning:false},
 students:[],responses:[],scores:[],summaries:[],summaryScores:[],voteProgress:{},qrDataUrl:'',joinUrl:'https://test/join/TEST'};
 let poll, fail=false, holdRead=false, releaseRead;
 const writes=[];
 w.setInterval=(fn,ms)=>{if(ms===2000)poll=fn;return ms;};w.clearInterval=()=>{};
 w.fetch=async(url,options={})=>{
  if(!options.method){
   if(fail)throw Error('Failed to fetch');
   const snapshot=structuredClone(state);
   if(holdRead)await new Promise(r=>{releaseRead=r;});
   return {ok:true,json:async()=>snapshot};
  }
  const body=JSON.parse(options.body);writes.push({url,body});
  if(url.endsWith('/timer')){
   if(body.action==='start'){state.room.timerRemaining=body.seconds;state.room.timerRunning=true;state.room.timerEndsAt=new Date(Date.now()+body.seconds*1000).toISOString();}
   if(body.action==='add'){state.room.timerRemaining+=30;state.room.timerEndsAt=new Date(new Date(state.room.timerEndsAt).getTime()+30000).toISOString();}
  }
  if(url.endsWith('/control')){
   if(body.action==='end')state.room.phase='review';
   if(body.action==='skip'){state.room.currentRound++;state.room.phase='writing';state.room.timerRemaining=0;state.room.timerRunning=false;}
  }
  if(url.includes('/scores/')){
   const response_id=Number(url.split('/').at(-1));state.scores=state.scores.filter(s=>s.response_id!==response_id);state.scores.push({response_id,score:body.score});
  }
  return {ok:true,json:async()=>({ok:true})};
 };
 w.eval(source);await flush();
 return {w,state,writes,flush,poll:async()=>{await poll();await flush();},fail:v=>fail=v,hold:()=>holdRead=true,release:()=>{holdRead=false;releaseRead();},close:()=>w.close()};
}
const el=(h,s)=>h.w.document.querySelector(s);
const click=async(h,s)=>{el(h,s).click();await h.flush();};
test('unchanged polls keep controls; five-minute timer, +30 and single-click End writing work across passages',async()=>{
 const h=await setup();
 const first=el(h,'[data-action="end"]');await h.poll();assert.equal(el(h,'[data-action="end"]'),first);
 for(let round=0;round<2;round++){
  await click(h,'[data-seconds="300"]');assert.equal(h.state.room.timerRemaining,300);
  const end=new Date(h.state.room.timerEndsAt).getTime();await click(h,'#addThirty');assert.equal(new Date(h.state.room.timerEndsAt).getTime(),end+30000);
  await click(h,'[data-action="end"]');assert.equal(h.state.room.phase,'review');
  if(round===0)await click(h,'[data-action="skip"]');
 }
 assert.equal(h.writes.filter(x=>x.body.action==='end').length,2);h.close();
});
test('an in-flight poll cannot detach an active slider; scores save for every student and keyboard edit',async()=>{
 const h=await setup();h.state.students=Array.from({length:12},(_,i)=>({id:i+1,display_name:`Student ${i+1}`}));
 h.state.responses=h.state.students.map(s=>({id:s.id,student_id:s.id,round_index:0,display_name:s.display_name,response_text:'An answer'}));await h.poll();
 h.hold();const read=h.poll();await h.flush();const slider=el(h,'[data-score="1"]');
 slider.dispatchEvent(new h.w.Event('pointerdown',{bubbles:true}));slider.value='8';slider.dispatchEvent(new h.w.Event('input'));
 h.release();await read;assert.equal(el(h,'[data-score="1"]'),slider);
 slider.dispatchEvent(new h.w.Event('change'));slider.dispatchEvent(new h.w.Event('pointerup',{bubbles:true}));await h.flush();
 for(let id=2;id<=12;id++){
  const range=el(h,`[data-score="${id}"]`);range.focus();range.value=String(id%10+1);range.dispatchEvent(new h.w.Event('input'));range.dispatchEvent(new h.w.Event('change'));await h.flush();await h.poll();
  assert.equal(h.w.document.activeElement.dataset.score,String(id));
 }
 assert.equal(h.state.scores.length,12);assert.equal(h.state.scores.find(s=>s.response_id===1).score,8);
 h.state.responses.push({id:13,student_id:13,round_index:0,display_name:'Student 13',response_text:'Answer'});await h.poll();
 const defaultRange=el(h,'[data-score="13"]');defaultRange.dispatchEvent(new h.w.Event('pointerdown',{bubbles:true}));defaultRange.dispatchEvent(new h.w.Event('pointerup',{bubbles:true}));await h.flush();
 assert.equal(h.state.scores.find(s=>s.response_id===13).score,5);
 h.close();
});
test('custom timer input survives arriving responses and failed polls preserve the dashboard',async()=>{
 const h=await setup();const input=el(h,'#customMinutes');input.focus();input.value='7';
 h.state.students.push({id:1,display_name:'New student'});await h.poll();assert.equal(el(h,'#customMinutes'),input);assert.equal(input.value,'7');
 input.blur();h.fail(true);await h.poll();assert.ok(el(h,'[data-action="end"]'));assert.equal(el(h,'#teacherConnectionNotice').hidden,false);
 h.fail(false);await h.poll();assert.equal(el(h,'#customMinutes').value,'7');assert.equal(el(h,'#teacherConnectionNotice').hidden,true);h.close();
});
