import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

function getUser(request: NextRequest): { email: string; role: string } | null {
  try {
    const raw = request.cookies.get('bl_user')?.value
    if (!raw) return null
    const user = JSON.parse(raw)
    if (!user.email || !user.role) return null
    return user
  } catch {
    return null
  }
}

// GET: returns last 50 messages ordered by created_at ASC
export async function GET(request: NextRequest) {
  const user = getUser(request)
  if (!user) {
    return NextResponse.json({ error: 'לא מחובר' }, { status: 401 })
  }

  const { data, error } = await supabaseAdmin
    .from('chat_messages')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(50)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data ?? [])
}

// POST: insert a new message
export async function POST(request: NextRequest) {
  const user = getUser(request)
  if (!user) {
    return NextResponse.json({ error: 'לא מחובר' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const { message } = body

    if (!message || typeof message !== 'string' || !message.trim()) {
      return NextResponse.json({ error: 'הודעה ריקה' }, { status: 400 })
    }

    const { data, error } = await supabaseAdmin
      .from('chat_messages')
      .insert({
        from_email: user.email,
        from_role: user.role,
        message: message.trim(),
        read_by: [user.email],
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json(data)
  } catch {
    return NextResponse.json({ error: 'שגיאת שרת' }, { status: 500 })
  }
}

// PATCH: mark all unread messages as read by current user
export async function PATCH(request: NextRequest) {
  const user = getUser(request)
  if (!user) {
    return NextResponse.json({ error: 'לא מחובר' }, { status: 401 })
  }

  let messageId: string | undefined
  try {
    const body = await request.json().catch(() => ({}))
    messageId = (body as { messageId?: string })?.messageId
  } catch {
    // no body, mark all as read
  }

  if (messageId) {
    // Mark specific message as read
    const { data: msg } = await supabaseAdmin
      .from('chat_messages')
      .select('read_by')
      .eq('id', messageId)
      .single()

    if (msg) {
      const readBy: string[] = msg.read_by ?? []
      if (!readBy.includes(user.email)) {
        await supabaseAdmin
          .from('chat_messages')
          .update({ read_by: [...readBy, user.email] })
          .eq('id', messageId)
      }
    }
  } else {
    // Mark ALL unread messages as read for this user
    const { data: unread } = await supabaseAdmin
      .from('chat_messages')
      .select('id, read_by')
      .not('read_by', 'cs', `{"${user.email}"}`)

    if (unread && unread.length > 0) {
      for (const msg of unread) {
        const readBy: string[] = msg.read_by ?? []
        if (!readBy.includes(user.email)) {
          await supabaseAdmin
            .from('chat_messages')
            .update({ read_by: [...readBy, user.email] })
            .eq('id', msg.id)
        }
      }
    }
  }

  return NextResponse.json({ ok: true })
}
