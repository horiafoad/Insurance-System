import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "../supabaseClient";
import { styles } from "./styles";
import { canManageSupport } from "../utils/permissions";
import SupportAdminPanel from "./SupportAdminPanel";
import {
  upsertRowInList,
  removeRowFromList,
  useRealtimeSync,
} from "../utils/realtimeSync";

const STATUS_COLORS = {
  "جديدة": { background: "#DBEAFE", color: "#1D4ED8" },
  "جاري الدعم": { background: "#FEF3C7", color: "#B45309" },
  "جاري المعالجة": { background: "#FEF3C7", color: "#B45309" },
  "تم الحل": { background: "#D1FAE5", color: "#047857" },
  "مغلقة": { background: "#E2E8F0", color: "#475569" },
};

// كشف اسم الجهاز تلقائيًا من بيانات المتصفح (بدون أي صلاحيات إضافية)
function detectDeviceName() {
  if (typeof navigator === "undefined") return "";
  const ua = navigator.userAgent || "";
  const platform = navigator.platform || "";
  let os = platform;
  if (/Android/i.test(ua)) os = "Android";
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS";
  else if (/Windows|Win/i.test(platform)) os = "Windows";
  else if (/Mac/i.test(platform)) os = "macOS";
  else if (/Linux/i.test(platform)) os = "Linux";
  let browser = "متصفح";
  if (/Edg\//.test(ua)) browser = "Edge";
  else if (/Chrome\//.test(ua)) browser = "Chrome";
  else if (/Firefox\//.test(ua)) browser = "Firefox";
  else if (/Safari\//.test(ua)) browser = "Safari";
  return `${os} - ${browser}`;
}

// تحويل صورة إلى Data URL مصغّرة (JPEG) لتخزينها اختياريًا مع الطلب.
function fileToResizedDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("تعذر قراءة الصورة"));
      img.onload = () => {
        const MAX = 900;
        let { width, height } = img;
        if (width > MAX) {
          height = Math.round((height * MAX) / width);
          width = MAX;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);
        try {
          resolve(canvas.toDataURL("image/jpeg", 0.7));
        } catch (e) {
          reject(e);
        }
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

function timeLabel(createdAt) {
  if (!createdAt) return "";
  try {
    return new Date(createdAt).toLocaleString("ar-EG", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

export default function SupportDrawerButton({ currentUser }) {
  const [open, setOpen] = useState(false);
  const [showNewForm, setShowNewForm] = useState(false);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [description, setDescription] = useState("");
  const [screenshotData, setScreenshotData] = useState("");
  const [departmentName, setDepartmentName] = useState("");
  const [savedMessage, setSavedMessage] = useState("");
  const [error, setError] = useState("");
  const [previewScreenshot, setPreviewScreenshot] = useState("");
  const fileInputRef = useRef(null);

  // وضع مسؤول الدعم: يرى إدارة الدعم + عدّاد كل الطلبات المفتوحة.
  const isSupportManager = useMemo(
    () => canManageSupport(currentUser),
    [currentUser]
  );
  const [activeTab, setActiveTab] = useState("manage");
  const [allRequests, setAllRequests] = useState([]);
  const [deviceName, setDeviceName] = useState(() => detectDeviceName());
  const [meshDeviceId, setMeshDeviceId] = useState("");

  const supportFilter = useMemo(
    () =>
      currentUser?.id
        ? { user_id: `eq.${currentUser.id}` }
        : undefined,
    [currentUser]
  );

  const loadRequests = async () => {
    if (!currentUser?.id) return;
    setLoading(true);
    setError("");
    try {
      const { data, error: loadError } = await supabase
        .from("support_requests")
        .select("*")
        .eq("user_id", currentUser.id)
        .order("created_at", { ascending: false })
        .limit(100);

      if (loadError) throw loadError;
      setRequests(data || []);
    } catch (e) {
      console.error("تعذر تحميل طلبات الدعم:", e);
      setError("تعذر تحميل طلبات الدعم: " + (e?.message || ""));
    } finally {
      setLoading(false);
    }
  };

  // جميع الطلبات (لعدّاد مسؤول الدعم فورًا بدون فتح الطلبات)
  const loadAllRequests = async () => {
    if (!isSupportManager) return;
    try {
      const { data, error: loadError } = await supabase
        .from("support_requests")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (loadError) throw loadError;
      setAllRequests(data || []);
    } catch (e) {
      console.error("تعذر تحميل طلبات الدعم الإدارية:", e);
    }
  };

  // اسم الإدارة تلقائيًا من المستخدم الحالي (letter_departments)
  useEffect(() => {
    if (!currentUser?.department_id) return;
    let mounted = true;
    supabase
      .from("letter_departments")
      .select("name")
      .eq("id", currentUser.department_id)
      .maybeSingle()
      .then(({ data }) => {
        if (mounted && data?.name) setDepartmentName(data.name);
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [currentUser?.department_id]);

  const handleToggle = () => {
    if (open) {
      setOpen(false);
    } else {
      setOpen(true);
      if (currentUser?.id) loadRequests();
      if (isSupportManager) loadAllRequests();
    }
  };

  // تحديث فوري للعداد والقائمة عبر Realtime (إن كان مفعّلًا في المشروع)
  useRealtimeSync({
    table: "support_requests",
    enabled: Boolean(currentUser?.id),
    filter: supportFilter,
    apply: (payload) => {
      if (payload.eventType === "INSERT") {
        setRequests((prev) =>
          upsertRowInList(prev, payload.new, { pk: "id" })
        );
      } else if (payload.eventType === "UPDATE") {
        setRequests((prev) =>
          upsertRowInList(prev, payload.new, { pk: "id" })
        );
      } else if (payload.eventType === "DELETE") {
        setRequests((prev) =>
          removeRowFromList(prev, payload.old || payload.new, { pk: "id" })
        );
      }
    },
  });

  // تحديث فوري لعدّاد مسؤول الدعم (كل الطلبات المفتوحة) — مثل إشعار WhatsApp
  useRealtimeSync({
    table: "support_requests",
    enabled: Boolean(isSupportManager),
    apply: (payload) => {
      if (payload.eventType === "INSERT") {
        setAllRequests((prev) =>
          upsertRowInList(prev, payload.new, { pk: "id" })
        );
      } else if (payload.eventType === "UPDATE") {
        setAllRequests((prev) =>
          upsertRowInList(prev, payload.new, { pk: "id" })
        );
      } else if (payload.eventType === "DELETE") {
        setAllRequests((prev) =>
          removeRowFromList(prev, payload.old || payload.new, { pk: "id" })
        );
      }
    },
  });

  // عدّاد الطلبات التي تحتاج متابعة (جديدة / جاري الدعم)
  const openRequestsCount = useMemo(() => {
    const list = isSupportManager ? allRequests : requests;
    return list.filter(
      (item) => !["تم الحل", "مغلقة"].includes(item.status || "جديدة")
    ).length;
  }, [isSupportManager, allRequests, requests]);

  const handleFileSelect = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const dataUrl = await fileToResizedDataUrl(file);
      setScreenshotData(dataUrl);
    } catch (e) {
      console.error(e);
      setError("تعذر قراءة الصورة المرفقة.");
    }
  };

  const submitRequest = async () => {
    if (!description.trim()) {
      setError("من فضلك اكتب وصف المشكلة.");
      return;
    }
    setSubmitting(true);
    setError("");
    setSavedMessage("");
    try {
      const { error: insertError } = await supabase
        .from("support_requests")
        .insert({
          user_id: currentUser?.id || null,
          employee_name:
            currentUser?.full_name || currentUser?.username || "",
          department_id: currentUser?.department_id || null,
          department_name: departmentName,
          description: description.trim(),
          device_name: deviceName.trim() || null,
          mesh_device_id: meshDeviceId.trim() || null,
          screenshot_url: screenshotData || null,
          status: "جديدة",
        });

      if (insertError) throw insertError;

      await loadRequests();
      if (isSupportManager) await loadAllRequests();
      setDescription("");
      setScreenshotData("");
      setMeshDeviceId("");
      setShowNewForm(false);
      setSavedMessage("✅ تم إرسال طلب الدعم بنجاح.");
    } catch (e) {
      console.error("تعذر إرسال طلب الدعم:", e);
      setError("تعذر إرسال طلب الدعم: " + (e?.message || ""));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleToggle}
        title="الدعم الفني"
        aria-label="الدعم الفني"
        style={{
          ...styles.secondaryButton,
          position: "relative",
          whiteSpace: "nowrap",
        }}
      >
        🛠️ الدعم الفني

        {openRequestsCount > 0 && (
          <span
            style={{
              position: "absolute",
              top: -6,
              right: -6,
              minWidth: 20,
              height: 20,
              borderRadius: "50%",
              background: "#DC2626",
              color: "#fff",
              fontSize: 11,
              display: "grid",
              placeItems: "center",
              padding: "0 4px",
            }}
          >
            {openRequestsCount > 9 ? "9+" : openRequestsCount}
          </span>
        )}
      </button>

      {open && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              background: "rgba(15,23,42,0.45)",
            }}
            onClick={() => setOpen(false)}
          />

          <div
            dir="rtl"
            style={{
              position: "absolute",
              top: 0,
              bottom: 0,
              right: 0,
              width: isSupportManager
                ? "min(720px, 96vw)"
                : "min(430px, 94vw)",
              background: "#fff",
              boxShadow: "0 0 40px rgba(15,23,42,0.3)",
              overflowY: "auto",
              padding: "18px 18px 30px",
              boxSizing: "border-box",
            }}
          >
            <div style={styles.modalHeader}>
              <h2 style={styles.modalTitle}>🛠️ الدعم الفني</h2>

              <button
                style={styles.closeButton}
                onClick={() => setOpen(false)}
              >
                ✕
              </button>
            </div>

            {isSupportManager && (
              <div
                style={{
                  display: "flex",
                  gap: 8,
                  marginBottom: 14,
                  flexWrap: "wrap",
                }}
              >
                <button
                  onClick={() => setActiveTab("manage")}
                  style={{
                    ...(activeTab === "manage"
                      ? styles.excelButton
                      : styles.secondaryButton),
                    borderRadius: 8,
                    padding: "9px 14px",
                    fontSize: 13,
                  }}
                >
                  🛠️ إدارة الدعم الفني
                </button>
                <button
                  onClick={() => setActiveTab("mine")}
                  style={{
                    ...(activeTab === "mine"
                      ? styles.excelButton
                      : styles.secondaryButton),
                    borderRadius: 8,
                    padding: "9px 14px",
                    fontSize: 13,
                  }}
                >
                  📬 طلباتي
                </button>
              </div>
            )}

            {savedMessage && (
              <div style={styles.successBox}>{savedMessage}</div>
            )}

            {error && <div style={styles.errorBox}>{error}</div>}

            {isSupportManager && activeTab === "manage" ? (
              <SupportAdminPanel currentUser={currentUser} />
            ) : showNewForm ? (
              <>
                <div style={styles.detailHeader}>
                  <strong>طلب دعم جديد</strong>
                  <button
                    style={styles.linkButton}
                    onClick={() => setShowNewForm(false)}
                  >
                    عرض طلباتي السابقة
                  </button>
                </div>

                <div style={{ marginTop: 14 }}>
                  <label style={styles.label}>اسم الموظف</label>
                  <input
                    style={styles.input}
                    value={
                      currentUser?.full_name ||
                      currentUser?.username ||
                      ""
                    }
                    readOnly
                  />
                </div>

                <div style={{ marginTop: 14 }}>
                  <label style={styles.label}>الإدارة</label>
                  <input
                    style={styles.input}
                    value={departmentName || "غير محددة"}
                    readOnly
                  />
                </div>

                <div style={{ marginTop: 14 }}>
                  <label style={styles.label}>
                    اسم الجهاز{" "}
                    <small style={{ color: "#94A3B8", fontWeight: 400 }}>
                      (يُكتشف تلقائيًا ويمكن تعديله)
                    </small>
                  </label>
                  <input
                    style={styles.input}
                    value={deviceName}
                    onChange={(e) => setDeviceName(e.target.value)}
                    placeholder="مثال: مكتب مسؤول الشؤون - Windows Chrome"
                  />
                </div>

                <div style={{ marginTop: 14 }}>
                  <label style={styles.label}>
                    معرف الجهاز في MeshCentral{" "}
                    <small style={{ color: "#94A3B8", fontWeight: 400 }}>
                      (اختياري)
                    </small>
                  </label>
                  <input
                    style={styles.input}
                    value={meshDeviceId}
                    onChange={(e) => setMeshDeviceId(e.target.value)}
                    placeholder="اكتب المعرف من لوحة MeshCentral إن كان متاحًا..."
                  />
                </div>

                <div style={{ marginTop: 14 }}>
                  <label style={styles.label}>وصف المشكلة</label>
                  <textarea
                    rows={5}
                    style={styles.textarea}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="اكتب وصفًا واضحًا للمشكلة التي تواجهها في النظام..."
                  />
                </div>

                <div style={{ marginTop: 14 }}>
                  <label style={styles.label}>
                    إرفاق Screenshot (اختياري)
                  </label>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    style={{ display: "none" }}
                  />

                  {screenshotData ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        flexWrap: "wrap",
                      }}
                    >
                      <img
                        src={screenshotData}
                        alt="Screenshot"
                        style={{
                          maxWidth: "100%",
                          maxHeight: 160,
                          borderRadius: 10,
                          border: "1px solid #E2E8F0",
                        }}
                      />
                      <button
                        style={styles.linkButton}
                        onClick={() => {
                          setScreenshotData("");
                        }}
                      >
                        إزالة
                      </button>
                    </div>
                  ) : (
                    <button
                      style={{
                        ...styles.excelButton,
                        width: "100%",
                      }}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      📷 اختيار صورة
                    </button>
                  )}
                </div>

                <div style={styles.modalActions}>
                  <button
                    style={styles.primaryButton}
                    disabled={submitting}
                    onClick={submitRequest}
                  >
                    {submitting
                      ? "⏳ جاري الإرسال..."
                      : "إرسال طلب الدعم"}
                  </button>
                  <button
                    style={styles.secondaryButton}
                    onClick={() => setShowNewForm(false)}
                  >
                    إلغاء
                  </button>
                </div>
              </>
            ) : (
              <>
                <button
                  style={{
                    ...styles.primaryButton,
                    width: "100%",
                    marginBottom: 16,
                  }}
                  onClick={() => {
                    setError("");
                    setSavedMessage("");
                    setShowNewForm(true);
                  }}
                >
                  + طلب دعم جديد
                </button>

                <div style={styles.cardHeader}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: 16 }}>
                      طلباتي السابقة
                    </h3>
                  </div>
                </div>

                {loading && requests.length === 0 ? (
                  <div style={styles.empty}>⏳ جاري التحميل...</div>
                ) : requests.length === 0 ? (
                  <div style={styles.empty}>
                    لا توجد طلبات دعم سابقة.
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {requests.map((item) => {
                      const statusColor =
                        STATUS_COLORS[item.status] || STATUS_COLORS["جديدة"];
                      return (
                        <div
                          key={item.id}
                          style={{
                            border: "1px solid #E2E8F0",
                            borderRadius: 12,
                            padding: 12,
                            background: "#F8FAFC",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              gap: 8,
                              marginBottom: 6,
                            }}
                          >
                            <span
                              style={{
                                ...styles.statusBadge,
                                background: statusColor.background,
                                color: statusColor.color,
                              }}
                            >
                              {item.status || "جديدة"}
                            </span>
                            <small style={{ color: "#94A3B8" }}>
                              {timeLabel(item.created_at)}
                            </small>
                          </div>

                          <p
                            style={{
                              margin: 0,
                              fontSize: 13,
                              lineHeight: 1.7,
                              whiteSpace: "pre-wrap",
                              wordBreak: "break-word",
                            }}
                          >
                            {item.description}
                          </p>

                          {(item.device_name || item.mesh_device_id) && (
                            <div
                              style={{
                                marginTop: 8,
                                fontSize: 12,
                                color: "#334155",
                                background: "#EEF2F6",
                                borderRadius: 8,
                                padding: "6px 9px",
                                display: "inline-block",
                              }}
                            >
                              🖥️ {item.device_name || "جهاز"}
                              {item.mesh_device_id && (
                                <span
                                  style={{
                                    direction: "ltr",
                                    display: "inline-block",
                                  }}
                                >
                                  {" "}({item.mesh_device_id})
                                </span>
                              )}
                            </div>
                          )}

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
                            >
                              💬 ملاحظات الدعم: {item.resolution_notes}
                            </div>
                          )}

                          {item.screenshot_url && (
                            <div style={{ marginTop: 8 }}>
                              <img
                                src={item.screenshot_url}
                                alt="Screenshot"
                                style={{
                                  maxWidth: "100%",
                                  maxHeight: 200,
                                  borderRadius: 10,
                                  border: "1px solid #E2E8F0",
                                  cursor: "pointer",
                                }}
                                onClick={() =>
                                  setPreviewScreenshot(item.screenshot_url)
                                }
                              />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {previewScreenshot && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1100,
            background: "rgba(15,23,42,0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={() => setPreviewScreenshot("")}
        >
          <img
            src={previewScreenshot}
            alt="Screenshot"
            style={{
              maxWidth: "90vw",
              maxHeight: "90vh",
              borderRadius: 12,
              background: "#fff",
              boxShadow: "0 20px 50px rgba(15,23,42,0.4)",
            }}
          />
        </div>
      )}
    </>
  );
}