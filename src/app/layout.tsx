import type { Metadata, Viewport } from 'next';
import { Sora } from 'next/font/google';
import './globals.css';

const sora = Sora({
  subsets: ['latin'],
  variable: '--font-sora',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'VOIDSPACE',
  description: 'A place to think, focus & explore. Capture thoughts, run focus sessions and take short creative breaks — all stored privately on your device.',
  applicationName: 'VOIDSPACE',
};

export const viewport: Viewport = {
  themeColor: '#080c19',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={sora.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
