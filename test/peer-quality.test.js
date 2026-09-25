import test from 'node:test';
import assert from 'node:assert/strict';
import {assignSummaryReviews,qualityStats} from '../lib.js';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {JSDOM} from 'jsdom';
test('balanced distinct non-self assignments for classes of 0–40',()=>{
 for(let n=0;n<=40;n++){
  const summaries=Array.from({length:n},(_,i)=>({id:100+i,student_id:1000+i}));
  const reviews=assignSummaryReviews(summaries), expected=Math.min(5,Math.max(0,n-1));
  assert.equal(reviews.length,n*expected);
  for(const s of summaries){
   const assigned=reviews.filter(x=>x.reviewerId===s.student_id);
   assert.equal(assigned.length,expected);assert.equal(new Set(assigned.map(x=>x.summaryId)).size,expected);
   assert.ok(assigned.every(x=>x.summaryId!==s.id));
   assert.equal(reviews.filter(x=>x.summaryId===s.id).length,expected);
  }
 }
});
test('class average weights rated summaries equally and never treats missing reviews as zero',()=>{
 const q=qualityStats([{summary_id:1,score:4},{summary_id:1,score:2},{summary_id:2,score:1},{summary_id:2,score:null},{summary_id:3,score:null}]);
 assert.equal(q.average,2);assert.equal(q.received,3);assert.equal(q.expected,5);
 assert.deepEqual(q.summaries[0].counts,[0,1,0,1]);assert.equal(q.summaries[2].average,null);
 assert.equal(qualityStats([]).average,null);
});
test('rating endpoint requires open phase, valid score and an assigned summary',async()=>{
 const source=readFileSync(new URL('../server.js',import.meta.url),'utf8');
 const start=source.indexOf('app.post("/api/rooms/:id/summary-review"');
 let handler, phase='summary_review',assigned=true,calls=0;
 vm.runInNewContext(source.slice(start,source.indexOf('\n}));',start)+5),{
  app:{post:(p,h)=>handler=h},roomWrite:h=>h,student:async()=>({id:8}),roomById:async()=>({id:1,phase}),matchesStep:()=>true,
  bodyOf:r=>r.body, fail:(res,status,error)=>res.status(status).json({error}),
  one:async(sql,args)=>{calls++;assert.match(sql,/reviewer_id=\$3 AND summary_id=\$4/);assert.deepEqual(Array.from(args),[3,1,8,12]);return assigned?{summary_id:12}:null;}
 });
 async function run(score=3){const res={statusCode:200,status(n){this.statusCode=n;return this},json(x){this.data=x;return this}};await handler({params:{id:1},body:{summaryId:12,score}},res);return res.statusCode;}
 assert.equal(await run(),200);assigned=false;assert.equal(await run(),403);
 for(const score of [0,5,2.5,'3',null])assert.equal(await run(score),400);
 phase='complete';assert.equal(await run(),409);assert.equal(calls,2);
});
const source=readFileSync(new URL('../public/app.js',import.meta.url),'utf8');
const flush=async()=>{for(let i=0;i<5;i++)await new Promise(r=>setImmediate(r));};
async function studentUI(state){
 const dom=new JSDOM('<main id="app"></main><div id="toast"></div>',{url:'https://test/student/1',runScripts:'outside-only'}),w=dom.window;
 w.localStorage.setItem('parafly-student',JSON.stringify({roomId:1,token:'t'}));let poll,fail=false;
 w.setInterval=(fn,ms)=>{if(ms===2000)poll=fn;return ms};w.clearInterval=()=>{};
 w.fetch=async(url,options={})=>{if(fail)throw Error('Failed to fetch');if(options.method){const b=JSON.parse(options.body);state.peerReviews.find(x=>x.summary_id===b.summaryId).score=b.score;}return {ok:true,json:async()=>structuredClone(state)}};
 w.eval(source);await flush();return {w,poll:async()=>{await poll();await flush()},fail:v=>fail=v,close:()=>w.close()};
}
test('student ratings survive polls, failed writes and reload; feedback appears after closing',async()=>{
 const state={room:{title:'Test',phase:'summary_review',currentRound:0,paragraphCount:1},mine:[],myVotes:[],releasedScores:[],student:{id:1},summary:{summary_text:'My own final summary'},peerReviews:[{summary_id:2,summary_text:'Anonymous summary A',score:null},{summary_id:3,summary_text:'Anonymous summary B',score:null}],peerFeedback:null};
 let h=await studentUI(state);const doc=h.w.document;
 assert.equal(doc.querySelectorAll('.quality-option').length,4);
 const radio=doc.querySelector('[value="3"]');radio.click();await h.poll();assert.equal(doc.querySelector('[value="3"]'),radio);assert.ok(radio.checked);
 h.fail(true);doc.querySelector('#peerRatingForm').dispatchEvent(new h.w.Event('submit',{cancelable:true}));await flush();assert.match(doc.querySelector('#peerError').textContent,/try again/);assert.ok(radio.checked);
 h.fail(false);doc.querySelector('#peerRatingForm').dispatchEvent(new h.w.Event('submit',{cancelable:true}));await flush();assert.equal(state.peerReviews[0].score,3);assert.match(doc.body.textContent,/SUMMARY 2 OF 2/);
 h.close();h=await studentUI(state);assert.match(h.w.document.body.textContent,/SUMMARY 2 OF 2/);assert.doesNotMatch(h.w.document.body.textContent,/Your emoji feedback/);
 state.room.phase='complete';state.peerFeedback={received:1,expected:2,counts:[0,0,1,0]};await h.poll();assert.match(h.w.document.body.textContent,/Your emoji feedback/);assert.match(h.w.document.body.textContent,/1 of 2 reviews received/);h.close();
});
