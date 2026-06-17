import { NextRequest, NextResponse } from 'next/server'

const ALLOWED_USERS: Record<string, string> = {
  'ta6054493@gmail.com': 'מזכירות',
  't6054493@gmail.com': 'הנהלה',
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { email } = body

    if (!email || typeof email !== 'string') {
      return NextResponse.json({ ok: false, error: 'נדרש אימייל' }, { status: 400 })
    }

    const role = ALLOWED_USERS[email.toLowerCase().trim()]
    if (!role) {
      return NextResponse.json({ ok: false, error: 'אימייל לא מורשה' }, { status: 403 })
    }

    const userData = JSON.stringify({ email: email.toLowerCase().trim(), role })

    const response = NextResponse.json({ ok: true, role })
    response.cookies.set('bl_user', userData, {
      httpOnly: true,
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days
      sameSite: 'lax',
    })

    return response
  } catch {
    return NextResponse.json({ ok: false, error: 'שגיאת שרת' }, { status: 500 })
  }
}
