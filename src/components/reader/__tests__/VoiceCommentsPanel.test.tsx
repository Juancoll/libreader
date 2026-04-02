/**
 * Tests for VoiceCommentsPanel component.
 * Tests recording UI states, playback, comment listing, and deletion.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VoiceCommentsPanel } from '@/components/reader/VoiceCommentsPanel';
import type { FSAdapter } from '@/services/vaultParser';

// ---- Mocks ----

// Mock the voiceRecorder service
const mockLoadVoiceComments = vi.fn();
const mockSaveVoiceComment = vi.fn();
const mockDeleteVoiceComment = vi.fn();
const mockIsRecordingSupported = vi.fn();
const mockRequestMicrophoneAccess = vi.fn();
const mockCreateRecorder = vi.fn();

vi.mock('@/services/voiceRecorder', () => ({
  isRecordingSupported: (...args: unknown[]) => mockIsRecordingSupported(...args),
  requestMicrophoneAccess: (...args: unknown[]) => mockRequestMicrophoneAccess(...args),
  createRecorder: (...args: unknown[]) => mockCreateRecorder(...args),
  saveVoiceComment: (...args: unknown[]) => mockSaveVoiceComment(...args),
  loadVoiceComments: (...args: unknown[]) => mockLoadVoiceComments(...args),
  deleteVoiceComment: (...args: unknown[]) => mockDeleteVoiceComment(...args),
}));

// ---- Helpers ----

function createMockFS(): FSAdapter {
  return {
    readFile: vi.fn().mockResolvedValue(''),
    readBinaryFile: vi.fn().mockResolvedValue(new ArrayBuffer(0)),
    readDir: vi.fn().mockResolvedValue([]),
    writeFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
    exists: vi.fn().mockResolvedValue(false),
    getFileUrl: vi.fn().mockResolvedValue(''),
  };
}

function renderPanel(overrides: Partial<Parameters<typeof VoiceCommentsPanel>[0]> = {}) {
  const defaults = {
    fs: createMockFS(),
    filePath: 'books/TestBook/TestBook.epub',
    currentLocation: 'epubcfi(/6/4!/4/2/1:0)',
    variant: 'panel' as const,
  };
  return render(<VoiceCommentsPanel {...defaults} {...overrides} />);
}

// ---- Tests ----

describe('VoiceCommentsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockLoadVoiceComments.mockResolvedValue([]);
    mockIsRecordingSupported.mockReturnValue(true);
  });

  describe('rendering', () => {
    it('shows the header with comment count', async () => {
      renderPanel();
      expect(screen.getByText('Comentarios de voz (0)')).toBeInTheDocument();
    });

    it('shows empty state message when no comments', async () => {
      renderPanel();
      await waitFor(() => {
        expect(screen.getByText('Sin comentarios de voz')).toBeInTheDocument();
      });
    });

    it('shows record button when recording is supported', () => {
      mockIsRecordingSupported.mockReturnValue(true);
      renderPanel();
      expect(screen.getByText('Grabar comentario')).toBeInTheDocument();
    });

    it('shows unsupported message when recording is not available', () => {
      mockIsRecordingSupported.mockReturnValue(false);
      renderPanel();
      expect(screen.getByText('La grabacion de audio no esta disponible en este navegador')).toBeInTheDocument();
      expect(screen.queryByText('Grabar comentario')).not.toBeInTheDocument();
    });

    it('loads existing comments on mount', () => {
      const fs = createMockFS();
      renderPanel({ fs });
      expect(mockLoadVoiceComments).toHaveBeenCalledWith(fs, 'books/TestBook/TestBook.epub');
    });

    it('renders with sidebar variant styles', () => {
      const { container } = renderPanel({
        variant: 'sidebar',
        theme: { bg: '#fff', text: '#000', border: '#eee' },
      });
      // Sidebar variant wraps in p-4 space-y-3
      expect(container.firstChild).toHaveClass('p-4', 'space-y-3');
    });

    it('renders with overlay variant styles', () => {
      renderPanel({ variant: 'overlay' });
      const header = screen.getByText('Comentarios de voz (0)');
      expect(header).toHaveClass('text-white');
    });
  });

  describe('comment listing', () => {
    it('displays loaded comments with duration and location', async () => {
      mockLoadVoiceComments.mockResolvedValue([
        {
          id: 'vc_1',
          filePath: 'books/TestBook/TestBook.epub.reading/voice/vc_1.webm',
          duration: 15,
          location: 'page:5',
          createdAt: '2025-06-15T10:30:00.000Z',
        },
        {
          id: 'vc_2',
          filePath: 'books/TestBook/TestBook.epub.reading/voice/vc_2.webm',
          duration: 63,
          location: 'page:12',
          createdAt: '2025-06-16T14:00:00.000Z',
        },
      ]);

      renderPanel();

      await waitFor(() => {
        expect(screen.getByText('Comentarios de voz (2)')).toBeInTheDocument();
      });

      // Duration formatted as m:ss
      expect(screen.getByText('0:15')).toBeInTheDocument();
      expect(screen.getByText('1:03')).toBeInTheDocument();

      // Location
      expect(screen.getByText('page:5')).toBeInTheDocument();
      expect(screen.getByText('page:12')).toBeInTheDocument();
    });

    it('displays selected text excerpt for comments', async () => {
      mockLoadVoiceComments.mockResolvedValue([
        {
          id: 'vc_1',
          filePath: 'path/to/voice.webm',
          duration: 10,
          location: 'cfi:test',
          selectedText: 'El principio de la sabiduria es el temor del Senor',
          createdAt: '2025-06-15T10:30:00.000Z',
        },
      ]);

      renderPanel();

      await waitFor(() => {
        expect(screen.getByText(/El principio de la sabiduria/)).toBeInTheDocument();
      });
    });
  });

  describe('recording', () => {
    it('shows requesting state when starting to record', async () => {
      const user = userEvent.setup();
      // Make requestMicrophoneAccess hang (never resolve)
      mockRequestMicrophoneAccess.mockReturnValue(new Promise(() => {}));

      renderPanel();
      await user.click(screen.getByText('Grabar comentario'));

      expect(screen.getByText('Solicitando microfono...')).toBeInTheDocument();
    });

    it('shows recording state after microphone is granted', async () => {
      const user = userEvent.setup();
      const mockStream = {
        getTracks: () => [{ stop: vi.fn() }],
      };
      const mockRecorder = {
        start: vi.fn(),
        stop: vi.fn(),
        state: 'recording',
        ondataavailable: null,
        onstop: null,
      };
      mockRequestMicrophoneAccess.mockResolvedValue(mockStream);
      mockCreateRecorder.mockReturnValue({
        recorder: mockRecorder,
        getBlob: vi.fn().mockResolvedValue(new Blob(['audio'], { type: 'audio/webm' })),
      });

      renderPanel();
      await user.click(screen.getByText('Grabar comentario'));

      await waitFor(() => {
        expect(screen.getByText(/Grabando\.\.\./)).toBeInTheDocument();
      });
      expect(mockRecorder.start).toHaveBeenCalledWith(100);
    });

    it('shows error when microphone permission is denied', async () => {
      const user = userEvent.setup();
      const permError = new DOMException('Permission denied', 'NotAllowedError');
      mockRequestMicrophoneAccess.mockRejectedValue(permError);

      renderPanel();
      await user.click(screen.getByText('Grabar comentario'));

      await waitFor(() => {
        expect(screen.getByText('Permiso de microfono denegado')).toBeInTheDocument();
      });
      // Should return to idle state (record button visible again)
      expect(screen.getByText('Grabar comentario')).toBeInTheDocument();
    });

    it('shows generic error for non-permission failures', async () => {
      const user = userEvent.setup();
      mockRequestMicrophoneAccess.mockRejectedValue(new Error('Device not found'));

      renderPanel();
      await user.click(screen.getByText('Grabar comentario'));

      await waitFor(() => {
        expect(screen.getByText('Error al iniciar la grabacion')).toBeInTheDocument();
      });
    });

    it('saves comment when recording is stopped', async () => {
      const user = userEvent.setup();
      const stopTrack = vi.fn();
      const mockStream = { getTracks: () => [{ stop: stopTrack }] };
      const mockRecorder = {
        start: vi.fn(),
        stop: vi.fn(),
        state: 'recording',
        ondataavailable: null as any,
        onstop: null as any,
      };
      const audioBlob = new Blob(['audio'], { type: 'audio/webm' });
      mockRequestMicrophoneAccess.mockResolvedValue(mockStream);
      mockCreateRecorder.mockReturnValue({
        recorder: mockRecorder,
        getBlob: vi.fn().mockResolvedValue(audioBlob),
      });
      mockSaveVoiceComment.mockResolvedValue({
        id: 'vc_new',
        filePath: 'path/to/vc_new.webm',
        duration: 5,
        location: 'epubcfi(/6/4!/4/2/1:0)',
        createdAt: '2025-06-20T12:00:00.000Z',
      });

      const fs = createMockFS();
      renderPanel({ fs });

      // Start recording
      await user.click(screen.getByText('Grabar comentario'));
      await waitFor(() => {
        expect(screen.getByText(/Grabando\.\.\./)).toBeInTheDocument();
      });

      // Stop recording
      await user.click(screen.getByText(/Clic para detener/));

      await waitFor(() => {
        expect(mockSaveVoiceComment).toHaveBeenCalled();
      });

      // Verify mic tracks stopped
      expect(stopTrack).toHaveBeenCalled();
    });
  });

  describe('deletion', () => {
    it('calls deleteVoiceComment and removes from list', async () => {
      const user = userEvent.setup();
      mockLoadVoiceComments.mockResolvedValue([
        {
          id: 'vc_del',
          filePath: 'path/voice.webm',
          duration: 8,
          location: 'page:3',
          createdAt: '2025-06-15T10:00:00.000Z',
        },
      ]);
      mockDeleteVoiceComment.mockResolvedValue(undefined);

      const fs = createMockFS();
      renderPanel({ fs });

      await waitFor(() => {
        expect(screen.getByText('Comentarios de voz (1)')).toBeInTheDocument();
      });

      // Find and click the delete button
      const deleteBtn = screen.getByTitle('Eliminar');
      await user.click(deleteBtn);

      await waitFor(() => {
        expect(mockDeleteVoiceComment).toHaveBeenCalledWith(fs, 'books/TestBook/TestBook.epub', 'vc_del');
      });

      await waitFor(() => {
        expect(screen.getByText('Comentarios de voz (0)')).toBeInTheDocument();
      });
    });

    it('shows error when deletion fails', async () => {
      const user = userEvent.setup();
      mockLoadVoiceComments.mockResolvedValue([
        {
          id: 'vc_fail',
          filePath: 'path/voice.webm',
          duration: 5,
          location: 'page:1',
          createdAt: '2025-06-15T10:00:00.000Z',
        },
      ]);
      mockDeleteVoiceComment.mockRejectedValue(new Error('write error'));

      renderPanel();

      await waitFor(() => {
        expect(screen.getByText('Comentarios de voz (1)')).toBeInTheDocument();
      });

      const deleteBtn = screen.getByTitle('Eliminar');
      await user.click(deleteBtn);

      await waitFor(() => {
        expect(screen.getByText('Error al eliminar el comentario')).toBeInTheDocument();
      });
    });
  });

  describe('playback', () => {
    it('renders play buttons for each comment', async () => {
      mockLoadVoiceComments.mockResolvedValue([
        {
          id: 'vc_play1',
          filePath: 'path/voice1.webm',
          duration: 10,
          location: 'page:1',
          createdAt: '2025-06-15T10:00:00.000Z',
        },
        {
          id: 'vc_play2',
          filePath: 'path/voice2.webm',
          duration: 20,
          location: 'page:2',
          createdAt: '2025-06-16T10:00:00.000Z',
        },
      ]);

      renderPanel();

      await waitFor(() => {
        const playButtons = screen.getAllByTitle('Reproducir');
        expect(playButtons).toHaveLength(2);
      });
    });

    it('loads audio from vault when blobUrl is not available', async () => {
      const user = userEvent.setup();
      const fs = createMockFS();
      // Return base64-encoded audio
      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValue(btoa('fake audio data'));

      mockLoadVoiceComments.mockResolvedValue([
        {
          id: 'vc_load',
          filePath: 'path/voice.webm',
          duration: 5,
          location: 'page:1',
          createdAt: '2025-06-15T10:00:00.000Z',
          blobUrl: undefined,
        },
      ]);

      // Mock Audio constructor
      const playMock = vi.fn().mockResolvedValue(undefined);
      const mockAudio = { play: playMock, pause: vi.fn(), onended: null as any, onerror: null as any };
      const AudioOriginal = globalThis.Audio;
      globalThis.Audio = vi.fn().mockImplementation(function() {
        return mockAudio;
      }) as unknown as typeof Audio;

      renderPanel({ fs });

      await waitFor(() => {
        expect(screen.getByTitle('Reproducir')).toBeInTheDocument();
      });

      await user.click(screen.getByTitle('Reproducir'));

      await waitFor(() => {
        expect(fs.readFile).toHaveBeenCalledWith('path/voice.webm.b64');
      });

      globalThis.Audio = AudioOriginal;
    });
  });
});
