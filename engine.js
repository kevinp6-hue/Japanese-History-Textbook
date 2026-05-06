let chapters = [];
let currentChapter = 0;
const completed = new Set();
const quizResults = {};
const quizNav = {};
let fc = { deck: [], index: 0 };

// ── Persistence ───────────────────────────────────────────────

function saveProgress() {
  try {
    localStorage.setItem('jh-completed', JSON.stringify([...completed]));
    localStorage.setItem('jh-quiz', JSON.stringify(quizResults));
  } catch(e) {}
}

function loadProgress() {
  try {
    const c = localStorage.getItem('jh-completed');
    if (c) JSON.parse(c).forEach(i => completed.add(Number(i)));
    const q = localStorage.getItem('jh-quiz');
    if (q) Object.assign(quizResults, JSON.parse(q));
  } catch(e) {}
}

// ── Dark mode ─────────────────────────────────────────────────

function toggleDarkMode() {
  const isDark = document.documentElement.classList.toggle('dark');
  try { localStorage.setItem('jh-dark', isDark); } catch(e) {}
  updateDarkToggles();
}

function updateDarkToggles() {
  const isDark = document.documentElement.classList.contains('dark');
  document.querySelectorAll('.dark-toggle').forEach(btn => {
    btn.textContent = isDark ? 'Light' : 'Dark';
  });
}

// ── Page management ───────────────────────────────────────────

function showPage(id) {
  ['home', 'reader', 'glossary'].forEach(pid => {
    const el = document.getElementById(pid);
    if (!el) return;
    el.classList.remove('active');
    el.style.display = 'none';
  });
  const target = document.getElementById(id);
  target.classList.add('active');
  target.style.display = id === 'reader' ? 'flex' : 'block';
}

// ── Reading progress bar ──────────────────────────────────────

const progressBar = document.getElementById('reading-progress');

function updateReadingProgress() {
  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  progressBar.style.width = scrollable > 0 ? (window.scrollY / scrollable * 100) + '%' : '0%';
}
window.addEventListener('scroll', updateReadingProgress, { passive: true });

// ── Keyboard shortcuts ────────────────────────────────────────

document.addEventListener('keydown', e => {
  if (!document.getElementById('reader').classList.contains('active')) return;
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.key === 'ArrowLeft') prevChapter();
  if (e.key === 'ArrowRight') nextChapter();
});

// ── Mobile sidebar ────────────────────────────────────────────

function toggleSidebar() {
  document.querySelector('.sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('visible');
}

function closeSidebar() {
  document.querySelector('.sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('visible');
}

// ── Home page ─────────────────────────────────────────────────

function buildHome() {
  const grid = document.getElementById('chapter-cards');
  grid.innerHTML = '';
  chapters.forEach((ch, i) => {
    const done = completed.has(i);
    const card = document.createElement('div');
    card.className = 'chapter-card fade-in';
    card.innerHTML = `
      <div class="card-num">Chapter ${ch.num}</div>
      <div class="card-jp">${ch.jp}</div>
      <div class="card-years">${ch.years}</div>
      <div class="card-name">${ch.name}</div>
      <p class="card-summary">${ch.intro.substring(0, 120)}...</p>
      <div class="card-progress"><div class="card-progress-fill" style="width:${done ? 100 : 0}%"></div></div>
      <div class="card-status">${done ? '✓ Complete' : 'Not started'}</div>
    `;
    card.onclick = () => openChapter(i);
    grid.appendChild(card);
  });
  observeFadeIns();
}

// ── Sidebar ───────────────────────────────────────────────────

function buildSidebar() {
  const nav = document.getElementById('sidebar-chapters');
  nav.innerHTML = '';
  chapters.forEach((ch, i) => {
    const item = document.createElement('div');
    item.className = 'sidebar-ch' + (i === currentChapter ? ' active' : '') + (completed.has(i) ? ' done' : '');
    item.innerHTML = `
      <div class="sidebar-ch-num">${ch.num}</div>
      <div class="sidebar-dot"></div>
      <div>
        <div class="sidebar-ch-name">${ch.name}</div>
        <div class="sidebar-ch-years">${ch.years}</div>
      </div>
    `;
    item.onclick = () => openChapter(i);
    nav.appendChild(item);
  });
  const done = completed.size;
  document.getElementById('progress-text').textContent = `${done} of ${chapters.length} complete`;
  document.getElementById('overall-fill').style.width = (done / chapters.length * 100) + '%';
}

// ── Chapter rendering ─────────────────────────────────────────

function renderChapter(idx) {
  const ch = chapters[idx];
  document.getElementById('topbar-title').textContent = `${ch.num}. ${ch.name}`;
  document.getElementById('btn-prev').disabled = idx === 0;
  document.getElementById('btn-next').disabled = idx === chapters.length - 1;

  let html = `<div class="chapter-content">
    <div class="ch-header">
      <div class="ch-eyebrow">Chapter ${ch.num} of ${chapters.length}</div>
      <div class="ch-jp">${ch.jp}</div>
      <h1 class="ch-title">${ch.name}</h1>
      <div class="ch-years">${ch.years}</div>
      <p class="ch-intro">${ch.intro}</p>
    </div>`;

  if (ch.sections.length > 1) {
    html += `<div class="ch-toc"><span class="ch-toc-label">Jump to</span>`;
    ch.sections.forEach((sec, si) => {
      html += `<button class="ch-toc-btn" onclick="document.getElementById('ch-sec-${idx}-${si}').scrollIntoView({behavior:'smooth',block:'start'})">${sec.h2}</button>`;
    });
    html += `</div>`;
  }

  ch.sections.forEach((sec, si) => {
    html += `<div class="ch-section clearfix" id="ch-sec-${idx}-${si}">`;
    if (sec.dates && sec.dates.length) {
      html += `<div class="dates-box"><div class="dates-box-label">Key Dates</div>`;
      sec.dates.forEach(d => { html += `<div class="date-row"><span class="date-yr">${d[0]}</span><span class="date-ev">${d[1]}</span></div>`; });
      html += `</div>`;
    }
    html += `<h2>${sec.h2}</h2>${sec.body}</div>`;
  });

  html += `<div class="key-terms"><div class="key-terms-label">Key Terms</div><div class="key-terms-grid">`;
  ch.terms.forEach(t => { html += `<div class="key-term"><strong>${t[0]}</strong> — <span>${t[1]}</span></div>`; });
  html += `</div></div>`;

  html += `<div class="flashcard-section">
    <div class="flashcard-section-label">Flashcard Study</div>
    <div class="flashcard-wrap">
      <div class="flashcard" id="fc-card" onclick="flipCard()">
        <div class="flashcard-front">
          <div class="flashcard-term" id="fc-term"></div>
          <div class="flashcard-hint">tap to reveal definition</div>
        </div>
        <div class="flashcard-back">
          <div class="flashcard-def" id="fc-def"></div>
        </div>
      </div>
    </div>
    <div class="flashcard-controls">
      <button class="btn" onclick="prevCard()">← Prev</button>
      <span class="flashcard-counter" id="fc-counter"></span>
      <button class="btn" onclick="nextCard()">Next →</button>
      <button class="btn" onclick="shuffleCards(${idx})">Shuffle</button>
    </div>
  </div>`;

  const qr = quizResults[idx] || {};
  const currentQ = quizNav[idx] || 0;
  const allAnswered = Object.keys(qr).length === ch.quiz.length;
  const correctCount = allAnswered ? Object.entries(qr).filter(([qi, oi]) => parseInt(oi) === ch.quiz[qi].ans).length : 0;

  html += `<div class="quiz-section">
    <div class="quiz-section-label">End of Chapter Quiz</div>
    <h2>Test Your Knowledge</h2>
    <p class="quiz-section-sub">${ch.quiz.length} questions · ${ch.name}</p>
    <div class="quiz-progress-dots" id="quiz-dots-${idx}">`;

  ch.quiz.forEach((q, qi) => {
    const answered = qr[qi] !== undefined;
    const isCorrect = answered && qr[qi] === q.ans;
    html += `<button class="quiz-dot${answered ? (isCorrect ? ' correct' : ' wrong') : ''}${qi === currentQ ? ' active' : ''}" onclick="showQuizQ(${idx},${qi})" title="Question ${qi + 1}"></button>`;
  });

  html += `</div>`;

  ch.quiz.forEach((q, qi) => {
    const answered = qr[qi] !== undefined;
    const isCorrect = answered && qr[qi] === q.ans;
    html += `<div class="quiz-q-block" id="qblock-${idx}-${qi}"${qi !== currentQ ? ' style="display:none"' : ''}>
      <div class="quiz-q-num">Question ${qi + 1} of ${ch.quiz.length}</div>
      <p class="quiz-q-text">${q.q}</p>
      <div class="quiz-opts">`;
    q.opts.forEach((opt, oi) => {
      let cls = 'quiz-opt';
      if (answered) { cls += oi === q.ans ? ' correct' : (oi === qr[qi] && qr[qi] !== q.ans ? ' wrong' : ''); }
      html += `<button class="${cls}" ${answered ? 'disabled' : ''} onclick="answerQ(${idx},${qi},${oi})">${opt}</button>`;
    });
    html += `</div>
      <div class="quiz-explanation ${answered ? 'show ' + (isCorrect ? 'correct' : 'wrong') : ''}" id="qexp-${idx}-${qi}">
        ${answered ? (isCorrect ? '✓ Correct. ' : '✗ Incorrect. ') + q.exp : ''}
      </div></div>`;
  });

  html += `<div class="quiz-nav">
    <button class="btn" id="quiz-prev-${idx}" onclick="prevQ(${idx})"${currentQ === 0 ? ' disabled' : ''}>← Prev</button>
    <span class="quiz-nav-counter" id="quiz-counter-${idx}">${currentQ + 1} / ${ch.quiz.length}</span>
    <button class="btn" id="quiz-next-${idx}" onclick="nextQ(${idx})"${currentQ === ch.quiz.length - 1 ? ' disabled' : ''}>Next →</button>
  </div>`;

  html += `<div class="quiz-results${allAnswered ? ' show' : ''}" id="quiz-summary-${idx}">
    <div class="results-score">${allAnswered ? correctCount + '/' + ch.quiz.length : ''}</div>
    <div class="results-label">Questions correct</div>
    <p class="results-msg">${allAnswered ? getScoreMsg(correctCount, ch.quiz.length) : ''}</p>
    <div class="results-btns">
      <button class="btn" onclick="retakeQuiz(${idx})">Retake Quiz</button>
      ${idx < chapters.length - 1 ? `<button class="btn primary" onclick="openChapter(${idx + 1})">Next Chapter →</button>` : '<button class="btn primary" onclick="goHome()">Back to Home</button>'}
    </div>
  </div></div>`;

  if (ch.sources && ch.sources.length) {
    html += `<div class="sources-section">
      <div class="sources-label">Sources &amp; Further Reading</div>
      <ol class="sources-list">`;
    ch.sources.forEach(s => {
      const text = typeof s === 'string' ? s : s.text;
      const url  = s.url ?? null;
      html += `<li class="source-item">${url ? `<a href="${url}" target="_blank" rel="noopener">${text}</a>` : text}</li>`;
    });
    html += `</ol></div>`;
  }

  html += `<div class="ch-footer-nav">`;
  if (idx > 0) {
    const prev = chapters[idx - 1];
    html += `<div><div class="ch-footer-nav-label">← Previous</div><div class="ch-footer-nav-name">${prev.name}</div><button class="btn ch-footer-btn" onclick="openChapter(${idx - 1})">← Ch. ${prev.num}</button></div>`;
  } else { html += '<div></div>'; }
  if (idx < chapters.length - 1) {
    const next = chapters[idx + 1];
    html += `<div class="ch-footer-next"><div class="ch-footer-nav-label">Next →</div><div class="ch-footer-nav-name">${next.name}</div><button class="btn primary ch-footer-btn" onclick="openChapter(${idx + 1})">Ch. ${next.num} →</button></div>`;
  }
  html += `</div></div>`;

  document.getElementById('chapter-render').innerHTML = html;
  initFlashcards(idx);
  window.scrollTo(0, 0);
}

function getScoreMsg(c, t) {
  const p = c / t;
  if (p === 1) return 'Perfect score — excellent command of this era.';
  if (p >= 0.8) return 'Strong performance. Review any missed questions before moving on.';
  if (p >= 0.6) return 'Good foundation — re-read sections covering your missed questions.';
  return 'More review needed. Re-read this chapter before moving to the next.';
}

// ── Quiz ──────────────────────────────────────────────────────

function answerQ(ci, qi, oi) {
  if (!quizResults[ci]) quizResults[ci] = {};
  if (quizResults[ci][qi] !== undefined) return;
  quizResults[ci][qi] = oi;
  const ch = chapters[ci];
  const q = ch.quiz[qi];
  const correct = oi === q.ans;
  const block = document.getElementById(`qblock-${ci}-${qi}`);
  block.querySelectorAll('.quiz-opt').forEach((btn, j) => {
    btn.disabled = true;
    if (j === q.ans) btn.classList.add('correct');
    else if (j === oi && !correct) btn.classList.add('wrong');
  });
  const exp = document.getElementById(`qexp-${ci}-${qi}`);
  exp.textContent = (correct ? '✓ Correct. ' : '✗ Incorrect. ') + q.exp;
  exp.className = 'quiz-explanation show ' + (correct ? 'correct' : 'wrong');
  const dots = document.querySelectorAll(`#quiz-dots-${ci} .quiz-dot`);
  if (dots[qi]) dots[qi].classList.add(correct ? 'correct' : 'wrong');
  saveProgress();
  if (Object.keys(quizResults[ci]).length === ch.quiz.length) {
    completed.add(ci);
    buildSidebar();
    saveProgress();
    const correctCount = Object.entries(quizResults[ci]).filter(([qi2, oi2]) => parseInt(oi2) === ch.quiz[qi2].ans).length;
    const summary = document.getElementById(`quiz-summary-${ci}`);
    summary.querySelector('.results-score').textContent = correctCount + '/' + ch.quiz.length;
    summary.querySelector('.results-msg').textContent = getScoreMsg(correctCount, ch.quiz.length);
    summary.classList.add('show');
    summary.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
}

function retakeQuiz(idx) {
  delete quizResults[idx];
  delete quizNav[idx];
  completed.delete(idx);
  saveProgress();
  buildSidebar();
  renderChapter(idx);
  setTimeout(() => { document.querySelector('.quiz-section')?.scrollIntoView({ behavior: 'smooth' }); }, 100);
}

function showQuizQ(ci, qi) {
  const ch = chapters[ci];
  if (qi < 0 || qi >= ch.quiz.length) return;
  const prev = quizNav[ci] || 0;
  if (prev !== qi) {
    document.getElementById(`qblock-${ci}-${prev}`).style.display = 'none';
  }
  document.getElementById(`qblock-${ci}-${qi}`).style.display = '';
  quizNav[ci] = qi;
  document.getElementById(`quiz-counter-${ci}`).textContent = `${qi + 1} / ${ch.quiz.length}`;
  document.getElementById(`quiz-prev-${ci}`).disabled = qi === 0;
  document.getElementById(`quiz-next-${ci}`).disabled = qi === ch.quiz.length - 1;
  document.querySelectorAll(`#quiz-dots-${ci} .quiz-dot`).forEach((dot, i) => {
    dot.classList.toggle('active', i === qi);
  });
}

function prevQ(ci) { showQuizQ(ci, (quizNav[ci] || 0) - 1); }
function nextQ(ci) { showQuizQ(ci, (quizNav[ci] || 0) + 1); }

// ── Flashcards ────────────────────────────────────────────────

function initFlashcards(chIdx) {
  fc.deck = [...chapters[chIdx].terms];
  fc.index = 0;
  showCard();
}

function showCard() {
  const card = document.getElementById('fc-card');
  if (!card) return;
  card.classList.remove('flipped');
  document.getElementById('fc-term').textContent = fc.deck[fc.index][0];
  document.getElementById('fc-def').textContent = fc.deck[fc.index][1];
  document.getElementById('fc-counter').textContent = `${fc.index + 1} / ${fc.deck.length}`;
}

function flipCard() { document.getElementById('fc-card')?.classList.toggle('flipped'); }
function prevCard() { if (fc.index > 0) { fc.index--; showCard(); } }
function nextCard() { if (fc.index < fc.deck.length - 1) { fc.index++; showCard(); } }
function shuffleCards(chIdx) {
  fc.deck = [...chapters[chIdx].terms].sort(() => Math.random() - 0.5);
  fc.index = 0;
  showCard();
}

// ── Glossary ──────────────────────────────────────────────────

function openGlossary() {
  closeSidebar();
  showPage('glossary');
  progressBar.classList.remove('active');
  document.getElementById('glossary-search').value = '';
  buildGlossary('');
  window.scrollTo(0, 0);
}

function buildGlossary(query) {
  const q = query.toLowerCase().trim();
  const container = document.getElementById('glossary-results');
  container.innerHTML = '';
  let count = 0;
  chapters.forEach(ch => {
    ch.terms.forEach(([term, def]) => {
      if (!q || term.toLowerCase().includes(q) || def.toLowerCase().includes(q)) {
        const row = document.createElement('div');
        row.className = 'glossary-row';
        row.innerHTML = `
          <strong>${term}</strong>
          <div class="glossary-row-ch">Ch. ${ch.num} · ${ch.name}</div>
          <div class="glossary-row-def">${def}</div>
        `;
        container.appendChild(row);
        count++;
      }
    });
  });
  if (!count) {
    container.innerHTML = '<p class="glossary-empty">No terms match your search.</p>';
  }
}

function filterGlossary() {
  buildGlossary(document.getElementById('glossary-search').value);
}

// ── Navigation ────────────────────────────────────────────────

function openChapter(idx) {
  currentChapter = idx;
  closeSidebar();
  showPage('reader');
  progressBar.classList.add('active');
  progressBar.style.width = '0%';
  buildSidebar();
  renderChapter(idx);
}

function goHome() {
  showPage('home');
  progressBar.classList.remove('active');
  progressBar.style.width = '0%';
  buildHome();
  window.scrollTo(0, 0);
}

function prevChapter() { if (currentChapter > 0) openChapter(currentChapter - 1); }
function nextChapter() { if (currentChapter < chapters.length - 1) openChapter(currentChapter + 1); }

// ── Animations ────────────────────────────────────────────────

function observeFadeIns() {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); });
  }, { threshold: 0.06 });
  document.querySelectorAll('.fade-in:not(.visible)').forEach(el => obs.observe(el));
}

// ── Init ──────────────────────────────────────────────────────

fetch('chapters.json')
  .then(r => r.json())
  .then(data => {
    chapters = data;
    loadProgress();
    if (localStorage.getItem('jh-dark') === 'true') {
      document.documentElement.classList.add('dark');
    }
    updateDarkToggles();
    buildHome();
  })
  .catch(err => {
    document.body.innerHTML = '<p style="padding:2rem;font-family:monospace">Failed to load chapters.json. Serve this directory from a web server (e.g. <code>npx serve .</code>).</p>';
    console.error(err);
  });