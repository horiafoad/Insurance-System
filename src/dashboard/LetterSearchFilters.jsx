import React, { useMemo } from "react";
import { LETTER_STATUS_LABELS } from "../utils/letterHelpers";

// بحث موحّد (اسم / رقم خطاب / QR) + فلاتر (إدارة، نوع، حالة، فترة،
// أرشفة) — بند 2. الحالة (state) بتتمسك في الأب (LettersTrackingPage)
// عشان تتلخبط مع نفس منطق تحميل الخطابات الموجود بالفعل.

export default function LetterSearchFilters({
  search,
  onSearchChange,
  filters,
  onFiltersChange,
  departments = [],
  letters = [],
}) {
  const letterTypes = useMemo(() => {
    const set = new Set(
      letters.map((l) => l.letter_type).filter(Boolean)
    );
    return [...set];
  }, [letters]);

  const setFilter = (key, value) => {
    onFiltersChange({ ...filters, [key]: value || undefined });
  };

  return (
    <div
      style={{
        background: "#FFFFFF",
        border: "1px solid #E2E8F0",
        borderRadius: "17px",
        padding: "16px",
        marginBottom: "20px",
        display: "flex",
        flexDirection: "column",
        gap: "12px",
      }}
    >
      <input
        type="text"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="ابحث بالاسم، رقم الخطاب، أو كود QR..."
        style={inputStyle}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns:
            "repeat(auto-fit, minmax(150px, 1fr))",
          gap: "10px",
        }}
      >
        <select
          value={filters.departmentId || ""}
          onChange={(e) => setFilter("departmentId", e.target.value)}
          style={inputStyle}
        >
          <option value="">كل الإدارات</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>

        <select
          value={filters.letterType || ""}
          onChange={(e) => setFilter("letterType", e.target.value)}
          style={inputStyle}
        >
          <option value="">كل الأنواع</option>
          {letterTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>

        <select
          value={filters.status || ""}
          onChange={(e) => setFilter("status", e.target.value)}
          style={inputStyle}
        >
          <option value="">كل الحالات</option>
          {Object.entries(LETTER_STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>

        <select
          value={filters.archivedOnly || ""}
          onChange={(e) => setFilter("archivedOnly", e.target.value)}
          style={inputStyle}
        >
          <option value="">مؤرشف وغير مؤرشف</option>
          <option value="archived">مؤرشف فقط</option>
          <option value="not_archived">غير مؤرشف فقط</option>
        </select>

        <input
          type="date"
          value={filters.dateFrom || ""}
          onChange={(e) => setFilter("dateFrom", e.target.value)}
          style={inputStyle}
          title="من تاريخ"
        />

        <input
          type="date"
          value={filters.dateTo || ""}
          onChange={(e) => setFilter("dateTo", e.target.value)}
          style={inputStyle}
          title="إلى تاريخ"
        />
      </div>
    </div>
  );
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box",
  border: "1px solid #cbd5e1",
  borderRadius: "11px",
  padding: "10px 13px",
  background: "#fff",
  color: "#0f172a",
  fontSize: "13px",
  outline: "none",
};
