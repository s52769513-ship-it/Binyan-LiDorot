import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

const BUCKET = 'receipts'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'no file' }, { status: 400 })

    const bytes  = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const ext    = file.name.split('.').pop() ?? 'bin'
    const path   = `${crypto.randomUUID()}.${ext}`
    const contentType = file.type || 'application/octet-stream'

    let { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType })

    // First upload ever — bucket doesn't exist yet. Create it once and retry.
    if (uploadError && /bucket.*not.*found/i.test(uploadError.message)) {
      await supabaseAdmin.storage.createBucket(BUCKET, { public: true })
      ;({ error: uploadError } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(path, buffer, { contentType }))
    }
    if (uploadError) throw uploadError

    const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path)
    return NextResponse.json({ url: data.publicUrl, name: file.name })
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
