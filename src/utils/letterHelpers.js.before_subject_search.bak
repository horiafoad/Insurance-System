// letterHelpers.js
// دوال مشتركة تُستخدم في LettersTrackingPage و LetterStatsBar و
// LetterSearchFilters و LettersArchiveSection — عشان منكررش نفس
// المنطق في أكتر من مكان.

// عدد الأيام اللي لو الخطاب فضل "in_progress" في نفس المحطة أكتر منها
// من غير ما يتحرك، بيتعتبر "متأخر". غيّرها هنا لو عايز رقم مختلف —
// القيمة دي مش موجودة في السكيما الحالية، فهي ثابت في الكود مؤقتًا.
export const LATE_THRESHOLD_DAYS = 3;

export const LETTER_STATUS_LABELS = {
  incoming: "وارد",
  in_progress: "جاري التنفيذ",
  needs_revision: "تحتاج تعديل",
  completed: "تم التنفيذ",
  archived: "مؤرشف",
};

export const QR_STATUS_LABELS = {
  available: "متاح",
  used: "مستخدم",
  archived: "مؤرشف",
  replaced: "مستبدل",
};

export function getLetterStatusLabel(status) {
  return LETTER_STATUS_LABELS[status] || status || "غير محدد";
}

export function getQrStatusLabel(status) {
  return QR_STATUS_LABELS[status] || status || "غير محدد";
}

// آخر حركة "فعّالة" للخطاب (in_progress أو needs_revision)، أو آخر
// حركة completed لو كله خلص.
export function getCurrentMovement(movements = []) {
  if (!movements.length) return null;

  const active = movements.find(
    (m) => m.status === "in_progress" || m.status === "needs_revision"
  );

  if (active) return active;

  // مفيش حركة نشطة دلوقتي (يبقى كله completed أو لسه في waiting)
  const completedOnes = movements.filter((m) => m.status === "completed");
  return completedOnes[completedOnes.length - 1] || movements[0] || null;
}

// هل الخطاب متأخر؟ (بناءً على أول حركة in_progress ولسه ماتحركتش)
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

// إحصائيات ملخص الحركة (بند 1) — بتاخد مصفوفة الخطابات المحمّلة بالفعل
// (مع movements) ومصفوفة أكواد QR، وترجع الأرقام الجاهزة للبطاقات.
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

// البحث الموحّد: اسم صاحب الخطاب / رقم الخطاب / كود QR
export function searchLetters(letters = [], term = "") {
  const normalized = term.trim().toLowerCase();

  if (!normalized) return letters;

  return letters.filter((letter) => {
    const senderName = (letter.sender?.name || "").toLowerCase();
    const letterNumber = (letter.letter_number || "").toLowerCase();
    const qrCode = (letter.qr?.code || "").toLowerCase();

    return (
      senderName.includes(normalized) ||
      letterNumber.includes(normalized) ||
      qrCode.includes(normalized)
    );
  });
}

// الفلاتر: الإدارة / نوع الخطاب / الحالة / الفترة الزمنية / أرشفة
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

// تجميع الخطابات المؤرشفة في شجرة: السنة → الفترة (أسبوعية) → الإدارة
// → نوع الخطاب → الخطابات (بند 5)
export function buildArchiveTree(letters = []) {
  const archived = letters.filter((l) => l.status === "archived");
  const tree = {};

  for (const letter of archived) {
    if (!letter.letter_date) continue;

    const date = new Date(letter.letter_date);
    const year = date.getFullYear();
    const weekNumber = getIsoWeekNumber(date);
    const weekLabel = `الأسبوع ${weekNumber}`;

    const current = getCurrentMovement(letter.movements || []);
    const departmentName = current?.department?.name || "بدون إدارة";
    const typeName = letter.letter_type || "غير مصنّف";

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
