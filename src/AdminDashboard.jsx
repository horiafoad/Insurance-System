import React, { useEffect, useMemo, useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "./supabaseClient";
import { styles } from "./dashboard/styles";
import {
  MENU_ITEMS,
  createEmptyClaim,
  createEmptyTask,
  mapTaskFromDatabase,
  mapTaskToDatabase,
} from "./dashboard/data";
import Sidebar from "./dashboard/Sidebar";
import HomeView from "./dashboard/HomeView";
import DailyView from "./dashboard/DailyView";
import ClaimsPage from "./dashboard/ClaimsPage";
import PerformanceView from "./dashboard/PerformanceView";
import CriteriaView, { ServiceRequestsView } from "./dashboard/CriteriaView";
import StudyLeavesPage from "./dashboard/StudyLeavesPage";
import UserManagement from "./dashboard/UserManagement";
import FeedbackView from "./dashboard/FeedbackView";
import TrainingCourses from "./dashboard/TrainingCourses";
import EmployeePerformance from "./dashboard/EmployeePerformance";
import EmployeeProfilePage from "./dashboard/EmployeeProfilePage";
import EmployeePerformanceDashboard from "./dashboard/EmployeePerformanceDashboard";
import FacultySalariesPage from "./dashboard/FacultySalariesPage";
import IssuesManagementPage from "./dashboard/IssuesManagementPage";
import ConnectionTest from "./dashboard/ConnectionTest";
import LettersTrackingPage from "./dashboard/LettersTrackingPage";
import FacultySalaryArchivePage from "./dashboard/FacultySalaryArchivePage";
import EmployeeSalaryArchivePage from "./dashboard/EmployeeSalaryArchivePage";
import ExecutiveOrdersPage from "./dashboard/ExecutiveOrdersPage";
import OrgStructurePage from "./dashboard/OrgStructurePage";
import PushNotificationsPanel from "./dashboard/PushNotificationsPanel";
import AdminPushDevicesPanel from "./dashboard/AdminPushDevicesPanel";
import InstallAppButton from "./dashboard/InstallAppButton";
import CheckForUpdatesButton from "./dashboard/CheckForUpdatesButton";
import SupportDrawerButton from "./dashboard/SupportDrawerButton";
import {
  ClaimFormModal,
  TaskDetailsModal,
  TaskFormModal,
} from "./dashboard/DashboardModals";
import {
  loadStudyLeaves,
  saveStudyLeaves,
} from "./dashboard/studyLeaves";
import {
  hasAnyPermission,
  hasPermission,
  canAccessMenu,
} from "./utils/permissions";
import { useRealtimeSync, applyRowChange } from "./utils/realtimeSync";

export default function AdminDashboard({ currentUser, focusRequestId: propFocusId }) {
  const qrCodeFromUrl = new URLSearchParams(window.location.search).get("qr")?.trim() || "";
  const openRequestFromUrl = new URLSearchParams(window.location.search).get("openRequest") || "";
  const openLetterFromUrl = new URLSearchParams(window.location.search).get("openLetter")?.trim() || "";

  // الحسابات القديمة (permissions = null) بوصول كامل ترى لوحة التحكم.
  // المستخدم المقيّد (مثل: خطابات فقط) يُفتح مباشرة على صفحة الخطابات
  // ولا يرى لوحة التحكم الرئيسية (بيانات النظام كاملة).
  const hasDashboardAccess =
    currentUser?.permissions == null ||
    (Array.isArray(currentUser.permissions) &&
      (currentUser.permissions.includes("entitlements") ||
        currentUser.permissions.includes("reports") ||
        currentUser.permissions.includes("requests") ||
        currentUser.permissions.includes("user_management") ||
        currentUser.permissions.includes("org_structure")));

  // وضع العرض الأعرض: يُطبَّق على حساب «عبد الله» فقط عند دخوله لوحة الإدارة،
  // لتقليل المسافات البيضاء الجانبية وجعل مساحة العمل أعرض وأكبر.
  const isWideLayout = Boolean(
    currentUser &&
      /عبد\s*الله|abdullah/i.test(
        [currentUser.full_name, currentUser.username]
          .filter(Boolean)
          .join(" ")
      )
  );

  const [activeMenu, setActiveMenu] = useState(
    qrCodeFromUrl
      ? "letters_tracking"
      : openRequestFromUrl
        ? "service_requests"
        : openLetterFromUrl
          ? "letters_tracking"
          : hasDashboardAccess
            ? "home"
            : "letters_tracking"
  );

  useEffect(() => {
    if (qrCodeFromUrl) {
      setActiveMenu("letters_tracking");
    }
  }, [qrCodeFromUrl]);

  const [focusRequestId, setFocusRequestId] = useState(openRequestFromUrl || propFocusId || null);
  const [openLetterId, setOpenLetterId] = useState(openLetterFromUrl || null);

  useEffect(() => {
    const nextId = propFocusId || openRequestFromUrl || null;
    if (nextId) {
      setFocusRequestId(nextId);
      if (canAccessMenu(currentUser, "service_requests")) {
        setActiveMenu("service_requests");
      }
    }
  }, [propFocusId, openRequestFromUrl, currentUser]);

  useEffect(() => {
    if (openLetterFromUrl) {
      setOpenLetterId(openLetterFromUrl);
      if (canAccessMenu(currentUser, "letters_tracking")) {
        setActiveMenu("letters_tracking");
      }
    }
  }, [openLetterFromUrl, currentUser]);

  const [tasks, setTasks] = useState([]);
  const [showTaskForm, setShowTaskForm] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 768px)");
    const handleChange = (e) => {
      setIsMobile(e.matches);
      if (!e.matches) setSidebarOpen(false);
    };
    setIsMobile(mq.matches);
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", handleChange);
      return () => mq.removeEventListener("change", handleChange);
    }
    return undefined;
  }, []);

  const [taskForm, setTaskForm] = useState(createEmptyTask());
  const [selectedTask, setSelectedTask] = useState(null);

  const [filterType, setFilterType] = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [selectedMonth, setSelectedMonth] = useState("2026-08");

  const [claims, setClaims] = useState([]);
  const [claimSheets, setClaimSheets] = useState([]);
  const [claimSearch, setClaimSearch] = useState("");
  const [claimSheetFilter, setClaimSheetFilter] = useState("all");
  const [claimLoading, setClaimLoading] = useState(false);
  const [claimError, setClaimError] = useState("");

  const [showClaimForm, setShowClaimForm] = useState(false);
  const [claimForm, setClaimForm] = useState(createEmptyClaim());

  const [studyLeaves, setStudyLeaves] = useState([]);
  const [studyLeaveLoading, setStudyLeaveLoading] = useState(false);
  const [studyLeaveError, setStudyLeaveError] = useState("");

  const [serviceRequestFilter, setServiceRequestFilter] = useState("all");

  const [appLoading, setAppLoading] = useState(true);
  const [appError, setAppError] = useState("");
  const [notifications, setNotifications] = useState([]);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [urgentNotification, setUrgentNotification] = useState(null);
  const knownNotificationIds = useRef(new Set());

  // إشعارات قاعدة البيانات (جدول notifications) — جرس الإشعارات + العداد غير المقروء.
  const [dbNotifications, setDbNotifications] = useState([]);

  // Toast فوري يظهر عند وصول إشعار جديد أثناء فتح التطبيق في نفس التبويب.
  const [liveToast, setLiveToast] = useState(null);
  const toastTimerRef = useRef(null);

  const showLiveToast = (notification) => {
    if (!notification?.id) return;
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setLiveToast({
      id: notification.id,
      type: notification.type,
      title: notification.title || "إشعار جديد",
      body: notification.body || "",
      referenceId: notification.reference_id || "",
    });
    toastTimerRef.current = window.setTimeout(() => {
      setLiveToast(null);
      toastTimerRef.current = null;
    }, 7000);
  };

  useEffect(() => {
    if (hasPermission(currentUser, "entitlements")) {
      loadTasks();
      loadClaims();
      setStudyLeaves(loadStudyLeaves());
    } else {
      setAppLoading(false);
    }
  }, []);

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
        setAppError("حدث خطأ أثناء تحميل المهام من قاعدة البيانات.");
        return;
      }

      if (data && data.length > 0) {
        setTasks(data.map(mapTaskFromDatabase));
      } else {
        setTasks([]);
      }
    } catch (error) {
      console.error(error);
      setAppError("تعذر الاتصال بقاعدة البيانات.");
    } finally {
      setAppLoading(false);
    }
  };

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
        setClaimError("حدث خطأ أثناء تحميل المطالبات: " + error.message);
        return;
      }

      const databaseClaims = data || [];
      setClaims(databaseClaims);

      const grouped = {};

      databaseClaims.forEach((claim) => {
        const name = claim.sheet_name || "بدون شيت";
        if (!grouped[name]) {
          grouped[name] = 0;
        }
        grouped[name]++;
      });

      setClaimSheets(
        Object.entries(grouped).map(([name, count]) => ({
          name,
          count,
        }))
      );
    } catch (error) {
      console.error(error);
      setClaimError("تعذر تحميل المطالبات من قاعدة البيانات.");
    }
  };

  /* ===== المزامنة اللحظية (Supabase Realtime) — الصف المتأثر فقط ===== */
  const realtimeClaimsRef = useRef([]);

  useEffect(() => {
    realtimeClaimsRef.current = claims;
  }, [claims]);

  const rebuildClaimSheets = (rows) => {
    const grouped = {};
    (rows || []).forEach((claim) => {
      const name = claim.sheet_name || "بدون شيت";
      if (!grouped[name]) grouped[name] = 0;
      grouped[name]++;
    });
    return Object.entries(grouped).map(([name, count]) => ({ name, count }));
  };

  const realtimeEnabled = hasPermission(currentUser, "entitlements");

  useRealtimeSync({
    table: "tasks",
    enabled: realtimeEnabled,
    apply: (payload) => {
      setTasks((prev) =>
        applyRowChange(prev, payload, {
          pk: "id",
          insert: "head",
          mapRow: mapTaskFromDatabase,
        })
      );
    },
  });

  useRealtimeSync({
    table: "claims",
    enabled: realtimeEnabled,
    apply: (payload) => {
      const next = applyRowChange(realtimeClaimsRef.current, payload, {
        pk: "id",
        insert: "head",
      });
      realtimeClaimsRef.current = next;
      setClaims(next);
      setClaimSheets(rebuildClaimSheets(next));
    },
  });

  useEffect(() => {
    const notificationSources = [
      ...(hasPermission(currentUser, "entitlements")
        ? [
            { table: "public_feedback", label: "شكوى أو تقييم جديد", icon: "💬" },
            { table: "claims", label: "مطالبة جديدة", icon: "📋" },
            { table: "employee_tasks", label: "مهمة موظف جديدة", icon: "📝" },
          ]
        : []),
    ];

    let channel = null;
    let pollingTimer = null;
    let storageListener = null;

    const notificationCheckpointKey = "admin_notifications_checkpoint";
    const previousCheckpoint = localStorage.getItem(notificationCheckpointKey);
    const checkpointDate = previousCheckpoint
      ? new Date(previousCheckpoint)
      : null;

    const setupNotifications = async () => {
      const notify = (source, itemId) => {
        const notificationId = `${source.table}-${itemId}`;

        if (knownNotificationIds.current.has(notificationId)) return;

        knownNotificationIds.current.add(notificationId);

        const notification = {
          id: notificationId,
          title: source.label,
          icon: source.icon,
          time: new Date().toLocaleTimeString("ar-EG", {
            hour: "2-digit",
            minute: "2-digit",
          }),
        };

        setNotifications((current) =>
          [notification, ...current].slice(0, 20)
        );

        if (source.table === "public_feedback") {
          setUrgentNotification(notification);
        }

        if (
          "Notification" in window &&
          Notification.permission === "granted"
        ) {
          new Notification(source.label, {
            body: "تم استلام بيانات جديدة في لوحة الإدارة.",
          });
        }
      };

      const results = await Promise.all(
        notificationSources.map((source) =>
          supabase
            .from(source.table)
            .select("id, created_at")
            .order("created_at", { ascending: false })
            .limit(100)
        )
      );

      results.forEach(({ data }, index) =>
        (data || []).forEach((item) => {
          const notificationId = `${notificationSources[index].table}-${item.id}`;

          if (
            checkpointDate &&
            item.created_at &&
            new Date(item.created_at) > checkpointDate
          ) {
            notify(notificationSources[index], item.id);
          } else {
            knownNotificationIds.current.add(notificationId);
          }
        })
      );

      try {
        const localFeedback = JSON.parse(
          localStorage.getItem("backup_public_feedback") || "[]"
        );

        const seenLocalFeedback = new Set(
          JSON.parse(
            localStorage.getItem("admin_seen_local_feedback") || "[]"
          )
        );

        const feedbackSource =
          notificationSources.find(
            (source) => source.table === "public_feedback"
          ) || {
            table: "public_feedback",
            label: "شكوى أو تقييم جديد",
            icon: "💬",
          };

        localFeedback.forEach((item) => {
          const notificationId = `public_feedback-${item.id}`;

          if (!seenLocalFeedback.has(String(item.id))) {
            notify(feedbackSource, item.id);
            seenLocalFeedback.add(String(item.id));
          } else {
            knownNotificationIds.current.add(notificationId);
          }
        });

        localStorage.setItem(
          "admin_seen_local_feedback",
          JSON.stringify([...seenLocalFeedback])
        );
      } catch (storageError) {
        console.error("تعذر تحميل نسخ الشكاوى المحلية:", storageError);
      }

      localStorage.setItem(
        notificationCheckpointKey,
        new Date().toISOString()
      );

      channel = supabase
        .channel("admin-notifications")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public" },
          (payload) => {
            const source = notificationSources.find(
              (item) => item.table === payload.table
            );

            if (source) {
              notify(source, payload.new.id);
            }
          }
        )
        .subscribe();

      pollingTimer = window.setInterval(async () => {
        const results = await Promise.all(
          notificationSources.map((source) =>
            supabase
              .from(source.table)
              .select("id")
              .order("created_at", { ascending: false })
              .limit(20)
          )
        );

        results.forEach(({ data }, index) => {
          const source = notificationSources[index];

          (data || []).forEach((item) => {
            notify(source, item.id);
          });
        });
      }, 5000);

      storageListener = (event) => {
        try {
          const item =
            event.type === "storage"
              ? event.key === "new_public_feedback_event" &&
                event.newValue
                ? JSON.parse(event.newValue)
                : null
              : event.detail;

          if (!item) return;

          notify(
            notificationSources.find(
              (source) => source.table === "public_feedback"
            ) || {
              table: "public_feedback",
              label: "شكوى أو تقييم جديد",
              icon: "💬",
            },
            item.id
          );
        } catch (storageError) {
          console.error(
            "تعذر قراءة إشعار الشكوى المحلي:",
            storageError
          );
        }
      };

      window.addEventListener("storage", storageListener);
      window.addEventListener("new-public-feedback", storageListener);
    };

    setupNotifications().catch((notificationError) => {
      console.error(
        "تعذر تشغيل إشعارات لوحة الإدارة:",
        notificationError
      );
    });

    return () => {
      if (channel) supabase.removeChannel(channel);
      if (pollingTimer) window.clearInterval(pollingTimer);

      if (storageListener) {
        window.removeEventListener("storage", storageListener);
        window.removeEventListener(
          "new-public-feedback",
          storageListener
        );
      }
    };
  }, []);

  /* =========================================================================
     جرس الإشعارات من قاعدة البيانات (جدول notifications)
     - التحميل الأولي غير المقروء + المزامنة اللحظية (بدون Refresh).
     - الفلترة على مستخدم الدخول الحالي (لا يرى أحد إشعارات غيره).
     - الضغط على الإشعار يفتح الطلب/الخطاب مباشرة ويُعلّم الإشعار مقروءًا.
     ========================================================================= */

  const notificationFilter = useMemo(
    () =>
      currentUser?.id
        ? { user_id: `eq.${currentUser.id}` }
        : undefined,
    [currentUser]
  );

  useEffect(() => {
    if (!currentUser?.id) return;

    let mounted = true;

    const loadNotifications = async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", currentUser.id)
        .order("created_at", { ascending: false })
        .limit(50);

      if (!error && mounted && Array.isArray(data)) {
        setDbNotifications(data);
      }
    };

    loadNotifications();

    return () => {
      mounted = false;
    };
  }, [currentUser?.id]);

  // إدخال/تحديث/حذف لحظي على جدول notifications → يزيد العداد مباشرة بلا Refresh.
  useRealtimeSync({
    table: "notifications",
    enabled: Boolean(currentUser?.id),
    filter: notificationFilter,
    apply: (payload) => {
      if (payload.eventType === "INSERT") {
        setDbNotifications((prev) =>
          [payload.new, ...prev].slice(0, 100)
        );

        // Toast فوري أثناء فتح التطبيق في نفس التبويب.
        showLiveToast(payload.new);

        // إشعار متصفح فوري أثناء فتح التطبيق في تبويب آخر
        if (
          "Notification" in window &&
          Notification.permission === "granted" &&
          document.hidden
        ) {
          try {
            new Notification(payload.new?.title || "إشعار جديد", {
              body: payload.new?.body || "",
              dir: "rtl",
              lang: "ar",
            });
          } catch {
            // تجاهل فشل الإنشاء
          }
        }
      } else if (payload.eventType === "UPDATE") {
        setDbNotifications((prev) =>
          prev.map((item) =>
            item.id === payload.new.id
              ? { ...item, ...payload.new }
              : item
          )
        );
      } else if (payload.eventType === "DELETE") {
        setDbNotifications((prev) =>
          prev.filter((item) => item.id !== payload.old?.id)
        );
      }
    },
  });

  // عدد الإشعارات غير المقروءة يظهر على الجرس.
  const dbUnreadCount = useMemo(
    () =>
      dbNotifications.filter((item) => !item.is_read).length,
    [dbNotifications]
  );

  const badgeCount = dbUnreadCount + notifications.length;

  const markAllNotificationsRead = async () => {
    if (!currentUser?.id) return;

    setDbNotifications((prev) =>
      prev.map((item) => ({ ...item, is_read: true }))
    );

    try {
      await supabase
        .from("notifications")
        .update({ is_read: true })
        .eq("user_id", currentUser.id)
        .eq("is_read", false);
    } catch (e) {
      console.error("تعذر تحديث حالة القراءة:", e);
    }
  };

  // فتح الطلب/الخطاب من الإشعار مباشرة.
  const openNotificationTarget = (notification) => {
    setNotificationsOpen(false);
    markAllNotificationsRead();

    if (!notification) return;

    if (
      notification.type === "new_request" &&
      notification.reference_id
    ) {
      setFocusRequestId(notification.reference_id);
      if (canAccessMenu(currentUser, "service_requests")) {
        setActiveMenu("service_requests");
      }
    } else if (
      notification.type === "new_letter" &&
      notification.reference_id
    ) {
      setOpenLetterId(notification.reference_id);
      if (canAccessMenu(currentUser, "letters_tracking")) {
        setActiveMenu("letters_tracking");
      }
    }
  };

  const notificationTimeLabel = (createdAt) => {
    if (!createdAt) return "";
    try {
      return new Date(createdAt).toLocaleDateString("ar-EG", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  const enableNotifications = async () => {
    if (
      "Notification" in window &&
      Notification.permission === "default"
    ) {
      await Notification.requestPermission();
    }

    // فتح الجرس يُعلّم الإشعارات كلها مقروءة فورًا.
    if (!notificationsOpen) {
      markAllNotificationsRead();
    }

    setNotificationsOpen((current) => !current);
  };

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

        const rows = XLSX.utils.sheet_to_json(worksheet, {
          defval: "",
          raw: false,
        });

        rows.forEach((row, index) => {
          importedClaims.push({
            sheet_name: sheetName,
            row_number: index + 2,
            data: row,
          });
        });
      });

      if (importedClaims.length === 0) {
        setClaimError("تم فتح الملف ولكن لا توجد بيانات داخله.");
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
        "اسم صاحب المطالبة": claimForm.claimantName.trim(),
        "رقم المطالبة": claimForm.claimNumber.trim(),
        "تاريخ المطالبة": claimForm.claimDate || "",
        المبلغ: claimForm.amount || "",
        الحالة: claimForm.status.trim(),
        ملاحظات: claimForm.notes.trim(),
      };

      const { error } = await supabase
        .from("claims")
        .insert({
          sheet_name: claimForm.sheetName.trim() || "إضافة يدوية",
          row_number: 0,
          data: manualData,
        });

      if (error) {
        console.error(error);

        setClaimError(
          "حدث خطأ أثناء حفظ المطالبة:\n" + error.message
        );

        return;
      }

      await loadClaims();

      setClaimForm(createEmptyClaim());
      setShowClaimForm(false);
      setClaimSearch("");
      setClaimSheetFilter("all");

      alert("تمت إضافة المطالبة وحفظها في قاعدة البيانات بنجاح.");
    } catch (error) {
      console.error(error);
      setClaimError("تعذر حفظ المطالبة في قاعدة البيانات.");
    } finally {
      setClaimLoading(false);
    }
  };

  const filteredClaims = useMemo(() => {
    const search = claimSearch.trim().toLowerCase();

    return claims.filter((claim) => {
      const sheetMatch =
        claimSheetFilter === "all" ||
        claim.sheet_name === claimSheetFilter;

      if (!sheetMatch) return false;
      if (!search) return true;

      return Object.values(claim.data || {}).some((value) =>
        String(value).toLowerCase().includes(search)
      );
    });
  }, [claims, claimSearch, claimSheetFilter]);

  const filteredTasks = useMemo(() => {
    return tasks.filter((task) => {
      const typeOK =
        filterType === "all" || task.type === filterType;

      const statusOK =
        filterStatus === "all" || task.status === filterStatus;

      return typeOK && statusOK;
    });
  }, [tasks, filterType, filterStatus]);

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
        ? Math.round((completed / total) * 100)
        : 0,
      reviewRate: total
        ? Math.round((reviewed / total) * 100)
        : 0,
      uploadRate: total
        ? Math.round((uploaded / total) * 100)
        : 0,
    };
  }, [tasks]);

  const performance = useMemo(() => {
    const completion = stats.completionRate;

    const onTime = tasks.length
      ? Math.round(
          (tasks.filter(
            (task) =>
              task.status === "completed" &&
              (!task.dueDate ||
                task.dueDate >= task.receivedDate)
          ).length /
            tasks.length) *
            100
        )
      : 0;

    const accuracy = stats.reviewRate;

    const speed = tasks.length
      ? Math.round(
          (tasks.filter(
            (task) => task.status === "completed"
          ).length /
            tasks.length) *
            100
        )
      : 0;

    const reviewUpload = tasks.length
      ? Math.round(
          (stats.reviewRate + stats.uploadRate) / 2
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
      const databaseTask = mapTaskToDatabase(taskForm);

      const { data, error } = await supabase
        .from("tasks")
        .insert(databaseTask)
        .select()
        .single();

      if (error) {
        console.error(error);

        alert(
          "حدث خطأ أثناء حفظ المهمة:\n" + error.message
        );

        return;
      }

      const newTask = mapTaskFromDatabase(data);

      setTasks((prev) => [newTask, ...prev]);
      setTaskForm(createEmptyTask());
      setShowTaskForm(false);
    } catch (error) {
      console.error(error);
      alert("تعذر حفظ المهمة في قاعدة البيانات.");
    }
  };

  const updateTask = async (id, changes) => {
    try {
      const currentTask = tasks.find(
        (task) => task.id === id
      );

      if (!currentTask) return;

      const updatedTask = {
        ...currentTask,
        ...changes,
      };

      const databaseChanges =
        mapTaskToDatabase(updatedTask);

      const { data, error } = await supabase
        .from("tasks")
        .update(databaseChanges)
        .eq("id", id)
        .select()
        .single();

      if (error) {
        console.error(error);

        alert(
          "حدث خطأ أثناء تحديث المهمة:\n" + error.message
        );

        return;
      }

      const mapped = mapTaskFromDatabase(data);

      setTasks((prev) =>
        prev.map((task) =>
          task.id === id ? mapped : task
        )
      );

      setSelectedTask((prev) =>
        prev && prev.id === id ? mapped : prev
      );
    } catch (error) {
      console.error(error);
      alert("تعذر تحديث المهمة.");
    }
  };

  const deleteTask = async (id) => {
    if (!window.confirm("هل تريدين حذف هذه المهمة؟")) {
      return;
    }

    try {
      const { error } = await supabase
        .from("tasks")
        .delete()
        .eq("id", id);

      if (error) {
        console.error(error);

        alert(
          "حدث خطأ أثناء حذف المهمة:\n" + error.message
        );

        return;
      }

      setTasks((prev) =>
        prev.filter((task) => task.id !== id)
      );

      setSelectedTask(null);
    } catch (error) {
      console.error(error);
      alert("تعذر حذف المهمة.");
    }
  };

  const persistStudyLeaves = (nextLeaves) => {
    setStudyLeaves(nextLeaves);
    saveStudyLeaves(nextLeaves);
  };

  const importStudyLeaves = (imported) => {
    persistStudyLeaves(imported);

    alert(
      `تم ربط شيت الإجازات الدراسية. تم استيراد ${imported.length} سجل.`
    );
  };

  const saveStudyLeave = (leave) => {
    setStudyLeaveError("");
    setStudyLeaveLoading(true);

    try {
      if (leave.id) {
        persistStudyLeaves(
          studyLeaves.map((item) =>
            item.id === leave.id ? leave : item
          )
        );
      } else {
        persistStudyLeaves([
          {
            ...leave,
            id: `leave-${Date.now()}`,
            serial:
              leave.serial ||
              String(studyLeaves.length + 1),
          },
          ...studyLeaves,
        ]);
      }
    } catch (error) {
      console.error(error);
      setStudyLeaveError("تعذر حفظ الإجازة الدراسية.");
    } finally {
      setStudyLeaveLoading(false);
    }
  };

  const deleteStudyLeave = (id) => {
    if (
      !window.confirm(
        "هل تريدين حذف سجل هذه الإجازة الدراسية؟"
      )
    ) {
      return;
    }

    persistStudyLeaves(
      studyLeaves.filter((leave) => leave.id !== id)
    );
  };

  const stopStudyLeaveSalary = (id) => {
    persistStudyLeaves(
      studyLeaves.map((leave) =>
        leave.id === id
          ? {
              ...leave,
              salaryStatus: "يوقف المرتب",
              leaveStatus:
                leave.leaveStatus || "منتهية",
            }
          : leave
      )
    );
  };

  const goTo = (nextMenu) => {
    if (canAccessMenu(currentUser, nextMenu)) {
      setActiveMenu(nextMenu);
      setSidebarOpen(false);
    }
  };

  const currentTitle =
    activeMenu === "claims"
      ? "المطالبات"
      : activeMenu === "study_leaves"
        ? "الإجازات الدراسية"
        : activeMenu === "issues_management"
          ? "إدارة القضايا"
          : activeMenu === "letters_tracking"
            ? "متابعة الخطابات"
            : activeMenu === "faculty_salary_archive"
              ? "أرشيف مفردات مرتب أعضاء هيئة التدريس"
              : activeMenu === "employee_salary_archive"
                ? "أرشيف مفردات مرتب الموظفين"
                : activeMenu === "executive_orders_add"
                  ? "إضافة أمر تنفيذي"
                  : activeMenu === "executive_orders_archive"
                    ? "أرشيف الأوامر التنفيذية"
                    : MENU_ITEMS.find(
                      (item) => item.id === activeMenu
                    )?.title || "الرئيسية";

  /* صفحات الأرشيف لها هيدر كامل خاص بها، فنخفي الهيدر العام لتجنب التكرار */
  const isArchivePage =
    activeMenu === "faculty_salary_archive" ||
    activeMenu === "employee_salary_archive";

  if (appLoading) {
    return (
      <div
        dir="rtl"
        style={{
          ...(styles?.app || {}),
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={styles.loadingBox}>
          <div style={styles.loadingIcon}>⏳</div>
          <h2>جاري تحميل قسم الاستحقاقات</h2>
          <p>يتم الاتصال بقاعدة البيانات...</p>
        </div>
      </div>
    );
  }

  return (
    <div
      dir="rtl"
      style={styles.app}
      className={`admin-app${isWideLayout ? " admin-app-wide" : ""}`}
    >
      {liveToast && (
        <div
          style={{
            position: "fixed",
            bottom: 20,
            right: 20,
            zIndex: 9999,
            maxWidth: 340,
            width: "calc(100vw - 40px)",
            background: "#0F172A",
            color: "#fff",
            borderRadius: 12,
            boxShadow: "0 12px 30px rgba(15,23,42,.35)",
            padding: "12px 14px",
            display: "flex",
            gap: 10,
            alignItems: "flex-start",
            cursor: "pointer",
            animation: "toastIn .25s ease",
          }}
          onClick={() => {
            const target = {
              type: liveToast.type,
              reference_id: liveToast.referenceId,
              title: liveToast.title,
              body: liveToast.body,
            };
            setLiveToast(null);
            openNotificationTarget(target);
          }}
        >
          <span style={{ fontSize: 22, flexShrink: 0 }}>
            {liveToast.type === "new_letter"
              ? "📩"
              : liveToast.type === "new_request"
                ? "📥"
                : "🔔"}
          </span>
          <div style={{ minWidth: 0, flex: 1 }}>
            <strong style={{ display: "block", fontSize: 13 }}>
              {liveToast.title}
            </strong>
            {liveToast.body && (
              <div
                style={{
                  fontSize: 12,
                  color: "#CBD5E1",
                  marginTop: 2,
                  lineHeight: 1.6,
                  wordBreak: "break-word",
                }}
              >
                {liveToast.body}
              </div>
            )}
          </div>
          <span
            style={{
              flexShrink: 0,
              color: "#94A3B8",
              fontSize: 12,
              cursor: "pointer",
            }}
            onClick={(event) => {
              event.stopPropagation();
              setLiveToast(null);
            }}
          >
            ✕
          </span>
        </div>
      )}
      <Sidebar
        activeMenu={activeMenu}
        filterType={filterType}
        currentUser={currentUser}
        setActiveMenu={goTo}
        setFilterType={setFilterType}
        setServiceRequestFilter={setServiceRequestFilter}
        isMobile={isMobile || isWideLayout}
        sidebarOpen={sidebarOpen}
        onCloseSidebar={() => setSidebarOpen(false)}
      />

      {(isMobile || isWideLayout) && sidebarOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15,23,42,0.45)",
            zIndex: 40,
          }}
          className="admin-backdrop"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <main style={styles.main} className="admin-main">
        {!isArchivePage && activeMenu !== "letters_tracking" && (
          <header style={styles.header} className="admin-header">
            <div>
              {(isMobile || isWideLayout) && (
                <button
                  onClick={() => setSidebarOpen((open) => !open)}
                  title={sidebarOpen ? "إغلاق القائمة" : "فتح القائمة"}
                  aria-label="فتح أو إغلاق القائمة"
                  style={{
                    ...styles.secondaryButton,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 44,
                    height: 44,
                    padding: 0,
                    fontSize: 20,
                    marginBottom: 8,
                  }}
                >
                  {sidebarOpen ? "✕" : "☰"}
                </button>
              )}

              <div style={styles.breadcrumb}>
                قسم الاستحقاقات / {currentTitle}
              </div>

              <h1 style={styles.pageTitle}>
                {currentTitle}
              </h1>

              <p style={styles.pageSub}>
                {activeMenu === "study_leaves"
                  ? "متابعة الإجازات الدراسية بمرتب، التعديل من البرنامج، والتنبيه عند قرب أو توقف المرتب"
                  : "متابعة الأعمال وتقييم الأداء بصورة يومية وأسبوعية وشهرية"}
              </p>
            </div>

          <div
            className="admin-header-actions"
            style={{
              display: "flex",
              gap: "12px",
              alignItems: "center",
              position: "relative",
            }}
          >
            <InstallAppButton />

            <CheckForUpdatesButton compact={isMobile} />

            <button
              style={{
                ...styles.secondaryButton,
                position: "relative",
                padding: "10px 14px",
              }}
              onClick={enableNotifications}
              title="الإشعارات"
            >
              🔔

              {badgeCount > 0 && (
                <span
                  style={{
                    position: "absolute",
                    top: -6,
                    right: -6,
                    minWidth: 20,
                    height: 20,
                    borderRadius: "50%",
                    background: "#DC2626",
                    color: "#fff",
                    fontSize: 11,
                    display: "grid",
                    placeItems: "center",
                    padding: "0 4px",
                  }}
                >
                  {badgeCount > 9 ? "9+" : badgeCount}
                </span>
              )}
            </button>

            {notificationsOpen && (
              <div
                style={{
                  position: "absolute",
                  top: 48,
                  right: 0,
                  width: 320,
                  maxWidth: "80vw",
                  background: "#fff",
                  border: "1px solid #E2E8F0",
                  borderRadius: 12,
                  boxShadow:
                    "0 12px 30px rgba(15,41,66,.18)",
                  zIndex: 20,
                  padding: 12,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: 8,
                  }}
                >
                  <strong>الإشعارات</strong>

                  <button
                    style={{
                      border: 0,
                      background: "transparent",
                      color: "#64748B",
                      cursor: "pointer",
                    }}
                    onClick={() => {
                      markAllNotificationsRead();
                      setNotifications([]);
                    }}
                  >
                    مسح
                  </button>
                </div>

                {dbNotifications.length === 0 &&
                notifications.length === 0 ? (
                  <div
                    style={{
                      padding: 18,
                      color: "#64748B",
                      textAlign: "center",
                    }}
                  >
                    لا توجد إشعارات جديدة
                  </div>
                ) : (
                  <>
                    {dbNotifications.map((item) => (
                      <div
                        key={item.id}
                        onClick={() =>
                          openNotificationTarget(item)
                        }
                        style={{
                          padding: 10,
                          borderTop:
                            "1px solid #F1F5F9",
                          display: "flex",
                          gap: 8,
                          alignItems: "flex-start",
                          cursor: "pointer",
                          background: item.is_read
                            ? "transparent"
                            : "#EFF6FF",
                          borderRadius: 8,
                          marginBottom: 2,
                        }}
                        title={item.body || ""}
                      >
                        <span style={{ fontSize: 20 }}>
                          {item.type === "new_letter"
                            ? "📩"
                            : item.type === "new_request"
                              ? "📥"
                              : "🔔"}
                        </span>

                        <div style={{ minWidth: 0, flex: 1 }}>
                          <strong
                            style={{
                              display: "block",
                              fontSize: 13,
                              color: "#0F172A",
                            }}
                          >
                            {item.title}
                          </strong>

                          {item.body && (
                            <div
                              style={{
                                color: "#475569",
                                fontSize: 12,
                                marginTop: 2,
                                lineHeight: 1.6,
                              }}
                            >
                              {item.body}
                            </div>
                          )}

                          <small
                            style={{ color: "#94A3B8" }}
                          >
                            {notificationTimeLabel(
                              item.created_at
                            )}
                          </small>
                        </div>
                      </div>
                    ))}

                    {notifications.map((item) => (
                      <div
                        key={item.id}
                        style={{
                          padding: 10,
                          borderTop:
                            "1px solid #F1F5F9",
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                        }}
                      >
                        <span style={{ fontSize: 20 }}>
                          {item.icon}
                        </span>

                        <div>
                          <strong
                            style={{
                              display: "block",
                              fontSize: 13,
                            }}
                          >
                            {item.title}
                          </strong>

                          <small
                            style={{ color: "#64748B" }}
                          >
                            {item.time}
                          </small>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            )}

            <SupportDrawerButton currentUser={currentUser} />
          </div>
        </header>
        )}

        {appError && (
          <div style={styles.errorBox}>{appError}</div>
        )}

        {urgentNotification && (
          <div
            style={styles.modalOverlay}
            onClick={(event) =>
              event.stopPropagation()
            }
          >
            <div
              style={{
                ...styles.loginBox,
                maxWidth: 440,
                textAlign: "center",
                borderTop: "5px solid #DC2626",
              }}
            >
              <div
                style={{
                  fontSize: 48,
                  marginBottom: 8,
                }}
              >
                💬
              </div>

              <h2 style={styles.loginTitle}>
                شكوى أو تقييم جديد
              </h2>

              <p
                style={{
                  color: "#475569",
                  lineHeight: 1.8,
                }}
              >
                تم استلام شكوى أو تقييم جديد من بوابة
                الخدمات.
                <br />
                يرجى الضغط على موافق لمتابعة العمل.
              </p>

              <button
                style={{
                  ...styles.primaryButton,
                  background: "#DC2626",
                  minWidth: 140,
                }}
                onClick={() => {
                  setUrgentNotification(null);
                  setNotificationsOpen(true);
                  setActiveMenu("feedback");
                }}
              >
                موافق
              </button>
            </div>
          </div>
        )}

        {activeMenu === "home" && (
          hasAnyPermission(currentUser, [
            "entitlements",
            "requests",
            "reports",
            "user_management",
            "org_structure",
            "system_settings",
          ]) ? (
            <HomeView
              stats={stats}
              performance={performance}
              tasks={tasks}
              studyLeavesCount={studyLeaves.length}
              claimsCount={claims.length}
              setActiveMenu={goTo}
              setFilterType={setFilterType}
              setSelectedTask={setSelectedTask}
              onServiceCardClick={(serviceType) => {
                if (canAccessMenu(currentUser, "service_requests")) {
                  setServiceRequestFilter(serviceType);
                  setActiveMenu("service_requests");
                }
              }}
            />
          ) : (
            <div style={styles.card}>
              <div style={styles.errorBox}>
                ⛔ لا تملك أي صلاحية حتى الآن — يرجى التواصل مع
                المسؤول لتحديد صلاحياتك.
              </div>
            </div>
          )
        )}

        {activeMenu === "daily" &&
          canAccessMenu(currentUser, "daily") && (
            <DailyView
              tasks={filteredTasks}
              filterType={filterType}
              setFilterType={setFilterType}
              filterStatus={filterStatus}
              setFilterStatus={setFilterStatus}
              onAdd={() => setShowTaskForm(true)}
              onSelect={setSelectedTask}
              onDelete={deleteTask}
              onUpdate={updateTask}
            />
          )}

        {activeMenu === "service_requests" &&
          canAccessMenu(currentUser, "service_requests") && (
            <ServiceRequestsView
              selectedService={serviceRequestFilter}
              onServiceFilterChange={
                setServiceRequestFilter
              }
              focusRequestId={focusRequestId}
            />
          )}

        {activeMenu === "faculty_salaries" &&
          canAccessMenu(currentUser, "faculty_salaries") && (
            <FacultySalariesPage />
          )}

        {activeMenu === "feedback" &&
          canAccessMenu(currentUser, "feedback") && (
            <FeedbackView />
          )}

        {activeMenu === "claims" &&
          canAccessMenu(currentUser, "claims") && (
            <ClaimsPage
              claims={filteredClaims}
              allClaims={claims}
              sheets={claimSheets}
              search={claimSearch}
              setSearch={setClaimSearch}
              sheetFilter={claimSheetFilter}
              setSheetFilter={setClaimSheetFilter}
              loading={claimLoading}
              error={claimError}
              onImport={importClaimsExcel}
              onAddManual={() => {
                setClaimForm(createEmptyClaim());
                setShowClaimForm(true);
              }}
            />
          )}

        {activeMenu === "study_leaves" &&
          canAccessMenu(currentUser, "study_leaves") && (
            <StudyLeavesPage
              leaves={studyLeaves}
              loading={studyLeaveLoading}
              error={studyLeaveError}
              onImport={importStudyLeaves}
              onSave={saveStudyLeave}
              onDelete={deleteStudyLeave}
              onStopSalary={stopStudyLeaveSalary}
            />
          )}

        {activeMenu === "issues_management" &&
          canAccessMenu(currentUser, "issues_management") && (
            <IssuesManagementPage />
          )}

        {activeMenu === "connection_test" &&
          canAccessMenu(currentUser, "connection_test") && (
            <ConnectionTest />
          )}

        {activeMenu === "push_settings" && (
          <PushNotificationsPanel currentUser={currentUser} />
        )}

        {activeMenu === "push_settings" &&
          (currentUser?.role === "super_admin" ||
            currentUser?.role === "admin" ||
            currentUser?.permissions == null) && (
            <AdminPushDevicesPanel currentUser={currentUser} />
          )}

        {activeMenu === "letters_tracking" &&
          canAccessMenu(currentUser, "letters_tracking") && (
            <LettersTrackingPage
              qrCode={qrCodeFromUrl}
              currentUser={currentUser}
              openLetterId={openLetterId}
            />
          )}

        {activeMenu === "faculty_salary_archive" &&
          canAccessMenu(currentUser, "faculty_salary_archive") && (
            <FacultySalaryArchivePage currentUser={currentUser} />
          )}

        {activeMenu === "employee_salary_archive" &&
          canAccessMenu(currentUser, "employee_salary_archive") && (
            <EmployeeSalaryArchivePage currentUser={currentUser} />
          )}

        {activeMenu === "executive_orders_add" &&
          canAccessMenu(currentUser, "executive_orders_add") && (
            <ExecutiveOrdersPage
              currentUser={currentUser}
              view="add"
              onNavigate={setActiveMenu}
            />
          )}

        {activeMenu === "executive_orders_archive" &&
          canAccessMenu(currentUser, "executive_orders_archive") && (
            <ExecutiveOrdersPage
              currentUser={currentUser}
              view="archive"
              onNavigate={setActiveMenu}
            />
          )}

        {activeMenu === "weekly" &&
          canAccessMenu(currentUser, "weekly") && (
            <div style={styles.card}>
              <PerformanceView
                title="التقييم الأسبوعي"
                period="هذا الأسبوع"
                performance={performance}
                stats={stats}
              />
            </div>
          )}

        {activeMenu === "monthly" &&
          canAccessMenu(currentUser, "monthly") && (
            <div style={styles.card}>
              <div style={styles.cardHeader}>
                <div>
                  <h2 style={styles.cardTitle}>
                    التقييم الشهري
                  </h2>

                  <p style={styles.cardSub}>
                    تقرير أداء القسم خلال الشهر المحدد
                  </p>
                </div>

                <input
                  type="month"
                  value={selectedMonth}
                  onChange={(e) =>
                    setSelectedMonth(e.target.value)
                  }
                  style={styles.monthInput}
                />
              </div>

              <PerformanceView
                title=""
                period={selectedMonth}
                performance={performance}
                stats={stats}
              />
            </div>
          )}

        {activeMenu === "criteria" &&
          canAccessMenu(currentUser, "criteria") && (
            <CriteriaView />
          )}

        {activeMenu === "employee_performance" &&
          canAccessMenu(currentUser, "employee_performance") && (
            <EmployeePerformance />
          )}

        {activeMenu === "performance_dashboard" &&
          canAccessMenu(currentUser, "performance_dashboard") && (
            <EmployeePerformanceDashboard />
          )}

        {activeMenu === "employee_profiles" &&
          canAccessMenu(currentUser, "employee_profiles") && (
            <EmployeeProfilePage
              onManageTasks={() =>
                setActiveMenu("employee_performance")
              }
            />
          )}

        {activeMenu === "training_courses" &&
          canAccessMenu(currentUser, "training_courses") && (
            <TrainingCourses />
          )}

        {activeMenu === "user_management" &&
          (canAccessMenu(currentUser, "user_management") ? (
            <UserManagement currentUser={currentUser} />
          ) : (
            <div style={styles.card}>
              <div style={styles.errorBox}>
                ⛔ غير مصرح لك بالوصول إلى إدارة المستخدمين
              </div>
            </div>
          ))}

        {activeMenu === "org_structure" &&
          (canAccessMenu(currentUser, "org_structure") ? (
            <OrgStructurePage />
          ) : (
            <div style={styles.card}>
              <div style={styles.errorBox}>
                ⛔ غير مصرح لك بالوصول إلى الهيكل التنظيمي
              </div>
            </div>
          ))}
      </main>

      {showTaskForm && (
        <TaskFormModal
          taskForm={taskForm}
          setTaskForm={setTaskForm}
          onClose={() => setShowTaskForm(false)}
          onSave={addTask}
        />
      )}

      {showClaimForm && (
        <ClaimFormModal
          claimForm={claimForm}
          setClaimForm={setClaimForm}
          claimLoading={claimLoading}
          onClose={() => setShowClaimForm(false)}
          onSave={addManualClaim}
        />
      )}

      {selectedTask && (
        <TaskDetailsModal
          task={selectedTask}
          onClose={() => setSelectedTask(null)}
          onUpdate={updateTask}
          onDelete={deleteTask}
        />
      )}
    </div>
  );
}