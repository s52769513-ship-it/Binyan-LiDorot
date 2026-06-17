import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  try {
    const raw = request.cookies.get('bl_user')?.value
    if (!raw) return NextResponse.json(null)
    const user = JSON.parse(raw)
    if (!user.email || !user.role) return NextResponse.json(null)
    return NextResponse.json({ email: user.email, role: user.role })
  } catch {
    return NextResponse.json(null)
  }
}
