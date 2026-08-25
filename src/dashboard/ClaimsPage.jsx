import { useMemo } from "react";
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
}) {
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

  const currentSheetCount =
    sheetFilter === "all"
      ? total
      : allClaims.filter((item) => item.sheet_name === sheetFilter).length;

  return (
    <div>
      <div style={styles.card}>
        <div style={styles.claimsHeader}>
          <div>
            <h2 style={styles.cardTitle}>📋 قسم المطالبات</h2>
            <p style={styles.cardSub}>إضافة ومتابعة واستيراد ملفات المطالبات</p>
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
          <ClaimStat title="إجمالي السجلات" value={allClaims.length} icon="📋" />

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
                    </tr>
                  </thead>
                  <tbody>
                    {claims.slice(0, 300).map((claim) => (
                      <tr key={claim.id} style={styles.tr}>
                        <td style={styles.td}>{claim.sheet_name}</td>
                        <td style={styles.td}>
                          {claim.row_number === 0 ? "يدوي" : claim.row_number}
                        </td>
                        {columns.map((column) => (
                          <td key={column} style={styles.td}>
                            {String(claim.data?.[column] ?? "")}
                          </td>
                        ))}
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
    </div>
  );
}
