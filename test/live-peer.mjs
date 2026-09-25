import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
const base=process.env.PARAFLY_URL||'https://parafly-web-production.up.railway.app';
async function req(path,method='GET',headers={},body){const r=await fetch(`${base}/api${path}`,{method,headers:{'content-type':'application/json',...headers},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});return {status:r.status,data:await r.json()};}
async function ok(...args){const r=await req(...args);assert.ok(r.status<300,`${args[0]}: ${r.status} ${JSON.stringify(r.data)}`);return r.data;}
const room=await ok('/rooms','POST',{}, {title:'Emoji feedback verification',paragraphs:['The Constitution was signed in 1787. The first census was held in 1790. It counted nearly four million people.']});
const path=`/rooms/${room.id}`,teacher={'x-teacher-token':room.teacherToken};
const students=await Promise.all(Array.from({length:6},(_,i)=>ok(`${path}/join`,'POST',{}, {nickname:`Review test ${i+1}`})));
writeFileSync('/tmp/parafly-peer-session.json',JSON.stringify({room,students}));
const sh=i=>({'x-student-token':students[i].token}), view=i=>ok(`${path}/student`,'GET',sh(i)),dash=()=>ok(`${path}/teacher`,'GET',teacher),control=action=>ok(`${path}/control`,'PATCH',teacher,{action});
await control('start');
await Promise.all(students.map((_,i)=>ok(`${path}/responses`,'POST',sh(i),{round:0,response:'The Constitution dates to 1787; the census in 1790 counted nearly four million people.'})));
await control('end');await control('skip');
let v=await view(0);assert.equal(v.room.phase,'summary');assert.equal(v.paragraph,null);assert.deepEqual(v.mine,[]);
await Promise.all(students.map((_,i)=>ok(`${path}/summary`,'POST',sh(i),{summary:`The Constitution was signed in 1787. The first census was held in 1790 and counted nearly four million people. Summary ${i+1}.`,includesThreeFacts:true})));
await control('reviewSummaries');let d=await dash();assert.equal(d.peerQuality.expected,30);assert.equal(d.peerQuality.average,null);
const views=await Promise.all(students.map((_,i)=>view(i)));
for(const v of views){assert.equal(v.peerReviews.length,5);assert.ok(v.peerReviews.every(x=>x.summary_id!==v.summary.id));assert.equal(v.peerFeedback,null);assert.ok(v.peerReviews.every(x=>!('student_id' in x)&&!('nickname' in x)));}
assert.equal((await req(`${path}/summary-review`,'POST',sh(0),{summaryId:views[0].summary.id,score:3})).status,403);
assert.equal((await req(`${path}/summary-review`,'POST',sh(0),{summaryId:views[0].peerReviews[0].summary_id,score:5})).status,400);
assert.equal((await req(`${path}/summary/unsubmit`,'POST',sh(0),{})).status,409);
await ok(`${path}/summary-review`,'POST',sh(0),{summaryId:views[0].peerReviews[0].summary_id,score:4});
d=await dash();assert.equal(d.peerQuality.received,1);assert.equal(d.peerQuality.average,4);assert.equal((await view(0)).peerReviews[0].score,4);
await Promise.all(views.flatMap((v,i)=>v.peerReviews.map(x=>ok(`${path}/summary-review`,'POST',sh(i),{summaryId:x.summary_id,score:3}))));
d=await dash();assert.equal(d.peerQuality.received,30);assert.equal(d.peerQuality.average,3);assert.ok(d.peerQuality.summaries.every(x=>x.received===5));
await ok(`${path}/summary-scores/${d.summaries[0].id}`,'PUT',teacher,{score:9});assert.equal((await view(0)).peerFeedback,null);
// Leave open for browser verification if requested.
if(!process.env.KEEP_REVIEW_OPEN){await control('finish');v=await view(0);assert.deepEqual(v.peerFeedback.counts,[0,0,5,0]);assert.equal(v.releasedSummaryScore,null);assert.equal((await req(`${path}/summary-review`,'POST',sh(0),{summaryId:views[0].peerReviews[0].summary_id,score:4})).status,409);}
console.log(JSON.stringify({ok:true,roomId:room.id,students:6,ratings:30,average:3}));
