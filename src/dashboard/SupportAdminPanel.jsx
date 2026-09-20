import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "../supabaseClient";
import { styles } from "./styles";
import { applyRowChange, useRealtimeSync } from "../utils/realtimeSync";
import {
  buildMeshCentralDeviceUrl,
  isMeshCentralConfigured,
} from "../utils/meshCentral";

/* =========================================================================
   لوحة إدارة الدعم الفني (تابع داخل تبويب "إدارة الدعم الفني")
   - قائمة واضحة وسريعة بكل الطلبات بدون فتح تفاصيل لمعرفة الحالة.
   - "🖥️ بدء الدعم عن بُعد": يسجّل بدء الدعم + يفتح MeshCentral في تبويب جديد.
   - "إنهاء الدعم": يسجّل النهاية وملاحظات الحل ويحسب مدة الجلسة.
   - تحديث لحظي عبر useRealtimeSync (تعديل الصف المتأثر فقط بلا Refetch).
   ========================================================================= */

const SUPPORT_STATUS_META = {
  "جديدة": { icon: "🟡", color: "#1D4ED8", bg: "#DBEAFE" },
  "جاري الدعم": { icon: "🔵", color: "#B45309", bg: "#FEF3C7" },
  "جاري المعالجة": { icon: "🔵", color: "#B45309", bg: "#FEF3C7" },
  "تم الحل": { icon: "🟢", color: "#047857", bg: "#D1FAE5" },
  "مغلقة": { icon: "⚪", color: "#64748B", bg: "#F1F5F9" },
};

const SUPPORT_STATUS_OPTIONS = ["جديدة", "جاري الدعم", "تم الحل", "مغلقة"];

function formatTime(value) {
  if (!value) return "—";
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return String(value);
    return date.toLocaleString("ar-EG", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function formatDuration(startedAt, endedAt) {
  if (!startedAt) return "—";
  const start = new Date(startedAt);
  if (Number.isNaN(start.getTime())) return "—";
  const end = endedAt ? new Date(endedAt) : new Date();
  if (Number.isNaN(end.getTime())) return "—";
  const minutes = Math.max(0, Math.floor((end - start) / 60000));
  if (minutes < 1) return "أقل من دقيقة";
  if (minutes < 60) return `${minutes} دقيقة`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} س و ${rest} د` : `${hours} ساعة`;
}

function truncate(text, max) {
  if (!text) return "";
  const value = String(text);
  return value.length > max ? value.slice(0, max).trimEnd() + "…" : value;
}

function statusBadgeStyle(status) {
  const meta = SUPPORT_STATUS_META[status] || SUPPORT_STATUS_META["جديدة"];
  return {
    ...styles.statusBadge,
    background: meta.bg,
    color: meta.color,
    display: "inline-block",
  };
}

const STAT_CARDS = [
  { key: "جديدة", title: "جديدة", icon: "🟡", bg: "#DBEAFE" },
  { key: "جاري الدعم", title: "جاري الدعم", icon: "🔵", bg: "#FEF3C7" },
  { key: "تم الحل", title: "تم الحل", icon: "🟢", bg: "#D1FAE5" },
  { key: "مغلقة", title: "مغلقة", icon: "⚪", bg: "#F1F5F9" },
];

export default function SupportAdminPanel({ currentUser }) {
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState(null);
  const [endTarget, setEndTarget] = useState(null);
  const [endNotes, setEndNotes] = useState("");
  const [endingNotes, setEndingNotes] = useState("");
  const [endError, setEndError] = useState("");
  const adminName =
    currentUser?.full_name || currentUser?.username || "";

  useEffect(() => {
    let mounted = true;
    supabase
      .from("support_requests")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200)
      .then(({ data, error: loadError }) => {
        if (!mounted) return;
        if (loadError) {
          console.error("تعذر تحميل طلبات الدعم الفني:", loadError);
          setError(
            "تعذر تحميل طلبات الدعم الفني: " + (loadError?.message || "")
          );
        } else {
          setRequests(data || []);
        }
      })
      .catch((e) => {
        if (!mounted) return;
        console.error("تعذر تحميل طلبات الدعم الفني:", e);
        setError("تعذر تحميل طلبات الدعم الفني: " + (e?.message || ""));
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, []);

  /* تحديث لحظي: الصف المتأثر فقط (إدراج/تعديل/حذف) بلا إعادة جلب كامل */
  useRealtimeSync({
    table: "support_requests",
    apply: (payload) => {
      setRequests((prev) =>
        applyRowChange(prev, payload, { pk: "id", insert: "head" })
      );
    },
  });

  const stats = useMemo(() => {
    const counts = { "جديدة": 0, "جاري الدعم": 0, "تم الحل": 0, "مغلقة": 0 };
    requests.forEach((item) => {
      const key = item.status === "جاري المعالجة" ? "جاري الدعم" : item.status;
      if (counts[key] != null) counts[key] += 1;
    });
    return counts;
  }, [requests]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return requests.filter((item) => {
      if (statusFilter !== "all") {
        const mapped =
          item.status === "جاري المعالجة" ? "جاري الدعم" : item.status;
        if (mapped !== statusFilter) return false;
      }
      if (!keyword) return true;
      const haystack = [
        item.employee_name,
        item.department_name,
        item.device_name,
        item.mesh_device_id,
        item.description,
        item.assigned_admin_name,
        item.resolution_notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(keyword);
    });
  }, [requests, statusFilter, search]);

  const openMeshCentral = (row) => {
    const url = buildMeshCentralDeviceUrl({
      deviceId: row.mesh_device_id,
      deviceName: row.device_name,
    });
    if (url) {
      window.open(url, "_blank", "noopener,noreferrer");
    } else {
      setNotice(
        "لم يُضبط عنوان خادم MeshCentral بعد (VITE_MESH_CENTRAL_URL). " +
          "افتح لوحة التحكم يدويًا من الخادم المحلي."
      );
    }
  };

  const startSupport = async (row) => {
    setBusyId(row.id);
    setError("");
    setNotice("");
    const now = new Date().toISOString();
    try {
      const { error: updateError } = await supabase
        .from("support_requests")
        .update({
          status: "جاري الدعم",
          started_at: now,
          assigned_admin_id: currentUser?.id || null,
          assigned_admin_name: adminName || null,
        })
        .eq("id", row.id);
      if (updateError) throw updateError;

      setRequests((prev) =>
        prev.map((item) =>
          item.id === row.id
            ? {
                ...item,
                status: "جاري الدعم",
                started_at: now,
                assigned_admin_id: currentUser?.id || null,
                assigned_admin_name: adminName || null,
              }
            : item
        )
      );

      openMeshCentral({ ...row, status: "جاري الدعم", started_at: now });
    } catch (e) {
      console.error("تعذر بدء الدعم:", e);
      setError("تعذر بدء الدعم: " + (e?.message || ""));
    } finally {
      setBusyId(null);
    }
  };

  const confirmEndSupport = async () => {
    if (!endTarget) return;
    if (!endNotes.trim()) {
      setEndError("اكتب ملاحظات الحل قبل إنهاء الدعم.");
      return;
    }
    setEndingNotes(true);
    setEndError("");
    const now = new Date().toISOString();
    try {
      const { error: updateError } = await supabase
        .from("support_requests")
        .update({
          status: "تم الحل",
          ended_at: now,
          resolution_notes: endNotes.trim(),
        })
        .eq("id", endTarget.id);
      if (updateError) throw updateError;

      setRequests((prev) =>
        prev.map((item) =>
          item.id === endTarget.id
            ? {
                ...item,
                status: "تم الحل",
                ended_at: now,
                resolution_notes: endNotes.trim(),
              }
            : item
        )
      );
      setEndTarget(null);
      setEndNotes("");
    } catch (e) {
      console.error("تعذر إنهاء الدعم:", e);
      setEndError("تعذر إنهاء الدعم: " + (e?.message || ""));
    } finally {
      setEndingNotes(false);
    }
  };

  const changeStatus = async (row, nextStatus) => {
    setBusyId(row.id);
    setError("");
    try {
      const patch = { status: nextStatus };
      if (
        (nextStatus === "تم الحل" || nextStatus === "مغلقة") &&
        !row.ended_at
      ) {
        patch.ended_at = new Date().toISOString();
      }
      const { error: updateError } = await supabase
        .from("support_requests")
        .update(patch)
        .eq("id", row.id);
      if (updateError) throw updateError;

      setRequests((prev) =>
        prev.map((item) => (item.id === row.id ? { ...item, ...patch } : item))
      );
    } catch (e) {
      console.error("تعذر تغيير حالة الطلب:", e);
      setError("تعذر تغيير الحالة: " + (e?.message || ""));
    } finally {
      setBusyId(null);
    }
  };

  const exportExcel = () => {
    const rows = filtered.map((item) => ({
      "اسم الموظف": item.employee_name || "",
      "الإدارة": item.department_name || "",
      "اسم الجهاز": item.device_name || "",
      "معرف الجهاز (MeshCentral)": item.mesh_device_id || "",
      "وصف المشكلة": item.description || "",
      "تاريخ الطلب": formatTime(item.created_at),
      "الحالة": item.status || "",
      "مسؤول الدعم": item.assigned_admin_name || "",
      "بدء الدعم": formatTime(item.started_at),
      "نهاية الدعم": formatTime(item.ended_at),
      "مدة الجلسة": formatDuration(item.started_at, item.ended_at),
      "ملاحظات الحل": item.resolution_notes || "",
    }));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet(rows),
      "سجل الدعم الفني"
    );
    XLSX.writeFile(workbook, "سجل-الدعم-الفني.xlsx");
  };

  const meshConfigured = isMeshCentralConfigured();

  return (
    <div dir="rtl">
      {!meshConfigured && (
        <div
          style={{
            background: "#FFFBEB",
            border: "1px solid #FDE68A",
            color: "#92400E",
            borderRadius: 10,
            padding: "10px 12px",
            marginBottom: 12,
            fontSize: 12,
            lineHeight: 1.7,
          }}
        >
          ⚙️ لم يضبط رابط خادم MeshCentral بعد. زر «بدء الدعم عن بُعد» سيسجّل
          الجلسة داخل النظام، ويُفتح خادم MeshCentral يدويًا حتى تُضبط
          <code style={{ direction: "ltr", display: "inline-block", marginInline: 4 }}>
            VITE_MESH_CENTRAL_URL
          </code>
          من إعداد مركزي واحد.
        </div>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        {STAT_CARDS.map((card) => (
          <div
            key={card.key}
            style={{
              flex: "1 1 120px",
              background: "#fff",
              border: "1px solid #E7EBF0",
              borderRadius: 12,
              padding: "12px 14px",
              display: "flex",
              alignItems: "center",
              gap: 10,
              minWidth: 120,
            }}
          >
            <span
              style={{
                width: 36,
                height: 36,
                borderRadius: 10,
                background: card.bg,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 18,
              }}
            >
              {card.icon}
            </span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 20, fontWeight: 900 }}>
                {stats[card.key] || 0}
              </div>
              <div style={{ fontSize: 12, color: "#64748B" }}>{card.title}</div>
            </div>
          </div>
        ))}
      </div>

      {/* فلترة + تصدير */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
        <select
          style={{
            ...styles.filterSelect,
            minWidth: 150,
            padding: "9px 11px",
          }}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="all">كل الحالات</option>
          {SUPPORT_STATUS_OPTIONS.map((value) => (
            <option key={value} value={value}>
              {value}
            </option>
          ))}
        </select>

        <input
          style={{
            flex: 1,
            minWidth: 180,
            border: "1px solid #CBD5E1",
            borderRadius: 8,
            padding: "9px 11px",
            fontSize: 13,
            boxSizing: "border-box",
          }}
          placeholder="🔍 بحث: الموظف / الإدارة / الجهاز / المشكلة"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <button
          style={{
            ...styles.excelButton,
            padding: "9px 14px",
            fontSize: 13,
          }}
          onClick={exportExcel}
          disabled={filtered.length === 0}
          title="تصدير سجل الدعم الفني Excel"
        >
          📊 سجل الدعم
        </button>
      </div>

      {notice && <div style={styles.infoBox}>{notice}</div>}
      {error && <div style={styles.errorBox}>{error}</div>}

      {loading && requests.length === 0 ? (
        <div style={styles.empty}>⏳ جاري تحميل طلبات الدعم الفني...</div>
      ) : filtered.length === 0 ? (
        <div style={styles.empty}>
          {requests.length === 0
            ? "لا توجد طلبات دعم فني حتى الآن."
            : "لا توجد طلبات مطابقة للفلاتر الحالية."}
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {filtered.map((item) => {
            const meta =
              SUPPORT_STATUS_META[item.status] || SUPPORT_STATUS_META["جديدة"];
            const isActive = item.status === "جاري الدعم" || item.status === "جاري المعالجة";
            return (
              <div
                key={item.id}
                style={{
                  border: "1px solid #E2E8F0",
                  borderRadius: 12,
                  padding: 13,
                  background: item.status === "جديدة" ? "#F8FAFC" : "#fff",
                }}
              >
                {/* السطر الأول: الموظف + الإدارة + الحالة + تاريخ الطلب */}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <strong style={{ fontSize: 14, color: "#0F172A" }}>
                      👤 {item.employee_name || "موظف غير معروف"}
                    </strong>
                    <div style={{ fontSize: 12, color: "#64748B", marginTop: 2 }}>
                      🏢 {item.department_name || "غير محددة"}
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
                    <span style={statusBadgeStyle(item.status)}>
                      {meta.icon} {item.status || "جديدة"}
                    </span>
                    <small style={{ color: "#94A3B8", fontSize: 11 }}>
                      {formatTime(item.created_at)}
                    </small>
                  </div>
                </div>

                {/* الجهاز */}
                {(item.device_name || item.mesh_device_id) && (
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 12,
                      color: "#334155",
                      background: "#F1F5F9",
                      borderRadius: 8,
                      padding: "6px 9px",
                      display: "inline-block",
                    }}
                  >
                    🖥️ {item.device_name || "جهاز"}
                    {item.mesh_device_id && (
                      <span style={{ direction: "ltr", display: "inline-block", marginInlineStart: 6 }}>
                        ({item.mesh_device_id})
                      </span>
                    )}
                  </div>
                )}

                {/* وصف المشكلة (مختصر مع العنوان الكامل) */}
                <p
                  style={{
                    margin: "8px 0 0",
                    fontSize: 13,
                    lineHeight: 1.7,
                    color: "#1E293B",
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                  }}
                  title={item.description}
                >
                  {truncate(item.description, 160)}
                </p>

                {/* توقيت الجلسة */}
                {(item.started_at || item.ended_at) && (
                  <div
                    style={{
                      marginTop: 8,
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "6px 14px",
                      fontSize: 12,
                      color: "#475569",
                      background: "#F8FAFC",
                      borderRadius: 8,
                      padding: "7px 9px",
                    }}
                  >
                    <span>
                      🚀 بدء الدعم: <strong>{formatTime(item.started_at)}</strong>
                    </span>
                    <span>
                      🏁 نهاية الدعم: <strong>{formatTime(item.ended_at)}</strong>
                    </span>
                    <span>
                      ⏱️ المدة: <strong>{formatDuration(item.started_at, item.ended_at)}</strong>
                    </span>
                    {item.assigned_admin_name && (
                      <span>🧑‍💻 {item.assigned_admin_name}</span>
                    )}
                  </div>
                )}

                {/* ملاحظات الحل */}
                {item.resolution_notes && (
                  <div
                    style={{
                      marginTop: 8,
                      fontSize: 12,
                      lineHeight: 1.7,
                      color: "#065F46",
                      background: "#ECFDF5",
                      border: "1px solid #A7F3D0",
                      borderRadius: 8,
                      padding: "7px 9px",
                    }}
                    title={item.resolution_notes}
                  >
                    💬 ملاحظات الحل: {truncate(item.resolution_notes, 200)}
                  </div>
                )}

                {/* الإجراءات */}
                <div
                  style={{
                    marginTop: 10,
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    flexWrap: "wrap",
                    borderTop: "1px solid #EEF2F6",
                    paddingTop: 9,
                  }}
                >
                  {!isActive && item.status !== "تم الحل" && item.status !== "مغلقة" && (
                    <button
                      style={{
                        ...styles.primaryButton,
                        padding: "8px 13px",
                        fontSize: 12,
                        background: "#7C3AED",
                      }}
                      disabled={busyId === item.id}
                      onClick={() => startSupport(item)}
                    >
                      {busyId === item.id
                        ? "⏳ جاري البدء..."
                        : "🖥️ بدء الدعم عن بُعد"}
                    </button>
                  )}

                  {isActive && (
                    <button
                      style={{
                        ...styles.secondaryButton,
                        padding: "8px 13px",
                        fontSize: 12,
                      }}
                      onClick={() => openMeshCentral(item)}
                    >
                      🖥️ فتح MeshCentral
                    </button>
                  )}

                  {isActive && (
                    <button
                      style={{
                        ...styles.manualClaimButton,
                        padding: "8px 13px",
                        fontSize: 12,
                        background: "#047857",
                      }}
                      onClick={() => {
                        setEndTarget(item);
                        setEndNotes(item.resolution_notes || "");
                        setEndError("");
                      }}
                    >
                      🏁 إنهاء الدعم
                    </button>
                  )}

                  {/* تغيير الحالة (صلاحية مسؤول الدعم) */}
                  <select
                    style={{
                      ...styles.statusSelect,
                      padding: "7px 8px",
                      marginInlineStart: "auto",
                    }}
                    value={
                      item.status === "جاري المعالجة" ? "جاري الدعم" : item.status
                    }
                    disabled={busyId === item.id}
                    onChange={(e) => changeStatus(item, e.target.value)}
                    title="تغيير حالة الطلب"
                  >
                    {SUPPORT_STATUS_OPTIONS.map((value) => (
                      <option key={value} value={value}>
                        {value === "جديدة" ? "🟡" : value === "جاري الدعم" ? "🔵" : value === "تم الحل" ? "🟢" : "⚪"}{" "}
                        {value}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* نافذة إنهاء الدعم */}
      {endTarget && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1200,
            background: "rgba(15,23,42,0.55)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={() => setEndTarget(null)}
        >
          <div
            dir="rtl"
            style={{
              background: "#fff",
              borderRadius: 15,
              width: "min(460px, 100%)",
              padding: 20,
              boxShadow: "0 20px 50px rgba(15,23,42,0.35)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={styles.modalHeader}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800 }}>
                🏁 إنهاء الدعم
              </h3>
              <button style={styles.closeButton} onClick={() => setEndTarget(null)}>
                ✕
              </button>
            </div>

            <div
              style={{
                fontSize: 13,
                color: "#334155",
                lineHeight: 1.8,
                marginBottom: 12,
              }}
            >
              <div>
                👤 <strong>{endTarget.employee_name || ""}</strong>
                {endTarget.device_name ? ` — 🖥️ ${endTarget.device_name}` : ""}
              </div>
              <div style={{ color: "#64748B", marginTop: 4 }}>
                بدأ الدعم: {formatTime(endTarget.started_at)} — المدة حتى الآن:{" "}
                <strong>{formatDuration(endTarget.started_at, new Date().toISOString())}</strong>
              </div>
            </div>

            <label style={styles.label}>ملاحظات الحل (مطلوبة)</label>
            <textarea
              rows={4}
              style={styles.textarea}
              value={endNotes}
              onChange={(e) => setEndNotes(e.target.value)}
              placeholder="مثال: تم تحديث إصدار التطبيق وإعادة تشغيل الجهاز وحُلّت المشكلة..."
            />

            {endError && <div style={{ ...styles.errorBox, marginTop: 10 }}>{endError}</div>}

            <div style={styles.modalActions}>
              <button
                style={{ ...styles.primaryButton, background: "#047857" }}
                disabled={endingNotes}
                onClick={confirmEndSupport}
              >
                {endingNotes ? "⏳ جاري الحفظ..." : "✅ إنهاء وتأكيد الحل"}
              </button>
              <button style={styles.secondaryButton} onClick={() => setEndTarget(null)}>
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}