import { loadState, saveState, exportStateAsFile, parseImportedState } from './storage.js';
import { generateId } from './id.js';
import { initWordStats, applyAnswer, isDue, MAX_BOX } from './leitner.js';
import { runOcrOnFile, parseOcrTextToCandidates } from './ocr.js';

let state = loadState();

let activeTab = 'home';
let activeWeekId = null;

let photoSession = null; // { status, progress, error, weekId, candidates: [{en, tr, checked}] }
let cardsConfig = { scope: 'all', dueOnly: true };
let cardsSession = null; // { items: [{weekId, wordId}], index, revealed }
let quizConfig = { scope: 'all', mode: 'mc', direction: 'en-tr' };
let quizSession = null; // { items, index, score, wrong: [{weekId,wordId}], finished, answered, lastResult, options, selected }

const appEl = document.getElementById('app');
const toastEl = document.getElementById('toast');

function persist() {
  saveState(state);
}

function todayISO() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function logPractice() {
  const d = todayISO();
  if (!state.practiceLog.includes(d)) {
    state.practiceLog.push(d);
    persist();
  }
}

function computeStreak() {
  const set = new Set(state.practiceLog);
  let streak = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  // If nothing practiced today yet, streak still counts prior consecutive days.
  if (!set.has(todayISO())) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (set.has(cursor.toISOString().slice(0, 10))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function formatDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function findWeek(weekId) {
  return state.weeks.find((w) => w.id === weekId) || null;
}

function findWordEntry(weekId, wordId) {
  const week = findWeek(weekId);
  if (!week) return null;
  const word = week.words.find((w) => w.id === wordId);
  if (!word) return null;
  return { week, word };
}

function allWordEntries() {
  return state.weeks.flatMap((week) => week.words.map((word) => ({ week, word })));
}

function scopeEntries(scope) {
  if (scope === 'all') return allWordEntries();
  const week = findWeek(scope);
  return week ? week.words.map((word) => ({ week, word })) : [];
}

function acceptableAnswers(text) {
  return String(text || '')
    .split(/[/,;]/)
    .map((s) => s.trim().toLocaleLowerCase('tr'))
    .filter(Boolean);
}

function toast(message) {
  toastEl.textContent = message;
  toastEl.hidden = false;
  toastEl.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => {
    toastEl.classList.remove('show');
    toastEl.hidden = true;
  }, 2200);
}

// ---------- Rendering ----------

function render() {
  switch (activeTab) {
    case 'weeks':
      appEl.innerHTML = activeWeekId ? renderWeekDetail() : renderWeeksList();
      break;
    case 'cards':
      appEl.innerHTML = renderFlashcards();
      break;
    case 'quiz':
      appEl.innerHTML = renderQuiz();
      break;
    default:
      appEl.innerHTML = renderHome();
  }
  document.querySelectorAll('.bottom-nav button').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tab === activeTab);
  });
}

function renderHome() {
  const totalWords = state.weeks.reduce((sum, w) => sum + w.words.length, 0);
  const dueCount = allWordEntries().filter((e) => isDue(e.word)).length;
  const streak = computeStreak();
  const lastWeeks = [...state.weeks].slice(-3).reverse();
  const lastQuizzes = [...state.quizHistory].slice(-5).reverse();

  return `
  <section class="view home-view">
    <div class="hero">
      <h1>Merhaba Melis! 👋</h1>
      <p>Bu hafta öğrendiğin kelimeleri tekrar etmeye ne dersin?</p>
    </div>

    <div class="stat-grid">
      <div class="stat-card"><span class="stat-num">${state.weeks.length}</span><span class="stat-label">Hafta</span></div>
      <div class="stat-card"><span class="stat-num">${totalWords}</span><span class="stat-label">Kelime</span></div>
      <div class="stat-card"><span class="stat-num">${streak}</span><span class="stat-label">Günlük Seri 🔥</span></div>
    </div>

    ${dueCount > 0 ? `
      <button class="cta-btn" data-action="home:review-due">
        🔁 Tekrar zamanı gelen ${dueCount} kelime var, çalışalım!
      </button>` : `
      <p class="empty-hint">Şu an tekrar bekleyen kelime yok, harikasın! 🎉</p>`}

    <h2>Haftalar</h2>
    ${lastWeeks.length === 0 ? `
      <p class="empty-hint">Henüz hafta eklenmedi. <br><strong>Haftalar</strong> sekmesinden ilk haftanı oluştur.</p>
    ` : `
      <div class="card-list">
        ${lastWeeks.map((w) => `
          <button class="week-summary" data-action="home:open-week" data-id="${w.id}">
            <span class="week-summary-title">${escapeHtml(w.title)}</span>
            <span class="week-summary-count">${w.words.length} kelime</span>
          </button>
        `).join('')}
      </div>
    `}

    <h2>Son Sınavlar</h2>
    ${lastQuizzes.length === 0 ? `
      <p class="empty-hint">Henüz sınav yapılmadı.</p>
    ` : `
      <div class="card-list">
        ${lastQuizzes.map((q) => `
          <div class="quiz-history-row">
            <div>
              <strong>${escapeHtml(q.weekTitle)}</strong>
              <span class="muted"> · ${formatDate(q.date)}</span>
            </div>
            <span class="score-badge ${q.correct / q.total >= 0.7 ? 'good' : 'warn'}">${q.correct}/${q.total}</span>
          </div>
        `).join('')}
      </div>
    `}
  </section>`;
}

function renderWeeksList() {
  return `
  <section class="view">
    <h1>Haftalar</h1>
    <p class="muted">Hocanın her hafta verdiği kelimeleri buraya haftalara göre ekle.</p>

    <form class="inline-form" data-action="week:create">
      <input type="text" name="title" placeholder="Örn: 5. Hafta - Meyveler" required>
      <button type="submit">+ Yeni Hafta</button>
    </form>

    ${state.weeks.length === 0 ? `
      <p class="empty-hint">Henüz hafta yok. Yukarıdan ilk haftanı ekle.</p>
    ` : `
      <div class="card-list">
        ${[...state.weeks].reverse().map((w) => `
          <div class="week-row">
            <button class="week-row-main" data-action="week:open" data-id="${w.id}">
              <span class="week-row-title">${escapeHtml(w.title)}</span>
              <span class="week-row-meta">${w.words.length} kelime · ${formatDate(w.createdAt)}</span>
            </button>
            <button class="icon-btn danger" data-action="week:delete" data-id="${w.id}" title="Haftayı sil">🗑️</button>
          </div>
        `).join('')}
      </div>
    `}
  </section>`;
}

function renderWeekDetail() {
  const week = findWeek(activeWeekId);
  if (!week) {
    activeWeekId = null;
    return renderWeeksList();
  }

  return `
  <section class="view">
    <button class="back-btn" data-action="week:back">← Haftalar</button>
    <div class="week-title-row">
      <h1>${escapeHtml(week.title)}</h1>
      <button class="icon-btn" data-action="week:rename" data-id="${week.id}" title="Adını değiştir">✏️</button>
    </div>

    <div class="add-word-box">
      <form class="inline-form" data-action="word:add-manual" data-id="${week.id}">
        <input type="text" name="en" placeholder="İngilizce kelime" required>
        <input type="text" name="tr" placeholder="Türkçe anlamı" required>
        <button type="submit">+ Ekle</button>
      </form>
      <label class="photo-btn">
        📷 Fotoğraftan Kelime Bul
        <input type="file" accept="image/*" capture="environment" data-action="photo:file" data-id="${week.id}" hidden>
      </label>
    </div>

    ${renderPhotoSession()}

    ${week.words.length === 0 ? `
      <p class="empty-hint">Bu haftaya henüz kelime eklenmedi.</p>
    ` : `
      <div class="word-table">
        ${week.words.map((word) => `
          <div class="word-row">
            <div class="word-main">
              <span class="word-en">${escapeHtml(word.en)}</span>
              <span class="word-tr">${escapeHtml(word.tr)}</span>
            </div>
            <div class="word-box-indicator" title="Tekrar seviyesi">${'★'.repeat(word.box || 1)}${'☆'.repeat(MAX_BOX - (word.box || 1))}</div>
            <div class="word-actions">
              <button class="icon-btn" data-action="word:edit" data-week="${week.id}" data-id="${word.id}" title="Düzenle">✏️</button>
              <button class="icon-btn danger" data-action="word:delete" data-week="${week.id}" data-id="${word.id}" title="Sil">🗑️</button>
            </div>
          </div>
        `).join('')}
      </div>
    `}
  </section>`;
}

function renderPhotoSession() {
  if (!photoSession) return '';

  if (photoSession.status === 'scanning') {
    return `
    <div class="photo-panel">
      <p>📷 Fotoğraftaki kelimeler okunuyor… %${photoSession.progress || 0}</p>
      <div class="progress-bar"><div class="progress-fill" style="width:${photoSession.progress || 0}%"></div></div>
    </div>`;
  }

  if (photoSession.status === 'error') {
    return `
    <div class="photo-panel error">
      <p>⚠️ ${escapeHtml(photoSession.error)}</p>
      <button data-action="photo:cancel">Kapat</button>
    </div>`;
  }

  if (photoSession.status === 'review') {
    const candidates = photoSession.candidates;
    return `
    <div class="photo-panel">
      <p><strong>${candidates.length}</strong> aday kelime bulundu. Eklemek istediklerini seç, gerekirse düzelt:</p>
      ${candidates.length === 0 ? `<p class="empty-hint">Kelime bulunamadı, daha net bir fotoğraf dene.</p>` : `
      <div class="candidate-list">
        ${candidates.map((c, i) => `
          <div class="candidate-row ${c.checked ? 'checked' : ''}">
            <input type="checkbox" data-action="photo:toggle" data-idx="${i}" ${c.checked ? 'checked' : ''}>
            <input type="text" class="candidate-en" data-action="photo:edit-en" data-idx="${i}" value="${escapeHtml(c.en)}" placeholder="İngilizce">
            <input type="text" class="candidate-tr" data-action="photo:edit-tr" data-idx="${i}" value="${escapeHtml(c.tr)}" placeholder="Türkçe">
          </div>
        `).join('')}
      </div>`}
      <div class="photo-actions">
        <button class="primary" data-action="photo:add-selected">Seçilenleri Ekle</button>
        <button data-action="photo:cancel">Vazgeç</button>
      </div>
    </div>`;
  }

  return '';
}

function renderFlashcards() {
  if (cardsSession) {
    if (cardsSession.index >= cardsSession.items.length) {
      return `
      <section class="view cards-view">
        <h1>Harika iş! 🎉</h1>
        <p>${cardsSession.items.length} kelimeyi tekrar ettin.</p>
        <div class="result-actions">
          <button class="primary" data-action="cards:restart">Tekrar Başlat</button>
          <button data-action="cards:exit">Bitir</button>
        </div>
      </section>`;
    }

    const item = cardsSession.items[cardsSession.index];
    const entry = findWordEntry(item.weekId, item.wordId);
    if (!entry) {
      cardsSession.index += 1;
      return renderFlashcards();
    }
    const { word, week } = entry;

    return `
    <section class="view cards-view">
      <div class="cards-progress">${cardsSession.index + 1} / ${cardsSession.items.length} · ${escapeHtml(week.title)}</div>
      <div class="flashcard ${cardsSession.revealed ? 'flipped' : ''}" data-action="cards:flip">
        <div class="flashcard-face front">${escapeHtml(word.en)}</div>
        <div class="flashcard-face back">${escapeHtml(word.tr)}</div>
      </div>
      ${!cardsSession.revealed ? `
        <p class="hint">Anlamını görmek için karta dokun</p>
      ` : `
        <div class="know-actions">
          <button class="again-btn" data-action="cards:mark" data-result="again">🔁 Tekrar Edeyim</button>
          <button class="know-btn" data-action="cards:mark" data-result="know">✅ Biliyorum</button>
        </div>
      `}
      <button class="text-btn" data-action="cards:exit">Çalışmayı Bitir</button>
    </section>`;
  }

  const dueCount = allWordEntries().filter((e) => isDue(e.word)).length;

  return `
  <section class="view">
    <h1>Kartlarla Çalış</h1>
    <form class="config-form" data-action="cards:start">
      <label>Hangi hafta?
        <select name="scope">
          <option value="all" ${cardsConfig.scope === 'all' ? 'selected' : ''}>Tüm haftalar</option>
          ${state.weeks.map((w) => `<option value="${w.id}" ${cardsConfig.scope === w.id ? 'selected' : ''}>${escapeHtml(w.title)}</option>`).join('')}
        </select>
      </label>
      <label class="checkbox-label">
        <input type="checkbox" name="dueOnly" ${cardsConfig.dueOnly ? 'checked' : ''}>
        Sadece tekrar zamanı gelenler (${dueCount})
      </label>
      <button type="submit" class="primary">Başla</button>
    </form>
  </section>`;
}

function buildQuizQuestion(entry, direction, mode) {
  const { word } = entry;
  const promptText = direction === 'en-tr' ? word.en : word.tr;
  const correctText = direction === 'en-tr' ? word.tr : word.en;

  const question = { weekId: entry.week.id, wordId: word.id, promptText, correctText, direction };

  if (mode === 'mc') {
    const pool = allWordEntries().filter((e) => e.word.id !== word.id);
    const shuffledPool = pool.sort(() => Math.random() - 0.5);
    const distractorTexts = [];
    const seen = new Set(acceptableAnswers(correctText));
    for (const e of shuffledPool) {
      const text = direction === 'en-tr' ? e.word.tr : e.word.en;
      const key = String(text).trim().toLocaleLowerCase('tr');
      if (!text || seen.has(key)) continue;
      seen.add(key);
      distractorTexts.push(text);
      if (distractorTexts.length >= 3) break;
    }
    const options = [correctText, ...distractorTexts].sort(() => Math.random() - 0.5);
    question.options = options;
    question.correctIndex = options.indexOf(correctText);
  }

  return question;
}

function renderQuiz() {
  if (quizSession) {
    if (quizSession.finished) {
      const wrongEntries = quizSession.wrong.map((w) => findWordEntry(w.weekId, w.wordId)).filter(Boolean);
      return `
      <section class="view">
        <h1>Sınav Bitti! 📝</h1>
        <p class="score-line">Skorun: <strong>${quizSession.score} / ${quizSession.items.length}</strong></p>
        ${wrongEntries.length > 0 ? `
          <h2>Tekrar bakmalısın:</h2>
          <div class="word-table">
            ${wrongEntries.map(({ word }) => `
              <div class="word-row">
                <div class="word-main">
                  <span class="word-en">${escapeHtml(word.en)}</span>
                  <span class="word-tr">${escapeHtml(word.tr)}</span>
                </div>
              </div>
            `).join('')}
          </div>
        ` : `<p class="empty-hint">Tebrikler, hiç yanlışın yok! 🌟</p>`}
        <div class="result-actions">
          <button class="primary" data-action="quiz:close">Tamam</button>
        </div>
      </section>`;
    }

    const q = quizSession.items[quizSession.index];
    const promptLabel = q.direction === 'en-tr' ? 'İngilizce → Türkçe' : 'Türkçe → İngilizce';

    return `
    <section class="view">
      <div class="cards-progress">${quizSession.index + 1} / ${quizSession.items.length} · ${promptLabel}</div>
      <div class="quiz-prompt">${escapeHtml(q.promptText)}</div>

      ${!quizSession.answered ? (
        q.options ? `
        <div class="quiz-options">
          ${q.options.map((opt, i) => `
            <button class="quiz-option" data-action="quiz:answer" data-option="${i}">${escapeHtml(opt)}</button>
          `).join('')}
        </div>` : `
        <form class="config-form" data-action="quiz:submit-typed">
          <input type="text" name="answer" placeholder="Cevabını yaz" autocomplete="off" autofocus required>
          <button type="submit" class="primary">Kontrol Et</button>
        </form>`
      ) : `
        <div class="quiz-feedback ${quizSession.lastResult ? 'correct' : 'wrong'}">
          ${quizSession.lastResult ? '✅ Doğru!' : `❌ Doğru cevap: ${escapeHtml(q.correctText)}`}
        </div>
        <button class="primary" data-action="quiz:next">${quizSession.index + 1 >= quizSession.items.length ? 'Bitir' : 'Sonraki'}</button>
      `}
    </section>`;
  }

  return `
  <section class="view">
    <h1>Sınav Ol</h1>
    <p class="muted">Hocanın soracağı gibi kendini test et.</p>
    <form class="config-form" data-action="quiz:start">
      <label>Hangi hafta?
        <select name="scope">
          <option value="all" ${quizConfig.scope === 'all' ? 'selected' : ''}>Tüm haftalar</option>
          ${state.weeks.map((w) => `<option value="${w.id}" ${quizConfig.scope === w.id ? 'selected' : ''}>${escapeHtml(w.title)}</option>`).join('')}
        </select>
      </label>
      <label>Soru tipi
        <select name="mode">
          <option value="mc" ${quizConfig.mode === 'mc' ? 'selected' : ''}>Çoktan seçmeli</option>
          <option value="typed" ${quizConfig.mode === 'typed' ? 'selected' : ''}>Yazarak cevapla</option>
        </select>
      </label>
      <label>Yön
        <select name="direction">
          <option value="en-tr" ${quizConfig.direction === 'en-tr' ? 'selected' : ''}>İngilizce → Türkçe</option>
          <option value="tr-en" ${quizConfig.direction === 'tr-en' ? 'selected' : ''}>Türkçe → İngilizce</option>
        </select>
      </label>
      <button type="submit" class="primary">Sınavı Başlat</button>
    </form>
  </section>`;
}

// ---------- Actions ----------

function switchTab(tab) {
  activeTab = tab;
  activeWeekId = null;
  photoSession = null;
  cardsSession = null;
  quizSession = null;
  render();
}

function handleWeekCreate(form) {
  const title = form.get('title').toString().trim();
  if (!title) return;
  const week = { id: generateId('week'), title, createdAt: new Date().toISOString(), words: [] };
  state.weeks.push(week);
  persist();
  activeWeekId = week.id;
  render();
}

function handleWeekDelete(id) {
  const week = findWeek(id);
  if (!week) return;
  if (!confirm(`"${week.title}" haftasını ve içindeki tüm kelimeleri silmek istediğine emin misin?`)) return;
  state.weeks = state.weeks.filter((w) => w.id !== id);
  persist();
  render();
}

function handleWeekRename(id) {
  const week = findWeek(id);
  if (!week) return;
  const next = prompt('Yeni hafta adı:', week.title);
  if (!next || !next.trim()) return;
  week.title = next.trim();
  persist();
  render();
}

function handleWordAddManual(form, weekId) {
  const week = findWeek(weekId);
  if (!week) return;
  const en = form.get('en').toString().trim();
  const tr = form.get('tr').toString().trim();
  if (!en || !tr) return;
  week.words.push({ id: generateId('word'), en, tr, ...initWordStats() });
  persist();
  render();
}

function handleWordEdit(weekId, wordId) {
  const entry = findWordEntry(weekId, wordId);
  if (!entry) return;
  const nextEn = prompt('İngilizce kelime:', entry.word.en);
  if (nextEn === null) return;
  const nextTr = prompt('Türkçe anlamı:', entry.word.tr);
  if (nextTr === null) return;
  if (!nextEn.trim() || !nextTr.trim()) return;
  entry.word.en = nextEn.trim();
  entry.word.tr = nextTr.trim();
  persist();
  render();
}

function handleWordDelete(weekId, wordId) {
  const week = findWeek(weekId);
  if (!week) return;
  week.words = week.words.filter((w) => w.id !== wordId);
  persist();
  render();
}

async function handlePhotoFile(file, weekId) {
  photoSession = { status: 'scanning', progress: 0, weekId, candidates: [] };
  render();
  try {
    const text = await runOcrOnFile(file, {
      onProgress: (pct) => {
        if (photoSession) {
          photoSession.progress = pct;
          render();
        }
      },
    });
    const found = parseOcrTextToCandidates(text);
    photoSession = {
      status: 'review',
      weekId,
      candidates: found.map((c) => ({ en: c.en, tr: c.tr, checked: true })),
    };
  } catch (err) {
    photoSession = { status: 'error', error: err.message || 'Fotoğraf okunamadı.' };
  }
  render();
}

function handlePhotoAddSelected() {
  if (!photoSession || photoSession.status !== 'review') return;
  const week = findWeek(photoSession.weekId);
  if (!week) return;
  let added = 0;
  for (const c of photoSession.candidates) {
    if (!c.checked) continue;
    const en = c.en.trim();
    const tr = c.tr.trim();
    if (!en || !tr) continue;
    week.words.push({ id: generateId('word'), en, tr, ...initWordStats() });
    added += 1;
  }
  persist();
  photoSession = null;
  toast(added > 0 ? `${added} kelime eklendi 🎉` : 'Eklenecek kelime seçilmedi.');
  render();
}

function startCardsSession(scope, dueOnly) {
  let entries = scopeEntries(scope);
  if (dueOnly) entries = entries.filter((e) => isDue(e.word));
  entries = entries.sort(() => Math.random() - 0.5);
  cardsSession = {
    items: entries.map((e) => ({ weekId: e.week.id, wordId: e.word.id })),
    index: 0,
    revealed: false,
  };
  render();
}

function markCard(result) {
  if (!cardsSession) return;
  const item = cardsSession.items[cardsSession.index];
  const entry = findWordEntry(item.weekId, item.wordId);
  if (entry) {
    applyAnswer(entry.word, result === 'know');
    logPractice();
    persist();
  }
  cardsSession.index += 1;
  cardsSession.revealed = false;
  render();
}

function startQuizSession(scope, mode, direction) {
  let entries = scopeEntries(scope);
  if (entries.length === 0) {
    toast('Bu haftada kelime yok, önce kelime ekle.');
    return;
  }
  entries = entries.sort(() => Math.random() - 0.5);
  const items = entries.map((e) => buildQuizQuestion(e, direction, mode));
  quizSession = {
    scope, mode, direction, items, index: 0, score: 0, wrong: [], answered: false, lastResult: false, finished: false,
  };
  render();
}

function answerQuiz(isCorrect, wrongPayload) {
  quizSession.answered = true;
  quizSession.lastResult = isCorrect;
  if (isCorrect) {
    quizSession.score += 1;
  } else if (wrongPayload) {
    quizSession.wrong.push(wrongPayload);
  }
  const item = quizSession.items[quizSession.index];
  const entry = findWordEntry(item.weekId, item.wordId);
  if (entry) applyAnswer(entry.word, isCorrect);
  logPractice();
  persist();
  render();
}

function nextQuizQuestion() {
  quizSession.index += 1;
  quizSession.answered = false;
  if (quizSession.index >= quizSession.items.length) {
    quizSession.finished = true;
    const scopeWeek = quizSession.scope === 'all' ? null : findWeek(quizSession.scope);
    state.quizHistory.push({
      id: generateId('quiz'),
      weekId: quizSession.scope,
      weekTitle: scopeWeek ? scopeWeek.title : 'Tüm Haftalar',
      date: new Date().toISOString(),
      mode: quizSession.mode,
      direction: quizSession.direction,
      total: quizSession.items.length,
      correct: quizSession.score,
      wrongWordIds: quizSession.wrong.map((w) => w.wordId),
    });
    persist();
  }
  render();
}

// ---------- Event wiring ----------

document.addEventListener('click', (e) => {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;

  switch (action) {
    case 'nav:home': switchTab('home'); break;
    case 'nav:weeks': switchTab('weeks'); break;
    case 'nav:cards': switchTab('cards'); break;
    case 'nav:quiz': switchTab('quiz'); break;

    case 'backup:export': exportStateAsFile(state); toast('Yedek indirildi.'); break;

    case 'home:review-due':
      activeTab = 'cards';
      cardsConfig = { scope: 'all', dueOnly: true };
      startCardsSession('all', true);
      break;
    case 'home:open-week':
      activeTab = 'weeks';
      activeWeekId = target.dataset.id;
      render();
      break;

    case 'week:open': activeWeekId = target.dataset.id; render(); break;
    case 'week:back': activeWeekId = null; photoSession = null; render(); break;
    case 'week:delete': handleWeekDelete(target.dataset.id); break;
    case 'week:rename': handleWeekRename(target.dataset.id); break;

    case 'word:edit': handleWordEdit(target.dataset.week, target.dataset.id); break;
    case 'word:delete': handleWordDelete(target.dataset.week, target.dataset.id); break;

    case 'photo:cancel': photoSession = null; render(); break;
    case 'photo:add-selected': handlePhotoAddSelected(); break;
    case 'photo:toggle': {
      const idx = Number(target.dataset.idx);
      if (photoSession?.candidates[idx]) {
        photoSession.candidates[idx].checked = target.checked;
      }
      break;
    }

    case 'cards:flip':
      if (cardsSession) { cardsSession.revealed = !cardsSession.revealed; render(); }
      break;
    case 'cards:mark': markCard(target.dataset.result); break;
    case 'cards:restart': startCardsSession(cardsConfig.scope, cardsConfig.dueOnly); break;
    case 'cards:exit': cardsSession = null; render(); break;

    case 'quiz:answer': {
      const q = quizSession.items[quizSession.index];
      const idx = Number(target.dataset.option);
      const isCorrect = idx === q.correctIndex;
      answerQuiz(isCorrect, isCorrect ? null : { weekId: q.weekId, wordId: q.wordId });
      break;
    }
    case 'quiz:next': nextQuizQuestion(); break;
    case 'quiz:close': quizSession = null; render(); break;

    default: break;
  }
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-action]');
  if (!form) return;
  e.preventDefault();
  const action = form.dataset.action;
  const data = new FormData(form);

  switch (action) {
    case 'week:create': handleWeekCreate(data); form.reset(); break;
    case 'word:add-manual': handleWordAddManual(data, form.dataset.id); form.reset(); break;
    case 'cards:start':
      cardsConfig = { scope: data.get('scope').toString(), dueOnly: data.get('dueOnly') === 'on' };
      startCardsSession(cardsConfig.scope, cardsConfig.dueOnly);
      break;
    case 'quiz:start':
      quizConfig = {
        scope: data.get('scope').toString(),
        mode: data.get('mode').toString(),
        direction: data.get('direction').toString(),
      };
      startQuizSession(quizConfig.scope, quizConfig.mode, quizConfig.direction);
      break;
    case 'quiz:submit-typed': {
      const q = quizSession.items[quizSession.index];
      const answer = data.get('answer').toString();
      const isCorrect = acceptableAnswers(q.correctText).includes(answer.trim().toLocaleLowerCase('tr'));
      answerQuiz(isCorrect, isCorrect ? null : { weekId: q.weekId, wordId: q.wordId });
      break;
    }
    default: break;
  }
});

document.addEventListener('change', (e) => {
  const target = e.target;
  const action = target.dataset?.action;
  if (!action) return;

  if (action === 'backup:import') {
    const file = target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        state = parseImportedState(reader.result);
        persist();
        toast('Yedek geri yüklendi.');
        switchTab('home');
      } catch (err) {
        toast('Yedek dosyası okunamadı.');
      }
    };
    reader.readAsText(file);
    target.value = '';
    return;
  }

  if (action === 'photo:file') {
    const file = target.files[0];
    const weekId = target.dataset.id;
    if (file) handlePhotoFile(file, weekId);
    target.value = '';
    return;
  }

  if (action === 'photo:edit-en' || action === 'photo:edit-tr') {
    const idx = Number(target.dataset.idx);
    if (!photoSession?.candidates[idx]) return;
    if (action === 'photo:edit-en') photoSession.candidates[idx].en = target.value;
    else photoSession.candidates[idx].tr = target.value;
  }
});

render();
