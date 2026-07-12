// מחזיר header עם המייל של המשתמש המחובר (מ-localStorage) כדי שהשרת ידע מי
// ביצע את הפעולה - בעיקר לתיעוד "מי מחק" באשפה. בטוח לשימוש בצד לקוח בלבד.
export function authHeaders(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  const email = localStorage.getItem('auth_email')
  return email ? { 'x-auth-email': email } : {}
}
