import type { Metadata, Viewport } from 'next';
import './globals.css';
import './brand.css';
import { PreferencesProvider } from '@/components/Preferences';

export const metadata: Metadata = {
  title: 'Jabil | SolarEdge Equipment Management',
  description: 'Test Engineering - SolarEdge workcell'
};

/**
 * `resizes-content`: when the on-screen keyboard opens, the page (and the fixed
 * bottom bars of the Detail Panel) shrink above it instead of hiding behind it
 * (Chrome / Android; iOS Safari ignores it). Zoom stays allowed.
 */
export const viewport: Viewport = { width: 'device-width', initialScale: 1, interactiveWidget: 'resizes-content' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `try { const theme = localStorage.getItem('equipment-theme'); const language = localStorage.getItem('equipment-language'); document.documentElement.dataset.theme = theme === 'dark' ? 'dark' : 'light'; document.documentElement.lang = language === 'vi' ? 'vi' : 'en'; } catch {}` }} />
        {/* Nạp qua <link> thay vì next/font để build không phụ thuộc mạng.
            IBM Plex được thiết kế cho ngữ cảnh kỹ thuật — chọn có chủ đích,
            không phải font mặc định. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body><PreferencesProvider>{children}</PreferencesProvider></body>
    </html>
  );
}
