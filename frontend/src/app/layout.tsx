import './globals.css';
import type { Metadata } from 'next';
import Navbar from '@/components/Navbar';
import Sidebar from '@/components/Sidebar';
import Footer from '@/components/Footer';
import { LanguageProvider } from '@/lib/i18n';

export const metadata: Metadata = {
  title: 'IS Sarthi | मानक सारथी - AI Indian Standards Recommendation',
  description: 'AI-Powered Indian Standards (BIS) Recommendation, Allied Graph & Tender Compliance Audit',
  icons: {
    icon: '/assets/logo.png',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 flex flex-col text-slate-900 antialiased">
        <LanguageProvider>
          <Navbar />
          <div className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 flex flex-col lg:flex-row gap-4 sm:gap-6 items-start">
            <Sidebar />
            <main className="flex-1 min-w-0 w-full">{children}</main>
          </div>
          <Footer />
        </LanguageProvider>
      </body>
    </html>
  );
}
