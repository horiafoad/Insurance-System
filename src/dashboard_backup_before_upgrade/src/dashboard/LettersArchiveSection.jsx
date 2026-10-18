import React, { useMemo, useState } from "react";
import { buildArchiveTree, getLetterStatusLabel } from "../utils/letterHelpers";

// قسم الأرشيف: السنة → الأسبوع → الإدارة → نوع الخطاب → الخطابات
// (بند 5). البحث الموحّد (من LetterSearchFilters) شغّال هنا برضه
// لأنه بيفلتر letters نفسها قبل ما توصل هنا — يعني مش محتاج منطق
// بحث منفصل جوه الأرشيف، هو نفس الليست بعد الفلترة.

export default function LettersArchiveSection({ letters = [], onOpenLetter }) {
  const tree = useMemo(() => buildArchiveTree(letters), [letters]);
  const years = Object.keys(tree).sort((a, b) => b - a);

  const [openYear, setOpenYear] = useState(years[0] || null);
  const [openWeek, setOpenWeek] = useState(null);
  const [openDept, setOpenDept] = useState(null);

  if (!years.length) {
    return (
      <div style={{ color: "#94A3B8", fontSize: 13, padding: 20, textAlign: "center" }}>
        لا توجد خطابات مؤرشفة حاليًا.
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {years.map((year) => (
        <div key={year} style={groupStyle}>
          <button
            onClick={() => setOpenYear(openYear === year ? null : year)}
            style={headerButtonStyle}
          >
            <span>📅 {year}</span>
            <span>{openYear === year ? "▲" : "▼"}</span>
          </button>

          {openYear === year && (
            <div style={{ padding: "8px 8px 8px 20px" }}>
              {Object.keys(tree[year]).map((week) => (
                <div key={week} style={groupStyle}>
                  <button
                    onClick={() =>
                      setOpenWeek(openWeek === week ? null : week)
                    }
                    style={{ ...headerButtonStyle, background: "#F8FAFC" }}
                  >
                    <span>🗓️ {week}</span>
                    <span>{openWeek === week ? "▲" : "▼"}</span>
                  </button>

                  {openWeek === week && (
                    <div style={{ padding: "8px 8px 8px 20px" }}>
                      {Object.keys(tree[year][week]).map((dept) => (
                        <div key={dept} style={groupStyle}>
                          <button
                            onClick={() =>
                              setOpenDept(openDept === dept ? null : dept)
                            }
                            style={{ ...headerButtonStyle, background: "#F1F5F9" }}
                          >
                            <span>🏢 {dept}</span>
                            <span>{openDept === dept ? "▲" : "▼"}</span>
                          </button>

                          {openDept === dept && (
                            <div style={{ padding: "8px 8px 8px 20px" }}>
                              {Object.keys(tree[year][week][dept]).map(
                                (type) => (
                                  <div key={type} style={{ marginBottom: 10 }}>
                                    <div
                                      style={{
                                        fontSize: 12,
                                        fontWeight: 800,
                                        color: "#64748B",
                                        marginBottom: 6,
                                      }}
                                    >
                                      🏷️ {type}
                                    </div>

                                    {tree[year][week][dept][type].map(
                                      (letter) => (
                                        <button
                                          key={letter.id}
                                          onClick={() => onOpenLetter?.(letter)}
                                          style={letterRowStyle}
                                        >
                                          <span>
                                            {letter.letter_number || "بدون رقم"} —{" "}
                                            {letter.sender?.name || "بدون مرسل"}
                                          </span>
                                          <span style={{ color: "#94A3B8" }}>
                                            {getLetterStatusLabel(letter.status)}
                                          </span>
                                        </button>
                                      )
                                    )}
                                  </div>
                                )
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

const groupStyle = {
  border: "1px solid #E2E8F0",
  borderRadius: 12,
  overflow: "hidden",
  background: "#fff",
};

const headerButtonStyle = {
  width: "100%",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "10px 14px",
  background: "#fff",
  border: "none",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 800,
  color: "#0F172A",
};

const letterRowStyle = {
  width: "100%",
  display: "flex",
  justifyContent: "space-between",
  padding: "8px 10px",
  border: "1px solid #E2E8F0",
  borderRadius: 10,
  background: "#F8FAFC",
  marginBottom: 6,
  cursor: "pointer",
  fontSize: 12,
  fontWeight: 700,
  color: "#334155",
};
