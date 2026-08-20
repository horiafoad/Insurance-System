import React, { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "./supabaseClient";

/* =========================================================
   أنواع الأعمال
========================================================= */

const TASK_TYPES = [
  {
    id: "salaries",
    title: "استمارات المرتبات",
    icon: "💰",
    color: "#FEF3C7",
    frequency: "شهري",
  },
  {
    id: "bonuses",
    title: "المكافآت",
    icon: "🎁",
    color: "#FEE2E2",
    frequency: "شهري / حسب الورود",
  },
  {
    id: "orange",
    title: "فواتير أورانج",
    icon: "📱",
    color: "#FFEDD5",
    frequency: "حسب الورود",
  },
  {
    id: "legal",
    title: "القضايا والمطالبات",
    icon: "⚖️",
    color: "#ECE9FE",
    frequency: "حسب الحالة",
  },
  {
    id: "medical",
    title: "فواتير العلاج",
    icon: "🏥",
    color: "#DBEAFE",
    frequency: "حسب الورود",
  },
  {
    id: "insurance",
    title: "التأمينات",
    icon: "🛡️",
    color: "#D1FAE5",
    frequency: "حسب الحالة",
  },
  {
    id: "variable_wages",
    title: "الأجور المتغيرة",
    icon: "📑",
    color: "#E0F2FE",
    frequency: "حسب الطلب",
  },
  {
    id: "salary_statement",
    title: "مفردات المرتب",
    icon: "🧾",
    color: "#F3E8FF",
    frequency: "حسب الطلب",
  },
  {
    id: "care",
    title: "خدمة الرعاية",
    icon: "🤲",
    color: "#CCFBF1",
    frequency: "حسب الطلب",
  },
  {
    id: "fellowship",
    title: "الزمالة",
    icon: "🤝",
    color: "#DCFCE7",
    frequency: "حسب الحالة",
  },
  {
    id: "taxes",
    title: "الضرائب",
    icon: "💼",
    color: "#FDE68A",
    frequency: "دوري",
  },
  {
    id: "staff_changes",
    title: "الترقيات والاستقالات والغياب",
    icon: "👥",
    color: "#F1F5F9",
    frequency: "حسب الوارد",
  },
];

/* =========================================================
   الحالات
========================================================= */

const STATUS = {
  not_started: {
    label: "لم يبدأ",
    icon: "⚪",
    color: "#64748B",
    bg: "#F1F5F9",
  },

  in_progress: {
    label: "جاري",
    icon: "🔵",
    color: "#2563EB",
    bg: "#DBEAFE",
  },

  waiting: {
    label: "في انتظار مستندات",
    icon: "🟡",
    color: "#B45309",
    bg: "#FEF3C7",
  },

  completed: {
    label: "تم التنفيذ",
    icon: "🟢",
    color: "#047857",
    bg: "#D1FAE5",
  },

  late: {
    label: "متأخر",
    icon: "🔴",
    color: "#DC2626",
    bg: "#FEE2E2",
  },
};

/* =========================================================
   مهمة فارغة
========================================================= */

const createEmptyTask = () => ({
  title: "",
  type: "salaries",
  responsible: "",
  receivedDate: new Date().toISOString().split("T")[0],
  dueDate: "",
  status: "not_started",
  reviewed: false,
  uploaded: false,
  notes: "",
});

/* =========================================================
   مطالبة يدوية فارغة
========================================================= */

const createEmptyClaim = () => ({
  sheetName: "إضافة يدوية",
  claimantName: "",
  claimNumber: "",
  claimDate: new Date().toISOString().split("T")[0],
  amount: "",
  status: "",
  notes: "",
});

/* =========================================================
   البيانات التجريبية
========================================================= */

const initialTasks = [
  {
    id: 1,
    title: "استمارة مرتبات شهر أغسطس",
    type: "salaries",
    responsible: "مسؤول المرتبات",
    receivedDate: "2026-08-01",
    dueDate: "2026-08-20",
    status: "completed",
    reviewed: true,
    uploaded: true,
    notes: "تمت المراجعة والرفع",
  },

  {
    id: 2,
    title: "فواتير أورانج للعاملين",
    type: "orange",
    responsible: "مسؤول الفواتير",
    receivedDate: "2026-08-18",
    dueDate: "",
    status: "in_progress",
    reviewed: false,
    uploaded: false,
    notes: "",
  },
];

/* =========================================================
   تحويل بيانات Supabase إلى شكل البرنامج
========================================================= */

function mapTaskFromDatabase(row) {
  return {
    id: row.id,
    title: row.title || "",
    type: row.type || "salaries",
    responsible: row.responsible || "",
    receivedDate: row.received_date || "",
    dueDate: row.due_date || "",
    status: row.status || "not_started",
    reviewed: Boolean(row.reviewed),
    uploaded: Boolean(row.uploaded),
    notes: row.notes || "",
  };
}

/* =========================================================
   تحويل المهمة إلى شكل قاعدة البيانات
========================================================= */

function mapTaskToDatabase(task) {
  return {
    title: task.title,
    type: task.type,
    responsible: task.responsible || null,
    received_date: task.receivedDate || null,
    due_date: task.dueDate || null,
    status: task.status || "not_started",
    reviewed: Boolean(task.reviewed),
    uploaded: Boolean(task.uploaded),
    notes: task.notes || null,
  };
}

/* =========================================================
   التطبيق الرئيسي
========================================================= */

export default function AdminDashboard() {
  const [activeMenu, setActiveMenu] = useState("home");

  const [tasks, setTasks] = useState([]);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [taskForm, setTaskForm] = useState(createEmptyTask());
  const [selectedTask, setSelectedTask] = useState(null);

  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState("2026-08");

  /* =====================================================
     المطالبات
  ===================================================== */

  const [claims, setClaims] = useState([]);
  const [claimSheets, setClaimSheets] = useState([]);
  const [claimSearch, setClaimSearch] = useState("");
  const [claimSheetFilter, setClaimSheetFilter] = useState("all");
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimError, setClaimError] = useState("");

  /* =====================================================
     إضافة مطالبة يدويًا
  ===================================================== */

  const [showClaimForm, setShowClaimForm] = useState(false);
  const [claimForm, setClaimForm] = useState(
    createEmptyClaim()
  );

  /* =====================================================
     حالة تحميل البرنامج
  ===================================================== */

  const [appLoading, setAppLoading] = useState(true);
  const [appError, setAppError] = useState("");

  /* =====================================================
     تحميل البيانات من Supabase
  ===================================================== */

  useEffect(() => {
    loadTasks();
    loadClaims();
  }, []);

  /* =====================================================
     تحميل المهام
  ===================================================== */

  const loadTasks = async () => {
    try {
      setAppLoading(true);
      setAppError("");

      const { data, error } = await supabase
        .from("tasks")
        .select("*")
        .order("created_at", {
          ascending: false,
        });

      if (error) {
        console.error(error);

        setAppError(
          "حدث خطأ أثناء تحميل المهام من قاعدة البيانات."
        );

        return;
      }

      if (data && data.length > 0) {
        setTasks(data.map(mapTaskFromDatabase));
      } else {
        setTasks([]);
      }
    } catch (error) {
      console.error(error);

      setAppError(
        "تعذر الاتصال بقاعدة البيانات."
      );
    } finally {
      setAppLoading(false);
    }
  };

  /* =====================================================
     تحميل المطالبات
  ===================================================== */

  const loadClaims = async () => {
    try {
      setClaimError("");

      const { data, error } = await supabase
        .from("claims")
        .select("*")
        .order("created_at", {
          ascending: false,
        });

      if (error) {
        console.error(error);

        setClaimError(
          "حدث خطأ أثناء تحميل المطالبات: " +
            error.message
        );

        return;
      }

      const databaseClaims = data || [];

      setClaims(databaseClaims);

      const grouped = {};

      databaseClaims.forEach((claim) => {
        const name =
          claim.sheet_name || "بدون شيت";

        if (!grouped[name]) {
          grouped[name] = 0;
        }

        grouped[name]++;
      });

      setClaimSheets(
        Object.entries(grouped).map(
          ([name, count]) => ({
            name,
            count,
          })
        )
      );
    } catch (error) {
      console.error(error);

      setClaimError(
        "تعذر تحميل المطالبات من قاعدة البيانات."
      );
    }
  };

  /* =====================================================
     استيراد Excel وحفظ المطالبات في Supabase
     
     مهم:
     لا يوجد file_name هنا لأن العمود غير موجود في جدول claims
  ===================================================== */

  const importClaimsExcel = async (event) => {
    const file = event.target.files?.[0];

    if (!file) return;

    setClaimLoading(true);
    setClaimError("");

    try {
      const buffer = await file.arrayBuffer();

      const workbook = XLSX.read(buffer, {
        type: "array",
        cellDates: true,
      });

      const importedClaims = [];

      workbook.SheetNames.forEach((sheetName) => {
        const worksheet = workbook.Sheets[sheetName];

        const rows = XLSX.utils.sheet_to_json(
          worksheet,
          {
            defval: "",
            raw: false,
          }
        );

        rows.forEach((row, index) => {
          importedClaims.push({
            sheet_name: sheetName,
            row_number: index + 2,
            data: row,
          });
        });
      });

      if (importedClaims.length === 0) {
        setClaimError(
          "تم فتح الملف ولكن لا توجد بيانات داخله."
        );

        return;
      }

      const { error } = await supabase
        .from("claims")
        .insert(importedClaims);

      if (error) {
        console.error(error);

        setClaimError(
          "تمت قراءة Excel ولكن حدث خطأ أثناء حفظ البيانات في قاعدة البيانات: " +
            error.message
        );

        return;
      }

      await loadClaims();

      setClaimSearch("");
      setClaimSheetFilter("all");

      alert(
        `تم استيراد ${importedClaims.length} مطالبة بنجاح.`
      );
    } catch (error) {
      console.error(error);

      setClaimError(
        "حدث خطأ أثناء قراءة ملف Excel. تأكدي أن الملف XLSX أو XLS."
      );
    } finally {
      setClaimLoading(false);

      event.target.value = "";
    }
  };

  /* =====================================================
     إضافة مطالبة يدويًا
  ===================================================== */

  const addManualClaim = async () => {
    if (
      !claimForm.claimantName.trim() &&
      !claimForm.claimNumber.trim()
    ) {
      alert(
        "من فضلك أدخلي اسم صاحب المطالبة أو رقم المطالبة على الأقل."
      );

      return;
    }

    try {
      setClaimLoading(true);
      setClaimError("");

      const manualData = {
        "اسم صاحب المطالبة":
          claimForm.claimantName.trim(),

        "رقم المطالبة":
          claimForm.claimNumber.trim(),

        "تاريخ المطالبة":
          claimForm.claimDate || "",

        "المبلغ":
          claimForm.amount || "",

        "الحالة":
          claimForm.status.trim(),

        "ملاحظات":
          claimForm.notes.trim(),
      };

      const { error } = await supabase
        .from("claims")
        .insert({
          sheet_name:
            claimForm.sheetName.trim() ||
            "إضافة يدوية",

          row_number: 0,

          data: manualData,
        });

      if (error) {
        console.error(error);

        setClaimError(
          "حدث خطأ أثناء حفظ المطالبة:\n" +
            error.message
        );

        return;
      }

      await loadClaims();

      setClaimForm(createEmptyClaim());
      setShowClaimForm(false);
      setClaimSearch("");
      setClaimSheetFilter("all");

      alert(
        "تمت إضافة المطالبة وحفظها في قاعدة البيانات بنجاح."
      );
    } catch (error) {
      console.error(error);

      setClaimError(
        "تعذر حفظ المطالبة في قاعدة البيانات."
      );
    } finally {
      setClaimLoading(false);
    }
  };

  /* =====================================================
     فلترة المطالبات
  ===================================================== */

  const filteredClaims = useMemo(() => {
    const search = claimSearch
      .trim()
      .toLowerCase();

    return claims.filter((claim) => {
      const sheetMatch =
        claimSheetFilter === "all" ||
        claim.sheet_name === claimSheetFilter;

      if (!sheetMatch) return false;

      if (!search) return true;

      return Object.values(
        claim.data || {}
      ).some((value) =>
        String(value)
          .toLowerCase()
          .includes(search)
      );
    });
  }, [
    claims,
    claimSearch,
    claimSheetFilter,
  ]);

  /* =====================================================
     فلترة المهام
  ===================================================== */

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const typeOK =
        filterType === "all" ||
        task.type === filterType;

      const statusOK =
        filterStatus === "all" ||
        task.status === filterStatus;

      return typeOK && statusOK;
    });
  }, [
    tasks,
    filterType,
    filterStatus,
  ]);

  /* =====================================================
     الإحصائيات
  ===================================================== */

  const stats = useMemo(() => {
    const total = tasks.length;

    const completed = tasks.filter(
      (task) => task.status === "completed"
    ).length;

    const inProgress = tasks.filter(
      (task) => task.status === "in_progress"
    ).length;

    const waiting = tasks.filter(
      (task) => task.status === "waiting"
    ).length;

    const late = tasks.filter(
      (task) => task.status === "late"
    ).length;

    const reviewed = tasks.filter(
      (task) => task.reviewed
    ).length;

    const uploaded = tasks.filter(
      (task) => task.uploaded
    ).length;

    return {
      total,
      completed,
      inProgress,
      waiting,
      late,
      reviewed,
      uploaded,

      completionRate: total
        ? Math.round(
            (completed / total) * 100
          )
        : 0,

      reviewRate: total
        ? Math.round(
            (reviewed / total) * 100
          )
        : 0,

      uploadRate: total
        ? Math.round(
            (uploaded / total) * 100
          )
        : 0,
    };
  }, [tasks]);

  /* =====================================================
     التقييم
  ===================================================== */

  const performance = useMemo(() => {
    const completion =
      stats.completionRate;

    const onTime = tasks.length
      ? Math.round(
          (tasks.filter(
            (task) =>
              task.status === "completed" &&
              (!task.dueDate ||
                task.dueDate >=
                  task.receivedDate)
          ).length /
            tasks.length) *
            100
        )
      : 0;

    const accuracy = stats.reviewRate;

    const speed = tasks.length
      ? Math.round(
          (tasks.filter(
            (task) =>
              task.status === "completed"
          ).length /
            tasks.length) *
            100
        )
      : 0;

    const reviewUpload = tasks.length
      ? Math.round(
          (stats.reviewRate +
            stats.uploadRate) /
            2
        )
      : 0;

    const organization = tasks.length
      ? Math.round(
          (tasks.filter(
            (task) =>
              task.title &&
              task.responsible &&
              task.receivedDate
          ).length /
            tasks.length) *
            100
        )
      : 0;

    const score = Math.round(
      completion * 0.3 +
        onTime * 0.25 +
        accuracy * 0.2 +
        speed * 0.1 +
        reviewUpload * 0.1 +
        organization * 0.05
    );

    let grade = "يحتاج تحسين";

    if (score >= 90) {
      grade = "ممتاز";
    } else if (score >= 80) {
      grade = "جيد جدًا";
    } else if (score >= 70) {
      grade = "جيد";
    } else if (score >= 60) {
      grade = "مقبول";
    }

    return {
      completion,
      onTime,
      accuracy,
      speed,
      reviewUpload,
      organization,
      score,
      grade,
    };
  }, [tasks, stats]);

  /* =====================================================
     إضافة مهمة
  ===================================================== */

  const addTask = async () => {
    if (
      !taskForm.title ||
      !taskForm.responsible ||
      !taskForm.receivedDate
    ) {
      alert(
        "من فضلك أدخلي اسم المهمة والمسؤول وتاريخ الورود."
      );

      return;
    }

    try {
      const databaseTask =
        mapTaskToDatabase(taskForm);

      const { data, error } =
        await supabase
          .from("tasks")
          .insert(databaseTask)
          .select()
          .single();

      if (error) {
        console.error(error);

        alert(
          "حدث خطأ أثناء حفظ المهمة:\n" +
            error.message
        );

        return;
      }

      const newTask =
        mapTaskFromDatabase(data);

      setTasks((prev) => [
        newTask,
        ...prev,
      ]);

      setTaskForm(createEmptyTask());
      setShowTaskForm(false);
    } catch (error) {
      console.error(error);

      alert(
        "تعذر حفظ المهمة في قاعدة البيانات."
      );
    }
  };

  /* =====================================================
     تعديل مهمة
  ===================================================== */

  const updateTask = async (
    id,
    changes
  ) => {
    try {
      const currentTask =
        tasks.find(
          (task) => task.id === id
        );

      if (!currentTask) return;

      const updatedTask = {
        ...currentTask,
        ...changes,
      };

      const databaseChanges =
        mapTaskToDatabase(
          updatedTask
        );

      const { data, error } =
        await supabase
          .from("tasks")
          .update(databaseChanges)
          .eq("id", id)
          .select()
          .single();

      if (error) {
        console.error(error);

        alert(
          "حدث خطأ أثناء تحديث المهمة:\n" +
            error.message
        );

        return;
      }

      const mapped =
        mapTaskFromDatabase(data);

      setTasks((prev) =>
        prev.map((task) =>
          task.id === id
            ? mapped
            : task
        )
      );

      setSelectedTask((prev) =>
        prev && prev.id === id
          ? mapped
          : prev
      );
    } catch (error) {
      console.error(error);

      alert(
        "تعذر تحديث المهمة."
      );
    }
  };

  /* =====================================================
     حذف مهمة
  ===================================================== */

  const deleteTask = async (id) => {
    if (
      !window.confirm(
        "هل تريدين حذف هذه المهمة؟"
      )
    ) {
      return;
    }

    try {
      const { error } =
        await supabase
          .from("tasks")
          .delete()
          .eq("id", id);

      if (error) {
        console.error(error);

        alert(
          "حدث خطأ أثناء حذف المهمة:\n" +
            error.message
        );

        return;
      }

      setTasks((prev) =>
        prev.filter(
          (task) => task.id !== id
        )
      );

      setSelectedTask(null);
    } catch (error) {
      console.error(error);

      alert(
        "تعذر حذف المهمة."
      );
    }
  };

  /* =====================================================
     القائمة الرئيسية
  ===================================================== */

  const menuItems = [
    {
      id: "home",
      title: "الرئيسية",
      icon: "🏠",
    },

    {
      id: "daily",
      title: "المتابعة اليومية",
      icon: "📅",
    },

    {
      id: "weekly",
      title: "التقييم الأسبوعي",
      icon: "📊",
    },

    {
      id: "monthly",
      title: "التقييم الشهري",
      icon: "📈",
    },

    {
      id: "criteria",
      title: "معايير تقييم الأداء",
      icon: "⭐",
    },
  ];

  const currentTitle =
    activeMenu === "claims"
      ? "المطالبات"
      : menuItems.find(
          (item) =>
            item.id === activeMenu
        )?.title ||
        "الرئيسية";

  /* =====================================================
     واجهة التحميل
  ===================================================== */

  if (appLoading) {
    return (
      <div
        dir="rtl"
        style={{
          ...styles.app,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={styles.loadingBox}>
          <div style={styles.loadingIcon}>
            ⏳
          </div>

          <h2>
            جاري تحميل قسم الاستحقاقات
          </h2>

          <p>
            يتم الاتصال بقاعدة البيانات...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      dir="rtl"
      style={styles.app}
    >
      {/* =================================================
          SIDEBAR
      ================================================= */}

      <aside style={styles.sidebar}>
        <div style={styles.brand}>
          <div style={styles.logo}>
            🏛️
          </div>

          <div>
            <div style={styles.college}>
              كلية الهندسة
            </div>

            <div style={styles.department}>
              قسم الاستحقاقات
            </div>
          </div>
        </div>

        <div style={styles.sidebarLabel}>
          لوحة التحكم
        </div>

        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() =>
              setActiveMenu(item.id)
            }
            style={{
              ...styles.menuButton,

              ...(activeMenu === item.id
                ? styles.menuButtonActive
                : {}),
            }}
          >
            <span>{item.icon}</span>
            <span>{item.title}</span>
          </button>
        ))}

        <div style={styles.sidebarDivider} />

        <div style={styles.sidebarLabel}>
          الأعمال
        </div>

        {TASK_TYPES.map((type) => (
          <button
            key={type.id}
            onClick={() => {
              setFilterType(type.id);
              setActiveMenu("daily");
            }}
            style={{
              ...styles.smallMenuButton,

              ...(activeMenu === "daily" &&
              filterType === type.id
                ? styles.smallMenuButtonActive
                : {}),
            }}
          >
            <span>{type.icon}</span>
            <span>{type.title}</span>
          </button>
        ))}

        {/* المطالبات */}

        <button
          onClick={() => {
            setActiveMenu("claims");
          }}
          style={{
            ...styles.smallMenuButton,

            ...(activeMenu === "claims"
              ? styles.smallMenuButtonActive
              : {}),
          }}
        >
          <span>📋</span>
          <span>المطالبات</span>
        </button>
      </aside>

      {/* =================================================
          MAIN
      ================================================= */}

      <main style={styles.main}>
        <header style={styles.header}>
          <div>
            <div style={styles.breadcrumb}>
              قسم الاستحقاقات /{" "}
              {currentTitle}
            </div>

            <h1 style={styles.pageTitle}>
              {currentTitle}
            </h1>

            <p style={styles.pageSub}>
              متابعة الأعمال وتقييم الأداء بصورة
              يومية وأسبوعية وشهرية
            </p>
          </div>

          {activeMenu !== "claims" && (
            <button
              style={styles.primaryButton}
              onClick={() => {
                setTaskForm(
                  createEmptyTask()
                );
                setShowTaskForm(true);
              }}
            >
              ＋ إضافة مهمة جديدة
            </button>
          )}
        </header>

        {appError && (
          <div style={styles.errorBox}>
            {appError}
          </div>
        )}

        {/* =================================================
            HOME
        ================================================= */}

        {activeMenu === "home" && (
          <>
            <div style={styles.statsGrid}>
              <StatCard
                title="إجمالي المهام"
                value={stats.total}
                icon="📋"
              />

              <StatCard
                title="تم التنفيذ"
                value={stats.completed}
                icon="✅"
              />

              <StatCard
                title="جاري التنفيذ"
                value={stats.inProgress}
                icon="🔄"
              />

              <StatCard
                title="متأخر"
                value={stats.late}
                icon="⚠️"
              />
            </div>

            <div style={styles.dashboardGrid}>
              <div style={styles.card}>
                <div style={styles.cardHeader}>
                  <div>
                    <h2
                      style={styles.cardTitle}
                    >
                      أداء القسم
                    </h2>

                    <p
                      style={styles.cardSub}
                    >
                      التقييم الحالي بناءً على
                      المهام المسجلة
                    </p>
                  </div>

                  <div
                    style={styles.scoreCircle}
                  >
                    {performance.score}%
                  </div>
                </div>

                <MetricBar
                  label="نسبة الإنجاز"
                  value={
                    stats.completionRate
                  }
                />

                <MetricBar
                  label="المراجعة"
                  value={stats.reviewRate}
                />

                <MetricBar
                  label="الرفع"
                  value={stats.uploadRate}
                />

                <div style={styles.gradeBox}>
                  <span>
                    التقدير العام
                  </span>

                  <strong>
                    {performance.grade}
                  </strong>
                </div>
              </div>

              <div style={styles.card}>
                <div style={styles.cardHeader}>
                  <div>
                    <h2
                      style={styles.cardTitle}
                    >
                      مهام اليوم
                    </h2>

                    <p
                      style={styles.cardSub}
                    >
                      المهام الحالية
                    </p>
                  </div>

                  <button
                    style={styles.linkButton}
                    onClick={() =>
                      setActiveMenu("daily")
                    }
                  >
                    عرض الكل
                  </button>
                </div>

                {tasks
                  .slice(0, 5)
                  .map((task) => (
                    <TaskMini
                      key={task.id}
                      task={task}
                      onClick={() =>
                        setSelectedTask(
                          task
                        )
                      }
                    />
                  ))}

                {!tasks.length && (
                  <EmptyState
                    text="لا توجد مهام مسجلة."
                  />
                )}
              </div>
            </div>

            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div>
                  <h2
                    style={styles.cardTitle}
                  >
                    أعمال قسم الاستحقاقات
                  </h2>

                  <p
                    style={styles.cardSub}
                  >
                    التصنيف حسب طبيعة العمل
                    والتكرار
                  </p>
                </div>
              </div>

              <div style={styles.workGrid}>
                {TASK_TYPES.map((type) => {
                  const count =
                    tasks.filter(
                      (task) =>
                        task.type ===
                        type.id
                    ).length;

                  return (
                    <button
                      key={type.id}
                      style={styles.workCard}
                      onClick={() => {
                        setFilterType(
                          type.id
                        );
                        setActiveMenu(
                          "daily"
                        );
                      }}
                    >
                      <span
                        style={{
                          ...styles.workIcon,
                          background:
                            type.color,
                        }}
                      >
                        {type.icon}
                      </span>

                      <span
                        style={
                          styles.workInfo
                        }
                      >
                        <b>
                          {type.title}
                        </b>

                        <small>
                          {type.frequency}
                        </small>
                      </span>

                      <span
                        style={
                          styles.workCount
                        }
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        {/* =================================================
            DAILY
        ================================================= */}

        {activeMenu === "daily" && (
          <DailyView
            tasks={filteredTasks}
            filterType={filterType}
            setFilterType={
              setFilterType
            }
            filterStatus={
              filterStatus
            }
            setFilterStatus={
              setFilterStatus
            }
            onAdd={() =>
              setShowTaskForm(true)
            }
            onSelect={
              setSelectedTask
            }
            onDelete={deleteTask}
            onUpdate={updateTask}
          />
        )}

        {/* =================================================
            CLAIMS
        ================================================= */}

        {activeMenu === "claims" && (
          <ClaimsPage
            claims={filteredClaims}
            allClaims={claims}
            sheets={claimSheets}
            search={claimSearch}
            setSearch={
              setClaimSearch
            }
            sheetFilter={
              claimSheetFilter
            }
            setSheetFilter={
              setClaimSheetFilter
            }
            loading={
              claimLoading
            }
            error={claimError}
            onImport={
              importClaimsExcel
            }
            onAddManual={() => {
              setClaimForm(
                createEmptyClaim()
              );
              setShowClaimForm(true);
            }}
          />
        )}

        {/* =================================================
            WEEKLY
        ================================================= */}

        {activeMenu === "weekly" && (
          <div style={styles.card}>
            <PerformanceView
              title="التقييم الأسبوعي"
              period="هذا الأسبوع"
              performance={
                performance
              }
              stats={stats}
            />
          </div>
        )}

        {/* =================================================
            MONTHLY
        ================================================= */}

        {activeMenu === "monthly" && (
          <div style={styles.card}>
            <div style={styles.cardHeader}>
              <div>
                <h2
                  style={styles.cardTitle}
                >
                  التقييم الشهري
                </h2>

                <p
                  style={styles.cardSub}
                >
                  تقرير أداء القسم خلال الشهر
                  المحدد
                </p>
              </div>

              <input
                type="month"
                value={selectedMonth}
                onChange={(e) =>
                  setSelectedMonth(
                    e.target.value
                  )
                }
                style={
                  styles.monthInput
                }
              />
            </div>

            <PerformanceView
              title=""
              period={selectedMonth}
              performance={
                performance
              }
              stats={stats}
            />
          </div>
        )}

        {/* =================================================
            CRITERIA
        ================================================= */}

        {activeMenu === "criteria" && (
          <CriteriaView />
        )}
      </main>

      {/* =================================================
          ADD TASK MODAL
      ================================================= */}

      {showTaskForm && (
        <Modal
          title="إضافة مهمة / معاملة جديدة"
          onClose={() =>
            setShowTaskForm(false)
          }
        >
          <div style={styles.formGrid}>
            <Field label="اسم المهمة / المعاملة">
              <input
                value={taskForm.title}
                onChange={(e) =>
                  setTaskForm({
                    ...taskForm,
                    title:
                      e.target.value,
                  })
                }
                placeholder="اسم المهمة"
                style={styles.input}
              />
            </Field>

            <Field label="نوع العمل">
              <select
                value={taskForm.type}
                onChange={(e) =>
                  setTaskForm({
                    ...taskForm,
                    type:
                      e.target.value,
                  })
                }
                style={styles.input}
              >
                {TASK_TYPES.map(
                  (type) => (
                    <option
                      key={type.id}
                      value={type.id}
                    >
                      {type.title}
                    </option>
                  )
                )}
              </select>
            </Field>

            <Field label="المسؤول">
              <input
                value={
                  taskForm.responsible
                }
                onChange={(e) =>
                  setTaskForm({
                    ...taskForm,
                    responsible:
                      e.target.value,
                  })
                }
                placeholder="اسم الموظف المسؤول"
                style={styles.input}
              />
            </Field>

            <Field label="تاريخ ورود المعاملة">
              <input
                type="date"
                value={
                  taskForm.receivedDate
                }
                onChange={(e) =>
                  setTaskForm({
                    ...taskForm,
                    receivedDate:
                      e.target.value,
                  })
                }
                style={styles.input}
              />
            </Field>

            <Field label="موعد الاستحقاق">
              <input
                type="date"
                value={
                  taskForm.dueDate
                }
                onChange={(e) =>
                  setTaskForm({
                    ...taskForm,
                    dueDate:
                      e.target.value,
                  })
                }
                style={styles.input}
              />
            </Field>

            <Field label="الحالة">
              <select
                value={taskForm.status}
                onChange={(e) =>
                  setTaskForm({
                    ...taskForm,
                    status:
                      e.target.value,
                  })
                }
                style={styles.input}
              >
                {Object.entries(
                  STATUS
                ).map(
                  ([
                    key,
                    value,
                  ]) => (
                    <option
                      key={key}
                      value={key}
                    >
                      {value.label}
                    </option>
                  )
                )}
              </select>
            </Field>

            <Field
              label="ملاحظات"
              full
            >
              <textarea
                value={
                  taskForm.notes
                }
                onChange={(e) =>
                  setTaskForm({
                    ...taskForm,
                    notes:
                      e.target.value,
                  })
                }
                style={{
                  ...styles.input,
                  minHeight: "90px",
                  resize: "vertical",
                }}
              />
            </Field>
          </div>

          <div
            style={
              styles.modalActions
            }
          >
            <button
              style={
                styles.secondaryButton
              }
              onClick={() =>
                setShowTaskForm(false)
              }
            >
              إلغاء
            </button>

            <button
              style={
                styles.primaryButton
              }
              onClick={addTask}
            >
              حفظ المهمة
            </button>
          </div>
        </Modal>
      )}

      {/* =================================================
          ADD CLAIM MODAL
      ================================================= */}

      {showClaimForm && (
        <Modal
          title="＋ إضافة مطالبة جديدة"
          onClose={() =>
            setShowClaimForm(false)
          }
        >
          <div style={styles.manualClaimIntro}>
            <span style={styles.manualClaimIcon}>
              📋
            </span>

            <div>
              <strong>
                إضافة مطالبة يدويًا
              </strong>

              <p>
                البيانات سيتم حفظها مباشرة في
                قاعدة بيانات Supabase.
              </p>
            </div>
          </div>

          <div style={styles.formGrid}>
            <Field label="اسم صاحب المطالبة">
              <input
                value={
                  claimForm.claimantName
                }
                onChange={(e) =>
                  setClaimForm({
                    ...claimForm,
                    claimantName:
                      e.target.value,
                  })
                }
                placeholder="اسم صاحب المطالبة"
                style={styles.input}
              />
            </Field>

            <Field label="رقم المطالبة">
              <input
                value={
                  claimForm.claimNumber
                }
                onChange={(e) =>
                  setClaimForm({
                    ...claimForm,
                    claimNumber:
                      e.target.value,
                  })
                }
                placeholder="رقم المطالبة"
                style={styles.input}
              />
            </Field>

            <Field label="التصنيف / الشيت">
              <input
                value={
                  claimForm.sheetName
                }
                onChange={(e) =>
                  setClaimForm({
                    ...claimForm,
                    sheetName:
                      e.target.value,
                  })
                }
                placeholder="مثال: مطالبات أغسطس"
                style={styles.input}
              />
            </Field>

            <Field label="تاريخ المطالبة">
              <input
                type="date"
                value={
                  claimForm.claimDate
                }
                onChange={(e) =>
                  setClaimForm({
                    ...claimForm,
                    claimDate:
                      e.target.value,
                  })
                }
                style={styles.input}
              />
            </Field>

            <Field label="المبلغ">
              <input
                type="number"
                value={
                  claimForm.amount
                }
                onChange={(e) =>
                  setClaimForm({
                    ...claimForm,
                    amount:
                      e.target.value,
                  })
                }
                placeholder="قيمة المطالبة"
                style={styles.input}
              />
            </Field>

            <Field label="الحالة">
              <select
                value={
                  claimForm.status
                }
                onChange={(e) =>
                  setClaimForm({
                    ...claimForm,
                    status:
                      e.target.value,
                  })
                }
                style={styles.input}
              >
                <option value="">
                  اختاري الحالة
                </option>

                <option value="جديدة">
                  جديدة
                </option>

                <option value="قيد المراجعة">
                  قيد المراجعة
                </option>

                <option value="في انتظار مستندات">
                  في انتظار مستندات
                </option>

                <option value="تم التنفيذ">
                  تم التنفيذ
                </option>

                <option value="مرفوضة">
                  مرفوضة
                </option>
              </select>
            </Field>

            <Field
              label="ملاحظات"
              full
            >
              <textarea
                value={
                  claimForm.notes
                }
                onChange={(e) =>
                  setClaimForm({
                    ...claimForm,
                    notes:
                      e.target.value,
                  })
                }
                placeholder="أي ملاحظات إضافية..."
                style={{
                  ...styles.input,
                  minHeight: 100,
                  resize: "vertical",
                }}
              />
            </Field>
          </div>

          <div
            style={
              styles.modalActions
            }
          >
            <button
              style={
                styles.secondaryButton
              }
              onClick={() =>
                setShowClaimForm(false)
              }
            >
              إلغاء
            </button>

            <button
              style={
                styles.primaryButton
              }
              onClick={
                addManualClaim
              }
              disabled={claimLoading}
            >
              {claimLoading
                ? "جاري الحفظ..."
                : "💾 حفظ المطالبة"}
            </button>
          </div>
        </Modal>
      )}

      {/* =================================================
          TASK DETAILS
      ================================================= */}

      {selectedTask && (
        <Modal
          title="تفاصيل المهمة"
          onClose={() =>
            setSelectedTask(null)
          }
        >
          <div
            style={
              styles.detailHeader
            }
          >
            <div>
              <h3
                style={{
                  margin: 0,
                }}
              >
                {selectedTask.title}
              </h3>

              <p
                style={
                  styles.cardSub
                }
              >
                {
                  getType(
                    selectedTask.type
                  )?.title
                }
              </p>
            </div>

            <StatusBadge
              status={
                selectedTask.status
              }
            />
          </div>

          <div
            style={
              styles.detailGrid
            }
          >
            <Detail
              label="المسؤول"
              value={
                selectedTask.responsible ||
                "—"
              }
            />

            <Detail
              label="تاريخ الورود"
              value={
                selectedTask.receivedDate ||
                "—"
              }
            />

            <Detail
              label="موعد التنفيذ"
              value={
                selectedTask.dueDate ||
                "غير محدد"
              }
            />

            <Detail
              label="المراجعة"
              value={
                selectedTask.reviewed
                  ? "تمت"
                  : "لم تتم"
              }
            />

            <Detail
              label="الرفع"
              value={
                selectedTask.uploaded
                  ? "تم"
                  : "لم يتم"
              }
            />

            <Detail
              label="الملاحظات"
              value={
                selectedTask.notes ||
                "لا توجد"
              }
            />
          </div>

          <div
            style={
              styles.statusActions
            }
          >
            <span
              style={
                styles.actionTitle
              }
            >
              تحديث الحالة:
            </span>

            {Object.entries(
              STATUS
            ).map(
              ([
                key,
                value,
              ]) => (
                <button
                  key={key}
                  onClick={() =>
                    updateTask(
                      selectedTask.id,
                      {
                        status: key,
                      }
                    )
                  }
                  style={{
                    ...styles.statusButton,

                    background:
                      selectedTask.status ===
                      key
                        ? value.bg
                        : "#fff",

                    borderColor:
                      selectedTask.status ===
                      key
                        ? value.color
                        : "#E5E7EB",

                    color:
                      value.color,
                  }}
                >
                  {value.icon}{" "}
                  {value.label}
                </button>
              )
            )}
          </div>

          <div
            style={
              styles.checkRow
            }
          >
            <label>
              <input
                type="checkbox"
                checked={
                  selectedTask.reviewed
                }
                onChange={(e) =>
                  updateTask(
                    selectedTask.id,
                    {
                      reviewed:
                        e.target.checked,
                    }
                  )
                }
              />{" "}
              تمت المراجعة
            </label>

            <label>
              <input
                type="checkbox"
                checked={
                  selectedTask.uploaded
                }
                onChange={(e) =>
                  updateTask(
                    selectedTask.id,
                    {
                      uploaded:
                        e.target.checked,
                    }
                  )
                }
              />{" "}
              تم الرفع
            </label>
          </div>

          <div
            style={
              styles.modalActions
            }
          >
            <button
              style={
                styles.deleteLargeButton
              }
              onClick={() =>
                deleteTask(
                  selectedTask.id
                )
              }
            >
              حذف المهمة
            </button>

            <button
              style={
                styles.primaryButton
              }
              onClick={() =>
                setSelectedTask(null)
              }
            >
              إغلاق
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* =========================================================
   صفحة المطالبات
========================================================= */

function ClaimsPage({
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
      Object.keys(
        claim.data || {}
      ).forEach((key) => {
        if (!result.includes(key)) {
          result.push(key);
        }
      });
    });

    return result;
  }, [allClaims]);

  const total =
    allClaims.length;

  const currentSheetCount =
    sheetFilter === "all"
      ? total
      : allClaims.filter(
          (item) =>
            item.sheet_name ===
            sheetFilter
        ).length;

  return (
    <div>
      <div style={styles.card}>
        <div
          style={
            styles.claimsHeader
          }
        >
          <div>
            <h2
              style={
                styles.cardTitle
              }
            >
              📋 قسم المطالبات
            </h2>

            <p
              style={
                styles.cardSub
              }
            >
              إضافة ومتابعة واستيراد ملفات
              المطالبات
            </p>
          </div>

          <div style={styles.claimHeaderButtons}>
            <button
              style={
                styles.manualClaimButton
              }
              onClick={onAddManual}
            >
              ＋ إضافة مطالبة
            </button>

            <label
              style={
                styles.excelButton
              }
            >
              📥 استيراد ملف Excel

              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={onImport}
                style={{
                  display: "none",
                }}
              />
            </label>
          </div>
        </div>

        {loading && (
          <div
            style={
              styles.infoBox
            }
          >
            جاري قراءة وحفظ البيانات...
          </div>
        )}

        {error && (
          <div
            style={
              styles.errorBox
            }
          >
            {error}
          </div>
        )}

        <div
          style={
            styles.claimStats
          }
        >
          <ClaimStat
            title="إجمالي السجلات"
            value={
              allClaims.length
            }
            icon="📋"
          />

          {sheets.map(
            (sheet) => (
              <ClaimStat
                key={sheet.name}
                title={sheet.name}
                value={
                  sheet.count
                }
                icon="📊"
              />
            )
          )}
        </div>

        {sheets.length > 0 && (
          <>
            <div
              style={
                styles.filterRow
              }
            >
              <input
                type="text"
                value={search}
                onChange={(e) =>
                  setSearch(
                    e.target.value
                  )
                }
                placeholder="🔎 بحث بالاسم أو رقم المطالبة أو أي بيان"
                style={
                  styles.claimSearch
                }
              />

              <select
                value={
                  sheetFilter
                }
                onChange={(e) =>
                  setSheetFilter(
                    e.target.value
                  )
                }
                style={
                  styles.claimSelect
                }
              >
                <option value="all">
                  كل التصنيفات
                </option>

                {sheets.map(
                  (sheet) => (
                    <option
                      key={
                        sheet.name
                      }
                      value={
                        sheet.name
                      }
                    >
                      {sheet.name}
                    </option>
                  )
                )}
              </select>
            </div>

            <div
              style={
                styles.resultText
              }
            >
              عدد النتائج الحالية:{" "}
              <strong>
                {claims.length}
              </strong>{" "}
              من{" "}
              <strong>
                {currentSheetCount}
              </strong>
            </div>

            {claims.length >
              0 && (
              <div
                style={
                  styles.claimTableWrapper
                }
              >
                <table
                  style={
                    styles.table
                  }
                >
                  <thead>
                    <tr>
                      <th
                        style={
                          styles.th
                        }
                      >
                        التصنيف
                      </th>

                      <th
                        style={
                          styles.th
                        }
                      >
                        رقم الصف
                      </th>

                      {columns.map(
                        (
                          column
                        ) => (
                          <th
                            key={
                              column
                            }
                            style={
                              styles.th
                            }
                          >
                            {column}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>

                  <tbody>
                    {claims
                      .slice(
                        0,
                        300
                      )
                      .map(
                        (
                          claim
                        ) => (
                          <tr
                            key={
                              claim.id
                            }
                            style={
                              styles.tr
                            }
                          >
                            <td
                              style={
                                styles.td
                              }
                            >
                              {
                                claim.sheet_name
                              }
                            </td>

                            <td
                              style={
                                styles.td
                              }
                            >
                              {claim.row_number ===
                              0
                                ? "يدوي"
                                : claim.row_number}
                            </td>

                            {columns.map(
                              (
                                column
                              ) => (
                                <td
                                  key={
                                    column
                                  }
                                  style={
                                    styles.td
                                  }
                                >
                                  {String(
                                    claim
                                      .data?.[
                                      column
                                    ] ??
                                      ""
                                  )}
                                </td>
                              )
                            )}
                          </tr>
                        )
                      )}
                  </tbody>
                </table>

                {claims.length >
                  300 && (
                  <div
                    style={
                      styles.infoBox
                    }
                  >
                    يتم عرض أول 300
                    سجل في الشاشة فقط.
                  </div>
                )}
              </div>
            )}

            {claims.length ===
              0 && (
              <EmptyState
                text="لا توجد بيانات مطابقة للبحث."
              />
            )}
          </>
        )}

        {!sheets.length &&
          !loading && (
            <div
              style={
                styles.emptyClaims
              }
            >
              <div
                style={
                  styles.emptyIcon
                }
              >
                📋
              </div>

              <h3>
                لا توجد مطالبات حتى الآن
              </h3>

              <p>
                يمكنك إضافة مطالبة يدويًا أو
                استيراد ملف Excel.
              </p>

              <div
                style={
                  styles.emptyClaimButtons
                }
              >
                <button
                  style={
                    styles.manualClaimButtonLarge
                  }
                  onClick={onAddManual}
                >
                  ＋ إضافة مطالبة يدويًا
                </button>

                <label
                  style={
                    styles.excelButtonLarge
                  }
                >
                  📥 اختيار ملف Excel

                  <input
                    type="file"
                    accept=".xlsx,.xls"
                    onChange={
                      onImport
                    }
                    style={{
                      display:
                        "none",
                    }}
                  />
                </label>
              </div>
            </div>
          )}
      </div>
    </div>
  );
}

/* =========================================================
   Daily View
========================================================= */

function DailyView({
  tasks,
  filterType,
  setFilterType,
  filterStatus,
  setFilterStatus,
  onAdd,
  onSelect,
  onDelete,
  onUpdate,
}) {
  return (
    <div style={styles.card}>
      <div
        style={
          styles.cardHeader
        }
      >
        <div>
          <h2
            style={
              styles.cardTitle
            }
          >
            المتابعة اليومية
          </h2>

          <p
            style={
              styles.cardSub
            }
          >
            متابعة كل معاملة من ورودها
            حتى الإنجاز
          </p>
        </div>

        <button
          style={
            styles.primaryButton
          }
          onClick={onAdd}
        >
          ＋ إضافة مهمة
        </button>
      </div>

      <div
        style={
          styles.filterRow
        }
      >
        <select
          value={filterType}
          onChange={(e) =>
            setFilterType(
              e.target.value
            )
          }
          style={styles.filter}
        >
          <option value="all">
            كل أنواع الأعمال
          </option>

          {TASK_TYPES.map(
            (type) => (
              <option
                key={type.id}
                value={type.id}
              >
                {type.title}
              </option>
            )
          )}
        </select>

        <select
          value={filterStatus}
          onChange={(e) =>
            setFilterStatus(
              e.target.value
            )
          }
          style={styles.filter}
        >
          <option value="all">
            كل الحالات
          </option>

          {Object.entries(
            STATUS
          ).map(
            ([
              key,
              value,
            ]) => (
              <option
                key={key}
                value={key}
              >
                {value.label}
              </option>
            )
          )}
        </select>
      </div>

      <div
        style={{
          overflowX: "auto",
        }}
      >
        <table
          style={
            styles.table
          }
        >
          <thead>
            <tr>
              <th style={styles.th}>
                المهمة
              </th>

              <th style={styles.th}>
                النوع
              </th>

              <th style={styles.th}>
                المسؤول
              </th>

              <th style={styles.th}>
                الورود
              </th>

              <th style={styles.th}>
                الاستحقاق
              </th>

              <th style={styles.th}>
                الحالة
              </th>

              <th style={styles.th}>
                مراجعة
              </th>

              <th style={styles.th}>
                رفع
              </th>

              <th style={styles.th}>
                إجراء
              </th>
            </tr>
          </thead>

          <tbody>
            {tasks.map(
              (task) => (
                <tr
                  key={task.id}
                  style={
                    styles.tr
                  }
                >
                  <td style={styles.td}>
                    <b>
                      {task.title}
                    </b>
                  </td>

                  <td style={styles.td}>
                    {getType(
                      task.type
                    )?.title ||
                      "—"}
                  </td>

                  <td style={styles.td}>
                    {task.responsible ||
                      "—"}
                  </td>

                  <td style={styles.td}>
                    {task.receivedDate ||
                      "—"}
                  </td>

                  <td style={styles.td}>
                    {task.dueDate ||
                      "—"}
                  </td>

                  <td style={styles.td}>
                    <StatusBadge
                      status={
                        task.status
                      }
                    />
                  </td>

                  <td style={styles.td}>
                    <input
                      type="checkbox"
                      checked={
                        task.reviewed
                      }
                      onChange={(
                        e
                      ) =>
                        onUpdate(
                          task.id,
                          {
                            reviewed:
                              e.target
                                .checked,
                          }
                        )
                      }
                    />
                  </td>

                  <td style={styles.td}>
                    <input
                      type="checkbox"
                      checked={
                        task.uploaded
                      }
                      onChange={(
                        e
                      ) =>
                        onUpdate(
                          task.id,
                          {
                            uploaded:
                              e.target
                                .checked,
                          }
                        )
                      }
                    />
                  </td>

                  <td style={styles.td}>
                    <button
                      style={
                        styles.viewButton
                      }
                      onClick={() =>
                        onSelect(
                          task
                        )
                      }
                    >
                      عرض
                    </button>

                    <button
                      style={
                        styles.deleteButton
                      }
                      onClick={() =>
                        onDelete(
                          task.id
                        )
                      }
                    >
                      حذف
                    </button>
                  </td>
                </tr>
              )
            )}
          </tbody>
        </table>

        {!tasks.length && (
          <EmptyState
            text="لا توجد نتائج."
          />
        )}
      </div>
    </div>
  );
}

/* =========================================================
   Performance View
========================================================= */

function PerformanceView({
  title,
  period,
  performance,
  stats,
}) {
  return (
    <div>
      {title && (
        <h2
          style={
            styles.sectionHeading
          }
        >
          {title}
        </h2>
      )}

      <p
        style={
          styles.cardSub
        }
      >
        {period}
      </p>

      <div
        style={
          styles.statsGrid
        }
      >
        <StatCard
          title="نسبة الإنجاز"
          value={`${stats.completionRate}%`}
          icon="✅"
        />

        <StatCard
          title="الالتزام بالمواعيد"
          value={`${performance.onTime}%`}
          icon="⏱️"
        />

        <StatCard
          title="المراجعة"
          value={`${stats.reviewRate}%`}
          icon="🔎"
        />

        <StatCard
          title="الرفع"
          value={`${stats.uploadRate}%`}
          icon="⬆️"
        />
      </div>

      <div
        style={
          styles.performanceBox
        }
      >
        <div
          style={
            styles.bigScore
          }
        >
          {performance.score}%
        </div>

        <div>
          <h3
            style={{
              margin: 0,
            }}
          >
            التقييم العام:{" "}
            {performance.grade}
          </h3>

          <p
            style={
              styles.cardSub
            }
          >
            النتيجة محسوبة تلقائيًا.
          </p>
        </div>
      </div>

      <div
        style={
          styles.criteriaList
        }
      >
        <MetricRow
          name="نسبة إنجاز المهام"
          value={
            performance.completion
          }
          weight="30%"
        />

        <MetricRow
          name="الالتزام بالمواعيد"
          value={
            performance.onTime
          }
          weight="25%"
        />

        <MetricRow
          name="دقة العمل والمراجعة"
          value={
            performance.accuracy
          }
          weight="20%"
        />

        <MetricRow
          name="سرعة الإنجاز"
          value={
            performance.speed
          }
          weight="10%"
        />

        <MetricRow
          name="المراجعة والرفع"
          value={
            performance.reviewUpload
          }
          weight="10%"
        />

        <MetricRow
          name="تنظيم وتسجيل العمل"
          value={
            performance.organization
          }
          weight="5%"
        />
      </div>
    </div>
  );
}

/* =========================================================
   Criteria
========================================================= */

function CriteriaView() {
  const criteria = [
    {
      name: "نسبة إنجاز المهام",
      weight: 30,
      desc: "نسبة الأعمال التي تم تنفيذها.",
    },

    {
      name: "الالتزام بالمواعيد",
      weight: 25,
      desc: "الالتزام بمواعيد التنفيذ.",
    },

    {
      name: "دقة العمل والمراجعة",
      weight: 20,
      desc: "المراجعة وتقليل الأخطاء.",
    },

    {
      name: "سرعة الإنجاز",
      weight: 10,
      desc: "سرعة تنفيذ المعاملات.",
    },

    {
      name: "المراجعة والرفع",
      weight: 10,
      desc: "إتمام المراجعة والرفع.",
    },

    {
      name: "تنظيم وتسجيل العمل",
      weight: 5,
      desc: "اكتمال البيانات والملاحظات.",
    },
  ];

  return (
    <div style={styles.card}>
      <h2
        style={
          styles.cardTitle
        }
      >
        معايير تقييم أداء قسم
        الاستحقاقات
      </h2>

      <p
        style={
          styles.cardSub
        }
      >
        الأوزان قابلة للتعديل لاحقًا.
      </p>

      {criteria.map(
        (item) => (
          <div
            key={item.name}
            style={
              styles.criteriaCard
            }
          >
            <div
              style={
                styles.criteriaTop
              }
            >
              <div>
                <b>
                  {item.name}
                </b>

                <p
                  style={
                    styles.criteriaDescription
                  }
                >
                  {item.desc}
                </p>
              </div>

              <strong>
                {item.weight}%
              </strong>
            </div>
          </div>
        )
      )}
    </div>
  );
}

/* =========================================================
   Components
========================================================= */

function StatCard({
  title,
  value,
  icon,
}) {
  return (
    <div
      style={
        styles.statCard
      }
    >
      <div
        style={
          styles.statIcon
        }
      >
        {icon}
      </div>

      <div>
        <div
          style={
            styles.statTitle
          }
        >
          {title}
        </div>

        <div
          style={
            styles.statValue
          }
        >
          {value}
        </div>
      </div>
    </div>
  );
}

function ClaimStat({
  title,
  value,
  icon,
}) {
  return (
    <div
      style={
        styles.claimStat
      }
    >
      <div
        style={
          styles.claimStatIcon
        }
      >
        {icon}
      </div>

      <div>
        <div
          style={
            styles.statTitle
          }
        >
          {title}
        </div>

        <div
          style={
            styles.claimStatValue
          }
        >
          {value}
        </div>
      </div>
    </div>
  );
}

function MetricBar({
  label,
  value,
}) {
  return (
    <div
      style={
        styles.progressWrap
      }
    >
      <div
        style={
          styles.progressLabel
        }
      >
        <span>{label}</span>

        <b>{value}%</b>
      </div>

      <div
        style={
          styles.progressTrack
        }
      >
        <div
          style={{
            ...styles.progressFill,
            width: `${Math.min(
              value,
              100
            )}%`,
          }}
        />
      </div>
    </div>
  );
}

function MetricRow({
  name,
  value,
  weight,
}) {
  return (
    <div
      style={
        styles.criteriaRow
      }
    >
      <div
        style={{
          minWidth: "190px",
        }}
      >
        <b>{name}</b>

        <small
          style={
            styles.weight
          }
        >
          وزن {weight}
        </small>
      </div>

      <div
        style={
          styles.criteriaBar
        }
      >
        <div
          style={{
            ...styles.criteriaFill,
            width: `${Math.min(
              value,
              100
            )}%`,
          }}
        />
      </div>

      <b
        style={{
          width: 55,
        }}
      >
        {value}%
      </b>
    </div>
  );
}

function TaskMini({
  task,
  onClick,
}) {
  return (
    <button
      style={
        styles.taskMini
      }
      onClick={onClick}
    >
      <span
        style={
          styles.taskMiniIcon
        }
      >
        {getType(task.type)
          ?.icon || "📋"}
      </span>

      <span
        style={
          styles.taskMiniInfo
        }
      >
        <b>
          {task.title}
        </b>

        <small>
          {task.responsible ||
            "بدون مسؤول"}
        </small>
      </span>

      <StatusBadge
        status={task.status}
      />
    </button>
  );
}

function StatusBadge({
  status,
}) {
  const item =
    STATUS[status] ||
    STATUS.not_started;

  return (
    <span
      style={{
        ...styles.statusBadge,
        color: item.color,
        background:
          item.bg,
      }}
    >
      {item.icon}{" "}
      {item.label}
    </span>
  );
}

function Modal({
  title,
  onClose,
  children,
}) {
  return (
    <div
      style={
        styles.overlay
      }
    >
      <div
        style={
          styles.modal
        }
      >
        <div
          style={
            styles.modalHeader
          }
        >
          <h2
            style={
              styles.modalTitle
            }
          >
            {title}
          </h2>

          <button
            style={
              styles.closeButton
            }
            onClick={onClose}
          >
            ✕
          </button>
        </div>

        {children}
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  full = false,
}) {
  return (
    <div
      style={
        full
          ? {
              gridColumn:
                "1 / -1",
            }
          : {}
      }
    >
      <label
        style={
          styles.label
        }
      >
        {label}
      </label>

      {children}
    </div>
  );
}

function Detail({
  label,
  value,
}) {
  return (
    <div
      style={
        styles.detailItem
      }
    >
      <span>{label}</span>

      <b>{value}</b>
    </div>
  );
}

function EmptyState({
  text,
}) {
  return (
    <div
      style={
        styles.empty
      }
    >
      {text}
    </div>
  );
}

function getType(id) {
  return TASK_TYPES.find(
    (type) =>
      type.id === id
  );
}

/* =========================================================
   STYLES
========================================================= */

const styles = {
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
};