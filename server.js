import crypto from "node:crypto";
import express from "express";
import pg from "pg";
import { cleanCode, cleanNickname, currentParagraph, phases, publicRoom } from "./lib.js";

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT || 3000);
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
const db = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false });

app.use(express.json({ limit: "1mb" }));
app.use("/api", (_req, res, next) => { res.set("Cache-Control", "no-store"); next(); });
app.use(express.static("public"));

await db.query(`
CREATE TABLE IF NOT EXISTS parafly_rooms (
 id SERIAL PRIMARY KEY, title TEXT NOT NULL, directions TEXT NOT NULL DEFAULT '', paragraphs JSONB NOT NULL,
 join_code TEXT UNIQUE NOT NULL, teacher_token TEXT NOT NULL, seconds_per_round INTEGER NOT NULL DEFAULT 60,
 word_limit INTEGER, current_round INTEGER NOT NULL DEFAULT -1, phase TEXT NOT NULL DEFAULT 'lobby',
 ends_at TIMESTAMPTZ, selected_ids JSONB NOT NULL DEFAULT '[]', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 expires_at TIMESTAMPTZ NOT NULL DEFAULT NOW() + INTERVAL '24 hours'
);
CREATE TABLE IF NOT EXISTS parafly_students (
 id SERIAL PRIMARY KEY, room_id INTEGER NOT NULL REFERENCES parafly_rooms(id) ON DELETE CASCADE,
 nickname TEXT NOT NULL, token TEXT UNIQUE NOT NULL, joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(room_id, nickname)
);
CREATE TABLE IF NOT EXISTS parafly_responses (
 id SERIAL PRIMARY KEY, room_id INTEGER NOT NULL REFERENCES parafly_rooms(id) ON DELETE CASCADE,
 student_id INTEGER NOT NULL REFERENCES parafly_students(id) ON DELETE CASCADE, round_index INTEGER NOT NULL,
 response_text TEXT NOT NULL, submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE(student_id, round_index)
);
CREATE TABLE IF NOT EXISTS parafly_votes (
 id SERIAL PRIMARY KEY, room_id INTEGER NOT NULL REFERENCES parafly_rooms(id) ON DELETE CASCADE,
 student_id INTEGER NOT NULL REFERENCES parafly_students(id) ON DELETE CASCADE, round_index INTEGER NOT NULL,
 response_id INTEGER NOT NULL REFERENCES parafly_responses(id) ON DELETE CASCADE, UNIQUE(student_id, round_index)
);`);

const one = async (text, params=[]) => (await db.query(text, params)).rows[0];
const fail = (res, code, error) => res.status(code).json({ error });
async function roomById(id) { return one("SELECT * FROM parafly_rooms WHERE id=$1 AND expires_at>NOW()", [id]); }
async function teacher(req, res) {
  const room = await one("SELECT * FROM parafly_rooms WHERE id=$1 AND teacher_token=$2 AND expires_at>NOW()", [req.params.id, req.header("x-teacher-token")]);
  if (!room) fail(res, 403, "Teacher session required");
  return room;
}
async function student(req, res) {
  const value = await one("SELECT * FROM parafly_students WHERE room_id=$1 AND token=$2", [req.params.id, req.header("x-student-token")]);
  if (!value) fail(res, 403, "Student session required");
  return value;
}

app.get("/api/health", (_req,res)=>res.json({status:"ok"}));
app.post("/api/rooms", async (req,res,next)=>{ try {
  const title=String(req.body.title??"").trim().slice(0,120);
  const directions=String(req.body.directions??"").trim().slice(0,500);
  const paragraphs=(Array.isArray(req.body.paragraphs)?req.body.paragraphs:[]).map(x=>String(x).trim()).filter(Boolean);
  const seconds=Math.min(600,Math.max(30,Number(req.body.secondsPerRound)||60));
  const wordLimit=req.body.wordLimit?Math.min(500,Math.max(5,Number(req.body.wordLimit))):null;
  let joinCode=cleanCode(req.body.joinCode);
  if(!title||paragraphs.length<1||paragraphs.length>3||paragraphs.some(x=>x.length>5000)) return fail(res,400,"Enter a title and one to three paragraphs");
  if(joinCode.length<3) joinCode=crypto.randomBytes(3).toString("hex").toUpperCase();
  const token=crypto.randomUUID();
  const result=await one(`INSERT INTO parafly_rooms(title,directions,paragraphs,join_code,teacher_token,seconds_per_round,word_limit)
    VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[title,directions,JSON.stringify(paragraphs),joinCode,token,seconds,wordLimit]);
  res.status(201).json({...publicRoom(result),teacherToken:token});
} catch(e){ if(e.code==="23505") return fail(res,409,"That class code is already in use"); next(e); }});

app.get("/api/rooms/code/:code",async(req,res,next)=>{try{
  const room=await one("SELECT * FROM parafly_rooms WHERE join_code=$1 AND expires_at>NOW()",[cleanCode(req.params.code)]);
  if(!room)return fail(res,404,"Class not found"); res.json(publicRoom(room));
}catch(e){next(e)}});

app.post("/api/rooms/:id/join",async(req,res,next)=>{try{
  const room=await roomById(req.params.id); if(!room||room.phase==="complete")return fail(res,404,"This class is unavailable");
  const nickname=cleanNickname(req.body.nickname); if(nickname.length<1)return fail(res,400,"Enter your classroom nickname");
  const token=crypto.randomUUID();
  const s=await one("INSERT INTO parafly_students(room_id,nickname,token) VALUES($1,$2,$3) RETURNING id,nickname",[room.id,nickname,token]);
  res.status(201).json({...s,roomId:room.id,token});
}catch(e){if(e.code==="23505")return fail(res,409,"That nickname is already in use");next(e)}});

app.get("/api/rooms/:id/student",async(req,res,next)=>{try{
  const s=await student(req,res); if(!s)return; const room=await roomById(req.params.id); if(!room)return fail(res,404,"Room expired");
  const mine=(await db.query("SELECT id,round_index,response_text,submitted_at FROM parafly_responses WHERE student_id=$1 ORDER BY round_index",[s.id])).rows;
  let exemplars=[],results=[];
  if(["voting","results"].includes(room.phase)&&room.current_round>=0){
    exemplars=(await db.query("SELECT id,response_text FROM parafly_responses WHERE room_id=$1 AND round_index=$2 AND id=ANY($3::int[]) ORDER BY id",[room.id,room.current_round,room.selected_ids])).rows;
  }
  if(room.phase==="results") results=(await db.query(`SELECT response_id,COUNT(*)::int votes FROM parafly_votes WHERE room_id=$1 AND round_index=$2 GROUP BY response_id`,[room.id,room.current_round])).rows;
  const myVote=await one("SELECT response_id FROM parafly_votes WHERE student_id=$1 AND round_index=$2",[s.id,room.current_round]);
  res.json({room:publicRoom(room),student:{id:s.id,nickname:s.nickname},paragraph:room.phase==="writing"?currentParagraph(room):null,mine,exemplars,results,myVote:myVote?.response_id??null});
}catch(e){next(e)}});

app.post("/api/rooms/:id/responses",async(req,res,next)=>{try{
  const s=await student(req,res);if(!s)return;const room=await roomById(req.params.id);
  if(!room||room.phase!=="writing"||room.current_round<0)return fail(res,409,"This writing round is closed");
  const text=String(req.body.response??"").trim();if(text.length<3||text.length>5000)return fail(res,400,"Write your paraphrase before submitting");
  if(room.word_limit&&text.split(/\s+/).length>room.word_limit)return fail(res,400,`Stay within ${room.word_limit} words`);
  await db.query(`INSERT INTO parafly_responses(room_id,student_id,round_index,response_text) VALUES($1,$2,$3,$4)
    ON CONFLICT(student_id,round_index) DO UPDATE SET response_text=EXCLUDED.response_text,submitted_at=NOW()`,[room.id,s.id,room.current_round,text]);
  res.status(201).json({ok:true});
}catch(e){next(e)}});

app.get("/api/rooms/:id/teacher",async(req,res,next)=>{try{
  const room=await teacher(req,res);if(!room)return;
  const students=(await db.query("SELECT id,nickname,joined_at FROM parafly_students WHERE room_id=$1 ORDER BY joined_at",[room.id])).rows;
  const responses=(await db.query("SELECT r.id,r.student_id,r.round_index,r.response_text,r.submitted_at,s.nickname FROM parafly_responses r JOIN parafly_students s ON s.id=r.student_id WHERE r.room_id=$1 ORDER BY r.submitted_at",[room.id])).rows;
  const votes=(await db.query("SELECT response_id,COUNT(*)::int votes FROM parafly_votes WHERE room_id=$1 AND round_index=$2 GROUP BY response_id",[room.id,room.current_round])).rows;
  res.json({room:{...publicRoom(room),paragraphs:room.paragraphs,selectedIds:room.selected_ids},students,responses,votes});
}catch(e){next(e)}});

app.patch("/api/rooms/:id/control",async(req,res,next)=>{try{
  const room=await teacher(req,res);if(!room)return;const action=req.body.action;
  let phase=room.phase,round=room.current_round,endsAt=room.ends_at,selected=room.selected_ids;
  if(action==="start") { round=round<0?0:round; phase="writing"; endsAt=new Date(Date.now()+room.seconds_per_round*1000); selected=[]; }
  else if(action==="end") { if(phase!=="writing")return fail(res,409,"No writing round is open"); phase="review"; endsAt=null; }
  else if(action==="vote") {
    selected=[...new Set((req.body.selectedIds??[]).map(Number).filter(Number.isInteger))].slice(0,5);
    if(selected.length<2)return fail(res,400,"Select at least two responses");
    const valid=await db.query("SELECT id FROM parafly_responses WHERE room_id=$1 AND round_index=$2 AND id=ANY($3::int[])",[room.id,room.current_round,selected]);
    if(valid.rowCount!==selected.length)return fail(res,400,"One of those responses is not part of this round");
    phase="voting";
  }
  else if(action==="results") { if(phase!=="voting")return fail(res,409,"Voting is not open"); phase="results"; }
  else if(action==="next") { if(round+1>=room.paragraphs.length){phase="complete";endsAt=null;} else {round++;phase="writing";endsAt=new Date(Date.now()+room.seconds_per_round*1000);selected=[];} }
  else if(action==="addTime") { if(phase!=="writing")return fail(res,409,"No writing round is open"); endsAt=new Date(Math.max(Date.now(),new Date(endsAt).getTime())+30000); }
  else return fail(res,400,"Unknown control");
  const updated=await one("UPDATE parafly_rooms SET phase=$1,current_round=$2,ends_at=$3,selected_ids=$4 WHERE id=$5 RETURNING *",[phase,round,endsAt,JSON.stringify(selected),room.id]);
  res.json(publicRoom(updated));
}catch(e){next(e)}});

app.post("/api/rooms/:id/vote",async(req,res,next)=>{try{
  const s=await student(req,res);if(!s)return;const room=await roomById(req.params.id);const responseId=Number(req.body.responseId);
  if(!room||room.phase!=="voting"||!room.selected_ids.includes(responseId))return fail(res,409,"Voting is closed");
  await db.query("INSERT INTO parafly_votes(room_id,student_id,round_index,response_id) VALUES($1,$2,$3,$4) ON CONFLICT(student_id,round_index) DO UPDATE SET response_id=EXCLUDED.response_id",[room.id,s.id,room.current_round,responseId]);res.json({ok:true});
}catch(e){next(e)}});

app.get("/api/rooms/:id/export",async(req,res,next)=>{try{const room=await teacher(req,res);if(!room)return;
  const rows=(await db.query("SELECT s.nickname,r.round_index,r.response_text FROM parafly_responses r JOIN parafly_students s ON s.id=r.student_id WHERE r.room_id=$1 ORDER BY s.nickname,r.round_index",[room.id])).rows;
  const esc=v=>`"${String(v??"").replaceAll('"','""')}"`;const csv=["Nickname,Round,Response",...rows.map(r=>[r.nickname,r.round_index+1,r.response_text].map(esc).join(","))].join("\n");
  res.type("text/csv").attachment("parafly-responses.csv").send(csv);
}catch(e){next(e)}});

app.use((err,_req,res,_next)=>{console.error(err);res.status(500).json({error:"Something went wrong"})});
app.get("/{*splat}",(_req,res)=>res.sendFile(new URL("./public/index.html",import.meta.url).pathname));
app.listen(port,()=>console.log(`ParaFLY listening on ${port}`));
