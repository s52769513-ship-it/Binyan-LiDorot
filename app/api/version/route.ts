import { NextResponse } from 'next/server'

declare const process: { env: Record<string, string | undefined> }

// Returns the current deployment's identifier. On Vercel this is the git
// commit SHA of the deploy; it changes on every new deployment, so the client
// can detect "a newer version is live" and prompt a refresh. Falls back to a
// process-start timestamp in non-Vercel environments.
const VERSION =
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.VERCEL_DEPLOYMENT_ID ||
  `dev-${Date.now()}`

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json({ version: VERSION }, {
    headers: { 'Cache-Control': 'no-store, max-age=0' },
  })
}
