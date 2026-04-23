/**
 * ImportPage — Step-by-step wizard to import items into the vault.
 *
 * Steps: 1.File  2.Metadata  3.Cover  4.Authors  5.Tags  6.Folder  7.Summary  8.Done
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useFileSystem } from '@/hooks/useFileSystem';
import { useLibraryStore } from '@/store/libraryStore';
import { parseVault } from '@/services/vaultParser';
import {
  detectFormat,
  isYouTubeUrl,
  extractEpubMetadata,
  extractPdfMetadata,
  extractComicMetadata,
  extractVideoMetadata,
  extractYouTubeMetadata,
  generateFrontmatter,
  generateMdBody,
  importToVault,
  sanitizeName,
  listExistingAuthors,
  listExistingTags,
  ACCEPTED_EXTENSIONS,
  type ImportMetadata,
  type ImportItem,
  type ImportFormat,
} from '@/services/importService';

type WizardStep = 'file' | 'extracting' | 'metadata' | 'cover' | 'authors' | 'tags' | 'folder' | 'summary' | 'importing' | 'done' | 'error';

export function ImportPage() {
  const { fs, isReady } = useFileSystem();
  const vaultConfig = useLibraryStore((s) => s.vaultConfig);
  const setItems = useLibraryStore((s) => s.setItems);
  const aiProvider = useLibraryStore((s) => s.aiProvider);

  const [step, setStep] = useState<WizardStep>('file');
  const [item, setItem] = useState<ImportItem | null>(null);
  const [metadata, setMetadata] = useState<ImportMetadata | null>(null);
  const [targetFolder, setTargetFolder] = useState('');
  const [error, setError] = useState('');
  const [urlInput, setUrlInput] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [importResult, setImportResult] = useState<{ folderPath: string; createdAuthors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);
  const [aiLoading, setAiLoading] = useState<string | null>(null); // which AI action is running
  const [aiError, setAiError] = useState<string | null>(null);

  // Existing vault data
  const [existingAuthors, setExistingAuthors] = useState<string[]>([]);
  const [existingTags, setExistingTags] = useState<string[]>([]);
  const [authorSearch, setAuthorSearch] = useState('');
  const [tagSearch, setTagSearch] = useState('');

  const folders = vaultConfig.folders;

  // Load existing authors and tags when vault is ready
  useEffect(() => {
    if (!fs || !isReady) return;
    const authorsFolder = folders.find((f) => f.path === 'authors' || f.name.toLowerCase() === 'autores');
    if (authorsFolder) {
      listExistingAuthors(fs, authorsFolder.path).then(setExistingAuthors).catch(() => {});
    }
    const folderPaths = folders.map((f) => f.path);
    listExistingTags(fs, folderPaths).then(setExistingTags).catch(() => {});
  }, [fs, isReady, folders]);

  // ---- Process a file ----
  const processFile = useCallback(async (file: File) => {
    const format = detectFormat(file.name);
    if (!format) {
      setError(`Formato no soportado: ${file.name}.\nFormatos validos: epub, pdf, cbz, cbr, mp4, mkv, avi, webm, mov`);
      setStep('error');
      return;
    }

    setStep('extracting');
    setError('');

    try {
      const data = await file.arrayBuffer();
      let extracted: Partial<ImportMetadata> = {};

      switch (format) {
        case 'epub':
          extracted = await extractEpubMetadata(data);
          break;
        case 'pdf':
          extracted = await extractPdfMetadata(data);
          break;
        case 'cbz':
        case 'cbr':
          extracted = extractComicMetadata(file.name);
          break;
        case 'video':
          extracted = extractVideoMetadata(file.name);
          break;
      }

      const meta: ImportMetadata = {
        title: extracted.title || file.name.replace(/\.[^.]+$/, ''),
        subtitle: extracted.subtitle,
        authors: extracted.authors || [],
        year: extracted.year,
        publisher: extracted.publisher,
        language: extracted.language,
        pages: extracted.pages,
        isbn: extracted.isbn,
        tags: extracted.tags || [],
        format,
        coverData: extracted.coverData,
        coverExt: extracted.coverExt,
      };

      setItem({ metadata: meta, fileData: data, fileName: file.name });
      setMetadata(meta);
      setStep('metadata');
    } catch (err) {
      setError(`Error al procesar ${file.name}: ${err instanceof Error ? err.message : String(err)}`);
      setStep('error');
    }
  }, []);

  // ---- Process a YouTube URL ----
  const processUrl = useCallback(async (url: string) => {
    if (!isYouTubeUrl(url)) {
      setError('URL no valida. Solo se admiten enlaces de YouTube.');
      setStep('error');
      return;
    }

    setStep('extracting');
    setError('');

    try {
      const extracted = await extractYouTubeMetadata(url);
      const meta: ImportMetadata = {
        title: extracted.title || 'Video sin titulo',
        authors: extracted.authors || [],
        tags: extracted.tags || [],
        format: 'youtube' as ImportFormat,
        coverData: extracted.coverData,
        coverExt: extracted.coverExt,
      };

      setItem({ metadata: meta, fileName: `${meta.title}.youtube`, url });
      setMetadata(meta);
      setStep('metadata');
    } catch (err) {
      setError(`Error al procesar URL: ${err instanceof Error ? err.message : String(err)}`);
      setStep('error');
    }
  }, []);

  // ---- Handlers ----
  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(true); }, []);
  const handleDragLeave = useCallback((e: React.DragEvent) => { e.preventDefault(); e.stopPropagation(); setDragOver(false); }, []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setDragOver(false);
    if (e.dataTransfer.files.length > 0) processFile(e.dataTransfer.files[0]);
  }, [processFile]);
  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) processFile(e.target.files[0]);
  }, [processFile]);
  const handleUrlSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    if (urlInput.trim()) processUrl(urlInput.trim());
  }, [urlInput, processUrl]);

  // ---- Cover upload ----
  const handleCoverUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !metadata) return;
    const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg';
    file.arrayBuffer().then((data) => {
      setMetadata((prev) => prev ? { ...prev, coverData: data, coverExt: ext } : prev);
    });
  }, [metadata]);

  // ---- Import ----
  const handleImport = useCallback(async () => {
    if (!fs || !item || !metadata) return;
    setStep('importing');
    setError('');

    try {
      const authorsFolder = folders.find((f) => f.path === 'authors' || f.name.toLowerCase() === 'autores');
      const authorsPath = authorsFolder?.path || 'authors';

      const updatedItem: ImportItem = { ...item, metadata };
      const result = await importToVault(fs, updatedItem, targetFolder, authorsPath);
      setImportResult(result);

      // Re-parse vault
      const items = await parseVault(fs, vaultConfig);
      setItems(items);

      setStep('done');
    } catch (err) {
      setError(`Error al importar: ${err instanceof Error ? err.message : String(err)}`);
      setStep('error');
    }
  }, [fs, item, metadata, targetFolder, folders, vaultConfig, setItems]);

  // ---- Reset ----
  const reset = useCallback(() => {
    setStep('file');
    setItem(null);
    setMetadata(null);
    setTargetFolder('');
    setError('');
    setUrlInput('');
    setImportResult(null);
    setAuthorSearch('');
    setTagSearch('');
  }, []);

  // ---- Field update ----
  const updateField = useCallback(<K extends keyof ImportMetadata>(key: K, value: ImportMetadata[K]) => {
    setMetadata((prev) => prev ? { ...prev, [key]: value } : prev);
  }, []);

  // ---- AI actions ----
  const aiEnrichMetadata = useCallback(async () => {
    if (!aiProvider || !metadata) return;
    setAiLoading('enrich');
    setAiError(null);
    try {
      const { enrichMetadata } = await import('@/services/aiService');
      const result = await enrichMetadata(aiProvider, {
        title: metadata.title,
        authors: metadata.authors,
        format: metadata.format,
        isbn: metadata.isbn,
      });
      // Merge — only overwrite empty fields, always add summary
      setMetadata((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          title: result.title || prev.title,
          subtitle: result.subtitle || prev.subtitle,
          authors: result.authors && result.authors.length > 0 ? result.authors : prev.authors,
          year: result.year || prev.year,
          publisher: result.publisher || prev.publisher,
          language: result.language || prev.language,
          isbn: result.isbn || prev.isbn,
          pages: result.pages || prev.pages,
          tags: result.tags && result.tags.length > 0
            ? [...new Set([...prev.tags, ...result.tags])]
            : prev.tags,
          summary: result.summary || prev.summary,
        };
      });
    } catch (err) {
      setAiError(err instanceof Error ? err.message : String(err));
    }
    setAiLoading(null);
  }, [aiProvider, metadata]);

  const aiSuggestTags = useCallback(async () => {
    if (!aiProvider || !metadata) return;
    setAiLoading('tags');
    setAiError(null);
    try {
      const { suggestTags } = await import('@/services/aiService');
      const tags = await suggestTags(aiProvider, {
        title: metadata.title,
        authors: metadata.authors,
        format: metadata.format,
        existingTags,
      });
      setMetadata((prev) => prev ? {
        ...prev,
        tags: [...new Set([...prev.tags, ...tags])],
      } : prev);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : String(err));
    }
    setAiLoading(null);
  }, [aiProvider, metadata, existingTags]);

  const aiGenerateSummary = useCallback(async () => {
    if (!aiProvider || !metadata) return;
    setAiLoading('summary');
    setAiError(null);
    try {
      const { generateSummary } = await import('@/services/aiService');
      const summary = await generateSummary(aiProvider, {
        title: metadata.title,
        authors: metadata.authors,
        format: metadata.format,
      });
      setMetadata((prev) => prev ? { ...prev, summary } : prev);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : String(err));
    }
    setAiLoading(null);
  }, [aiProvider, metadata]);

  if (!isReady) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <p className="text-text-muted">Conecta el vault en Ajustes para importar contenido.</p>
      </div>
    );
  }

  // ---- Step indicator ----
  const steps: { key: WizardStep; label: string }[] = [
    { key: 'file', label: 'Archivo' },
    { key: 'metadata', label: 'Datos' },
    { key: 'cover', label: 'Portada' },
    { key: 'authors', label: 'Autores' },
    { key: 'tags', label: 'Tags' },
    { key: 'folder', label: 'Carpeta' },
    { key: 'summary', label: 'Resumen' },
  ];
  const stepOrder = steps.map((s) => s.key);
  const currentStepIdx = stepOrder.indexOf(step);

  return (
    <div className="flex-1 overflow-y-auto p-6 max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold text-text">Importar</h1>

      {/* Step indicator */}
      {!['file', 'extracting', 'importing', 'done', 'error'].includes(step) && (
        <div className="flex items-center gap-1 text-xs">
          {steps.map((s, i) => (
            <div key={s.key} className="flex items-center gap-1">
              <span className={`px-2 py-0.5 rounded-full ${
                i === currentStepIdx ? 'bg-primary text-white' :
                i < currentStepIdx ? 'bg-primary/20 text-primary' :
                'bg-surface-hover text-text-muted'
              }`}>
                {s.label}
              </span>
              {i < steps.length - 1 && <span className="text-text-muted">›</span>}
            </div>
          ))}
        </div>
      )}

      {/* ==== STEP: FILE ==== */}
      {step === 'file' && (
        <>
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-12 text-center cursor-pointer transition-colors ${
              dragOver ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/50 hover:bg-surface-hover'
            }`}
          >
            <UploadIcon className="w-12 h-12 mx-auto mb-4 text-text-muted" />
            <p className="text-text font-medium mb-1">Arrastra un archivo aqui</p>
            <p className="text-sm text-text-muted">o haz clic para seleccionar</p>
            <p className="text-xs text-text-muted mt-2">EPUB, PDF, CBZ, CBR, MP4, MKV, AVI, WEBM</p>
            <input ref={fileInputRef} type="file" accept={ACCEPTED_EXTENSIONS} className="hidden" onChange={handleFileSelect} />
          </div>
          <div className="flex items-center gap-4">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-text-muted">o pega un enlace</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          <form onSubmit={handleUrlSubmit} className="flex gap-2">
            <input
              type="text"
              value={urlInput}
              onChange={(e) => setUrlInput(e.target.value)}
              placeholder="https://youtube.com/watch?v=..."
              className="flex-1 px-4 py-2.5 rounded-lg border border-border bg-surface text-text text-sm placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <button type="submit" disabled={!urlInput.trim()} className="px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors">Importar</button>
          </form>
        </>
      )}

      {/* ==== STEP: EXTRACTING ==== */}
      {step === 'extracting' && (
        <div className="text-center py-12 space-y-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-text-muted">Extrayendo metadatos...</p>
        </div>
      )}

      {/* ==== STEP: METADATA ==== */}
      {step === 'metadata' && metadata && (
        <div className="space-y-4">
          <StepHeader title="Datos del contenido" subtitle={`Formato detectado: ${metadata.format.toUpperCase()}`} />
          <div className="space-y-3">
            <Field label="Titulo" value={metadata.title} onChange={(v) => updateField('title', v)} required />
            <Field label="Subtitulo" value={metadata.subtitle || ''} onChange={(v) => updateField('subtitle', v || undefined)} />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Ano" value={metadata.year || ''} onChange={(v) => updateField('year', v || undefined)} />
              <Field label="Idioma" value={metadata.language || ''} onChange={(v) => updateField('language', v || undefined)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Editorial" value={metadata.publisher || ''} onChange={(v) => updateField('publisher', v || undefined)} />
              <Field label="ISBN" value={metadata.isbn || ''} onChange={(v) => updateField('isbn', v || undefined)} />
            </div>
            {(metadata.format === 'epub' || metadata.format === 'pdf') && (
              <Field label="Paginas" value={metadata.pages ? String(metadata.pages) : ''} onChange={(v) => updateField('pages', v ? parseInt(v) || undefined : undefined)} />
            )}
          </div>
          {/* AI enrichment */}
          <AIButton
            label="Completar datos con IA"
            loading={aiLoading === 'enrich'}
            disabled={!aiProvider}
            error={aiLoading === 'enrich' ? null : aiError}
            onClick={aiEnrichMetadata}
            hint={!aiProvider ? 'Configurar IA en Ajustes' : undefined}
          />
          {metadata.summary && (
            <div className="p-3 rounded-lg bg-surface-alt text-sm text-text-secondary">
              <span className="font-medium text-text">Resumen IA: </span>{metadata.summary}
            </div>
          )}
          <NavButtons onBack={() => setStep('file')} onNext={() => setStep('cover')} />
        </div>
      )}

      {/* ==== STEP: COVER ==== */}
      {step === 'cover' && metadata && (
        <div className="space-y-4">
          <StepHeader title="Portada" subtitle={metadata.coverData ? 'Portada detectada automaticamente' : 'No se detecto portada'} />
          {metadata.coverData ? (
            <div className="flex justify-center">
              <img
                src={URL.createObjectURL(new Blob([metadata.coverData]))}
                alt="Portada"
                className="max-h-64 rounded-lg shadow-lg object-contain"
              />
            </div>
          ) : (
            <div className="flex justify-center py-8">
              <div className="w-40 h-56 rounded-lg border-2 border-dashed border-border flex items-center justify-center text-text-muted text-sm">
                Sin portada
              </div>
            </div>
          )}
          <div className="flex gap-2 justify-center">
            <button onClick={() => coverInputRef.current?.click()} className="px-4 py-2.5 rounded-lg border border-border text-text-secondary text-sm hover:bg-surface-hover transition-colors text-sm">
              {metadata.coverData ? 'Cambiar imagen' : 'Subir imagen'}
            </button>
            {metadata.coverData && (
              <button onClick={() => setMetadata((p) => p ? { ...p, coverData: undefined, coverExt: undefined } : p)} className="px-4 py-2.5 rounded-lg border border-border text-text-secondary text-sm hover:bg-surface-hover transition-colors text-sm text-red-500">
                Eliminar
              </button>
            )}
          </div>
          <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={handleCoverUpload} />
          <NavButtons onBack={() => setStep('metadata')} onNext={() => setStep('authors')} />
        </div>
      )}

      {/* ==== STEP: AUTHORS ==== */}
      {step === 'authors' && metadata && (
        <div className="space-y-4">
          <StepHeader title="Autores" subtitle={`${existingAuthors.length} autores en el vault`} />
          {/* Current authors */}
          {metadata.authors.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {metadata.authors.map((a) => (
                <span key={a} className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-primary/10 text-primary text-sm">
                  {a}
                  <button onClick={() => updateField('authors', metadata.authors.filter((x) => x !== a))} className="hover:text-red-500">x</button>
                </span>
              ))}
            </div>
          )}
          {/* Search / add */}
          <div className="space-y-2">
            <input
              type="text"
              value={authorSearch}
              onChange={(e) => setAuthorSearch(e.target.value)}
              placeholder="Buscar o crear autor..."
              className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && authorSearch.trim()) {
                  e.preventDefault();
                  const name = authorSearch.trim();
                  if (!metadata.authors.includes(name)) {
                    updateField('authors', [...metadata.authors, name]);
                  }
                  setAuthorSearch('');
                }
              }}
            />
            {authorSearch && (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-surface">
                {existingAuthors
                  .filter((a) => a.toLowerCase().includes(authorSearch.toLowerCase()) && !metadata.authors.includes(a))
                  .map((a) => (
                    <button
                      key={a}
                      onClick={() => { updateField('authors', [...metadata.authors, a]); setAuthorSearch(''); }}
                      className="w-full text-left px-3 py-1.5 text-sm text-text hover:bg-surface-hover"
                    >
                      {a}
                    </button>
                  ))
                }
                {authorSearch.trim() && !existingAuthors.some((a) => a.toLowerCase() === authorSearch.toLowerCase()) && (
                  <button
                    onClick={() => {
                      const name = authorSearch.trim();
                      if (!metadata.authors.includes(name)) updateField('authors', [...metadata.authors, name]);
                      setAuthorSearch('');
                    }}
                    className="w-full text-left px-3 py-1.5 text-sm text-primary hover:bg-surface-hover"
                  >
                    + Crear "{authorSearch.trim()}"
                  </button>
                )}
              </div>
            )}
          </div>
          <p className="text-xs text-text-muted">Los autores nuevos se crearan automaticamente en la carpeta de autores del vault.</p>
          <NavButtons onBack={() => setStep('cover')} onNext={() => setStep('tags')} />
        </div>
      )}

      {/* ==== STEP: TAGS ==== */}
      {step === 'tags' && metadata && (
        <div className="space-y-4">
          <StepHeader title="Tags" subtitle={`${existingTags.length} tags en el vault`} />
          {/* Current tags */}
          {metadata.tags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {metadata.tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-surface-hover text-text-secondary text-sm">
                  {t}
                  <button onClick={() => updateField('tags', metadata.tags.filter((x) => x !== t))} className="hover:text-red-500">x</button>
                </span>
              ))}
            </div>
          )}
          {/* Search / add */}
          <div className="space-y-2">
            <input
              type="text"
              value={tagSearch}
              onChange={(e) => setTagSearch(e.target.value)}
              placeholder="Buscar o crear tag..."
              className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && tagSearch.trim()) {
                  e.preventDefault();
                  const tag = tagSearch.trim().startsWith('#') ? tagSearch.trim() : `#${tagSearch.trim()}`;
                  if (!metadata.tags.includes(tag)) updateField('tags', [...metadata.tags, tag]);
                  setTagSearch('');
                }
              }}
            />
            {tagSearch && (
              <div className="max-h-40 overflow-y-auto rounded-lg border border-border bg-surface">
                {existingTags
                  .filter((t) => t.toLowerCase().includes(tagSearch.toLowerCase()) && !metadata.tags.includes(t))
                  .map((t) => (
                    <button
                      key={t}
                      onClick={() => { updateField('tags', [...metadata.tags, t]); setTagSearch(''); }}
                      className="w-full text-left px-3 py-1.5 text-sm text-text hover:bg-surface-hover"
                    >
                      {t}
                    </button>
                  ))
                }
                {tagSearch.trim() && !existingTags.some((t) => t.toLowerCase() === tagSearch.toLowerCase()) && (
                  <button
                    onClick={() => {
                      const tag = tagSearch.trim().startsWith('#') ? tagSearch.trim() : `#${tagSearch.trim()}`;
                      if (!metadata.tags.includes(tag)) updateField('tags', [...metadata.tags, tag]);
                      setTagSearch('');
                    }}
                    className="w-full text-left px-3 py-1.5 text-sm text-primary hover:bg-surface-hover"
                  >
                    + Crear "{tagSearch.trim()}"
                  </button>
                )}
              </div>
            )}
          </div>
          <AIButton
            label="Sugerir tags con IA"
            loading={aiLoading === 'tags'}
            disabled={!aiProvider}
            error={aiLoading === 'tags' ? null : aiError}
            onClick={aiSuggestTags}
            hint={!aiProvider ? 'Configurar IA en Ajustes' : undefined}
          />
          <NavButtons onBack={() => setStep('authors')} onNext={() => setStep('folder')} />
        </div>
      )}

      {/* ==== STEP: FOLDER ==== */}
      {step === 'folder' && metadata && (
        <div className="space-y-4">
          <StepHeader title="Carpeta destino" subtitle="Selecciona donde guardar en el vault" />
          <div className="space-y-2">
            {folders.filter((f) => f.showInLibrary).map((f) => (
              <button
                key={f.path}
                onClick={() => setTargetFolder(f.path)}
                className={`w-full text-left px-4 py-3 rounded-lg border transition-colors ${
                  targetFolder === f.path
                    ? 'border-primary bg-primary/5 text-text'
                    : 'border-border hover:border-primary/50 text-text-secondary hover:bg-surface-hover'
                }`}
              >
                <span className="font-medium">{f.name}</span>
                <span className="text-xs text-text-muted ml-2">/{f.path}</span>
              </button>
            ))}
          </div>
          <NavButtons onBack={() => setStep('tags')} onNext={() => setStep('summary')} disabled={!targetFolder} />
        </div>
      )}

      {/* ==== STEP: SUMMARY ==== */}
      {step === 'summary' && metadata && (
        <div className="space-y-4">
          <StepHeader title="Resumen de la importacion" />

          {metadata.coverData && (
            <div className="flex justify-center">
              <img src={URL.createObjectURL(new Blob([metadata.coverData]))} alt="Portada" className="max-h-32 rounded-lg shadow object-contain" />
            </div>
          )}

          {/* AI summary */}
          {!metadata.summary && aiProvider && (
            <AIButton
              label="Generar resumen con IA"
              loading={aiLoading === 'summary'}
              disabled={!aiProvider}
              error={aiLoading === 'summary' ? null : aiError}
              onClick={aiGenerateSummary}
            />
          )}
          {metadata.summary && (
            <div className="p-3 rounded-lg bg-surface-alt text-sm text-text-secondary">
              <span className="font-medium text-text">Resumen: </span>{metadata.summary}
            </div>
          )}

          <div className="space-y-2 text-sm">
            <SummaryRow label="Titulo" value={metadata.title} />
            {metadata.subtitle && <SummaryRow label="Subtitulo" value={metadata.subtitle} />}
            <SummaryRow label="Formato" value={metadata.format.toUpperCase()} />
            {metadata.authors.length > 0 && <SummaryRow label="Autores" value={metadata.authors.join(', ')} />}
            {metadata.year && <SummaryRow label="Ano" value={metadata.year} />}
            {metadata.language && <SummaryRow label="Idioma" value={metadata.language} />}
            {metadata.publisher && <SummaryRow label="Editorial" value={metadata.publisher} />}
            {metadata.pages && <SummaryRow label="Paginas" value={String(metadata.pages)} />}
            {metadata.tags.length > 0 && <SummaryRow label="Tags" value={metadata.tags.join(', ')} />}
            <SummaryRow label="Carpeta" value={`/${targetFolder}`} />
          </div>

          {/* What will be created */}
          <div className="rounded-lg bg-surface-alt p-4 space-y-1 text-xs text-text-muted">
            <p className="font-medium text-text-secondary mb-2">Se creara:</p>
            <p>📁 {targetFolder}/{sanitizeName(metadata.title)}/</p>
            <p className="ml-4">📄 {sanitizeName(metadata.title)}.md</p>
            {item?.fileData && <p className="ml-4">📦 {sanitizeName(metadata.title)}.{item.fileName.split('.').pop()}</p>}
            {item?.url && <p className="ml-4">🔗 {sanitizeName(metadata.title)}.youtube</p>}
            {metadata.coverData && <p className="ml-4">🖼 {sanitizeName(metadata.title)}.{metadata.coverExt}</p>}
            {metadata.authors.filter((a) => !existingAuthors.includes(a)).map((a) => (
              <p key={a}>📁 authors/{a}/ (nuevo autor)</p>
            ))}
          </div>

          {/* Frontmatter preview */}
          <details className="text-xs">
            <summary className="text-text-muted cursor-pointer hover:text-text">Ver frontmatter generado</summary>
            <pre className="mt-2 p-3 rounded-lg bg-surface-alt text-text-muted overflow-x-auto whitespace-pre-wrap">
              {generateFrontmatter(metadata)}
              {generateMdBody(metadata.summary)}
            </pre>
          </details>

          <div className="flex gap-3 pt-2">
            <button onClick={() => setStep('folder')} className="px-4 py-2.5 rounded-lg border border-border text-text-secondary text-sm hover:bg-surface-hover transition-colors">Atras</button>
            <button onClick={handleImport} className="flex-1 px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors">Importar al vault</button>
          </div>
        </div>
      )}

      {/* ==== STEP: IMPORTING ==== */}
      {step === 'importing' && (
        <div className="text-center py-12 space-y-3">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-sm text-text-muted">Importando al vault...</p>
        </div>
      )}

      {/* ==== STEP: DONE ==== */}
      {step === 'done' && importResult && (
        <div className="text-center py-12 space-y-4">
          <CheckIcon className="w-12 h-12 mx-auto text-green-500" />
          <p className="text-text font-medium">Importado correctamente</p>
          <p className="text-sm text-text-muted">/{importResult.folderPath}</p>
          {importResult.createdAuthors.length > 0 && (
            <p className="text-xs text-text-muted">
              Autores creados: {importResult.createdAuthors.join(', ')}
            </p>
          )}
          <button onClick={reset} className="px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors">Importar otro</button>
        </div>
      )}

      {/* ==== STEP: ERROR ==== */}
      {step === 'error' && (
        <div className="text-center py-12 space-y-4">
          <ErrorIcon className="w-12 h-12 mx-auto text-red-500" />
          <p className="text-red-500 font-medium">Error</p>
          <p className="text-sm text-text-muted whitespace-pre-line">{error}</p>
          <button onClick={reset} className="px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors">Reintentar</button>
        </div>
      )}
    </div>
  );
}

// ---- Reusable components ----

function StepHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div>
      <h2 className="text-lg font-semibold text-text">{title}</h2>
      {subtitle && <p className="text-sm text-text-muted">{subtitle}</p>}
    </div>
  );
}

function Field({ label, value, onChange, required, hint }: {
  label: string; value: string; onChange: (v: string) => void; required?: boolean; hint?: string;
}) {
  return (
    <div>
      <label className="block text-xs font-medium text-text-secondary mb-1">
        {label}{required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-text text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
      />
      {hint && <p className="text-xs text-text-muted mt-0.5">{hint}</p>}
    </div>
  );
}

function NavButtons({ onBack, onNext, disabled }: { onBack: () => void; onNext: () => void; disabled?: boolean }) {
  return (
    <div className="flex gap-3 pt-2">
      <button onClick={onBack} className="px-4 py-2.5 rounded-lg border border-border text-text-secondary text-sm hover:bg-surface-hover transition-colors">Atras</button>
      <button onClick={onNext} disabled={disabled} className="flex-1 px-4 py-2.5 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors">Siguiente</button>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-1 border-b border-border/50">
      <span className="text-text-muted">{label}</span>
      <span className="text-text font-medium text-right max-w-[60%] truncate">{value}</span>
    </div>
  );
}

// ---- Icons ----

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7,10 12,15 17,10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <polyline points="22,4 12,14.01 9,11.01" />
    </svg>
  );
}

function ErrorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="15" y1="9" x2="9" y2="15" />
      <line x1="9" y1="9" x2="15" y2="15" />
    </svg>
  );
}

function AIButton({ label, loading, disabled, error, onClick, hint }: {
  label: string; loading: boolean; disabled: boolean; error?: string | null; onClick: () => void; hint?: string;
}) {
  return (
    <div className="space-y-1">
      <button
        onClick={onClick}
        disabled={disabled || loading}
        className={`w-full px-4 py-2 rounded-lg border text-sm transition-colors ${
          disabled
            ? 'border-dashed border-border text-text-muted opacity-50 cursor-not-allowed'
            : 'border-primary/30 text-primary hover:bg-primary/5 cursor-pointer'
        }`}
      >
        {loading ? 'Procesando...' : label}
      </button>
      {hint && <p className="text-xs text-text-muted text-center">{hint}</p>}
      {error && <p className="text-xs text-red-500 text-center">{error}</p>}
    </div>
  );
}
