import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {AsyncLocalStorage} from 'node:async_hooks';
import {readFileSync} from 'node:fs';
import {publicRoom} from '../lib.js';
const source=readFileSync(new URL('../server.js',import.meta.url),'utf8');
function harness(room) {
 const handlers=new Map(),queries=[];
 const context={app:{post:(p,h)=>handlers.set(p,h),patch:(p,h)=>handlers.set(p,h)},roomWrite:h=>h,
  teacher:async()=>room,student:async()=>({id:23}),roomById:async()=>room,
  publicRoom,bodyOf:req=>req.body,fail:(res,status,error)=>res.status(status).json({error}),
  one:async(sql,args)=>{queries.push({sql,args});return sql.startsWith('DELETE')?{response_text:'Saved answer',summary_text:'Saved summary'}:room;},
  db:{query:async()=>({rows:[]})},Date,Math,JSON,Number,String,Array,Set};
 vm.createContext(context);
 vm.runInContext(source.slice(source.indexOf('const matchesStep ='),source.indexOf('\napp.use(express.json')),context);
 for(const [method,path] of [['post','timer'],['patch','control'],['post','responses/unsubmit'],['post','summary/unsubmit']]){
  const start=source.indexOf(`app.${method}("/api/rooms/:id/${path}"`);const end=source.indexOf('\n}));',start)+5;
  vm.runInContext(source.slice(start,end),context);
 }
 return {queries,run:async(path,body={})=>{
  const res={statusCode:200,status(n){this.statusCode=n;return this;},json(x){this.body=x;return this;}};
  await handlers.get(`/api/rooms/:id/${path}`)({params:{id:7},body},res,e=>{throw e;});return res;
 }};
}
const room=(phase='writing')=>({id:7,phase,current_round:0,paragraphs:['one','two'],timer_running:false,timer_remaining:300,timer_ends_at:null,scores_released_rounds:[],summary_scores_released:false});
test('adding time preserves paused five-minute countdown; stale passage requests are rejected',async()=>{
 const h=harness(room());assert.equal((await h.run('timer',{action:'add',seconds:30,round:0})).statusCode,200);
 assert.deepEqual(Array.from(h.queries[0].args).slice(0,3),[false,330,null]);
 assert.equal((await h.run('timer',{action:'add',round:1})).statusCode,409);assert.equal(h.queries.length,1);
});
test('skip, next and finish do not require released grades',async()=>{
 for(const [phase,action] of [['review','skip'],['sharing','next'],['summary','finish']]){
  const h=harness(room(phase));assert.equal((await h.run('control',{action})).statusCode,200);
  assert.equal(h.queries[0].args[0],action==='finish'?'complete':'writing');
 }
});
test('unsubmit is limited to the authenticated student and open task',async()=>{
 for(const [endpoint,phase] of [['responses/unsubmit','writing'],['summary/unsubmit','summary']]){
  const h=harness(room(phase));assert.equal((await h.run(endpoint,{round:0})).statusCode,200);
  assert.match(h.queries[0].sql,/student_id=\$2/);assert.equal(h.queries[0].args[1],23);
  assert.equal((await harness(room('review')).run(endpoint)).statusCode,409);
 }
});
test('room writes acquire a row lock and commit before acknowledging; failures roll back',async()=>{
 for(const failure of [false,true]){
  const events=[];
  const client={query:async(sql)=>events.push(sql),release:()=>events.push('release')};
  const context={AsyncLocalStorage,pool:{connect:async()=>client}};vm.createContext(context);
  vm.runInContext(source.slice(source.indexOf('const requestDb ='),source.indexOf('const matchesStep ='))+'\nthis.wrap=roomWrite;',context);
  const handler=context.wrap(async(_req,res)=>{events.push('handler');if(failure)throw Error('Failed');res.json({ok:true});});
  const res={statusCode:200,json:()=>events.push('sent')};
  await handler({params:{id:7}},res,()=>events.push('error'));
  assert.match(events[1],/FOR UPDATE/);
  assert.deepEqual(events.slice(2),failure?['handler','ROLLBACK','error','release']:['handler','COMMIT','sent','release']);
 }
});
