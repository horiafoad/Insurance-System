// Supabase Edge Function: send-whatsapp
// إرسال إشعار WhatsApp رسمي إلى مقدم الطلب عند اكتمال طلبه.
//
// آلية العمل:
//   1) المتصفح يرسل للموظف الرقم { to, text } بعد اعتماد "تم التنفيذ".
//   2) الدالة ترسل الرسالة عبر WhatsApp Cloud API الرسمي من Meta.
//   3) النصوص السرية مقيمة على السيرفر فقط (Supabase Dashboard) ولا تصل
//      أبدًا إلى الواجهة أو إلى GitHub.
//
// وضع الاستعداد (قبل توفير رقم الإدارة الرسمي):
//   دون تكوين المتغيرات التالية ترجع الدالة 503 not-configured ولا ترسل
//   أي شيء — فتبقى آمنة في وضع "جاهزة للتفعيل" والواجهة لا تستدعيها إطلاقًا
//   (VITE_WHATSAPP_OFFICIAL_ENABLED غير مفعلة في .env).
//
// المتغيرات المطلوبة (Supabase Dashboard -> Edge Functions -> Secrets):
//   WHATSAPP_TOKEN            توكن وصول دائم من Meta (permanent access token)
//   WHATSAPP_PHONE_NUMBER_ID  رقم معرف الهاتف (Phone Number ID) لخط الإدارة الرسمي
//   WHATSAPP_SERVICE_KEY      (اختياري) مفتاح تحقق إضافي؛ يُرسله المتصفح في
//                             header باسم x-whatsapp-key. إن لم يُضبط تعمل
//                             الدالة بدونه (غير مستحسن إلا مؤقتًا).
//
// استدعاء:
//   POST { to: "2010xxxxxxxx", text: "نص الرسالة" }
//   headers: { apikey, authorization (anon) , x-whatsapp-key? }
//
// ملاحظة أمان: الرقم { to } قادم من سجل مقدم الطلب، والنصوص السرية لخط
// الإدارة قادمة من السيرفر فقط ولا تُرسل إلى العميل أبدًا.

const GRAPH_VERSION = "v20.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-whatsapp-key",
};

function json(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return json({ ok: false, error: "method_not_allowed" }, 405);
  }

  const token = Deno.env.get("WHATSAPP_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  const serviceKey = Deno.env.get("WHATSAPP_SERVICE_KEY");

  // وضع الاستعداد: لم تتوفر مفاتيح الإدارة الرسمي بعد — لا إرسال إطلاقًا.
  if (!token || !phoneNumberId) {
    return json(
      { ok: false, error: "not_configured" },
      503
    );
  }

  // تحقق اختياري: إن ضُبط WHATSAPP_SERVICE_KEY فيجب تطابقه مع الرأس.
  if (
    serviceKey &&
    req.headers.get("x-whatsapp-key") !== serviceKey
  ) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  let payload: { to?: unknown; text?: unknown };
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, error: "invalid_json" }, 400);
  }

  const to = String(payload.to || "").replace(/\D/g, "");
  const text = String(payload.text || "").trim();

  if (!to || !text || text.length > 4096) {
    return json({ ok: false, error: "invalid_payload" }, 400);
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to,
          type: "text",
          text: { body: text },
        }),
      }
    );

    const data = await res.json();

    if (!res.ok) {
      console.error("WhatsApp Cloud API error:", data);
      return json(
        {
          ok: false,
          error: "whatsapp_api_error",
          detail: data?.error?.message || "unknown",
        },
        502
      );
    }

    return json({
      ok: true,
      messageId: data?.messages?.[0]?.id || null,
    });
  } catch (e) {
    console.error("send-whatsapp exception:", e);
    return json(
      { ok: false, error: "internal", detail: String(e?.message || e) },
      500
    );
  }
});