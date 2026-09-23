import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const source = readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
async function setup(storage = {}) {
  const dom = new JSDOM('<main id="app"></main><div id="toast"></div>', {
    url: 'https://parafly.test/student/1', runScripts: 'outside-only',
  });
  const w = dom.window;
  w.localStorage.setItem('parafly-student', JSON.stringify({roomId: 1, token: 'test-student'}));
  for (const [k,v] of Object.entries(storage)) w.localStorage.setItem(k,v);
  const state = {room: {title: 'Test', phase: 'writing', currentRound: 0, paragraphCount: 1},
    mine: [], myVotes: [], releasedScores: [], student: {id: 1, nickname: 'Student'}, paragraph: 'Source'};
  let fail = false, poll;
  w.setInterval = (fn, ms) => { if (ms === 2000) poll = fn; return ms; };
  w.clearInterval = () => {};
  w.fetch = async () => { if (fail) throw new TypeError('Failed to fetch'); return {ok:true,json:async()=>structuredClone(state)}; };
  w.eval(source);
  await flush();
  return {w, state, poll: () => poll(), fail: v => {fail=v;}, close: () => dom.window.close()};
}
function type(w, id, text) {
  const el = w.document.getElementById(id);
  el.value = text;
  el.dispatchEvent(new w.Event('input'));
  return el;
}
test('timer start, adjustment, pause and clear preserve text, focus and cursor', async () => {
  const h = await setup();
  const answer = type(h.w, 'answer', 'My carefully written answer');
  answer.focus(); answer.setSelectionRange(7,7);
  for (const timer of [
    {timerRunning:true,timerEndsAt:new Date(Date.now()+120000).toISOString()},
    {timerRunning:true,timerEndsAt:new Date(Date.now()+180000).toISOString()},
    {timerRunning:false,timerRemaining:80},
    {timerRunning:false,timerRemaining:0},
  ]) {
    Object.assign(h.state.room,timer); await h.poll();
    assert.equal(h.w.document.getElementById('answer'),answer);
    assert.equal(answer.value,'My carefully written answer');
    assert.equal(answer.selectionStart,7);
    assert.equal(h.w.document.activeElement,answer);
  }
  h.close();
});
test('failed polls retain the form and recover without a blank screen', async () => {
  const h = await setup(); const answer = type(h.w,'answer','Still writing');
  h.fail(true); await h.poll();
  assert.equal(h.w.document.getElementById('answer'),answer);
  assert.equal(h.w.document.getElementById('connectionNotice').hidden,false);
  type(h.w,'answer','Still writing while disconnected');
  h.fail(false); await h.poll();
  assert.equal(answer.value,'Still writing while disconnected');
  assert.equal(h.w.document.getElementById('connectionNotice').hidden,true);
  h.close();
});
test('drafts survive score rerenders, phase reopening and refresh; summary drafts remain separate', async () => {
  const h = await setup(); type(h.w,'answer','Passage draft');
  h.state.releasedScores=[{round_index:0,score:8}]; await h.poll();
  assert.equal(h.w.document.getElementById('answer').value,'Passage draft');
  h.state.room.phase='summary'; await h.poll(); type(h.w,'summaryAnswer','A final summary with three facts.');
  const check=h.w.document.getElementById('threeFacts'); check.checked=true; check.dispatchEvent(new h.w.Event('change'));
  h.state.room.phase='writing'; await h.poll();
  assert.equal(h.w.document.getElementById('answer').value,'Passage draft');
  const storage=Object.fromEntries(Object.keys(h.w.localStorage).map(k=>[k,h.w.localStorage.getItem(k)])); h.close();
  const restored=await setup(storage);
  assert.equal(restored.w.document.getElementById('answer').value,'Passage draft');
  restored.state.room.phase='summary'; await restored.poll();
  assert.equal(restored.w.document.getElementById('summaryAnswer').value,'A final summary with three facts.');
  assert.equal(restored.w.document.getElementById('threeFacts').checked,true);
  restored.close();
});
