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

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => {
        if (d.logo_url) setLogoUrl(d.logo_url)
        if (d.institution_name) setInstitutionName(d.institution_name)
      })
      .catch(() => {})
  }, [])

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
            {NAV_LINKS.map(({ href, label }) => {
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
            })}
          </nav>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        {children}
      </main>
    </div>
  )
}
