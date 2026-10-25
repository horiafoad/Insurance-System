// اختبارات مطابقة الأسماء — بلا قاعدة بيانات (بيانات صناعية فقط).
// التشغيل: node scripts/faculty-archive/tests/name-matcher.test.mjs

import assert from "node:assert/strict";
import {
  buildMemberIndex,
  matchMemberName,
  findMemberMentions,
  normalizePersonName,
} from "../../../src/utils/facultyNameMatcher.js";
import { buildAutoLinkPlan } from "../../../src/utils/facultyAutoLinkPlan.js";

const members = [
  { id: "m1", member_code: "1001", full_name: "احمد محمد عبد الله" },
  { id: "m2", member_code: "1002", full_name: "اسامة حمدى عبد الواحد محمد" },
  { id: "m3", member_code: "1003", full_name: "مؤمن على محمد على" },
  { id: "m4", member_code: "1004", full_name: "محمود محمد محمود أبوالنصر" },
  { id: "m5", member_code: "1005", full_name: "محمد ابراهيم حسن محمود" },
  { id: "m6", member_code: "1006", full_name: "محمد ابراهيم حسن محمود" },
  { id: "m7", member_code: "1007", full_name: "كريم ايمن ابو الفتوح عبد المقصود" },
  { id: "m8", member_code: "1008", full_name: "احمد محمد عبد المحسن محمد" },
  { id: "m9", member_code: "1009", full_name: "مازن عرفان السيد مغاورى" },
];

const aliases = [{ member_id: "m1", alias: "أحمد محمد عبدالله" }];
const index = buildMemberIndex(members, aliases);

let passed = 0;
const check = (label, fn) => {
  fn();
  passed += 1;
  console.log("ok -", label);
};

/* 1) تطبيع الاسم */
check("تطبيع الهمزات والتاء المربوطة والألف المقصورة", () => {
  assert.equal(normalizePersonName("أحمد مُحَمَّد عبدالله"), "احمد محمد عبدالله");
  assert.equal(normalizePersonName("مصطفى  مصطفي"), "مصطفي مصطفي");
});

check("حذف الألقاب من بداية الاسم", () => {
  assert.equal(normalizePersonName("أ.د/ أحمد محمد عبد الله"), "احمد محمد عبد الله");
  assert.equal(normalizePersonName("الدكتور محمد إبراهيم"), "محمد ابراهيم");
});

/* 2) التطابق التام */
check("تطابق تام بعد التطبيع", () => {
  const r = matchMemberName("أحمد محمد عبد الله", index);
  assert.equal(r.member?.id, "m1");
  assert.equal(r.matchedBy, "normalized_name");
  assert.equal(r.confidence, 1);
});

/* 3) الاسم البديل */
check("الاسم البديل المسجّل", () => {
  const r = matchMemberName("احمد محمد عبدالله", index);
  assert.equal(r.member?.id, "m1");
  assert.equal(r.matchedBy, "alias");
  assert.equal(r.confidence, 0.97);
});

/* 4) نقص اللقب الأخير */
check("اختصار بادئي (نقص اللقب الأخير)", () => {
  const r = matchMemberName("اسامه حمدي عبد الواحد", index);
  assert.equal(r.member?.id, "m2");
  assert.equal(r.matchedBy, "partial_name");
  assert.ok(r.confidence >= 0.88);
});

/* 5) تشابه حرفي عالٍ مع اختلاف المسافات */
check("تشابه 95%+ مع اختلاف مسافة الاسم المركب", () => {
  const r = matchMemberName("محمود محمد محمود ابو النصر", index);
  assert.equal(r.member?.id, "m4");
  assert.equal(r.matchedBy, "similar_name");
});

/* 6) أسماء متشابهة لكنها لأشخاص مختلفين → مراجعة */
check("اسم مختلف في الكلمة الأولى لا يُربط", () => {
  const r = matchMemberName("محمد علي محمد علي", index);
  assert.equal(r.member, null);
  assert.ok(["needs_review", "no_match"].includes(r.reason));
});

check("اختلاف اللقب الأخير لا يُربط تلقائيًا", () => {
  const r = matchMemberName("احمد محمد عبد المحسن احمد", index);
  assert.equal(r.member, null);
  assert.equal(r.reason, "needs_review");
  assert.ok(r.candidates.length > 0);
});

check("اختلاف «ال» التعريف وحدها يُطابق", () => {
  const r = matchMemberName("مازن عرفان السيد المغاورى", index);
  assert.equal(r.member?.id, "m9");
  assert.equal(r.matchedBy, "similar_name");
});

/* 7) تكرار الاسم في السجل المركزي → غموض */check("الاسم المكرر في السجل المركزي لا يُربط", () => {
  const r = matchMemberName("محمد ابراهيم حسن محمود", index);
  assert.equal(r.member, null);
  assert.equal(r.reason, "ambiguous");
  assert.equal(r.candidates.length, 2);
});

/* 8) البحث داخل نص قضية */
check("العثور على اسم داخل وصف قضية", () => {
  const hits = findMemberMentions(
    "قضية ضم علاوة للدكتور كريم ايمن ابو الفتوح عبد المقصود وآخرين",
    index
  );
  assert.equal(hits.length, 1);
  assert.equal(hits[0].entry.member.id, "m7");
});

/* 9) خطة الربط: المطالبات والقضايا والإجازات + عدم تكرار الموجود */
check("خطة الربط تربط المطالبات والإجازات وتتجاهل الموجود", () => {
  const { links, report } = buildAutoLinkPlan({
    members,
    aliases,
    claims: [
      {
        id: 1,
        claimant_name: "احمد محمد عبدالله",
        claim_number: "C-1",
        sheet_name: "لم يسدد",
      },
      { id: 2, claimant_name: "اسم غير موجود نهائيًا", sheet_name: "لم يسدد" },
      { id: 3, claimant_name: "محمود محمد محمود ابو النصر" },
    ],
    issues: [
      {
        id: 10,
        case_number: "Q-10",
        case_title: "قضية ضم علاوة",
        case_description: "للأستاذ كريم ايمن ابو الفتوح عبد المقصود",
      },
    ],
    studyLeaves: [
      {
        id: "leave-1",
        name: "اسامه حمدي عبد الواحد",
        employeeCode: "",
        leaveKind: "اجازة دراسية",
      },
      {
        id: "leave-2",
        name: "اسم آخر",
        employeeCode: "1001",
        leaveKind: "اجازة دراسية",
      },
    ],
    existingLinks: [
      { link_type: "claim", ref_table: "claims", ref_id: "3" },
    ],
    sources: ["claim", "issue", "study_leave"],
  });

  assert.equal(report.sources.claim.scanned, 3);
  assert.equal(report.sources.claim.linked, 1);
  assert.equal(report.sources.claim.existing, 1);
  assert.equal(report.sources.claim.noMatch, 1);
  assert.equal(report.sources.issue.linked, 1);
  assert.equal(report.sources.study_leave.linked, 2);
  assert.equal(report.created, undefined);
  assert.equal(links.length, 4);
  assert.ok(links.every((l) => l.member_id && l.ref_id && l.confidence > 0));
});

/* 10) الإجازات: رقم الصرف يتغلب على الاسم */
check("مطابقة الإجازة برقم الصرف", () => {
  const { links } = buildAutoLinkPlan({
    members,
    studyLeaves: [
      {
        id: "leave-9",
        name: "اسم مختلف تمامًا",
        employeeCode: "1007",
        leaveKind: "اجازة دراسية",
      },
    ],
    sources: ["study_leave"],
  });
  assert.equal(links.length, 1);
  assert.equal(links[0].member_id, "m7");
  assert.equal(links[0].matched_by, "exact_code");
});

console.log(`\n✅ كل الاختبارات نجحت (${passed}).`);
