'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

const USERS = [
  { email: 'ta6054493@gmail.com', role: 'מזכירות', label: 'מזכירות' },
  { email: 't6054493@gmail.com',  role: 'הנהלה',   label: 'הנהלה' },
]

export default function LoginPage() {
  const router = useRouter()
  const [visible, setVisible] = useState(false)
  const [logoUrl, setLogoUrl] = useState('')
  const [showPicker, setShowPicker] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setVisible(true), 100)
    fetch('/api/settings').then(r => r.json()).then(d => { if (d.logo_url) setLogoUrl(d.logo_url) }).catch(() => {})
    return () => clearTimeout(t)
  }, [])

  const handleLogin = async (email: string) => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const data = await res.json()
      if (data.ok) {
        router.push('/dashboard')
      } else {
        setError(data.error ?? 'שגיאת כניסה')
        setLoading(false)
      }
    } catch {
      setError('שגיאת תקשורת')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center overflow-hidden relative"
      style={{ background: 'linear-gradient(160deg, #0a1535 0%, #12255e 40%, #0d1c4a 70%, #091330 100%)' }}
      dir="rtl">

      {/* Animated background shimmer */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        {[...Array(18)].map((_, i) => (
          <div
            key={i}
            className="absolute rounded-full opacity-10"
            style={{
              width: `${Math.random() * 3 + 1}px`,
              height: `${Math.random() * 3 + 1}px`,
              background: '#d4a921',
              left: `${(i * 5.7 + 3) % 100}%`,
              top: `${(i * 7.3 + 10) % 100}%`,
              animation: `float ${4 + (i % 5)}s ease-in-out infinite`,
              animationDelay: `${(i * 0.4) % 3}s`,
            }}
          />
        ))}
        {/* Gold rings */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full border border-[#c9a227]/10 animate-pulse" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full border border-[#c9a227]/5 animate-pulse" style={{ animationDelay: '1s' }} />
      </div>

      {/* Main card */}
      <div
        className="relative z-10 flex flex-col items-center px-8 py-10 transition-all duration-1000"
        style={{
          opacity: visible ? 1 : 0,
          transform: visible ? 'translateY(0)' : 'translateY(30px)',
        }}
      >
        {/* Logo */}
        <div className="relative mb-8">
          <div className="absolute inset-0 rounded-full blur-2xl opacity-30" style={{ background: 'radial-gradient(circle, #d4a921 0%, transparent 70%)' }} />
          {logoUrl ? (
            <div className="relative rounded-2xl p-3 shadow-2xl border-2" style={{ borderColor: '#c9a227', background: 'linear-gradient(160deg, #0f2461, #1a3880)', boxShadow: '0 0 40px rgba(201,162,39,0.3), 0 20px 60px rgba(0,0,0,0.5)' }}>
              <img src={logoUrl} alt="לוגו" className="w-48 h-48 object-contain" />
            </div>
          ) : (
            <div
              className="relative flex flex-col items-center justify-center rounded-[20px] px-10 py-8 shadow-2xl border"
              style={{
                background: 'linear-gradient(160deg, #0f2461 0%, #1a3880 50%, #0d1f57 100%)',
                borderColor: '#c9a227', borderWidth: '2px',
                boxShadow: '0 0 40px rgba(201, 162, 39, 0.3), 0 20px 60px rgba(0,0,0,0.5)',
                minWidth: '280px',
              }}
            >
              <div className="text-center mb-1" style={{ color: '#d4a921', fontSize: '11px', letterSpacing: '4px' }}>ועד</div>
              <div className="text-center font-bold leading-none mb-1" style={{ color: '#d4a921', fontSize: '52px', textShadow: '0 2px 10px rgba(212,169,33,0.5)' }}>בנין</div>
              <div className="text-center font-bold leading-none mb-3" style={{ color: '#d4a921', fontSize: '52px', textShadow: '0 2px 10px rgba(212,169,33,0.5)' }}>לדורות</div>
              <div className="w-full h-px mb-3" style={{ background: 'linear-gradient(90deg, transparent, #c9a227, transparent)' }} />
              <div className="text-center text-sm mb-1" style={{ color: '#e8c84a' }}>תולדות אברהם יצחק יצחק</div>
              <div className="text-center text-xs mb-2" style={{ color: '#b8a060' }}>כנשיאות כ&quot;ק מרן אדמו&quot;ר שליט&quot;א</div>
              <div className="flex justify-between w-full mt-1">
                <span className="text-xs" style={{ color: '#8a7040' }}>בית חינוך לבנות</span>
                <span className="text-xs" style={{ color: '#8a7040' }}>תלמוד תורה</span>
              </div>
              <div className="text-center text-xs mt-3" style={{ color: '#d4a921', letterSpacing: '2px' }}>✦ הר יזנה ✦</div>
            </div>
          )}
        </div>

        {/* System name */}
        <h1 className="text-2xl font-bold mb-1 text-center" style={{ color: '#f0e8c8' }}>
          מערכת ניהול
        </h1>
        <p className="text-sm mb-8 text-center" style={{ color: '#8899cc' }}>
          תלמוד תורה ובית חינוך לבנות
        </p>

        {/* Login area */}
        {!showPicker ? (
          // Initial "enter system" button
          <button
            onClick={() => setShowPicker(true)}
            className="w-full max-w-[280px] py-3 rounded-xl font-bold text-lg transition-all duration-200 hover:scale-105 active:scale-95"
            style={{
              background: 'linear-gradient(135deg, #c9a227 0%, #e8c84a 50%, #c9a227 100%)',
              color: '#0a1535',
              boxShadow: '0 4px 20px rgba(201,162,39,0.5)',
            }}
          >
            כניסה למערכת
          </button>
        ) : (
          // Email picker UI
          <div className="w-full max-w-[280px] space-y-3 transition-all duration-300">
            <p className="text-center text-sm font-medium" style={{ color: '#c9a9a0' }}>
              בחר/י את המשתמש שלך:
            </p>
            {USERS.map(u => (
              <button
                key={u.email}
                onClick={() => handleLogin(u.email)}
                disabled={loading}
                className="w-full py-3 px-4 rounded-xl font-bold text-base transition-all duration-200 hover:scale-105 active:scale-95 disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-between"
                style={{
                  background: 'linear-gradient(135deg, #0f2461 0%, #1a3880 100%)',
                  color: '#d4a921',
                  border: '1.5px solid #c9a227',
                  boxShadow: '0 4px 15px rgba(13,31,82,0.5)',
                }}
              >
                <span className="text-sm font-semibold">{u.label}</span>
                <span className="text-xs opacity-70">{u.email}</span>
              </button>
            ))}

            {error && (
              <p className="text-center text-xs text-red-400">{error}</p>
            )}

            <button
              onClick={() => { setShowPicker(false); setError('') }}
              className="w-full text-center text-xs underline mt-1"
              style={{ color: '#445577' }}
              disabled={loading}
            >
              חזור
            </button>
          </div>
        )}

        <p className="mt-6 text-xs" style={{ color: '#445577' }}>
          מערכת פנימית · גישה מורשית בלבד
        </p>
      </div>

      <style jsx global>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) rotate(0deg); opacity: 0.1; }
          50% { transform: translateY(-20px) rotate(180deg); opacity: 0.3; }
        }
      `}</style>
    </div>
  )
}
