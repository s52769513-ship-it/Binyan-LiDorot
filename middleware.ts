import { NextRequest, NextResponse } from 'next/server'

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Protect /dashboard and all sub-routes
  if (pathname.startsWith('/dashboard')) {
    const cookie = request.cookies.get('bl_user')
    if (!cookie || !cookie.value) {
      return NextResponse.redirect(new URL('/', request.url))
    }
    try {
      const user = JSON.parse(cookie.value)
      if (!user.email || !user.role) {
        return NextResponse.redirect(new URL('/', request.url))
      }
    } catch {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*'],
}
