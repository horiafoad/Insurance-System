import { useState, useEffect } from "react";
import { styles } from "./styles";
import { supabase } from "../supabaseClient";

export default function TrainingCourses() {
  const [courses, setCourses] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showCourseForm, setShowCourseForm] = useState(false);
  const [showRegistrationForm, setShowRegistrationForm] = useState(false);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [courseForm, setCourseForm] = useState({
    courseName: "",
    courseCode: "",
    description: "",
    instructor: "",
    location: "",
    startDate: "",
    endDate: "",
    durationHours: "",
    maxParticipants: "",
    targetAudience: "",
  });
  const [registrationForm, setRegistrationForm] = useState({
    employeeName: "",
    employeeCode: "",
    department: "",
    notes: "",
  });

  useEffect(() => {
    loadCourses();
    loadRegistrations();
  }, []);

  const loadCourses = async () => {
    try {
      setLoading(true);
      setError("");
      const { data, error } = await supabase
        .from("training_courses")
        .select("*")
        .order("start_date", { ascending: true });

      if (error) {
        console.error(error);
        setError("حدث خطأ أثناء تحميل الدورات: " + error.message);
        return;
      }

      setCourses(data || []);
    } catch (error) {
      console.error(error);
      setError("تعذر تحميل الدورات من قاعدة البيانات.");
    } finally {
      setLoading(false);
    }
  };

  const loadRegistrations = async () => {
    try {
      const { data, error } = await supabase
        .from("course_registrations")
        .select("*");

      if (error) {
        console.error(error);
        return;
      }

      setRegistrations(data || []);
    } catch (error) {
      console.error(error);
    }
  };

  const handleCourseSubmit = async (e) => {
    e.preventDefault();
    if (!courseForm.courseName || !courseForm.startDate || !courseForm.endDate) {
      alert("من فضلك أدخلي اسم الدورة والتواريخ المطلوبة.");
      return;
    }

    try {
      const { data, error } = await supabase
        .from("training_courses")
        .insert({
          course_name: courseForm.courseName,
          course_code: courseForm.courseCode || null,
          description: courseForm.description,
          instructor: courseForm.instructor,
          location: courseForm.location,
          start_date: courseForm.startDate,
          end_date: courseForm.endDate,
          duration_hours: courseForm.durationHours ? parseInt(courseForm.durationHours) : null,
          max_participants: courseForm.maxParticipants ? parseInt(courseForm.maxParticipants) : null,
          target_audience: courseForm.targetAudience,
        })
        .select()
        .single();

      if (error) {
        console.error(error);
        alert("حدث خطأ أثناء إنشاء الدورة: " + error.message);
        return;
      }

      await loadCourses();
      setShowCourseForm(false);
      setCourseForm({
        courseName: "",
        courseCode: "",
        description: "",
        instructor: "",
        location: "",
        startDate: "",
        endDate: "",
        durationHours: "",
        maxParticipants: "",
        targetAudience: "",
      });
      alert("تم إنشاء الدورة بنجاح.");
    } catch (error) {
      console.error(error);
      alert("تعذر إنشاء الدورة.");
    }
  };

  const handleRegistrationSubmit = async (e) => {
    e.preventDefault();
    if (!registrationForm.employeeName || !selectedCourse) {
      alert("من فضلك أدخلي اسم الموظف واختر الدورة.");
      return;
    }

    try {
      const { error } = await supabase
        .from("course_registrations")
        .insert({
          course_id: selectedCourse.id,
          employee_name: registrationForm.employeeName,
          employee_code: registrationForm.employeeCode,
          department: registrationForm.department,
          notes: registrationForm.notes,
        });

      if (error) {
        console.error(error);
        alert("حدث خطأ أثناء التسجيل: " + error.message);
        return;
      }

      // تحديث عدد المشاركين
      await supabase
        .from("training_courses")
        .update({ current_participants: (selectedCourse.current_participants || 0) + 1 })
        .eq("id", selectedCourse.id);

      await loadCourses();
      await loadRegistrations();
      setShowRegistrationForm(false);
      setSelectedCourse(null);
      setRegistrationForm({
        employeeName: "",
        employeeCode: "",
        department: "",
        notes: "",
      });
      alert("تم التسجيل في الدورة بنجاح.");
    } catch (error) {
      console.error(error);
      alert("تعذر التسجيل في الدورة.");
    }
  };

  const handleDeleteCourse = async (id) => {
    if (!window.confirm("هل تريدين حذف هذه الدورة؟")) return;

    try {
      const { error } = await supabase
        .from("training_courses")
        .delete()
        .eq("id", id);

      if (error) {
        console.error(error);
        alert("حدث خطأ أثناء حذف الدورة: " + error.message);
        return;
      }

      await loadCourses();
      alert("تم حذف الدورة بنجاح.");
    } catch (error) {
      console.error(error);
      alert("تعذر حذف الدورة.");
    }
  };

  const handleDeleteRegistration = async (id) => {
    if (!window.confirm("هل تريدين حذف هذا التسجيل؟")) return;

    try {
      const { error } = await supabase
        .from("course_registrations")
        .delete()
        .eq("id", id);

      if (error) {
        console.error(error);
        alert("حدث خطأ أثناء حذف التسجيل: " + error.message);
        return;
      }

      await loadRegistrations();
      alert("تم حذف التسجيل بنجاح.");
    } catch (error) {
      console.error(error);
      alert("تعذر حذف التسجيل.");
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case "مجدول": return "#DBEAFE";
      case "جاري": return "#FEF3C7";
      case "مكتمل": return "#D1FAE5";
      case "ملغي": return "#FEE2E2";
      default: return "#F1F5F9";
    }
  };

  const getStatusTextColor = (status) => {
    switch (status) {
      case "مجدول": return "#1D4ED8";
      case "جاري": return "#B45309";
      case "مكتمل": return "#047857";
      case "ملغي": return "#B91C1C";
      default: return "#64748B";
    }
  };

  const getCourseRegistrations = (courseId) => {
    return registrations.filter(reg => reg.course_id === courseId);
  };

  if (loading) {
    return (
      <div style={styles.card}>
        <div style={styles.infoBox}>جاري تحميل الدورات...</div>
      </div>
    );
  }

  return (
    <div>
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div>
            <h2 style={styles.cardTitle}>الدورات التدريبية</h2>
            <p style={styles.cardSub}>
              إدارة وتنظيم الدورات التدريبية في الكلية
            </p>
          </div>
          <button
            style={styles.primaryButton}
            onClick={() => setShowCourseForm(true)}
          >
            ＋ إضافة دورة
          </button>
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}

        <div style={styles.resultText}>
          عدد الدورات: <strong>{courses.length}</strong> | 
          عدد المسجلين: <strong>{registrations.length}</strong>
        </div>

        {courses.length === 0 ? (
          <div style={styles.infoBox}>لا يوجد دورات حالياً.</div>
        ) : (
          <div style={styles.claimTableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>اسم الدورة</th>
                  <th style={styles.th}>الكود</th>
                  <th style={styles.th}>المدرب</th>
                  <th style={styles.th}>المكان</th>
                  <th style={styles.th}>تاريخ البدء</th>
                  <th style={styles.th}>تاريخ الانتهاء</th>
                  <th style={styles.th}>المدة</th>
                  <th style={styles.th}>المشاركون</th>
                  <th style={styles.th}>الحالة</th>
                  <th style={styles.th}>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {courses.map((course) => (
                  <tr key={course.id} style={styles.tr}>
                    <td style={styles.td}>
                      <strong>{course.course_name}</strong>
                      {course.description && (
                        <div style={{ fontSize: "12px", color: "#64748B", marginTop: "4px" }}>
                          {course.description}
                        </div>
                      )}
                    </td>
                    <td style={styles.td}>{course.course_code || "—"}</td>
                    <td style={styles.td}>{course.instructor || "—"}</td>
                    <td style={styles.td}>{course.location || "—"}</td>
                    <td style={styles.td}>{course.start_date || "—"}</td>
                    <td style={styles.td}>{course.end_date || "—"}</td>
                    <td style={styles.td}>{course.duration_hours ? `${course.duration_hours} ساعة` : "—"}</td>
                    <td style={styles.td}>
                      {course.current_participants || 0} / {course.max_participants || "∞"}
                    </td>
                    <td style={styles.td}>
                      <span
                        style={{
                          padding: "4px 12px",
                          borderRadius: "20px",
                          fontSize: "12px",
                          fontWeight: "700",
                          background: getStatusColor(course.status),
                          color: getStatusTextColor(course.status),
                        }}
                      >
                        {course.status}
                      </span>
                    </td>
                    <td style={styles.td}>
                      <button
                        style={styles.viewButton}
                        onClick={() => {
                          setSelectedCourse(course);
                          setShowRegistrationForm(true);
                        }}
                      >
                        تسجيل
                      </button>
                      <button
                        style={styles.deleteButton}
                        onClick={() => handleDeleteCourse(course.id)}
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

      {/* المسجلين في الدورات */}
      {registrations.length > 0 && (
        <div style={styles.card}>
          <div style={styles.cardHeader}>
            <div>
              <h2 style={styles.cardTitle}>المسجلين في الدورات</h2>
              <p style={styles.cardSub}>
                قائمة الموظفين المسجلين في الدورات التدريبية
              </p>
            </div>
          </div>

          <div style={styles.claimTableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>اسم الموظف</th>
                  <th style={styles.th}>الكود</th>
                  <th style={styles.th}>القسم</th>
                  <th style={styles.th}>الدورة</th>
                  <th style={styles.th}>تاريخ التسجيل</th>
                  <th style={styles.th}>الحضور</th>
                  <th style={styles.th}>الإتمام</th>
                  <th style={styles.th}>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {registrations.map((reg) => {
                  const course = courses.find(c => c.id === reg.course_id);
                  return (
                    <tr key={reg.id} style={styles.tr}>
                      <td style={styles.td}>{reg.employee_name}</td>
                      <td style={styles.td}>{reg.employee_code || "—"}</td>
                      <td style={styles.td}>{reg.department || "—"}</td>
                      <td style={styles.td}>{course?.course_name || "—"}</td>
                      <td style={styles.td}>
                        {new Date(reg.created_at).toLocaleDateString("ar-EG")}
                      </td>
                      <td style={styles.td}>{reg.attendance_status}</td>
                      <td style={styles.td}>{reg.completion_status}</td>
                      <td style={styles.td}>
                        <button
                          style={styles.deleteButton}
                          onClick={() => handleDeleteRegistration(reg.id)}
                        >
                          حذف
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* نموذج إضافة دورة */}
      {showCourseForm && (
        <div
          style={styles.modalOverlay}
          onClick={() => setShowCourseForm(false)}
        >
          <div
            style={styles.loginBox}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              style={styles.closeButton}
              onClick={() => setShowCourseForm(false)}
            >
              ×
            </button>

            <div style={{ fontSize: "40px", marginBottom: "10px" }}>
              📚
            </div>

            <h2 style={styles.loginTitle}>إضافة دورة تدريبية جديدة</h2>

            <p style={styles.loginDescription}>
              أدخل بيانات الدورة التدريبية
            </p>

            <form onSubmit={handleCourseSubmit}>
              <input
                type="text"
                placeholder="اسم الدورة"
                value={courseForm.courseName}
                onChange={(e) =>
                  setCourseForm({ ...courseForm, courseName: e.target.value })
                }
                style={styles.input}
                required
              />

              <input
                type="text"
                placeholder="كود الدورة (اختياري)"
                value={courseForm.courseCode}
                onChange={(e) =>
                  setCourseForm({ ...courseForm, courseCode: e.target.value })
                }
                style={styles.input}
              />

              <textarea
                placeholder="وصف الدورة (اختياري)"
                value={courseForm.description}
                onChange={(e) =>
                  setCourseForm({ ...courseForm, description: e.target.value })
                }
                style={{ ...styles.input, minHeight: "60px", resize: "vertical" }}
              />

              <input
                type="text"
                placeholder="اسم المدرب"
                value={courseForm.instructor}
                onChange={(e) =>
                  setCourseForm({ ...courseForm, instructor: e.target.value })
                }
                style={styles.input}
              />

              <input
                type="text"
                placeholder="مكان الدورة"
                value={courseForm.location}
                onChange={(e) =>
                  setCourseForm({ ...courseForm, location: e.target.value })
                }
                style={styles.input}
              />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ fontSize: "13px", fontWeight: "600", marginBottom: "5px", display: "block" }}>
                    تاريخ البدء
                  </label>
                  <input
                    type="date"
                    value={courseForm.startDate}
                    onChange={(e) =>
                      setCourseForm({ ...courseForm, startDate: e.target.value })
                    }
                    style={styles.input}
                    required
                  />
                </div>

                <div>
                  <label style={{ fontSize: "13px", fontWeight: "600", marginBottom: "5px", display: "block" }}>
                    تاريخ الانتهاء
                  </label>
                  <input
                    type="date"
                    value={courseForm.endDate}
                    onChange={(e) =>
                      setCourseForm({ ...courseForm, endDate: e.target.value })
                    }
                    style={styles.input}
                    required
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
                <div>
                  <label style={{ fontSize: "13px", fontWeight: "600", marginBottom: "5px", display: "block" }}>
                    المدة (ساعات)
                  </label>
                  <input
                    type="number"
                    placeholder="عدد الساعات"
                    value={courseForm.durationHours}
                    onChange={(e) =>
                      setCourseForm({ ...courseForm, durationHours: e.target.value })
                    }
                    style={styles.input}
                    min="1"
                  />
                </div>

                <div>
                  <label style={{ fontSize: "13px", fontWeight: "600", marginBottom: "5px", display: "block" }}>
                    الحد الأقصى للمشاركين
                  </label>
                  <input
                    type="number"
                    placeholder="عدد المشاركين"
                    value={courseForm.maxParticipants}
                    onChange={(e) =>
                      setCourseForm({ ...courseForm, maxParticipants: e.target.value })
                    }
                    style={styles.input}
                    min="1"
                  />
                </div>
              </div>

              <input
                type="text"
                placeholder="الفئة المستهدفة"
                value={courseForm.targetAudience}
                onChange={(e) =>
                  setCourseForm({ ...courseForm, targetAudience: e.target.value })
                }
                style={styles.input}
              />

              <button type="submit" style={styles.loginButton}>
                إنشاء الدورة
              </button>
            </form>
          </div>
        </div>
      )}

      {/* نموذج تسجيل في دورة */}
      {showRegistrationForm && selectedCourse && (
        <div
          style={styles.modalOverlay}
          onClick={() => setShowRegistrationForm(false)}
        >
          <div
            style={styles.loginBox}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              style={styles.closeButton}
              onClick={() => setShowRegistrationForm(false)}
            >
              ×
            </button>

            <div style={{ fontSize: "40px", marginBottom: "10px" }}>
              ✍️
            </div>

            <h2 style={styles.loginTitle}>تسجيل في دورة</h2>

            <p style={styles.loginDescription}>
              تسجيل موظف في دورة: <strong>{selectedCourse.course_name}</strong>
            </p>

            <form onSubmit={handleRegistrationSubmit}>
              <input
                type="text"
                placeholder="اسم الموظف"
                value={registrationForm.employeeName}
                onChange={(e) =>
                  setRegistrationForm({ ...registrationForm, employeeName: e.target.value })
                }
                style={styles.input}
                required
              />

              <input
                type="text"
                placeholder="كود الموظف (اختياري)"
                value={registrationForm.employeeCode}
                onChange={(e) =>
                  setRegistrationForm({ ...registrationForm, employeeCode: e.target.value })
                }
                style={styles.input}
              />

              <input
                type="text"
                placeholder="القسم (اختياري)"
                value={registrationForm.department}
                onChange={(e) =>
                  setRegistrationForm({ ...registrationForm, department: e.target.value })
                }
                style={styles.input}
              />

              <textarea
                placeholder="ملاحظات (اختياري)"
                value={registrationForm.notes}
                onChange={(e) =>
                  setRegistrationForm({ ...registrationForm, notes: e.target.value })
                }
                style={{ ...styles.input, minHeight: "60px", resize: "vertical" }}
              />

              <button type="submit" style={styles.loginButton}>
                تأكيد التسجيل
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}