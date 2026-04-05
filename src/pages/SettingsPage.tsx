import { useCallback, useState } from 'react';
import { useLibraryStore } from '@/store/libraryStore';
import { useFileSystem } from '@/hooks/useFileSystem';
import { useVaultLoader } from '@/hooks/useVaultLoader';
import { clearVaultCache } from '@/services/vaultCache';
import type { VaultFolder } from '@/types';
import { generateCategoryId } from '@/types/annotation';

export function SettingsPage() {
  const vaultConfig = useLibraryStore((s) => s.vaultConfig);
  const setVaultConfig = useLibraryStore((s) => s.setVaultConfig);
  const theme = useLibraryStore((s) => s.theme);
  const setTheme = useLibraryStore((s) => s.setTheme);
  const searchHighlightColor = useLibraryStore((s) => s.searchHighlightColor);
  const setSearchHighlightColor = useLibraryStore((s) => s.setSearchHighlightColor);
  const items = useLibraryStore((s) => s.items);
  const setItems = useLibraryStore((s) => s.setItems);
  const annotationCategories = useLibraryStore((s) => s.annotationCategories);
  const addCategory = useLibraryStore((s) => s.addCategory);
  const updateCategory = useLibraryStore((s) => s.updateCategory);
  const removeCategory = useLibraryStore((s) => s.removeCategory);
  const { isReady, rootName, requestAccess, disconnect, isNative, setNativeVaultPath, getNativeVaultPath, error: fsError } = useFileSystem();
  const { loadVault } = useVaultLoader();
  const [nativePath, setNativePath] = useState(getNativeVaultPath());

  // Category editor state
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [categoryForm, setCategoryForm] = useState({ name: '', color: '#4285f4', description: '' });
  const [showCategoryForm, setShowCategoryForm] = useState(false);

  const handleDisconnect = useCallback(async () => {
    await disconnect();
    setItems([]);
    setNativePath('');
    clearVaultCache().catch(() => {});
  }, [disconnect, setItems]);

  const handleChangeVault = useCallback(async () => {
    if (isNative) {
      const ok = await setNativeVaultPath(nativePath);
      if (ok) {
        await loadVault();
      }
    } else {
      const ok = await requestAccess();
      if (ok) {
        await loadVault();
      }
    }
  }, [isNative, nativePath, requestAccess, setNativeVaultPath, loadVault]);

  const updateFolder = (index: number, updates: Partial<VaultFolder>) => {
    const newFolders = vaultConfig.folders.map((f, i) =>
      i === index ? { ...f, ...updates } : f
    );
    setVaultConfig({ folders: newFolders });
  };

  const addFolder = () => {
    setVaultConfig({
      folders: [
        ...vaultConfig.folders,
        { name: '', path: '', showInMenu: false, showInLibrary: true },
      ],
    });
  };

  const removeFolder = (index: number) => {
    setVaultConfig({
      folders: vaultConfig.folders.filter((_, i) => i !== index),
    });
  };

  return (
    <div className="p-4 lg:p-6 max-w-2xl mx-auto space-y-8">
      <h2 className="text-xl font-bold text-text">Ajustes</h2>

      {/* Vault Info */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-text uppercase tracking-wider">
          Vault de Obsidian
        </h3>
        <div className="p-4 rounded-xl border border-border space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm text-text-secondary">Estado</span>
            <span className={`text-sm font-medium ${isReady ? 'text-success' : 'text-text-muted'}`}>
              {isReady ? 'Conectado' : 'Desconectado'}
            </span>
          </div>
          {rootName && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-text-secondary">Directorio</span>
              <span className="text-sm text-text font-mono">{rootName}</span>
            </div>
          )}
          {vaultConfig.path && (
            <div className="flex justify-between items-center">
              <span className="text-sm text-text-secondary">Ruta</span>
              <span className="text-sm text-text font-mono truncate ml-4">{vaultConfig.path}</span>
            </div>
          )}
          <div className="flex justify-between items-center">
            <span className="text-sm text-text-secondary">Items cargados</span>
            <span className="text-sm text-text">{items.length}</span>
          </div>
        </div>

        {/* Vault action buttons */}
        <div className="flex flex-col gap-3">
          {isNative && (
            <input
              type="text"
              value={nativePath}
              onChange={(e) => setNativePath(e.target.value)}
              placeholder="/storage/emulated/0/Documents/library"
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-text font-mono text-sm focus:outline-none focus:border-primary"
            />
          )}
          {fsError && (
            <p className="text-sm text-danger">{fsError}</p>
          )}
          <div className="flex gap-3">
            {isReady ? (
              <>
                <button
                  onClick={handleChangeVault}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-border text-text-secondary hover:bg-surface-hover transition-colors"
                >
                  Cambiar vault
                </button>
                <button
                  onClick={handleDisconnect}
                  className="px-4 py-2 text-sm font-medium rounded-lg border border-danger/30 text-danger hover:bg-danger/10 transition-colors"
                >
                  Desconectar
                </button>
              </>
            ) : (
              <button
                onClick={handleChangeVault}
                disabled={isNative && !nativePath.trim()}
                className="px-4 py-2 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary-hover transition-colors disabled:opacity-50"
              >
                Conectar vault
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Dynamic folder config */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text uppercase tracking-wider">
            Carpetas del Vault
          </h3>
          <button
            onClick={addFolder}
            className="px-3 py-1 text-xs font-medium rounded-lg bg-primary text-white hover:bg-primary-hover transition-colors"
          >
            + Agregar
          </button>
        </div>
        <div className="space-y-3">
          {vaultConfig.folders.map((folder, index) => (
            <div
              key={index}
              className="p-3 rounded-lg border border-border bg-surface space-y-2"
            >
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Nombre"
                  value={folder.name}
                  onChange={(e) => updateFolder(index, { name: e.target.value })}
                  className="w-28 px-2 py-1.5 rounded border border-border bg-background text-sm text-text focus:outline-none focus:border-primary"
                />
                <input
                  type="text"
                  placeholder="ruta/relativa"
                  value={folder.path}
                  onChange={(e) => updateFolder(index, { path: e.target.value })}
                  className="flex-1 px-2 py-1.5 rounded border border-border bg-background text-sm text-text font-mono focus:outline-none focus:border-primary"
                />
                <button
                  onClick={() => removeFolder(index)}
                  className="p-1.5 text-text-muted hover:text-danger transition-colors shrink-0"
                  title="Eliminar carpeta"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              <div className="flex items-center gap-4 pl-1">
                <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={folder.showInMenu ?? false}
                    onChange={(e) => updateFolder(index, { showInMenu: e.target.checked })}
                    className="rounded border-border text-primary focus:ring-primary/20"
                  />
                  Menu lateral
                </label>
                <label className="flex items-center gap-1.5 text-xs text-text-secondary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={folder.showInLibrary ?? true}
                    onChange={(e) => updateFolder(index, { showInLibrary: e.target.checked })}
                    className="rounded border-border text-primary focus:ring-primary/20"
                  />
                  Biblioteca
                </label>
              </div>
            </div>
          ))}
          {vaultConfig.folders.length === 0 && (
            <p className="text-sm text-text-muted py-2">
              No hay carpetas configuradas. Agrega una para comenzar.
            </p>
          )}
        </div>
      </section>

      {/* Theme */}
      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-text uppercase tracking-wider">
          Apariencia
        </h3>
        <div className="flex gap-3">
          {(
            [
              ['light', 'Claro'],
              ['dark', 'Oscuro'],
              ['system', 'Sistema'],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              onClick={() => setTheme(value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                theme === value
                  ? 'bg-primary text-white'
                  : 'bg-surface-alt text-text-secondary hover:bg-surface-hover'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Search highlight color */}
        <div className="flex items-center gap-3 mt-2">
          <label className="text-sm text-text-secondary">Color de busqueda</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={searchHighlightColor}
              onChange={(e) => setSearchHighlightColor(e.target.value)}
              className="w-8 h-8 rounded cursor-pointer border border-border"
              title="Color para resaltar resultados de busqueda"
            />
            <span className="text-xs text-text-muted font-mono">{searchHighlightColor}</span>
          </div>
        </div>
      </section>

      {/* Annotation Categories */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text uppercase tracking-wider">
            Categorias de anotaciones
          </h3>
          {!showCategoryForm && (
            <button
              onClick={() => {
                setCategoryForm({ name: '', color: '#4285f4', description: '' });
                setEditingCategoryId(null);
                setShowCategoryForm(true);
              }}
              className="px-3 py-1 text-xs font-medium rounded-lg bg-primary text-white hover:bg-primary-hover transition-colors"
            >
              + Agregar
            </button>
          )}
        </div>

        <p className="text-xs text-text-muted">
          Define categorias personalizadas para clasificar tus anotaciones. Si no hay categorias, se usan los 5 colores predeterminados.
        </p>

        {/* Category form (add/edit) */}
        {showCategoryForm && (
          <div className="p-4 rounded-lg border border-primary/30 bg-surface space-y-3">
            <div className="flex items-center gap-3">
              <input
                type="color"
                value={categoryForm.color}
                onChange={(e) => setCategoryForm((f) => ({ ...f, color: e.target.value }))}
                className="w-10 h-10 rounded border border-border cursor-pointer shrink-0"
                title="Color"
              />
              <input
                type="text"
                placeholder="Nombre (ej: Vocabulario, Idea clave)"
                value={categoryForm.name}
                onChange={(e) => setCategoryForm((f) => ({ ...f, name: e.target.value }))}
                className="flex-1 px-3 py-2 rounded-lg border border-border bg-background text-sm text-text focus:outline-none focus:border-primary"
                autoFocus
              />
            </div>
            <input
              type="text"
              placeholder="Descripcion (opcional)"
              value={categoryForm.description}
              onChange={(e) => setCategoryForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm text-text focus:outline-none focus:border-primary"
            />
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => {
                  setShowCategoryForm(false);
                  setEditingCategoryId(null);
                }}
                className="px-3 py-1.5 text-sm rounded-lg border border-border text-text-secondary hover:bg-surface-hover transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => {
                  if (!categoryForm.name.trim()) return;
                  if (editingCategoryId) {
                    updateCategory(editingCategoryId, {
                      name: categoryForm.name.trim(),
                      color: categoryForm.color,
                      description: categoryForm.description.trim(),
                    });
                  } else {
                    addCategory({
                      id: generateCategoryId(),
                      name: categoryForm.name.trim(),
                      color: categoryForm.color,
                      description: categoryForm.description.trim(),
                    });
                  }
                  setShowCategoryForm(false);
                  setEditingCategoryId(null);
                }}
                disabled={!categoryForm.name.trim()}
                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-primary text-white hover:bg-primary-hover transition-colors disabled:opacity-50"
              >
                {editingCategoryId ? 'Guardar' : 'Crear'}
              </button>
            </div>
          </div>
        )}

        {/* Category list */}
        <div className="space-y-2">
          {annotationCategories.map((cat) => (
            <div
              key={cat.id}
              className="flex items-center gap-3 p-3 rounded-lg border border-border bg-surface group"
            >
              <div
                className="w-6 h-6 rounded-full shrink-0 border border-border"
                style={{ backgroundColor: cat.color }}
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-text truncate">{cat.name}</div>
                {cat.description && (
                  <div className="text-xs text-text-muted truncate">{cat.description}</div>
                )}
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={() => {
                    setCategoryForm({ name: cat.name, color: cat.color, description: cat.description });
                    setEditingCategoryId(cat.id);
                    setShowCategoryForm(true);
                  }}
                  className="p-1.5 text-text-muted hover:text-primary transition-colors"
                  title="Editar"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                  </svg>
                </button>
                <button
                  onClick={() => removeCategory(cat.id)}
                  className="p-1.5 text-text-muted hover:text-danger transition-colors"
                  title="Eliminar"
                >
                  <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
          {annotationCategories.length === 0 && !showCategoryForm && (
            <p className="text-sm text-text-muted py-2">
              No hay categorias definidas. Se usaran los colores predeterminados al anotar.
            </p>
          )}
        </div>
      </section>

      {/* About */}
      <section className="space-y-2 text-sm text-text-muted">
        <h3 className="text-sm font-semibold text-text uppercase tracking-wider">
          Acerca de
        </h3>
        <p>
          LibReader v0.1.0 - Lector multiplataforma para vaults de Obsidian.
        </p>
        <p>
          Soporta EPUB, PDF, CBZ, CBR y notas Markdown.
        </p>
      </section>
    </div>
  );
}
