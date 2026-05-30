'use client'

import { useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Subscribes to Supabase Realtime changes on one or more tables.
 * Calls `onRefresh` whenever any INSERT / UPDATE / DELETE happens.
 * Also refreshes when the browser tab becomes visible again.
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

    return () => {
      supabase.removeChannel(channel)
      document.removeEventListener('visibilitychange', onVisible)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(Array.isArray(tables) ? tables : [tables])])
}
