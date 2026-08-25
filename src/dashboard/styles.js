export const styles = {
  app: {
    minHeight: "100vh",
    display: "flex",
    background: "#F5F7FA",
    color: "#172033",
    fontFamily: "'Cairo', 'Segoe UI', sans-serif",
  },

  loadingBox: {
    background: "#fff",
    border: "1px solid #E7EBF0",
    borderRadius: 16,
    padding: 35,
    textAlign: "center",
    boxShadow: "0 10px 30px rgba(15,41,66,.08)",
  },

  loadingIcon: {
    fontSize: 48,
    marginBottom: 10,
  },

  sidebar: {
    width: "280px",
    background: "#0F2942",
    color: "#fff",
    padding: "22px 14px",
    flexShrink: 0,
    minHeight: "100vh",
    boxSizing: "border-box",
    overflowY: "auto",
  },

  brand: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "8px 10px 24px",
  },

  logo: {
    width: 48,
    height: 48,
    borderRadius: 14,
    background: "#2563EB",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 26,
  },

  college: {
    fontSize: 19,
    fontWeight: 800,
  },

  department: {
    fontSize: 13,
    color: "#AFC0D2",
    marginTop: 3,
  },

  sidebarLabel: {
    color: "#71869C",
    fontSize: 12,
    fontWeight: 800,
    padding: "12px 12px 6px",
  },

  menuButton: {
    width: "100%",
    border: 0,
    color: "#C9D4DF",
    background: "transparent",
    padding: "12px 13px",
    borderRadius: 10,
    display: "flex",
    alignItems: "center",
    gap: 10,
    cursor: "pointer",
    fontSize: 15,
    textAlign: "right",
    marginBottom: 4,
  },

  menuButtonActive: {
    background: "#2563EB",
    color: "#fff",
    boxShadow: "0 5px 15px rgba(37,99,235,.25)",
  },

  smallMenuButton: {
    width: "100%",
    border: 0,
    color: "#B7C6D5",
    background: "transparent",
    padding: "9px 13px",
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    gap: 9,
    cursor: "pointer",
    fontSize: 13,
    textAlign: "right",
    marginBottom: 2,
  },

  smallMenuButtonActive: {
    background: "#2563EB",
    color: "#fff",
    boxShadow: "0 4px 12px rgba(37,99,235,.22)",
  },

  sidebarDivider: {
    height: 1,
    background: "#28445E",
    margin: "14px 8px",
  },

  main: {
    flex: 1,
    padding: 28,
    minWidth: 0,
  },

  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 20,
    marginBottom: 22,
  },

  breadcrumb: {
    color: "#64748B",
    fontSize: 12,
    marginBottom: 5,
  },

  pageTitle: {
    margin: 0,
    fontSize: 28,
    fontWeight: 900,
  },

  pageSub: {
    margin: "5px 0 0",
    color: "#64748B",
    fontSize: 14,
  },

  primaryButton: {
    border: 0,
    background: "#2563EB",
    color: "#fff",
    borderRadius: 9,
    padding: "12px 18px",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 14,
    whiteSpace: "nowrap",
  },

  secondaryButton: {
    border: "1px solid #CBD5E1",
    background: "#fff",
    color: "#334155",
    borderRadius: 9,
    padding: "11px 18px",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 14,
  },

  excelButton: {
    border: "1px solid #2563EB",
    background: "#EFF6FF",
    color: "#1D4ED8",
    borderRadius: 9,
    padding: "11px 16px",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 14,
    whiteSpace: "nowrap",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },

  excelButtonLarge: {
    border: 0,
    background: "#2563EB",
    color: "#fff",
    borderRadius: 10,
    padding: "13px 22px",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 14,
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
  },

  manualClaimButton: {
    border: 0,
    background: "#047857",
    color: "#fff",
    borderRadius: 9,
    padding: "11px 16px",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 14,
    whiteSpace: "nowrap",
  },

  manualClaimButtonLarge: {
    border: 0,
    background: "#047857",
    color: "#fff",
    borderRadius: 10,
    padding: "13px 22px",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 14,
  },

  claimHeaderButtons: {
    display: "flex",
    alignItems: "center",
    gap: 9,
    flexWrap: "wrap",
  },

  emptyClaimButtons: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    flexWrap: "wrap",
  },

  manualClaimIntro: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    background: "#ECFDF5",
    border: "1px solid #A7F3D0",
    color: "#065F46",
    borderRadius: 10,
    padding: 14,
    marginBottom: 18,
    fontSize: 14,
  },

  manualClaimIcon: {
    width: 42,
    height: 42,
    borderRadius: 10,
    background: "#D1FAE5",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 22,
  },

  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 14,
    marginBottom: 16,
  },

  statCard: {
    background: "#fff",
    border: "1px solid #E7EBF0",
    borderRadius: 14,
    padding: 18,
    display: "flex",
    alignItems: "center",
    gap: 13,
    boxShadow: "0 2px 8px rgba(15,41,66,.035)",
  },

  statIcon: {
    width: 44,
    height: 44,
    borderRadius: 11,
    background: "#EFF6FF",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 22,
  },

  statTitle: {
    fontSize: 13,
    color: "#64748B",
    marginBottom: 4,
  },

  statValue: {
    fontSize: 26,
    fontWeight: 900,
  },

  claimStat: {
    background: "#F8FAFC",
    border: "1px solid #E2E8F0",
    borderRadius: 12,
    padding: 15,
    display: "flex",
    alignItems: "center",
    gap: 10,
  },

  claimStatIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    background: "#EAF2FF",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 19,
  },

  claimStatValue: {
    fontSize: 21,
    fontWeight: 900,
  },

  dashboardGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
    marginBottom: 16,
  },

  card: {
    background: "#fff",
    border: "1px solid #E7EBF0",
    borderRadius: 15,
    padding: 20,
    marginBottom: 16,
    boxShadow: "0 2px 8px rgba(15,41,66,.035)",
  },

  cardHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 16,
  },

  claimsHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 15,
    marginBottom: 18,
  },

  cardTitle: {
    margin: 0,
    fontSize: 20,
    fontWeight: 900,
  },

  cardSub: {
    margin: "4px 0 0",
    color: "#64748B",
    fontSize: 13,
  },

  linkButton: {
    border: 0,
    background: "transparent",
    color: "#2563EB",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 14,
  },

  scoreCircle: {
    width: 68,
    height: 68,
    borderRadius: "50%",
    background: "#EFF6FF",
    color: "#2563EB",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 19,
    fontWeight: 900,
  },

  progressWrap: {
    marginBottom: 15,
  },

  progressLabel: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 13,
    marginBottom: 6,
  },

  progressTrack: {
    height: 9,
    background: "#E2E8F0",
    borderRadius: 99,
    overflow: "hidden",
  },

  progressFill: {
    height: "100%",
    background: "#2563EB",
    borderRadius: 99,
  },

  gradeBox: {
    marginTop: 17,
    background: "#F8FAFC",
    borderRadius: 10,
    padding: 13,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: 14,
  },

  workGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 10,
  },

  workCard: {
    border: "1px solid #E5E7EB",
    background: "#fff",
    borderRadius: 11,
    padding: 13,
    display: "flex",
    alignItems: "center",
    gap: 9,
    cursor: "pointer",
    textAlign: "right",
    fontSize: 14,
  },

  workIcon: {
    width: 36,
    height: 36,
    borderRadius: 9,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 19,
    flexShrink: 0,
  },

  workInfo: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 3,
  },

  workCount: {
    color: "#2563EB",
    fontWeight: 900,
    fontSize: 15,
  },

  taskMini: {
    width: "100%",
    border: 0,
    background: "#F8FAFC",
    borderRadius: 10,
    padding: 11,
    display: "flex",
    alignItems: "center",
    gap: 9,
    cursor: "pointer",
    textAlign: "right",
    marginBottom: 7,
    fontSize: 14,
  },

  taskMiniIcon: {
    width: 34,
    height: 34,
    background: "#fff",
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 18,
  },

  taskMiniInfo: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 3,
  },

  statusBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "6px 9px",
    borderRadius: 999,
    fontSize: 11,
    fontWeight: 800,
    whiteSpace: "nowrap",
  },

  sectionHeading: {
    margin: 0,
    fontSize: 22,
  },

  filterRow: {
    display: "flex",
    gap: 10,
    marginBottom: 15,
    flexWrap: "wrap",
  },

  filter: {
    border: "1px solid #CBD5E1",
    background: "#fff",
    padding: "10px 12px",
    borderRadius: 8,
    fontSize: 14,
    minWidth: 200,
  },

  claimSearch: {
    flex: 1,
    minWidth: 280,
    border: "1px solid #CBD5E1",
    borderRadius: 8,
    padding: "11px 12px",
    fontSize: 14,
    boxSizing: "border-box",
  },

  claimSelect: {
    minWidth: 220,
    border: "1px solid #CBD5E1",
    background: "#fff",
    borderRadius: 8,
    padding: "11px 12px",
    fontSize: 14,
  },

  claimStats: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
    gap: 10,
    marginBottom: 18,
  },

  resultText: {
    color: "#64748B",
    fontSize: 13,
    marginBottom: 10,
  },

  claimTableWrapper: {
    overflow: "auto",
    maxHeight: "520px",
    border: "1px solid #E5E7EB",
    borderRadius: 10,
  },

  table: {
    width: "100%",
    borderCollapse: "collapse",
    fontSize: 13,
    minWidth: 850,
  },

  th: {
    padding: "13px 10px",
    background: "#F8FAFC",
    borderBottom: "1px solid #E2E8F0",
    textAlign: "right",
    whiteSpace: "nowrap",
    fontSize: 13,
    fontWeight: 800,
  },

  td: {
    padding: "13px 10px",
    borderBottom: "1px solid #EEF2F6",
    verticalAlign: "middle",
    fontSize: 13,
  },

  tr: {
    background: "#fff",
  },

  viewButton: {
    border: 0,
    background: "#DBEAFE",
    color: "#1D4ED8",
    borderRadius: 6,
    padding: "6px 9px",
    cursor: "pointer",
    fontSize: 12,
    marginLeft: 5,
  },

  deleteButton: {
    border: 0,
    background: "#FEE2E2",
    color: "#DC2626",
    borderRadius: 6,
    padding: "6px 9px",
    cursor: "pointer",
    fontSize: 12,
  },

  infoBox: {
    background: "#EFF6FF",
    color: "#1D4ED8",
    borderRadius: 9,
    padding: 11,
    marginBottom: 12,
    fontSize: 13,
  },

  errorBox: {
    background: "#FEE2E2",
    color: "#B91C1C",
    borderRadius: 9,
    padding: 11,
    marginBottom: 12,
    fontSize: 13,
  },

  emptyClaims: {
    minHeight: 260,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    color: "#64748B",
    fontSize: 14,
  },

  emptyIcon: {
    fontSize: 48,
    marginBottom: 8,
  },

  performanceBox: {
    background: "#F8FAFC",
    borderRadius: 13,
    padding: 20,
    display: "flex",
    alignItems: "center",
    gap: 18,
    marginBottom: 18,
  },

  bigScore: {
    fontSize: 42,
    fontWeight: 900,
    color: "#2563EB",
  },

  criteriaList: {
    display: "flex",
    flexDirection: "column",
    gap: 13,
  },

  criteriaRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    fontSize: 13,
  },

  criteriaBar: {
    flex: 1,
    height: 10,
    background: "#E2E8F0",
    borderRadius: 99,
    overflow: "hidden",
  },

  criteriaFill: {
    height: "100%",
    background: "#2563EB",
    borderRadius: 99,
  },

  weight: {
    display: "block",
    color: "#64748B",
    marginTop: 3,
    fontSize: 11,
  },

  criteriaCard: {
    border: "1px solid #E5E7EB",
    borderRadius: 10,
    padding: 15,
    marginTop: 10,
    fontSize: 14,
  },

  criteriaTop: {
    display: "flex",
    justifyContent: "space-between",
    gap: 15,
  },

  criteriaDescription: {
    color: "#64748B",
    fontSize: 13,
    margin: "5px 0 0",
  },

  monthInput: {
    border: "1px solid #CBD5E1",
    borderRadius: 8,
    padding: "9px 10px",
    fontSize: 14,
  },

  overlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15,23,42,.55)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
    padding: 20,
  },

  modal: {
    background: "#fff",
    borderRadius: 15,
    width: "min(850px, 100%)",
    maxHeight: "90vh",
    overflowY: "auto",
    padding: 22,
    boxSizing: "border-box",
  },

  modalHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottom: "1px solid #E5E7EB",
    paddingBottom: 13,
    marginBottom: 18,
  },

  modalTitle: {
    margin: 0,
    fontSize: 21,
  },

  closeButton: {
    border: 0,
    background: "#F1F5F9",
    width: 36,
    height: 36,
    borderRadius: 8,
    cursor: "pointer",
    fontSize: 16,
  },

  formGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 14,
  },

  label: {
    display: "block",
    fontSize: 13,
    fontWeight: 800,
    marginBottom: 5,
  },

  input: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #CBD5E1",
    borderRadius: 8,
    padding: "11px 12px",
    fontSize: 14,
    outline: "none",
  },

  modalActions: {
    display: "flex",
    justifyContent: "flex-start",
    gap: 9,
    marginTop: 20,
    paddingTop: 15,
    borderTop: "1px solid #E5E7EB",
  },

  detailHeader: {
    display: "flex",
    justifyContent: "space-between",
    gap: 15,
    alignItems: "center",
    background: "#F8FAFC",
    padding: 15,
    borderRadius: 10,
    fontSize: 14,
  },

  detailGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 10,
    marginTop: 14,
  },

  detailItem: {
    background: "#F8FAFC",
    borderRadius: 9,
    padding: 13,
    display: "flex",
    flexDirection: "column",
    gap: 5,
    fontSize: 13,
  },

  statusActions: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 7,
    marginTop: 16,
  },

  actionTitle: {
    fontSize: 13,
    fontWeight: 800,
    width: "100%",
    marginBottom: 3,
  },

  statusButton: {
    border: "1px solid",
    borderRadius: 8,
    padding: "8px 10px",
    cursor: "pointer",
    fontSize: 12,
  },

  checkRow: {
    display: "flex",
    gap: 22,
    marginTop: 15,
    fontSize: 13,
    fontWeight: 700,
  },

  deleteLargeButton: {
    border: 0,
    background: "#FEE2E2",
    color: "#DC2626",
    borderRadius: 9,
    padding: "11px 16px",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 14,
  },

  empty: {
    padding: 25,
    textAlign: "center",
    color: "#94A3B8",
    fontSize: 14,
  },

  alertList: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },

  alertItem: {
    borderRadius: 12,
    padding: 14,
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
  },

  alertActions: {
    display: "flex",
    gap: 8,
    flexShrink: 0,
  },
};

