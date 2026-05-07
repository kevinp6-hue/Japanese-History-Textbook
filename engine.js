let chapters = [];
let currentChapter = 0;
const completed = new Set();
const quizResults = {};
const quizNav = {};
let fc = { deck: [], index: 0 };

const CH_COLORS = [
  '#c0392b','#b8860b','#2980b9','#27ae60','#8e44ad',
  '#d35400','#16a085','#7f8c8d','#e67e22','#2c3e50'
];

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

// ── Bookmarks ─────────────────────────────────────────────────

function saveBookmark(ci, si) {
  try {
    const cur = loadBookmark(ci);
    if (si > cur) localStorage.setItem('jh-bm-' + ci, si);
  } catch(e) {}
}

function loadBookmark(ci) {
  try { return parseInt(localStorage.getItem('jh-bm-' + ci)) || 0; } catch(e) { return 0; }
}

function observeSections(ci) {
  const obs = new IntersectionObserver(entries => {
    entries.forEach(e => {
      if (e.isIntersecting) {
        const si = parseInt(e.target.id.split('-').pop());
        if (!isNaN(si)) saveBookmark(ci, si);
      }
    });
  }, { rootMargin: '-10% 0px -50% 0px' });
  chapters[ci].sections.forEach((_, si) => {
    const el = document.getElementById(`ch-sec-${ci}-${si}`);
    if (el) obs.observe(el);
  });
}

// ── Read-time estimation ──────────────────────────────────────

function estimateReadTime(ch) {
  const raw = [ch.intro, ...ch.sections.map(s => s.body)].join(' ')
    .replace(/<[^>]+>/g, '');
  const words = raw.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
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
  ['home', 'reader', 'glossary', 'dashboard', 'timeline', 'exam'].forEach(pid => {
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

// ── Keyboard handler ──────────────────────────────────────────

document.addEventListener('keydown', e => {
  const inInput = ['INPUT','TEXTAREA'].includes(e.target.tagName);

  // Ctrl+F in reader → in-chapter search
  if ((e.ctrlKey || e.metaKey) && e.key === 'f' &&
      document.getElementById('reader').classList.contains('active')) {
    e.preventDefault();
    openSearch();
    return;
  }

  // ? → shortcuts (not when typing)
  if (e.key === '?' && !e.ctrlKey && !e.altKey && !e.metaKey && !inInput) {
    openShortcuts();
    return;
  }

  // Escape → close overlays
  if (e.key === 'Escape') {
    closeSearch();
    closeShortcuts();
    return;
  }

  if (!document.getElementById('reader').classList.contains('active')) return;
  if (inInput) return;
  if (e.altKey || e.ctrlKey || e.metaKey) return;

  if (e.key === 'ArrowLeft') prevChapter();
  if (e.key === 'ArrowRight') nextChapter();
  if ((e.key === 'Enter' || e.key === ' ') && e.target.id === 'fc-card') {
    e.preventDefault();
    flipCard();
  }
});

// ── Swipe navigation ──────────────────────────────────────────

let _swipeStart = null;
document.addEventListener('touchstart', e => {
  if (!document.getElementById('reader').classList.contains('active')) return;
  _swipeStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
}, { passive: true });
document.addEventListener('touchend', e => {
  if (!document.getElementById('reader').classList.contains('active') || !_swipeStart) return;
  const dx = e.changedTouches[0].clientX - _swipeStart.x;
  const dy = e.changedTouches[0].clientY - _swipeStart.y;
  _swipeStart = null;
  if (Math.abs(dx) < 80 || Math.abs(dy) > Math.abs(dx) * 0.7) return;
  if (dx < 0) nextChapter();
  else prevChapter();
}, { passive: true });

// ── Mobile sidebar ────────────────────────────────────────────

function toggleSidebar() {
  document.querySelector('.sidebar').classList.toggle('open');
  document.getElementById('sidebar-overlay').classList.toggle('visible');
}

function closeSidebar() {
  document.querySelector('.sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('visible');
}

// ── In-chapter search ─────────────────────────────────────────

let _searchMarks = [];
let _searchIdx = -1;

function openSearch() {
  const bar = document.getElementById('search-bar');
  if (!bar) return;
  bar.classList.add('visible');
  const input = document.getElementById('search-input');
  input.focus();
  input.select();
}

function closeSearch() {
  const bar = document.getElementById('search-bar');
  if (!bar || !bar.classList.contains('visible')) return;
  bar.classList.remove('visible');
  clearSearchMarks();
  document.getElementById('search-input').value = '';
}

function resetSearch() {
  _searchMarks = [];
  _searchIdx = -1;
  const bar = document.getElementById('search-bar');
  if (bar) bar.classList.remove('visible');
  const input = document.getElementById('search-input');
  if (input) input.value = '';
  updateSearchCounter(0, 0);
}

function clearSearchMarks() {
  _searchMarks.forEach(m => {
    if (m.isConnected && m.parentNode) {
      m.replaceWith(document.createTextNode(m.textContent));
    }
  });
  document.getElementById('chapter-render')?.normalize();
  _searchMarks = [];
  _searchIdx = -1;
  updateSearchCounter(0, 0);
}

function doSearch() {
  clearSearchMarks();
  const term = document.getElementById('search-input').value.trim();
  if (!term) return;
  const root = document.getElementById('chapter-render');
  if (!root) return;
  _searchMarks = applyHighlights(root, term);
  if (_searchMarks.length) {
    _searchIdx = 0;
    scrollToMark(0);
  } else {
    updateSearchCounter(0, 0);
  }
}

function applyHighlights(root, term) {
  const marks = [];
  const lower = term.toLowerCase();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const p = node.parentElement;
      if (!p) return NodeFilter.FILTER_REJECT;
      if (['SCRIPT','STYLE','INPUT','TEXTAREA'].includes(p.tagName)) return NodeFilter.FILTER_REJECT;
      if (p.closest('.search-bar')) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  const nodes = [];
  let n;
  while ((n = walker.nextNode())) nodes.push(n);

  nodes.forEach(textNode => {
    const text = textNode.textContent;
    const ltext = text.toLowerCase();
    if (!ltext.includes(lower)) return;
    const frag = document.createDocumentFragment();
    let last = 0, idx;
    while ((idx = ltext.indexOf(lower, last)) !== -1) {
      if (idx > last) frag.appendChild(document.createTextNode(text.slice(last, idx)));
      const mark = document.createElement('mark');
      mark.className = 'search-hl';
      mark.textContent = text.slice(idx, idx + term.length);
      frag.appendChild(mark);
      marks.push(mark);
      last = idx + term.length;
    }
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    textNode.parentNode.replaceChild(frag, textNode);
  });
  return marks;
}

function scrollToMark(idx) {
  if (idx < 0 || idx >= _searchMarks.length) return;
  _searchMarks.forEach((m, i) => m.classList.toggle('active', i === idx));
  _searchMarks[idx].scrollIntoView({ behavior: 'smooth', block: 'center' });
  updateSearchCounter(idx + 1, _searchMarks.length);
}

function searchNext() {
  if (!_searchMarks.length) return;
  _searchIdx = (_searchIdx + 1) % _searchMarks.length;
  scrollToMark(_searchIdx);
}

function searchPrev() {
  if (!_searchMarks.length) return;
  _searchIdx = (_searchIdx - 1 + _searchMarks.length) % _searchMarks.length;
  scrollToMark(_searchIdx);
}

function updateSearchCounter(cur, total) {
  const el = document.getElementById('search-counter');
  if (el) el.textContent = total === 0 ? (document.getElementById('search-input')?.value.trim() ? 'No results' : '') : `${cur} / ${total}`;
}

function handleSearchKey(e) {
  if (e.key === 'Enter') { e.preventDefault(); e.shiftKey ? searchPrev() : searchNext(); }
  if (e.key === 'Escape') { e.stopPropagation(); closeSearch(); }
}

// ── Keyboard shortcuts modal ──────────────────────────────────

function openShortcuts() {
  const el = document.getElementById('shortcuts-overlay');
  if (el) el.removeAttribute('hidden');
}

function closeShortcuts() {
  const el = document.getElementById('shortcuts-overlay');
  if (el) el.setAttribute('hidden', '');
}

// ── Chronological timeline ────────────────────────────────────

function parseTimelineYear(str) {
  if (!str) return null;
  const s = str.replace(/c\.\s*/gi, '').trim();
  const bce = /\bbc[e]?\b/i.test(s);
  const match = s.replace(/,/g, '').match(/\d+/);
  if (!match) return null;
  return bce ? -parseInt(match[0]) : parseInt(match[0]);
}

let _timelineFilter = null; // Set of visible chapter indices

function openTimeline() {
  closeSidebar();
  showPage('timeline');
  progressBar.classList.remove('active');
  buildTimeline();
  window.scrollTo(0, 0);
}

function buildTimeline() {
  const container = document.getElementById('timeline-content');

  const events = [];
  chapters.forEach((ch, ci) => {
    ch.sections.forEach(sec => {
      (sec.dates || []).forEach(([yr, ev]) => {
        const parsed = parseTimelineYear(yr);
        if (parsed !== null) events.push({ year: parsed, yearStr: yr, event: ev, ch, ci });
      });
    });
  });

  if (!events.length) {
    container.innerHTML = '<p style="padding:3rem;text-align:center;font-family:var(--mono);color:var(--light)">No date data found in chapters.</p>';
    return;
  }

  events.sort((a, b) => a.year - b.year);
  _timelineFilter = new Set(chapters.map((_, i) => i));

  let html = `<div class="tl-inner">
    <div class="tl-header">
      <div class="tl-eyebrow">All Eras</div>
      <h1 class="tl-title">Chronological <em>Timeline</em></h1>
      <p class="tl-sub">${events.length} key dates across all ten chapters</p>
    </div>
    <div class="tl-filters" id="tl-filters">
      <span class="tl-filter-label">Filter</span>`;

  chapters.forEach((ch, ci) => {
    html += `<button class="tl-filter-btn active" data-ci="${ci}" style="--ch-color:${CH_COLORS[ci]}" onclick="toggleTlChapter(${ci}, this)">Ch.${ch.num}</button>`;
  });

  html += `<button class="tl-filter-btn tl-all-btn" onclick="tlSelectAll(true)">All</button>
           <button class="tl-filter-btn tl-all-btn" onclick="tlSelectAll(false)">None</button>
    </div>
    <div class="tl-count" id="tl-count">${events.length} events</div>
    <div class="tl-list" id="tl-list">`;

  events.forEach(ev => {
    html += `<div class="tl-item" data-ci="${ev.ci}" data-year="${ev.year}">
      <div class="tl-year-col"><span class="tl-year">${ev.yearStr}</span></div>
      <div class="tl-track">
        <div class="tl-dot" style="background:${CH_COLORS[ev.ci]};border-color:${CH_COLORS[ev.ci]}"></div>
        <div class="tl-line"></div>
      </div>
      <div class="tl-event-col">
        <div class="tl-event">${ev.event}</div>
        <button class="tl-ch-badge" style="color:${CH_COLORS[ev.ci]};border-color:${CH_COLORS[ev.ci]}" onclick="openChapter(${ev.ci})">Ch.${ev.ch.num} · ${ev.ch.name} →</button>
      </div>
    </div>`;
  });

  html += `</div></div>`;
  container.innerHTML = html;
}

function toggleTlChapter(ci, btn) {
  btn.classList.toggle('active');
  if (btn.classList.contains('active')) _timelineFilter.add(ci);
  else _timelineFilter.delete(ci);
  updateTlVisibility();
}

function tlSelectAll(state) {
  document.querySelectorAll('.tl-filter-btn[data-ci]').forEach(btn => {
    const ci = parseInt(btn.dataset.ci);
    btn.classList.toggle('active', state);
    if (state) _timelineFilter.add(ci); else _timelineFilter.delete(ci);
  });
  updateTlVisibility();
}

function updateTlVisibility() {
  let visible = 0;
  document.querySelectorAll('#tl-list .tl-item').forEach(item => {
    const show = _timelineFilter.has(parseInt(item.dataset.ci));
    item.style.display = show ? '' : 'none';
    if (show) visible++;
  });
  const count = document.getElementById('tl-count');
  if (count) count.textContent = `${visible} events`;
}

// ── Home page ─────────────────────────────────────────────────

function buildHome() {
  const grid = document.getElementById('chapter-cards');
  grid.innerHTML = '';
  chapters.forEach((ch, i) => {
    const done = completed.has(i);
    const mins = estimateReadTime(ch);
    const bm = loadBookmark(i);
    const hasBm = bm > 0 && !done;
    const card = document.createElement('div');
    card.className = 'chapter-card fade-in';
    card.innerHTML = `
      <div class="card-num">Chapter ${ch.num}</div>
      <div class="card-jp">${ch.jp}</div>
      <div class="card-meta">
        <span class="card-years">${ch.years}</span>
        <span class="card-readtime">~${mins} min</span>
      </div>
      <div class="card-name">${ch.name}</div>
      <p class="card-summary">${ch.intro.substring(0, 120)}...</p>
      <div class="card-progress"><div class="card-progress-fill" style="width:${done ? 100 : 0}%"></div></div>
      <div class="card-footer">
        <div class="card-status">${done ? '✓ Complete' : hasBm ? '↩ In progress' : 'Not started'}</div>
        ${hasBm ? `<button class="card-resume-btn" onclick="event.stopPropagation();resumeChapter(${i})">Resume →</button>` : ''}
      </div>
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
  const mins = estimateReadTime(ch);
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
      <div class="ch-readtime" aria-label="Estimated read time">~${mins} min read · ${ch.sections.length} sections · ${ch.terms.length} terms</div>
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
      <div class="flashcard" id="fc-card" onclick="flipCard()" tabindex="0" role="button" aria-label="Flashcard — press Enter or Space to flip">
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
    <div class="quiz-progress-dots" id="quiz-dots-${idx}" role="tablist" aria-label="Quiz questions">`;

  ch.quiz.forEach((q, qi) => {
    const answered = qr[qi] !== undefined;
    const isCorrect = answered && qr[qi] === q.ans;
    html += `<button class="quiz-dot${answered ? (isCorrect ? ' correct' : ' wrong') : ''}${qi === currentQ ? ' active' : ''}" onclick="showQuizQ(${idx},${qi})" title="Question ${qi + 1}" aria-label="Question ${qi + 1}${answered ? (isCorrect ? ', correct' : ', incorrect') : ''}"></button>`;
  });

  html += `</div>`;

  ch.quiz.forEach((q, qi) => {
    const answered = qr[qi] !== undefined;
    const isCorrect = answered && qr[qi] === q.ans;
    html += `<div class="quiz-q-block" id="qblock-${idx}-${qi}"${qi !== currentQ ? ' style="display:none"' : ''}>
      <div class="quiz-q-num">Question ${qi + 1} of ${ch.quiz.length}</div>
      <p class="quiz-q-text">${q.q}</p>
      <div class="quiz-opts" role="group" aria-label="Answer options">`;
    q.opts.forEach((opt, oi) => {
      let cls = 'quiz-opt';
      if (answered) { cls += oi === q.ans ? ' correct' : (oi === qr[qi] && qr[qi] !== q.ans ? ' wrong' : ''); }
      html += `<button class="${cls}" ${answered ? 'disabled' : ''} onclick="answerQ(${idx},${qi},${oi})">${opt}</button>`;
    });
    html += `</div>
      <div class="quiz-explanation ${answered ? 'show ' + (isCorrect ? 'correct' : 'wrong') : ''}" id="qexp-${idx}-${qi}" role="status" aria-live="polite">
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
  observeSections(idx);
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
  if (dots[qi]) {
    dots[qi].classList.add(correct ? 'correct' : 'wrong');
    dots[qi].setAttribute('aria-label', `Question ${qi + 1}, ${correct ? 'correct' : 'incorrect'}`);
  }
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
  if (prev !== qi) document.getElementById(`qblock-${ci}-${prev}`).style.display = 'none';
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
  card.setAttribute('aria-label', `Flashcard ${fc.index + 1} of ${fc.deck.length}: ${fc.deck[fc.index][0]} — press Enter or Space to flip`);
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
  if (!count) container.innerHTML = '<p class="glossary-empty">No terms match your search.</p>';
}

function filterGlossary() {
  buildGlossary(document.getElementById('glossary-search').value);
}

// ── Progress Dashboard ────────────────────────────────────────

function openDashboard() {
  closeSidebar();
  showPage('dashboard');
  progressBar.classList.remove('active');
  buildDashboard();
  window.scrollTo(0, 0);
}

function buildDashboard() {
  const container = document.getElementById('dashboard-content');
  const rows = chapters.map((ch, i) => {
    const qr = quizResults[i] || {};
    const quizDone = Object.keys(qr).length === ch.quiz.length;
    const correct = quizDone ? Object.entries(qr).filter(([qi, oi]) => parseInt(oi) === ch.quiz[qi].ans).length : null;
    const pct = quizDone ? correct / ch.quiz.length : null;
    return { ch, i, quizDone, correct, total: ch.quiz.length, pct, mins: estimateReadTime(ch) };
  });

  const quizzedRows = rows.filter(r => r.quizDone);
  const avgPct = quizzedRows.length ? quizzedRows.reduce((s, r) => s + r.pct, 0) / quizzedRows.length : null;
  const weakest = quizzedRows.length ? quizzedRows.reduce((a, b) => a.pct <= b.pct ? a : b) : null;

  let html = `<div class="dashboard-inner">
    <div class="dashboard-header">
      <div class="dashboard-eyebrow">Study Progress</div>
      <h1 class="dashboard-title">Progress <em>Dashboard</em></h1>
    </div>
    <div class="dashboard-stats">
      <div class="dash-stat"><div class="dash-stat-val">${completed.size}/${chapters.length}</div><div class="dash-stat-label">Chapters Complete</div></div>
      <div class="dash-stat"><div class="dash-stat-val">${avgPct !== null ? Math.round(avgPct * 100) + '%' : '—'}</div><div class="dash-stat-label">Average Quiz Score</div></div>
      <div class="dash-stat"><div class="dash-stat-val">${quizzedRows.length}/${chapters.length}</div><div class="dash-stat-label">Quizzes Taken</div></div>
    </div>`;

  if (weakest) {
    html += `<div class="dash-weak">
      <span class="dash-weak-label">Weakest topic</span>
      <span class="dash-weak-name">${weakest.ch.name}</span>
      <span class="dash-weak-score">${weakest.correct}/${weakest.total} (${Math.round(weakest.pct * 100)}%)</span>
      <button class="dash-weak-btn" onclick="openChapter(${weakest.i})">Review →</button>
    </div>`;
  }

  html += `<div class="dash-chapters-label">Chapter Breakdown</div><div class="dash-chapters">`;
  rows.forEach(r => {
    const status = completed.has(r.i) ? 'complete' : loadBookmark(r.i) > 0 ? 'progress' : 'unread';
    const scoreClass = r.quizDone ? (r.pct >= 0.8 ? 'high' : r.pct >= 0.6 ? 'mid' : 'low') : '';
    html += `<div class="dash-ch-row">
      <div class="dash-ch-num">${r.ch.num}</div>
      <div class="dash-ch-info"><div class="dash-ch-name">${r.ch.name}</div><div class="dash-ch-meta">${r.ch.years} · ~${r.mins} min</div></div>
      <div class="dash-ch-score ${scoreClass}">${r.quizDone ? `${r.correct}/${r.total}` : '—'}</div>
      <div class="dash-ch-status ${status}">${status === 'complete' ? '✓' : status === 'progress' ? '↩' : '○'}</div>
      <button class="dash-ch-btn" onclick="${status === 'progress' ? `resumeChapter(${r.i})` : `openChapter(${r.i})`}">${status === 'complete' ? 'Review' : status === 'progress' ? 'Resume' : 'Start'}</button>
    </div>`;
  });

  html += `</div><div class="dash-actions"><button class="btn" onclick="resetProgress()">Reset All Progress</button></div></div>`;
  container.innerHTML = html;
}

function resetProgress() {
  if (!confirm('Reset all quiz results, completion status, and bookmarks? This cannot be undone.')) return;
  completed.clear();
  Object.keys(quizResults).forEach(k => delete quizResults[k]);
  Object.keys(quizNav).forEach(k => delete quizNav[k]);
  for (let i = 0; i < chapters.length; i++) {
    try { localStorage.removeItem('jh-bm-' + i); } catch(e) {}
  }
  saveProgress();
  buildDashboard();
}

// ── Navigation ────────────────────────────────────────────────

function openChapter(idx) {
  resetSearch();
  currentChapter = idx;
  closeSidebar();
  showPage('reader');
  progressBar.classList.add('active');
  progressBar.style.width = '0%';
  buildSidebar();
  renderChapter(idx);
}

function resumeChapter(idx) {
  openChapter(idx);
  const bm = loadBookmark(idx);
  if (bm > 0) {
    setTimeout(() => {
      const el = document.getElementById(`ch-sec-${idx}-${bm}`);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 200);
  }
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

// ── Mock Exam ─────────────────────────────────────────────────

let examQuestions = [];
let examCurrentQ = 0;
let examAnswers = {};
let examSelectedCount = 10;

function openExam() {
  closeSidebar();
  showPage('exam');
  progressBar.classList.remove('active');
  buildExamSetup();
  window.scrollTo(0, 0);
}

function buildExamSetup() {
  examSelectedCount = 10;
  document.querySelectorAll('.q-count-btn[data-n]').forEach(b => {
    b.classList.toggle('sel', b.dataset.n === '10');
  });
  const grid = document.getElementById('exam-chapter-filter');
  grid.innerHTML = '';
  chapters.forEach((ch, i) => {
    const label = document.createElement('label');
    label.className = 'ch-filter-label';
    label.innerHTML = `
      <input type="checkbox" data-ci="${i}" checked onchange="updateExamFilterSummary()">
      <span class="ch-filter-num">Ch. ${ch.num}</span>
      <span>${ch.name}</span>
    `;
    grid.appendChild(label);
  });
  updateExamFilterSummary();
  showExamScreen('exam-setup');
}

function examSelectCount(btn) {
  document.querySelectorAll('.q-count-btn[data-n]').forEach(b => b.classList.remove('sel'));
  btn.classList.add('sel');
  examSelectedCount = btn.dataset.n === 'all' ? 'all' : parseInt(btn.dataset.n);
}

function examSelectAllChapters(state) {
  document.querySelectorAll('#exam-chapter-filter input').forEach(cb => cb.checked = state);
  updateExamFilterSummary();
}

function updateExamFilterSummary() {
  const boxes = [...document.querySelectorAll('#exam-chapter-filter input')];
  const n = boxes.filter(b => b.checked).length;
  document.getElementById('exam-filter-summary').textContent =
    n === chapters.length ? `All ${chapters.length} chapters included` : `${n} of ${chapters.length} chapters included`;
}

function getExamChapterFilter() {
  const boxes = [...document.querySelectorAll('#exam-chapter-filter input')];
  if (!boxes.length) return null;
  const checked = boxes.filter(b => b.checked).map(b => parseInt(b.dataset.ci));
  return checked.length === chapters.length ? null : checked;
}

function startExam() {
  const filter = getExamChapterFilter();
  let pool = [];
  chapters.forEach((ch, ci) => {
    if (filter && !filter.includes(ci)) return;
    ch.quiz.forEach(q => pool.push({ ...q, ci, chName: ch.name, chNum: ch.num }));
  });
  if (!pool.length) { alert('No questions available for the selected chapters.'); return; }
  pool = pool.sort(() => Math.random() - 0.5);
  const n = examSelectedCount === 'all' ? pool.length : Math.min(examSelectedCount, pool.length);
  examQuestions = pool.slice(0, n);
  examCurrentQ = 0;
  examAnswers = {};
  showExamScreen('exam-quiz');
  renderExamQ();
}

function showExamScreen(id) {
  document.querySelectorAll('.exam-screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
  window.scrollTo(0, 0);
}

function renderExamQ() {
  const q = examQuestions[examCurrentQ];
  const answered = examAnswers[examCurrentQ] !== undefined;
  const correctSoFar = Object.entries(examAnswers)
    .filter(([qi, oi]) => parseInt(oi) === examQuestions[qi].ans).length;

  document.getElementById('exam-q-num').textContent = `Question ${examCurrentQ + 1} of ${examQuestions.length}`;
  document.getElementById('exam-prog-fill').style.width = ((examCurrentQ + 1) / examQuestions.length * 100) + '%';
  document.getElementById('exam-score-live').textContent = `${correctSoFar} correct`;
  document.getElementById('exam-ch-badge').textContent = `Ch. ${q.chNum} — ${q.chName}`;
  document.getElementById('exam-q-text').textContent = q.q;

  const optsDiv = document.getElementById('exam-opts');
  optsDiv.innerHTML = '';
  q.opts.forEach((opt, oi) => {
    const btn = document.createElement('button');
    btn.className = 'quiz-opt';
    btn.textContent = opt;
    if (answered) {
      btn.disabled = true;
      if (oi === q.ans) btn.classList.add('correct');
      else if (oi === examAnswers[examCurrentQ]) btn.classList.add('wrong');
    } else {
      btn.onclick = () => answerExamQ(oi);
    }
    optsDiv.appendChild(btn);
  });

  const exp = document.getElementById('exam-explanation');
  if (answered) {
    const ok = examAnswers[examCurrentQ] === q.ans;
    exp.textContent = (ok ? '✓ Correct. ' : '✗ Incorrect. ') + q.exp;
    exp.className = 'quiz-explanation show ' + (ok ? 'correct' : 'wrong');
  } else {
    exp.textContent = '';
    exp.className = 'quiz-explanation';
  }

  const nextBtn = document.getElementById('exam-next-btn');
  nextBtn.style.display = answered ? '' : 'none';
  nextBtn.textContent = examCurrentQ === examQuestions.length - 1 ? 'See Results →' : 'Next →';
}

function answerExamQ(oi) {
  if (examAnswers[examCurrentQ] !== undefined) return;
  examAnswers[examCurrentQ] = oi;
  renderExamQ();
}

function nextExamQ() {
  if (examAnswers[examCurrentQ] === undefined) return;
  if (examCurrentQ === examQuestions.length - 1) {
    showExamResults();
  } else {
    examCurrentQ++;
    renderExamQ();
  }
}

function showExamResults() {
  showExamScreen('exam-results');
  const total = examQuestions.length;
  const correct = Object.entries(examAnswers)
    .filter(([qi, oi]) => parseInt(oi) === examQuestions[qi].ans).length;
  const pct = correct / total;

  document.getElementById('exam-score-big').textContent = `${correct}/${total}`;
  document.getElementById('exam-score-pct').textContent = Math.round(pct * 100) + '%';

  let msg = 'More review needed — return to the relevant chapters before trying again.';
  if (pct === 1) msg = 'Perfect score — outstanding command of Japanese history across all eras.';
  else if (pct >= 0.85) msg = 'Excellent. A few targeted reviews and you\'ll be ready for exam day.';
  else if (pct >= 0.7) msg = 'Strong foundation. Focus on the chapters where you dropped points.';
  else if (pct >= 0.5) msg = 'Good start — re-read sections covering your missed questions.';
  document.getElementById('exam-results-msg').textContent = msg;

  const byChapter = {};
  examQuestions.forEach((q, qi) => {
    if (!byChapter[q.ci]) byChapter[q.ci] = { chName: q.chName, chNum: q.chNum, correct: 0, total: 0 };
    byChapter[q.ci].total++;
    if (examAnswers[qi] === q.ans) byChapter[q.ci].correct++;
  });

  const breakdownDiv = document.getElementById('exam-breakdown-rows');
  breakdownDiv.innerHTML = '';
  Object.entries(byChapter).sort(([a], [b]) => +a - +b).forEach(([, d]) => {
    const p = d.correct / d.total;
    const color = p >= 0.8 ? '#2d6a4f' : p >= 0.6 ? 'var(--gold)' : 'var(--red)';
    const row = document.createElement('div');
    row.className = 'breakdown-row';
    row.innerHTML = `
      <span class="breakdown-name">Ch.${d.chNum} — ${d.chName}</span>
      <div class="breakdown-bar-wrap"><div class="breakdown-bar" style="width:${Math.round(p*100)}%;background:${color}"></div></div>
      <span class="breakdown-score">${d.correct}/${d.total}</span>
    `;
    breakdownDiv.appendChild(row);
  });

  const missed = examQuestions.map((q, qi) => ({ q, qi })).filter(({ q, qi }) => examAnswers[qi] !== q.ans);
  const missedSection = document.getElementById('exam-missed-section');
  const missedDiv = document.getElementById('exam-missed-items');
  if (!missed.length) {
    missedSection.style.display = 'none';
  } else {
    missedSection.style.display = 'block';
    missedDiv.innerHTML = '';
    missed.forEach(({ q }) => {
      const el = document.createElement('div');
      el.className = 'missed-item';
      el.innerHTML = `
        <div class="missed-q">${q.q}</div>
        <div class="missed-correct">✓ ${q.opts[q.ans]}</div>
        <div class="missed-exp">${q.exp}</div>
      `;
      missedDiv.appendChild(el);
    });
  }
}

function goExamSetup() {
  examCurrentQ = 0;
  examAnswers = {};
  showExamScreen('exam-setup');
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
