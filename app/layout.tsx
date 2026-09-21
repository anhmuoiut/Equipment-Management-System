import type { Metadata } from 'next';
import './globals.css';
import { PreferencesProvider } from '@/components/Preferences';

export const metadata: Metadata = {
  title: 'Jabil | SolarEdge Equipment Management',
  description: 'Test Engineering - SolarEdge workcell'
};

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
          href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body><PreferencesProvider>{children}</PreferencesProvider></body>
    </html>
  );
}
