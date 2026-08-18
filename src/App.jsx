import { useState } from "react";
import logo from "./assets/logo.png";
import background from "./assets/engineering.jpg";

function App() {
  const [activePage, setActivePage] = useState("home");
  const [showLogin, setShowLogin] = useState(false);

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
      title: "مفرد مرتب",
      description: "طلب استخراج مفرد مرتب إلكترونيًا.",
      color: "#2563EB",
      lightColor: "#EFF6FF",
      borderColor: "#BFDBFE",
    },
    {
      icon: "❤️",
      title: "الرعاية الاجتماعية",
      description: "تقديم طلبات الرعاية الصحية والاجتماعية.",
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

  return (
    <div dir="rtl" style={styles.page}>

      {/* ================= HEADER ================= */}

      <header style={styles.header}>
        <div style={styles.logoBox}>
          <img
            src={logo}
            alt="كلية الهندسة"
            style={styles.logo}
          />

          <div style={styles.logoText}>
            <div style={styles.collegeName}>
              كلية الهندسة
            </div>

            <div style={styles.departmentName}>
              قسم الاستحقاقات
            </div>
          </div>
        </div>

        {/* NAVIGATION */}

        <nav style={styles.nav}>
          {menuItems.map((item) => (
            <button
              key={item.id}
              onClick={() => handleMenuClick(item.id)}
              style={{
                ...styles.navButton,
                ...(activePage === item.id
                  ? styles.activeNavButton
                  : {}),
              }}
            >
              {item.title}
            </button>
          ))}
        </nav>

        {/* ADMIN BUTTON */}

        <button
          style={styles.adminButton}
          onClick={() => setShowLogin(true)}
        >
          <span>🔐</span>

          <span>
            دخول الإدارة
          </span>
        </button>
      </header>

      {/* ================= MAIN ================= */}

      <main>

        {/* ================= HERO ================= */}

        <section
          id="home"
          style={{
            ...styles.hero,
            backgroundImage: "url(" + background + ")",
          }}
        >
          <div style={styles.heroOverlay}></div>

          <div style={styles.heroContent}>
            <div style={styles.smallTitle}>
              جامعة عين شمس
            </div>

            <h1 style={styles.heroTitle}>
              كلية الهندسة
            </h1>

            <h2 style={styles.heroDepartment}>
              <span style={styles.heroAccent}>
                قسم الاستحقاقات
              </span>
            </h2>

            <div style={styles.blueLine}></div>

            <h3 style={styles.heroSubtitle}>
              البوابة الإلكترونية الذكية
            </h3>

            <p style={styles.heroText}>
              منظومة إلكترونية متطورة لإنجاز جميع معاملات
              قسم الاستحقاقات بسهولة وسرعة، وتقديم الطلبات
              والخدمات إلكترونيًا.
            </p>

            <div style={styles.heroButtons}>

              <button
                style={styles.primaryButton}
                onClick={() => handleMenuClick("services")}
              >
                ابدأ تقديم طلب

                <span style={styles.arrow}>
                  ←
                </span>
              </button>

              <button
                style={styles.secondaryButton}
                onClick={() => {
                  alert("سيتم إضافة متابعة الطلب قريبًا");
                }}
              >
                <span>
                  🔎
                </span>

                متابعة طلب
              </button>

            </div>
          </div>
        </section>

        {/* ================= SERVICES ================= */}

        <section
          id="services"
          style={styles.servicesSection}
        >
          <div style={styles.sectionHeader}>

            <div style={styles.sectionSmallTitle}>
              خدماتنا الإلكترونية
            </div>

            <h2 style={styles.sectionTitle}>
              خدمات قسم الاستحقاقات
            </h2>

            <div style={styles.sectionLine}></div>

            <p style={styles.sectionDescription}>
              اختر الخدمة المطلوبة وابدأ تقديم طلبك
              إلكترونيًا بكل سهولة.
            </p>

          </div>

          <div style={styles.servicesGrid}>

            {services.map((service) => (
              <div
                key={service.title}
                style={{
                  ...styles.serviceCard,
                  borderColor: service.borderColor,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.transform =
                    "translateY(-8px)";

                  e.currentTarget.style.boxShadow =
                    "0 20px 45px " +
                    service.color +
                    "22";

                  e.currentTarget.style.borderColor =
                    service.color;
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform =
                    "translateY(0)";

                  e.currentTarget.style.boxShadow =
                    "0 8px 28px rgba(15, 47, 79, 0.07)";

                  e.currentTarget.style.borderColor =
                    service.borderColor;
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
                    border:
                      "1px solid " +
                      service.borderColor,
                  }}
                >
                  <span style={styles.serviceEmoji}>
                    {service.icon}
                  </span>
                </div>

                <h3
                  style={{
                    ...styles.serviceTitle,
                    color: "#123B6D",
                  }}
                >
                  {service.title}
                </h3>

                <p style={styles.serviceDescription}>
                  {service.description}
                </p>

                <button
                  style={{
                    ...styles.serviceButton,
                    color: service.color,
                    background: service.lightColor,
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background =
                      service.color;

                    e.currentTarget.style.color =
                      "#ffffff";

                    e.currentTarget.style.transform =
                      "translateY(-2px)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background =
                      service.lightColor;

                    e.currentTarget.style.color =
                      service.color;

                    e.currentTarget.style.transform =
                      "translateY(0)";
                  }}
                >
                  <span>
                    تقديم الطلب
                  </span>

                  <span style={styles.serviceButtonArrow}>
                    ←
                  </span>
                </button>

              </div>
            ))}

          </div>
        </section>

        {/* =====================================================
            EVALUATION
            التقييم والشكاوى أصبحت هنا مباشرة بعد الخدمات
        ===================================================== */}

        <section
          id="evaluation"
          style={styles.evaluationSection}
        >

          <div style={styles.sectionHeader}>

            <div style={styles.sectionSmallTitle}>
              رأيكم يهمنا
            </div>

            <h2 style={styles.sectionTitle}>
              التقييم والشكاوى
            </h2>

            <div style={styles.sectionLine}></div>

            <p style={styles.sectionDescription}>
              نعمل دائمًا على تطوير الخدمات وتحسين تجربة
              المستفيدين.
            </p>

          </div>

          <div style={styles.evaluationCards}>

            <div style={styles.evaluationCard}>

              <div style={styles.evaluationIcon}>
                ⭐
              </div>

              <h3>
                تقييم الخدمة
              </h3>

              <p>
                شاركنا رأيك في مستوى الخدمة المقدمة.
              </p>

              <button style={styles.outlineButton}>
                تقييم الخدمة
              </button>

            </div>

            <div style={styles.evaluationCard}>

              <div style={styles.evaluationIcon}>
                💬
              </div>

              <h3>
                الشكاوى والمقترحات
              </h3>

              <p>
                أرسل لنا شكواك أو مقترحك لتطوير الخدمة.
              </p>

              <button style={styles.outlineButton}>
                إرسال رسالة
              </button>

            </div>

          </div>
        </section>

        {/* ================= ABOUT ================= */}

        <section
          id="about"
          style={styles.aboutSection}
        >

          <div style={styles.aboutShapeOne}></div>

          <div style={styles.aboutShapeTwo}></div>

          <div style={styles.aboutContent}>

            <div style={styles.aboutLabel}>
              <span style={styles.aboutLabelLine}></span>

              عن القسم
            </div>

            <h2 style={styles.aboutTitle}>
              قسم الاستحقاقات
            </h2>

            <div style={styles.aboutTitleLine}></div>

            <p style={styles.aboutParagraph}>
              يختص قسم الاستحقاقات بتقديم وإدارة الخدمات
              الخاصة بالعاملين وأعضاء هيئة التدريس بكلية
              الهندسة، والعمل على سرعة إنجاز المعاملات
              والمستندات المتعلقة بالمرتبات والاستحقاقات.
            </p>

            <p style={styles.aboutParagraph}>
              وتهدف البوابة الإلكترونية إلى تسهيل تقديم
              الطلبات ومتابعتها إلكترونيًا، وتحسين جودة
              الخدمات المقدمة ورفع كفاءة العمل الإداري.
            </p>

            <div style={styles.aboutBottomText}>

              <span style={styles.aboutCheck}>
                ✓
              </span>

              خدمات إلكترونية سهلة وسريعة وآمنة

            </div>

          </div>

          {/* PREMIUM ABOUT CARD */}

          <div style={styles.aboutBox}>

            <div style={styles.aboutBoxGlow}></div>

            <div style={styles.aboutBoxIcon}>
              ⚙
            </div>

            <h3 style={styles.aboutBoxTitle}>
              خدمة إلكترونية متطورة
            </h3>

            <p style={styles.aboutBoxSubtitle}>
              نعمل على تقديم تجربة إلكترونية أفضل
            </p>

            <div style={styles.aboutFeatures}>

              {/* FEATURE 1 */}

              <div style={styles.aboutFeature}>

                <div style={styles.aboutFeatureIcon}>
                  ⚡
                </div>

                <div>
                  <strong style={styles.aboutFeatureTitle}>
                    سرعة الخدمة
                  </strong>

                  <span style={styles.aboutFeatureText}>
                    إنجاز الطلبات بسهولة وسرعة
                  </span>
                </div>

              </div>

              {/* FEATURE 2 */}

              <div style={styles.aboutFeature}>

                <div style={styles.aboutFeatureIcon}>
                  ✓
                </div>

                <div>
                  <strong style={styles.aboutFeatureTitle}>
                    سهولة المتابعة
                  </strong>

                  <span style={styles.aboutFeatureText}>
                    متابعة الطلبات إلكترونيًا
                  </span>
                </div>

              </div>

              {/* FEATURE 3 */}

              <div style={styles.aboutFeature}>

                <div style={styles.aboutFeatureIcon}>
                  ★
                </div>

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

        <section
          id="contact"
          style={styles.contactSection}
        >

          <div style={styles.contactContent}>

            <div>

              <div style={styles.contactSmallTitle}>
                تواصل معنا
              </div>

              <h2 style={styles.contactTitle}>
                قسم الاستحقاقات
              </h2>

              <p style={styles.contactText}>
                كلية الهندسة – جامعة عين شمس
              </p>

            </div>

            <div style={styles.contactItems}>

              <div style={styles.contactItem}>

                <span>
                  ☎️
                </span>

                <div>

                  <strong>
                    التليفون
                  </strong>

                  <p>
                    يتم إضافة أرقام التواصل
                  </p>

                </div>

              </div>

              <div style={styles.contactItem}>

                <span>
                  ✉️
                </span>

                <div>

                  <strong>
                    البريد الإلكتروني
                  </strong>

                  <p>
                    يتم إضافة البريد الإلكتروني
                  </p>

                </div>

              </div>

            </div>

          </div>

        </section>

      </main>

      {/* ================= FOOTER ================= */}

      <footer style={styles.footer}>

        <div>

          <div style={styles.footerTitle}>
            كلية الهندسة
          </div>

          <div style={styles.footerDepartment}>
            قسم الاستحقاقات
          </div>

        </div>

        <div style={styles.footerCopy}>
          جميع الحقوق محفوظة ©{" "}
          {new Date().getFullYear()}
        </div>

      </footer>

      {/* ================= ADMIN LOGIN ================= */}

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

            <div style={styles.loginIcon}>
              🔐
            </div>

            <h2 style={styles.loginTitle}>
              دخول الإدارة
            </h2>

            <p style={styles.loginDescription}>
              تسجيل الدخول إلى لوحة التحكم
            </p>

            <input
              type="text"
              placeholder="اسم المستخدم"
              style={styles.input}
            />

            <input
              type="password"
              placeholder="كلمة المرور"
              style={styles.input}
            />

            <button style={styles.loginButton}>
              تسجيل الدخول
            </button>

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

  /* ================= PAGE ================= */

  page: {
    minHeight: "100vh",
    background: "#f7f9fc",
    color: "#172b45",
    fontFamily: "'Cairo', 'Tahoma', 'Arial', sans-serif",
    overflowX: "hidden",
  },

  /* ================= HEADER ================= */

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
    color: "#FFFFFF",
    whiteSpace: "nowrap",
  },

  /* ================= NAV ================= */

  nav: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    flex: 1,
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

  /* ================= ADMIN ================= */

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
    boxShadow:
      "0 6px 15px rgba(16, 45, 74, 0.18)",
    whiteSpace: "nowrap",
  },

  /* ================= HERO ================= */

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
    boxShadow: "none",
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

  /* ================= HERO BUTTONS ================= */

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
    boxShadow:
      "0 8px 22px rgba(47,91,234,0.28)",
    display: "flex",
    alignItems: "center",
    gap: "15px",
  },

  arrow: {
    fontSize: "20px",
  },

  secondaryButton: {
    border:
      "1px solid rgba(255,255,255,0.85)",
    background:
      "rgba(255,255,255,0.10)",
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

  /* ================= SERVICES ================= */

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

  /* ================= SERVICE GRID ================= */

  servicesGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, 1fr)",
    gap: "24px",
    maxWidth: "1220px",
    margin: "0 auto",
  },

  /* ================= SERVICE CARD ================= */

  serviceCard: {
    position: "relative",
    overflow: "hidden",
    background: "#FFFFFF",
    borderRadius: "22px",
    padding: "38px 25px 27px",
    textAlign: "center",
    border: "1px solid #E5EAF0",
    boxShadow:
      "0 8px 28px rgba(15, 47, 79, 0.07)",
    transition:
      "transform 0.3s ease, box-shadow 0.3s ease, border-color 0.3s ease",
    cursor: "pointer",
    minHeight: "335px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    boxSizing: "border-box",
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

  /* ================= EVALUATION ================= */

  evaluationSection: {
    padding: "80px 7%",
    background: "#f7f9fc",
  },

  evaluationCards: {
    maxWidth: "850px",
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(260px, 1fr))",
    gap: "25px",
  },

  evaluationCard: {
    background: "#ffffff",
    borderRadius: "16px",
    padding: "35px",
    textAlign: "center",
    boxShadow:
      "0 8px 25px rgba(15, 47, 79, 0.07)",
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

  /* ================= ABOUT ================= */

  aboutSection: {
    position: "relative",
    background: "#F8FAFC",
    padding: "95px 8%",
    display: "grid",
    gridTemplateColumns:
      "minmax(0, 1.35fr) minmax(360px, 0.8fr)",
    gap: "80px",
    alignItems: "center",
    overflow: "hidden",
    boxSizing: "border-box",
  },

  aboutShapeOne: {
    position: "absolute",
    width: "320px",
    height: "320px",
    borderRadius: "50%",
    background:
      "rgba(47, 91, 234, 0.035)",
    top: "-170px",
    right: "-100px",
    pointerEvents: "none",
  },

  aboutShapeTwo: {
    position: "absolute",
    width: "240px",
    height: "240px",
    borderRadius: "50%",
    background:
      "rgba(23, 74, 126, 0.035)",
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
    boxShadow:
      "0 5px 18px rgba(18, 59, 109, 0.06)",
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

  /* ================= ABOUT PREMIUM BOX ================= */

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
    boxShadow:
      "0 22px 55px rgba(16, 46, 78, 0.20)",
    border:
      "1px solid rgba(255,255,255,0.08)",
    boxSizing: "border-box",
  },

  aboutBoxGlow: {
    position: "absolute",
    width: "180px",
    height: "180px",
    borderRadius: "50%",
    background:
      "rgba(255,255,255,0.045)",
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
    background:
      "rgba(255,255,255,0.10)",
    border:
      "1px solid rgba(255,255,255,0.16)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "36px",
    color: "#FFFFFF",
    boxShadow:
      "0 10px 25px rgba(0,0,0,0.12)",
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
    background:
      "rgba(255,255,255,0.07)",
    border:
      "1px solid rgba(255,255,255,0.08)",
    borderRadius: "13px",
    transition: "0.25s ease",
  },

  aboutFeatureIcon: {
    width: "38px",
    height: "38px",
    minWidth: "38px",
    borderRadius: "10px",
    background:
      "rgba(255,255,255,0.11)",
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

  /* ================= CONTACT ================= */

  contactSection: {
    background: "#123653",
    padding: "65px 8%",
    color: "#ffffff",
  },

  contactContent: {
    maxWidth: "1050px",
    margin: "0 auto",
    display: "flex",
    justifyContent: "space-between",
    gap: "50px",
    alignItems: "center",
    flexWrap: "wrap",
  },

  contactSmallTitle: {
    color: "#7c9cff",
    fontWeight: "800",
    marginBottom: "8px",
  },

  contactTitle: {
    fontSize: "30px",
    margin: "0 0 10px",
  },

  contactText: {
    color: "#d5e1eb",
  },

  contactItems: {
    display: "flex",
    gap: "25px",
    flexWrap: "wrap",
  },

  contactItem: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    background:
      "rgba(255,255,255,0.07)",
    padding: "15px 20px",
    borderRadius: "10px",
    minWidth: "220px",
  },

  /* ================= FOOTER ================= */

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

  /* ================= LOGIN ================= */

  modalOverlay: {
    position: "fixed",
    inset: 0,
    background:
      "rgba(5, 20, 35, 0.65)",
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
    boxShadow:
      "0 25px 70px rgba(0,0,0,0.25)",
  },

  closeButton: {
    position: "absolute",
    top: "15px",
    left: "18px",
    border: "none",
    background: "#f1f4f7",
    width: "34px",
    height: "34px",
    borderRadius: "50%",
    fontSize: "22px",
    cursor: "pointer",
    color: "#45576b",
  },

  loginIcon: {
    fontSize: "40px",
    marginBottom: "10px",
  },

  loginTitle: {
    margin: "0",
    color: "#153b5f",
    fontSize: "27px",
    fontWeight: "900",
  },

  loginDescription: {
    color: "#7a8795",
    fontSize: "14px",
    marginBottom: "25px",
  },

  input: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #dce3ea",
    borderRadius: "9px",
    padding: "13px 15px",
    marginBottom: "12px",
    fontFamily: "inherit",
    fontSize: "14px",
    outline: "none",
    textAlign: "right",
  },

  loginButton: {
    width: "100%",
    border: "none",
    background: "#2F5BEA",
    color: "#ffffff",
    padding: "14px",
    borderRadius: "9px",
    fontFamily: "inherit",
    fontSize: "15px",
    fontWeight: "800",
    cursor: "pointer",
    marginTop: "8px",
  },
};

export default App;