import type { Metadata } from 'next'
import { Heebo } from 'next/font/google'
import './globals.css'

const heebo = Heebo({
  subsets: ['hebrew', 'latin'],
  variable: '--font-heebo',
})

export const metadata: Metadata = {
  title: 'בנין לדורות – מערכת ניהול',
  description: 'מערכת ניהול תלמוד תורה ובית חינוך',
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} h-full`}>
      <body className="min-h-full font-sans antialiased">{children}</body>
    </html>
  )
}
