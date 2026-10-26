// ============================================================================
// facultyAutoLinkPlan.js
// ---------------------------------------------------------------------------
// يبني «خطة ربط» كاملة بين سجلات النظام (مطالبات / قضايا / إجازات دراسية)
// وبين السجل المركزي للأرشيف الذكي — بلا أي كتابة في قاعدة البيانات.
//
// نفس الدالة تُستخدم في التطبيق (facultyAutoLinkService) وفي سكربتات الاختبار،
// حتى تكون النتائج قابلة للتكرار والمراجعة قبل الحفظ.
// ============================================================================

import { buildMemberIndex, findMemberMentions, matchMemberName } from "./facultyNameMatcher.js";

export const AUTO_LINK_SOURCES = {
  claim: {
    linkType: "claim",
    refTable: "claims",
    label: "مطالبات",
    icon: "📋",
  },
  issue: {
    linkType: "issue",
    refTable: "issues",
    label: "قضايا",
    icon: "⚖️",
  },
  study_leave: {
    linkType: "study_leave",
    refTable: "study_leaves",
    label: "إجازات دراسية",
    icon: "🎓",
  },
};

/** أعلى عدد من الاقتراحات التي تُعاد للواجهة (لتجنّب قوائم ضخمة). */
const MAX_REVIEW_ITEMS = 200;

/** اسم صاحب المطالبة: العمود المخصص، ثم مفتاح «الاسم» داخل data. */
export function claimNameOf(claim) {
  if (!claim) return "";
  if (claim.claimant_name && String(claim.claimant_name).trim()) {
    return String(claim.claimant_name).trim();
  }
  const data = claim.data;
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const keys = [" ", "الاسم", "الاسم ", "اسم", "اسم صاحب المطالبة"];
    for (const key of keys) {
      const value = data[key];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
  }
  return "";
}

function reviewCandidatesFromMatch(match) {
  return (match.candidates || []).map((candidate) => ({
    memberId: candidate.memberId,
    name: candidate.name,
    code: candidate.code || null,
    score: candidate.score,
    matchedBy: candidate.matchedBy || "fuzzy",
  }));
}

function reviewCandidatesFromHits(hits) {
  return hits.slice(0, 5).map((hit) => ({
    memberId: hit.entry.member.id,
    name: hit.entry.member.full_name,
    code: hit.entry.member.member_code || null,
    score: hit.score,
    matchedBy: "text_contains",
  }));
}

/**
 * يبني خطة الربط.
 *
 * @param {object} input
 * @param {Array} input.members        صفوف faculty_members
 * @param {Array} [input.aliases]      صفوف faculty_member_aliases
 * @param {Array} [input.claims]       صفوف claims
 * @param {Array} [input.issues]       صفوف issues
 * @param {Array} [input.studyLeaves]  سجلات الإجازات (محلية)
 * @param {Array} [input.existingLinks] روابط موجودة (link_type, ref_table, ref_id)
 * @param {Array} [input.sources]      ["claim","issue","study_leave"]
 * @param {boolean} [input.includeReview=true]
 * @returns {{links: Array, review: Array, report: object}}
 */
export function buildAutoLinkPlan({
  members = [],
  aliases = [],
  claims = [],
  issues = [],
  studyLeaves = [],
  existingLinks = [],
  sources = ["claim", "issue", "study_leave"],
  includeReview = true,
} = {}) {
  const wanted = new Set(sources);
  const index = buildMemberIndex(members, aliases);
  const existingRefs = new Set(
    existingLinks.map(
      (link) => `${link.link_type}|${link.ref_table}|${String(link.ref_id)}`
    )
  );

  const links = [];
  const review = [];
  const seenRefs = new Set();
  const report = {
    members: members.length,
    aliases: aliases.length,
    sources: {},
    linked: 0,
    existing: 0,
    needsReview: 0,
    noMatch: 0,
    reviewTotal: 0,
  };

  Object.keys(AUTO_LINK_SOURCES).forEach((key) => {
    if (!wanted.has(key)) return;
    report.sources[key] = {
      scanned: 0,
      linked: 0,
      existing: 0,
      needsReview: 0,
      noMatch: 0,
      matchedBy: {},
    };
  });

  const refKeyOf = (def, row) =>
    `${def.linkType}|${def.refTable}|${String(row.id)}`;

  const addLink = (def, row, match, { label, refDate, snapshot }) => {
    const refKey = refKeyOf(def, row);
    if (seenRefs.has(refKey)) return;
    seenRefs.add(refKey);
    links.push({
      member_id: match.member.id,
      link_type: def.linkType,
      ref_table: def.refTable,
      ref_id: String(row.id),
      ref_label: label || null,
      ref_date: refDate || null,
      matched_by: match.matchedBy,
      confidence: match.confidence,
      snapshot: snapshot || null,
    });
    const bucket = report.sources[def.linkType];
    bucket.linked += 1;
    bucket.matchedBy[match.matchedBy] = (bucket.matchedBy[match.matchedBy] || 0) + 1;
    report.linked += 1;
  };

  const addReview = (def, row, candidates, { label, refDate, snapshot, name }) => {
    report.sources[def.linkType].needsReview += 1;
    report.needsReview += 1;
    report.reviewTotal += 1;
    if (!includeReview) return;
    if (review.length >= MAX_REVIEW_ITEMS) return;
    review.push({
      linkType: def.linkType,
      refTable: def.refTable,
      refId: String(row.id),
      label: label || null,
      refDate: refDate || null,
      snapshot: snapshot || null,
      name: name || "",
      candidates,
    });
  };

  const markExisting = (def, row) => {
    report.sources[def.linkType].existing += 1;
    report.existing += 1;
    seenRefs.add(refKeyOf(def, row));
  };

  const markNoMatch = (def) => {
    report.sources[def.linkType].noMatch += 1;
    report.noMatch += 1;
  };

  /* ------------------------------ المطالبات ------------------------------ */
  if (wanted.has("claim")) {
    const def = AUTO_LINK_SOURCES.claim;
    claims.forEach((claim) => {
      report.sources.claim.scanned += 1;
      if (existingRefs.has(refKeyOf(def, claim))) {
        markExisting(def, claim);
        return;
      }
      const name = claimNameOf(claim);
      const match = matchMemberName(name, index);
      const label = claim.claim_number || claim.sheet_name || name || "مطالبة";
      const refDate = claim.claim_date || null;
      const snapshot = {
        id: claim.id,
        claimant_name: name,
        claim_number: claim.claim_number || null,
        sheet_name: claim.sheet_name || null,
        status: claim.status || null,
        amount: claim.amount ?? null,
      };

      if (match.member) {
        addLink(def, claim, match, { label, refDate, snapshot });
      } else if (match.reason === "needs_review" || match.reason === "ambiguous") {
        addReview(def, claim, reviewCandidatesFromMatch(match), {
          label,
          refDate,
          snapshot,
          name,
        });
      } else {
        markNoMatch(def);
      }
    });
  }

  /* ------------------------------- القضايا ------------------------------- */
  if (wanted.has("issue")) {
    const def = AUTO_LINK_SOURCES.issue;
    issues.forEach((issue) => {
      report.sources.issue.scanned += 1;
      if (existingRefs.has(refKeyOf(def, issue))) {
        markExisting(def, issue);
        return;
      }
      const title = issue.case_title || "";
      const label = issue.case_number || title || "قضية";
      const refDate = issue.created_at ? String(issue.created_at).slice(0, 10) : null;
      const snapshot = {
        id: issue.id,
        case_number: issue.case_number || null,
        case_title: title || null,
        status: issue.status || null,
      };

      const titleMatch = matchMemberName(title, index);
      if (titleMatch.member) {
        addLink(def, issue, titleMatch, { label, refDate, snapshot });
        return;
      }

      const mentions = findMemberMentions(
        `${title} ${issue.case_description || ""}`,
        index
      );
      if (mentions.length === 1) {
        const hit = mentions[0];
        addLink(
          def,
          issue,
          {
            member: hit.entry.member,
            matchedBy: "text_contains",
            confidence: 0.85,
          },
          { label, refDate, snapshot }
        );
        return;
      }
      if (mentions.length > 1) {
        addReview(def, issue, reviewCandidatesFromHits(mentions), {
          label,
          refDate,
          snapshot,
          name: title,
        });
        return;
      }
      if (
        titleMatch.reason === "needs_review" ||
        titleMatch.reason === "ambiguous"
      ) {
        addReview(def, issue, reviewCandidatesFromMatch(titleMatch), {
          label,
          refDate,
          snapshot,
          name: title,
        });
        return;
      }
      markNoMatch(def);
    });
  }

  /* --------------------------- الإجازات الدراسية -------------------------- */
  if (wanted.has("study_leave")) {
    const def = AUTO_LINK_SOURCES.study_leave;
    studyLeaves.forEach((leave) => {
      report.sources.study_leave.scanned += 1;
      if (existingRefs.has(refKeyOf(def, leave))) {
        markExisting(def, leave);
        return;
      }
      const name = leave.name || leave.employeeName || "";
      const label = `${leave.leaveKind || "إجازة دراسية"} — ${name || "بدون اسم"}`;
      const snapshot = {
        id: leave.id,
        name,
        employeeCode: leave.employeeCode || null,
        leaveKind: leave.leaveKind || null,
        startDate: leave.startDate || null,
        endDate: leave.endDate || null,
        salaryStatus: leave.salaryStatus || null,
      };

      // رقم الكود الوظيفي أدق من الاسم.
      const code = leave.employeeCode ? String(leave.employeeCode).trim() : "";
      const codeEntry = code ? index.byCode.get(code) : null;
      if (codeEntry) {
        addLink(
          def,
          leave,
          {
            member: codeEntry.member,
            matchedBy: "exact_code",
            confidence: 1,
          },
          { label, refDate: leave.startDate || null, snapshot }
        );
        return;
      }

      const match = matchMemberName(name, index);
      if (match.member) {
        addLink(def, leave, match, {
          label,
          refDate: leave.startDate || null,
          snapshot,
        });
      } else if (
        match.reason === "needs_review" ||
        match.reason === "ambiguous"
      ) {
        addReview(def, leave, reviewCandidatesFromMatch(match), {
          label,
          refDate: leave.startDate || null,
          snapshot,
          name,
        });
      } else {
        markNoMatch(def);
      }
    });
  }

  return { links, review, report };
}
