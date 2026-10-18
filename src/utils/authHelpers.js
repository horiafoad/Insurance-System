// authHelpers.js
//
// ⚠️ ملاحظة مهمة قبل الاستخدام:
// مش عندي رؤية على كود تسجيل الدخول الحالي عندك (ملف الـ Login مش من
// ضمن الملفات اللي وصلتني)، فمش عارف بالظبط تحت أي اسم (key) بتتخزن
// بيانات المستخدم بعد تسجيل الدخول (localStorage / sessionStorage /
// Context). الدالة دي بتجرب أشهر الأسماء الشائعة كـ fallback.
//
// لو عندك مكان تاني بتخزن فيه بيانات اليوزر (مثلاً useContext أو
// useState عام)، الأسهل إنك تستبدل جسم getCurrentUser() تحت بسطر
// واحد بيرجع نفس الـ user object اللي عندك بالفعل، وسيب باقي الملف
// زي ما هو.
//
// الشكل المتوقع للـ user object (حسب جدول public.users):
// { id, username, full_name, role }  حيث role ∈ 'user' | 'admin' | 'super_admin'

const POSSIBLE_STORAGE_KEYS = [
  "currentUser",
  "user",
  "authUser",
  "loggedInUser",
  "session_user",
];

export function getCurrentUser() {
  for (const key of POSSIBLE_STORAGE_KEYS) {
    try {
      const raw =
        localStorage.getItem(key) || sessionStorage.getItem(key);

      if (!raw) continue;

      const parsed = JSON.parse(raw);

      // لو الشكل { user: {...} } بدل الشكل المباشر
      const candidate = parsed?.user || parsed;

      if (candidate && (candidate.role || candidate.username)) {
        return candidate;
      }
    } catch {
      // القيمة مش JSON صالح، تجاهلها وكمّل على المفتاح اللي بعده
      continue;
    }
  }

  return null;
}

export function isAdmin(user = getCurrentUser()) {
  if (!user) return false;
  return user.role === "admin" || user.role === "super_admin";
}

export function isSuperAdmin(user = getCurrentUser()) {
  if (!user) return false;
  return user.role === "super_admin";
}

export function currentUserLabel(user = getCurrentUser()) {
  if (!user) return "غير مسجّل دخول";
  return user.full_name || user.username || "مستخدم";
}
