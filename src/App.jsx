import logo from "./assets/logo.png";
import background from "./assets/engineering.jpg";
import AdminDashboard from "./AdminDashboard";
import React, { useMemo, useRef, useState, useEffect } from "react";
import * as XLSX from "xlsx";
import { supabase } from "./supabaseClient";

const SAVED_LOGIN_KEY = "saved_admin_login";

function App() {
  const [activePage, setActivePage] = useState("home");
  const [showLogin, setShowLogin] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [adminData, setAdminData] = useState([]);
  const [showServiceForm, setShowServiceForm] = useState(false);
  const [selectedService, setSelectedService] = useState(null);
  const [serviceLoading, setServiceLoading] = useState(false);
  const [showTrackingForm, setShowTrackingForm] = useState(false);
  const [trackingId, setTrackingId] = useState("");
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackedRequest, setTrackedRequest] = useState(null);
  const [trackingError, setTrackingError] = useState("");
  const [serviceForm, setServiceForm] = useState({
    name: "",
    job: "",
    phone: "",
    requestedMonth: "",
    requestedYear: new Date().getFullYear(),
  });
  const [showFeedbackForm, setShowFeedbackForm] = useState(false);
  const [feedbackType, setFeedbackType] = useState("rating");
  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackForm, setFeedbackForm] = useState({
    name: "",
    phone: "",
    rating: "5",
    message: "",
  });
  const [loginForm, setLoginForm] = useState({
    username: "",
    password: "",
  });
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [currentUser, setCurrentUser] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  const navRef = useRef(null);

  useEffect(() => {
    try {
      const savedLogin = JSON.parse(localStorage.getItem(SAVED_LOGIN_KEY) || "null");
      if (savedLogin?.username && savedLogin?.password) {
        setLoginForm({
          username: savedLogin.username,
          password: savedLogin.password,
        });
      }
    } catch (error) {
      console.error("تعذر تحميل بيانات الدخول المحفوظة:", error);
    }
  }, []);

  const moveTopMenu = (direction) => {
    navRef.current?.scrollBy({ left: direction * 180, behavior: "smooth" });
  };

  const trackServiceRequest = async (event) => {
    event.preventDefault();
    if (!trackingId.trim()) {
      setTrackingError("أدخلي رقم الطلب أولاً.");
      return;
    }

    setTrackingLoading(true);
    setTrackingError("");
    setTrackedRequest(null);
    try {
      const { data, error } = await supabase
        .from("service_requests")
        .select("id, service_type, name, status, created_at")
        .eq("id", trackingId.trim())
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        setTrackingError("لم يتم العثور على طلب بهذا الرقم.");
        return;
      }
      setTrackedRequest(data);
    } catch (error) {
      console.error("خطأ في متابعة الطلب:", error);
      setTrackingError("تعذر تحميل حالة الطلب حاليًا.");
    } finally {
      setTrackingLoading(false);
    }
  };

  useEffect(() => {
    const handleResize = () => {
      setIsMobile(window.innerWidth < 640);
      setIsTablet(window.innerWidth < 1024 && window.innerWidth >= 640);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const menuItems = [
    { id: "home", title: "الرئيسية" },
    { id: "services", title: "الطلبات الإلكترونية" },
    { id: "evaluation", title: "التقييم والشكاوى" },
    { id: "about", title: "عن القسم" },
    { id: "contact", title: "أرقام التواصل" },
  ];

  /* ================= SERVICES ================= */

  const services = [
    {
      icon: "📄",
      title: "مفردات مرتب",
      description: "طلب استخراج مفردات مرتب إلكترونيًا.",
      color: "#2563EB",
      lightColor: "#EFF6FF",
      borderColor: "#BFDBFE",
    },
    {
      icon: "❤️",
      title: "الرعاية الصحية",
      description: "تقديم طلبات الرعاية الصحية.",
      color: "#DB5B7A",
      lightColor: "#FFF1F4",
      borderColor: "#FBCFE0",
    },
    {
      icon: "🤝",
      title: "صندوق الزمالة",
      description: "تقديم ومعالجة طلبات الزمالة والاشتراكات.",
      color: "#16846A",
      lightColor: "#ECFDF5",
      borderColor: "#BBE7D9",
    },
    {
      icon: "📑",
      title: "الإفادات",
      description: "طلب واستخراج الإفادات والمستندات.",
      color: "#7657B8",
      lightColor: "#F5F1FC",
      borderColor: "#DDD0F3",
    },
  ];

  const handleMenuClick = (page) => {
    setActivePage(page);

    setTimeout(() => {
      const section = document.getElementById(page);

      if (section) {
        section.scrollIntoView({
          behavior: "smooth",
          block: "start",
        });
      }
    }, 50);
  };

  const handleStatusChange = (id, newStatus) => {
    setAdminData((prevData) =>
      prevData.map((item) =>
        item.id === id ? { ...item, status: newStatus } : item
      )
    );
  };

  const openServiceForm = (service) => {
    setSelectedService(service);
    setServiceForm({
      name: "",
      job: "",
      phone: "",
      requestedMonth: "",
      requestedYear: new Date().getFullYear(),
    });
    setShowServiceForm(true);
  };

  const openFeedbackForm = (type) => {
    setFeedbackType(type);
    setFeedbackForm({
      name: "",
      phone: "",
      rating: "5",
      message: "",
    });
    setShowFeedbackForm(true);
  };

  const submitServiceRequest = async () => {
    if (
      !serviceForm.name.trim() ||
      !serviceForm.job.trim() ||
      !serviceForm.requestedMonth ||
      !serviceForm.requestedYear
    ) {
      alert("من فضلك أدخلي الاسم والوظيفة والشهر والسنة المطلوبة.");
      return;
    }

    try {
      setServiceLoading(true);

      const { data, error } = await supabase
        .from("service_requests")
        .insert({
          service_type: selectedService?.title || "خدمة إلكترونية",
          name: serviceForm.name.trim(),
          job_title: serviceForm.job.trim(),
          phone: serviceForm.phone.trim() || null,
          request_month: {
            يناير: 1,
            فبراير: 2,
            مارس: 3,
            أبريل: 4,
            مايو: 5,
            يونيو: 6,
            يوليو: 7,
            أغسطس: 8,
            سبتمبر: 9,
            أكتوبر: 10,
            نوفمبر: 11,
            ديسمبر: 12,
          }[serviceForm.requestedMonth],
          request_year: Number(serviceForm.requestedYear),
          status: "جديد",
        })
        .select()
        .single();

      if (error) {
        console.error(error);
        alert("حدث خطأ أثناء إرسال الطلب:\n" + error.message);
        return;
      }

      setShowServiceForm(false);
      setSelectedService(null);
      setServiceForm({
        name: "",
        job: "",
        phone: "",
        requestedMonth: "",
        requestedYear: new Date().getFullYear(),
      });

      alert(
        `تم إرسال طلب ${selectedService?.title || "الخدمة"} بنجاح.\nرقم الطلب: ${data.id}`
      );
    } catch (error) {
      console.error(error);
      alert("تعذر الاتصال بقاعدة البيانات.");
    } finally {
      setServiceLoading(false);
    }
  };


  const submitFeedback = async () => {
    if (!feedbackForm.name.trim()) {
      alert("من فضلك أدخلي الاسم.");
      return;
    }

    if (feedbackType === "rating" && !feedbackForm.rating) {
      alert("من فضلك اختاري التقييم.");
      return;
    }

    if (feedbackType === "complaint" && !feedbackForm.message.trim()) {
      alert("من فضلك اكتبي الشكوى أو المقترح.");
      return;
    }

    const payload = {
      feedback_type: feedbackType === "rating" ? "تقييم خدمة" : "شكوى / مقترح",
      name: feedbackForm.name.trim(),
      phone: feedbackForm.phone.trim() || null,
      rating:
        feedbackType === "rating" ? Number(feedbackForm.rating) : null,
      message: feedbackForm.message.trim() || null,
      source_page: "الرئيسية",
      status: "جديد",
      created_at: new Date().toISOString(),
    };

    try {
      setFeedbackLoading(true);

      let savedToDb = false;
      let savedFeedbackId = null;
      try {
        const { data: savedFeedback, error } = await supabase.from("public_feedback").insert({
          feedback_type: payload.feedback_type,
          name: payload.name,
          phone: payload.phone,
          rating: payload.rating,
          message: payload.message,
          source_page: payload.source_page,
          status: payload.status,
        }).select("id").single();

        if (error) {
          console.error("Supabase feedback insert error:", error);
        } else {
          savedToDb = true;
          savedFeedbackId = savedFeedback?.id || null;
        }
      } catch (dbErr) {
        console.error("Supabase feedback exception:", dbErr);
      }

      // Always save a local copy as backup so nothing is lost
      try {
        const localId = savedFeedbackId || "local-" + Date.now();
        const existing = JSON.parse(
          localStorage.getItem("backup_public_feedback") || "[]"
        );
        existing.unshift({
          ...payload,
          id: localId,
        });
        localStorage.setItem("backup_public_feedback", JSON.stringify(existing));
        localStorage.setItem(
          "new_public_feedback_event",
          JSON.stringify({ ...payload, id: localId })
        );
        window.dispatchEvent(new CustomEvent("new-public-feedback", { detail: { ...payload, id: localId } }));
      } catch (storageErr) {
        console.error("LocalStorage save error:", storageErr);
      }

      setShowFeedbackForm(false);
      setFeedbackForm({
        name: "",
        phone: "",
        rating: "5",
        message: "",
      });

      alert(
        savedToDb
          ? feedbackType === "rating"
            ? "تم إرسال تقييم الخدمة بنجاح وحفظه في النظام."
            : "تم إرسال الشكوى أو المقترح بنجاح وحفظه للمتابعة في لوحة الإدارة."
          : "تم حفظ البيانات محليًا مؤقتًا، لكن لم يتم الاتصال بقاعدة البيانات. يرجى تشغيل Migration جدول public_feedback."
      );
    } catch (error) {
      console.error(error);
      alert("حدث خطأ أثناء حفظ الطلب، يرجى المحاولة مرة أخرى.");
    } finally {
      setFeedbackLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!loginForm.username || !loginForm.password) {
      setLoginError("من فضلك أدخلي اسم المستخدم وكلمة المرور.");
      return;
    }

    try {
      setLoginLoading(true);
      setLoginError("");

      // البحث عن المستخدم في جدول users
      const { data: allUsers, error: allError } = await supabase
        .from("users")
        .select("username, password");

      if (allError) {
        console.error("خطأ في جلب المستخدمين:", allError);
        setLoginError("خطأ في الاتصال بقاعدة البيانات: " + allError.message);
        return;
      }

      // البحث عن المستخدم المطابق
      const matchedUser = allUsers?.find(
        user => user.username === loginForm.username && user.password === loginForm.password
      );

      if (!matchedUser) {
        setLoginError("اسم المستخدم أو كلمة المرور غير صحيحة.");
        return;
      }

      // جلب بيانات المستخدم الكاملة
      const { data: fullUser, error: fullError } = await supabase
        .from("users")
        .select("*")
        .eq("username", matchedUser.username)
        .single();

      if (fullError) {
        console.error("خطأ في جلب بيانات المستخدم الكاملة:", fullError);
        setLoginError("خطأ في جلب بيانات المستخدم: " + fullError.message);
        return;
      }

      console.log("تم تسجيل الدخول بنجاح:", fullUser);
      setCurrentUser(fullUser);
      setIsLoggedIn(true);
      setShowLogin(false);

      const shouldSaveLogin = window.confirm("هل تريدين حفظ اسم المستخدم وكلمة المرور؟");
      if (shouldSaveLogin) {
        localStorage.setItem(SAVED_LOGIN_KEY, JSON.stringify(loginForm));
      } else {
        localStorage.removeItem(SAVED_LOGIN_KEY);
        setLoginForm({ username: "", password: "" });
      }
    } catch (error) {
      console.error("خطأ عام:", error);
      setLoginError("حدث خطأ أثناء تسجيل الدخول: " + error.message);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleLogout = () => {
    setCurrentUser(null);
    setIsLoggedIn(false);
    setActivePage("home");
  };

  return (
    <div dir="rtl" style={styles.page}>
      {/* ================= HEADER ================= */}

      <header
        style={{
          ...styles.header,
          ...(isMobile
            ? {
                padding: "0 10px",
                gap: "8px",
                height: "70px",
              }
            : {}),
        }}
      >
        <div
          style={{
            ...styles.logoBox,
            ...(isMobile ? { minWidth: 0, gap: "6px" } : {}),
          }}
        >
          <img
            src={logo}
            alt="كلية الهندسة"
            style={{
              ...styles.logo,
              ...(isMobile ? { width: "58px", height: "42px" } : {}),
            }}
          />

          <div style={styles.logoText}>
            <div style={styles.collegeName}>كلية الهندسة</div>

            <div style={styles.departmentName}>إدارة الاستحقاقات</div>
          </div>
        </div>

        {/* NAVIGATION */}

        {!isMobile && (
          <div style={{ display: "flex", alignItems: "center", gap: "4px", minWidth: 0, flex: 1 }}>
            <button
              type="button"
              aria-label="تحريك القائمة لليمين"
              onClick={() => moveTopMenu(1)}
              style={{
                border: "1px solid #D7E0EA",
                background: "#fff",
                color: "#123B5D",
                borderRadius: "50%",
                width: "30px",
                height: "30px",
                cursor: "pointer",
                flexShrink: 0,
                fontSize: "18px",
              }}
            >
              ›
            </button>
            <nav
              ref={navRef}
              style={{
                ...styles.nav,
                display: "flex",
                overflowX: "auto",
                scrollbarWidth: "none",
                minWidth: 0,
                flex: 1,
              }}
            >
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleMenuClick(item.id)}
              style={{
                ...styles.navButton,
                ...(activePage === item.id ? styles.activeNavButton : {}),
              }}
            >
              {item.title}
            </button>
          ))}
            </nav>
            <button
              type="button"
              aria-label="تحريك القائمة لليسار"
              onClick={() => moveTopMenu(-1)}
              style={{
                border: "1px solid #D7E0EA",
                background: "#fff",
                color: "#123B5D",
                borderRadius: "50%",
                width: "30px",
                height: "30px",
                cursor: "pointer",
                flexShrink: 0,
                fontSize: "18px",
              }}
            >
              ‹
            </button>
          </div>
        )}

        {/* MOBILE MENU BUTTON */}
        <button
          style={{
            ...styles.mobileMenuButton,
            display: isMobile ? "block" : "none",
          }}
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        >
          <span style={styles.mobileMenuIcon}>☰</span>
        </button>

        {/* MOBILE MENU */}
        {mobileMenuOpen && (
          <div style={styles.mobileMenu}>
            {menuItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  handleMenuClick(item.id);
                  setMobileMenuOpen(false);
                }}
                style={{
                  ...styles.mobileMenuItem,
                  ...(activePage === item.id ? styles.mobileMenuItemActive : {}),
                }}
              >
                {item.title}
              </button>
            ))}
            {isLoggedIn ? (
              <button
                type="button"
                onClick={() => {
                  handleLogout();
                  setMobileMenuOpen(false);
                }}
                style={{
                  ...styles.mobileMenuItem,
                  color: "#DC2626",
                  borderTop: "1px solid #E2E8F0",
                  marginTop: "4px",
                }}
              >
                🚪 خروج الإدارة
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setShowLogin(true);
                  setMobileMenuOpen(false);
                }}
                style={{
                  ...styles.mobileMenuItem,
                  color: "#2563EB",
                  borderTop: "1px solid #E2E8F0",
                  marginTop: "4px",
                  fontWeight: "800",
                }}
              >
                🔐 دخول الإدارة
              </button>
            )}
          </div>
        )}

        {/* ADMIN BUTTON */}

        {isLoggedIn ? (
          <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
            <div style={{ textAlign: "left" }}>
              <div style={{ fontSize: "12px", color: "#64748B" }}>
                مرحباً،
              </div>
              <div style={{ fontSize: "14px", fontWeight: "700", color: "#102d4a" }}>
                {currentUser?.full_name || currentUser?.username}
              </div>
            </div>
            <button
              style={{ ...styles.adminButton, background: "#DC2626" }}
              onClick={handleLogout}
            >
              <span>🚪</span>
              <span>خروج</span>
            </button>
          </div>
        ) : (
          <button
            style={{
              ...styles.adminButton,
              ...(isMobile
                ? {
                    padding: "9px 11px",
                    fontSize: "12px",
                    gap: "4px",
                  }
                : {}),
            }}
            onClick={() => setShowLogin(true)}
          >
            <span>🔐</span>
            <span style={{ display: isMobile ? "none" : "inline" }}>دخول الإدارة</span>
          </button>
        )}
      </header>

      {isLoggedIn ? (
        <AdminDashboard
          currentUser={currentUser}
          adminData={adminData}
          handleStatusChange={handleStatusChange}
          styles={styles}
        />
      ) : (
        <main>
          {/* ================= HERO ================= */}

          <section
            id="home"
            style={{
              ...styles.hero,
              backgroundImage: "url(" + background + ")",
              minHeight: isMobile ? "450px" : "560px",
            }}
          >
            <div style={styles.heroOverlay}></div>

            <div style={{
              ...styles.heroContent,
              padding: isMobile ? "40px 20px" : "70px 20px",
            }}>
              <div style={styles.smallTitle}>جامعة عين شمس</div>

              <h1 style={{
                ...styles.heroTitle,
                fontSize: isMobile ? "36px" : "58px",
              }}>كلية الهندسة</h1>

              <h2 style={{
                ...styles.heroDepartment,
                fontSize: isMobile ? "28px" : "38px",
              }}>
                <span style={styles.heroAccent}>إدارة الاستحقاقات</span>
              </h2>

              <div style={{
                display: "inline-block",
                marginTop: "8px",
                padding: "7px 16px",
                borderRadius: "999px",
                background: "rgba(255,255,255,.14)",
                border: "1px solid rgba(255,255,255,.45)",
                color: "#FFFFFF",
                fontSize: isMobile ? "13px" : "16px",
                fontWeight: "700",
                letterSpacing: ".2px",
              }}>
                مدير الإدارة - أ. رأفت طنطاوي
              </div>

              <div style={styles.blueLine}></div>

              <h3 style={styles.heroSubtitle}>البوابة الإلكترونية الذكية</h3>

              <p style={{
                ...styles.heroText,
                fontSize: isMobile ? "15px" : "17px",
              }}>
                منظومة إلكترونية متطورة لإنجاز جميع معاملات قسم الاستحقاقات
                بسهولة وسرعة، وتقديم الطلبات والخدمات إلكترونيًا.
              </p>

              <div style={{
                ...styles.heroButtons,
                flexDirection: isMobile ? "column" : "row",
              }}>
                <button
                  style={{
                    ...styles.primaryButton,
                    minWidth: isMobile ? "220px" : "200px",
                    justifyContent: "center",
                    padding: "13px 24px",
                    fontSize: isMobile ? "15px" : "16px",
                  }}
                  onClick={() => handleMenuClick("services")}
                >
                  ابدأ تقديم طلب
                  <span style={styles.arrow}>←</span>
                </button>
                <button
                  style={{
                    ...styles.primaryButton,
                    minWidth: isMobile ? "220px" : "200px",
                    justifyContent: "center",
                    padding: "13px 24px",
                    fontSize: isMobile ? "15px" : "16px",
                    border: "2px solid #2F5BEA",
                    color: "#FFFFFF",
                    background: "rgba(255,255,255,.08)",
                    boxShadow: "0 8px 22px rgba(0,0,0,.12)",
                  }}
                  onClick={() => {
                    setShowTrackingForm(true);
                    setTrackingError("");
                    setTrackedRequest(null);
                  }}
                >
                  متابعة الطلب
                  <span style={styles.arrow}>←</span>
                </button>
              </div>
            </div>
          </section>

          {/* ================= SERVICES ================= */}

          <section id="services" style={styles.servicesSection}>
            <div style={styles.sectionHeader}>
              <div style={styles.sectionSmallTitle}>خدماتنا الإلكترونية</div>

              <h2 style={styles.sectionTitle}>خدمات قسم الاستحقاقات</h2>

              <div style={styles.sectionLine}></div>

              <p style={styles.sectionDescription}>
                اختر الخدمة المطلوبة وابدأ تقديم طلبك إلكترونيًا بكل سهولة.
              </p>
            </div>

            <div style={{
              ...styles.servicesGrid,
              gridTemplateColumns: isMobile ? "1fr" : isTablet ? "repeat(2, 1fr)" : "repeat(4, 1fr)",
              gap: isMobile ? "16px" : "24px",
            }}>
              {services.map((service) => (
                <div
                  key={service.title}
                  style={{
                    ...styles.serviceCard,
                    borderColor: service.borderColor,
                    padding: isMobile ? "30px 20px 20px" : "38px 25px 27px",
                    minHeight: isMobile ? "280px" : "335px",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.transform = "translateY(-8px)";
                    e.currentTarget.style.boxShadow =
                      "0 20px 45px " + service.color + "22";
                    e.currentTarget.style.borderColor = service.color;
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.transform = "translateY(0)";
                    e.currentTarget.style.boxShadow =
                      "0 8px 28px rgba(15, 47, 79, 0.07)";
                    e.currentTarget.style.borderColor = service.borderColor;
                  }}
                >
                  <div
                    style={{
                      ...styles.serviceTopLine,
                      background: service.color,
                    }}
                  ></div>

                  <div
                    style={{
                      ...styles.serviceIcon,
                      background: service.lightColor,
                      border: "1px solid " + service.borderColor,
                      width: isMobile ? "60px" : "76px",
                      height: isMobile ? "60px" : "76px",
                      margin: isMobile ? "0 auto 15px" : "0 auto 20px",
                    }}
                  >
                    <span style={{
                      ...styles.serviceEmoji,
                      fontSize: isMobile ? "28px" : "34px",
                    }}>{service.icon}</span>
                  </div>

                  <h3
                    className="service-title"
                    style={{
                      ...styles.serviceTitle,
                      color: "#123B6D",
                    }}
                  >
                    {service.title}
                  </h3>

                  <p className="service-description" style={styles.serviceDescription}>
                    {service.description}
                  </p>

                  <button
                    className="service-button"
                    style={{
                      ...styles.serviceButton,
                      color: service.color,
                      background: service.lightColor,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = service.color;
                      e.currentTarget.style.color = "#ffffff";
                      e.currentTarget.style.transform = "translateY(-2px)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = service.lightColor;
                      e.currentTarget.style.color = service.color;
                      e.currentTarget.style.transform = "translateY(0)";
                    }}
                    onClick={() => openServiceForm(service)}
                  >
                    <span>تقديم الطلب</span>
                    <span style={styles.serviceButtonArrow}>←</span>
                  </button>
                </div>
              ))}
            </div>
          </section>

          {/* ================= EVALUATION ================= */}

          <section id="evaluation" style={styles.evaluationSection}>
            <div style={styles.sectionHeader}>
              <div style={styles.sectionSmallTitle}>رأيكم يهمنا</div>

              <h2 style={styles.sectionTitle}>التقييم والشكاوى</h2>

              <div style={styles.sectionLine}></div>

              <p style={styles.sectionDescription}>
                نعمل دائمًا على تطوير الخدمات وتحسين تجربة المستفيدين.
              </p>
            </div>

            <div style={styles.evaluationCards}>
              <div style={styles.evaluationCard}>
                <div style={styles.evaluationIcon}>⭐</div>

                <h3>تقييم الخدمة</h3>

                <p>شاركنا رأيك في مستوى الخدمة المقدمة.</p>

                <button
                  style={styles.outlineButton}
                  onClick={() => openFeedbackForm("rating")}
                >
                  تقييم الخدمة
                </button>
              </div>

              <div style={styles.evaluationCard}>
                <div style={styles.evaluationIcon}>💬</div>

                <h3>الشكاوى والمقترحات</h3>

                <p>أرسل لنا شكواك أو مقترحك لتطوير الخدمة.</p>

                <button
                  style={styles.outlineButton}
                  onClick={() => openFeedbackForm("complaint")}
                >
                  إرسال رسالة
                </button>
              </div>
            </div>
          </section>

          {/* ================= ABOUT ================= */}

          <section id="about" style={{
            ...styles.aboutSection,
            display: isMobile || isTablet ? "block" : "grid",
            gridTemplateColumns: isMobile || isTablet ? "1fr" : "minmax(0, 1.35fr) minmax(360px, 0.8fr)",
            gap: isMobile ? "30px" : isTablet ? "40px" : "80px",
            padding: isMobile ? "40px 5%" : isTablet ? "60px 6%" : "95px 8%",
          }}>
            <div style={styles.aboutShapeOne}></div>
            <div style={styles.aboutShapeTwo}></div>

            <div style={styles.aboutContent}>
              <div style={styles.aboutLabel}>
                <span style={styles.aboutLabelLine}></span>
                عن القسم
              </div>

              <h2 style={styles.aboutTitle}>قسم الاستحقاقات</h2>

              <div style={styles.aboutTitleLine}></div>

              <p style={styles.aboutParagraph}>
                يختص قسم الاستحقاقات بتقديم وإدارة الخدمات الخاصة بالعاملين
                وأعضاء هيئة التدريس بكلية الهندسة، والعمل على سرعة إنجاز
                المعاملات والمستندات المتعلقة بالمرتبات والاستحقاقات.
              </p>

              <p style={styles.aboutParagraph}>
                وتهدف البوابة الإلكترونية إلى تسهيل تقديم الطلبات ومتابعتها
                إلكترونيًا، وتحسين جودة الخدمات المقدمة ورفع كفاءة العمل
                الإداري.
              </p>

              <div style={styles.aboutBottomText}>
                <span style={styles.aboutCheck}>✓</span>
                خدمات إلكترونية سهلة وسريعة وآمنة
              </div>
            </div>

            {/* PREMIUM ABOUT CARD */}

            <div style={{
              ...styles.aboutBox,
              maxWidth: isMobile ? "100%" : "360px",
            }}>
              <div style={styles.aboutBoxGlow}></div>

              <div style={styles.aboutBoxIcon}>⚙</div>

              <h3 style={styles.aboutBoxTitle}>خدمة إلكترونية متطورة</h3>

              <p style={styles.aboutBoxSubtitle}>
                نعمل على تقديم تجربة إلكترونية أفضل
              </p>

              <div style={styles.aboutFeatures}>
                <div style={styles.aboutFeature}>
                  <div style={styles.aboutFeatureIcon}>⚡</div>
                  <div>
                    <strong style={styles.aboutFeatureTitle}>
                      سرعة الخدمة
                    </strong>
                    <span style={styles.aboutFeatureText}>
                      إنجاز الطلبات بسهولة وسرعة
                    </span>
                  </div>
                </div>

                <div style={styles.aboutFeature}>
                  <div style={styles.aboutFeatureIcon}>✓</div>
                  <div>
                    <strong style={styles.aboutFeatureTitle}>
                      سهولة المتابعة
                    </strong>
                    <span style={styles.aboutFeatureText}>
                      متابعة الطلبات إلكترونيًا
                    </span>
                  </div>
                </div>

                <div style={styles.aboutFeature}>
                  <div style={styles.aboutFeatureIcon}>★</div>
                  <div>
                    <strong style={styles.aboutFeatureTitle}>
                      جودة الخدمة
                    </strong>
                    <span style={styles.aboutFeatureText}>
                      تطوير مستمر وتحسين تجربة المستفيد
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* ================= CONTACT ================= */}

          <section id="contact" style={{
            ...styles.contactSection,
            padding: isMobile ? "50px 5%" : "70px 8%",
          }}>
            <div style={styles.contactContent}>
              <div style={styles.contactHeader}>
                <div style={styles.contactSmallTitle}>تواصل معنا</div>

                <h2 style={styles.contactTitle}>قسم الاستحقاقات</h2>

                <p style={styles.contactText}>
                  كلية الهندسة – جامعة عين شمس
                </p>
              </div>

              <div style={{
                ...styles.contactCards,
                gridTemplateColumns: isMobile ? "1fr" : "repeat(auto-fit, minmax(240px, 1fr))",
                gap: isMobile ? "20px" : "28px",
              }}>
                <a
                  href="tel:01055662546"
                  style={{
                    ...styles.contactCard,
                    padding: isMobile ? "25px 20px" : "35px 28px",
                    minHeight: isMobile ? "180px" : "220px",
                  }}
                >
                  <div style={{
                    ...styles.contactCardIcon,
                    fontSize: isMobile ? "36px" : "48px",
                  }}>📞</div>
                  <h3 style={{
                    ...styles.contactCardTitle,
                    fontSize: isMobile ? "18px" : "22px",
                  }}>التليفون</h3>
                  <p style={{
                    ...styles.contactCardPhone,
                    fontSize: isMobile ? "14px" : "16px",
                  }}>01055662546</p>
                </a>

                <a
                  href="https://wa.me/201055662546"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    ...styles.contactCard,
                    padding: isMobile ? "25px 20px" : "35px 28px",
                    minHeight: isMobile ? "180px" : "220px",
                  }}
                >
                  <div style={{
                    ...styles.contactCardIcon,
                    fontSize: isMobile ? "36px" : "48px",
                  }}>💬</div>
                  <h3 style={{
                    ...styles.contactCardTitle,
                    fontSize: isMobile ? "18px" : "22px",
                  }}>واتساب</h3>
                  <p style={{
                    ...styles.contactCardPhone,
                    fontSize: isMobile ? "14px" : "16px",
                  }}>مراسلة مباشرة</p>
                </a>

                <div style={{
                  ...styles.contactCard,
                    padding: isMobile ? "25px 20px" : "35px 28px",
                    minHeight: isMobile ? "180px" : "220px",
                  }}>
                  <div style={{
                    ...styles.contactCardIcon,
                    fontSize: isMobile ? "36px" : "48px",
                  }}>🏛️</div>
                  <h3 style={{
                    ...styles.contactCardTitle,
                    fontSize: isMobile ? "18px" : "22px",
                  }}>الموقع</h3>
                  <p style={{
                    ...styles.contactCardPhone,
                    fontSize: isMobile ? "14px" : "16px",
                  }}>كلية الهندسة</p>
                </div>
              </div>

              <div style={styles.contactFooter}>
                <div style={styles.contactFooterIcon}>⏰</div>
                <div>
                  <strong style={styles.contactFooterTitle}>ساعات العمل</strong>
                  <p style={styles.contactFooterText}>الأحد - الخميس: 9:00 ص - 2:15 م</p>
                </div>
              </div>
            </div>
          </section>
        </main>
      )}

      {/* ================= SERVICE REQUEST FORM ================= */}
      {showServiceForm && (
        <div
          style={styles.modalOverlay}
          onClick={() => {
            if (!serviceLoading) setShowServiceForm(false);
          }}
        >
          <div
            style={{ ...styles.loginBox, width: "min(520px, 100%)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              style={styles.closeButton}
              onClick={() => {
                if (!serviceLoading) setShowServiceForm(false);
              }}
            >
              ×
            </button>

            <div style={{ fontSize: "42px", marginBottom: "8px" }}>
              {selectedService?.icon || "📄"}
            </div>

            <h2 style={styles.loginTitle}>
              تقديم طلب {selectedService?.title || "خدمة إلكترونية"}
            </h2>

            <p style={styles.loginDescription}>
              برجاء إدخال البيانات المطلوبة لإرسال الطلب إلى قسم الاستحقاقات.
            </p>

            <input
              type="text"
              placeholder="الاسم"
              value={serviceForm.name}
              onChange={(e) =>
                setServiceForm((prev) => ({ ...prev, name: e.target.value }))
              }
              style={styles.input}
            />

            <input
              type="text"
              placeholder="الوظيفة"
              value={serviceForm.job}
              onChange={(e) =>
                setServiceForm((prev) => ({ ...prev, job: e.target.value }))
              }
              style={styles.input}
            />

            <input
              type="tel"
              placeholder="رقم التليفون (اختياري)"
              value={serviceForm.phone}
              onChange={(e) =>
                setServiceForm((prev) => ({ ...prev, phone: e.target.value }))
              }
              style={styles.input}
            />

            <select
              value={serviceForm.requestedMonth}
              onChange={(e) =>
                setServiceForm((prev) => ({
                  ...prev,
                  requestedMonth: e.target.value,
                }))
              }
              style={styles.input}
            >
              <option value="">اختاري الشهر المطلوب</option>
              <option value="يناير">يناير</option>
              <option value="فبراير">فبراير</option>
              <option value="مارس">مارس</option>
              <option value="أبريل">أبريل</option>
              <option value="مايو">مايو</option>
              <option value="يونيو">يونيو</option>
              <option value="يوليو">يوليو</option>
              <option value="أغسطس">أغسطس</option>
              <option value="سبتمبر">سبتمبر</option>
              <option value="أكتوبر">أكتوبر</option>
              <option value="نوفمبر">نوفمبر</option>
              <option value="ديسمبر">ديسمبر</option>
            </select>

            <input
              type="number"
              min="2000"
              max="2100"
              placeholder="السنة المطلوبة"
              value={serviceForm.requestedYear}
              onChange={(e) =>
                setServiceForm((prev) => ({
                  ...prev,
                  requestedYear: e.target.value,
                }))
              }
              style={styles.input}
            />

            <button
              onClick={submitServiceRequest}
              disabled={serviceLoading}
              style={{
                ...styles.loginButton,
                opacity: serviceLoading ? 0.7 : 1,
              }}
            >
              {serviceLoading ? "جاري إرسال الطلب..." : "إرسال الطلب"}
            </button>
          </div>
        </div>
      )}

      {showFeedbackForm && (
        <div
          style={styles.modalOverlay}
          onClick={() => {
            if (!feedbackLoading) setShowFeedbackForm(false);
          }}
        >
          <div
            style={{ ...styles.loginBox, width: "min(520px, 100%)" }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              style={styles.closeButton}
              onClick={() => {
                if (!feedbackLoading) setShowFeedbackForm(false);
              }}
            >
              ×
            </button>

            <div style={{ fontSize: "42px", marginBottom: "8px" }}>
              {feedbackType === "rating" ? "⭐" : "💬"}
            </div>

            <h2 style={styles.loginTitle}>
              {feedbackType === "rating"
                ? "إرسال تقييم الخدمة"
                : "إرسال شكوى أو مقترح"}
            </h2>

            <p style={styles.loginDescription}>
              {feedbackType === "rating"
                ? "شاركينا رأيك في مستوى الخدمة المقدمة."
                : "اكتبي شكواك أو مقترحك وسيظهر في لوحة الإدارة للمتابعة."}
            </p>

            <input
              type="text"
              placeholder="الاسم"
              value={feedbackForm.name}
              onChange={(e) =>
                setFeedbackForm((prev) => ({ ...prev, name: e.target.value }))
              }
              style={styles.input}
            />

            <input
              type="tel"
              placeholder="رقم التليفون (اختياري)"
              value={feedbackForm.phone}
              onChange={(e) =>
                setFeedbackForm((prev) => ({ ...prev, phone: e.target.value }))
              }
              style={styles.input}
            />

            {feedbackType === "rating" && (
              <select
                value={feedbackForm.rating}
                onChange={(e) =>
                  setFeedbackForm((prev) => ({
                    ...prev,
                    rating: e.target.value,
                  }))
                }
                style={styles.input}
              >
                <option value="5">5 - ممتاز</option>
                <option value="4">4 - جيد جداً</option>
                <option value="3">3 - جيد</option>
                <option value="2">2 - مقبول</option>
                <option value="1">1 - ضعيف</option>
              </select>
            )}

            <textarea
              placeholder={
                feedbackType === "rating"
                  ? "ملاحظاتك عن الخدمة (اختياري)"
                  : "اكتبي الشكوى أو المقترح"
              }
              value={feedbackForm.message}
              onChange={(e) =>
                setFeedbackForm((prev) => ({
                  ...prev,
                  message: e.target.value,
                }))
              }
              style={{ ...styles.input, minHeight: "110px", resize: "vertical" }}
            />

            <button
              onClick={submitFeedback}
              disabled={feedbackLoading}
              style={{
                ...styles.loginButton,
                opacity: feedbackLoading ? 0.7 : 1,
              }}
            >
              {feedbackLoading ? "جاري الإرسال..." : "إرسال"}
            </button>
          </div>
        </div>
      )}

      {/* ================= FOOTER ================= */}

      <footer style={styles.footer}>
        <div>
          <div style={styles.footerTitle}>كلية الهندسة</div>

          <div style={styles.footerDepartment}>قسم الاستحقاقات</div>
        </div>

        <div style={styles.footerCopy}>
          جميع الحقوق محفوظة © {new Date().getFullYear()}
        </div>
      </footer>

      {/* ================= ADMIN LOGIN ================= */}

      {showTrackingForm && (
        <div
          style={styles.modalOverlay}
          onClick={() => setShowTrackingForm(false)}
        >
          <div
            style={{ ...styles.loginBox, width: "min(520px, 92%)" }}
            onClick={(event) => event.stopPropagation()}
          >
            <button
              style={styles.closeButton}
              onClick={() => setShowTrackingForm(false)}
              aria-label="إغلاق متابعة الطلب"
            >
              ×
            </button>
            <div style={{ fontSize: "42px", marginBottom: "8px" }}>🔎</div>
            <h2 style={styles.loginTitle}>متابعة الطلب</h2>
            <p style={styles.loginDescription}>
              أدخلي رقم الطلب لمعرفة حالته الحالية.
            </p>
            <form onSubmit={trackServiceRequest}>
              <input
                type="text"
                value={trackingId}
                onChange={(event) => setTrackingId(event.target.value)}
                placeholder="رقم الطلب"
                aria-label="رقم الطلب"
                style={styles.input}
              />
              <button
                type="submit"
                disabled={trackingLoading}
                style={styles.loginButton}
              >
                {trackingLoading ? "جاري البحث..." : "بحث عن الطلب"}
              </button>
            </form>
            {trackingError && (
              <div style={{ ...styles.errorBox, marginTop: "14px" }}>
                {trackingError}
              </div>
            )}
            {trackedRequest && (
              <div style={{ marginTop: "18px", overflowX: "auto", borderRadius: "14px", border: "1px solid #DCE6F0", background: "#FFFFFF", textAlign: "right" }}>
                <div style={{ minWidth: isMobile ? "440px" : "100%", display: "grid", gridTemplateColumns: "1fr 1.5fr 1fr", background: "#F1F5F9", borderBottom: "1px solid #DCE6F0", padding: "12px 16px", color: "#64748B", fontSize: "12px", fontWeight: "800" }}>
                  <span>رقم الطلب</span>
                  <span>الخدمة</span>
                  <span>الحالة</span>
                </div>
                <div style={{ minWidth: isMobile ? "440px" : "100%", display: "grid", gridTemplateColumns: "1fr 1.5fr 1fr", alignItems: "center", padding: "16px", color: "#123B5D", fontSize: "14px" }}>
                  <strong style={{ color: "#2563EB" }}>#{trackedRequest.id}</strong>
                  <strong>{trackedRequest.service_type}</strong>
                  <span style={{ justifySelf: "start", background: "#DCFCE7", color: "#047857", padding: "6px 12px", borderRadius: "999px", fontWeight: "800", fontSize: "12px" }}>
                    {trackedRequest.status || "جديد"}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {showLogin && (
        <div
          style={styles.modalOverlay}
          onClick={() => setShowLogin(false)}
        >
          <div
            style={styles.loginBox}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              style={styles.closeButton}
              onClick={() => setShowLogin(false)}
            >
              ×
            </button>

            <div style={styles.loginIcon}>🔐</div>

            <h2 style={styles.loginTitle}>دخول الإدارة</h2>

            <p style={styles.loginDescription}>
              تسجيل الدخول إلى لوحة التحكم
            </p>

            <input
              type="text"
              placeholder="اسم المستخدم"
              value={loginForm.username}
              onChange={(e) =>
                setLoginForm({ ...loginForm, username: e.target.value })
              }
              style={styles.input}
            />

            <input
              type="password"
              placeholder="كلمة المرور"
              value={loginForm.password}
              onChange={(e) =>
                setLoginForm({ ...loginForm, password: e.target.value })
              }
              style={styles.input}
            />

            <button
              onClick={handleLogin}
              disabled={loginLoading}
              style={{
                ...styles.loginButton,
                opacity: loginLoading ? 0.7 : 1,
              }}
            >
              {loginLoading ? "جاري تسجيل الدخول..." : "تسجيل الدخول"}
            </button>

            {loginError && (
              <div style={{ color: "#DC2626", fontSize: "13px", marginTop: "10px" }}>
                {loginError}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* =====================================================
   STYLES
===================================================== */

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f7f9fc",
    color: "#172b45",
    fontFamily: "'Cairo', 'Tahoma', 'Arial', sans-serif",
    overflowX: "hidden",
  },

  header: {
    height: "78px",
    background: "#ffffff",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "0 42px",
    boxSizing: "border-box",
    position: "sticky",
    top: 0,
    zIndex: 1000,
    boxShadow: "0 3px 18px rgba(20, 42, 70, 0.08)",
    gap: "25px",
    "@media (max-width: 768px)": {
      padding: "0 20px",
      height: "70px",
    },
    "@media (max-width: 480px)": {
      padding: "0 15px",
      height: "65px",
    },
  },

  logoBox: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    minWidth: "230px",
  },

  logo: {
    width: "105px",
    height: "58px",
    objectFit: "contain",
  },

  logoText: {
    display: "flex",
    flexDirection: "column",
    gap: "2px",
  },

  collegeName: {
    fontSize: "20px",
    fontWeight: "800",
    color: "#102d4a",
    whiteSpace: "nowrap",
  },

  departmentName: {
    fontSize: "14px",
    fontWeight: "700",
    color: "#4A5568",
    whiteSpace: "nowrap",
  },

  nav: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    flex: 1,
    "@media (max-width: 768px)": {
      display: "none",
    },
  },

  navButton: {
    position: "relative",
    border: "none",
    background: "transparent",
    color: "#34465d",
    fontFamily: "inherit",
    fontSize: "14px",
    fontWeight: "600",
    padding: "28px 15px 24px",
    cursor: "pointer",
    transition: "all 0.25s ease",
  },

  activeNavButton: {
    color: "#2F5BEA",
    fontWeight: "800",
  },

  adminButton: {
    border: "none",
    background: "#102d4a",
    color: "#ffffff",
    borderRadius: "10px",
    padding: "12px 20px",
    fontFamily: "inherit",
    fontSize: "13px",
    fontWeight: "700",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    boxShadow: "0 6px 15px rgba(16, 45, 74, 0.18)",
    whiteSpace: "nowrap",
    "@media (max-width: 480px)": {
      padding: "10px 15px",
      fontSize: "12px",
    },
  },

  mobileMenuButton: {
    display: "none",
    border: "none",
    background: "transparent",
    fontSize: "24px",
    cursor: "pointer",
    color: "#102d4a",
  },

  mobileMenuIcon: {
    fontSize: "28px",
  },

  mobileMenu: {
    position: "absolute",
    top: "100%",
    left: "0",
    right: "0",
    background: "#ffffff",
    boxShadow: "0 10px 30px rgba(0, 0, 0, 0.1)",
    padding: "20px",
    zIndex: 1001,
    display: "flex",
    flexDirection: "column",
    gap: "10px",
  },

  mobileMenuItem: {
    border: "none",
    background: "transparent",
    color: "#34465d",
    fontFamily: "inherit",
    fontSize: "16px",
    fontWeight: "600",
    padding: "15px 20px",
    cursor: "pointer",
    textAlign: "right",
    borderRadius: "8px",
    transition: "background 0.2s ease",
  },

  mobileMenuItemActive: {
    background: "#E0E7FF",
    color: "#2F5BEA",
  },

  hero: {
    position: "relative",
    width: "100%",
    minHeight: "560px",
    backgroundSize: "cover",
    backgroundPosition: "center",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },

  heroOverlay: {
    position: "absolute",
    inset: 0,
    background:
      "linear-gradient(90deg, rgba(8,28,50,0.84), rgba(8,28,50,0.62), rgba(8,28,50,0.30))",
  },

  heroContent: {
    position: "relative",
    zIndex: 2,
    width: "min(900px, 90%)",
    textAlign: "center",
    color: "#ffffff",
    padding: "70px 20px",
  },

  smallTitle: {
    fontSize: "18px",
    fontWeight: "600",
    color: "#dce7f5",
    marginBottom: "5px",
    letterSpacing: "1px",
  },

  heroTitle: {
    margin: "0",
    fontSize: "58px",
    lineHeight: "1.15",
    fontWeight: "900",
    color: "#ffffff",
    letterSpacing: "-1px",
  },

  heroDepartment: {
    margin: "5px 0 15px",
    fontSize: "38px",
    lineHeight: "1.2",
    fontWeight: "800",
  },

  heroAccent: {
    color: "#FFFFFF",
    fontWeight: "800",
  },

  blueLine: {
    width: "75px",
    height: "4px",
    background: "#FFFFFF",
    margin: "18px auto 22px",
    borderRadius: "20px",
  },

  heroSubtitle: {
    margin: "0 0 16px",
    fontSize: "25px",
    fontWeight: "800",
    color: "#ffffff",
  },

  heroText: {
    maxWidth: "720px",
    margin: "0 auto",
    fontSize: "17px",
    lineHeight: "2",
    color: "#edf4fa",
    fontWeight: "500",
  },

  heroButtons: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    gap: "14px",
    marginTop: "30px",
    flexWrap: "wrap",
  },

  primaryButton: {
    background: "#2F5BEA",
    color: "#fff",
    border: "none",
    padding: "15px 30px",
    borderRadius: "10px",
    fontFamily: "inherit",
    fontSize: "16px",
    fontWeight: "700",
    cursor: "pointer",
    transition: "0.3s",
    boxShadow: "0 8px 22px rgba(47,91,234,0.28)",
    display: "flex",
    alignItems: "center",
    gap: "15px",
  },

  arrow: {
    fontSize: "20px",
  },

  secondaryButton: {
    border: "1px solid rgba(255,255,255,0.85)",
    background: "rgba(255,255,255,0.10)",
    color: "#ffffff",
    padding: "14px 25px",
    borderRadius: "10px",
    fontFamily: "inherit",
    fontSize: "15px",
    fontWeight: "700",
    cursor: "pointer",
    backdropFilter: "blur(5px)",
    display: "flex",
    alignItems: "center",
    gap: "9px",
  },

  servicesSection: {
    background: "#F8FAFC",
    padding: "88px 7%",
  },

  sectionHeader: {
    textAlign: "center",
    maxWidth: "850px",
    margin: "0 auto 52px",
  },

  sectionSmallTitle: {
    color: "#174A7E",
    fontSize: "15px",
    fontWeight: "800",
    marginBottom: "9px",
    letterSpacing: "0.4px",
  },

  sectionTitle: {
    margin: 0,
    fontSize: "35px",
    fontWeight: "900",
    color: "#123B6D",
  },

  sectionLine: {
    width: "60px",
    height: "4px",
    background: "#2F5BEA",
    borderRadius: "20px",
    margin: "17px auto 19px",
  },

  sectionDescription: {
    margin: "0 auto",
    color: "#64748B",
    fontSize: "16px",
    maxWidth: "650px",
    lineHeight: "1.9",
  },

  servicesGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "24px",
    maxWidth: "1220px",
    margin: "0 auto",
  },

  serviceCard: {
    position: "relative",
    overflow: "hidden",
    background: "#FFFFFF",
    borderRadius: "22px",
    padding: "38px 25px 27px",
    textAlign: "center",
    border: "1px solid #E5EAF0",
    boxShadow: "0 8px 28px rgba(15, 47, 79, 0.07)",
    transition:
      "transform 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease",
    cursor: "pointer",
    minHeight: "335px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    boxSizing: "border-box",
    "@media (max-width: 640px)": {
      padding: "30px 20px 20px",
      minHeight: "280px",
    },
  },

  serviceTopLine: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "4px",
  },

  serviceIcon: {
    width: "76px",
    height: "76px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto 20px",
    flexShrink: 0,
    transition: "transform 0.3s ease",
    "@media (max-width: 640px)": {
      width: "60px",
      height: "60px",
      margin: "0 auto 15px",
    },
  },

  serviceEmoji: {
    fontSize: "34px",
    lineHeight: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },

  serviceTitle: {
    fontSize: "20px",
    margin: "0 0 12px",
    fontWeight: "800",
  },

  serviceDescription: {
    color: "#64748B",
    fontSize: "14.5px",
    lineHeight: "1.9",
    minHeight: "55px",
    margin: "0",
    maxWidth: "230px",
  },

  serviceButton: {
    marginTop: "24px",
    width: "100%",
    border: "none",
    borderRadius: "12px",
    padding: "12px 18px",
    fontFamily: "inherit",
    fontSize: "15px",
    fontWeight: "800",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "10px",
    transition:
      "background 0.25s ease, color 0.25s ease, transform 0.25s ease",
  },

  serviceButtonArrow: {
    fontSize: "19px",
    fontWeight: "800",
    lineHeight: 1,
  },

  evaluationSection: {
    padding: "80px 7%",
    background: "#f7f9fc",
  },

  evaluationCards: {
    maxWidth: "850px",
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
    gap: "25px",
  },

  evaluationCard: {
    background: "#ffffff",
    borderRadius: "16px",
    padding: "35px",
    textAlign: "center",
    boxShadow: "0 8px 25px rgba(15, 47, 79, 0.07)",
  },

  evaluationIcon: {
    fontSize: "38px",
    marginBottom: "10px",
  },

  outlineButton: {
    marginTop: "15px",
    border: "1px solid #2F5BEA",
    background: "#ffffff",
    color: "#2F5BEA",
    borderRadius: "8px",
    padding: "11px 22px",
    fontFamily: "inherit",
    fontWeight: "700",
    cursor: "pointer",
  },

  aboutSection: {
    position: "relative",
    background: "#F8FAFC",
    padding: "95px 8%",
    display: "grid",
    gridTemplateColumns: "minmax(0, 1.35fr) minmax(360px, 0.8fr)",
    gap: "80px",
    alignItems: "center",
    overflow: "hidden",
    boxSizing: "border-box",
    "@media (max-width: 1024px)": {
      gridTemplateColumns: "1fr",
      gap: "40px",
      padding: "60px 6%",
    },
    "@media (max-width: 640px)": {
      padding: "40px 5%",
      gap: "30px",
    },
  },

  aboutShapeOne: {
    position: "absolute",
    width: "320px",
    height: "320px",
    borderRadius: "50%",
    background: "rgba(47, 91, 234, 0.035)",
    top: "-170px",
    right: "-100px",
    pointerEvents: "none",
  },

  aboutShapeTwo: {
    position: "absolute",
    width: "240px",
    height: "240px",
    borderRadius: "50%",
    background: "rgba(23, 74, 126, 0.035)",
    bottom: "-130px",
    left: "-70px",
    pointerEvents: "none",
  },

  aboutContent: {
    position: "relative",
    zIndex: 2,
    maxWidth: "720px",
  },

  aboutLabel: {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    color: "#2F5BEA",
    fontSize: "15px",
    fontWeight: "800",
    marginBottom: "12px",
  },

  aboutLabelLine: {
    width: "28px",
    height: "3px",
    background: "#2F5BEA",
    borderRadius: "20px",
  },

  aboutTitle: {
    color: "#123B6D",
    fontSize: "40px",
    lineHeight: "1.3",
    margin: "0",
    fontWeight: "900",
  },

  aboutTitleLine: {
    width: "65px",
    height: "4px",
    background: "#2F5BEA",
    borderRadius: "20px",
    margin: "15px 0 25px",
  },

  aboutParagraph: {
    color: "#52657A",
    fontSize: "16px",
    lineHeight: "2.05",
    margin: "0 0 17px",
    maxWidth: "690px",
  },

  aboutBottomText: {
    display: "inline-flex",
    alignItems: "center",
    gap: "10px",
    marginTop: "12px",
    padding: "11px 18px",
    background: "#FFFFFF",
    borderRadius: "10px",
    color: "#174A7E",
    fontSize: "14px",
    fontWeight: "700",
    boxShadow: "0 5px 18px rgba(18, 59, 109, 0.06)",
    border: "1px solid #E7EDF4",
  },

  aboutCheck: {
    width: "24px",
    height: "24px",
    borderRadius: "50%",
    background: "#EAF1FF",
    color: "#2F5BEA",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "14px",
    fontWeight: "900",
  },

  aboutBox: {
    position: "relative",
    zIndex: 2,
    overflow: "hidden",
    background:
      "linear-gradient(145deg, #173B63 0%, #102E4E 55%, #0C2743 100%)",
    borderRadius: "26px",
    padding: "42px 32px 35px",
    textAlign: "center",
    color: "#FFFFFF",
    boxShadow: "0 22px 55px rgba(16, 46, 78, 0.20)",
    border: "1px solid rgba(255,255,255,0.08)",
    boxSizing: "border-box",
  },

  aboutBoxGlow: {
    position: "absolute",
    width: "180px",
    height: "180px",
    borderRadius: "50%",
    background: "rgba(255,255,255,0.045)",
    top: "-80px",
    left: "-70px",
    pointerEvents: "none",
  },

  aboutBoxIcon: {
    position: "relative",
    width: "72px",
    height: "72px",
    margin: "0 auto 20px",
    borderRadius: "20px",
    background: "rgba(255,255,255,0.10)",
    border: "1px solid rgba(255,255,255,0.16)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "36px",
    color: "#FFFFFF",
    boxShadow: "0 10px 25px rgba(0,0,0,0.12)",
  },

  aboutBoxTitle: {
    position: "relative",
    margin: "0 0 8px",
    fontSize: "23px",
    fontWeight: "900",
    color: "#FFFFFF",
  },

  aboutBoxSubtitle: {
    position: "relative",
    margin: "0 0 28px",
    color: "#C9D8E8",
    fontSize: "14px",
    lineHeight: "1.8",
  },

  aboutFeatures: {
    position: "relative",
    display: "flex",
    flexDirection: "column",
    gap: "12px",
  },

  aboutFeature: {
    display: "flex",
    alignItems: "center",
    textAlign: "right",
    gap: "13px",
    padding: "13px 14px",
    background: "rgba(255,255,255,0.07)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: "13px",
    transition: "0.25s ease",
  },

  aboutFeatureIcon: {
    width: "38px",
    height: "38px",
    minWidth: "38px",
    borderRadius: "10px",
    background: "rgba(255,255,255,0.11)",
    color: "#FFFFFF",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "18px",
    fontWeight: "900",
  },

  aboutFeatureTitle: {
    display: "block",
    color: "#FFFFFF",
    fontSize: "14px",
    fontWeight: "800",
    marginBottom: "2px",
  },

  aboutFeatureText: {
    display: "block",
    color: "#BFD0E0",
    fontSize: "12px",
    lineHeight: "1.7",
  },

  contactSection: {
    background: "#123653",
    padding: "70px 8%",
    color: "#ffffff",
  },

  contactContent: {
    maxWidth: "1000px",
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: "40px",
    alignItems: "center",
  },

  contactHeader: {
    textAlign: "center",
    maxWidth: "700px",
  },

  contactSmallTitle: {
    color: "#7c9cff",
    fontWeight: "800",
    marginBottom: "10px",
    fontSize: "14px",
  },

  contactTitle: {
    fontSize: "32px",
    margin: "0 0 12px",
    fontWeight: "800",
  },

  contactText: {
    color: "#d5e1eb",
    fontSize: "16px",
    lineHeight: "1.7",
  },

  contactCards: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
    gap: "24px",
    width: "100%",
    maxWidth: "850px",
  },

  contactCard: {
    background: "rgba(255, 255, 255, 0.08)",
    borderRadius: "12px",
    padding: "30px 24px",
    color: "#ffffff",
    textDecoration: "none",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    textAlign: "center",
    transition: "background 0.3s ease",
  },

  contactCardIcon: {
    fontSize: "40px",
    marginBottom: "14px",
  },

  contactCardTitle: {
    fontSize: "18px",
    fontWeight: "700",
    margin: "0 0 8px",
    color: "#ffffff",
  },

  contactCardPhone: {
    fontSize: "15px",
    color: "rgba(255, 255, 255, 0.85)",
    margin: "0",
    fontWeight: "500",
  },

  contactFooter: {
    display: "flex",
    alignItems: "center",
    gap: "16px",
    background: "rgba(255, 255, 255, 0.06)",
    padding: "18px 24px",
    borderRadius: "10px",
    border: "1px solid rgba(255, 255, 255, 0.08)",
  },

  contactFooterIcon: {
    fontSize: "28px",
  },

  contactFooterTitle: {
    display: "block",
    fontSize: "15px",
    fontWeight: "700",
    color: "#ffffff",
    marginBottom: "4px",
  },

  contactFooterText: {
    margin: 0,
    fontSize: "14px",
    color: "rgba(255, 255, 255, 0.8)",
  },

  footer: {
    background: "#0c2439",
    color: "#ffffff",
    padding: "25px 8%",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "20px",
    flexWrap: "wrap",
  },

  footerTitle: {
    fontSize: "18px",
    fontWeight: "800",
  },

  footerDepartment: {
    color: "#6f8fff",
    fontSize: "13px",
    marginTop: "3px",
  },

  footerCopy: {
    color: "#aebdca",
    fontSize: "13px",
  },

  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(5, 20, 35, 0.65)",
    backdropFilter: "blur(5px)",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 3000,
    padding: "20px",
  },

  loginBox: {
    position: "relative",
    width: "min(420px, 100%)",
    background: "#ffffff",
    borderRadius: "20px",
    padding: "40px",
    boxSizing: "border-box",
    textAlign: "center",
    boxShadow: "0 25px 70px rgba(0,0,0,0.25)",
  },

  closeButton: {
    position: "absolute",
    top: "15px",
    left: "18px",
    border: "none",
    background: "transparent",
    fontSize: "24px",
    cursor: "pointer",
    color: "#64748B",
  },

  loginIcon: {
    fontSize: "40px",
    marginBottom: "10px",
  },

  loginTitle: {
    fontSize: "22px",
    fontWeight: "800",
    color: "#102d4a",
    margin: "0 0 5px",
  },

  loginDescription: {
    fontSize: "14px",
    color: "#64748B",
    marginBottom: "20px",
  },

  input: {
    width: "100%",
    padding: "12px 15px",
    marginBottom: "15px",
    borderRadius: "8px",
    border: "1px solid #CBD5E1",
    fontSize: "14px",
    boxSizing: "border-box",
    outline: "none",
    fontFamily: "inherit",
  },

  loginButton: {
    width: "100%",
    padding: "12px",
    background: "#2F5BEA",
    color: "#ffffff",
    border: "none",
    borderRadius: "8px",
    fontSize: "15px",
    fontWeight: "700",
    cursor: "pointer",
    fontFamily: "inherit",
    marginTop: "10px",
  },
};

export default App;
