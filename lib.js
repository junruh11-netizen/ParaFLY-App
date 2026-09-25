export const phases = [
  "lobby",
  "writing",
  "review",
  "voting",
  "results",
  "sharing",
  "summary",
  "summary_review",
  "complete",
];

export function selectTwoTwoTwo(rows, random = Math.random) {
  const scored = rows.filter(
    (x) =>
      Number.isInteger(Number(x.score)) &&
      Number(x.score) >= 1 &&
      Number(x.score) <= 10,
  );
  if (scored.length < 6) return [];
  const sorted = scored
    .map((x) => ({ ...x, score: Number(x.score), tie: random() }))
    .sort((a, b) => a.score - b.score || a.tie - b.tie);
  const low = sorted.slice(0, 2),
    high = sorted.slice(-2),
    used = new Set([...low, ...high].map((x) => x.id));
  const median = sorted[Math.floor((sorted.length - 1) / 2)].score;
  const middle = sorted
    .filter((x) => !used.has(x.id))
    .sort(
      (a, b) =>
        Math.abs(a.score - median) - Math.abs(b.score - median) ||
        a.tie - b.tie,
    )
    .slice(0, 2);
  return [...low, ...middle, ...high].map((x) => x.id);
}

export function cleanCode(value) {
  return String(value ?? "")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase()
    .slice(0, 8);
}

export function cleanNickname(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 30);
}

const aliasAdjectives = [
  "Brave",
  "Bright",
  "Calm",
  "Clever",
  "Curious",
  "Daring",
  "Eager",
  "Gentle",
  "Happy",
  "Kind",
  "Mighty",
  "Nimble",
  "Quick",
  "Quiet",
  "Ready",
  "Steady",
  "Swift",
  "Wise",
  "Bold",
  "Sunny",
];
const aliasAnimals = [
  "Badger",
  "Bear",
  "Dolphin",
  "Eagle",
  "Falcon",
  "Fox",
  "Hawk",
  "Heron",
  "Koala",
  "Lion",
  "Otter",
  "Owl",
  "Panda",
  "Penguin",
  "Raven",
  "Seal",
  "Tiger",
  "Turtle",
  "Wolf",
  "Wombat",
];

export function studentAlias(index) {
  const n = Math.max(0, Number(index) || 0),
    base = `${aliasAdjectives[n % aliasAdjectives.length]} ${aliasAnimals[Math.floor(n / aliasAdjectives.length) % aliasAnimals.length]}`;
  return n < aliasAdjectives.length * aliasAnimals.length
    ? base
    : `${base} ${Math.floor(n / (aliasAdjectives.length * aliasAnimals.length)) + 1}`;
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
    identityMode: room.identity_mode || "names",
    hideIdentities: room.hide_identities === true,
    timerEndsAt: room.timer_ends_at,
    timerRemaining: Number(room.timer_remaining || 0),
    timerRunning: Boolean(room.timer_running),
    voteExpected: Array.isArray(room.vote_expected_ids)
      ? room.vote_expected_ids.length
      : 0,
    voteClosed: Boolean(room.vote_closed),
    voteAutoClose: Boolean(room.vote_auto_close),
    scoresReleasedRounds: Array.isArray(room.scores_released_rounds)
      ? room.scores_released_rounds
      : [],
    summaryScoresReleased: Boolean(room.summary_scores_released),
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


// Cyclic assignments give every author the same number of distinct peers.
export function assignSummaryReviews(summaries, random = Math.random) {
  const shuffled = [...summaries];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.flatMap((reviewer, i) =>
    Array.from({ length: Math.min(5, Math.max(0, shuffled.length - 1)) }, (_, j) => ({
      reviewerId: reviewer.student_id,
      summaryId: shuffled[(i + j + 1) % shuffled.length].id,
      position: j,
    })));
}
export function qualityStats(rows) {
  const rated = rows.filter(x => x.score != null);
  const groups = new Map();
  for (const row of rows) {
    if (!groups.has(row.summary_id)) groups.set(row.summary_id, { summaryId: row.summary_id, expected: 0, received: 0, total: 0, counts: [0,0,0,0] });
    const g = groups.get(row.summary_id); g.expected++;
    if (row.score != null) { g.received++; g.total += Number(row.score); g.counts[Number(row.score)-1]++; }
  }
  const summaries = [...groups.values()].map(({total,...g}) => ({...g, average: g.received ? total/g.received : null}));
  const scored = summaries.filter(x => x.average != null);
  return { expected: rows.length, received: rated.length, average: scored.length ? scored.reduce((n,x)=>n+x.average,0)/scored.length : null, summaries };
}
