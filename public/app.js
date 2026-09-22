const app = document.querySelector("#app"),
  toastEl = document.querySelector("#toast");
const store = {
  get: (k) => {
    try {
      return JSON.parse(localStorage.getItem(k));
    } catch {
      return null;
    }
  },
  set: (k, v) => localStorage.setItem(k, JSON.stringify(v)),
};
const esc = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const byId = (id) => document.getElementById(id);
const api = async (path, options = {}) => {
  const r = await fetch(`/api${path}`, {
    ...options,
    headers: { "content-type": "application/json", ...(options.headers || {}) },
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok) throw Error(body.error || "Request failed");
  return body;
};
const toast = (m) => {
  toastEl.textContent = m;
  toastEl.classList.add("show");
  setTimeout(() => toastEl.classList.remove("show"), 1800);
};
const withBusy = async (button, work) => {
  if (!button) return work();
  if (button.disabled) return;
  button.disabled = true;
  try {
    await work();
  } finally {
    if (button.isConnected) button.disabled = false;
  }
};
const copyText = async (text) => {
  try {
    await navigator.clipboard.writeText(text);
    toast("Copied");
  } catch {
    toast("Copy failed — select and copy manually");
  }
};
const draftKey = (roomId, studentId, round) =>
  `parafly-draft-${roomId}-${studentId}-${round}`;
const editKey = (roomId, studentId, round) =>
  `parafly-edit-${roomId}-${studentId}-${round}`;
const joinUrl = (code) =>
  `${location.origin}/join?code=${encodeURIComponent(code)}`;
let pollTimer, clockTimer, teacherInteraction = false;
const route = () => location.pathname.split("/").filter(Boolean);
function setPage(html) {
  clearInterval(clockTimer);
  app.innerHTML = html;
}

const joinMarkup = (preset = "", home = false) =>
  `<section class="${home ? "join-hero" : "card join-card"}">${home ? '<div class="live-mark">Para<span>FLY</span> <small>Live</small></div><p>Read it. Say it your way.</p>' : '<span class="pill">STUDENT JOIN</span><h1>Join ParaFLY</h1>'}<div class="join-panel"><h2>Join a session</h2><p class="muted">Enter your class code and real name.</p><form id="joinForm"><div class="field"><label for="classCode">Class code</label><input id="classCode" name="code" required maxlength="8" autocomplete="off" value="${esc(preset)}" placeholder="ABCD" style="text-transform:uppercase"></div>${home ? "" : '<div class="field"><label for="nickname">Your real name</label><input id="nickname" name="nickname" required maxlength="30" autocomplete="off" placeholder="First and last name"></div>'}<p id="err"></p><button class="btn orange large" ${home ? 'id="lookupRoom"' : ""}>${home ? "Join session" : "Join"}</button></form>${home ? '<p class="teacher-entry">Teacher? <button class="link-button" id="create">Start a ParaFLY</button></p>' : ""}</div></section>`;
const wireJoin = (home) => {
  const formEl = byId("joinForm"),
    errEl = byId("err");
  formEl.onsubmit = async (e) => {
    e.preventDefault();
    const submitter = e.submitter;
    await withBusy(submitter, async () => {
      const d = new FormData(formEl);
      try {
        const room = await api(`/rooms/code/${d.get("code")}`);
        if (home) {
          go(`/join?code=${encodeURIComponent(d.get("code"))}`);
          return;
        }
        const s = await api(`/rooms/${room.id}/join`, {
          method: "POST",
          body: JSON.stringify({ nickname: d.get("nickname") }),
        });
        store.set("parafly-student", s);
        go(`/student/${room.id}`);
      } catch (x) {
        errEl.className = "error";
        errEl.textContent = x.message;
      }
    });
  };
};
async function home() {
  setPage(joinMarkup("", true));
  wireJoin(true);
  byId("create").onclick = () => go("/teacher/create");
}
function go(path) {
  history.pushState({}, "", path);
  render();
}
window.onpopstate = render;

async function create() {
  const config = await api("/config").catch(() => ({
    aiFactCheckAvailable: false,
  }));
  setPage(
    `<div class="setup-heading"><a class="back-link" href="/">← Home</a><h1>New session</h1><p class="muted">Paste a short passage. Add another only when your class is ready for another rep.</p></div><form id="form"><div class="card"><div class="field"><label for="activityTitle">Session title</label><input id="activityTitle" name="title" required maxlength="120" placeholder="e.g. The Declaration in Our Own Words"></div><div class="preset-row"><button type="button" class="preset active" data-preset="first">First Rep <small>1 passage</small></button><button type="button" class="preset" data-preset="standard">Standard ParaFLY <small>3 passages</small></button></div></div><div class="card"><div class="row heading-row"><div><h2>Passages</h2><p class="muted">Students see one passage at a time.</p></div><button type="button" class="btn secondary" id="addPassage">+ Add passage</button></div><div id="passages"></div></div><details class="card advanced"><summary>More options <span>Directions, timing, word limit${config.aiFactCheckAvailable ? ", AI" : ""}</span></summary><div class="field"><label for="directions">Directions for students</label><textarea id="directions" name="directions" maxlength="500" placeholder="Keep the meaning, but change the wording and sentence structure."></textarea></div><div class="grid two"><div class="field"><label for="seconds">Seconds per passage</label><input id="seconds" name="seconds" type="number" min="30" max="600" value="60"></div><div class="field"><label for="words">Maximum words</label><input id="words" name="words" type="number" min="5" max="500" placeholder="No limit"></div></div>${config.aiFactCheckAvailable ? '<label class="confirm"><input name="aiFactCheck" type="checkbox"> Use optional AI Fact Check for the final summary</label>' : ""}</details><div class="setup-summary"><b>Students will complete:</b> <span id="setupSummary">1 passage · class review and vote · final summary with 3+ facts</span></div><div class="row create-actions"><button type="button" class="btn secondary" id="previewStudent">Preview student view</button><button class="btn orange large">Create session</button></div><p id="err"></p></form><dialog id="previewDialog" class="app-dialog"><button class="dialog-close" id="closePreview" aria-label="Close">×</button><span class="pill">STUDENT PREVIEW</span><h2>Read & say it your way</h2><div class="preview-content" id="previewContent"></div><p class="muted">Preview only — nothing here is saved.</p></dialog>`,
  );
  const formEl = byId("form"),
    errEl = byId("err"),
    passagesEl = byId("passages"),
    summaryEl = byId("setupSummary");
  const secondsInput = byId("seconds");
  secondsInput.type = "hidden";
  secondsInput.previousElementSibling.textContent = "Writing timer";
  secondsInput.closest(".field").classList.add("setup-time-field");
  secondsInput.insertAdjacentHTML(
    "afterend",
    `<div class="setup-clock" id="setupClock">1:00</div><div class="setup-time-buttons"><button type="button" class="timer-preset" data-setup-seconds="30">30s</button><button type="button" class="timer-preset active" data-setup-seconds="60">1m</button><button type="button" class="timer-preset" data-setup-seconds="120">2m</button><button type="button" class="timer-preset" data-setup-seconds="180">3m</button><button type="button" class="timer-preset" data-setup-seconds="300">5m</button></div><p class="muted">Teacher and students see the same countdown.</p>`,
  );
  const setupTimer = document.createElement("section");
  setupTimer.className = "card setup-timer";
  setupTimer.innerHTML = '<div><span class="section-label">WRITING TIMER</span><h2>Set the pace</h2><p class="muted">Choose the countdown students will receive for every passage.</p></div>';
  const advancedOptions = secondsInput.closest("details");
  advancedOptions.before(setupTimer);
  setupTimer.append(secondsInput.closest(".field"));
  document.querySelectorAll("[data-setup-seconds]").forEach((button) => {
    button.onclick = () => {
      document.querySelectorAll("[data-setup-seconds]").forEach((x) => x.classList.remove("active"));
      button.classList.add("active");
      const seconds = Number(button.dataset.setupSeconds);
      secondsInput.value = seconds;
      byId("setupClock").textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
    };
  });
  let passageCount = 1;
  const renderPassages = (seed) => {
    const old =
      seed || [...passagesEl.querySelectorAll("textarea")].map((x) => x.value);
    passagesEl.innerHTML = Array.from(
      { length: passageCount },
      (_, i) =>
        `<div class="passage-entry"><div class="row heading-row"><label for="passage${i + 1}">Passage ${i + 1}</label>${i ? `<button type="button" class="text-button remove-passage" data-index="${i}">Remove</button>` : ""}</div><textarea id="passage${i + 1}" name="passage" ${i ? "" : "required"} maxlength="5000" placeholder="Paste passage ${i + 1} here...">${esc(old[i] || "")}</textarea></div>`,
    ).join("");
    byId("addPassage").disabled = passageCount >= 3;
    summaryEl.textContent = `${passageCount} passage${passageCount === 1 ? "" : "s"} · class review and vote after each · final summary with 3+ facts`;
    document.querySelectorAll(".remove-passage").forEach(
      (b) =>
        (b.onclick = () => {
          const values = [...passagesEl.querySelectorAll("textarea")].map(
            (x) => x.value,
          );
          values.splice(Number(b.dataset.index), 1);
          passageCount--;
          renderPassages(values);
        }),
    );
  };
  renderPassages();
  byId("addPassage").onclick = () => {
    if (passageCount < 3) {
      passageCount++;
      renderPassages();
    }
  };
  document.querySelectorAll("[data-preset]").forEach(
    (b) =>
      (b.onclick = () => {
        document
          .querySelectorAll("[data-preset]")
          .forEach((x) => x.classList.remove("active"));
        b.classList.add("active");
        passageCount = b.dataset.preset === "standard" ? 3 : 1;
        renderPassages();
      }),
  );
  const previewDialog = byId("previewDialog");
  byId("previewStudent").onclick = () => {
    const passage =
      formEl.querySelector('[name="passage"]')?.value.trim() ||
      "Your first passage will appear here.";
    byId("previewContent").innerHTML =
      `<div class="passage">${esc(passage)}</div>${criteriaGuide()}<textarea placeholder="Keep the meaning. Change the wording and sentence structure."></textarea><button class="btn orange" type="button">Submit response</button>`;
    previewDialog.showModal();
  };
  byId("closePreview").onclick = () => previewDialog.close();
  formEl.onsubmit = async (e) => {
    e.preventDefault();
    const submitter = e.submitter;
    await withBusy(submitter, async () => {
      const d = new FormData(formEl),
        paragraphs = [...formEl.querySelectorAll('[name="passage"]')].map(
          (x) => x.value,
        );
      try {
        const room = await api("/rooms", {
          method: "POST",
          body: JSON.stringify({
            title: d.get("title"),
            directions: d.get("directions"),
            paragraphs,
            secondsPerRound: Number(d.get("seconds")),
            wordLimit: d.get("words") ? Number(d.get("words")) : null,
            aiFactCheck: d.get("aiFactCheck") === "on",
          }),
        });
        store.set("parafly-teacher", {
          roomId: room.id,
          token: room.teacherToken,
        });
        go(`/teacher/${room.id}`);
      } catch (x) {
        errEl.className = "error";
        errEl.textContent = x.message;
      }
    });
  };
}

async function join(routeCode = "") {
  const preset =
    routeCode || new URLSearchParams(location.search).get("code") || "";
  setPage(joinMarkup(preset, false));
  wireJoin(false);
}

const roundBar = (r) =>
  `<div class="rounds">${Array.from({ length: r.paragraphCount }, (_, i) => `<span class="round ${["summary", "complete"].includes(r.phase) || i < r.currentRound ? "done" : i === r.currentRound ? "current" : ""}"></span>`).join("")}</div>`;
const gaugeMarkup = (average, count) => {
  const value = average === "—" ? null : Number(average),
    angle = value === null ? -90 : (Math.max(0, Math.min(10, value)) - 5) * 18;
  return `<div class="class-gauge" style="--needle:${angle}deg"><div class="gauge-value">${value === null ? "—" : value.toFixed(1)}<small>/10</small></div><svg viewBox="0 0 168 94" role="img" aria-label="Class average ${value === null ? "not scored" : `${value.toFixed(1)} out of 10`}"><path class="gauge-red" d="M18 82 A66 66 0 0 1 51 25"/><path class="gauge-orange" d="M51 25 A66 66 0 0 1 117 25"/><path class="gauge-green" d="M117 25 A66 66 0 0 1 150 82"/><g class="gauge-needle"><line x1="84" y1="82" x2="84" y2="34"/><circle cx="84" cy="82" r="5"/></g></svg><b>CLASS AVERAGE</b><span>${count} scored</span></div>`;
};
const criterionLabels = {
  meaning: "Same meaning",
  wording: "New wording",
  structure: "Changed structure",
  clarity: "Clear and concise",
};
const criteriaGuide = () =>
  `<aside class="criteria-guide" aria-label="ParaFLY Check"><b>ParaFLY Check</b><span>✓ Keep the same number of facts</span><span>✓ Keep names, dates, numbers, and important information accurate</span><span>✓ Keep the same meaning</span><span>✓ Use new wording</span><span>✓ Change the sentence structure</span><span>✓ Keep the same feeling and stay focused on the same information</span><span>✓ Don’t add opinions, bias, or new ideas</span><span>✓ Keep it clear and concise</span></aside>`;
const criterionSummary = (rows, responseId) =>
  rows
    .filter((x) => x.response_id === responseId)
    .map((x) => `${criterionLabels[x.criterion] || x.criterion}: ${x.votes}`)
    .join(" · ");
function countdown(endsAt, el, onEnd) {
  let ended = false;
  const tick = () => {
    const s = Math.max(0, Math.ceil((new Date(endsAt) - Date.now()) / 1000));
    el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
    if (s === 0 && !ended) {
      ended = true;
      onEnd?.();
    }
  };
  tick();
  return setInterval(tick, 500);
}

async function studentPage(id) {
  const session = store.get("parafly-student");
  if (!session || session.roomId !== id) return go("/join");
  let previousPhase;
  const load = async () => {
    try {
      const s = await api(`/rooms/${id}/student`, {
        headers: { "x-student-token": session.token },
      });
      if (s.room.phase !== previousPhase) {
        drawStudent(s);
        previousPhase = s.room.phase;
      } else updateStudent(s);
    } catch (e) {
      setPage(`<p class="error">${esc(e.message)}</p>`);
    }
  };
  const drawStudent = (s) => {
    const r = s.room,
      mine = s.mine.find((x) => x.round_index === r.currentRound),
      editing =
        localStorage.getItem(editKey(id, s.student.id, r.currentRound)) === "1";
    let body = "";
    if (r.phase === "lobby")
      body = `<div class="card"><h2>You're in, ${esc(s.student.nickname)}.</h2><p>Waiting for your teacher to launch the first paragraph.</p></div>`;
    if (r.phase === "writing")
      body = `<div class="student-task"><div class="task-banner"><span class="pill">PASSAGE ${r.currentRound + 1} OF ${r.paragraphCount}</span><span><b>Read</b> → Say it your way</span><div class="timer" id="clock">--:--</div></div><div class="grid two"><div class="card"><h2>1. Read</h2><div class="passage">${esc(s.paragraph)}</div></div><div class="card"><h2>2. Say it your way</h2>${r.directions ? `<p>${esc(r.directions)}</p>` : ""}${criteriaGuide()}${mine && !editing ? `<div class="submitted-state"><span class="saved-check">✓ Sent to your teacher</span><div class="response selected"><p>${esc(mine.response_text)}</p></div><button class="btn secondary" id="editResponse">Keep editing</button><p class="muted">You can revise until your teacher closes writing.</p></div>` : `<form id="responseForm"><textarea id="answer" required maxlength="5000" placeholder="Keep the meaning. Change the wording and sentence structure.">${esc(mine?.response_text || "")}</textarea><div class="row response-actions"><span id="words" class="muted">0 words${r.wordLimit ? ` / ${r.wordLimit} max` : ""}</span><button class="btn orange">${mine ? "Send again" : "Submit response"}</button></div><p class="draft-note muted" id="draftStatus">${mine ? "Your previous response stays submitted until you send this revision." : "Your draft saves on this device."}</p><p id="err"></p></form>`}</div></div></div>`;
    if (r.phase === "review")
      body = `<div class="card waiting-card"><span class="pill">CLASS REVIEW</span><h2>Your response is locked in</h2><div class="passage">${esc(s.paragraph)}</div>${criteriaGuide()}<div class="next-step"><b>Voting is next.</b><p>Your teacher is choosing 2–5 anonymous responses for the ballot. Stay on this screen—the vote will open automatically.</p></div></div>`;
    if (r.phase === "voting")
      body = `<div class="card vote-card"><span class="pill">STEP 4 · VOTE</span><h2>Which paraphrase works best?</h2><p>First choose one response. Then choose the main reason it works.</p>${s.exemplars.map((x, i) => `<label class="response vote-choice ${s.myVote === x.id ? "selected" : ""}"><input type="radio" name="voteChoice" value="${x.id}" ${s.myVote === x.id ? "checked" : ""}><span><b>Response ${String.fromCharCode(65 + i)}</b><p>${esc(x.response_text)}</p></span></label>`).join("")}<fieldset class="reason-picker"><legend>Why is it strong?</legend>${Object.entries(
        criterionLabels,
      )
        .map(
          ([value, label]) =>
            `<label><input type="radio" name="voteReason" value="${value}"><span>${label}</span></label>`,
        )
        .join(
          "",
        )}</fieldset><p id="voteError"></p><button class="btn orange large" id="submitVote">Submit vote</button></div>`;
    if (r.phase === "results") {
      const counts = new Map(s.results.map((x) => [x.response_id, x.votes])),
        teacherPick = r.feedbackMode === "teacher_pick",
        top = [...s.exemplars].sort(
          (a, b) => (counts.get(b.id) || 0) - (counts.get(a.id) || 0),
        )[0];
      body = `<div class="card"><span class="pill">CLASS REVIEW</span><h2>${teacherPick ? "Teacher’s Model Paraphrase" : "What did the class notice?"}</h2>${!teacherPick && top ? `<div class="compare-grid"><div><h3>Your paraphrase</h3><div class="response"><p>${esc(mine?.response_text || "No response submitted")}</p></div></div><div><h3>Class-voted response</h3><div class="response selected"><b>${counts.get(top.id) || 0} votes</b><p>${esc(top.response_text)}</p><small>${esc(criterionSummary(s.criteria, top.id))}</small></div></div></div>` : `${s.exemplars.map((x, i) => `<div class="response selected"><b>${teacherPick ? "Model response" : `Response ${String.fromCharCode(65 + i)} · ${counts.get(x.id) || 0} votes`}</b><p>${esc(x.response_text)}</p></div>`).join("")}`}${teacherPick ? `<div class="teacher-feedback"><b>Why it works</b><p>${esc(s.teacherFeedback)}</p></div>` : ""}<p class="next-note">${r.currentRound + 1 >= r.paragraphCount ? "Discuss what worked. Your teacher will open the final three-fact summary next." : "Discuss what worked. Your teacher will open the next passage when the class is ready."}</p></div>`;
    }
    if (r.phase === "summary")
      body = `<div class="card"><span class="pill">FINAL OWNERSHIP TASK</span><h2>Bring your thinking together</h2><p>Use your work from every round to write one clear summary containing at least three facts.</p>${r.aiFactCheck ? '<p class="ai-note"><b>AI Fact Check is on.</b> Your summary will be compared only with the source passages. If it finds fewer than three supported facts, you can revise and try again.</p>' : ""}${s.mine.map((x, i) => `<div class="response"><b>Your Round ${i + 1} paraphrase</b><p>${esc(x.response_text)}</p></div>`).join("")}${s.summary ? `<div class="response selected"><b>Final summary locked in</b>${s.summary.ai_status === "passed" ? `<span class="ai-badge">AI found ${s.summary.ai_fact_count} supported facts</span>` : ""}<p>${esc(s.summary.summary_text)}</p></div><p>Waiting for your teacher to finish the activity.</p>` : `<form id="summaryForm"><textarea id="summaryAnswer" required minlength="20" maxlength="5000" placeholder="Write your final summary with at least three facts..."></textarea><label class="confirm"><input id="threeFacts" type="checkbox" required> My summary includes at least three accurate facts from the passages.</label><div id="aiResult"></div><p id="err"></p><button class="btn orange">${r.aiFactCheck ? "Check and submit summary" : "Submit final summary"}</button></form>`}</div>`;
    if (r.phase === "complete")
      body = `<div class="card"><h2>Flight complete</h2><p>Here are your paraphrases and final summary.</p>${s.mine.map((x, i) => `<div class="response"><b>Round ${i + 1}</b><p>${esc(x.response_text)}</p></div>`).join("")}${s.summary ? `<div class="response selected"><b>Final Summary</b><p>${esc(s.summary.summary_text)}</p></div>` : ""}<button class="btn secondary" id="copyMine">Copy my work</button></div>`;
    setPage(`<h1>${esc(r.title)}</h1>${roundBar(r)}${body}`);
    wireStudent(s);
  };
  const updateStudent = (s) => {
    const clockEl = byId("clock");
    if (s.room.phase === "writing" && s.room.endsAt && clockEl) {
      clearInterval(clockTimer);
      clockTimer = countdown(s.room.endsAt, clockEl);
    }
  };
  const wireStudent = (s) => {
    const r = s.room,
      answerEl = byId("answer"),
      responseFormEl = byId("responseForm"),
      wordsEl = byId("words"),
      errEl = byId("err"),
      clockEl = byId("clock"),
      copyMineEl = byId("copyMine"),
      summaryFormEl = byId("summaryForm"),
      editResponseEl = byId("editResponse"),
      key = draftKey(id, s.student.id, r.currentRound),
      editingKey = editKey(id, s.student.id, r.currentRound);
    if (editResponseEl)
      editResponseEl.onclick = () => {
        localStorage.setItem(editingKey, "1");
        previousPhase = null;
        load();
      };
    if (answerEl) {
      if (!answerEl.value) answerEl.value = localStorage.getItem(key) || "";
      const updateWords = () => {
        const n = answerEl.value.trim()
          ? answerEl.value.trim().split(/\s+/).length
          : 0;
        wordsEl.textContent = `${n} words${r.wordLimit ? ` / ${r.wordLimit} max` : ""}`;
      };
      updateWords();
      answerEl.oninput = () => {
        updateWords();
        localStorage.setItem(key, answerEl.value);
        const d = byId("draftStatus");
        if (d) d.textContent = "Draft saved on this device.";
      };
      responseFormEl.onsubmit = async (e) => {
        e.preventDefault();
        await withBusy(e.submitter, async () => {
          try {
            await api(`/rooms/${id}/responses`, {
              method: "POST",
              headers: { "x-student-token": session.token },
              body: JSON.stringify({ response: answerEl.value }),
            });
            localStorage.removeItem(key);
            localStorage.removeItem(editingKey);
            previousPhase = null;
            await load();
          } catch (x) {
            errEl.className = "error";
            errEl.textContent = x.message;
          }
        });
      };
    }
    if (summaryFormEl)
      summaryFormEl.onsubmit = async (e) => {
        e.preventDefault();
        await withBusy(e.submitter, async () => {
          try {
            const result = await api(`/rooms/${id}/summary`, {
              method: "POST",
              headers: { "x-student-token": session.token },
              body: JSON.stringify({
                summary: byId("summaryAnswer").value,
                includesThreeFacts: byId("threeFacts").checked,
              }),
            });
            if (result.needsRevision) {
              const c = result.check,
                aiResultEl = byId("aiResult");
              aiResultEl.className = "ai-revision";
              aiResultEl.innerHTML = `<b>${c.supportedFactCount} supported fact${c.supportedFactCount === 1 ? "" : "s"} found — revise and try again.</b><p>${esc(c.revisionAdvice)}</p>${c.supportedFacts?.length ? `<small>Supported: ${esc(c.supportedFacts.join(" · "))}</small><br>` : ""}${c.unsupportedClaims?.length ? `<small>Not supported by the passages: ${esc(c.unsupportedClaims.join(" · "))}</small>` : ""}`;
              return;
            }
            previousPhase = null;
            await load();
          } catch (x) {
            errEl.className = "error";
            errEl.textContent = x.message;
          }
        });
      };
    if (r.phase === "writing" && r.endsAt && clockEl) {
      clockTimer = countdown(r.endsAt, clockEl);
    }
    const submitVoteEl = byId("submitVote");
    if (submitVoteEl)
      submitVoteEl.onclick = () =>
        withBusy(submitVoteEl, async () => {
          const responseId = Number(
              document.querySelector('[name="voteChoice"]:checked')?.value,
            ),
            criterion = document.querySelector(
              '[name="voteReason"]:checked',
            )?.value,
            errorEl = byId("voteError");
          if (!responseId || !criterion) {
            errorEl.className = "error";
            errorEl.textContent =
              "Choose one response and one reason before submitting.";
            return;
          }
          try {
            await api(`/rooms/${id}/vote`, {
              method: "POST",
              headers: { "x-student-token": session.token },
              body: JSON.stringify({ responseId, criterion }),
            });
            previousPhase = null;
            await load();
          } catch (x) {
            errorEl.className = "error";
            errorEl.textContent = x.message;
          }
        });
    if (copyMineEl)
      copyMineEl.onclick = () =>
        copyText(
          [
            ...s.mine.map((x, i) => `Passage ${i + 1}: ${x.response_text}`),
            s.summary ? `Final Summary: ${s.summary.summary_text}` : "",
          ]
            .filter(Boolean)
            .join("\n\n"),
        );
  };
  await load();
  pollTimer = setInterval(load, 2000);
}

async function teacherPage(id) {
  let session = store.get("parafly-teacher");
  const recoveryToken = new URLSearchParams(location.search).get(
    "teacherToken",
  );
  if ((!session || session.roomId !== id) && recoveryToken) {
    session = { roomId: id, token: recoveryToken };
    store.set("parafly-teacher", session);
    history.replaceState({}, "", `/teacher/${id}`);
  }
  if (!session || session.roomId !== id) {
    setPage(
      `<div class="card join-card"><h1>Teacher dashboard unavailable</h1><p>This device does not have the teacher key for this activity. Open the recovery link saved when the room was created.</p><a class="btn secondary" href="/">Return home</a></div>`,
    );
    return;
  }
  let current;
  const load = async () => {
    try {
      current = await api(`/rooms/${id}/teacher`, {
        headers: { "x-teacher-token": session.token },
      });
      draw();
    } catch (e) {
      setPage(`<p class="error">${esc(e.message)}</p>`);
    }
  };
  const control = async (action, extra = {}) => {
    try {
      await api(`/rooms/${id}/control`, {
        method: "PATCH",
        headers: { "x-teacher-token": session.token },
        body: JSON.stringify({ action, ...extra }),
      });
      await load();
    } catch (e) {
      toast(e.message);
    }
  };
  const draw = () => {
    const {
      room: r,
      students,
      responses,
      summaries = [],
      votes,
      voteCriteria = [],
    } = current;
    const roundResponses = responses.filter(
      (x) => x.round_index === r.currentRound,
    );
    const roundSubmitted = new Set(roundResponses.map((x) => x.student_id)),
      summarySubmitted = new Set(summaries.map((x) => x.student_id)),
      submitted =
        r.phase === "summary" || r.phase === "complete"
          ? summarySubmitted
          : roundSubmitted,
      teacherPick = r.feedbackMode === "teacher_pick";
    let controls =
      r.phase === "lobby"
        ? `<button class="btn orange" data-action="start">Begin passage 1</button>`
        : "";
    if (r.phase === "writing")
      controls = `<button class="btn secondary" data-action="addTime">+30 seconds</button><button class="btn orange" data-action="end">End round</button>`;
    if (r.phase === "review")
      controls = `<button class="btn secondary" data-action="reopen">Reopen writing</button><button class="btn secondary" data-action="skip">${r.currentRound + 1 >= r.paragraphCount ? "Skip feedback & open final summary" : "Skip feedback & next passage"}</button>${teacherPick ? `<button class="btn green" id="revealModel">Reveal model response</button>` : ""}`;
    if (r.phase === "voting")
      controls = `<button class="btn orange" data-action="results">Reveal results</button>`;
    if (r.phase === "results")
      controls = `<button class="btn orange" data-action="next">${r.currentRound + 1 >= r.paragraphCount ? "Open final summary" : "Launch next passage"}</button>`;
    if (r.phase === "summary")
      controls = `<button class="btn orange" data-action="finish">Finish ParaFLY</button>`;
    const responseList =
      r.phase === "review"
        ? `<div class="card ballot-builder"><div class="row heading-row"><div><span class="pill">NEXT · OPEN STUDENT VOTING</span><h2>${teacherPick ? "Choose one model response" : "Build the class ballot"}</h2><p class="muted">${teacherPick ? "Choose the response you want to discuss." : "Choose 2–5 anonymous responses below, then open the vote for every student."}</p></div>${!teacherPick && roundResponses.length >= 2 ? '<button class="btn green" id="randomPick">Choose 3 randomly & open vote</button>' : ""}</div>${criteriaGuide()}${roundResponses.length ? roundResponses.map((x, i) => `<div class="response ${r.selectedIds.includes(x.id) ? "selected" : ""}"><label><input type="${teacherPick ? "radio" : "checkbox"}" name="pick" value="${x.id}"><span><b>Response ${i + 1}</b><br>${esc(x.response_text)}</span></label></div>`).join("") : "<p>No responses were submitted. Reopen writing so students can respond.</p>"}${teacherPick ? `<div class="field"><label>Why does this paraphrase work?</label><textarea id="teacherFeedback" maxlength="1000" placeholder="Point out how it preserves meaning, changes wording or structure, and communicates clearly."></textarea></div>` : roundResponses.length >= 2 ? '<div class="ballot-action"><span id="selectionCount">0 selected · choose at least 2</span><button class="btn orange large" id="openVote" disabled>Open student voting</button></div>' : ""}</div>`
        : "";
    const voteMap = new Map(votes.map((x) => [x.response_id, x.votes]));
    const results =
      r.phase === "results"
        ? `<div class="card"><h2>${teacherPick ? "Teacher’s Model Paraphrase" : "Voting results"}</h2>${roundResponses
            .filter((x) => r.selectedIds.includes(x.id))
            .map(
              (x) =>
                `<div class="response selected"><b>${teacherPick ? "Model response" : `${voteMap.get(x.id) || 0} votes`}</b><p>${esc(x.response_text)}</p>${!teacherPick && criterionSummary(voteCriteria, x.id) ? `<small>${esc(criterionSummary(voteCriteria, x.id))}</small>` : ""}</div>`,
            )
            .join(
              "",
            )}${teacherPick ? `<div class="teacher-feedback"><b>Why it works</b><p>${esc(r.teacherFeedback)}</p></div>` : ""}</div>`
        : "";
    const summaryList = ["summary", "complete"].includes(r.phase)
      ? `<div class="card"><h2>Final summaries</h2>${summaries.length ? summaries.map((x) => `<div class="response selected"><b>${esc(x.nickname)}</b>${x.ai_status === "passed" ? `<span class="ai-badge">AI: ${x.ai_fact_count} supported facts</span>` : x.ai_status === "unavailable" ? '<span class="ai-badge warning">AI check unavailable—summary saved</span>' : ""}<p>${esc(x.summary_text)}</p></div>`).join("") : "<p>No final summaries have been submitted yet.</p>"}</div>`
      : "";
    const inSummary = ["summary", "complete"].includes(r.phase),
      submittedCount = inSummary ? summaries.length : roundResponses.length,
      missingLabel =
        r.phase === "lobby"
          ? "Waiting to start"
          : r.phase === "writing"
            ? "Still writing"
            : r.phase === "summary"
              ? "Still summarizing"
              : "Did not submit";
    const phaseTitle =
      r.phase === "lobby"
        ? "Invite students, then begin"
        : r.phase === "writing"
          ? `Passage ${r.currentRound + 1}: Students say it their way`
          : r.phase === "review"
            ? `Passage ${r.currentRound + 1}: Review class responses`
            : r.phase === "voting"
              ? `Passage ${r.currentRound + 1}: Students vote`
              : r.phase === "results"
                ? `Passage ${r.currentRound + 1}: Discuss results`
                : r.phase === "summary"
                  ? "Own It: Final three-fact summary"
                  : r.phase === "complete"
                    ? "ParaFLY complete"
                    : "";
    const invite =
      r.phase === "lobby"
        ? `<div class="card invite-card"><div><span class="pill">1 · INVITE STUDENTS</span><h2>Join code: <span class="code-inline">${esc(r.joinCode)}</span></h2><p class="muted">Share the code or copy a direct join link.</p></div><div class="row"><button class="btn secondary" id="copyCode">Copy code</button><button class="btn secondary" id="copyJoin">Copy join link</button><button class="btn secondary" id="projectClass">Project code</button><button class="btn secondary" id="modelClass">Model for class</button></div></div>`
        : `<button class="btn secondary compact" id="copyCode">Copy class code ${esc(r.joinCode)}</button>`;
    const statusRows =
      students
        .map(
          (s) =>
            `<span class="student-chip ${submitted.has(s.id) ? "done" : ""}" data-status="${submitted.has(s.id) ? "submitted" : "not-submitted"}">${esc(s.nickname)} ${submitted.has(s.id) ? "✓" : ""}</span>`,
        )
        .join("") || "No students have joined yet.";
    setPage(
      `<div class="row dashboard-heading"><div><span class="pill">TEACHER DASHBOARD</span>${r.aiFactCheck ? '<span class="pill ai-on">AI FACT CHECK ON</span>' : ""}<h1>${esc(r.title)}</h1></div>${r.phase !== "lobby" ? invite : ""}</div>${r.phase === "lobby" ? invite : ""}${roundBar(r)}<div class="grid three"><div class="card metric"><b>${students.length}</b><span>Connected</span></div><div class="card metric"><b>${submittedCount}</b><span>${inSummary ? "Final summaries" : "Submitted this passage"}</span></div><div class="card metric"><b>${Math.max(0, students.length - submittedCount)}</b><span>${missingLabel}</span></div></div><div class="card"><span class="pill">${r.phase === "lobby" ? "2 · CHECK YOUR CLASS" : "CURRENT STEP"}</span><h2>${phaseTitle}</h2>${r.phase === "writing" ? `<div class="timer" id="teacherClock">--:--</div>` : ""}${r.currentRound >= 0 && !inSummary ? `<div class="passage">${esc(r.paragraphs[r.currentRound])}</div>` : ""}${r.phase === "summary" ? "<p>Students are combining their work into one independent summary containing at least three facts.</p>" : ""}<div class="row" style="margin-top:18px">${controls}</div><details class="teacher-tools"><summary>Teacher tools</summary><div class="row"><a class="btn secondary" href="/api/rooms/${id}/export" id="export">Download CSV</a><button class="btn secondary" id="copyRecovery">Copy recovery link</button>${r.phase !== "lobby" ? '<button class="btn secondary" id="projectClass">Project view</button><button class="btn secondary" id="modelClass">Model for class</button>' : ""}</div></details></div><div class="card"><div class="row heading-row"><h2>Student status</h2><div class="status-filters"><button class="filter active" data-filter="all">All</button><button class="filter" data-filter="submitted">Submitted</button><button class="filter" data-filter="not-submitted">Not submitted</button></div></div><div class="status-list" id="statusList">${statusRows}</div></div>${responseList}${results}${summaryList}<dialog id="projectDialog" class="app-dialog projector-dialog"><button class="dialog-close" data-close-dialog="projectDialog" aria-label="Close">×</button><div class="projector-content"><span class="pill">JOIN THIS SESSION</span><div class="project-code">${esc(r.joinCode)}</div><p>${esc(joinUrl(r.joinCode))}</p><h2>${esc(phaseTitle)}</h2></div></dialog><dialog id="modelDialog" class="app-dialog"><button class="dialog-close" data-close-dialog="modelDialog" aria-label="Close">×</button><span class="pill">MODEL FOR CLASS · PRACTICE ONLY</span><h2 id="modelTitle">Read & say it your way</h2><p class="muted">Choose a stage to demonstrate. Nothing is submitted or saved.</p><div class="model-tabs"><button class="filter active" data-model="write">Read & write</button><button class="filter" data-model="review">Review</button><button class="filter" data-model="vote">Vote</button><button class="filter" data-model="summary">Final summary</button></div><div id="modelContent"></div></dialog>`,
    );
    document.querySelectorAll("[data-action]").forEach(
      (b) =>
        (b.onclick = () => {
          const action = b.dataset.action,
            warning =
              action === "end" && students.length > roundSubmitted.size
                ? `${students.length - roundSubmitted.size} student(s) have not submitted. End writing anyway?`
                : action === "results" &&
                    students.length > votes.reduce((n, x) => n + x.votes, 0)
                  ? "Some students have not voted. Reveal results anyway?"
                  : action === "finish" && students.length > summaries.length
                    ? `${students.length - summaries.length} student(s) have not submitted the final summary. Finish anyway?`
                    : "";
          if (!warning || confirm(warning)) withBusy(b, () => control(action));
        }),
    );
    const openVoteEl = byId("openVote"),
      revealModelEl = byId("revealModel"),
      copyCodeEl = byId("copyCode"),
      copyJoinEl = byId("copyJoin"),
      copyRecoveryEl = byId("copyRecovery"),
      randomPickEl = byId("randomPick"),
      teacherClockEl = byId("teacherClock");
    if (randomPickEl)
      randomPickEl.onclick = () => {
        const boxes = [...document.querySelectorAll('[name="pick"]')];
        boxes.forEach((x) => (x.checked = false));
        boxes
          .sort(() => Math.random() - 0.5)
          .slice(0, Math.min(3, boxes.length))
          .forEach((x) => (x.checked = true));
      };
    if (openVoteEl)
      openVoteEl.onclick = () =>
        withBusy(openVoteEl, () =>
          control("vote", {
            selectedIds: [
              ...document.querySelectorAll("[name=pick]:checked"),
            ].map((x) => Number(x.value)),
          }),
        );
    if (revealModelEl)
      revealModelEl.onclick = () =>
        withBusy(revealModelEl, () =>
          control("teacherResult", {
            responseId: Number(
              document.querySelector('[name="pick"]:checked')?.value,
            ),
            feedback: byId("teacherFeedback")?.value,
          }),
        );
    if (copyCodeEl) copyCodeEl.onclick = () => copyText(r.joinCode);
    if (copyJoinEl) copyJoinEl.onclick = () => copyText(joinUrl(r.joinCode));
    if (copyRecoveryEl)
      copyRecoveryEl.onclick = () =>
        copyText(
          `${location.origin}/teacher/${id}?teacherToken=${encodeURIComponent(session.token)}`,
        );
    if (teacherClockEl && r.endsAt)
      clockTimer = countdown(r.endsAt, teacherClockEl);
    document.querySelectorAll("[data-filter]").forEach(
      (b) =>
        (b.onclick = () => {
          document
            .querySelectorAll("[data-filter]")
            .forEach((x) => x.classList.remove("active"));
          b.classList.add("active");
          document
            .querySelectorAll("#statusList [data-status]")
            .forEach(
              (x) =>
                (x.hidden =
                  b.dataset.filter !== "all" &&
                  x.dataset.status !== b.dataset.filter),
            );
        }),
    );
    const projectDialog = byId("projectDialog"),
      modelDialog = byId("modelDialog");
    document
      .querySelectorAll("#projectClass")
      .forEach((b) => (b.onclick = () => projectDialog.showModal()));
    document.querySelectorAll("#modelClass").forEach(
      (b) =>
        (b.onclick = () => {
          modelDialog.showModal();
          renderModel("write");
        }),
    );
    document
      .querySelectorAll("[data-close-dialog]")
      .forEach((b) => (b.onclick = () => byId(b.dataset.closeDialog).close()));
    const renderModel = (stage) => {
      const passage = esc(
        r.paragraphs[Math.max(0, r.currentRound)] ||
          r.paragraphs[0] ||
          "Your passage appears here.",
      );
      const samples = roundResponses.slice(0, 2);
      byId("modelContent").innerHTML =
        stage === "write"
          ? `<div class="passage">${passage}</div>${criteriaGuide()}<textarea placeholder="Model a paraphrase here..."></textarea>`
          : stage === "review"
            ? `${criteriaGuide()}${samples.length ? samples.map((x) => `<div class="response"><p>${esc(x.response_text)}</p></div>`).join("") : '<div class="response"><p>A student response will appear here for discussion.</p></div>'}`
            : stage === "vote"
              ? `<p>Which response preserves the meaning while changing the wording and structure?</p>${samples.length ? samples.map((x, i) => `<div class="response"><b>Response ${String.fromCharCode(65 + i)}</b><p>${esc(x.response_text)}</p></div>`).join("") : '<div class="response"><p>Anonymous choices will appear here.</p></div>'}`
              : `<p>Combine learning from every passage into one clear summary with at least three accurate facts.</p><textarea placeholder="Model a final summary here..."></textarea>`;
    };
    document.querySelectorAll("[data-model]").forEach(
      (b) =>
        (b.onclick = () => {
          document
            .querySelectorAll("[data-model]")
            .forEach((x) => x.classList.remove("active"));
          b.classList.add("active");
          renderModel(b.dataset.model);
        }),
    );
    const exportLink = document.querySelector("#export");
    if (exportLink)
      exportLink.onclick = (e) => {
        e.preventDefault();
        fetch(e.currentTarget.href, {
          headers: { "x-teacher-token": session.token },
        })
          .then((r) => {
            if (!r.ok) throw Error("Download failed");
            return r.blob();
          })
          .then((b) => {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(b);
            a.download = "parafly-responses.csv";
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 1000);
          })
          .catch((x) => toast(x.message));
      };
    if (!teacherPick && r.phase === "review") {
      if (roundResponses.length < 2) {
        const warning = document.createElement("div");
        warning.className = "vote-requirement";
        warning.innerHTML = `<b>Voting needs at least 2 responses.</b><p>You currently have ${roundResponses.length}. Reopen writing or wait for another student response before building the ballot.</p>`;
        document.querySelector(".ballot-builder")?.append(warning);
      }
      const voteButton = byId("openVote"),
        randomButton = byId("randomPick"),
        selectionCount = byId("selectionCount"),
        boxes = [...document.querySelectorAll('[name="pick"]')];
      const selectedIds = () =>
        boxes.filter((x) => x.checked).map((x) => Number(x.value));
      const updateBallot = () => {
        const count = selectedIds().length;
        if (selectionCount)
          selectionCount.textContent = `${count} selected · ${count < 2 ? "choose at least 2" : count > 5 ? "maximum 5" : "ready to open"}`;
        if (voteButton) voteButton.disabled = count < 2 || count > 5;
      };
      boxes.forEach((x) => (x.onchange = updateBallot));
      updateBallot();
      if (voteButton)
        voteButton.onclick = () =>
          withBusy(voteButton, () =>
            control("vote", { selectedIds: selectedIds() }),
          );
      if (randomButton)
        randomButton.onclick = () =>
          withBusy(randomButton, () => {
            const ids = roundResponses
              .map((x) => x.id)
              .sort(() => Math.random() - 0.5)
              .slice(0, Math.min(3, roundResponses.length));
            return control("vote", { selectedIds: ids });
          });
    }
  };
  await load();
  pollTimer = setInterval(async () => {
    if (
      current?.room.phase !== "review" &&
      !document.querySelector("dialog[open]")
    )
      await load();
  }, 2500);
}

async function studentPageV2(id) {
  const session = store.get("parafly-student");
  if (!session || session.roomId !== id) return go("/join");
  let renderKey = "";
  const load = async () => {
    try {
      const s = await api(`/rooms/${id}/student`, {
          headers: { "x-student-token": session.token },
        }),
        r = s.room,
        mine = s.mine.find((x) => x.round_index === r.currentRound),
        nextKey = [
          r.phase,
          r.currentRound,
          Boolean(mine),
          Boolean(s.summary),
          s.myVotes.length,
          s.results.reduce((n, x) => n + x.votes, 0),
          (r.shareStudentIds || []).join("-"),
        ].join("|");
      if (nextKey === renderKey) return;
      renderKey = nextKey;
      let body = "";
      if (r.phase === "lobby")
        body = `<div class="card"><h2>You’re in, ${esc(s.student.nickname)}.</h2><p>Waiting for your teacher to begin.</p>${criteriaGuide()}</div>`;
      if (r.phase === "writing")
        body = `<div class="task-banner"><span class="pill">PASSAGE ${r.currentRound + 1} OF ${r.paragraphCount}</span><b>Read → Say it your way</b><div class="timer" id="clock">--:--</div></div><div class="grid two student-work"><div class="card source-card"><span class="section-label">SOURCE PASSAGE</span><h2>Read</h2><div class="passage">${esc(s.paragraph)}</div></div><div class="card writing-card"><span class="section-label">YOUR RESPONSE</span><h2>ParaFLY</h2>${criteriaGuide()}${mine ? `<span class="saved-check">✓ Sent to your teacher</span><div class="response selected"><p>${esc(mine.response_text)}</p></div>` : `<form id="responseForm"><textarea id="answer" required maxlength="5000" placeholder="Write your ParaFLY here..."></textarea><p id="words" class="muted"></p><p id="err"></p><button class="btn orange wide-action">Send my ParaFLY</button></form>`}</div></div>`;
      if (r.phase === "review")
        body = `<div class="card"><span class="pill">TEACHER REVIEW</span><h2>Your response is locked in</h2><div class="passage">${esc(s.paragraph)}</div>${criteriaGuide()}<div class="next-step"><b>Battle Royale is next.</b><p>Your teacher is scoring the class and building the anonymous 2+2+2 set.</p></div></div>`;
      if (r.phase === "voting") {
        const battle = Math.min(3, s.myVotes.length),
          pair = s.exemplars.slice(battle * 2, battle * 2 + 2);
        body =
          battle >= 3
            ? `<div class="card"><span class="pill">VOTES COMPLETE</span><h2>All three choices are in</h2>${criteriaGuide()}<p>Waiting for your teacher to reveal the class winner.</p></div>`
            : `<div class="card"><span class="pill">BATTLE ${battle + 1} OF 3</span><h2>Which ParaFLY is stronger?</h2>${criteriaGuide()}<div class="battle-grid">${pair.map((x, i) => `<button class="battle-card" data-vote="${x.id}" data-battle="${battle}"><b>Response ${String.fromCharCode(65 + battle * 2 + i)}</b><p>${esc(x.response_text)}</p><span>Choose this one</span></button>`).join("")}</div><p id="voteError"></p></div>`;
      }
      if (r.phase === "results" || r.phase === "sharing") {
        const counts = new Map(s.results.map((x) => [x.response_id, x.votes])),
          top = s.exemplars.find((x) => x.id === r.winnerResponseId),
          sharers = (r.shareStudentIds || []).includes(s.student.id);
        body = `<div class="card winner-card"><span class="pill">CLASS WINNER</span><h2>Does this ParaFLY meet the criteria?</h2><div class="passage">${esc(s.paragraph)}</div>${top ? `<div class="response selected"><b>${counts.get(top.id) || 0} votes</b><p>${esc(top.response_text)}</p></div>` : ""}${criteriaGuide()}${r.phase === "results" ? `<div class="tps"><b>Think · Pair · Share</b><div class="timer" id="clock">0:45</div><p>Explain how the winner does—or does not—meet the ParaFLY Check.</p></div>` : `<div class="share-callout"><h2>${sharers ? "You were selected to share!" : "Listen to the selected speakers."}</h2></div>`}</div>`;
      }
      if (r.phase === "summary")
        body = `<div class="card"><span class="pill">FINAL OWNERSHIP TASK</span><h2>Bring your thinking together</h2>${criteriaGuide()}${s.summary ? `<div class="response selected"><b>Final summary sent</b><p>${esc(s.summary.summary_text)}</p></div>` : `<form id="summaryForm"><textarea id="summaryAnswer" required minlength="20" maxlength="5000" placeholder="Write a summary with at least three facts..."></textarea><label class="confirm"><input id="threeFacts" type="checkbox" required> My summary includes at least three accurate facts.</label><p id="err"></p><button class="btn orange">Submit final summary</button></form>`}</div>`;
      if (r.phase === "complete")
        body = `<div class="card"><h2>Flight complete</h2>${criteriaGuide()}${s.mine.map((x, i) => `<div class="response"><b>Passage ${i + 1}</b><p>${esc(x.response_text)}</p></div>`).join("")}</div>`;
      setPage(`<h1>${esc(r.title)}</h1>${roundBar(r)}${body}`);
      if (r.endsAt && byId("clock")) {
        clearInterval(clockTimer);
        clockTimer = countdown(r.endsAt, byId("clock"));
      }
      const form = byId("responseForm");
      if (form)
        form.onsubmit = async (e) => {
          e.preventDefault();
          try {
            await api(`/rooms/${id}/responses`, {
              method: "POST",
              headers: { "x-student-token": session.token },
              body: JSON.stringify({ response: byId("answer").value }),
            });
            renderKey = "";
            load();
          } catch (x) {
            byId("err").className = "error";
            byId("err").textContent = x.message;
          }
        };
      document.querySelectorAll("[data-vote]").forEach(
        (b) =>
          (b.onclick = () =>
            withBusy(b, async () => {
              try {
                await api(`/rooms/${id}/vote`, {
                  method: "POST",
                  headers: { "x-student-token": session.token },
                  body: JSON.stringify({
                    responseId: Number(b.dataset.vote),
                    battleIndex: Number(b.dataset.battle),
                  }),
                });
                renderKey = "";
                load();
              } catch (x) {
                byId("voteError").className = "error";
                byId("voteError").textContent = x.message;
              }
            })),
      );
      const sf = byId("summaryForm");
      if (sf)
        sf.onsubmit = async (e) => {
          e.preventDefault();
          try {
            await api(`/rooms/${id}/summary`, {
              method: "POST",
              headers: { "x-student-token": session.token },
              body: JSON.stringify({
                summary: byId("summaryAnswer").value,
                includesThreeFacts: byId("threeFacts").checked,
              }),
            });
            renderKey = "";
            load();
          } catch (x) {
            byId("err").className = "error";
            byId("err").textContent = x.message;
          }
        };
    } catch (e) {
      setPage(`<p class="error">${esc(e.message)}</p>`);
    }
  };
  await load();
  pollTimer = setInterval(load, 2000);
}

async function teacherPageV2(id) {
  let session = store.get("parafly-teacher"),
    recovery = new URLSearchParams(location.search).get("teacherToken");
  if ((!session || session.roomId !== id) && recovery) {
    session = { roomId: id, token: recovery };
    store.set("parafly-teacher", session);
    history.replaceState({}, "", `/teacher/${id}`);
  }
  if (!session || session.roomId !== id) return teacherPage(id);
  const headers = { "x-teacher-token": session.token };
  const control = async (action) => {
    try {
      await api(`/rooms/${id}/control`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({ action }),
      });
      await load();
    } catch (e) {
      toast(e.message);
    }
  };
  const load = async () => {
    try {
      const d = await api(`/rooms/${id}/teacher`, { headers }),
        r = d.room,
        roundResponses = d.responses.filter(
          (x) => x.round_index === r.currentRound,
        ),
        scoreMap = new Map(
          d.scores.map((x) => [x.response_id, Number(x.score)]),
        ),
        scored = roundResponses.filter((x) => scoreMap.has(x.id)),
        average = scored.length
          ? (
              scored.reduce((n, x) => n + scoreMap.get(x.id), 0) / scored.length
            ).toFixed(1)
          : "—",
        voteMap = new Map(d.votes.map((x) => [x.response_id, x.votes])),
        winner = roundResponses.find((x) => x.id === r.modelResponseId),
        submittedIds = new Set(roundResponses.map((x) => x.student_id)),
        summaryIds = new Set(d.summaries.map((x) => x.student_id)),
        isSummary = ["summary", "complete"].includes(r.phase),
        submittedCount = isSummary ? d.summaries.length : roundResponses.length;
      let controls =
        r.phase === "lobby"
          ? `<button class="btn orange" data-action="start">Begin passage 1</button>`
          : r.phase === "writing"
            ? `<button class="btn secondary" data-action="addTime">+30 seconds</button><button class="btn orange" data-action="end">End writing</button>`
            : r.phase === "review"
              ? `<button class="btn secondary" data-action="reopen">Reopen writing</button>`
              : r.phase === "voting"
                ? `<button class="btn orange" data-action="results">Reveal winner & start TPS</button>`
                : r.phase === "results"
                  ? `<button class="btn orange" data-action="share">Select 2 students to share</button>`
                  : r.phase === "sharing"
                    ? `<button class="btn orange" data-action="next">${r.currentRound + 1 >= r.paragraphCount ? "Open final summary" : "Launch next passage"}</button>`
                    : r.phase === "summary"
                      ? `<button class="btn orange" data-action="finish">Finish ParaFLY</button>`
                      : "";
      const ballotStatus =
        roundResponses.length < 6
          ? `The 2+2+2 set needs 6 responses. ${roundResponses.length} available.`
          : scored.length < 6
            ? `Score ${6 - scored.length} more response${6 - scored.length === 1 ? "" : "s"} to build the set.`
            : "Ready: 2 lower + 2 middle + 2 higher.";
      const scorePanel = ["writing", "review"].includes(r.phase)
        ? `<div class="card response-board"><div class="row heading-row"><div><span class="section-label">LIVE RESPONSES</span><h2>Score responses as they arrive</h2><p class="muted">Use the ParaFLY Check—not generic writing quality.</p></div></div>${criteriaGuide()}${roundResponses.length ? `<div class="response-score-grid">${roundResponses.map((x, i) => `<article class="score-row"><div class="student-card-head"><span class="student-number">${i + 1}</span><b>${esc(x.nickname)}</b><span class="score-badge">${scoreMap.get(x.id) || "—"}/10</span></div><p>${esc(x.response_text)}</p><label><span>SCORE <output>${scoreMap.get(x.id) || "—"}</output></span><input type="range" min="1" max="10" value="${scoreMap.get(x.id) || 5}" data-score="${x.id}"></label></article>`).join("")}</div>` : '<div class="empty-state">No responses yet.</div>'}${r.phase === "review" ? `<div class="ballot-action"><span>${ballotStatus}</span><div class="row"><button class="btn secondary" data-action="skip">Skip comparison</button><button class="btn orange" id="buildBallot" ${scored.length < 6 ? "disabled" : ""}>Build 2+2+2 & open voting</button></div></div>` : ""}</div>`
        : "";
      const results =
        ["results", "sharing"].includes(r.phase) && winner
          ? `<div class="card winner-card"><span class="pill">CLASS WINNER</span><h2>${voteMap.get(winner.id) || 0} votes</h2><div class="response selected"><p>${esc(winner.response_text)}</p></div>${criteriaGuide()}${
              r.phase === "results"
                ? '<div class="timer" id="teacherClock">0:45</div><p>Students discuss whether the winner meets the criteria.</p>'
                : `<div class="share-callout"><h3>Selected to share</h3><p>${
                    d.students
                      .filter((x) => r.shareStudentIds.includes(x.id))
                      .map((x) => esc(x.nickname))
                      .join(" & ") || "No students available"
                  }</p></div>`
            }</div>`
          : "";
      const phaseTitle = {
        lobby: "Invite students",
        writing: "Students are writing",
        review: "Score and build the 2+2+2 set",
        voting: "Battle Royale voting",
        results: "45-second Think · Pair · Share",
        sharing: "Two students share",
        summary: "Final summary",
        complete: "ParaFLY complete",
      }[r.phase];
      const summaryPanel =
        isSummary && d.summaries.length
          ? `<div class="card"><h2>Final summaries</h2>${d.summaries.map((x) => `<div class="response"><b>${esc(x.nickname)}</b><p>${esc(x.summary_text)}</p></div>`).join("")}</div>`
          : "";
      const middleMetric =
        r.phase === "voting"
          ? `<b>${d.voteProgress.completed}</b><span>Finished all 3 votes</span>`
          : `<b>${submittedCount}</b><span>${isSummary ? "Final summaries" : "Submitted"}</span>`;
      setPage(
        `<section class="session-card"><button class="join-code" id="copyCode" title="Copy class code">${esc(r.joinCode)}</button><div class="session-copy"><span class="section-label">PARAFLY LIVE</span><h1>${esc(r.title)}</h1><p>${d.students.length} joined&nbsp; · &nbsp;${submittedCount} sent&nbsp; · &nbsp;Passage ${Math.max(1, r.currentRound + 1)} of ${r.paragraphCount}</p></div><div class="session-actions">${controls}</div></section>${roundBar(r)}<div class="teacher-stage"><section class="card current-step"><span class="section-label">CURRENT STEP</span><h2>${phaseTitle}</h2>${r.phase === "writing" ? '<div class="timer" id="teacherClock">--:--</div>' : ""}${r.currentRound >= 0 && !["summary", "complete"].includes(r.phase) ? `<div class="passage">${esc(r.paragraphs[r.currentRound])}</div>` : ""}${criteriaGuide()}${r.phase === "voting" ? `<p class="vote-progress"><b>${d.voteProgress.completed} of ${d.students.length}</b> students finished all three votes.</p>` : ""}</section><aside class="gauge-panel">${gaugeMarkup(average, scored.length)}</aside></div><div class="dashboard-filters"><span class="filter active">All ${d.students.length}</span><span class="filter">Sent ${submittedCount}</span><span class="filter">Working ${Math.max(0, d.students.length - submittedCount)}</span></div>${scorePanel}${results}${summaryPanel}<div class="card roster-card"><h2>Student status</h2><div class="status-list">${
          d.students
            .map((x) => {
              const done = isSummary
                ? summaryIds.has(x.id)
                : submittedIds.has(x.id);
              return `<span class="student-chip ${done ? "done" : ""}">${esc(x.nickname)} ${done ? "✓" : ""}</span>`;
            })
            .join("") || "No students yet."
        }</div></div>`,
      );
      document.querySelectorAll("[data-action]").forEach(
        (b) =>
          (b.onclick = () => {
            const action = b.dataset.action,
              warning =
                action === "end" && roundResponses.length < d.students.length
                  ? `${d.students.length - roundResponses.length} student(s) have not submitted. End writing anyway?`
                  : action === "results" &&
                      d.voteProgress.completed < d.students.length
                    ? `${d.students.length - d.voteProgress.completed} student(s) have not finished all three votes. Reveal a winner anyway?`
                    : action === "finish" &&
                        d.summaries.length < d.students.length
                      ? `${d.students.length - d.summaries.length} student(s) have not submitted a final summary. Finish anyway?`
                      : "";
            if (!warning || confirm(warning))
              withBusy(b, () => control(action));
          }),
      );
      byId("copyCode").onclick = () => copyText(r.joinCode);
      if (r.endsAt && byId("teacherClock")) {
        clearInterval(clockTimer);
        clockTimer = countdown(r.endsAt, byId("teacherClock"));
      }
      document.querySelectorAll("[data-score]").forEach((slider) => {
        slider.oninput = () =>
          (slider.previousElementSibling.querySelector("output").textContent =
            slider.value);
        slider.onchange = () =>
          withBusy(slider, async () => {
            await api(`/rooms/${id}/scores/${slider.dataset.score}`, {
              method: "PUT",
              headers,
              body: JSON.stringify({ score: Number(slider.value) }),
            });
            await load();
          });
      });
      const build = byId("buildBallot");
      if (build) build.onclick = () => withBusy(build, () => control("vote"));
    } catch (e) {
      setPage(`<p class="error">${esc(e.message)}</p>`);
    }
  };
  await load();
  pollTimer = setInterval(() => {
    if (!document.querySelector('input[type="range"]:active')) load();
  }, 2500);
}

const timerMarkup = (r, voting = false) =>
  `<section class="timer-console"><div><span class="section-label">${voting ? "VOTING TIMER" : "TIMER"}</span><div class="timer" id="sharedClock">${r.timerRemaining ? `${Math.floor(r.timerRemaining / 60)}:${String(r.timerRemaining % 60).padStart(2, "0")}` : "—:—"}</div></div><div class="timer-actions"><button class="timer-preset" data-seconds="60">1m</button><button class="timer-preset" data-seconds="120">2m</button><button class="timer-preset" data-seconds="180">3m</button><button class="timer-preset" data-seconds="300">5m</button><button class="timer-preset" data-seconds="600">10m</button><input id="customMinutes" type="number" min="1" max="60" placeholder="min" aria-label="Custom timer minutes"><button class="btn secondary compact" id="startCustom">Start</button>${r.timerRunning ? '<button class="btn secondary compact" data-timer="pause">Pause</button>' : r.timerRemaining ? '<button class="btn secondary compact" data-timer="resume">Resume</button>' : ""}<button class="text-button" data-timer="clear">Clear</button>${voting ? '<label class="auto-close"><input id="autoCloseVote" type="checkbox" checked> Close voting when time ends</label>' : ""}</div></section>`;

async function studentPageV3(id) {
  const session = store.get("parafly-student");
  if (!session || session.roomId !== id) return go("/join");
  let renderKey = "";
  const load = async () => {
    try {
      const s = await api(`/rooms/${id}/student`, {
          headers: { "x-student-token": session.token },
        }),
        r = s.room,
        mine = s.mine.find((x) => x.round_index === r.currentRound),
        released = new Map(
          (s.releasedScores || []).map((x) => [x.round_index, x.score]),
        ),
        timerEnd = r.timerRunning ? r.timerEndsAt : null,
        key = [
          r.phase,
          r.currentRound,
          Boolean(mine),
          s.myVotes.length,
          r.voteClosed,
          r.timerEndsAt,
          r.timerRemaining,
          JSON.stringify(s.releasedScores),
          s.voteProgress?.submitted,
        ].join("|");
      if (key === renderKey) return;
      renderKey = key;
      const scoreNotice = released.has(r.currentRound)
        ? `<aside class="released-score"><span>YOUR SCORE</span><b>${released.get(r.currentRound)}/10</b><p>Use the ParaFLY Check to understand the score. Only you can see this.</p></aside>`
        : r.currentRound >= 0
          ? '<p class="score-waiting">Your score is hidden until your teacher releases it.</p>'
          : "";
      const timer = timerEnd
        ? `<div class="student-live-timer"><span>${r.phase === "voting" ? "VOTING TIME" : "TIME"}</span><div class="timer" id="clock">--:--</div></div>`
        : "";
      let body = "";
      if (r.phase === "lobby")
        body = `<div class="card"><span class="pill">YOU’RE IN</span><h2>Welcome, ${esc(s.student.nickname)}.</h2><p>Waiting for your teacher to begin.</p>${criteriaGuide()}</div>`;
      if (r.phase === "writing")
        body = `${timer}<div class="grid two student-work"><div class="card source-card"><span class="section-label">SOURCE PASSAGE</span><h2>Read</h2><div class="passage">${esc(s.paragraph)}</div></div><div class="card writing-card"><span class="section-label">YOUR RESPONSE</span><h2>ParaFLY</h2>${criteriaGuide()}${mine ? `<span class="saved-check">✓ Sent to your teacher</span><div class="response selected"><p>${esc(mine.response_text)}</p></div>` : `<form id="responseForm"><textarea id="answer" required maxlength="5000" placeholder="Write your ParaFLY here..."></textarea><p id="err"></p><button class="btn orange wide-action">Send my ParaFLY</button></form>`}</div></div>${scoreNotice}`;
      if (r.phase === "review")
        body = `${timer}<div class="card"><span class="pill">TEACHER REVIEW</span><h2>Your response is locked in</h2><div class="passage">${esc(s.paragraph)}</div>${criteriaGuide()}${scoreNotice}<div class="next-step"><b>Battle Royale is next.</b><p>Your teacher is scoring the class and building the anonymous 2+2+2 set.</p></div></div>`;
      if (r.phase === "voting") {
        const battle = Math.min(3, s.myVotes.length),
          pair = s.exemplars.slice(battle * 2, battle * 2 + 2),
          expected = s.voteProgress?.expected || 0,
          completed = s.voteProgress?.completed || 0,
          pct = expected
            ? Math.min(100, Math.round((completed / expected) * 100))
            : 0,
          progress = `<div class="vote-progress-wrap"><div><b>${completed} of ${expected} students finished voting</b><span>${pct}%</span></div><div class="progress-track"><i style="width:${pct}%"></i></div></div>`;
        body = !s.eligibleToVote
          ? `<div class="card"><h2>You joined after this vote began</h2><p>You can participate in the next passage.</p>${progress}</div>`
          : r.voteClosed
            ? `<div class="card"><span class="pill">VOTING CLOSED</span><h2>Your votes are saved</h2>${progress}<p>Waiting for your teacher to reveal the winner.</p></div>`
            : battle >= 3
              ? `<div class="card"><span class="pill">VOTES COMPLETE</span><h2>All three choices are in</h2>${timer}${progress}${criteriaGuide()}<p>Waiting for your teacher to reveal the class winner.</p></div>`
              : `${timer}<div class="card"><span class="pill">BATTLE ${battle + 1} OF 3</span><h2>Which ParaFLY is stronger?</h2>${progress}${criteriaGuide()}<div class="battle-grid">${pair.map((x, i) => `<button class="battle-card" data-vote="${x.id}" data-battle="${battle}"><b>Response ${String.fromCharCode(65 + battle * 2 + i)}</b><p>${esc(x.response_text)}</p><span>Choose this one</span></button>`).join("")}</div><p id="voteError"></p></div>`;
      }
      if (r.phase === "results" || r.phase === "sharing") {
        const counts = new Map(s.results.map((x) => [x.response_id, x.votes])),
          top = s.exemplars.find((x) => x.id === r.winnerResponseId),
          sharer = (r.shareStudentIds || []).includes(s.student.id);
        body = `<div class="card winner-card"><span class="pill">CLASS WINNER</span><h2>Does this ParaFLY meet the criteria?</h2>${top ? `<div class="response selected"><b>${counts.get(top.id) || 0} votes</b><p>${esc(top.response_text)}</p></div>` : ""}${criteriaGuide()}${scoreNotice}${r.phase === "results" ? `<div class="tps"><b>Think · Pair · Share</b><div class="timer" id="clock">0:45</div><p>Explain how the winner does—or does not—meet the ParaFLY Check.</p></div>` : `<div class="share-callout"><h2>${sharer ? "You were selected to share!" : "Listen to the selected speakers."}</h2></div>`}</div>`;
      }
      if (r.phase === "summary")
        body = `${timer}<div class="card"><span class="pill">FINAL OWNERSHIP TASK</span><h2>Bring your thinking together</h2>${criteriaGuide()}${s.summary ? `<div class="response selected"><b>Final summary sent</b><p>${esc(s.summary.summary_text)}</p></div>` : `<form id="summaryForm"><textarea id="summaryAnswer" required minlength="20" maxlength="5000" placeholder="Write a summary with at least three facts..."></textarea><label class="confirm"><input id="threeFacts" type="checkbox" required> My summary includes at least three accurate facts.</label><p id="err"></p><button class="btn orange">Submit final summary</button></form>`}</div>`;
      if (r.phase === "complete")
        body = `<div class="card"><h2>Flight complete</h2>${criteriaGuide()}${s.mine.map((x, i) => `<div class="response"><b>Passage ${i + 1}${released.has(i) ? ` · Score ${released.get(i)}/10` : ""}</b><p>${esc(x.response_text)}</p></div>`).join("")}</div>`;
      setPage(`<h1>${esc(r.title)}</h1>${roundBar(r)}${body}`);
      const clock = byId("clock");
      if (clock) {
        const end = timerEnd || r.endsAt;
        if (end) clockTimer = countdown(end, clock);
      }
      const form = byId("responseForm");
      if (form)
        form.onsubmit = async (e) => {
          e.preventDefault();
          try {
            await api(`/rooms/${id}/responses`, {
              method: "POST",
              headers: { "x-student-token": session.token },
              body: JSON.stringify({ response: byId("answer").value }),
            });
            renderKey = "";
            load();
          } catch (x) {
            byId("err").className = "error";
            byId("err").textContent = x.message;
          }
        };
      document.querySelectorAll("[data-vote]").forEach(
        (b) =>
          (b.onclick = () =>
            withBusy(b, async () => {
              try {
                await api(`/rooms/${id}/vote`, {
                  method: "POST",
                  headers: { "x-student-token": session.token },
                  body: JSON.stringify({
                    responseId: Number(b.dataset.vote),
                    battleIndex: Number(b.dataset.battle),
                  }),
                });
                renderKey = "";
                load();
              } catch (x) {
                byId("voteError").className = "error";
                byId("voteError").textContent = x.message;
              }
            })),
      );
      const sf = byId("summaryForm");
      if (sf)
        sf.onsubmit = async (e) => {
          e.preventDefault();
          try {
            await api(`/rooms/${id}/summary`, {
              method: "POST",
              headers: { "x-student-token": session.token },
              body: JSON.stringify({
                summary: byId("summaryAnswer").value,
                includesThreeFacts: byId("threeFacts").checked,
              }),
            });
            renderKey = "";
            load();
          } catch (x) {
            byId("err").className = "error";
            byId("err").textContent = x.message;
          }
        };
    } catch (e) {
      setPage(`<p class="error">${esc(e.message)}</p>`);
    }
  };
  await load();
  pollTimer = setInterval(load, 2000);
}

async function teacherPageV3(id) {
  let session = store.get("parafly-teacher"),
    recovery = new URLSearchParams(location.search).get("teacherToken");
  if ((!session || session.roomId !== id) && recovery) {
    session = { roomId: id, token: recovery };
    store.set("parafly-teacher", session);
    history.replaceState({}, "", `/teacher/${id}`);
  }
  if (!session || session.roomId !== id) return teacherPage(id);
  const headers = { "x-teacher-token": session.token };
  const call = async (path, method, body) =>
      api(path, { method, headers, body: JSON.stringify(body) }),
    control = (action, extra = {}) =>
      call(`/rooms/${id}/control`, "PATCH", { action, ...extra });
  const load = async () => {
    try {
      const d = await api(`/rooms/${id}/teacher`, { headers }),
        r = d.room,
        roundResponses = d.responses.filter(
          (x) => x.round_index === r.currentRound,
        ),
        scores = new Map(d.scores.map((x) => [x.response_id, Number(x.score)])),
        scored = roundResponses.filter((x) => scores.has(x.id)),
        average = scored.length
          ? (
              scored.reduce((n, x) => n + scores.get(x.id), 0) / scored.length
            ).toFixed(1)
          : "—",
        released = r.scoresReleasedRounds.includes(r.currentRound),
        expected = d.voteProgress.expected || 0,
        complete = d.voteProgress.completed || 0,
        percent = expected ? Math.round((complete / expected) * 100) : 0,
        submittedIds = new Set(roundResponses.map((x) => x.student_id));
      const controls =
        r.phase === "lobby"
          ? '<button class="btn orange" data-action="start">Begin passage 1</button>'
          : r.phase === "writing"
            ? '<button class="btn orange" data-action="end">End writing</button>'
            : r.phase === "review"
              ? '<button class="btn secondary" data-action="reopen">Reopen writing</button>'
              : r.phase === "voting"
                ? '<button class="btn orange" data-action="results">Reveal winner & start TPS</button>'
                : r.phase === "results"
                  ? '<button class="btn orange" data-action="share">Select 2 students to share</button>'
                  : r.phase === "sharing"
                    ? `<button class="btn orange" data-action="next">${r.currentRound + 1 >= r.paragraphCount ? "Open final summary" : "Launch next passage"}</button>`
                    : r.phase === "summary"
                      ? '<button class="btn orange" data-action="finish">Finish ParaFLY</button>'
                      : "";
      const timerPanel = r.phase === "writing"
          ? `<section class="timer-console"><div><span class="section-label">SHARED WRITING TIMER</span><div class="timer" id="sharedClock">--:--</div><p class="muted">Students see this exact countdown.</p></div><div class="timer-actions"><button class="timer-preset add-time" id="addThirty">+30 seconds</button></div></section>`
          : timerMarkup(r, r.phase === "voting"),
        ballotStatus =
          roundResponses.length < 6
            ? `The 2+2+2 set needs 6 responses. ${roundResponses.length} available.`
            : scored.length < 6
              ? `Score ${6 - scored.length} more response${6 - scored.length === 1 ? "" : "s"}.`
              : "Ready: 2 lower + 2 middle + 2 higher.";
      const scorePanel = ["writing", "review"].includes(r.phase)
        ? `<section class="card response-board"><div class="row heading-row"><div><span class="section-label">LIVE RESPONSES</span><h2>Score responses as they arrive</h2><p class="muted">Use the ParaFLY Check—not generic writing quality.</p></div><div class="score-release-actions"><span class="pill">${released ? "SCORES RELEASED" : "SCORES HIDDEN"}</span><button class="btn secondary" id="releaseScores" ${scored.length ? "" : "disabled"}>${released ? "Unrelease scores" : "Release scores"}</button></div></div>${criteriaGuide()}<div class="response-score-grid">${roundResponses.map((x, i) => `<article class="score-row"><div class="student-card-head"><span class="student-number">${i + 1}</span><b>${esc(x.display_name)}</b><span class="score-badge">${scores.get(x.id) || "—"}/10</span></div><p>${esc(x.response_text)}</p><label><span>SCORE <output>${scores.get(x.id) || "—"}</output></span><input type="range" min="1" max="10" value="${scores.get(x.id) || 5}" data-score="${x.id}"></label></article>`).join("") || '<div class="empty-state">No responses yet.</div>'}</div>${r.phase === "review" ? `<div class="ballot-action"><span>${ballotStatus}</span><div class="row"><button class="btn secondary" data-action="skip">Skip comparison</button><button class="btn orange" id="buildBallot" ${scored.length < 6 ? "disabled" : ""}>Build 2+2+2 & open voting</button></div></div>` : ""}</section>`
        : "";
      const votingPanel =
        r.phase === "voting"
          ? `<section class="card voting-dashboard"><div class="row heading-row"><div><span class="section-label">LIVE VOTING</span><h2>${complete} of ${expected} students finished</h2></div><b class="vote-percent">${percent}%</b></div><div class="progress-track large"><i style="width:${percent}%"></i></div><p>${d.voteProgress.submitted || 0} of ${expected * 3} total matchup votes submitted.</p><div class="row"><button class="btn secondary" data-action="reopenVote" ${r.voteClosed ? "" : "disabled"}>Reopen voting</button><select id="resetBattle"><option value="">Reset a matchup…</option><option value="0">Reset matchup 1</option><option value="1">Reset matchup 2</option><option value="2">Reset matchup 3</option></select></div></section>`
          : "";
      const phaseTitle = {
        lobby: "Invite students",
        writing: "Students are writing",
        review: "Score and build the 2+2+2 set",
        voting: "Battle Royale voting",
        results: "45-second Think · Pair · Share",
        sharing: "Two students share",
        summary: "Final summary",
        complete: "ParaFLY complete",
      }[r.phase];
      setPage(
        `<section class="session-card"><button class="join-code" id="copyCode" title="Copy class code">${esc(r.joinCode)}</button><div class="session-copy"><span class="section-label">PARAFLY LIVE</span><h1>${esc(r.title)}</h1><p>${d.students.length} joined · ${roundResponses.length} sent · Passage ${Math.max(1, r.currentRound + 1)} of ${r.paragraphCount}</p></div><div class="session-actions"><label class="nickname-toggle" title="Switch teacher-facing student labels between real names and assigned nicknames"><input id="showNicknames" type="checkbox" ${r.hideIdentities ? "checked" : ""}><span class="toggle-track"></span><b>Show nicknames</b></label><button class="btn secondary" id="copyJoin">Copy student link</button><button class="btn secondary" id="projectJoin">Project join screen</button>${controls}</div></section>${roundBar(r)}<div class="teacher-stage"><section class="card current-step"><span class="section-label">CURRENT STEP</span><h2>${phaseTitle}</h2>${r.currentRound >= 0 && !["summary", "complete"].includes(r.phase) ? `<div class="passage">${esc(r.paragraphs[r.currentRound])}</div>` : ""}${criteriaGuide()}</section><aside class="gauge-panel">${gaugeMarkup(average, scored.length)}</aside></div>${timerPanel}${votingPanel}${scorePanel}<section class="card roster-card"><h2>Student status</h2><div class="status-list">${d.students.map((x) => `<span class="student-chip ${submittedIds.has(x.id) ? "done" : ""}">${esc(x.display_name)} ${submittedIds.has(x.id) ? "✓" : ""}</span>`).join("") || "No students yet."}</div></section><dialog id="joinDialog" class="app-dialog projector-dialog"><button class="dialog-close" id="closeJoin" aria-label="Close">×</button><div class="projector-content"><span class="section-label">JOIN CODE</span><div class="project-code">${esc(r.joinCode)}</div><img class="join-qr" src="${d.qrDataUrl}" alt="QR code for the student join link"><p>Scan the QR code, or open:</p><h2 class="join-url">${esc(d.joinUrl)}</h2><button class="btn secondary" id="fullscreenJoin">Fullscreen</button></div></dialog>`,
      );
      document.querySelectorAll("[data-action]").forEach(
        (b) =>
          (b.onclick = () =>
            withBusy(b, async () => {
              if (
                b.dataset.action === "results" &&
                complete < expected &&
                !confirm(
                  `${expected - complete} student(s) have not finished all three votes. Reveal anyway?`,
                )
              )
                return;
              try {
                await control(b.dataset.action);
                await load();
              } catch (error) {
                toast(error.message);
              }
            })),
      );
      byId("copyCode").onclick = () => copyText(r.joinCode);
      byId("copyJoin").onclick = () => copyText(d.joinUrl);
      byId("projectJoin").onclick = () => byId("joinDialog").showModal();
      byId("closeJoin").onclick = () => byId("joinDialog").close();
      byId("fullscreenJoin").onclick = () =>
        byId("joinDialog").requestFullscreen?.();
      document.querySelectorAll("[data-score]").forEach((slider) => {
        const begin = () => (teacherInteraction = true);
        const finish = async () => {
          if (!teacherInteraction) return;
          teacherInteraction = false;
          try {
            await call(`/rooms/${id}/scores/${slider.dataset.score}`, "PUT", {
              score: Number(slider.value),
            });
          } catch (error) {
            toast(error.message);
          }
        };
        slider.onpointerdown = begin;
        slider.onpointerup = finish;
        slider.onkeydown = begin;
        slider.oninput = () => {
          teacherInteraction = true;
          slider.previousElementSibling.querySelector("output").textContent = slider.value;
          slider.closest(".score-row").querySelector(".score-badge").textContent = `${slider.value}/10`;
        };
        slider.onchange = finish;
        slider.onpointercancel = () => (teacherInteraction = false);
      });
      if (byId("addThirty"))
        byId("addThirty").onclick = () =>
          call(`/rooms/${id}/timer`, "POST", { action: "add", seconds: 30 })
            .then(load)
            .catch((error) => toast(error.message));
      const build = byId("buildBallot");
      if (build) build.onclick = () => control("vote").then(load);
      const release = byId("releaseScores");
      if (release)
        release.onclick = () => {
          const action = released ? "hide" : "release",
            ready = scored.length;
          if (
            confirm(
              `${action === "release" ? "Release" : "Hide"} scores for passage ${r.currentRound + 1}? ${ready} scored response${ready === 1 ? "" : "s"} ${action === "release" ? "will be visible only to the student who earned it." : "will be hidden again."}`,
            )
          )
            call(`/rooms/${id}/scores/release`, "POST", {
              round: r.currentRound,
              release: !released,
            }).then(load);
        };
      const saveSettings = () =>
        call(`/rooms/${id}/settings`, "PATCH", {
          hideIdentities: byId("showNicknames")?.checked,
        }).then(load);
      if (byId("showNicknames"))
        byId("showNicknames").onchange = saveSettings;
      const startTimer = (seconds) =>
        call(`/rooms/${id}/timer`, "POST", {
          action: "start",
          seconds,
          autoClose: byId("autoCloseVote")?.checked === true,
        }).then(load);
      document
        .querySelectorAll("[data-seconds]")
        .forEach(
          (b) => (b.onclick = () => startTimer(Number(b.dataset.seconds))),
        );
      if (byId("startCustom"))
        byId("startCustom").onclick = () => {
          const minutes = Number(byId("customMinutes").value);
          if (minutes > 0) startTimer(minutes * 60);
        };
      document
        .querySelectorAll("[data-timer]")
        .forEach(
          (b) =>
            (b.onclick = () =>
              call(`/rooms/${id}/timer`, "POST", {
                action: b.dataset.timer,
              }).then(load)),
        );
      if (r.timerRunning && r.timerEndsAt && byId("sharedClock"))
        clockTimer = countdown(r.timerEndsAt, byId("sharedClock"), load);
      const reset = byId("resetBattle");
      if (reset)
        reset.onchange = () => {
          if (
            reset.value !== "" &&
            confirm(
              `Reset matchup ${Number(reset.value) + 1}? Submitted votes for that matchup will be deleted.`,
            )
          )
            control("resetBattle", { battleIndex: Number(reset.value) }).then(
              load,
            );
        };
    } catch (e) {
      setPage(`<p class="error">${esc(e.message)}</p>`);
    }
  };
  await load();
  pollTimer = setInterval(() => {
    if (
      !teacherInteraction &&
      !document.querySelector('input[type="range"]:active') &&
      !document.querySelector("dialog[open]")
    )
      load();
  }, 2000);
}

function render() {
  clearInterval(pollTimer);
  clearInterval(clockTimer);
  const [a, b] = route();
  if (!a) return home();
  if (a === "teacher" && b === "create") return create();
  if (a === "teacher" && b) return teacherPageV3(Number(b));
  if (a === "join") return join(b || "");
  if (a === "student" && b) return studentPageV3(Number(b));
  home();
}
render();
