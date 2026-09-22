import type { Metadata } from 'next';
import './globals.css';

const TITLE = 'CTI Product Assistant';
const DESCRIPTION =
  'Ask about CTI products and prices from the price masterlist — 1,038 items of ' +
  'workplace safety, facility and institutional equipment. Every answer quotes the ' +
  'product code and the exact listed price.';
const SITE_URL = 'https://cti-product-assistant.vercel.app';

/**
 * metadataBase is what lets Next resolve relative OG URLs; without it the
 * Open Graph block is silently dropped from the served HTML in production,
 * which is the failure mode worth avoiding here — a link preview is only
 * checkable by pasting the URL somewhere, so it fails quietly.
 */
export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: TITLE,
  description: DESCRIPTION,
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: SITE_URL,
    siteName: TITLE,
    locale: 'en_PH',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
