import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'CTI Product Assistant',
  description: 'Ask about CTI products and prices from the price masterlist.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
