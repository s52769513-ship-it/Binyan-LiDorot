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

    const channel = supabase.channel('realtime-refresh-' + tableList.join('-'))

    for (const table of tableList) {
      channel.on(
        'postgres_changes' as Parameters<typeof channel.on>[0],
        { event: '*', schema: 'public', table },
        () => cb.current(),
      )
    }

    channel.subscribe()

    const onVisible = () => {
      if (document.visibilityState === 'visible') cb.current()
    }
    document.addEventListener('visibilitychange', onVisible)

    const pollId = setInterval(() => {
      if (document.visibilityState === 'visible') cb.current()
    }, POLL_INTERVAL_MS)

    return () => {
      supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', onVisible)
      clearInterval(pollId)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(Array.isArray(tables) ? tables : [tables])])
}
