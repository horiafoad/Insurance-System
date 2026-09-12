import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { styles } from "./styles";
import { supabase } from "../supabaseClient";
import { ClaimStat, EmptyState } from "./ui";

const defaultCourseForm = {
  courseName: "",
  instructor: "",
  courseDate: new Date().toISOString().split("T")[0],
  location: "قاعة التدريب / كلية الهندسة",
  durationHours: "",
  attendees: "",
  notes: "",
};

function splitAttendees(value) {
  if (!value) return [];
  return value
    .split(/\r?\n|,|،/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function formatCourseDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);

  return date.toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export default function TrainingCourses() {
  const [courses, setCourses] = useState([]);
  const [registrations, setRegistrations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [showCourseForm, setShowCourseForm] = useState(false);
  const [editingCourseId, setEditingCourseId] = useState(null);
  const [courseForm, setCourseForm] = useState(defaultCourseForm);
  const [selectedCourse, setSelectedCourse] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError("");

      let remoteCourses = [];
      let remoteRegistrations = [];

      try {
        const [
          { data: coursesData, error: coursesError },
          { data: registrationsData, error: registrationsError },
        ] = await Promise.all([
          supabase
            .from("training_courses")
            .select("*")
            .order("start_date", { ascending: false }),
          supabase.from("course_registrations").select("*"),
        ]);

        if (coursesError) {
          console.warn("training_courses fetch warning:", coursesError.message);
        } else if (coursesData) {
          remoteCourses = coursesData;
        }

        if (registrationsError) {
          console.warn("course_registrations fetch warning:", registrationsError.message);
        } else if (registrationsData) {
          remoteRegistrations = registrationsData;
        }
      } catch (err) {
        console.warn("Database connection exception:", err);
      }

      // Load local backups from localStorage
      let localCourses = [];
      let localRegs = [];
      try {
        const rawC = localStorage.getItem("local_training_courses");
        if (rawC) localCourses = JSON.parse(rawC);
        const rawR = localStorage.getItem("local_course_registrations");
        if (rawR) localRegs = JSON.parse(rawR);
      } catch (e) {
        console.error("Failed to read local courses backup:", e);
      }

      // Merge remote and local courses
      const seenCourseIds = new Set();
      const combinedCourses = [];

      remoteCourses.forEach((c) => {
        if (c.id) seenCourseIds.add(String(c.id));
        combinedCourses.push(c);
      });

      localCourses.forEach((c) => {
        if (!c.id || !seenCourseIds.has(String(c.id))) {
          combinedCourses.push(c);
        }
      });

      // Merge registrations
      const seenRegIds = new Set();
      const combinedRegs = [];

      remoteRegistrations.forEach((r) => {
        if (r.id) seenRegIds.add(String(r.id));
        combinedRegs.push(r);
      });

      localRegs.forEach((r) => {
        if (!r.id || !seenRegIds.has(String(r.id))) {
          combinedRegs.push(r);
        }
      });

      // Sort by date desc
      combinedCourses.sort(
        (a, b) => new Date(b.start_date || b.created_at || 0) - new Date(a.start_date || a.created_at || 0)
      );

      setCourses(combinedCourses);
      setRegistrations(combinedRegs);
    } catch (loadError) {
      console.error(loadError);
      setError("تعذر تحميل بيانات الدورات التدريبية.");
    } finally {
      setLoading(false);
    }
  };

  const registrationsByCourse = useMemo(() => {
    const map = {};
    registrations.forEach((reg) => {
      if (!reg.course_id) return;
      if (!map[reg.course_id]) {
        map[reg.course_id] = [];
      }
      map[reg.course_id].push(reg);
    });
    return map;
  }, [registrations]);

  const handleOpenCreate = () => {
    setEditingCourseId(null);
    setCourseForm(defaultCourseForm);
    setShowCourseForm(true);
  };

  const handleOpenEdit = (course) => {
    setEditingCourseId(course.id);
    const attendees = registrationsByCourse[course.id] || [];
    const attendeesText = attendees.map((a) => a.employee_name).join("\n");

    setCourseForm({
      courseName: course.course_name || "",
      instructor: course.instructor || "",
      courseDate: course.start_date || new Date().toISOString().split("T")[0],
      location: course.location || "قاعة التدريب",
      durationHours: course.duration_hours || "",
      attendees: attendeesText,
      notes: course.description || "",
    });
    setShowCourseForm(true);
  };

  const handleCourseSubmit = async (e) => {
    e.preventDefault();

    if (!courseForm.courseName.trim()) {
      alert("من فضلك أدخلي اسم الدورة التدريبية.");
      return;
    }

    if (!courseForm.instructor.trim()) {
      alert("من فضلك أدخلي اسم المدرب أو المحاضر.");
      return;
    }

    const attendeesList = splitAttendees(courseForm.attendees);
    if (attendeesList.length === 0) {
      alert("من فضلك أدخلي اسم شخص واحد على الأقل حضر الدورة.");
      return;
    }

    setSubmitting(true);

    const generatedLocalId = editingCourseId || ("course-" + Date.now());
    const coursePayload = {
      course_name: courseForm.courseName.trim(),
      instructor: courseForm.instructor.trim(),
      start_date: courseForm.courseDate || new Date().toISOString().split("T")[0],
      end_date: courseForm.courseDate || new Date().toISOString().split("T")[0],
      location: courseForm.location?.trim() || "قاعة التدريب",
      duration_hours: courseForm.durationHours ? Number(courseForm.durationHours) : null,
      description: courseForm.notes?.trim() || null,
      current_participants: attendeesList.length,
      max_participants: attendeesList.length,
      status: "مكتمل",
    };

    try {
      if (editingCourseId) {
        // Update mode
        if (!String(editingCourseId).startsWith("course-")) {
          try {
            await supabase
              .from("training_courses")
              .update(coursePayload)
              .eq("id", editingCourseId);

            // Re-insert registrations
            await supabase
              .from("course_registrations")
              .delete()
              .eq("course_id", editingCourseId);

            const regsPayload = attendeesList.map((name) => ({
              course_id: editingCourseId,
              employee_name: name,
              attendance_status: "حضر",
              completion_status: "مكتمل",
              notes: courseForm.notes?.trim() || null,
            }));
            await supabase.from("course_registrations").insert(regsPayload);
          } catch (e) {
            console.warn("Supabase update error:", e);
          }
        }

        // Update locally
        try {
          const rawC = localStorage.getItem("local_training_courses");
          if (rawC) {
            const list = JSON.parse(rawC);
            const updated = list.map((c) =>
              c.id === editingCourseId ? { ...c, ...coursePayload } : c
            );
            localStorage.setItem("local_training_courses", JSON.stringify(updated));
          }

          const rawR = localStorage.getItem("local_course_registrations");
          if (rawR) {
            const list = JSON.parse(rawR);
            const filtered = list.filter((r) => r.course_id !== editingCourseId);
            const newRegs = attendeesList.map((name, idx) => ({
              id: "reg-" + Date.now() + "-" + idx,
              course_id: editingCourseId,
              employee_name: name,
              attendance_status: "حضر",
              completion_status: "مكتمل",
              notes: courseForm.notes?.trim() || null,
              registration_date: new Date().toISOString(),
            }));
            localStorage.setItem(
              "local_course_registrations",
              JSON.stringify([...filtered, ...newRegs])
            );
          }
        } catch (e) {
          console.error(e);
        }

        alert("✅ تم تعديل وحفظ بيانات الدورة بنجاح!");
      } else {
        // Create mode
        let savedRemoteId = null;
        try {
          const { data: createdCourse, error: courseError } = await supabase
            .from("training_courses")
            .insert(coursePayload)
            .select()
            .single();

          if (courseError) {
            console.warn("Supabase course insert warning:", courseError.message);
          } else if (createdCourse && createdCourse.id) {
            savedRemoteId = createdCourse.id;

            const registrationsPayload = attendeesList.map((employeeName) => ({
              course_id: createdCourse.id,
              employee_name: employeeName,
              attendance_status: "حضر",
              completion_status: "مكتمل",
              notes: courseForm.notes?.trim() || null,
            }));

            await supabase
              .from("course_registrations")
              .insert(registrationsPayload);
          }
        } catch (dbErr) {
          console.warn("Supabase insert exception:", dbErr);
        }

        const finalCourseId = savedRemoteId || generatedLocalId;
        const courseWithId = {
          ...coursePayload,
          id: finalCourseId,
          created_at: new Date().toISOString(),
        };

        const localRegsToAdd = attendeesList.map((name, idx) => ({
          id: "reg-" + Date.now() + "-" + idx,
          course_id: finalCourseId,
          employee_name: name,
          attendance_status: "حضر",
          completion_status: "مكتمل",
          notes: courseForm.notes?.trim() || null,
          registration_date: new Date().toISOString(),
        }));

        try {
          const currentLocalCourses = JSON.parse(
            localStorage.getItem("local_training_courses") || "[]"
          );
          currentLocalCourses.unshift(courseWithId);
          localStorage.setItem(
            "local_training_courses",
            JSON.stringify(currentLocalCourses)
          );

          const currentLocalRegs = JSON.parse(
            localStorage.getItem("local_course_registrations") || "[]"
          );
          localStorage.setItem(
            "local_course_registrations",
            JSON.stringify([...currentLocalRegs, ...localRegsToAdd])
          );
        } catch (storageErr) {
          console.error("LocalStorage save error:", storageErr);
        }

        alert("✅ تم تسجيل الدورة والحضور بنجاح!");
      }

      await loadData();
      setShowCourseForm(false);
      setEditingCourseId(null);
      setCourseForm(defaultCourseForm);
    } catch (submitError) {
      console.error(submitError);
      alert("حدث خطأ أثناء حفظ الدورة، يرجى المحاولة مرة أخرى.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteCourse = async (id) => {
    if (!window.confirm("هل تريدين حذف سجل هذه الدورة وجميع الحاضرين فيها نهائياً؟")) {
      return;
    }

    try {
      if (!String(id).startsWith("course-")) {
        try {
          await supabase.from("training_courses").delete().eq("id", id);
          await supabase.from("course_registrations").delete().eq("course_id", id);
        } catch (e) {
          console.warn("Supabase delete warning:", e);
        }
      }

      const localCourses = JSON.parse(
        localStorage.getItem("local_training_courses") || "[]"
      );
      const updatedCourses = localCourses.filter((c) => c.id !== id);
      localStorage.setItem(
        "local_training_courses",
        JSON.stringify(updatedCourses)
      );

      const localRegs = JSON.parse(
        localStorage.getItem("local_course_registrations") || "[]"
      );
      const updatedRegs = localRegs.filter((r) => r.course_id !== id);
      localStorage.setItem(
        "local_course_registrations",
        JSON.stringify(updatedRegs)
      );

      await loadData();
      alert("تم حذف سجل الدورة بنجاح.");
    } catch (deleteError) {
      console.error(deleteError);
      alert("تعذر حذف سجل الدورة.");
    }
  };

  const totalAttendeesCount = useMemo(() => {
    return courses.reduce((sum, c) => {
      const attendees = registrationsByCourse[c.id] || [];
      return sum + (attendees.length || c.current_participants || 0);
    }, 0);
  }, [courses, registrationsByCourse]);

  const filteredCourses = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return courses;

    return courses.filter((course) => {
      const attendees = registrationsByCourse[course.id] || [];
      const attendeesText = attendees.map((a) => a.employee_name).join(" ");

      const haystack = [
        course.course_name,
        course.instructor,
        course.location,
        course.description,
        attendeesText,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [courses, registrationsByCourse, search]);

  const exportExcel = () => {
    if (courses.length === 0) {
      alert("لا توجد دورات مسجلة لتصديرها.");
      return;
    }

    const rows = [];
    courses.forEach((course, idx) => {
      const attendees = registrationsByCourse[course.id] || [];
      const attendeesNames = attendees.length > 0
        ? attendees.map((a) => a.employee_name).join(" - ")
        : (course.current_participants ? course.current_participants + " حاضرين" : "—");

      rows.push({
        "م": idx + 1,
        "اسم الدورة": course.course_name,
        "اسم المدرب": course.instructor || "—",
        "تاريخ الدورة": course.start_date || "—",
        "المكان / القاعة": course.location || "—",
        "عدد الحاضرين": attendees.length || course.current_participants || 0,
        "أسماء من حضر الدورة": attendeesNames,
        "ملاحظات": course.description || "—",
      });
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "سجل الدورات التدريبية");
    XLSX.writeFile(
      wb,
      "الدورات_التدريبية_" + new Date().toISOString().split("T")[0] + ".xlsx"
    );
  };

  return (
    <div>
      <div style={styles.card}>
        <div style={styles.cardHeader}>
          <div>
            <h2 style={styles.cardTitle}>📚 سجل الدورات التدريبية</h2>
            <p style={styles.cardSub}>
              توثيق وتعديل وحذف الدورات التدريبية التي حضرها موظفو القسم مع اسم المدرب وتاريخ الحضور
            </p>
          </div>
          <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <button style={styles.secondaryButton} onClick={loadData}>
              🔄 تحديث
            </button>
            <button style={styles.secondaryButton} onClick={exportExcel}>
              📊 تصدير Excel
            </button>
            <button
              style={styles.primaryButton}
              onClick={handleOpenCreate}
            >
              ＋ تسجيل دورة جديدة
            </button>
          </div>
        </div>

        {loading && <div style={styles.infoBox}>جاري تحميل سجل الدورات...</div>}
        {error && <div style={styles.errorBox}>{error}</div>}

        <div style={styles.claimStats}>
          <ClaimStat title="إجمالي الدورات" value={courses.length} icon="📚" />
          <ClaimStat title="إجمالي الحضور" value={totalAttendeesCount} icon="👥" />
          <ClaimStat
            title="أحدث دورة"
            value={courses[0]?.course_name || "لا يوجد بعد"}
            icon="📅"
          />
        </div>

        <div style={styles.filterRow}>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔎 بحث باسم الدورة، اسم المدرب، أو اسم الموظف الحاضر..."
            style={styles.claimSearch}
          />
        </div>

        <div style={styles.resultText}>
          عدد الدورات المسجلة: <strong>{filteredCourses.length}</strong> من{" "}
          <strong>{courses.length}</strong>
        </div>

        {!loading && filteredCourses.length > 0 && (
          <div style={styles.claimTableWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>اسم الدورة</th>
                  <th style={styles.th}>تاريخ الانعقاد</th>
                  <th style={styles.th}>اسم المدرب</th>
                  <th style={styles.th}>المكان</th>
                  <th style={styles.th}>من حضر الدورة</th>
                  <th style={styles.th}>العدد</th>
                  <th style={styles.th}>ملاحظات</th>
                  <th style={styles.th}>إجراءات المدير</th>
                </tr>
              </thead>
              <tbody>
                {filteredCourses.map((course) => {
                  const attendees = registrationsByCourse[course.id] || [];
                  const count = attendees.length || course.current_participants || 0;

                  return (
                    <tr key={course.id} style={styles.tr}>
                      <td style={styles.td}>
                        <strong style={{ color: "#1E293B", fontSize: "14px" }}>
                          {course.course_name}
                        </strong>
                      </td>
                      <td style={styles.td}>{formatCourseDate(course.start_date)}</td>
                      <td style={styles.td}>
                        <span
                          style={{
                            background: "#FEF3C7",
                            color: "#92400E",
                            padding: "4px 10px",
                            borderRadius: "8px",
                            fontWeight: "600",
                            fontSize: "12px",
                            display: "inline-block",
                          }}
                        >
                          👨‍🏫 {course.instructor || "—"}
                        </span>
                      </td>
                      <td style={styles.td}>{course.location || "—"}</td>
                      <td style={styles.td}>
                        {attendees.length > 0 ? (
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: "4px",
                              maxWidth: "320px",
                            }}
                          >
                            {attendees.slice(0, 3).map((attendee) => (
                              <span
                                key={attendee.id}
                                style={{
                                  background: "#E0F2FE",
                                  color: "#0369A1",
                                  padding: "2px 8px",
                                  borderRadius: "6px",
                                  fontSize: "11px",
                                  fontWeight: "500",
                                }}
                              >
                                👤 {attendee.employee_name}
                              </span>
                            ))}
                            {attendees.length > 3 && (
                              <button
                                onClick={() => setSelectedCourse(course)}
                                style={{
                                  background: "#F1F5F9",
                                  color: "#475569",
                                  border: "none",
                                  borderRadius: "6px",
                                  padding: "2px 8px",
                                  fontSize: "11px",
                                  cursor: "pointer",
                                  fontWeight: "bold",
                                }}
                              >
                                +{attendees.length - 3} آخرين
                              </button>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: "#64748B" }}>
                            {course.current_participants ? course.current_participants + " موظفين" : "—"}
                          </span>
                        )}
                      </td>
                      <td style={styles.td}>
                        <strong style={{ color: "#047857", fontSize: "14px" }}>
                          {count}
                        </strong>
                      </td>
                      <td style={styles.td}>
                        <div
                          style={{
                            maxWidth: "180px",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                          title={course.description || ""}
                        >
                          {course.description || "—"}
                        </div>
                      </td>
                      <td style={styles.td}>
                        <div style={{ display: "flex", gap: "6px" }}>
                          <button
                            style={{
                              ...styles.secondaryButton,
                              padding: "4px 8px",
                              fontSize: "12px",
                            }}
                            onClick={() => setSelectedCourse(course)}
                            title="عرض تفاصيل الدورة والحضور"
                          >
                            👁️
                          </button>
                          <button
                            style={{
                              ...styles.viewButton,
                              background: "#FEF3C7",
                              color: "#92400E",
                              borderColor: "#FDE68A",
                              padding: "4px 8px",
                              fontSize: "12px",
                            }}
                            onClick={() => handleOpenEdit(course)}
                            title="تعديل الدورة والحضور"
                          >
                            ✏️ تعديل
                          </button>
                          <button
                            style={{
                              ...styles.deleteButton,
                              padding: "4px 8px",
                              fontSize: "12px",
                            }}
                            onClick={() => handleDeleteCourse(course.id)}
                            title="حذف الدورة"
                          >
                            🗑️ حذف
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {!loading && courses.length === 0 && !error && (
          <EmptyState text="لا يوجد سجل دورات حتى الآن. اضغطي على زر 'تسجيل دورة جديدة' لإضافة دورة." />
        )}

        {!loading && courses.length > 0 && filteredCourses.length === 0 && (
          <EmptyState text="لا توجد دورات مطابقة لشروط البحث." />
        )}
      </div>

      {/* Modal تسجيل وتعديل دورة */}
      {showCourseForm && (
        <div
          style={styles.modalOverlay}
          onClick={() => {
            if (!submitting) setShowCourseForm(false);
          }}
        >
          <div
            style={{ ...styles.loginBox, width: "min(560px, 95%)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              style={styles.closeButton}
              onClick={() => {
                if (!submitting) setShowCourseForm(false);
              }}
            >
              ×
            </button>

            <div style={{ fontSize: "42px", marginBottom: "8px" }}>📚</div>

            <h2 style={styles.loginTitle}>
              {editingCourseId ? "تعديل بيانات الدورة التدريبية" : "تسجيل دورة تدريبية جديدة"}
            </h2>

            <p style={styles.loginDescription}>
              سجلي بيانات الدورة واسم المدرب وأسماء الحاضرين لتوثيق حضور القسم
            </p>

            <form onSubmit={handleCourseSubmit}>
              <div style={{ marginBottom: "12px", textAlign: "right" }}>
                <label style={{ fontSize: "13px", fontWeight: "600", marginBottom: "4px", display: "block" }}>
                  اسم الدورة التدريبية <span style={{ color: "#DC2626" }}>*</span>
                </label>
                <input
                  type="text"
                  placeholder="مثال: نظام إدارة المرتبات والاستحقاقات"
                  value={courseForm.courseName}
                  onChange={(e) =>
                    setCourseForm({ ...courseForm, courseName: e.target.value })
                  }
                  style={styles.input}
                  required
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "12px" }}>
                <div style={{ textAlign: "right" }}>
                  <label style={{ fontSize: "13px", fontWeight: "600", marginBottom: "4px", display: "block" }}>
                    اسم المدرب / المحاضر <span style={{ color: "#DC2626" }}>*</span>
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: د. أحمد محمد"
                    value={courseForm.instructor}
                    onChange={(e) =>
                      setCourseForm({ ...courseForm, instructor: e.target.value })
                    }
                    style={styles.input}
                    required
                  />
                </div>

                <div style={{ textAlign: "right" }}>
                  <label style={{ fontSize: "13px", fontWeight: "600", marginBottom: "4px", display: "block" }}>
                    تاريخ انعقاد الدورة <span style={{ color: "#DC2626" }}>*</span>
                  </label>
                  <input
                    type="date"
                    value={courseForm.courseDate}
                    onChange={(e) =>
                      setCourseForm({ ...courseForm, courseDate: e.target.value })
                    }
                    style={styles.input}
                    required
                  />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "12px" }}>
                <div style={{ textAlign: "right" }}>
                  <label style={{ fontSize: "13px", fontWeight: "600", marginBottom: "4px", display: "block" }}>
                    المكان / القاعة
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: قاعة التدريب الرئيسية"
                    value={courseForm.location}
                    onChange={(e) =>
                      setCourseForm({ ...courseForm, location: e.target.value })
                    }
                    style={styles.input}
                  />
                </div>

                <div style={{ textAlign: "right" }}>
                  <label style={{ fontSize: "13px", fontWeight: "600", marginBottom: "4px", display: "block" }}>
                    عدد الساعات (اختياري)
                  </label>
                  <input
                    type="number"
                    placeholder="مثال: 15"
                    value={courseForm.durationHours}
                    onChange={(e) =>
                      setCourseForm({ ...courseForm, durationHours: e.target.value })
                    }
                    style={styles.input}
                  />
                </div>
              </div>

              <div style={{ marginBottom: "12px", textAlign: "right" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                  <label style={{ fontSize: "13px", fontWeight: "600" }}>
                    أسماء الحاضرين من القسم <span style={{ color: "#DC2626" }}>*</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const sample = "حورية فؤاد\nمسؤول المرتبات\nأعضاء قسم الاستحقاقات";
                      setCourseForm((prev) => ({
                        ...prev,
                        attendees: prev.attendees ? prev.attendees + "\n" + sample : sample,
                      }));
                    }}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#2563EB",
                      fontSize: "12px",
                      cursor: "pointer",
                      textDecoration: "underline",
                    }}
                  >
                    + إضافة نموذج أسماء
                  </button>
                </div>
                <textarea
                  placeholder="اكتبي أسماء الحاضرين (كل اسم في سطر مستقل أو مفصولين بفواصل)"
                  value={courseForm.attendees}
                  onChange={(e) =>
                    setCourseForm({ ...courseForm, attendees: e.target.value })
                  }
                  style={{ ...styles.input, minHeight: "100px", resize: "vertical" }}
                  required
                />
              </div>

              <div style={{ marginBottom: "16px", textAlign: "right" }}>
                <label style={{ fontSize: "13px", fontWeight: "600", marginBottom: "4px", display: "block" }}>
                  ملاحظات أو مخرجات الدورة (اختياري)
                </label>
                <textarea
                  placeholder="أي ملاحظات إضافية حول الدورة..."
                  value={courseForm.notes}
                  onChange={(e) =>
                    setCourseForm({ ...courseForm, notes: e.target.value })
                  }
                  style={{ ...styles.input, minHeight: "60px", resize: "vertical" }}
                />
              </div>

              <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={() => setShowCourseForm(false)}
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  style={{
                    ...styles.primaryButton,
                    opacity: submitting ? 0.7 : 1,
                  }}
                >
                  {submitting ? "جاري الحفظ..." : "💾 حفظ الدورة"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal تفاصيل الدورة والحضور */}
      {selectedCourse && (
        <div style={styles.modalOverlay} onClick={() => setSelectedCourse(null)}>
          <div
            style={{ ...styles.loginBox, width: "min(580px, 95%)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button style={styles.closeButton} onClick={() => setSelectedCourse(null)}>
              ×
            </button>

            <div style={{ fontSize: "38px", marginBottom: "8px" }}>🎓</div>

            <h3 style={styles.loginTitle}>{selectedCourse.course_name}</h3>

            <div style={{ textAlign: "right", marginTop: "16px", lineHeight: "1.8" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginBottom: "12px" }}>
                <div>
                  <strong>المدرب:</strong> {selectedCourse.instructor || "—"}
                </div>
                <div>
                  <strong>التاريخ:</strong> {formatCourseDate(selectedCourse.start_date)}
                </div>
                <div>
                  <strong>المكان:</strong> {selectedCourse.location || "—"}
                </div>
                <div>
                  <strong>عدد الساعات:</strong>{" "}
                  {selectedCourse.duration_hours ? selectedCourse.duration_hours + " ساعة" : "—"}
                </div>
              </div>

              <div
                style={{
                  background: "#F8FAFC",
                  padding: "12px 16px",
                  borderRadius: "10px",
                  border: "1px solid #E2E8F0",
                  marginTop: "12px",
                }}
              >
                <strong style={{ display: "block", marginBottom: "8px", color: "#1E293B" }}>
                  👥 قائمة من حضر الدورة:
                </strong>
                {(() => {
                  const attendees = registrationsByCourse[selectedCourse.id] || [];
                  if (attendees.length === 0) {
                    return (
                      <div style={{ color: "#64748B" }}>
                        تم تسجيل حضور {selectedCourse.current_participants || 0} مشارك.
                      </div>
                    );
                  }
                  return (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                      {attendees.map((a, i) => (
                        <span
                          key={a.id || i}
                          style={{
                            background: "#DBEAFE",
                            color: "#1E40AF",
                            padding: "4px 12px",
                            borderRadius: "20px",
                            fontSize: "12px",
                            fontWeight: "600",
                          }}
                        >
                          ✓ {a.employee_name}
                        </span>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {selectedCourse.description && (
                <div style={{ marginTop: "12px" }}>
                  <strong>الملاحظات:</strong> {selectedCourse.description}
                </div>
              )}
            </div>

            <div style={{ marginTop: "20px", display: "flex", justifyContent: "flex-end" }}>
              <button style={styles.primaryButton} onClick={() => setSelectedCourse(null)}>
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
