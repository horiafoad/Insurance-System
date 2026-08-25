import { useState, useEffect } from "react";
import { styles } from "./styles";
import { supabase } from "../supabaseClient";

export default function PerformanceEvaluation() {
  const [evaluations, setEvaluations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
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
  });

  const months = [
    "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
    "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"
  ];

  useEffect(() => {
    loadEvaluations();
  }, []);

  const loadEvaluations = async () => {
    try {
      setLoading(true);
      setError("");
      const { data, error } = await supabase
        .from("performance_evaluations")
        .select("*")
        .order("evaluation_year", { ascending: false })
        .order("evaluation_month", { ascending: false });

      if (error) {
        console.error(error);
        setError("حدث خطأ أثناء تحميل التقييمات: " + error.message);
        return;
      }

      setEvaluations(data || []);
    } catch (error) {
      console.error(error);
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
      (review + upload) / 2 * 0.1 +
      organization * 0.05
    );

    let grade = "يحتاج تحسين";
    if (totalScore >= 90) grade = "ممتاز";
    else if (totalScore >= 80) grade = "جيد جداً";
    else if (totalScore >= 70) grade = "جيد";
    else if (totalScore >= 60) grade = "مقبول";

    return { totalScore, grade };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const { totalScore, grade } = calculateScore();

    try {
      const { data, error } = await supabase
        .from("performance_evaluations")
        .insert({
          evaluation_month: months[formData.evaluationMonth - 1],
          evaluation_year: formData.evaluationYear,
          completion_rate: formData.completionRate,
          on_time_rate: formData.onTimeRate,
          accuracy_rate: formData.accuracyRate,
          speed_rate: formData.speedRate,
          review_rate: formData.reviewRate,
          upload_rate: formData.uploadRate,
          organization_rate: formData.organizationRate,
          total_score: totalScore,
          grade: grade,
          notes: formData.notes,
        })
        .select()
        .single();

      if (error) {
        console.error(error);
        alert("حدث خطأ أثناء إنشاء التقييم: " + error.message);
        return;
      }

      await loadEvaluations();
      setShowForm(false);
      setFormData({
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
      });
      alert("تم إنشاء التقييم بنجاح.");
    } catch (error) {
      console.error(error);
      alert("تعذر إنشاء التقييم.");
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("هل تريدين حذف هذا التقييم؟")) return;

    try {
      const { error } = await supabase
        .from("performance_evaluations")
        .delete()
        .eq("id", id);

      if (error) {
        console.error(error);
        alert("حدث خطأ أثناء حذف التقييم: " + error.message);
        return;
      }

      await loadEvaluations();
      alert("تم حذف التقييم بنجاح.");
    } catch (error) {
      console.error(error);
      alert("تعذر حذف التقييم.");
    }
  };

  const getGradeColor = (grade) => {
    switch (grade) {
      case "ممتاز": return "#D1FAE5";
      case "جيد جداً": return "#DBEAFE";
      case "جيد": return "#FEF3C7";
      case "مقبول": return "#FEE2E2";
      default: return "#F1F5F9";
    }
  };

  const getGradeTextColor = (grade) => {
    switch (grade) {
      case "ممتاز": return "#047857";
      case "جيد جداً": return "#1D4ED8";
      case "جيد": return "#B45309";
      case "مقبول": return "#B91C1C";
      default: return "#64748B";
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
              تقييم أداء قسم الاستحقاقات بشكل دوري
            </p>
          </div>
          <button
            style={styles.primaryButton}
            onClick={() => setShowForm(true)}
          >
            ＋ إضافة تقييم
          </button>
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}

        <div style={styles.resultText}>
          عدد التقييمات: <strong>{evaluations.length}</strong>
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
                      <button
                        style={styles.deleteButton}
                        onClick={() => handleDelete(evaluation.id)}
                      >
                        حذف
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showForm && (
        <div
          style={styles.modalOverlay}
          onClick={() => setShowForm(false)}
        >
          <div
            style={styles.loginBox}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              style={styles.closeButton}
              onClick={() => setShowForm(false)}
            >
              ×
            </button>

            <div style={{ fontSize: "40px", marginBottom: "10px" }}>
              📊
            </div>

            <h2 style={styles.loginTitle}>إضافة تقييم أداء جديد</h2>

            <p style={styles.loginDescription}>
              أدخل معايير التقييم للشهر الحالي
            </p>

            <form onSubmit={handleSubmit}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ fontSize: "13px", fontWeight: "600", marginBottom: "5px", display: "block" }}>
                    الشهر
                  </label>
                  <select
                    value={formData.evaluationMonth}
                    onChange={(e) =>
                      setFormData({ ...formData, evaluationMonth: parseInt(e.target.value) })
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
                  <label style={{ fontSize: "13px", fontWeight: "600", marginBottom: "5px", display: "block" }}>
                    السنة
                  </label>
                  <input
                    type="number"
                    value={formData.evaluationYear}
                    onChange={(e) =>
                      setFormData({ ...formData, evaluationYear: parseInt(e.target.value) })
                    }
                    style={styles.input}
                    min="2020"
                    max="2030"
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ fontSize: "13px", fontWeight: "600", marginBottom: "5px", display: "block" }}>
                    نسبة الإنجاز (30%)
                  </label>
                  <input
                    type="number"
                    value={formData.completionRate}
                    onChange={(e) =>
                      setFormData({ ...formData, completionRate: parseFloat(e.target.value) })
                    }
                    style={styles.input}
                    min="0"
                    max="100"
                  />
                </div>

                <div>
                  <label style={{ fontSize: "13px", fontWeight: "600", marginBottom: "5px", display: "block" }}>
                    في الموعد (25%)
                  </label>
                  <input
                    type="number"
                    value={formData.onTimeRate}
                    onChange={(e) =>
                      setFormData({ ...formData, onTimeRate: parseFloat(e.target.value) })
                    }
                    style={styles.input}
                    min="0"
                    max="100"
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ fontSize: "13px", fontWeight: "600", marginBottom: "5px", display: "block" }}>
                    الدقة (20%)
                  </label>
                  <input
                    type="number"
                    value={formData.accuracyRate}
                    onChange={(e) =>
                      setFormData({ ...formData, accuracyRate: parseFloat(e.target.value) })
                    }
                    style={styles.input}
                    min="0"
                    max="100"
                  />
                </div>

                <div>
                  <label style={{ fontSize: "13px", fontWeight: "600", marginBottom: "5px", display: "block" }}>
                    السرعة (10%)
                  </label>
                  <input
                    type="number"
                    value={formData.speedRate}
                    onChange={(e) =>
                      setFormData({ ...formData, speedRate: parseFloat(e.target.value) })
                    }
                    style={styles.input}
                    min="0"
                    max="100"
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ fontSize: "13px", fontWeight: "600", marginBottom: "5px", display: "block" }}>
                    المراجعة (5%)
                  </label>
                  <input
                    type="number"
                    value={formData.reviewRate}
                    onChange={(e) =>
                      setFormData({ ...formData, reviewRate: parseFloat(e.target.value) })
                    }
                    style={styles.input}
                    min="0"
                    max="100"
                  />
                </div>

                <div>
                  <label style={{ fontSize: "13px", fontWeight: "600", marginBottom: "5px", display: "block" }}>
                    الرفع (5%)
                  </label>
                  <input
                    type="number"
                    value={formData.uploadRate}
                    onChange={(e) =>
                      setFormData({ ...formData, uploadRate: parseFloat(e.target.value) })
                    }
                    style={styles.input}
                    min="0"
                    max="100"
                  />
                </div>
              </div>

              <div>
                <label style={{ fontSize: "13px", fontWeight: "600", marginBottom: "5px", display: "block" }}>
                  التنظيم (5%)
                </label>
                <input
                  type="number"
                  value={formData.organizationRate}
                  onChange={(e) =>
                    setFormData({ ...formData, organizationRate: parseFloat(e.target.value) })
                  }
                  style={styles.input}
                  min="0"
                  max="100"
                />
              </div>

              <div>
                <label style={{ fontSize: "13px", fontWeight: "600", marginBottom: "5px", display: "block" }}>
                  ملاحظات
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) =>
                    setFormData({ ...formData, notes: e.target.value })
                  }
                  style={{ ...styles.input, minHeight: "80px", resize: "vertical" }}
                  placeholder="أضيفي ملاحظات حول التقييم..."
                />
              </div>

              <div style={{ 
                padding: "15px", 
                background: "#F8FAFC", 
                borderRadius: "8px", 
                marginBottom: "15px",
                border: "1px solid #E2E8F0"
              }}>
                <div style={{ fontSize: "14px", fontWeight: "700", marginBottom: "8px" }}>
                  النتيجة المتوقعة
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontSize: "24px", fontWeight: "800", color: "#102d4a" }}>
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