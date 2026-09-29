import assert from 'node:assert/strict';
const base=process.env.PARAFLY_URL||'https://parafly-web-production.up.railway.app';
async function request(path,method='GET',headers={},body){const r=await fetch(base+'/api'+path,{method,headers:{'content-type':'application/json',...headers},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});return {status:r.status,data:await r.json()};}
async function ok(...args){const r=await request(...args);assert.ok(r.status<300,JSON.stringify(r));return r.data;}
const question='Why did debates about federal power lead to political parties?';
const input={title:'Final task DBQ verification',paragraphs:['Hamilton supported a national bank. Jefferson favored a narrower interpretation of federal powers. Their disagreements helped political parties develop.'],paragraphType:'compare',perspective:'third',dbqEnabled:true,dbqQuestion:question};
assert.equal((await request('/rooms','POST',{}, {...input,dbqQuestion:' '})).status,400);
const room=await ok('/rooms','POST',{},input);assert.equal(room.dbqQuestion,question);assert.equal(room.perspective,'third');
const p='/rooms/'+room.id,t={'x-teacher-token':room.teacherToken};
const students=await Promise.all(Array.from({length:6},(_,i)=>ok(p+'/join','POST',{}, {nickname:'DBQ test '+(i+1)})));
const sh=i=>({'x-student-token':students[i].token}),view=i=>ok(p+'/student','GET',sh(i)),dash=()=>ok(p+'/teacher','GET',t),control=action=>ok(p+'/control','PATCH',t,{action});
await control('start');let v=await view(0);assert.equal(v.room.dbqQuestion,question);assert.ok(v.paragraph);
await Promise.all(students.map((_,i)=>ok(p+'/responses','POST',sh(i),{round:0,response:'Hamilton wanted a national bank, while Jefferson limited federal power. Their disagreements contributed to parties.'})));
await control('end');let d=await dash();await Promise.all(d.responses.map((r,i)=>ok(p+'/scores/'+r.id,'PUT',t,{score:i+3})));
await control('vote');d=await dash();
await Promise.all(students.flatMap((_,i)=>[0,1,2].map(battleIndex=>ok(p+'/vote','POST',sh(i),{battleIndex,responseId:d.room.selectedIds[battleIndex*2]}))));
await control('results');d=await dash();assert.ok(d.responses.some(x=>x.id===d.room.modelResponseId));const winner=d.room.modelResponseId;assert.equal((await view(0)).room.dbqQuestion,question);
await control('share');d=await dash();assert.equal(d.room.modelResponseId,winner);assert.equal(d.room.shareStudentIds.length,2);
await control('next');v=await view(0);assert.equal(v.room.dbqQuestion,question);assert.equal(v.paragraph,null);assert.deepEqual(v.mine,[]);assert.deepEqual(v.exemplars,[]);
const summary='Debates over federal authority encouraged rival parties. Hamilton supported a bank, Jefferson favored limited federal power, and their disagreements helped political parties develop.';
await Promise.all(students.map((_,i)=>ok(p+'/summary','POST',sh(i),{summary,includesThreeFacts:true})));
await control('reviewSummaries');v=await view(0);assert.equal(v.room.dbqQuestion,question);assert.equal(v.peerReviews.length,5);assert.equal(v.paragraph,null);
await ok(p+'/summary-review','POST',sh(0),{summaryId:v.peerReviews[0].summary_id,score:3});await control('finish');
console.log('PASS: DBQ question persisted through writing, voting, TPS, sharing, final writing and peer review; original passages hidden during final task.');
const n=await ok('/rooms','POST',{}, {title:'Narrative verification',paragraphs:input.paragraphs,paragraphType:'narrative',perspective:'first',finalPrompt:'Describe a fictional visit to a debate.'});
const np='/rooms/'+n.id,nt={'x-teacher-token':n.teacherToken};const ns=await ok(np+'/join','POST',{}, {nickname:'Narrative test'});
for(const action of ['start','end','skip'])await ok(np+'/control','PATCH',nt,{action});
await ok(np+'/summary','POST',{'x-student-token':ns.token},{summary:'I stepped into the crowded room, listened to the debate, and left thinking about the arguments I had heard.',confirmedRequirements:true});
console.log('PASS: narrative supports its own criteria without a three-fact confirmation.');
