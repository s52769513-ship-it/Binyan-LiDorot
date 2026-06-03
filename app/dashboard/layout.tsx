'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

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

const MIN_W = 160
const MAX_W = 280
const DEFAULT_W = 200

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router   = useRouter()
  const [logoUrl, setLogoUrl]               = useState('')
  const [institutionName, setInstitutionName] = useState('בנין לדורות')
  const [sideW, setSideW]                   = useState(DEFAULT_W)
  const dragging = useRef(false)
  const startX   = useRef(0)
  const startW   = useRef(0)

  useEffect(() => {
    fetch('/api/settings')
      .then(r => r.json())
      .then(d => {
        if (d.logo_url)        setLogoUrl(d.logo_url)
        if (d.institution_name) setInstitutionName(d.institution_name)
      })
      .catch(() => {})
  }, [])

  const onMouseDown = (e: React.MouseEvent) => {
    dragging.current = true
    startX.current   = e.clientX
    startW.current   = sideW
    document.body.style.cursor     = 'ew-resize'
    document.body.style.userSelect = 'none'

    const onMove = (ev: MouseEvent) => {
      if (!dragging.current) return
      // sidebar is on the right; dragging right = smaller sidebar
      const delta = startX.current - ev.clientX
      setSideW(Math.min(MAX_W, Math.max(MIN_W, startW.current + delta)))
    }
    const onUp = () => {
      dragging.current = false
      document.body.style.cursor     = ''
      document.body.style.userSelect = ''
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
    }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex" dir="rtl">

      {/* ── Sidebar ── */}
      <aside
        className="fixed top-0 right-0 h-screen z-30 flex flex-col shadow-lg select-none"
        style={{
          width: sideW,
          background: 'linear-gradient(180deg, #0d1f52 0%, #1a3a7a 100%)',
        }}
      >
        {/* Logo / name */}
        <div className="px-3 py-4 border-b border-white/10 text-right">
          {logoUrl && (
            <img src={logoUrl} alt="לוגו"
              className="h-9 w-9 object-contain rounded-lg bg-white/10 p-0.5 mb-2 mr-auto ml-auto block"
            />
          )}
          <h1 className="text-sm font-bold leading-tight truncate" style={{ color: '#d4a921' }}>
            {institutionName}
          </h1>
          <p className="text-[10px] mt-0.5 truncate" style={{ color: '#8899cc' }}>
            מערכת ניהול
          </p>
        </div>

        {/* Nav links */}
        <nav className="flex-1 overflow-y-auto py-2">
          {NAV_LINKS.map(({ href, label }) => {
            const isActive = href === '/dashboard'
              ? pathname === '/dashboard'
              : pathname.startsWith(href)
            return (
              <Link key={href} href={href}
                className={`flex items-center gap-2 px-3 py-2 mx-2 my-0.5 rounded-lg text-sm font-medium transition-all truncate ${
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
        <div className="px-3 py-3 border-t border-white/10">
          <button
            onClick={() => router.push('/')}
            className="w-full text-xs px-3 py-1.5 rounded-lg border transition-colors hover:bg-white/10 text-right"
            style={{ borderColor: '#c9a22740', color: '#c9a227' }}
          >
            יציאה
          </button>
        </div>

        {/* Resize handle – left edge */}
        <div
          onMouseDown={onMouseDown}
          className="absolute top-0 bottom-0 left-0 w-2 cursor-ew-resize group z-10"
        >
          <div className="absolute inset-y-0 left-0 w-0.5 bg-white/10 group-hover:bg-white/40 transition-colors" />
        </div>
      </aside>

      {/* ── Main content ── */}
      <main
        className="flex-1 min-h-screen py-6 px-4 sm:px-6"
        style={{ marginRight: sideW }}
        dir="rtl"
      >
        {children}
      </main>
    </div>
  )
}
