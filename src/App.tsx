import { lazy, Suspense, useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { LibraryPage } from '@/pages/LibraryPage';
import { BookDetailPage } from '@/pages/BookDetailPage';
import { FolderPage } from '@/pages/FolderPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { useLibraryStore } from '@/store/libraryStore';

const StatsPage = lazy(() => import('@/pages/StatsPage'));

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useLibraryStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;

    if (theme === 'system') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)');
      const apply = () => {
        root.classList.toggle('dark', mq.matches);
      };
      apply();
      mq.addEventListener('change', apply);
      return () => mq.removeEventListener('change', apply);
    }

    root.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  return <>{children}</>;
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <Layout>
          <Routes>
            <Route path="/" element={<LibraryPage />} />
            <Route path="/item/:id" element={<BookDetailPage />} />
            <Route path="/folder/:slug" element={<FolderPage />} />
            <Route path="/stats" element={<Suspense fallback={<div className="flex-1 flex items-center justify-center"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}><StatsPage /></Suspense>} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </Layout>
      </BrowserRouter>
    </ThemeProvider>
  );
}
