'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

const NAV_LINKS = [
  { href: '/dashboard',             label: 'דשבורד'      },
  { href: '/dashboard/parents',     label: 'אנ"ש'        },
  { href: '/dashboard/students',    label: 'תלמידים'     },
  { href: '/dashboard/tuition',     label: 'שכ"ל'        },
  { href: '/dashboard/transactions',label: 'תנועות'      },
  { href: '/dashboard/salaries',    label: '💼 משכורות'  },
  { href: '/dashboard/women',       label: 'נשים'        },
  { href: '/dashboard/reports',     label: 'דוחות'       },
  { href: '/dashboard/register',    label: 'רישום תלמיד' },
  { href: '/dashboard/settings',    label: '⚙ הגדרות'   },
]


export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router   = useRouter()
  const [logoUrl, setLogoUrl]               = useState('')
  const [institutionName, setInstitutionName] = useState('בנין לדורות')
  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => {
        if (d.logo_url)        setLogoUrl(d.logo_url)
        if (d.institution_name) setInstitutionName(d.institution_name)
      })
      .catch(() => {})
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" dir="rtl">

      {/* ── Top Navbar ── */}
      <header
        className="fixed top-0 left-0 right-0 z-30 flex items-center shadow-lg select-none"
        style={{
          background: 'linear-gradient(90deg, #0d1f52 0%, #1a3a7a 100%)',
          height: 56,
        }}
      >
        {/* Logo / name */}
        <div className="flex items-center gap-2 px-4 border-l border-white/10 shrink-0" style={{ height: '100%' }}>
          {logoUrl && (
            <img src={logoUrl} alt="לוגו"
              className="h-8 w-8 object-contain rounded-lg bg-white/10 p-0.5"
            />
          )}
          <div className="text-right">
            <h1 className="text-sm font-bold leading-tight" style={{ color: '#d4a921' }}>
              {institutionName}
            </h1>
            <p className="text-[10px]" style={{ color: '#8899cc' }}>
              מערכת ניהול
            </p>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex flex-1 items-center overflow-x-auto gap-1 px-2">
          {NAV_LINKS.map(({ href, label }) => {
            const isActive = href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(href)
            return (
              <Link key={href} href={href}
                className={`flex items-center px-3 py-1.5 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${
                  isActive
                    ? 'text-[#0d1f52] font-bold shadow-sm'
                    : 'text-white/80 hover:text-white hover:bg-white/10'
                }`}
                style={isActive ? { backgroundColor: '#d4a921' } : {}}
              >
                {label}
              </Link>
            )
          })}
        </nav>

        {/* Exit */}
        <div className="px-3 shrink-0">
          <button
            onClick={() => router.push('/')}
            className="text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-white/10"
            style={{ borderColor: '#c9a22740', color: '#c9a227' }}
          >
            יציאה
          </button>
        </div>
      </header>

      {/* ── Main content ── */}
      <main
        className="flex-1 min-h-screen py-6 px-4 sm:px-6"
        style={{ marginTop: 56 }}
        dir="rtl"
      >
        {children}
      </main>
    </div>
  )
}
