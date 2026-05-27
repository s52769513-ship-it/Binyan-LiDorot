import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const revalidate = 3600  // re-fetch logo URL at most once/hour

export async function GET() {
  try {
    const { data } = await supabaseAdmin
      .from('institution_settings')
      .select('logo_url')
      .single()

    if (data?.logo_url) {
      // Redirect to the actual logo URL stored in Supabase
      return NextResponse.redirect(data.logo_url)
    }
  } catch {
    // fall through to default
  }

  // Fallback: return a simple favicon SVG with the institution initials
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
    <rect width="32" height="32" rx="6" fill="#1a3a7a"/>
    <text x="16" y="22" font-family="Arial, sans-serif" font-size="18" font-weight="bold"
      fill="white" text-anchor="middle">ב</text>
  </svg>`

  return new NextResponse(svg, {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=3600',
    },
  })
}
