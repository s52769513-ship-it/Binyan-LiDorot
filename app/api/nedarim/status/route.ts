import { NextResponse } from 'next/server'
import { MOSAD_ID, API_PASS, USING_API_KEY } from '@/lib/nedarim'

export const dynamic = 'force-dynamic'

/**
 * GET /api/nedarim/status
 * בדיקת בריאות לחיבור מול נדרים: אילו פרטי אימות בשימוש בפועל (בלי לחשוף את
 * הסוד עצמו) והאם קריאה אמיתית ל-API מצליחה איתם. משמש כדי לוודא שהמפתח החדש
 * נקלט לפני שהאימות הישן ייחסם.
 */
export async function GET() {
  const url = `https://matara.pro/nedarimplus/Reports/Masav3.aspx?Action=GetMasavKevaNew&MosadId=${MOSAD_ID}&ApiPassword=${API_PASS}`
  const started = Date.now()
  try {
    const res = await fetch(url, { cache: 'no-store' })
    const raw = await res.text()
    let ok = false
    let detail = ''
    try {
      const json = JSON.parse(raw)
      const isError = json.Result != null && json.Result !== 0
      ok = res.ok && !isError && Array.isArray(json.data)
      detail = isError
        ? `נדרים: ${json.Message ?? json.Result}`
        : Array.isArray(json.data) ? `התקבלו ${json.data.length} רשומות` : 'תשובה ללא רשימת נתונים'
    } catch {
      detail = `תשובה שאינה JSON (${raw.slice(0, 120)})`
    }
    return NextResponse.json({
      ok,
      usingApiKey: USING_API_KEY,
      credential: USING_API_KEY ? 'NEDARIM_API_KEY (מפתח חדש)' : 'ApiPassword ישן',
      mosadId: MOSAD_ID,
      httpStatus: res.status,
      ms: Date.now() - started,
      detail,
    })
  } catch (err) {
    return NextResponse.json({
      ok: false,
      usingApiKey: USING_API_KEY,
      credential: USING_API_KEY ? 'NEDARIM_API_KEY (מפתח חדש)' : 'ApiPassword ישן',
      mosadId: MOSAD_ID,
      ms: Date.now() - started,
      detail: String((err as { message?: string })?.message ?? err),
    }, { status: 500 })
  }
}
