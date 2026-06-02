'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

const NAV_LINKS = [
  { href: '/dashboard',          label: 'דשבורד'      },
  { href: '/dashboard/parents',  label: 'אנ"ש'        },
  { href: '/dashboard/students', label: 'תלמידים'     },
  { href: '/dashboard/tuition',       label: 'שכ"ל'        },
  { href: '/dashboard/transactions',  label: 'תנועות'      },
  { href: '/dashboard/salaries',      label: '💼 משכורות'  },
  { href: '/dashboard/women',         label: 'נשים'         },
  { href: '/dashboard/reports',    label: 'דוחות'       },
  { href: '/dashboard/register', label: 'רישום תלמיד' },
  { href: '/dashboard/settings', label: '⚙ הגדרות'   },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router   = useRouter()
  const [logoUrl, setLogoUrl] = useState('')
  const [institutionName, setInstitutionName] = useState('בנין לדורות')
  const [navPosition, setNavPosition] = useState<'top' | 'side'>('top')

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => {
        if (d.logo_url) setLogoUrl(d.logo_url)
        if (d.institution_name) setInstitutionName(d.institution_name)
        if (d.nav_position === 'side') setNavPosition('side')
      })
      .catch(() => {})
  }, [])

  const navLinks = NAV_LINKS.map(({ href, label }) => {
    const isActive = href === '/dashboard'
      ? pathname === '/dashboard'
      : pathname.startsWith(href)
    return (
      <Link key={href} href={href}
        className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
          isActive ? 'text-[#0d1f52] font-bold shadow-sm' : 'text-white/80 hover:text-white hover:bg-white/10'
        }`}
        style={isActive ? { backgroundColor: '#d4a921' } : {}}
      >
        {label}
      </Link>
    )
  })

  if (navPosition === 'side') {
    return (
      <div className="min-h-screen bg-gray-50 flex" dir="rtl">
        {/* Sidebar */}
        <aside
          className="w-56 min-h-screen sticky top-0 self-start flex-shrink-0 flex flex-col shadow-lg z-30"
          style={{ background: 'linear-gradient(180deg, #0d1f52 0%, #1a3a7a 100%)', height: '100vh' }}
        >
          {/* Logo + name */}
          <div className="flex items-center gap-2.5 px-4 py-4 border-b border-white/10">
            {logoUrl && (
              <img src={logoUrl} alt="לוגו" className="h-9 w-9 object-contain rounded-lg bg-white/10 p-0.5 flex-shrink-0" />
            )}
            <div className="min-w-0">
              <p className="text-sm font-bold leading-tight truncate" style={{ color: '#d4a921' }}>{institutionName}</p>
              <p className="text-xs truncate" style={{ color: '#8899cc' }}>מערכת ניהול</p>
            </div>
          </div>

          {/* Nav links */}
          <nav className="flex-1 flex flex-col gap-0.5 px-2 py-3 overflow-y-auto">
            {NAV_LINKS.map(({ href, label }) => {
              const isActive = href === '/dashboard'
                ? pathname === '/dashboard'
                : pathname.startsWith(href)
              return (
                <Link key={href} href={href}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition-all text-right ${
                    isActive ? 'text-[#0d1f52] font-bold shadow-sm' : 'text-white/80 hover:text-white hover:bg-white/10'
                  }`}
                  style={isActive ? { backgroundColor: '#d4a921' } : {}}
                >
                  {label}
                </Link>
              )
            })}
          </nav>

          {/* Exit */}
          <div className="px-2 py-3 border-t border-white/10">
            <button
              onClick={() => router.push('/')}
              className="w-full text-xs px-3 py-2 rounded-lg border text-right transition-colors hover:bg-white/10"
              style={{ borderColor: '#c9a22740', color: '#c9a227' }}
            >
              יציאה ←
            </button>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 px-4 sm:px-6 py-6 min-w-0">
          {children}
        </main>
      </div>
    )
  }

  // Top navigation (default)
  return (
    <div className="min-h-screen bg-gray-50">
      <header
        className="sticky top-0 z-30 shadow-md"
        style={{ background: 'linear-gradient(90deg, #0d1f52 0%, #1a3a7a 50%, #0d1f52 100%)' }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          {/* Top row */}
          <div className="flex items-center justify-between py-2.5 border-b border-white/10">
            <button
              onClick={() => router.push('/')}
              className="text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-white/10"
              style={{ borderColor: '#c9a22740', color: '#c9a227' }}
            >
              יציאה
            </button>

            <div className="flex items-center gap-3">
              <div className="text-right">
                <h1 className="text-lg font-bold leading-tight" style={{ color: '#d4a921' }}>
                  {institutionName}
                </h1>
                <p className="text-xs" style={{ color: '#8899cc' }}>
                  מערכת ניהול · תלמוד תורה ובית חינוך
                </p>
              </div>
              {logoUrl && (
                <img
                  src={logoUrl}
                  alt="לוגו"
                  className="h-10 w-10 object-contain rounded-lg bg-white/10 p-0.5"
                />
              )}
            </div>
          </div>

          {/* Nav */}
          <nav className="flex items-center gap-1 py-1.5 overflow-x-auto" dir="rtl">
            {navLinks}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {children}
      </main>
    </div>
  )
}
