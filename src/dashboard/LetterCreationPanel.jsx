import React, { useEffect, useMemo, useState } from "react";
import { supabase } from "../supabaseClient";

const today = new Date().toISOString().slice(0, 10);

const statusConfig = {
  in_progress: {
    label: "جاري التنفيذ",
    icon: "🔵",
    color: "#2563eb",
    background: "#eff6ff",
    border: "#bfdbfe",
  },
  completed: {
    label: "تم التنفيذ",
    icon: "🟢",
    color: "#16a34a",
    background: "#f0fdf4",
    border: "#bbf7d0",
  },
  waiting: {
    label: "في الانتظار",
    icon: "⚪",
    color: "#64748b",
    background: "#f8fafc",
    border: "#e2e8f0",
  },
};

export default function LetterCreationPanel() {
  const [senders, setSenders] = useState([]);
  const [qrCodes, setQrCodes] = useState([]);
  const [departments, setDepartments] = useState([]);

  const [letterNumber, setLetterNumber] = useState("");
  const [letterDate, setLetterDate] = useState(today);
  const [senderId, setSenderId] = useState("");
  const [senderSearch, setSenderSearch] = useState("");
  const [subject, setSubject] = useState("");
  const [notes, setNotes] = useState("");
  const [qrCodeId, setQrCodeId] = useState("");

  const [route, setRoute] = useState([]);
  const [selectedDepartmentId, setSelectedDepartmentId] = useState("");

  const [showNewSender, setShowNewSender] = useState(false);
  const [newSenderName, setNewSenderName] = useState("");

  const [loading, setLoading] = useState(true);
  const [savingLetter, setSavingLetter] = useState(false);
  const [savingSender, setSavingSender] = useState(false);

  const loadData = async () => {
    setLoading(true);

    const [sendersResult, qrResult, departmentsResult] =
      await Promise.all([
        supabase
          .from("letter_senders")
          .select("id,name,is_active")
          .eq("is_active", true)
          .order("name"),

        supabase
          .from("archive_qr_codes")
          .select("id,code,status,letter_id")
          .eq("status", "available")
          .is("letter_id", null)
          .order("id"),

        supabase
          .from("letter_departments")
          .select("id,name,is_active")
          .eq("is_active", true)
          .order("name"),
      ]);

    if (!sendersResult.error) {
      setSenders(sendersResult.data || []);
    }

    if (!qrResult.error) {
      const available = qrResult.data || [];
      setQrCodes(available);

      if (available.length > 0) {
        setQrCodeId(String(available[0].id));
      }
    }

    if (!departmentsResult.error) {
      setDepartments(departmentsResult.data || []);
    } else {
      console.error(
        "تعذر تحميل الإدارات:",
        departmentsResult.error
      );
    }

    setLoading(false);
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredSenders = useMemo(() => {
    const term = senderSearch.trim().toLowerCase();

    if (!term) return senders;

    return senders.filter((sender) =>
      sender.name.toLowerCase().includes(term)
    );
  }, [senders, senderSearch]);

  const selectedSender = senders.find(
    (sender) => String(sender.id) === String(senderId)
  );

  const availableDepartments = departments.filter(
    (department) =>
      !route.some(
        (item) => String(item.id) === String(department.id)
      )
  );

  const addDepartmentToRoute = () => {
    if (!selectedDepartmentId) return;

    const department = departments.find(
      (item) => String(item.id) === String(selectedDepartmentId)
    );

    if (!department) return;

    setRoute((prev) => [
      ...prev,
      {
        id: department.id,
        name: department.name,
      },
    ]);

    setSelectedDepartmentId("");
  };

  const removeDepartmentFromRoute = (index) => {
    setRoute((prev) => prev.filter((_, i) => i !== index));
  };

  const moveDepartment = (index, direction) => {
    setRoute((prev) => {
      const next = [...prev];
      const targetIndex = index + direction;

      if (
        targetIndex < 0 ||
        targetIndex >= next.length
      ) {
        return prev;
      }

      const temp = next[index];
      next[index] = next[targetIndex];
      next[targetIndex] = temp;

      return next;
    });
  };

  const handleCreateSender = async () => {
    const name = newSenderName.trim();

    if (!name) {
      alert("من فضلك اكتب اسم الجهة");
      return;
    }

    setSavingSender(true);

    const { data, error } = await supabase
      .from("letter_senders")
      .insert({
        name,
        is_active: true,
      })
      .select("id,name,is_active")
      .single();

    if (error) {
      if (error.code === "23505") {
        const { data: existing } = await supabase
          .from("letter_senders")
          .select("id,name,is_active")
          .eq("name", name)
          .maybeSingle();

        if (existing) {
          setSenders((prev) => {
            const exists = prev.some(
              (item) => item.id === existing.id
            );

            return exists
              ? prev
              : [...prev, existing].sort((a, b) =>
                  a.name.localeCompare(b.name, "ar")
                );
          });

          setSenderId(String(existing.id));
          setSenderSearch(existing.name);
          setNewSenderName("");
          setShowNewSender(false);
        } else {
          alert("حدث خطأ أثناء إنشاء الجهة");
        }
      } else {
        alert("تعذر إنشاء الجهة: " + error.message);
      }

      setSavingSender(false);
      return;
    }

    setSenders((prev) =>
      [...prev, data].sort((a, b) =>
        a.name.localeCompare(b.name, "ar")
      )
    );

    setSenderId(String(data.id));
    setSenderSearch(data.name);
    setNewSenderName("");
    setShowNewSender(false);
    setSavingSender(false);
  };

  const handleSaveLetter = async () => {
    if (!qrCodeId) {
      alert("لا يوجد كود QR متاح حاليًا");
      return;
    }

    if (!letterNumber.trim()) {
      alert("من فضلك أدخل رقم الخطاب");
      return;
    }

    if (!letterDate) {
      alert("من فضلك اختر تاريخ الخطاب");
      return;
    }

    if (!senderId) {
      alert("من فضلك اختر الجهة المرسلة");
      return;
    }

    if (!subject.trim()) {
      alert("من فضلك أدخل موضوع الخطاب");
      return;
    }

    if (route.length === 0) {
      alert("من فضلك أضف إدارة واحدة على الأقل إلى مسار الخطاب");
      return;
    }

    setSavingLetter(true);

    const selectedQr = qrCodes.find(
      (qr) => String(qr.id) === String(qrCodeId)
    );

    const { data: letter, error: letterError } =
      await supabase
        .from("letters")
        .insert({
          qr_code_id: Number(qrCodeId),
          letter_number: letterNumber.trim(),
          letter_date: letterDate,
          sender_id: Number(senderId),
          subject: subject.trim(),
          status: "in_progress",
          notes: notes.trim() || null,
        })
        .select("id")
        .single();

    if (letterError) {
      alert("تعذر حفظ الخطاب: " + letterError.message);
      setSavingLetter(false);
      return;
    }

    const movementRows = route.map((department, index) => ({
      letter_id: letter.id,
      department_id: Number(department.id),
      step_order: index + 1,
      received_at:
        index === 0
          ? new Date().toISOString()
          : new Date().toISOString(),
      sent_at: null,
      action: null,
      notes: null,
      status: index === 0 ? "in_progress" : "waiting",
    }));

    const { error: movementError } = await supabase
      .from("letter_movements")
      .insert(movementRows);

    if (movementError) {
      alert(
        "تم إنشاء الخطاب، ولكن حدث خطأ أثناء حفظ مسار الخطاب:\n" +
          movementError.message
      );
      setSavingLetter(false);
      return;
    }

    const usedAt = new Date().toISOString();

    const { error: qrError } = await supabase
      .from("archive_qr_codes")
      .update({
        status: "used",
        letter_id: letter.id,
        used_at: usedAt,
      })
      .eq("id", Number(qrCodeId));

    if (qrError) {
      alert(
        "تم حفظ الخطاب ومساره، ولكن حدث خطأ أثناء ربط كود QR:\n" +
          qrError.message
      );
      setSavingLetter(false);
      return;
    }

    alert(
      "تم حفظ الخطاب بنجاح ✅\n\n" +
        "رقم الخطاب: " +
        letterNumber.trim() +
        "\n" +
        "كود QR: " +
        (selectedQr?.code || "") +
        "\n" +
        "عدد محطات المسار: " +
        route.length
    );

    setLetterNumber("");
    setLetterDate(today);
    setSenderId("");
    setSenderSearch("");
    setSubject("");
    setNotes("");
    setQrCodeId("");
    setRoute([]);
    setSelectedDepartmentId("");

    window.location.reload();
  };

  return (
    <div
      style={{
        background: "#fff",
        borderRadius: 18,
        padding: 24,
        marginBottom: 24,
        border: "1px solid #e5e7eb",
        boxShadow: "0 8px 30px rgba(15,23,42,.06)",
        direction: "rtl",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
          marginBottom: 22,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2
            style={{
              margin: 0,
              fontSize: 21,
              fontWeight: 800,
              color: "#0f172a",
            }}
          >
            ✉️ إنشاء خطاب جديد
          </h2>

          <div
            style={{
              marginTop: 7,
              color: "#64748b",
              fontSize: 14,
            }}
          >
            إنشاء الخطاب وربطه بكود QR ثابت لمتابعة حركته بين الإدارات
          </div>
        </div>

        <div
          style={{
            padding: "9px 14px",
            borderRadius: 12,
            background: "#f1f5f9",
            color: "#334155",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {loading
            ? "جاري التحميل..."
            : `${qrCodes.length} كود QR متاح`}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit,minmax(240px,1fr))",
          gap: 16,
        }}
      >
        <Field label="رقم الخطاب">
          <input
            value={letterNumber}
            onChange={(e) => setLetterNumber(e.target.value)}
            placeholder="مثال: 1254"
            style={inputStyle}
          />
        </Field>

        <Field label="تاريخ الخطاب">
          <input
            type="date"
            value={letterDate}
            onChange={(e) => setLetterDate(e.target.value)}
            style={inputStyle}
          />
        </Field>

        <Field label="كود QR">
          <select
            value={qrCodeId}
            onChange={(e) => setQrCodeId(e.target.value)}
            style={inputStyle}
            disabled={loading || qrCodes.length === 0}
          >
            {qrCodes.length === 0 ? (
              <option value="">
                لا توجد أكواد متاحة
              </option>
            ) : (
              qrCodes.map((qr) => (
                <option key={qr.id} value={qr.id}>
                  {qr.code}
                </option>
              ))
            )}
          </select>
        </Field>

        <Field label="الجهة المرسلة">
          <div style={{ display: "flex", gap: 8 }}>
            <div
              style={{
                position: "relative",
                flex: 1,
              }}
            >
              <input
                value={
                  selectedSender?.name ||
                  senderSearch
                }
                onChange={(e) => {
                  setSenderSearch(e.target.value);
                  setSenderId("");
                }}
                placeholder="ابحث عن الجهة..."
                style={inputStyle}
              />

              {senderSearch &&
                !senderId &&
                filteredSenders.length > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      top: "calc(100% + 5px)",
                      right: 0,
                      left: 0,
                      background: "#fff",
                      border: "1px solid #e2e8f0",
                      borderRadius: 12,
                      boxShadow:
                        "0 12px 30px rgba(15,23,42,.12)",
                      zIndex: 20,
                      maxHeight: 220,
                      overflowY: "auto",
                    }}
                  >
                    {filteredSenders.map((sender) => (
                      <button
                        key={sender.id}
                        type="button"
                        onClick={() => {
                          setSenderId(String(sender.id));
                          setSenderSearch(sender.name);
                        }}
                        style={{
                          width: "100%",
                          border: 0,
                          background: "#fff",
                          padding: "11px 13px",
                          textAlign: "right",
                          cursor: "pointer",
                          fontSize: 14,
                          color: "#334155",
                        }}
                      >
                        {sender.name}
                      </button>
                    ))}
                  </div>
                )}
            </div>

            <button
              type="button"
              onClick={() => setShowNewSender(true)}
              style={newButtonStyle}
              title="إنشاء جهة جديدة"
            >
              +
            </button>
          </div>

          {selectedSender && (
            <div
              style={{
                marginTop: 7,
                fontSize: 12,
                color: "#15803d",
                fontWeight: 700,
              }}
            >
              ✓ تم اختيار: {selectedSender.name}
            </div>
          )}
        </Field>

        <div style={{ gridColumn: "1 / -1" }}>
          <Field label="موضوع الخطاب">
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="اكتب موضوع الخطاب..."
              style={inputStyle}
            />
          </Field>
        </div>

        <div style={{ gridColumn: "1 / -1" }}>
          <Field label="ملاحظات">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="أي ملاحظات إضافية..."
              rows={3}
              style={{
                ...inputStyle,
                resize: "vertical",
                minHeight: 80,
              }}
            />
          </Field>
        </div>
      </div>

      <div
        style={{
          marginTop: 28,
          padding: 20,
          borderRadius: 16,
          background:
            "linear-gradient(135deg,#f8fafc 0%,#eff6ff 100%)",
          border: "1px solid #dbeafe",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 16,
          }}
        >
          <div>
            <h3
              style={{
                margin: 0,
                color: "#0f172a",
                fontSize: 18,
                fontWeight: 800,
              }}
            >
              🧭 مسار الخطاب
            </h3>

            <div
              style={{
                marginTop: 5,
                color: "#64748b",
                fontSize: 13,
              }}
            >
              أضف الإدارات بالترتيب الذي سيتحرك من خلاله الخطاب
            </div>
          </div>

          <div
            style={{
              padding: "8px 12px",
              borderRadius: 10,
              background: "#fff",
              border: "1px solid #dbeafe",
              color: "#1e40af",
              fontSize: 13,
              fontWeight: 800,
            }}
          >
            {route.length} محطة
          </div>
        </div>

        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "stretch",
            marginBottom: 20,
          }}
        >
          <select
            value={selectedDepartmentId}
            onChange={(e) =>
              setSelectedDepartmentId(e.target.value)
            }
            disabled={loading || availableDepartments.length === 0}
            style={{
              ...inputStyle,
              flex: 1,
              minWidth: 0,
            }}
          >
            <option value="">
              {availableDepartments.length === 0
                ? "تمت إضافة كل الإدارات"
                : "اختر الإدارة لإضافتها إلى المسار..."}
            </option>

            {availableDepartments.map((department) => (
              <option
                key={department.id}
                value={department.id}
              >
                {department.name}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={addDepartmentToRoute}
            disabled={!selectedDepartmentId}
            style={{
              border: 0,
              borderRadius: 11,
              padding: "0 20px",
              background: selectedDepartmentId
                ? "#2563eb"
                : "#cbd5e1",
              color: "#fff",
              fontWeight: 800,
              cursor: selectedDepartmentId
                ? "pointer"
                : "not-allowed",
              whiteSpace: "nowrap",
            }}
          >
            + إضافة
          </button>
        </div>

        {route.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "28px 16px",
              borderRadius: 14,
              border: "1px dashed #cbd5e1",
              background: "#fff",
              color: "#64748b",
              fontSize: 14,
            }}
          >
            لم تتم إضافة أي إدارة بعد.
            <br />
            اختر الإدارات من القائمة بالأعلى لبناء مسار الخطاب.
          </div>
        ) : (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 0,
            }}
          >
            {route.map((department, index) => {
              const isFirst = index === 0;
              const config = isFirst
                ? statusConfig.in_progress
                : statusConfig.waiting;

              return (
                <div
                  key={`${department.id}-${index}`}
                  style={{
                    display: "flex",
                    alignItems: "stretch",
                    minHeight: 92,
                  }}
                >
                  <div
                    style={{
                      width: 52,
                      minWidth: 52,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                    }}
                  >
                    <div
                      style={{
                        width: 42,
                        height: 42,
                        borderRadius: "50%",
                        background: config.background,
                        border: `3px solid ${config.color}`,
                        color: config.color,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontWeight: 900,
                        fontSize: 15,
                        boxSizing: "border-box",
                        zIndex: 2,
                      }}
                    >
                      {isFirst ? "▶" : index + 1}
                    </div>

                    {index < route.length - 1 && (
                      <div
                        style={{
                          width: 3,
                          flex: 1,
                          minHeight: 42,
                          background:
                            "linear-gradient(#2563eb,#cbd5e1)",
                        }}
                      />
                    )}
                  </div>

                  <div
                    style={{
                      flex: 1,
                      marginBottom:
                        index < route.length - 1 ? 10 : 0,
                      marginRight: 10,
                      background: "#fff",
                      border:
                        `1px solid ${config.border}`,
                      borderRadius: 14,
                      padding: "12px 14px",
                      boxShadow:
                        "0 4px 14px rgba(15,23,42,.05)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontSize: 11,
                          color: "#94a3b8",
                          fontWeight: 800,
                          marginBottom: 3,
                        }}
                      >
                        المحطة {index + 1}
                      </div>

                      <div
                        style={{
                          color: "#0f172a",
                          fontSize: 15,
                          fontWeight: 900,
                        }}
                      >
                        {department.name}
                      </div>

                      <div
                        style={{
                          marginTop: 5,
                          color: config.color,
                          fontSize: 12,
                          fontWeight: 800,
                        }}
                      >
                        {config.icon} {config.label}
                      </div>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: 5,
                        flexWrap: "wrap",
                        justifyContent: "flex-end",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() =>
                          moveDepartment(index, -1)
                        }
                        disabled={index === 0}
                        title="تحريك لأعلى"
                        style={routeActionStyle(
                          index !== 0
                        )}
                      >
                        ↑
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          moveDepartment(index, 1)
                        }
                        disabled={
                          index === route.length - 1
                        }
                        title="تحريك لأسفل"
                        style={routeActionStyle(
                          index !== route.length - 1
                        )}
                      >
                        ↓
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          removeDepartmentFromRoute(index)
                        }
                        title="حذف من المسار"
                        style={{
                          ...routeActionStyle(true),
                          color: "#dc2626",
                          borderColor: "#fecaca",
                          background: "#fff",
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {route.length > 0 && (
          <div
            style={{
              marginTop: 18,
              padding: 12,
              borderRadius: 12,
              background: "#fff",
              border: "1px solid #e2e8f0",
              display: "flex",
              gap: 18,
              flexWrap: "wrap",
              fontSize: 12,
              fontWeight: 800,
            }}
          >
            <span style={{ color: "#16a34a" }}>
              🟢 تم التنفيذ
            </span>

            <span style={{ color: "#2563eb" }}>
              🔵 جاري التنفيذ
            </span>

            <span style={{ color: "#64748b" }}>
              ⚪ في الانتظار
            </span>
          </div>
        )}
      </div>

      <div
        style={{
          display: "flex",
          justifyContent: "flex-start",
          marginTop: 22,
        }}
      >
        <button
          type="button"
          onClick={handleSaveLetter}
          disabled={savingLetter || loading}
          style={{
            border: 0,
            borderRadius: 12,
            padding: "12px 24px",
            background:
              savingLetter || loading
                ? "#94a3b8"
                : "#0f172a",
            color: "#fff",
            fontSize: 15,
            fontWeight: 800,
            cursor:
              savingLetter || loading
                ? "not-allowed"
                : "pointer",
            boxShadow:
              "0 7px 18px rgba(15,23,42,.16)",
          }}
        >
          {savingLetter
            ? "جاري حفظ الخطاب..."
            : "💾 حفظ الخطاب"}
        </button>
      </div>

      {showNewSender && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 9999,
            padding: 20,
          }}
        >
          <div
            style={{
              width: "min(500px,100%)",
              background: "#fff",
              borderRadius: 20,
              padding: 24,
              boxShadow:
                "0 25px 70px rgba(0,0,0,.2)",
            }}
          >
            <h3
              style={{
                margin: "0 0 8px",
                color: "#0f172a",
                fontSize: 20,
              }}
            >
              + إنشاء جهة جديدة
            </h3>

            <p
              style={{
                margin: "0 0 18px",
                color: "#64748b",
                fontSize: 13,
              }}
            >
              اكتب اسم الجهة وسيتم حفظها لتظهر مع الخطابات القادمة.
            </p>

            <input
              autoFocus
              value={newSenderName}
              onChange={(e) =>
                setNewSenderName(e.target.value)
              }
              placeholder="اسم الجهة"
              style={inputStyle}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleCreateSender();
                }
              }}
            />

            <div
              style={{
                display: "flex",
                gap: 10,
                justifyContent: "flex-start",
                marginTop: 18,
              }}
            >
              <button
                type="button"
                onClick={handleCreateSender}
                disabled={savingSender}
                style={{
                  border: 0,
                  borderRadius: 11,
                  padding: "11px 20px",
                  background: "#0f172a",
                  color: "#fff",
                  fontWeight: 800,
                  cursor: savingSender
                    ? "not-allowed"
                    : "pointer",
                }}
              >
                {savingSender
                  ? "جاري الحفظ..."
                  : "حفظ الجهة"}
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowNewSender(false);
                  setNewSenderName("");
                }}
                style={{
                  border: "1px solid #cbd5e1",
                  borderRadius: 11,
                  padding: "11px 20px",
                  background: "#fff",
                  color: "#475569",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <label
        style={{
          display: "block",
          marginBottom: 7,
          color: "#334155",
          fontSize: 13,
          fontWeight: 800,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

function routeActionStyle(enabled) {
  return {
    width: 32,
    height: 32,
    border: "1px solid #cbd5e1",
    borderRadius: 8,
    background: enabled ? "#f8fafc" : "#f1f5f9",
    color: enabled ? "#334155" : "#cbd5e1",
    fontWeight: 900,
    cursor: enabled ? "pointer" : "not-allowed",
  };
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #cbd5e1",
  borderRadius: 11,
  padding: "11px 13px",
  background: "#fff",
  color: "#0f172a",
  fontSize: 14,
  outline: "none",
};

const newButtonStyle = {
  width: 44,
  minWidth: 44,
  border: 0,
  borderRadius: 11,
  background: "#0f172a",
  color: "#fff",
  fontSize: 24,
  fontWeight: 700,
  cursor: "pointer",
};
