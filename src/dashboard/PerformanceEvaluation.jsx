import { useEffect, useMemo, useState } from "react";
import { styles } from "./styles";
import { supabase } from "../supabaseClient";

const defaultFormData = {
  evaluationMonth: new Date().getMonth() + 1,
  evaluationYear: new Date().getFullYear(),
  completionRate: 0,
  onTimeRate: 0,
  accuracyRate: 0,
  speedRate: 0,
  reviewRate: 0,
  uploadRate: 0,
  organizationRate: 0,
  notes: "",
};

function formatFeedbackDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString("ar-EG", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PerformanceEvaluation() {
  const [evaluations, setEvaluations] = useState([]);
  const [feedbackItems, setFeedbackItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedbackError, setFeedbackError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingEvalId, setEditingEvalId] = useState(null);
  const [formData, setFormData] = useState(defaultFormData);

  const months = [
    "يناير",
    "فبراير",
    "مارس",
    "أبريل",
    "مايو",
    "يونيو",
    "يوليو",
    "أغسطس",
    "سبتمبر",
    "أكتوبر",
    "نوفمبر",
    "ديسمبر",
  ];

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");
      setFeedbackError("");

      let evals = [];
      try {
        const { data: evaluationsData, error: evaluationsError } = await supabase
          .from("performance_evaluations")
          .select("*")
          .order("evaluation_year", { ascending: false })
          .order("evaluation_month", { ascending: false });

        if (evaluationsError) {
          console.warn("performance_evaluations warning:", evaluationsError.message);
          const localEvals = JSON.parse(
            localStorage.getItem("local_performance_evaluations") || "[]"
          );
          evals = localEvals;
        } else {
          evals = evaluationsData || [];
        }
      } catch (err) {
        console.warn("Evaluations fetch exception:", err);
        evals = JSON.parse(
          localStorage.getItem("local_performance_evaluations") || "[]"
        );
      }

      let remoteFeedback = [];
      try {
        const { data: feedbackData, error: feedbackLoadError } = await supabase
          .from("public_feedback")
          .select("*")
          .order("created_at", { ascending: false });

        if (feedbackLoadError) {
          console.warn("public_feedback warning:", feedbackLoadError.message);
        } else if (feedbackData) {
          remoteFeedback = feedbackData;
        }
      } catch (err) {
        console.warn("Feedback fetch exception:", err);
      }

      // Merge with local feedback backups
      let localFeedback = [];
      try {
        const raw = localStorage.getItem("backup_public_feedback");
        if (raw) localFeedback = JSON.parse(raw);
      } catch (e) {
        console.error(e);
      }

      const seenFeedbackIds = new Set();
      const combinedFeedback = [];
      remoteFeedback.forEach((item) => {
        if (item.id) seenFeedbackIds.add(String(item.id));
        combinedFeedback.push(item);
      });
      localFeedback.forEach((item) => {
        if (!item.id || !seenFeedbackIds.has(String(item.id))) {
          combinedFeedback.push(item);
        }
      });
      combinedFeedback.sort(
        (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0)
      );

      setEvaluations(evals);
      setFeedbackItems(combinedFeedback);
    } catch (loadError) {
      console.error(loadError);
      setError("تعذر تحميل التقييمات من قاعدة البيانات.");
    } finally {
      setLoading(false);
    }
  };

  const calculateScore = () => {
    const completion = parseFloat(formData.completionRate) || 0;
    const onTime = parseFloat(formData.onTimeRate) || 0;
    const accuracy = parseFloat(formData.accuracyRate) || 0;
    const speed = parseFloat(formData.speedRate) || 0;
    const review = parseFloat(formData.reviewRate) || 0;
    const upload = parseFloat(formData.uploadRate) || 0;
    const organization = parseFloat(formData.organizationRate) || 0;

    const totalScore = Math.round(
      completion * 0.3 +
        onTime * 0.25 +
        accuracy * 0.2 +
        speed * 0.1 +
        ((review + upload) / 2) * 0.1 +
        organization * 0.05
    );

    let grade = "يحتاج تحسين";
    if (totalScore >= 90) grade = "ممتاز";
    else if (totalScore >= 80) grade = "جيد جداً";
    else if (totalScore >= 70) grade = "جيد";
    else if (totalScore >= 60) grade = "مقبول";

    return { totalScore, grade };
  };

  const feedbackSummary = useMemo(() => {
    const ratings = feedbackItems.filter(
      (item) => item.feedback_type === "تقييم خدمة" && item.rating !== null
    );
    const complaints = feedbackItems.filter(
      (item) => item.feedback_type === "شكوى / مقترح"
    );

    const averageRating = ratings.length
      ? (
          ratings.reduce((sum, item) => sum + Number(item.rating || 0), 0) /
          ratings.length
        ).toFixed(1)
      : "0.0";

    return {
      total: feedbackItems.length,
      ratingsCount: ratings.length,
      averageRating,
      complaintsCount: complaints.length,
    };
  }, [feedbackItems]);

  const selectedPeriodFeedback = useMemo(() => {
    return feedbackItems.filter((item) => {
      if (!item.created_at) return false;
      const createdAt = new Date(item.created_at);
      if (Number.isNaN(createdAt.getTime())) return false;

      return (
        createdAt.getMonth() + 1 === Number(formData.evaluationMonth) &&
        createdAt.getFullYear() === Number(formData.evaluationYear)
      );
    });
  }, [feedbackItems, formData.evaluationMonth, formData.evaluationYear]);

  const selectedPeriodSummary = useMemo(() => {
    const ratings = selectedPeriodFeedback.filter(
      (item) => item.feedback_type === "تقييم خدمة" && item.rating !== null
    );
    const complaints = selectedPeriodFeedback.filter(
      (item) => item.feedback_type === "شكوى / مقترح"
    );

    const averageRating = ratings.length
      ? (
          ratings.reduce((sum, item) => sum + Number(item.rating || 0), 0) /
          ratings.length
        ).toFixed(1)
      : "0.0";

    return {
      total: selectedPeriodFeedback.length,
      ratingsCount: ratings.length,
      averageRating,
      complaintsCount: complaints.length,
    };
  }, [selectedPeriodFeedback]);

  const recentFeedback = useMemo(() => {
    return feedbackItems.slice(0, 10);
  }, [feedbackItems]);

  const handleOpenCreate = () => {
    setEditingEvalId(null);
    setFormData(defaultFormData);
    setShowForm(true);
  };

  const handleOpenEdit = (evalItem) => {
    setEditingEvalId(evalItem.id);
    const monthIndex = months.indexOf(evalItem.evaluation_month);
    setFormData({
      evaluationMonth: monthIndex !== -1 ? monthIndex + 1 : new Date().getMonth() + 1,
      evaluationYear: evalItem.evaluation_year || new Date().getFullYear(),
      completionRate: evalItem.completion_rate || 0,
      onTimeRate: evalItem.on_time_rate || 0,
      accuracyRate: evalItem.accuracy_rate || 0,
      speedRate: evalItem.speed_rate || 0,
      reviewRate: evalItem.review_rate || 0,
      uploadRate: evalItem.upload_rate || 0,
      organizationRate: evalItem.organization_rate || 0,
      notes: evalItem.notes || "",
    });
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { totalScore, grade } = calculateScore();

    const evalPayload = {
      evaluation_month: months[formData.evaluationMonth - 1],
      evaluation_year: Number(formData.evaluationYear),
      completion_rate: formData.completionRate,
      on_time_rate: formData.onTimeRate,
      accuracy_rate: formData.accuracyRate,
      speed_rate: formData.speedRate,
      review_rate: formData.reviewRate,
      upload_rate: formData.uploadRate,
      organization_rate: formData.organizationRate,
      total_score: totalScore,
      grade,
      notes: [
        formData.notes?.trim(),
        `ملخص الصفحة الرئيسية لنفس الفترة: عدد تقييمات الخدمة ${selectedPeriodSummary.ratingsCount}، متوسط التقييم ${selectedPeriodSummary.averageRating} من 5، وعدد الشكاوى/المقترحات ${selectedPeriodSummary.complaintsCount}.`,
      ]
        .filter(Boolean)
        .join("\n\n") || null,
    };

    try {
      if (editingEvalId) {
        // Update mode
        if (!String(editingEvalId).startsWith("local-")) {
          try {
            await supabase
              .from("performance_evaluations")
              .update(evalPayload)
              .eq("id", editingEvalId);
          } catch (err) {
            console.warn("Supabase update exception:", err);
          }
        }

        // Update locally
        const localEvals = JSON.parse(
          localStorage.getItem("local_performance_evaluations") || "[]"
        );
        const updated = localEvals.map((item) =>
          item.id === editingEvalId ? { ...item, ...evalPayload } : item
        );
        localStorage.setItem(
          "local_performance_evaluations",
          JSON.stringify(updated)
        );

        alert("تم تعديل وحفظ التقييم بنجاح.");
      } else {
        // Create mode
        const newEval = {
          ...evalPayload,
          created_at: new Date().toISOString(),
        };

        let savedDb = false;
        try {
          const { error: insertError } = await supabase
            .from("performance_evaluations")
            .insert(newEval)
            .select()
            .single();

          if (insertError) {
            console.warn("Supabase insert evaluation error:", insertError.message);
          } else {
            savedDb = true;
          }
        } catch (err) {
          console.warn("Supabase insert exception:", err);
        }

        if (!savedDb) {
          const localEvals = JSON.parse(
            localStorage.getItem("local_performance_evaluations") || "[]"
          );
          localEvals.unshift({ ...newEval, id: "local-eval-" + Date.now() });
          localStorage.setItem(
            "local_performance_evaluations",
            JSON.stringify(localEvals)
          );
        }

        alert("تم إنشاء وحفظ التقييم بنجاح.");
      }

      await loadData();
      setShowForm(false);
      setEditingEvalId(null);
      setFormData(defaultFormData);
    } catch (submitError) {
      console.error(submitError);
      alert("تعذر حفظ التقييم.");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("هل تريدين حذف هذا التقييم؟")) return;

    try {
      if (!String(id).startsWith("local-")) {
        try {
          await supabase
            .from("performance_evaluations")
            .delete()
            .eq("id", id);
        } catch (e) {
          console.warn(e);
        }
      }

      const localEvals = JSON.parse(
        localStorage.getItem("local_performance_evaluations") || "[]"
      );
      const updated = localEvals.filter((item) => item.id !== id);
      localStorage.setItem(
        "local_performance_evaluations",
        JSON.stringify(updated)
      );

      await loadData();
      alert("تم حذف التقييم بنجاح.");
    } catch (deleteError) {
      console.error(deleteError);
      alert("تعذر حذف التقييم.");
    }
  };

  const getGradeColor = (grade) => {
    switch (grade) {
      case "ممتاز":
        return "#D1FAE5";
      case "جيد جداً":
        return "#DBEAFE";
      case "جيد":
        return "#FEF3C7";
      case "مقبول":
        return "#FEE2E2";
      default:
        return "#F1F5F9";
    }
  };

  const getGradeTextColor = (grade) => {
    switch (grade) {
      case "ممتاز":
        return "#047857";
      case "جيد جداً":
        return "#1D4ED8";
      case "جيد":
        return "#B45309";
      case "مقبول":
        return "#B91C1C";
      default:
        return "#64748B";
    }
  };

  if (loading) {
    return (
      <div style={styles.card}>
        <div style={styles.infoBox}>جاري تحميل التقييمات...</div>
      </div>
    );
  }

  return (
    <div>
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div>
            <h2 style={styles.cardTitle}>تقييم الأداء والجودة</h2>
            <p style={styles.cardSub}>
              تقييم أداء القسم مع ربط مباشر بتقييمات الخدمة والشكاوى من الصفحة الرئيسية
            </p>
          </div>
          <button
            style={styles.primaryButton}
            onClick={handleOpenCreate}
          >
            ＋ إضافة تقييم
          </button>
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}
        {feedbackError && <div style={styles.infoBox}>{feedbackError}</div>}

        <div style={styles.claimStats}>
          <div style={styles.criteriaCard}>
            <div style={styles.criteriaTop}>
              <div>
                <b>إجمالي تقييمات الجودة</b>
                <p style={styles.criteriaDescription}>
                  المسجلة في الصفحة الرئيسية
                </p>
              </div>
              <strong>{feedbackSummary.total}</strong>
            </div>
          </div>

          <div style={styles.criteriaCard}>
            <div style={styles.criteriaTop}>
              <div>
                <b>تقييمات الخدمة</b>
                <p style={styles.criteriaDescription}>عدد التقييمات الرقمية</p>
              </div>
              <strong>{feedbackSummary.ratingsCount}</strong>
            </div>
          </div>

          <div style={styles.criteriaCard}>
            <div style={styles.criteriaTop}>
              <div>
                <b>متوسط الرضا</b>
                <p style={styles.criteriaDescription}>من 5 درجات</p>
              </div>
              <strong>{feedbackSummary.averageRating}</strong>
            </div>
          </div>

          <div style={styles.criteriaCard}>
            <div style={styles.criteriaTop}>
              <div>
                <b>الشكاوى والمقترحات</b>
                <p style={styles.criteriaDescription}>الواردة من الرئيسية</p>
              </div>
              <strong>{feedbackSummary.complaintsCount}</strong>
            </div>
          </div>
        </div>

        <div style={styles.resultText}>
          عدد تقييمات الأداء الداخلية: <strong>{evaluations.length}</strong>
        </div>

        {evaluations.length === 0 ? (
          <div style={styles.infoBox}>لا يوجد تقييمات حالياً.</div>
        ) : (
          <div style={styles.claimTableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>الشهر</th>
                  <th style={styles.th}>السنة</th>
                  <th style={styles.th}>نسبة الإنجاز</th>
                  <th style={styles.th}>في الموعد</th>
                  <th style={styles.th}>الدقة</th>
                  <th style={styles.th}>السرعة</th>
                  <th style={styles.th}>المراجعة</th>
                  <th style={styles.th}>الرفع</th>
                  <th style={styles.th}>التنظيم</th>
                  <th style={styles.th}>الدرجة الكلية</th>
                  <th style={styles.th}>التقدير</th>
                  <th style={styles.th}>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {evaluations.map((evaluation) => (
                  <tr key={evaluation.id} style={styles.tr}>
                    <td style={styles.td}>{evaluation.evaluation_month}</td>
                    <td style={styles.td}>{evaluation.evaluation_year}</td>
                    <td style={styles.td}>{evaluation.completion_rate}%</td>
                    <td style={styles.td}>{evaluation.on_time_rate}%</td>
                    <td style={styles.td}>{evaluation.accuracy_rate}%</td>
                    <td style={styles.td}>{evaluation.speed_rate}%</td>
                    <td style={styles.td}>{evaluation.review_rate}%</td>
                    <td style={styles.td}>{evaluation.upload_rate}%</td>
                    <td style={styles.td}>{evaluation.organization_rate}%</td>
                    <td style={styles.td}>
                      <strong>{evaluation.total_score}%</strong>
                    </td>
                    <td style={styles.td}>
                      <span
                        style={{
                          padding: "4px 12px",
                          borderRadius: "20px",
                          fontSize: "12px",
                          fontWeight: "700",
                          background: getGradeColor(evaluation.grade),
                          color: getGradeTextColor(evaluation.grade),
                        }}
                      >
                        {evaluation.grade}
                      </span>
                    </td>
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
                          onClick={() => handleOpenEdit(evaluation)}
                          title="تعديل التقييم"
                        >
                          ✏️ تعديل
                        </button>
                        <button
                          style={{
                            ...styles.deleteButton,
                            padding: "4px 8px",
                            fontSize: "12px",
                          }}
                          onClick={() => handleDelete(evaluation.id)}
                          title="حذف التقييم"
                        >
                          🗑️ حذف
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div>
            <h2 style={styles.cardTitle}>تقييمات الخدمة والشكاوى</h2>
            <p style={styles.cardSub}>
              آخر ما تم إرساله من الصفحة الرئيسية
            </p>
          </div>
        </div>

        {recentFeedback.length === 0 ? (
          <div style={styles.infoBox}>
            لا توجد تقييمات خدمة أو شكاوى واردة من الصفحة الرئيسية حتى الآن.
          </div>
        ) : (
          <div style={styles.claimTableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>النوع</th>
                  <th style={styles.th}>الاسم</th>
                  <th style={styles.th}>الهاتف</th>
                  <th style={styles.th}>التقييم</th>
                  <th style={styles.th}>الرسالة</th>
                  <th style={styles.th}>التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {recentFeedback.map((item) => (
                  <tr key={item.id} style={styles.tr}>
                    <td style={styles.td}>{item.feedback_type || "—"}</td>
                    <td style={styles.td}>{item.name || "—"}</td>
                    <td style={styles.td}>{item.phone || "—"}</td>
                    <td style={styles.td}>
                      {item.rating ? `${item.rating} / 5` : "—"}
                    </td>
                    <td style={styles.td}>{item.message || "—"}</td>
                    <td style={styles.td}>{formatFeedbackDate(item.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div style={styles.modalOverlay} onClick={() => setShowForm(false)}>
          <div style={styles.loginBox} onClick={(e) => e.stopPropagation()}>
            <button
              style={styles.closeButton}
              onClick={() => setShowForm(false)}
            >
              ×
            </button>

            <div style={{ fontSize: "40px", marginBottom: "10px" }}>📊</div>

            <h2 style={styles.loginTitle}>إضافة تقييم أداء جديد</h2>

            <p style={styles.loginDescription}>
              أدخل معايير التقييم، وسيتم إرفاق ملخص التقييمات والشكاوى من الصفحة الرئيسية لنفس الفترة
            </p>

            <form onSubmit={handleSubmit}>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "10px",
                }}
              >
                <div>
                  <label
                    style={{
                      fontSize: "13px",
                      fontWeight: "600",
                      marginBottom: "5px",
                      display: "block",
                    }}
                  >
                    الشهر
                  </label>
                  <select
                    value={formData.evaluationMonth}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        evaluationMonth: parseInt(e.target.value),
                      })
                    }
                    style={styles.input}
                  >
                    {months.map((month, index) => (
                      <option key={month} value={index + 1}>
                        {month}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    style={{
                      fontSize: "13px",
                      fontWeight: "600",
                      marginBottom: "5px",
                      display: "block",
                    }}
                  >
                    السنة
                  </label>
                  <input
                    type="number"
                    value={formData.evaluationYear}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        evaluationYear: parseInt(e.target.value),
                      })
                    }
                    style={styles.input}
                    min="2020"
                    max="2030"
                  />
                </div>
              </div>

              <div
                style={{
                  padding: "15px",
                  background: "#F8FAFC",
                  borderRadius: "8px",
                  marginBottom: "15px",
                  border: "1px solid #E2E8F0",
                }}
              >
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: "700",
                    marginBottom: "8px",
                  }}
                >
                  ملخص الجودة من الصفحة الرئيسية لنفس الفترة
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, 1fr)",
                    gap: "10px",
                    fontSize: "13px",
                  }}
                >
                  <div>تقييمات الخدمة: <strong>{selectedPeriodSummary.ratingsCount}</strong></div>
                  <div>متوسط التقييم: <strong>{selectedPeriodSummary.averageRating}</strong></div>
                  <div>الشكاوى والمقترحات: <strong>{selectedPeriodSummary.complaintsCount}</strong></div>
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "10px",
                }}
              >
                <div>
                  <label
                    style={{
                      fontSize: "13px",
                      fontWeight: "600",
                      marginBottom: "5px",
                      display: "block",
                    }}
                  >
                    نسبة الإنجاز (30%)
                  </label>
                  <input
                    type="number"
                    value={formData.completionRate}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        completionRate: parseFloat(e.target.value),
                      })
                    }
                    style={styles.input}
                    min="0"
                    max="100"
                  />
                </div>

                <div>
                  <label
                    style={{
                      fontSize: "13px",
                      fontWeight: "600",
                      marginBottom: "5px",
                      display: "block",
                    }}
                  >
                    في الموعد (25%)
                  </label>
                  <input
                    type="number"
                    value={formData.onTimeRate}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        onTimeRate: parseFloat(e.target.value),
                      })
                    }
                    style={styles.input}
                    min="0"
                    max="100"
                  />
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "10px",
                }}
              >
                <div>
                  <label
                    style={{
                      fontSize: "13px",
                      fontWeight: "600",
                      marginBottom: "5px",
                      display: "block",
                    }}
                  >
                    الدقة (20%)
                  </label>
                  <input
                    type="number"
                    value={formData.accuracyRate}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        accuracyRate: parseFloat(e.target.value),
                      })
                    }
                    style={styles.input}
                    min="0"
                    max="100"
                  />
                </div>

                <div>
                  <label
                    style={{
                      fontSize: "13px",
                      fontWeight: "600",
                      marginBottom: "5px",
                      display: "block",
                    }}
                  >
                    السرعة (10%)
                  </label>
                  <input
                    type="number"
                    value={formData.speedRate}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        speedRate: parseFloat(e.target.value),
                      })
                    }
                    style={styles.input}
                    min="0"
                    max="100"
                  />
                </div>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "10px",
                }}
              >
                <div>
                  <label
                    style={{
                      fontSize: "13px",
                      fontWeight: "600",
                      marginBottom: "5px",
                      display: "block",
                    }}
                  >
                    المراجعة (5%)
                  </label>
                  <input
                    type="number"
                    value={formData.reviewRate}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        reviewRate: parseFloat(e.target.value),
                      })
                    }
                    style={styles.input}
                    min="0"
                    max="100"
                  />
                </div>

                <div>
                  <label
                    style={{
                      fontSize: "13px",
                      fontWeight: "600",
                      marginBottom: "5px",
                      display: "block",
                    }}
                  >
                    الرفع (5%)
                  </label>
                  <input
                    type="number"
                    value={formData.uploadRate}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        uploadRate: parseFloat(e.target.value),
                      })
                    }
                    style={styles.input}
                    min="0"
                    max="100"
                  />
                </div>
              </div>

              <div>
                <label
                  style={{
                    fontSize: "13px",
                    fontWeight: "600",
                    marginBottom: "5px",
                    display: "block",
                  }}
                >
                  التنظيم (5%)
                </label>
                <input
                  type="number"
                  value={formData.organizationRate}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      organizationRate: parseFloat(e.target.value),
                    })
                  }
                  style={styles.input}
                  min="0"
                  max="100"
                />
              </div>

              <div>
                <label
                  style={{
                    fontSize: "13px",
                    fontWeight: "600",
                    marginBottom: "5px",
                    display: "block",
                  }}
                >
                  ملاحظات
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  style={{
                    ...styles.input,
                    minHeight: "80px",
                    resize: "vertical",
                  }}
                  placeholder="أضيفي ملاحظات حول التقييم..."
                />
              </div>

              <div
                style={{
                  padding: "15px",
                  background: "#F8FAFC",
                  borderRadius: "8px",
                  marginBottom: "15px",
                  border: "1px solid #E2E8F0",
                }}
              >
                <div
                  style={{
                    fontSize: "14px",
                    fontWeight: "700",
                    marginBottom: "8px",
                  }}
                >
                  النتيجة المتوقعة
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: "24px",
                      fontWeight: "800",
                      color: "#102d4a",
                    }}
                  >
                    {calculateScore().totalScore}%
                  </span>
                  <span
                    style={{
                      padding: "6px 16px",
                      borderRadius: "20px",
                      fontSize: "14px",
                      fontWeight: "700",
                      background: getGradeColor(calculateScore().grade),
                      color: getGradeTextColor(calculateScore().grade),
                    }}
                  >
                    {calculateScore().grade}
                  </span>
                </div>
              </div>

              <button type="submit" style={styles.loginButton}>
                حفظ التقييم
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
