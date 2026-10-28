import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ApiDot - Test and debug any API, anywhere',
  description: 'Test and debug any API, anywhere — from localhost to production',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-neutral-950 text-neutral-100 antialiased font-sans">
        {children}
      </body>
    </html>
  );
}
