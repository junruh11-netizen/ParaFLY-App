export const phases = ["lobby", "writing", "review", "voting", "results", "sharing", "summary", "complete"];

export function selectTwoTwoTwo(rows, random = Math.random) {
  const scored = rows.filter(x => Number.isInteger(Number(x.score)) && Number(x.score) >= 1 && Number(x.score) <= 10);
  if (scored.length < 6) return [];
  const sorted = scored.map(x => ({...x, score:Number(x.score), tie:random()})).sort((a,b)=>a.score-b.score||a.tie-b.tie);
  const low = sorted.slice(0,2), high = sorted.slice(-2), used = new Set([...low,...high].map(x=>x.id));
  const median = sorted[Math.floor((sorted.length-1)/2)].score;
  const middle = sorted.filter(x=>!used.has(x.id)).sort((a,b)=>Math.abs(a.score-median)-Math.abs(b.score-median)||a.tie-b.tie).slice(0,2);
  return [...low,...middle,...high].map(x=>x.id);
}

export function cleanCode(value) {
  return String(value ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 8);
}

export function cleanNickname(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").slice(0, 30);
}

export function publicRoom(room) {
  return {
    id: room.id,
    title: room.title,
    joinCode: room.join_code,
    directions: room.directions,
    paragraphCount: room.paragraphs.length,
    currentRound: room.current_round,
    phase: room.phase,
    secondsPerRound: room.seconds_per_round,
    wordLimit: room.word_limit,
    endsAt: room.ends_at,
    feedbackMode: room.feedback_mode || "class_vote",
    aiFactCheck: Boolean(room.ai_fact_check),
  };
}

export function currentParagraph(room) {
  return room.current_round >= 0 ? room.paragraphs[room.current_round] : null;
}

export function csvCell(value) {
  const text = String(value ?? "");
  const safe = /^\s*[=+\-@]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}
