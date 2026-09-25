import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {csvCell,qualityStats} from '../lib.js';
const server=readFileSync(new URL('../server.js',import.meta.url),'utf8');
const source=server.slice(server.indexOf('app.get("/api/rooms/:id/export"'),server.indexOf('app.use((err'));
async function run(authorized) {
  let handler, csv, queries=0;
  vm.runInNewContext(source, {app:{get:(_path,fn)=>{handler=fn;}},csvCell,qualityStats,
    teacher:async()=>authorized?{id:7}:null,
    db:{query:async(sql,args)=>{
      queries++; assert.deepEqual(Array.from(args),[7]);
      if (sql.includes('parafly_summary_reviews')) return {rows:[{summary_id:1,score:3},{summary_id:1,score:4}]};
      assert.match(sql,/LEFT JOIN parafly_(response|summary)_scores/);
      return {rows:sql.includes('parafly_responses')?[
        {nickname:'Student One',round_index:0,response_text:'First, "answer"\nnext line',score:8},
        {nickname:'Student Two',round_index:0,response_text:'=1+1',score:null}
      ]:[{id:1,nickname:'Student One',summary_text:'Three facts',score:9}]};
    }}});
  const res={type(){return this;},attachment(){return this;},send(value){csv=value;}};
  await handler({},res,error=>{throw error;}); return {csv,queries};
}
test('teacher export includes graded and ungraded answers, summaries and escaped text',async()=>{
  const {csv}=await run(true);
  assert.ok(csv.startsWith('\uFEFFStudent name,Task,Answer,Grade (out of 10),Grading status'));
  assert.ok(csv.includes('"First, ""answer""\nnext line","8","Graded"'));
  assert.ok(csv.includes('"Student Two","Passage 1","\'=1+1","","Ungraded"'));
  assert.ok(csv.includes('"Student One","Final Summary","Three facts","9","Graded","3.50","2"'));
});
test('export never queries or returns student work without teacher authorization',async()=>{
  assert.deepEqual(await run(false),{csv:undefined,queries:0});
});
