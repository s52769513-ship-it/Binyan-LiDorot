import { NextResponse } from 'next/server'
import { Client } from 'pg'
import fs from 'fs'
import path from 'path'

export const runtime = 'nodejs'

export async function POST() {
  const dbUrl = process.env.SUPABASE_DB_URL
  if (!dbUrl || dbUrl.includes('[YOUR-DB-PASSWORD]')) {
    return NextResponse.json(
      {
        error:
          'יש להגדיר SUPABASE_DB_URL ב-.env.local\n' +
          'Supabase → Settings → Database → Connection String → URI (Transaction pooler)',
      },
      { status: 400 }
    )
  }

  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  })

  try {
    await client.connect()

    const schemaPath = path.join(process.cwd(), 'lib', 'schema.sql')
    const fullSql = fs.readFileSync(schemaPath, 'utf-8')

    // Remove single-line comments, then split on semicolons
    const statements = fullSql
      .replace(/--[^\n]*/g, '')
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 10)

    const results: { ok: boolean; preview: string; error?: string }[] = []

    for (const stmt of statements) {
      try {
        await client.query(stmt)
        results.push({ ok: true, preview: stmt.slice(0, 80).replace(/\s+/g, ' ') })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        // "already exists" errors are not real failures
        const isAlreadyExists = msg.includes('already exists')
        results.push({
          ok: isAlreadyExists,
          preview: stmt.slice(0, 80).replace(/\s+/g, ' '),
          error: isAlreadyExists ? undefined : msg,
        })
      }
    }

    const failed = results.filter(r => !r.ok)

    return NextResponse.json({
      success: failed.length === 0,
      total: results.length,
      failed: failed.length,
      results,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    )
  } finally {
    await client.end().catch(() => {})
  }
}

export async function GET() {
  return NextResponse.json({
    usage: 'POST /api/setup – מריץ את lib/schema.sql מול Supabase',
    requires: 'SUPABASE_DB_URL ב-.env.local',
  })
}
