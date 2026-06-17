import { NextResponse } from 'next/server'

export async function POST() {
  const response = NextResponse.json({ ok: true })
  response.cookies.set('bl_user',    '', { httpOnly: true,  path: '/', maxAge: 0, sameSite: 'lax' })
  response.cookies.set('bl_user_ui', '', { httpOnly: false, path: '/', maxAge: 0, sameSite: 'lax' })
  return response
}
