import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('logo') as File | null
    if (!file) return NextResponse.json({ error: 'no file' }, { status: 400 })

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const ext = file.name.split('.').pop() ?? 'png'
    const path = `logo.${ext}`

    const { error: uploadError } = await supabaseAdmin.storage
      .from('institution')
      .upload(path, buffer, {
        contentType: file.type,
        upsert: true,
      })

    if (uploadError) throw uploadError

    const { data } = supabaseAdmin.storage.from('institution').getPublicUrl(path)

    // Save URL to settings
    await supabaseAdmin
      .from('institution_settings')
      .upsert({ id: 1, logo_url: data.publicUrl }, { onConflict: 'id' })

    return NextResponse.json({ url: data.publicUrl })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
