import { Analytics } from '@vercel/analytics/next'
import type { Metadata, Viewport } from 'next'
import { Inter, Noto_Serif_SC } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' })
const serif = Noto_Serif_SC({
  weight: ['400', '600', '700'],
  subsets: ['latin'],
  variable: '--font-serif-sc',
  preload: false,
})

export const metadata: Metadata = {
  title: '溪棠的照片墙',
  description: '溪棠的 VRChat 照片与录像收藏馆',
  applicationName: '溪棠的照片墙',
  robots: { index: false, follow: false },
  openGraph: { title: '溪棠的照片墙', description: '溪棠的 VRChat 照片与录像收藏馆' },
  icons: {
    icon: [
      { url: '/icon-light-32x32.png', media: '(prefers-color-scheme: light)' },
      { url: '/icon-dark-32x32.png', media: '(prefers-color-scheme: dark)' },
      { url: '/icon.svg', type: 'image/svg+xml' },
    ],
    apple: '/apple-icon.png',
  },
}

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#151210',
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN" className={`${inter.variable} ${serif.variable}`}>
      <body className="grain font-sans antialiased">
        {children}
        {process.env.NODE_ENV === 'production' && <Analytics />}
      </body>
    </html>
  )
}
