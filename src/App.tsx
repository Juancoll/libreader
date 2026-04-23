import { lazy, Suspense, useCallback, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { LibraryPage } from '@/pages/LibraryPage';
import { BookDetailPage } from '@/pages/BookDetailPage';
import { FolderPage } from '@/pages/FolderPage';
import { SettingsPage } from '@/pages/SettingsPage';
import { ImportPage } from '@/pages/ImportPage';
import { useLibraryStore } from '@/store/libraryStore';
import { useBackButton } from '@/hooks/useBackButton';
import { AIChatPanel, AIChatButton } from '@/components/chat/AIChatPanel';

const StatsPage = lazy(() => import('@/pages/StatsPage'));

function ThemeProvider({ children }: { children: React.ReactNode }) {
  const theme = useLibraryStore((s) => s.theme);

  useEffect(() => {
    const root = document.documentElement;

    // Clear all theme classes first
    root.classList.remove('dark', 'eink');

    if (theme === 'eink') {
      root.classList.add('eink');
      return;
    }

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

/**
 * App-level Android back button handler.
 * Navigates back in history, or minimizes the app if at the root route.
 * This is the lowest-priority handler — readers override it via useReaderKeyboard.
 */
function AppBackButton() {
  const navigate = useNavigate();
  const location = useLocation();

  const handleBack = useCallback(() => {
    if (location.pathname === '/') {
      // At root — minimize the app (Tauri) or do nothing (web)
      import('@tauri-apps/plugin-process').then(({ exit }) => exit(0)).catch(() => {});
    } else {
      navigate(-1);
    }
  }, [location.pathname, navigate]);

  useBackButton(handleBack);

  return null;
}

export default function App() {
  return (
    <ThemeProvider>
      <BrowserRouter>
        <AppBackButton />
        <Layout>
          <Routes>
            <Route path="/" element={<LibraryPage />} />
            <Route path="/item/:id" element={<BookDetailPage />} />
            <Route path="/folder/:slug" element={<FolderPage />} />
            <Route path="/stats" element={<Suspense fallback={<div className="flex-1 flex items-center justify-center"><div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}><StatsPage /></Suspense>} />
            <Route path="/import" element={<ImportPage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Routes>
        </Layout>
        <AIChatButton />
        <AIChatPanel />
      </BrowserRouter>
    </ThemeProvider>
  );
}
