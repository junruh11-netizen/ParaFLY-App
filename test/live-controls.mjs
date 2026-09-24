import assert from 'node:assert/strict';
const base=process.env.PARAFLY_URL||'https://parafly-web-production.up.railway.app';
async function req(path,method='GET',headers={},body){
 const r=await fetch(`${base}/api${path}`,{method,headers:{'content-type':'application/json',...headers},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});
 return {status:r.status,data:await r.json()};
}
async function ok(...args){const r=await req(...args);assert.ok(r.status<300,`${args[0]}: ${r.status} ${JSON.stringify(r.data)}`);return r.data;}
const room=await ok('/rooms','POST',{}, {title:'ParaFLY controls regression check',paragraphs:['The Constitution was signed in 1787. It created a framework for government.','The first United States census took place in 1790. It counted nearly four million people.']});
const path=`/rooms/${room.id}`,teacher={'x-teacher-token':room.teacherToken};
const students=await Promise.all(Array.from({length:12},(_,i)=>ok(`${path}/join`,'POST',{}, {nickname:`Test student ${i+1}`})));
const student=i=>({'x-student-token':students[i].token});
const control=action=>ok(`${path}/control`,'PATCH',teacher,{action});
const timer=body=>ok(`${path}/timer`,'POST',teacher,body);
const dash=()=>ok(`${path}/teacher`,'GET',teacher);
await control('start');
for(let round=0;round<2;round++){
 await timer({action:'start',seconds:300,round});
 let d=await dash();const end=Date.parse(d.room.timerEndsAt);
 await Promise.all([1,2,3].map(()=>timer({action:'add',seconds:30,round})));
 d=await dash();assert.equal(Date.parse(d.room.timerEndsAt),end+90000);
 assert.equal((await ok(`${path}/student`,'GET',student(0))).room.timerEndsAt,d.room.timerEndsAt);
 await timer({action:'pause'});d=await dash();const remaining=d.room.timerRemaining;
 await timer({action:'add',seconds:30});d=await dash();assert.equal(d.room.timerRunning,false);assert.equal(d.room.timerRemaining,remaining+30);
 await timer({action:'resume'});
 await Promise.all(students.map((_,i)=>ok(`${path}/responses`,'POST',student(i),{round,response:`Round ${round+1}: facts restated by student ${i+1}.`})));d=await dash();
 await Promise.all(d.responses.filter(r=>r.round_index===round).map((r,i)=>ok(`${path}/scores/${r.id}`,'PUT',teacher,{score:i%10+1})));
 d=await dash();assert.equal(d.scores.length,(round+1)*12);
 const first=d.responses.find(r=>r.round_index===round&&r.student_id===students[0].studentId);
 // Join session versions may expose id as studentId or only through student state.
 const mine=(await ok(`${path}/student`,'GET',student(0))).mine.find(r=>r.round_index===round);
 await ok(`${path}/responses/unsubmit`,'POST',student(0),{round});d=await dash();assert.equal(d.responses.filter(r=>r.round_index===round).length,11);assert.ok(!d.scores.some(s=>s.response_id===mine.id));
 await ok(`${path}/responses`,'POST',student(0),{round,response:'My corrected and resubmitted answer.'});d=await dash();
 for(const r of d.responses.filter(r=>r.round_index===round&&!d.scores.some(s=>s.response_id===r.id)))await ok(`${path}/scores/${r.id}`,'PUT',teacher,{score:8});
 assert.equal((await ok(`${path}/student`,'GET',student(0))).releasedScores.length,0);
 if(round===0){
  await ok(`${path}/scores/release`,'POST',teacher,{round,release:true});assert.equal((await ok(`${path}/student`,'GET',student(0))).releasedScores.length,1);
  await ok(`${path}/scores/release`,'POST',teacher,{round,release:false});
 }
 // An overlapping timer request must never reopen a round after End writing.
 const race=await Promise.all([req(`${path}/control`,'PATCH',teacher,{action:'end',round,phase:'writing'}),req(`${path}/timer`,'POST',teacher,{action:'add',seconds:30,round,phase:'writing'})]);
 assert.equal(race[0].status,200);assert.ok([200,409].includes(race[1].status));assert.equal((await dash()).room.phase,'review');
 assert.equal((await req(`${path}/responses/unsubmit`,'POST',student(0),{round})).status,409);
 if(round===0){await control('skip');assert.equal((await req(`${path}/timer`,'POST',teacher,{action:'add',round:0})).status,409);}
 console.log(`Passage ${round+1}: concurrent timer adds, 12 scores, unsubmit/resubmit and End writing passed`);
}
await control('vote');let d=await dash();
await Promise.all(students.flatMap((_,i)=>[0,1,2].map(battleIndex=>ok(`${path}/vote`,'POST',student(i),{battleIndex,responseId:d.room.selectedIds[battleIndex*2]}))));
await control('results');await control('share');await control('next');assert.equal((await dash()).room.phase,'summary');
const summary='The Constitution was signed in 1787. The first census took place in 1790. It counted nearly four million people.';
await ok(`${path}/summary`,'POST',student(0),{summary,includesThreeFacts:true});d=await dash();
await ok(`${path}/summary-scores/${d.summaries[0].id}`,'PUT',teacher,{score:9});
await ok(`${path}/summary/unsubmit`,'POST',student(0),{});d=await dash();assert.equal(d.summaries.length,0);assert.equal(d.summaryScores.length,0);
await ok(`${path}/summary`,'POST',student(0),{summary,includesThreeFacts:true});d=await dash();await ok(`${path}/summary-scores/${d.summaries[0].id}`,'PUT',teacher,{score:9});
await control('finish');d=await dash();assert.equal(d.room.phase,'complete');
const view=await ok(`${path}/student`,'GET',student(0));assert.equal(view.releasedScores.length,0);assert.equal(view.releasedSummaryScore,null);
console.log(JSON.stringify({ok:true,roomId:room.id,students:12,passages:2,gradesKeptPrivate:true}));
