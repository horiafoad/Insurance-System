import { useEffect, useState } from "react";
import { styles } from "./styles";
import {
  listAllPushDevices,
  setPushDeviceActive,
} from "../utils/pushNotifications";

export default function AdminPushDevicesPanel({ currentUser }) {
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadDevices = async () => {
    if (!currentUser?.id) return;
    setLoading(true);
    setError("");
    try {
      const result = await listAllPushDevices(currentUser.id);
      setDevices(result || []);
    } catch (e) {
      setError(e?.message || "تعذر تحميل قائمة الأجهزة.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDevices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser?.id]);

  const handleToggle = async (device) => {
    if (!currentUser?.id || !device?.endpoint) return;
    const target = !device.is_active;
    setLoading(true);
    setError("");
    try {
      const ok = await setPushDeviceActive(
        currentUser.id,
        device.endpoint,
        target
      );
      if (!ok) {
        setError(
          "تعذر تحديث الجهاز — تأكد من صلاحيتك كمسؤول."
        );
        return;
      }
      setDevices((prev) =>
        prev.map((d) =>
          d.endpoint === device.endpoint
            ? { ...d, is_active: target }
            : d
        )
      );
    } catch (e) {
      setError(e?.message || "تعذر تحديث الجهاز.");
    } finally {
      setLoading(false);
    }
  };

  const activeCount = devices.filter((d) => d.is_active).length;

  return (
    <div
      style={{
        ...styles.card,
        marginTop: 16,
        border: "1px solid #BFDBFE",
      }}
    >
      <div style={styles.cardHeader}>
        <div>
          <h2 style={styles.cardTitle}>
            👑 أجهزة الإشعارات لجميع المستخدمين
          </h2>
          <p style={styles.cardSub}>
            كل الموابيلات المسجّلة في الإشعارات على كل الحسابات — فعّل أو
            عطّل أي جهاز.
          </p>
        </div>
        <button
          onClick={loadDevices}
          disabled={loading}
          style={{
            ...styles.secondaryButton,
            opacity: loading ? 0.6 : 1,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "⏳ جاري التحميل..." : "🔄 تحديث"}
        </button>
      </div>

      {error && (
        <div style={{ ...styles.errorBox, marginTop: 12 }}>⛔ {error}</div>
      )}

      <div
        style={{
          marginTop: 12,
          fontSize: 13,
          fontWeight: 700,
          color: "#1E40AF",
        }}
      >
        إجمالي {devices.length} جهاز • {activeCount} نشط
      </div>

      {!loading && devices.length === 0 && !error && (
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
          لا توجد أجهزة مسجّلة حتى الآن.
        </div>
      )}

      <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
        {devices.map((device) => {
          const user = device.user || {};
          const userName =
            user.full_name ||
            user.username ||
            (user.role ? `(${user.role})` : "غير معروف");
          return (
            <div
              key={device.endpoint || device.id}
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
                  {userName}
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
                  {device.device_name || "جهاز"} • {device.platform || "web"} •
                  {device.created_at
                    ? " " +
                      new Date(
                        device.created_at
                      ).toLocaleDateString("ar-EG")
                    : ""}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "#94A3B8",
                    marginTop: 2,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    maxWidth: 420,
                    direction: "ltr",
                    textAlign: "left",
                  }}
                >
                  {device.fcm_token
                    ? "FCM: " + device.fcm_token.slice(0, 25) + "…"
                    : device.endpoint}
                </div>
              </div>
              <button
                onClick={() => handleToggle(device)}
                disabled={loading}
                style={{
                  ...styles.secondaryButton,
                  padding: "6px 10px",
                  fontSize: 12,
                  whiteSpace: "nowrap",
                  background: device.is_active
                    ? "#FEE2E2"
                    : "#D1FAE5",
                  color: device.is_active ? "#DC2626" : "#065F46",
                  opacity: loading ? 0.6 : 1,
                  cursor: loading ? "not-allowed" : "pointer",
                }}
              >
                {device.is_active ? "⛔ تعطيل" : "✅ تفعيل"}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}