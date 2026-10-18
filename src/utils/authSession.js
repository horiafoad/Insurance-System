// إدارة توكن الجلسة الموقّع (يُصدَّر من الخادم في auth-login).
const TOKEN_KEY = "auth_session_token";

export function getSessionToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || "";
  } catch {
    return "";
  }
}

export function setSessionToken(token) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // ignore
  }
}

export function clearSessionToken() {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // ignore
  }
}

export function sessionHeaders() {
  const token = getSessionToken();
  return { "x-session-token": token || "" };
}