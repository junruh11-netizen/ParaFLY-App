import assert from "node:assert/strict";

const base=process.env.PARAFLY_URL||"https://parafly-web-production.up.railway.app";
async function request(path,{method="GET",token,body}={}){
  const response=await fetch(`${base}/api${path}`,{method,signal:AbortSignal.timeout(30000),headers:{...(body?{"content-type":"application/json"}:{}),...(token?token:{})},body:body?JSON.stringify(body):undefined});
  const data=await response.json().catch(()=>({}));return {status:response.status,data};
}
const ok=async(path,options)=>{const result=await request(path,options);assert.ok(result.status>=200&&result.status<300,`${options?.method||"GET"} ${path}: ${result.status} ${JSON.stringify(result.data)}`);return result.data};

const code=`T${Date.now().toString(36).slice(-5)}`.toUpperCase();
const room=await ok("/rooms",{method:"POST",body:{title:"34 Student Feature Test",directions:"Keep the same facts.",paragraphs:["The Constitution was signed in 1787 and created a new framework for the United States government."],secondsPerRound:120}});
console.log("room",room.id);
const teacher={"x-teacher-token":room.teacherToken};
const students=await Promise.all(Array.from({length:34},(_,i)=>ok(`/rooms/${room.id}/join`,{method:"POST",body:{nickname:`Student ${i+1}`}})));
console.log("joined",students.length);
assert.equal(new Set(students.map(x=>x.nickname)).size,34);
let dashboard=await ok(`/rooms/${room.id}/teacher`,{token:teacher});
assert.equal(dashboard.students.length,34);assert.ok(dashboard.joinUrl.endsWith(`/join/${room.joinCode}`));assert.ok(dashboard.qrDataUrl.startsWith("data:image/png;base64,"));

await ok(`/rooms/${room.id}/control`,{method:"PATCH",token:teacher,body:{action:"start"}});
dashboard=await ok(`/rooms/${room.id}/teacher`,{token:teacher});
let firstStudentView=await ok(`/rooms/${room.id}/student`,{token:{"x-student-token":students[0].token}});
assert.equal(firstStudentView.room.timerEndsAt,dashboard.room.timerEndsAt);
const beforeAdd=new Date(dashboard.room.timerEndsAt).getTime();
await ok(`/rooms/${room.id}/timer`,{method:"POST",token:teacher,body:{action:"add",seconds:30}});
dashboard=await ok(`/rooms/${room.id}/teacher`,{token:teacher});
firstStudentView=await ok(`/rooms/${room.id}/student`,{token:{"x-student-token":students[0].token}});
assert.equal(firstStudentView.room.timerEndsAt,dashboard.room.timerEndsAt);
assert.ok(new Date(dashboard.room.timerEndsAt).getTime()>=beforeAdd+29000);
await Promise.all(students.map((s,i)=>ok(`/rooms/${room.id}/responses`,{method:"POST",token:{"x-student-token":s.token},body:{response:`In 1787, a new government framework for the United States was established when the Constitution was signed. Response ${i+1}.`}})));
console.log("responses",students.length);
dashboard=await ok(`/rooms/${room.id}/teacher`,{token:teacher});
await Promise.all(dashboard.responses.map((r,i)=>ok(`/rooms/${room.id}/scores/${r.id}`,{method:"PUT",token:teacher,body:{score:i%10+1}})));
console.log("scores",dashboard.responses.length);
let studentView=await ok(`/rooms/${room.id}/student`,{token:{"x-student-token":students[0].token}});assert.equal(studentView.releasedScores.length,0);
await ok(`/rooms/${room.id}/scores/release`,{method:"POST",token:teacher,body:{round:0,release:true}});
studentView=await ok(`/rooms/${room.id}/student`,{token:{"x-student-token":students[0].token}});assert.equal(studentView.releasedScores.length,1);
await ok(`/rooms/${room.id}/scores/release`,{method:"POST",token:teacher,body:{round:0,release:false}});
studentView=await ok(`/rooms/${room.id}/student`,{token:{"x-student-token":students[0].token}});assert.equal(studentView.releasedScores.length,0);

await ok(`/rooms/${room.id}/control`,{method:"PATCH",token:teacher,body:{action:"end"}});
await ok(`/rooms/${room.id}/control`,{method:"PATCH",token:teacher,body:{action:"vote"}});
dashboard=await ok(`/rooms/${room.id}/teacher`,{token:teacher});assert.equal(dashboard.voteProgress.expected,34);assert.equal(dashboard.room.selectedIds.length,6);
const late=await ok(`/rooms/${room.id}/join`,{method:"POST",body:{nickname:"Late Student"}});const lateView=await ok(`/rooms/${room.id}/student`,{token:{"x-student-token":late.token}});assert.equal(lateView.eligibleToVote,false);
await ok(`/rooms/${room.id}/timer`,{method:"POST",token:teacher,body:{action:"start",seconds:300,autoClose:true}});
const pairs=[dashboard.room.selectedIds.slice(0,2),dashboard.room.selectedIds.slice(2,4),dashboard.room.selectedIds.slice(4,6)];
await Promise.all(students.flatMap(s=>pairs.map((pair,battleIndex)=>ok(`/rooms/${room.id}/vote`,{method:"POST",token:{"x-student-token":s.token},body:{responseId:pair[0],battleIndex}}))));
console.log("votes",students.length*3);
const duplicate=await request(`/rooms/${room.id}/vote`,{method:"POST",token:{"x-student-token":students[0].token},body:{responseId:pairs[0][1],battleIndex:0}});assert.equal(duplicate.status,409);
dashboard=await ok(`/rooms/${room.id}/teacher`,{token:teacher});assert.equal(dashboard.voteProgress.completed,34);assert.equal(dashboard.voteProgress.submitted,102);assert.equal(dashboard.voteProgress.expected,34);
await ok(`/rooms/${room.id}/timer`,{method:"POST",token:teacher,body:{action:"pause"}});dashboard=await ok(`/rooms/${room.id}/teacher`,{token:teacher});assert.equal(dashboard.room.timerRunning,false);assert.ok(dashboard.room.timerRemaining>0);
await ok(`/rooms/${room.id}/timer`,{method:"POST",token:teacher,body:{action:"resume"}});dashboard=await ok(`/rooms/${room.id}/teacher`,{token:teacher});assert.equal(dashboard.room.timerRunning,true);
await ok(`/rooms/${room.id}/timer`,{method:"POST",token:teacher,body:{action:"clear"}});
await ok(`/rooms/${room.id}/control`,{method:"PATCH",token:teacher,body:{action:"results"}});await ok(`/rooms/${room.id}/control`,{method:"PATCH",token:teacher,body:{action:"share"}});await ok(`/rooms/${room.id}/control`,{method:"PATCH",token:teacher,body:{action:"next"}});
await Promise.all(students.map(s=>ok(`/rooms/${room.id}/summary`,{method:"POST",token:{"x-student-token":s.token},body:{summary:"The Constitution was signed in 1787. It created a framework for the United States government. That framework established a new national government.",includesThreeFacts:true}})));
console.log("summaries",students.length);
await ok(`/rooms/${room.id}/control`,{method:"PATCH",token:teacher,body:{action:"finish"}});
console.log(JSON.stringify({ok:true,roomId:room.id,code:room.joinCode,students:students.length,totalVotes:102,joinUrl:dashboard.joinUrl}));
