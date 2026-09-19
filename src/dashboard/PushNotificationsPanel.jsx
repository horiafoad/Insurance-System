import React, { useEffect, useState } from "react";
import { styles } from "./styles";
import AndroidPushDiagnostics from "./AndroidPushDiagnostics";
import {
  isPushSupported,
  enablePushNotifications,
  disablePushNotifications,
  listPushDevices,
  deactivatePushDevice,
  sendTestNotification,
} from "../utils/pushNotifications";

export default function PushNotificationsPanel({ currentUser }) {
  const [supported, setSupported] = useState(false);
  const [devices, setDevices] = useState([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [permission, setPermission] = useState("default");

  const loadDevices = async () => {
    if (!currentUser?.id) return;
    const result = await listPushDevices(currentUser.id);
    setDevices(result);
  };

  useEffect(() => {
    setSupported(isPushSupported());
    if ("Notification" in window) {
      setPermission(Notification.permission);
    }
    loadDevices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  const handleEnable = async () => {
    setError("");
    setStatus("");
    setLoading(true);
    try {
      await enablePushNotifications(currentUser);
      setStatus("تم تفعيل إشعارات الموبايل لهذا الجهاز بنجاح.");
      if ("Notification" in window) setPermission(Notification.permission);
      await loadDevices();
    } catch (e) {
      setError(e?.message || "تعذر تفعيل الإشعارات.");
    } finally {
      setLoading(false);
    }
  };

  const handleDisableCurrent = async () => {
    setError("");
    setStatus("");
    setLoading(true);
    try {
      await disablePushNotifications(currentUser);
      setStatus("تم إيقاف الإشعارات لهذا الجهاز.");
      await loadDevices();
    } catch (e) {
      setError(e?.message || "تعذر إيقاف الإشعارات.");
    } finally {
      setLoading(false);
    }
  };

  const handleDisableDevice = async (endpoint) => {
    if (!currentUser?.id) return;
    setLoading(true);
    try {
      await deactivatePushDevice(currentUser.id, endpoint);
      setDevices((prev) =>
        prev.map((d) =>
          d.endpoint === endpoint ? { ...d, is_active: false } : d
        )
      );
    } catch (e) {
      setError(e?.message || "تعذر تعطيل الجهاز.");
    } finally {
      setLoading(false);
    }
  };

  const handleTest = async () => {
    if (!currentUser?.id) return;
    setError("");
    setStatus("");
    setLoading(true);
    try {
      await sendTestNotification(currentUser.id);
      setStatus("تم إرسال إشعار تجريبي. تحقق من إشعارات جهازك.");
    } catch (e) {
      setError(e?.message || "تعذر إرسال الإشعار التجريبي.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.card}>
      <div style={styles.cardHeader}>
        <div>
          <h2 style={styles.cardTitle}>🔔 أجهزتي والإشعارات</h2>
          <p style={styles.cardSub}>
            فعّل إشعارات الموبايل ليصلك تنبيه فوري عند وصول طلب جديد أو تغيير
            حالة طلب أو إضافة ملاحظة.
          </p>
        </div>
      </div>

      <AndroidPushDiagnostics currentUser={currentUser} />

      {!supported ? (
        <div style={styles.errorBox}>
          ⚠️ متصفحك الحالي لا يدعم إشعارات الدفع — استخدم أحدث إصدار من Chrome أو
          Edge على أندرويد، أو Safari على آيفون، أو المتصفحات الحديثة على الحاسوب.
          <br />
          كما تأكد من نشر الموقع عبر HTTPS قبل استخدام الإشعارات.
        </div>
      ) : (
        <>
          {error && (
            <div style={{ ...styles.errorBox, marginTop: 12 }}>⛔ {error}</div>
          )}
          {status && (
            <div
              style={{
                marginTop: 12,
                padding: 12,
                borderRadius: 8,
                background: "#D1FAE5",
                color: "#065F46",
                border: "1px solid #A7F3D0",
              }}
            >
              ✅ {status}
            </div>
          )}

          <div
            style={{
              marginTop: 16,
              display: "flex",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={handleEnable}
              disabled={loading}
              style={{
                ...styles.primaryButton,
                opacity: loading ? 0.6 : 1,
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "⏳ جاري التنفيذ..." : "📱 تفعيل إشعارات الموبايل"}
            </button>

            {(permission === "granted" ||
              devices.some((d) => d.is_active)) && (
              <>
                <button
                  onClick={handleTest}
                  disabled={loading}
                  style={{
                    ...styles.secondaryButton,
                    opacity: loading ? 0.6 : 1,
                    cursor: loading ? "not-allowed" : "pointer",
                  }}
                >
                  🔔 إرسال إشعار تجريبي
                </button>
                <button
                  onClick={handleDisableCurrent}
                  disabled={loading}
                  style={{
                    ...styles.secondaryButton,
                    background: "#FEE2E2",
                    color: "#DC2626",
                    opacity: loading ? 0.6 : 1,
                    cursor: loading ? "not-allowed" : "pointer",
                  }}
                >
                  ⛔ إيقاف إشعارات هذا الجهاز
                </button>
              </>
            )}
          </div>

          <div style={{ marginTop: 24 }}>
            <h3 style={styles.cardTitle}>📱 الأجهزة المشتركة</h3>
            <p style={styles.cardSub}>
              الأجهزة التي سُجّل لها الإشعار بحسابك. يمكنك تعطيل أي جهاز دون حذف
              حسابه.
            </p>

            {devices.length === 0 ? (
              <div
                style={{
                  marginTop: 12,
                  padding: 16,
                  background: "#F8FAFC",
                  borderRadius: 8,
                  fontSize: 13,
                  color: "#64748B",
                }}
              >
                لا توجد أجهزة مسجلة بعد — اضغط "تفعيل إشعارات الموبايل" لبدء
                استقبال التنبيهات على هذا الجهاز.
              </div>
            ) : (
              <div
                style={{
                  marginTop: 12,
                  display: "grid",
                  gap: 10,
                }}
              >
                {devices.map((device) => (
                  <div
                    key={device.endpoint}
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      gap: 12,
                      padding: 12,
                      border: "1px solid #E2E8F0",
                      borderRadius: 8,
                      background: device.is_active ? "#F8FAFC" : "#F1F5F9",
                      opacity: device.is_active ? 1 : 0.6,
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontWeight: 700,
                          fontSize: 13,
                          color: "#1E293B",
                        }}
                      >
                        {device.device_name || "جهاز"}
                        {device.is_active ? (
                          <span style={{ color: "#047857", fontWeight: 600 }}>
                            {" "}
                            • نشط
                          </span>
                        ) : (
                          <span style={{ color: "#DC2626", fontWeight: 600 }}>
                            {" "}
                            • معطّل
                          </span>
                        )}
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "#64748B",
                          marginTop: 2,
                        }}
                      >
                        {device.platform || "web"} •{" "}
                        {device.created_at
                          ? new Date(
                              device.created_at
                            ).toLocaleDateString("ar-EG")
                          : ""}
                      </div>
                    </div>
                    {device.is_active && (
                      <button
                        onClick={() => handleDisableDevice(device.endpoint)}
                        disabled={loading}
                        style={{
                          ...styles.secondaryButton,
                          padding: "6px 10px",
                          fontSize: 12,
                          whiteSpace: "nowrap",
                          background: "#FEE2E2",
                          color: "#DC2626",
                          opacity: loading ? 0.6 : 1,
                          cursor: loading ? "not-allowed" : "pointer",
                        }}
                      >
                        ⛔ تعطيل
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div
            style={{
              marginTop: 24,
              padding: 14,
              background: "#EFF6FF",
              borderRadius: 8,
              fontSize: 12,
              color: "#1E40AF",
              lineHeight: 1.8,
            }}
          >
            💡 <strong>كيف يعمل؟</strong> عند وصول طلب جديد أو تحديث حالته أو
            إضافة ملاحظة، يصلك إشعار فوري حتى لو كان التطبيق مغلقاً. الضغط على
            الإشعار يفتح الطلب مباشرة. يبقى إشعار الموبايل مفعّلاً طالما كان
            الجهاز متصلاً بالإنترنت، ويتوقف تلقائياً عند تعطيله أو حذف الحساب.
          </div>
        </>
      )}
    </div>
  );
}