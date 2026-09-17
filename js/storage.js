const STORAGE_KEY = 'melis-english-flashcards-v1';

export function createEmptyState() {
  return { version: 1, weeks: [], quizHistory: [], practiceLog: [] };
}

function normalize(parsed) {
  return {
    version: 1,
    weeks: Array.isArray(parsed.weeks) ? parsed.weeks : [],
    quizHistory: Array.isArray(parsed.quizHistory) ? parsed.quizHistory : [],
    practiceLog: Array.isArray(parsed.practiceLog) ? parsed.practiceLog : [],
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createEmptyState();
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.weeks)) return createEmptyState();
    return normalize(parsed);
  } catch (err) {
    console.error('Kayıtlı veri okunamadı, boş başlanıyor.', err);
    return createEmptyState();
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Veri kaydedilemedi.', err);
  }
}

export function exportStateAsFile(state) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStr = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `melis-kelime-yedek-${dateStr}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function parseImportedState(text) {
  const parsed = JSON.parse(text);
  if (!parsed || !Array.isArray(parsed.weeks)) {
    throw new Error('Geçersiz yedek dosyası.');
  }
  return normalize(parsed);
}
