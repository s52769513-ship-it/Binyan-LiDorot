'use client'

import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

// Belt-and-suspenders backstop for when the Realtime WebSocket never
// delivers an event — e.g. the table isn't in the `supabase_realtime`
// publication (see REALTIME_PUBLICATION.sql), a browser extension or
// network policy blocks the WS handshake, or the connection silently drops.
// Without this, a page left open simply never learns about changes made
// elsewhere until the user manually reloads it.
const POLL_INTERVAL_MS = 15000

// מזהה ייחודי לכל מנוי. supabase.channel(name) מחזיר ערוץ *קיים* אם כבר יש
// אחד בשם הזה — וקודם השם נגזר רק מרשימת הטבלאות. לכן שני רכיבים שמאזינים
// לאותן טבלאות (או רכיב שמתרנדר מחדש לפני שהניקוי הספיק לרוץ) קיבלו את אותו
// ערוץ שכבר עבר subscribe(), והקריאה ל-.on() אחריו זרקה:
//   "cannot add `postgres_changes` callbacks ... after `subscribe()`"
// השגיאה לא נתפסה ולכן הפילה את כל המסך. שם ייחודי לכל מנוי פותר את השורש.
let channelSeq = 0

/**
 * Subscribes to Supabase Realtime changes on one or more tables.
 * Calls `onRefresh` whenever any INSERT / UPDATE / DELETE happens.
 * Also refreshes when the browser tab becomes visible again, and polls
 * periodically as a fallback in case the Realtime WebSocket isn't delivering
 * events (see POLL_INTERVAL_MS above).
 */
export function useRealtimeRefresh(
  onRefresh: () => void,
  tables: string | string[] = 'transactions',
) {
  const cb = useRef(onRefresh)
  cb.current = onRefresh   // always call the latest version

  useEffect(() => {
    const tableList = Array.isArray(tables) ? tables : [tables]

    // ערוץ נפרד לכל מנוי — לעולם לא נתפס ערוץ קיים של רכיב אחר
    const name = `realtime-refresh-${tableList.join('-')}-${++channelSeq}`
    let channel: ReturnType<typeof supabase.channel> | null = null

    // Realtime הוא שיפור, לא תלות: אם ההרשמה נכשלת (ערוץ תפוס, WebSocket חסום,
    // הרשאות) נשארים עם הפולינג ועם רענון בחזרה ללשונית — ובשום מקרה לא מפילים
    // את המסך.
    try {
      channel = supabase.channel(name)
      for (const table of tableList) {
        channel.on(
          'postgres_changes' as Parameters<typeof channel.on>[0],
          { event: '*', schema: 'public', table },
          () => cb.current(),
        )
      }
      channel.subscribe()
    } catch (err) {
      console.error('[realtime] subscribe failed, falling back to polling:', err)
      if (channel) {
        try { supabase.removeChannel(channel) } catch { /* ignore */ }
        channel = null
      }
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') cb.current()
    }
    document.addEventListener('visibilitychange', onVisible)

    const pollId = setInterval(() => {
      if (document.visibilityState === 'visible') cb.current()
    }, POLL_INTERVAL_MS)

    return () => {
      if (channel) {
        try { supabase.removeChannel(channel) } catch { /* ignore */ }
      }
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(pollId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(Array.isArray(tables) ? tables : [tables])])
}
