// letterHelpers.js
// Ø¯ÙˆØ§Ù„ Ù…Ø´ØªØ±ÙƒØ© ØªÙØ³ØªØ®Ø¯Ù… ÙÙŠ LettersTrackingPage Ùˆ LetterStatsBar Ùˆ
// LetterSearchFilters Ùˆ LettersArchiveSection â€” Ø¹Ø´Ø§Ù† Ù…Ù†ÙƒØ±Ø±Ø´ Ù†ÙØ³
// Ø§Ù„Ù…Ù†Ø·Ù‚ ÙÙŠ Ø£ÙƒØªØ± Ù…Ù† Ù…ÙƒØ§Ù†.

// Ø¹Ø¯Ø¯ Ø§Ù„Ø£ÙŠØ§Ù… Ø§Ù„Ù„ÙŠ Ù„Ùˆ Ø§Ù„Ø®Ø·Ø§Ø¨ ÙØ¶Ù„ "in_progress" ÙÙŠ Ù†ÙØ³ Ø§Ù„Ù…Ø­Ø·Ø© Ø£ÙƒØªØ± Ù…Ù†Ù‡Ø§
// Ù…Ù† ØºÙŠØ± Ù…Ø§ ÙŠØªØ­Ø±ÙƒØŒ Ø¨ÙŠØªØ¹ØªØ¨Ø± "Ù…ØªØ£Ø®Ø±". ØºÙŠÙ‘Ø±Ù‡Ø§ Ù‡Ù†Ø§ Ù„Ùˆ Ø¹Ø§ÙŠØ² Ø±Ù‚Ù… Ù…Ø®ØªÙ„Ù â€”
// Ø§Ù„Ù‚ÙŠÙ…Ø© Ø¯ÙŠ Ù…Ø´ Ù…ÙˆØ¬ÙˆØ¯Ø© ÙÙŠ Ø§Ù„Ø³ÙƒÙŠÙ…Ø§ Ø§Ù„Ø­Ø§Ù„ÙŠØ©ØŒ ÙÙ‡ÙŠ Ø«Ø§Ø¨Øª ÙÙŠ Ø§Ù„ÙƒÙˆØ¯ Ù…Ø¤Ù‚ØªÙ‹Ø§.
export const LATE_THRESHOLD_DAYS = 3;

export const LETTER_STATUS_LABELS = {
  incoming: "ÙˆØ§Ø±Ø¯",
  in_progress: "Ø¬Ø§Ø±ÙŠ Ø§Ù„ØªÙ†ÙÙŠØ°",
  needs_revision: "ØªØ­ØªØ§Ø¬ ØªØ¹Ø¯ÙŠÙ„",
  completed: "ØªÙ… Ø§Ù„ØªÙ†ÙÙŠØ°",
  archived: "Ù…Ø¤Ø±Ø´Ù",
};

export const QR_STATUS_LABELS = {
  available: "Ù…ØªØ§Ø­",
  used: "Ù…Ø³ØªØ®Ø¯Ù…",
  archived: "Ù…Ø¤Ø±Ø´Ù",
  replaced: "Ù…Ø³ØªØ¨Ø¯Ù„",
};

export function getLetterStatusLabel(status) {
  return LETTER_STATUS_LABELS[status] || status || "ØºÙŠØ± Ù…Ø­Ø¯Ø¯";
}

export function getQrStatusLabel(status) {
  return QR_STATUS_LABELS[status] || status || "ØºÙŠØ± Ù…Ø­Ø¯Ø¯";
}

// Ø¢Ø®Ø± Ø­Ø±ÙƒØ© "ÙØ¹Ù‘Ø§Ù„Ø©" Ù„Ù„Ø®Ø·Ø§Ø¨ (in_progress Ø£Ùˆ needs_revision)ØŒ Ø£Ùˆ Ø¢Ø®Ø±
// Ø­Ø±ÙƒØ© completed Ù„Ùˆ ÙƒÙ„Ù‡ Ø®Ù„Øµ.
export function getCurrentMovement(movements = []) {
  if (!movements.length) return null;

  const sorted = [...movements].sort(
    (a, b) => (a.step_order || 0) - (b.step_order || 0)
  );

  // Ø£Ù†Ø´Ø· Ø­Ø±ÙƒØ© Ø­Ø§Ù„ÙŠØ© = Ø£Ø­Ø¯Ø« in_progress (Ù‚Ø¯ ØªÙƒÙˆÙ† Ù…ÙƒØ±Ù‘Ø±Ø© Ø¨Ø¹Ø¯ Ø§Ù„Ø¥Ø±Ø¬Ø§Ø¹)
  const active = sorted.filter((m) => m.status === "in_progress");
  if (active.length) return active[active.length - 1];

  // ÙØ§Ù„Øª ÙƒÙ†Øª needs_revision Ù…Ø¶Ø§ÙØ© Ø¨Ø¹Ø¯ Ø¥Ø±Ø¬Ø§Ø¹
  const revision = sorted.filter((m) => m.status === "needs_revision");
  if (revision.length) return revision[revision.length - 1];

  // Ø¢Ø®Ø± Ù…Ø­Ø·Ø© completed Ù„Ùˆ ÙƒÙ„Ù‡ Ø®Ù„Øµ
  const completedOnes = sorted.filter((m) => m.status === "completed");
  return completedOnes[completedOnes.length - 1] || sorted[0] || null;
}

// Ù‡Ù„ Ø§Ù„Ø®Ø·Ø§Ø¨ Ù…ØªØ£Ø®Ø±ØŸ (Ø¨Ù†Ø§Ø¡Ù‹ Ø¹Ù„Ù‰ Ø£ÙˆÙ„ Ø­Ø±ÙƒØ© in_progress ÙˆÙ„Ø³Ù‡ Ù…Ø§ØªØ­Ø±ÙƒØªØ´)
export function isLetterLate(letter, thresholdDays = LATE_THRESHOLD_DAYS) {
  if (!letter || letter.status === "completed" || letter.status === "archived") {
    return false;
  }

  const current = getCurrentMovement(letter.movements || []);

  if (!current || current.status !== "in_progress" || !current.received_at) {
    return false;
  }

  const receivedAt = new Date(current.received_at).getTime();
  const now = Date.now();
  const diffDays = (now - receivedAt) / (1000 * 60 * 60 * 24);

  return diffDays >= thresholdDays;
}

// Ø¥Ø­ØµØ§Ø¦ÙŠØ§Øª Ù…Ù„Ø®Øµ Ø§Ù„Ø­Ø±ÙƒØ© (Ø¨Ù†Ø¯ 1) â€” Ø¨ØªØ§Ø®Ø¯ Ù…ØµÙÙˆÙØ© Ø§Ù„Ø®Ø·Ø§Ø¨Ø§Øª Ø§Ù„Ù…Ø­Ù…Ù‘Ù„Ø© Ø¨Ø§Ù„ÙØ¹Ù„
// (Ù…Ø¹ movements) ÙˆÙ…ØµÙÙˆÙØ© Ø£ÙƒÙˆØ§Ø¯ QRØŒ ÙˆØªØ±Ø¬Ø¹ Ø§Ù„Ø£Ø±Ù‚Ø§Ù… Ø§Ù„Ø¬Ø§Ù‡Ø²Ø© Ù„Ù„Ø¨Ø·Ø§Ù‚Ø§Øª.
export function computeLetterStats(letters = [], qrCodes = []) {
  const stats = {
    totalLetters: letters.length,
    inProgress: 0,
    needsRevision: 0,
    completed: 0,
    late: 0,
    totalQr: qrCodes.length,
    availableQr: 0,
    usedQr: 0,
    replacedQr: 0,
  };

  for (const letter of letters) {
    if (letter.status === "in_progress") stats.inProgress += 1;
    if (letter.status === "needs_revision") stats.needsRevision += 1;
    if (letter.status === "completed") stats.completed += 1;
    if (isLetterLate(letter)) stats.late += 1;
  }

  for (const qr of qrCodes) {
    if (qr.status === "available") stats.availableQr += 1;
    if (qr.status === "used") stats.usedQr += 1;
    if (qr.status === "replaced") stats.replacedQr += 1;
  }

  return stats;
}

// Ø§Ù„Ø¨Ø­Ø« Ø§Ù„Ù…ÙˆØ­Ù‘Ø¯: Ø§Ø³Ù… ØµØ§Ø­Ø¨ Ø§Ù„Ø®Ø·Ø§Ø¨ / Ø±Ù‚Ù… Ø§Ù„Ø®Ø·Ø§Ø¨ / ÙƒÙˆØ¯ QR
export function searchLetters(letters = [], term = "") {
  const normalized = term.trim().toLowerCase();

  if (!normalized) return letters;

  return letters.filter((letter) => {
    const senderName = (letter.sender?.name || "").toLowerCase();
    const letterNumber = (letter.letter_number || "").toLowerCase();
    const qrCode = (letter.qr?.code || "").toLowerCase();
    const subject = (letter.subject || "").toLowerCase();

    return (
      senderName.includes(normalized) ||
      letterNumber.includes(normalized) ||
      qrCode.includes(normalized)
    );
  });
}

// Ø§Ù„ÙÙ„Ø§ØªØ±: Ø§Ù„Ø¥Ø¯Ø§Ø±Ø© / Ù†ÙˆØ¹ Ø§Ù„Ø®Ø·Ø§Ø¨ / Ø§Ù„Ø­Ø§Ù„Ø© / Ø§Ù„ÙØªØ±Ø© Ø§Ù„Ø²Ù…Ù†ÙŠØ© / Ø£Ø±Ø´ÙØ©
// filters = { departmentId, letterType, status, dateFrom, dateTo, archivedOnly }
export function filterLetters(letters = [], filters = {}) {
  const {
    departmentId,
    letterType,
    status,
    dateFrom,
    dateTo,
    archivedOnly, // "archived" | "not_archived" | undefined
  } = filters;

  return letters.filter((letter) => {
    if (departmentId) {
      const current = getCurrentMovement(letter.movements || []);
      if (String(current?.department_id) !== String(departmentId)) {
        return false;
      }
    }

    if (letterType && letter.letter_type !== letterType) {
      return false;
    }

    if (status && letter.status !== status) {
      return false;
    }

    if (dateFrom && letter.letter_date < dateFrom) {
      return false;
    }

    if (dateTo && letter.letter_date > dateTo) {
      return false;
    }

    if (archivedOnly === "archived" && letter.status !== "archived") {
      return false;
    }

    if (archivedOnly === "not_archived" && letter.status === "archived") {
      return false;
    }

    return true;
  });
}

// ØªØ¬Ù…ÙŠØ¹ Ø§Ù„Ø®Ø·Ø§Ø¨Ø§Øª Ø§Ù„Ù…Ø¤Ø±Ø´ÙØ© ÙÙŠ Ø´Ø¬Ø±Ø©: Ø§Ù„Ø³Ù†Ø© â†’ Ø§Ù„ÙØªØ±Ø© (Ø£Ø³Ø¨ÙˆØ¹ÙŠØ©) â†’ Ø§Ù„Ø¥Ø¯Ø§Ø±Ø©
// â†’ Ù†ÙˆØ¹ Ø§Ù„Ø®Ø·Ø§Ø¨ â†’ Ø§Ù„Ø®Ø·Ø§Ø¨Ø§Øª (Ø¨Ù†Ø¯ 5)
export function buildArchiveTree(letters = []) {
  const archived = letters.filter((l) => l.status === "archived");
  const tree = {};

  for (const letter of archived) {
    if (!letter.letter_date) continue;

    const date = new Date(letter.letter_date);
    const year = date.getFullYear();
    const weekNumber = getIsoWeekNumber(date);
    const weekLabel = `Ø§Ù„Ø£Ø³Ø¨ÙˆØ¹ ${weekNumber}`;

    const current = getCurrentMovement(letter.movements || []);
    const departmentName = current?.department?.name || "Ø¨Ø¯ÙˆÙ† Ø¥Ø¯Ø§Ø±Ø©";
    const typeName = letter.letter_type || "ØºÙŠØ± Ù…ØµÙ†Ù‘Ù";

    tree[year] ??= {};
    tree[year][weekLabel] ??= {};
    tree[year][weekLabel][departmentName] ??= {};
    tree[year][weekLabel][departmentName][typeName] ??= [];
    tree[year][weekLabel][departmentName][typeName].push(letter);
  }

  return tree;
}

function getIsoWeekNumber(date) {
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}

