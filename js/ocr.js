// Turns a photographed word list into candidate {en, tr} pairs.
// Handles lines like "apple - elma", "apple: elma", "apple\tel­ma" or just "apple".

const LEADING_NUMBERING = /^[\s]*[\d]{1,3}[.)]\s*|^[\s]*[-•*]\s*/;
const SEPARATORS = /\s*[-–—:=→]\s*|\t+/;
const ALLOWED_WORD_CHARS = /[^A-Za-zÇĞİÖŞÜçğıöşü' -]/g;

export function parseOcrTextToCandidates(rawText) {
  const lines = String(rawText || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const candidates = [];
  const seen = new Set();

  for (const rawLine of lines) {
    const line = rawLine.replace(LEADING_NUMBERING, '').trim();
    if (!line) continue;

    const parts = line.split(SEPARATORS).map((p) => p.trim()).filter(Boolean);
    let en = '';
    let tr = '';
    if (parts.length >= 2) {
      [en, tr] = parts;
    } else {
      en = line;
    }

    en = en.replace(ALLOWED_WORD_CHARS, '').trim();
    tr = tr.replace(/[^A-Za-zÇĞİÖŞÜçğıöşü' -]/g, '').trim();

    if (en.length < 2 || /^\d+$/.test(en)) continue;

    const key = en.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    candidates.push({ en, tr });
  }

  return candidates;
}

export async function runOcrOnFile(file, { onProgress } = {}) {
  if (typeof Tesseract === 'undefined') {
    throw new Error(
      'Metin tanıma kütüphanesi yüklenemedi. İnternet bağlantınızı kontrol edip tekrar deneyin.'
    );
  }
  const { data } = await Tesseract.recognize(file, 'eng+tur', {
    logger: (m) => {
      if (onProgress && m.status === 'recognizing text') {
        onProgress(Math.round((m.progress || 0) * 100));
      }
    },
  });
  return data.text || '';
}
