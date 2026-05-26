'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useRouter } from 'next/navigation'

const NAV_LINKS = [
  { href: '/dashboard',          label: 'דשבורד'      },
  { href: '/dashboard/parents',  label: 'אנ"ש'        },
  { href: '/dashboard/students', label: 'תלמידים'     },
  { href: '/dashboard/tuition',  label: 'שכ"ל'        },
  { href: '/dashboard/reports',  label: 'דוחות'       },
  { href: '/dashboard/register', label: 'רישום תלמיד' },
]

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router   = useRouter()

  return (
    <div className="min-h-screen bg-gray-50">
      <header
        className="sticky top-0 z-30 shadow-md"
        style={{ background: 'linear-gradient(90deg, #0d1f52 0%, #1a3a7a 50%, #0d1f52 100%)' }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          {/* Top row: title + logout */}
          <div className="flex items-center justify-between py-3 border-b border-white/10">
            <button
              onClick={() => router.push('/')}
              className="text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-white/10"
              style={{ borderColor: '#c9a22740', color: '#c9a227' }}
            >
              יציאה
            </button>
            <div className="text-right">
              <h1 className="text-xl font-bold leading-tight" style={{ color: '#d4a921' }}>
                בנין לדורות
              </h1>
              <p className="text-xs" style={{ color: '#8899cc' }}>
                מערכת ניהול · תלמוד תורה ובית חינוך
              </p>
            </div>
          </div>

          {/* Nav row */}
          <nav className="flex items-center gap-1 py-1.5 overflow-x-auto" dir="rtl">
            {NAV_LINKS.map(({ href, label }) => {
              const isActive =
                href === '/dashboard'
                  ? pathname === '/dashboard'
                  : pathname.startsWith(href)
              return (
                <Link
                  key={href}
                  href={href}
                  className={`
                    px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all
                    ${isActive
                      ? 'text-[#0d1f52] font-bold shadow-sm'
                      : 'text-white/80 hover:text-white hover:bg-white/10'
                    }
                  `}
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
