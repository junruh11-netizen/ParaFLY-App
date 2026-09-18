export const phases = ["lobby", "writing", "review", "voting", "results", "complete"];

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
  };
}

export function currentParagraph(room) {
  return room.current_round >= 0 ? room.paragraphs[room.current_round] : null;
}
