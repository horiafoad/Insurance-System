import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDedupeKey,
  buildTemplateParams,
  buildTrackingUrl,
  buildWhatsAppMessage,
  isNotifiableStatus,
  normalizePhoneToIntl,
  normalizeStatus,
  RECEIVED_STATUS,
} from "../../../supabase/functions/_shared/whatsappMessages.js";

const request = {
  id: 1024,
  name: "مقدم الطلب",
  phone: "01132853275",
  status: "قيد التنفيذ",
  notes: "سبب داخلي",
  updated_at: "2026-11-18T09:30:00.000Z",
  created_at: "2026-11-17T09:30:00.000Z",
};

const base = "https://insurance-system-9et.pages.dev/";

test("phone normalisation accepts Egyptian mobile formats", () => {
  assert.equal(normalizePhoneToIntl("01132853275"), "201132853275");
  assert.equal(normalizePhoneToIntl("+20 113 285 3275"), "201132853275");
  assert.equal(normalizePhoneToIntl("00201132853275"), "201132853275");
  assert.equal(normalizePhoneToIntl("201132853275"), "201132853275");
  assert.equal(normalizePhoneToIntl("1132853275"), "201132853275");
});

test("phone normalisation rejects missing/invalid numbers", () => {
  assert.equal(normalizePhoneToIntl(""), null);
  assert.equal(normalizePhoneToIntl(null), null);
  assert.equal(normalizePhoneToIntl("12345"), null);
  assert.equal(normalizePhoneToIntl("0212345678"), null);
});

test("status aliases are normalised and received-status is not notifiable", () => {
  assert.equal(normalizeStatus("جديد"), "جديدة");
  assert.equal(normalizeStatus("مرفوض"), "مرفوضة");
  assert.equal(normalizeStatus("جاري التنفيذ"), "قيد التنفيذ");
  assert.equal(isNotifiableStatus("جديد"), true);
  assert.equal(isNotifiableStatus("مرفوض"), true);
  assert.equal(isNotifiableStatus(RECEIVED_STATUS), false);
});

test("in-progress message includes entity, request number, status, date and tracking link", () => {
  const text = buildWhatsAppMessage({
    request,
    status: "قيد التنفيذ",
    trackingBaseUrl: base,
  });

  assert.match(text, /كلية الهندسة – جامعة عين شمس/);
  assert.match(text, /رقم الطلب: 1024/);
  assert.match(text, /الحالة الجديدة: قيد التنفيذ/);
  assert.match(text, /تاريخ التحديث:/);
  assert.match(text, /https:\/\/insurance-system-9et\.pages\.dev\/\?track=1024/);
  assert.match(text, /لا يمكن تعديل حالة الطلب من خلال WhatsApp/);
});

test("completed message uses the completion wording", () => {
  const text = buildWhatsAppMessage({
    request: { ...request, status: "تم التنفيذ" },
    trackingBaseUrl: base,
  });
  assert.match(text, /تم الانتهاء من تنفيذ طلبكم بنجاح/);
  assert.match(text, /الحالة الجديدة: تم التنفيذ/);
});

test("rejected message includes reason only when explicitly allowed", () => {
  const withReason = buildWhatsAppMessage({
    request: { ...request, status: "مرفوضة" },
    status: "مرفوضة",
    trackingBaseUrl: base,
    includeRejectionReason: true,
  });
  assert.match(withReason, /تم رفض طلبكم/);
  assert.match(withReason, /سبب داخلي/);

  const withoutReason = buildWhatsAppMessage({
    request: { ...request, status: "مرفوضة" },
    status: "مرفوضة",
    trackingBaseUrl: base,
    includeRejectionReason: false,
  });
  assert.doesNotMatch(withoutReason, /سبب داخلي/);
});

test("tracking URL is omitted when unsafe", () => {
  assert.equal(buildTrackingUrl("http://example.com/", "1"), "");
  assert.equal(buildTrackingUrl("javascript:alert(1)", "1"), "");
  assert.equal(
    buildTrackingUrl("http://localhost:3000/", "1"),
    "http://localhost:3000/?track=1"
  );
});

test("dedupe key is stable for the same event and changes with status", () => {
  const a = buildDedupeKey({
    requestId: 1024,
    event: "status_change",
    status: "قيد التنفيذ",
    updatedAt: "2026-11-18T09:30:00.000Z",
  });
  const b = buildDedupeKey({
    requestId: "1024",
    event: "status_change",
    status: "قيد التنفيذ",
    updatedAt: "2026-11-18T09:30:00.000Z",
  });
  const c = buildDedupeKey({
    requestId: 1024,
    event: "status_change",
    status: "تم التنفيذ",
    updatedAt: "2026-11-18T09:31:00.000Z",
  });

  assert.equal(a, b);
  assert.notEqual(a, c);
});

test("template parameters follow the documented order", () => {
  const normal = buildTemplateParams({
    request,
    status: "قيد التنفيذ",
    trackingBaseUrl: base,
  });
  assert.equal(normal.rejected, false);
  assert.deepEqual(normal.params.slice(0, 1), ["1024"]);
  assert.equal(normal.params[1], "قيد التنفيذ");
  assert.match(normal.params[3], /track=1024/);

  const rejected = buildTemplateParams({
    request: { ...request, status: "مرفوضة" },
    status: "مرفوضة",
    trackingBaseUrl: base,
    includeRejectionReason: true,
  });
  assert.equal(rejected.rejected, true);
  assert.equal(rejected.params.length, 5);
  assert.equal(rejected.params[3], "سبب داخلي");
});
