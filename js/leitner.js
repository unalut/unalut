// Simple Leitner-box spaced repetition: box 1 (new/again) reviews daily,
// higher boxes get progressively longer gaps before a card is "due" again.
export const BOX_INTERVAL_DAYS = [0, 1, 3, 7, 14, 30];
export const MAX_BOX = BOX_INTERVAL_DAYS.length;

function todayStart() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function initWordStats() {
  return {
    box: 1,
    correctCount: 0,
    wrongCount: 0,
    lastSeenAt: null,
    dueAt: todayStart().toISOString(),
  };
}

export function applyAnswer(word, isCorrect) {
  const now = new Date();
  if (isCorrect) {
    word.box = Math.min((word.box || 1) + 1, MAX_BOX);
    word.correctCount = (word.correctCount || 0) + 1;
  } else {
    word.box = 1;
    word.wrongCount = (word.wrongCount || 0) + 1;
  }
  word.lastSeenAt = now.toISOString();
  const due = todayStart();
  due.setDate(due.getDate() + BOX_INTERVAL_DAYS[word.box - 1]);
  word.dueAt = due.toISOString();
}

export function isDue(word) {
  if (!word.dueAt) return true;
  return new Date(word.dueAt).getTime() <= Date.now();
}
