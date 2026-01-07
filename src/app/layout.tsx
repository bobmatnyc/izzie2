import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Izzie - AI Personal Assistant',
  description: 'Intelligent personal assistant powered by AI',
  icons: {
    icon: '/favicon.svg',
    apple: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
