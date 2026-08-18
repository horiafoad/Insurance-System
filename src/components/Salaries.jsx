import React, { useState } from "react";
import Salaries from "./components/Salaries";

export default function Salaries() {
  const [month, setMonth] = useState("أغسطس");
  const [year, setYear] = useState("2026");
  const [paymentDay, setPaymentDay] = useState("10");

  const [formName, setFormName] = useState("");
  const [formCount, setFormCount] = useState("");

  const [forms, setForms] = useState([]);
  const [search, setSearch] = useState("");

  const addForm = (e) => {
    e.preventDefault();

    if (!formName.trim() || !formCount) {
      alert("من فضلك اكتبي اسم الاستمارة وعددها");
      return;
    }

    const newForm = {
      id: Date.now(),
      month,
      year,
      paymentDay,
      name: formName.trim(),
      count: Number(formCount),
    };

    setForms((prev) => [...prev, newForm]);

    setFormName("");
    setFormCount("");
  };

  const deleteForm = (id) => {
    setForms((prev) => prev.filter((form) => form.id !== id));
  };

  const filteredForms = forms.filter((form) =>
    form.name.toLowerCase().includes(search.toLowerCase())
  );

  const totalCount = useMemo(() => {
    return filteredForms.reduce((total, form) => total + form.count, 0);
  }, [filteredForms]);

  return (
    <div style={styles.page} dir="rtl">
      <div style={styles.header}>
        <div>
          <h1 style={styles.title}>💰 المرتبات</h1>
          <p style={styles.subtitle}>
            تسجيل ومتابعة استمارات المرتبات والصرفيات
          </p>
        </div>

        <div style={styles.totalBox}>
          <span>إجمالي عدد الاستمارات</span>
          <strong>{totalCount}</strong>
        </div>
      </div>

      {/* بيانات الصرفية */}
      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>📅 بيانات الصرفية</h2>

        <div style={styles.grid}>
          <div>
            <label style={styles.label}>الشهر</label>
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              style={styles.input}
            >
              <option>يناير</option>
              <option>فبراير</option>
              <option>مارس</option>
              <option>أبريل</option>
              <option>مايو</option>
              <option>يونيو</option>
              <option>يوليو</option>
              <option>أغسطس</option>
              <option>سبتمبر</option>
              <option>أكتوبر</option>
              <option>نوفمبر</option>
              <option>ديسمبر</option>
            </select>
          </div>

          <div>
            <label style={styles.label}>السنة</label>
            <input
              type="number"
              value={year}
              onChange={(e) => setYear(e.target.value)}
              style={styles.input}
            />
          </div>

          <div>
            <label style={styles.label}>موعد الصرف</label>
            <select
              value={paymentDay}
              onChange={(e) => setPaymentDay(e.target.value)}
              style={styles.input}
            >
              <option value="10">صرفية يوم 10</option>
              <option value="23">صرفية يوم 23</option>
            </select>
          </div>
        </div>
      </div>

      {/* إضافة استمارة */}
      <div style={styles.card}>
        <h2 style={styles.sectionTitle}>➕ تسجيل استمارة جديدة</h2>

        <form onSubmit={addForm}>
          <div style={styles.grid}>
            <div style={{ flex: 2 }}>
              <label style={styles.label}>اسم الاستمارة</label>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="مثال: استمارة مرتبات أعضاء هيئة التدريس"
                style={styles.input}
              />
            </div>

            <div>
              <label style={styles.label}>عدد الاستمارات</label>
              <input
                type="number"
                min="1"
                value={formCount}
                onChange={(e) => setFormCount(e.target.value)}
                placeholder="مثال: 3"
                style={styles.input}
              />
            </div>

            <div style={styles.buttonContainer}>
              <button type="submit" style={styles.addButton}>
                ➕ إضافة
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* البحث */}
      <div style={styles.card}>
        <div style={styles.searchRow}>
          <h2 style={styles.sectionTitle}>📋 الاستمارات المسجلة</h2>

          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔎 البحث باسم الاستمارة..."
            style={styles.searchInput}
          />
        </div>

        {filteredForms.length === 0 ? (
          <div style={styles.empty}>
            لا توجد استمارات مسجلة حتى الآن.
          </div>
        ) : (
          <div style={styles.tableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>م</th>
                  <th style={styles.th}>الشهر</th>
                  <th style={styles.th}>الصرفية</th>
                  <th style={styles.th}>اسم الاستمارة</th>
                  <th style={styles.th}>العدد</th>
                  <th style={styles.th}>الإجراء</th>
                </tr>
              </thead>

              <tbody>
                {filteredForms.map((form, index) => (
                  <tr key={form.id}>
                    <td style={styles.td}>{index + 1}</td>
                    <td style={styles.td}>
                      {form.month} {form.year}
                    </td>
                    <td style={styles.td}>
                      <span style={styles.badge}>
                        يوم {form.paymentDay}
                      </span>
                    </td>
                    <td style={styles.td}>{form.name}</td>
                    <td style={styles.td}>
                      <strong>{form.count}</strong>
                    </td>
                    <td style={styles.td}>
                      <button
                        onClick={() => deleteForm(form.id)}
                        style={styles.deleteButton}
                      >
                        🗑️ حذف
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>

              <tfoot>
                <tr>
                  <td colSpan="4" style={styles.totalLabel}>
                    الإجمالي
                  </td>
                  <td style={styles.totalNumber}>{totalCount}</td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  page: {
    padding: "24px",
    background: "#f8fafc",
    minHeight: "100%",
    color: "#1e293b",
  },

  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "20px",
    marginBottom: "24px",
  },

  title: {
    margin: 0,
    fontSize: "28px",
    color: "#0f4c81",
  },

  subtitle: {
    marginTop: "8px",
    color: "#64748b",
  },

  totalBox: {
    background: "#0f4c81",
    color: "white",
    padding: "16px 24px",
    borderRadius: "14px",
    textAlign: "center",
    minWidth: "150px",
  },

  card: {
    background: "white",
    borderRadius: "16px",
    padding: "22px",
    marginBottom: "20px",
    boxShadow: "0 4px 14px rgba(0,0,0,0.06)",
  },

  sectionTitle: {
    margin: "0 0 18px",
    fontSize: "20px",
    color: "#0f4c81",
  },

  grid: {
    display: "flex",
    gap: "16px",
    alignItems: "end",
    flexWrap: "wrap",
  },

  label: {
    display: "block",
    marginBottom: "7px",
    fontWeight: "700",
  },

  input: {
    width: "100%",
    minWidth: "190px",
    padding: "11px 12px",
    border: "1px solid #cbd5e1",
    borderRadius: "9px",
    fontSize: "15px",
    boxSizing: "border-box",
  },

  buttonContainer: {
    display: "flex",
    alignItems: "end",
  },

  addButton: {
    border: "none",
    background: "#0f4c81",
    color: "white",
    padding: "12px 22px",
    borderRadius: "9px",
    cursor: "pointer",
    fontWeight: "700",
    fontSize: "15px",
  },

  searchRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "15px",
    flexWrap: "wrap",
  },

  searchInput: {
    padding: "11px 14px",
    border: "1px solid #cbd5e1",
    borderRadius: "9px",
    width: "280px",
    fontSize: "14px",
  },

  empty: {
    padding: "35px",
    textAlign: "center",
    color: "#64748b",
  },

  tableWrapper: {
    overflowX: "auto",
  },

  table: {
    width: "100%",
    borderCollapse: "collapse",
  },

  th: {
    background: "#eaf2f8",
    padding: "13px",
    borderBottom: "1px solid #cbd5e1",
    textAlign: "right",
  },

  td: {
    padding: "13px",
    borderBottom: "1px solid #e2e8f0",
  },

  badge: {
    display: "inline-block",
    background: "#dbeafe",
    color: "#1d4ed8",
    padding: "5px 10px",
    borderRadius: "20px",
    fontWeight: "700",
  },

  deleteButton: {
    border: "none",
    background: "#fee2e2",
    color: "#b91c1c",
    padding: "7px 12px",
    borderRadius: "7px",
    cursor: "pointer",
  },

  totalLabel: {
    padding: "14px",
    textAlign: "right",
    fontWeight: "800",
  },

  totalNumber: {
    padding: "14px",
    fontWeight: "900",
    fontSize: "18px",
  },
};