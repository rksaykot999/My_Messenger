import type {Metadata} from 'next';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { SettingsProvider } from '@/contexts/SettingsContext';
import { Toaster } from '@/components/ui/toaster';

export const metadata: Metadata = {
  title: 'My Messenger',
  description: 'Professional real-time messaging for teams and friends',
};

// Runs before React hydrates so the correct theme is applied immediately
// (no flash of the wrong theme on reload for users who picked "dark").
const THEME_INIT_SCRIPT = `
(function () {
  try {
    var raw = window.localStorage.getItem('my-messenger:settings');
    var theme = raw ? (JSON.parse(raw).theme || 'system') : 'system';
    var systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    var dark = theme === 'dark' || (theme === 'system' && systemDark);
    document.documentElement.classList.toggle('dark', dark);
  } catch (e) {}
})();
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap" rel="stylesheet" />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="font-body antialiased selection:bg-accent/20" suppressHydrationWarning>
        <AuthProvider>
          <SettingsProvider>
            {children}
            <Toaster />
          </SettingsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
