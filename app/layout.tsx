import type { Metadata } from 'next'
import Footer from '@/components/footer'
import './index.css'

export const metadata: Metadata = {
  title: "robowager's blog",
  description: 'Notes of an armchair roboticist',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        {children}
        <Footer />
      </body>
    </html>
  )
}
