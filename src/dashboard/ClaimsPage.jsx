import React, { useMemo, useState } from "react";
import { styles } from "./styles";
import { ClaimStat, EmptyState } from "./ui";

const formatAmount = (value) =>
  Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const actionButtonStyle = {
  padding: "4px 8px",
  fontSize: "12px",
  whiteSpace: "nowrap",
};

export default function ClaimsPage({
  claims,
  allClaims,
  sheets,
  search,
  setSearch,
  sheetFilter,
  setSheetFilter,
  paymentStatusFilter,
  setPaymentStatusFilter,
  loading,
  error,
  onImport,
  onAddManual,
  onDeleteClaim,
  onUpdateClaim,
  onDeleteAllClaims,
  onStartPayment,
  onPayInstallment,
  onSettleClaim,
  canManage = false,
}) {
  const [editingClaim, setEditingClaim] = useState(null);
  const [editFormData, setEditFormData] = useState({
    sheet_name: "",
    data: {},
  });
  const [showClearAll, setShowClearAll] = useState(false);
  const [clearing, setClearing] = useState(false);

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
      ["لم يسدد", "جديد", "قيد المراجعة"].includes(String(claim.payment_status || claim.status || ""))
    ).length;
    const inProgress = allClaims.filter((claim) =>
      claim.payment_status === "جاري السداد"
    ).length;
    const completed = allClaims.filter((claim) =>
      ["خالي الطرف", "مكتمل", "تم السداد"].includes(String(claim.payment_status || claim.status || ""))
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

  const handleClearAll = async () => {
    setClearing(true);
    try {
      await onDeleteAllClaims?.();
      setShowClearAll(false);
    } finally {
      setClearing(false);
    }
  };

  return (
    <div>
      <div style={styles.card}>
        <div style={styles.claimsHeader} className="claims-header">
          <div>
            <h2 style={styles.cardTitle}>📋 قسم المطالبات</h2>
            <p style={styles.cardSub}>إضافة وتعديل وحذف واستيراد ملفات المطالبات</p>
          </div>

          <div style={styles.claimHeaderButtons}>
            {canManage && total > 0 && (
              <button
                style={styles.clearAllClaimsButton}
                onClick={() => setShowClearAll(true)}
                title="حذف كل المطالبات من قاعدة البيانات"
              >
                🗑️ حذف كل المطالبات
              </button>
            )}

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
          <ClaimStat title="إجمالي السجلات" value={total} icon="📋" />
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
            <div className="service-filter-bar" style={styles.filterRow}>
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

              {setPaymentStatusFilter && (
                <select
                  value={paymentStatusFilter || "all"}
                  onChange={(e) => setPaymentStatusFilter(e.target.value)}
                  style={styles.claimSelect}
                >
                  <option value="all">كل حالات السداد</option>
                  <option value="لم يسدد">لم يسدد</option>
                  <option value="جاري السداد">جاري السداد</option>
                  <option value="خالي الطرف">خالي الطرف</option>
                  <option value="none">بدون حالة سداد</option>
                </select>
              )}
            </div>

            <div style={styles.resultText}>
              عدد النتائج الحالية: <strong>{claims.length}</strong> من{" "}
              <strong>{currentSheetCount}</strong>
            </div>

            {claims.length > 0 && (
              <div className="mobile-hscroll" style={styles.claimTableWrapper}>
                <table style={styles.table}>
                  <thead>
                    <tr>
                      {canManage && <th style={styles.th}>التصنيف</th>}
                      <th style={styles.th}>رقم الصف</th>
                      {canManage && <th style={styles.th}>المتبقي</th>}
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
                        {canManage && (
                          <td style={styles.td}>
                            {formatAmount(claim.remaining_amount)}
                          </td>
                        )}
                        {columns.map((column) => (
                          <td key={column} style={styles.td}>
                            {String(claim.data?.[column] ?? "")}
                          </td>
                        ))}
                        {canManage && (
                          <td style={styles.td}>
                            <div
                              style={{
                                display: "flex",
                                gap: "6px",
                                flexWrap: "wrap",
                                minWidth: 210,
                              }}
                            >
                              {claim.payment_status !== "خالي الطرف" &&
                                claim.payment_status !== "جاري السداد" &&
                                onStartPayment && (
                                  <button
                                    style={{
                                      ...styles.viewButton,
                                      background: "#EFF6FF",
                                      color: "#1D4ED8",
                                      borderColor: "#BFDBFE",
                                      ...actionButtonStyle,
                                    }}
                                    onClick={() => onStartPayment(claim)}
                                    title="بدء سداد المطالبة"
                                  >
                                    ▶️ بدء السداد
                                  </button>
                                )}

                              {claim.payment_status === "جاري السداد" &&
                                onPayInstallment && (
                                  <button
                                    style={{
                                      ...styles.viewButton,
                                      background: "#ECFDF5",
                                      color: "#047857",
                                      borderColor: "#A7F3D0",
                                      ...actionButtonStyle,
                                    }}
                                    onClick={() => onPayInstallment(claim)}
                                    title="تسديد قسط"
                                  >
                                    💵 تسديد قسط
                                  </button>
                                )}

                              {claim.payment_status !== "خالي الطرف" &&
                                onSettleClaim && (
                                  <button
                                    style={{
                                      ...styles.viewButton,
                                      background: "#F5F3FF",
                                      color: "#6D28D9",
                                      borderColor: "#DDD6FE",
                                      ...actionButtonStyle,
                                    }}
                                    onClick={() => onSettleClaim(claim)}
                                    title="تسوية المطالبة"
                                  >
                                    🤝 تسوية
                                  </button>
                                )}

                              <button
                                style={{
                                  ...styles.viewButton,
                                  background: "#FEF3C7",
                                  color: "#92400E",
                                  borderColor: "#FDE68A",
                                  ...actionButtonStyle,
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
                                    ...actionButtonStyle,
                                  }}
                                  onClick={() => onDeleteClaim(claim.id)}
                                  title="حذف المطالبة"
                                >
                                  🗑️ حذف
                                </button>
                              )}
                            </div>
                          </td>
                        )}
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

      {/* Modal تأكيد حذف كل المطالبات */}
      {showClearAll && (
        <div
          style={styles.modalOverlay}
          onClick={() => !clearing && setShowClearAll(false)}
        >
          <div
            style={{ ...styles.loginBox, width: "min(520px, 95%)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              style={styles.closeButton}
              onClick={() => setShowClearAll(false)}
              disabled={clearing}
            >
              ×
            </button>

            <div style={{ fontSize: "38px", marginBottom: "8px" }}>🗑️</div>

            <h3 style={styles.loginTitle}>حذف كل المطالبات</h3>

            <p style={{ fontSize: "14px", lineHeight: 1.8, textAlign: "right" }}>
              سيتم حذف <strong>{total}</strong> سجل مطالبة من قاعدة البيانات
              نهائيًا، وهي موزعة على <strong>{sheets.length}</strong> تصنيف (شيت).
              <br />
              <span style={{ color: "#B91C1C", fontWeight: 700 }}>
                لن يتم حذف بند «المطالبات» من القائمة، ولا التصنيفات، ولا أي بند آخر.
              </span>
              <br />
              بعد الحذف يمكنك استيراد الشيت الجديد من زر «استيراد ملف Excel».
            </p>

            <div
              style={{
                marginTop: "20px",
                display: "flex",
                gap: "10px",
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={() => setShowClearAll(false)}
                disabled={clearing}
              >
                إلغاء
              </button>
              <button
                type="button"
                style={{
                  ...styles.primaryButton,
                  background: "#DC2626",
                }}
                onClick={handleClearAll}
                disabled={clearing}
              >
                {clearing ? "جاري الحذف..." : "🗑️ تأكيد حذف كل المطالبات"}
              </button>
            </div>
          </div>
        </div>
      )}

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
