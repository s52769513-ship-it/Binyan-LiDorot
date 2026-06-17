'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

interface ChatMessage {
  id: string
  from_email: string
  from_role: string
  message: string
  created_at: string
  read_by: string[]
}

function formatTime(isoString: string): string {
  try {
    const d = new Date(isoString)
    return d.toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })
  } catch {
    return ''
  }
}

// Soft notification chime (two ascending tones)
function playNotificationSound() {
  try {
    const ctx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)()

    const play = (freq: number, startAt: number, duration: number, vol: number) => {
      const osc  = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, ctx.currentTime + startAt)
      gain.gain.setValueAtTime(0, ctx.currentTime + startAt)
      gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + startAt + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + startAt + duration)
      osc.start(ctx.currentTime + startAt)
      osc.stop(ctx.currentTime + startAt + duration)
    }

    // First note then second note — pleasant ding-dong
    play(880, 0,    0.35, 0.35)   // A5
    play(1047, 0.2, 0.45, 0.28)  // C6

    setTimeout(() => ctx.close(), 1000)
  } catch {
    // AudioContext not supported — silent fail
  }
}

export default function ChatPanel() {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [currentUser, setCurrentUser] = useState<{ email: string; role: string } | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const prevMsgIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    fetch('/api/auth/me').then(r => r.json()).then(u => setCurrentUser(u ?? null)).catch(() => {})
  }, [])

  const fetchMessages = useCallback(async (isOpen: boolean) => {
    try {
      const res = await fetch('/api/chat')
      if (!res.ok) return
      const data: ChatMessage[] = await res.json()

      // Detect NEW incoming messages from the other person → play sound + bounce
      if (currentUser) {
        const newFromOther = data.filter(
          m => m.from_email !== currentUser.email && !prevMsgIdsRef.current.has(m.id)
        )
        if (newFromOther.length > 0 && prevMsgIdsRef.current.size > 0) {
          playNotificationSound()
        }
        // Update known IDs
        data.forEach(m => prevMsgIdsRef.current.add(m.id))

        const unread = data.filter(m => !m.read_by.includes(currentUser.email)).length
        setUnreadCount(isOpen ? 0 : unread)
      }

      setMessages(data)
    } catch {
      // ignore
    }
  }, [currentUser?.email]) // eslint-disable-line react-hooks/exhaustive-deps

  const markAllRead = useCallback(async () => {
    try {
      await fetch('/api/chat', { method: 'PATCH' })
      setUnreadCount(0)
      setMessages(prev =>
        prev.map(m =>
          currentUser && !m.read_by.includes(currentUser.email)
            ? { ...m, read_by: [...m.read_by, currentUser.email] }
            : m
        )
      )
    } catch {
      // ignore
    }
  }, [currentUser?.email]) // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to bottom when messages change or panel opens
  useEffect(() => {
    if (open) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
      }, 50)
    }
  }, [messages, open])

  // When panel opens: fetch + mark read
  useEffect(() => {
    if (open) {
      fetchMessages(true).then(() => markAllRead())
    }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-fetch once we know who the user is (poll might have run before auth loaded)
  useEffect(() => {
    if (currentUser) fetchMessages(open)
  }, [currentUser]) // eslint-disable-line react-hooks/exhaustive-deps

  // Poll every 5 seconds
  useEffect(() => {
    fetchMessages(false)
    pollRef.current = setInterval(() => {
      setOpen(cur => {
        fetchMessages(cur)
        return cur
      })
    }, 5000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const sendMessage = async () => {
    if (!input.trim() || sending) return
    setSending(true)
    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: input.trim() }),
      })
      if (res.ok) {
        setInput('')
        await fetchMessages(true)
        await markAllRead()
      }
    } catch {
      // ignore
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  if (!currentUser) return null

  const hasBounce = unreadCount > 0 && !open

  return (
    <>
      <style>{`
        @keyframes chat-bounce {
          0%, 100% { transform: translateY(0) scale(1); }
          20%       { transform: translateY(-10px) scale(1.08); }
          40%       { transform: translateY(-4px) scale(1.03); }
          60%       { transform: translateY(-7px) scale(1.06); }
          80%       { transform: translateY(-2px) scale(1.01); }
        }
        @keyframes chat-ring {
          0%   { transform: scale(1);   opacity: 0.7; }
          100% { transform: scale(2.2); opacity: 0;   }
        }
      `}</style>

      {/* Floating trigger button */}
      <div className="fixed bottom-5 left-5 z-[80]">
        {/* Pulsing ring when unread */}
        {hasBounce && (
          <span
            className="absolute inset-0 rounded-full pointer-events-none"
            style={{
              background: '#ef4444',
              animation: 'chat-ring 1.2s ease-out infinite',
            }}
          />
        )}
        <button
          onClick={() => {
            setOpen(o => {
              if (!o) setTimeout(() => markAllRead(), 200)
              return !o
            })
          }}
          className="relative w-14 h-14 rounded-full flex items-center justify-center shadow-xl transition-transform hover:scale-105 active:scale-95"
          style={{
            background: 'linear-gradient(135deg, #0d1f52 0%, #1a3a7a 100%)',
            border: hasBounce ? '2px solid #ef4444' : '2px solid #d4a921',
            boxShadow: hasBounce
              ? '0 4px 20px rgba(239,68,68,0.5)'
              : '0 4px 20px rgba(13,31,82,0.5)',
            animation: hasBounce ? 'chat-bounce 1.4s ease-in-out infinite' : 'none',
          }}
          title="צ'אט פנימי"
        >
          <span className="text-2xl leading-none">{hasBounce ? '🔔' : '💬'}</span>
          {unreadCount > 0 && (
            <span
              className="absolute -top-1 -right-1 min-w-[20px] h-5 rounded-full flex items-center justify-center text-[11px] font-bold text-white px-1"
              style={{ background: '#ef4444' }}
            >
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </div>

      {/* Chat panel */}
      {open && (
        <div
          className="fixed bottom-24 left-5 z-[80] flex flex-col rounded-2xl shadow-2xl overflow-hidden"
          style={{
            width: 360,
            height: 480,
            background: '#fff',
            border: '2px solid #d4a921',
            boxShadow: '0 8px 40px rgba(13,31,82,0.25)',
          }}
          dir="rtl"
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, #0d1f52 0%, #1a3a7a 100%)',
              borderBottom: '2px solid #d4a921',
            }}
          >
            <div className="flex items-center gap-2">
              <span className="text-lg">💬</span>
              <div>
                <div className="text-sm font-bold text-white">צ&apos;אט פנימי</div>
                <div className="text-[10px]" style={{ color: '#d4a921' }}>
                  {currentUser.role}
                </div>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="w-7 h-7 flex items-center justify-center rounded-full text-white hover:bg-white/20 transition-colors text-lg font-bold"
            >
              ×
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
            {messages.length === 0 ? (
              <div className="flex items-center justify-center h-full text-gray-400 text-sm">
                אין הודעות עדיין
              </div>
            ) : (
              messages.map(msg => {
                const isMe = msg.from_email === currentUser.email
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}
                  >
                    <div className="text-[10px] mb-0.5 px-1" style={{ color: '#8899cc' }}>
                      {isMe ? 'אני' : msg.from_role} · {formatTime(msg.created_at)}
                    </div>
                    <div
                      className="max-w-[80%] rounded-2xl px-3 py-2 text-sm break-words leading-relaxed"
                      style={
                        isMe
                          ? {
                              background: 'linear-gradient(135deg, #0d1f52, #1a3a7a)',
                              color: '#fff',
                              borderBottomRightRadius: 4,
                            }
                          : {
                              background: '#f1f3f8',
                              color: '#1a1a2e',
                              borderBottomLeftRadius: 4,
                            }
                      }
                    >
                      {msg.message}
                    </div>
                  </div>
                )
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div
            className="flex items-center gap-2 px-3 py-3 flex-shrink-0"
            style={{ borderTop: '1px solid #e5e7eb', background: '#f9fafb' }}
          >
            <input
              type="text"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="כתוב הודעה..."
              className="flex-1 rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-[#1a3a7a] transition-colors"
              style={{ direction: 'rtl' }}
              disabled={sending}
              autoFocus
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || sending}
              className="w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
              style={{ background: 'linear-gradient(135deg, #d4a921, #e8c84a)', color: '#0d1f52' }}
              title="שלח"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2 21l21-9L2 3v7l15 2-15 2v7z" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </>
  )
}
