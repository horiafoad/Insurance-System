import React, { useMemo, useState } from "react";
import { styles } from "./styles";
import { ClaimStat, EmptyState } from "./ui";

export default function ClaimsPage({
  claims,
  allClaims,
  sheets,
  search,
  setSearch,
  sheetFilter,
  setSheetFilter,
  loading,
  error,
  onImport,
  onAddManual,
  onDeleteClaim,
  onUpdateClaim,
  canManage = false,
}) {
  const [editingClaim, setEditingClaim] = useState(null);
  const [editFormData, setEditFormData] = useState({
    sheet_name: "",
    data: {},
  });

  const columns = useMemo(() => {
    const result = [];

    allClaims.forEach((claim) => {
      Object.keys(claim.data || {}).forEach((key) => {
        if (!result.includes(key)) {
          result.push(key);
        }
      });
    });

    return result;
  }, [allClaims]);

  const total = allClaims.length;
  const stats = useMemo(() => {
    const pending = allClaims.filter((claim) =>
      ["قيد المراجعة", "جديد", "معلق"].includes(String(claim.data?.الحالة || claim.status || ""))
    ).length;
    const inProgress = allClaims.filter((claim) =>
      ["جاري التنفيذ", "قيد التنفيذ", "قيد المعالجة"].includes(
        String(claim.data?.الحالة || claim.status || "")
      )
    ).length;
    const completed = allClaims.filter((claim) =>
      ["مكتمل", "تم الصرف", "منتهي"].includes(String(claim.data?.الحالة || claim.status || ""))
    ).length;

    return {
      pending,
      inProgress,
      completed,
      completedRate: total ? Math.round((completed / total) * 100) : 0,
    };
  }, [allClaims, total]);

  const currentSheetCount =
    sheetFilter === "all"
      ? total
      : allClaims.filter((item) => item.sheet_name === sheetFilter).length;

  const handleOpenEdit = (claim) => {
    setEditingClaim(claim);
    setEditFormData({
      sheet_name: claim.sheet_name || "",
      data: { ...(claim.data || {}) },
    });
  };

  const handleSaveEdit = (e) => {
    e.preventDefault();
    if (!editingClaim) return;
    if (onUpdateClaim) {
      onUpdateClaim(editingClaim.id, editFormData.data, editFormData.sheet_name);
    }
    setEditingClaim(null);
  };

  return (
    <div>
      <div style={styles.card}>
        <div style={styles.claimsHeader}>
          <div>
            <h2 style={styles.cardTitle}>📋 قسم المطالبات</h2>
            <p style={styles.cardSub}>إضافة وتعديل وحذف واستيراد ملفات المطالبات</p>
          </div>

          <div style={styles.claimHeaderButtons}>
            <button style={styles.manualClaimButton} onClick={onAddManual}>
              ＋ إضافة مطالبة
            </button>

            <label style={styles.excelButton}>
              📥 استيراد ملف Excel
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={onImport}
                style={{ display: "none" }}
              />
            </label>
          </div>
        </div>

        {loading && (
          <div style={styles.infoBox}>جاري قراءة وحفظ البيانات...</div>
        )}

        {error && <div style={styles.errorBox}>{error}</div>}

        <div style={styles.claimStats}>
          <ClaimStat title="إجمالي السجلات" value={stats.total} icon="📋" />
          <ClaimStat title="قيد المراجعة" value={stats.pending} icon="⏳" />
          <ClaimStat title="جاري التنفيذ" value={stats.inProgress} icon="🔄" />
          <ClaimStat title="مكتمل" value={stats.completed} icon="✅" />
          <ClaimStat title="نسبة الإنجاز" value={`${stats.completedRate}%`} icon="�" />

          {sheets.map((sheet) => (
            <ClaimStat
              key={sheet.name}
              title={sheet.name}
              value={sheet.count}
              icon="📊"
            />
          ))}
        </div>

        {sheets.length > 0 && (
          <>
            <div style={styles.filterRow}>
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="🔎 بحث بالاسم أو رقم المطالبة أو أي بيان"
                style={styles.claimSearch}
              />

              <select
                value={sheetFilter}
                onChange={(e) => setSheetFilter(e.target.value)}
                style={styles.claimSelect}
              >
                <option value="all">كل التصنيفات</option>
                {sheets.map((sheet) => (
                  <option key={sheet.name} value={sheet.name}>
                    {sheet.name}
                  </option>
                ))}
              </select>
            </div>

            <div style={styles.resultText}>
              عدد النتائج الحالية: <strong>{claims.length}</strong> من{" "}
              <strong>{currentSheetCount}</strong>
            </div>

            {claims.length > 0 && (
              <div style={styles.claimTableWrapper}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      <th style={styles.th}>التصنيف</th>
                      <th style={styles.th}>رقم الصف</th>
                      {columns.map((column) => (
                        <th key={column} style={styles.th}>
                          {column}
                        </th>
                      ))}
                      {canManage && <th style={styles.th}>إجراءات المدير</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {claims.slice(0, 300).map((claim) => (
                      <tr key={claim.id} style={styles.tr}>
                        {canManage && <td style={styles.td}>
                          <span
                            style={{
                              background: "#EFF6FF",
                              color: "#1D4ED8",
                              padding: "2px 8px",
                              borderRadius: "6px",
                              fontSize: "12px",
                              fontWeight: "600",
                            }}
                          >
                            {claim.sheet_name}
                          </span>
                        </td>}
                        <td style={styles.td}>
                          {claim.row_number === 0 ? "يدوي" : claim.row_number}
                        </td>
                        {columns.map((column) => (
                          <td key={column} style={styles.td}>
                            {String(claim.data?.[column] ?? "")}
                          </td>
                        ))}
                        <td style={styles.td}>
                          <div style={{ display: "flex", gap: "6px" }}>
                            <button
                              style={{
                                ...styles.viewButton,
                                background: "#FEF3C7",
                                color: "#92400E",
                                borderColor: "#FDE68A",
                                padding: "4px 8px",
                                fontSize: "12px",
                              }}
                              onClick={() => handleOpenEdit(claim)}
                              title="تعديل المطالبة"
                            >
                              ✏️ تعديل
                            </button>
                            {onDeleteClaim && (
                              <button
                                style={{
                                  ...styles.deleteButton,
                                  padding: "4px 8px",
                                  fontSize: "12px",
                                }}
                                onClick={() => onDeleteClaim(claim.id)}
                                title="حذف المطالبة"
                              >
                                🗑️ حذف
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {claims.length > 300 && (
                  <div style={styles.infoBox}>
                    يتم عرض أول 300 سجل في الشاشة فقط.
                  </div>
                )}
              </div>
            )}

            {claims.length === 0 && (
              <EmptyState text="لا توجد بيانات مطابقة للبحث." />
            )}
          </>
        )}

        {!sheets.length && !loading && (
          <div style={styles.emptyClaims}>
            <div style={styles.emptyIcon}>📋</div>
            <h3>لا توجد مطالبات حتى الآن</h3>
            <p>يمكنك إضافة مطالبة يدويًا أو استيراد ملف Excel.</p>
            <div style={styles.emptyClaimButtons}>
              <button
                style={styles.manualClaimButtonLarge}
                onClick={onAddManual}
              >
                ＋ إضافة مطالبة يدويًا
              </button>
              <label style={styles.excelButtonLarge}>
                📥 اختيار ملف Excel
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  onChange={onImport}
                  style={{ display: "none" }}
                />
              </label>
            </div>
          </div>
        )}
      </div>

      {/* Modal تعديل المطالبة */}
      {editingClaim && (
        <div
          style={styles.modalOverlay}
          onClick={() => setEditingClaim(null)}
        >
          <div
            style={{ ...styles.loginBox, width: "min(600px, 95%)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              style={styles.closeButton}
              onClick={() => setEditingClaim(null)}
            >
              ×
            </button>

            <div style={{ fontSize: "38px", marginBottom: "8px" }}>✏️</div>

            <h3 style={styles.loginTitle}>تعديل بيانات المطالبة</h3>

            <form onSubmit={handleSaveEdit}>
              <div style={{ marginBottom: "12px", textAlign: "right" }}>
                <label style={{ fontSize: "13px", fontWeight: "600", marginBottom: "4px", display: "block" }}>
                  التصنيف / اسم الشيت
                </label>
                <input
                  type="text"
                  value={editFormData.sheet_name}
                  onChange={(e) =>
                    setEditFormData((prev) => ({
                      ...prev,
                      sheet_name: e.target.value,
                    }))
                  }
                  style={styles.input}
                  required
                />
              </div>

              <div style={{ maxHeight: "320px", overflowY: "auto", paddingRight: "4px" }}>
                {Object.keys(editFormData.data || {}).map((key) => (
                  <div key={key} style={{ marginBottom: "10px", textAlign: "right" }}>
                    <label style={{ fontSize: "12px", fontWeight: "600", marginBottom: "4px", display: "block", color: "#475569" }}>
                      {key}
                    </label>
                    <input
                      type="text"
                      value={editFormData.data[key] ?? ""}
                      onChange={(e) => {
                        const val = e.target.value;
                        setEditFormData((prev) => ({
                          ...prev,
                          data: {
                            ...prev.data,
                            [key]: val,
                          },
                        }));
                      }}
                      style={{ ...styles.input, marginBottom: 0 }}
                    />
                  </div>
                ))}
              </div>

              <div style={{ marginTop: "20px", display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={() => setEditingClaim(null)}
                >
                  إلغاء
                </button>
                <button type="submit" style={styles.primaryButton}>
                  💾 حفظ التعديلات
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
