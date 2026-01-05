import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Izzie2 - AI Personal Assistant',
  description: 'Intelligent personal assistant powered by AI',
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
