/**
 * E2E tests for LibReader application.
 *
 * These tests cover the app UI, navigation, and settings.
 * Since the app requires File System Access API to load vault data,
 * tests focus on pre-vault UI and navigation flows.
 */
import { test, expect } from '@playwright/test';

test.describe('Application shell', () => {
  test('loads and shows the welcome screen', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText('Bienvenido a LibReader')).toBeVisible();
    await expect(
      page.getByText('Selecciona tu vault de Obsidian')
    ).toBeVisible();
  });

  test('shows the "Abrir Vault" button', async ({ page }) => {
    await page.goto('/');
    const btn = page.getByRole('button', { name: /Abrir Vault/i });
    await expect(btn).toBeVisible();
  });

  test('shows privacy notice', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByText(/No se sube nada/)).toBeVisible();
  });

  test('has the LibReader brand in sidebar', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    // Target the sidebar h1 specifically
    await expect(page.locator('aside h1').filter({ hasText: 'LibReader' })).toBeVisible();
  });
});

test.describe('Navigation', () => {
  test('sidebar navigation links work', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');

    // Navigate to Autores (dynamic folder link)
    await page.getByRole('link', { name: 'Autores' }).click();
    await expect(page).toHaveURL('/folder/authors');

    // Navigate to Settings
    await page.getByRole('link', { name: 'Ajustes' }).click();
    await expect(page).toHaveURL('/settings');

    // Navigate back to Library
    await page.getByRole('link', { name: 'Biblioteca' }).click();
    await expect(page).toHaveURL('/');
  });

  test('mobile hamburger menu opens sidebar', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // Sidebar should have the translate class making it off-screen
    const sidebar = page.locator('aside');
    await expect(sidebar).toHaveClass(/-translate-x-full/);

    // Click hamburger to open
    const menuButton = page.locator('header button').first();
    await menuButton.click();

    // Sidebar should now have translate-x-0 (no negative translate)
    await expect(sidebar).toHaveClass(/translate-x-0/);
  });
});

test.describe('Settings page', () => {
  test('displays settings page content', async ({ page }) => {
    await page.goto('/settings');
    // Use heading role to distinguish from nav link
    await expect(page.getByRole('heading', { name: 'Ajustes' })).toBeVisible();
    await expect(page.getByText('Vault de Obsidian')).toBeVisible();
    await expect(page.getByText('Carpetas del Vault')).toBeVisible();
    await expect(page.getByText('Apariencia')).toBeVisible();
  });

  test('shows vault connection status as disconnected', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByText('Desconectado')).toBeVisible();
  });

  test('shows about section with version', async ({ page }) => {
    await page.goto('/settings');
    await expect(page.getByText('LibReader v0.1.0')).toBeVisible();
    await expect(page.getByText(/EPUB, PDF, CBZ, CBR/)).toBeVisible();
  });

  test('vault directory inputs have correct defaults', async ({ page }) => {
    await page.goto('/settings');
    // Dynamic folder rows: each has name + path inputs + showInMenu/showInLibrary checkboxes
    await expect(page.locator('input[value="Libros"]')).toBeVisible();
    await expect(page.locator('input[value="books"]')).toBeVisible();
    await expect(page.locator('input[value="Comics"]')).toBeVisible();
    await expect(page.locator('input[value="comics"]')).toBeVisible();
    // Autores folder is now a regular folder row
    await expect(page.locator('input[value="Autores"]')).toBeVisible();
    await expect(page.locator('input[value="authors"]')).toBeVisible();
  });

  test('theme buttons are visible and clickable', async ({ page }) => {
    await page.goto('/settings');
    // Scope to main content area to avoid sidebar theme button
    const main = page.getByRole('main');
    const lightBtn = main.getByRole('button', { name: 'Claro' });
    const darkBtn = main.getByRole('button', { name: 'Oscuro' });
    const systemBtn = main.getByRole('button', { name: 'Sistema' });

    await expect(lightBtn).toBeVisible();
    await expect(darkBtn).toBeVisible();
    await expect(systemBtn).toBeVisible();
  });

  test('switching to dark theme applies dark class', async ({ page }) => {
    await page.goto('/settings');
    // Scope to main to avoid hitting sidebar button
    await page.getByRole('main').getByRole('button', { name: 'Oscuro' }).click();

    // Check that the html element has the 'dark' class
    const htmlClasses = await page.locator('html').getAttribute('class');
    expect(htmlClasses).toContain('dark');
  });

  test('switching to light theme removes dark class', async ({ page }) => {
    await page.goto('/settings');
    const main = page.getByRole('main');
    // First set dark
    await main.getByRole('button', { name: 'Oscuro' }).click();
    // Then set light
    await main.getByRole('button', { name: 'Claro' }).click();

    const htmlClasses = await page.locator('html').getAttribute('class');
    expect(htmlClasses).not.toContain('dark');
  });

  test('can modify vault directory config', async ({ page }) => {
    await page.goto('/settings');
    // The folder rows are inside the "Carpetas del Vault" section
    // Find the path input with value "books" and modify it
    const booksPathInput = page.locator('input').nth(1); // 0=name "Libros", 1=path "books"
    await expect(booksPathInput).toHaveValue('books');
    await booksPathInput.fill('libros');
    await expect(booksPathInput).toHaveValue('libros');
  });
});

test.describe('Theme toggle in sidebar', () => {
  test('sidebar theme toggle cycles through modes', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');

    // Initially "Sistema" (default)
    const themeButton = page.locator('aside button').filter({ hasText: /Claro|Oscuro|Sistema/ });
    await expect(themeButton).toContainText('Sistema');

    // Click to cycle to "Claro"
    await themeButton.click();
    await expect(themeButton).toContainText('Claro');

    // Click to cycle to "Oscuro"
    await themeButton.click();
    await expect(themeButton).toContainText('Oscuro');

    // Click to cycle back to "Sistema"
    await themeButton.click();
    await expect(themeButton).toContainText('Sistema');
  });
});

test.describe('Folder page', () => {
  test('displays folder page for Autores without vault', async ({ page }) => {
    await page.goto('/folder/authors');
    await expect(page).toHaveURL('/folder/authors');
    // Without vault connected, shows connect message
    await expect(page.getByText('Conecta un vault')).toBeVisible();
  });

  test('shows 404 for unknown folder slug', async ({ page }) => {
    await page.goto('/folder/nonexistent');
    await expect(page.getByText('Carpeta no encontrada')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Volver a la biblioteca' })).toBeVisible();
  });
});

test.describe('Folder page with data', () => {
  // Helper to inject items into the persisted Zustand store via localStorage
  const mockItems = [
    {
      id: 'author-1',
      title: 'Isaac Asimov',
      authors: [],
      tags: ['sci-fi', 'clasico'],
      formats: [],
      status: 'to-read',
      vaultPath: 'authors/Isaac Asimov',
      notePath: 'authors/Isaac Asimov/Isaac Asimov.md',
      filePaths: {},
      folder: 'Autores',
    },
    {
      id: 'author-2',
      title: 'Gabriel Garcia Marquez',
      authors: [],
      tags: ['realismo-magico', 'clasico'],
      formats: [],
      status: 'finished',
      vaultPath: 'authors/Gabriel Garcia Marquez',
      notePath: 'authors/Gabriel Garcia Marquez/Gabriel Garcia Marquez.md',
      filePaths: {},
      folder: 'Autores',
    },
    {
      id: 'author-3',
      title: 'Ursula K Le Guin',
      authors: [],
      tags: ['sci-fi', 'fantasia'],
      formats: [],
      status: 'reading',
      vaultPath: 'authors/Ursula K Le Guin',
      notePath: 'authors/Ursula K Le Guin/Ursula K Le Guin.md',
      filePaths: {},
      folder: 'Autores',
    },
    {
      id: 'book-1',
      title: 'Fundacion',
      authors: ['Isaac Asimov'],
      tags: ['sci-fi'],
      formats: ['epub'],
      status: 'reading',
      vaultPath: 'books/Fundacion',
      notePath: 'books/Fundacion/Fundacion.md',
      filePaths: { epub: 'books/Fundacion/Fundacion.epub' },
      folder: 'Libros',
    },
  ];

  const storeData = {
    state: {
      vaultConfig: {
        path: '~/test-vault',
        folders: [
          { name: 'Libros', path: 'books', showInMenu: false, showInLibrary: true },
          { name: 'Comics', path: 'comics', showInMenu: false, showInLibrary: true },
          { name: 'Autores', path: 'authors', showInMenu: true, showInLibrary: false },
        ],
      },
      theme: 'system',
      viewMode: 'grid',
      sort: { field: 'title', direction: 'asc' },
      progress: {},
      annotations: {},
    },
    version: 0,
  };

  test.beforeEach(async ({ page }) => {
    // Inject store state before navigating
    await page.addInitScript((data) => {
      localStorage.setItem('libreader-storage', JSON.stringify(data));
    }, storeData);
  });

  test('shows folder header with name', async ({ page }) => {
    // Inject items into the ephemeral store via page.evaluate after load
    await page.goto('/folder/authors');
    await page.evaluate((items) => {
      // Access the Zustand store directly
      const store = (window as any).__ZUSTAND_STORE__;
      if (store) store.getState().setItems(items);
    }, mockItems);
    // The heading should show the folder name
    await expect(page.getByRole('heading', { name: 'Autores' })).toBeVisible();
  });

  test('shows FilterBar with search input on folder page', async ({ page }) => {
    await page.goto('/folder/authors');
    // Inject items
    await page.evaluate((items) => {
      const store = (window as any).__ZUSTAND_STORE__;
      if (store) store.getState().setItems(items);
    }, mockItems);
    // Wait for FilterBar to appear (it shows when hasAnyItems)
    await expect(page.getByPlaceholder('Buscar por titulo, autor, tag...')).toBeVisible({ timeout: 5000 });
  });

  test('shows reload button on folder page', async ({ page }) => {
    await page.goto('/folder/authors');
    await expect(page.getByRole('button', { name: 'Recargar' })).toBeVisible();
  });

  test('shows sort dropdown on folder page', async ({ page }) => {
    await page.goto('/folder/authors');
    await page.evaluate((items) => {
      const store = (window as any).__ZUSTAND_STORE__;
      if (store) store.getState().setItems(items);
    }, mockItems);
    // Sort select should be present with options
    const sortSelect = page.locator('select');
    await expect(sortSelect).toBeVisible({ timeout: 5000 });
    // Check it has the expected options
    await expect(sortSelect.locator('option')).toHaveCount(6);
  });

  test('shows view mode toggle on folder page', async ({ page }) => {
    await page.goto('/folder/authors');
    await page.evaluate((items) => {
      const store = (window as any).__ZUSTAND_STORE__;
      if (store) store.getState().setItems(items);
    }, mockItems);
    // View mode buttons (grid and list)
    await expect(page.getByTitle('Grid')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTitle('List')).toBeVisible();
  });

  test('folder page does NOT show folder chips (already scoped)', async ({ page }) => {
    await page.goto('/folder/authors');
    await page.evaluate((items) => {
      const store = (window as any).__ZUSTAND_STORE__;
      if (store) store.getState().setItems(items);
    }, mockItems);
    // Wait for filter bar
    await expect(page.getByPlaceholder('Buscar por titulo, autor, tag...')).toBeVisible({ timeout: 5000 });
    // Should NOT have folder chip buttons like "Libros" or "Autores"
    await expect(page.getByRole('button', { name: /^Libros \(/ })).not.toBeVisible();
    await expect(page.getByRole('button', { name: /^Autores \(/ })).not.toBeVisible();
  });

  test('shows empty state when folder has no items', async ({ page }) => {
    await page.goto('/folder/comics');
    // Comics folder exists but has no items in our mock data
    await expect(page.getByText('No hay items en esta carpeta')).toBeVisible();
  });

  test('library page shows FilterBar with folder chips', async ({ page }) => {
    await page.goto('/');
    await page.evaluate((items) => {
      const store = (window as any).__ZUSTAND_STORE__;
      if (store) store.getState().setItems(items);
    }, mockItems);
    // Library page should show FilterBar
    await expect(page.getByPlaceholder('Buscar por titulo, autor, tag...')).toBeVisible({ timeout: 5000 });
    // Library page SHOULD have folder chips (Libros has 1 item with showInLibrary)
    await expect(page.getByRole('button', { name: /^Libros \(1\)/ })).toBeVisible();
  });
});

test.describe('Responsive design', () => {
  test('sidebar is visible on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 720 });
    await page.goto('/');
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible();
  });

  test('sidebar has translate class on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    // On mobile, sidebar should have -translate-x-full class
    const sidebar = page.locator('aside');
    await expect(sidebar).toHaveClass(/-translate-x-full/);
  });

  test('mobile header is visible on small screens', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    const mobileHeader = page.locator('header');
    await expect(mobileHeader).toBeVisible();
  });
});
