/**
 * Voice Recording Service
 * Records audio comments using the MediaRecorder API.
 * Saves recordings as WebM/Opus files in the vault's .reading/ directory.
 */

import type { FSAdapter } from './vaultParser';

export interface VoiceComment {
  id: string;
  /** Path to the audio file in the vault */
  filePath: string;
  /** Duration in seconds */
  duration: number;
  /** Blob URL for playback (runtime only, not persisted) */
  blobUrl?: string;
  /** Location in the document (CFI for epub, page for pdf/comic) */
  location: string;
  /** Associated text selection if any */
  selectedText?: string;
  /** Linked annotation ID (if this voice comment is attached to a highlight/bookmark) */
  annotationId?: string;
  createdAt: string;
}

export interface VoiceCommentIndex {
  file: string;
  comments: Omit<VoiceComment, 'blobUrl'>[];
}

/**
 * Check if the browser supports audio recording.
 */
export function isRecordingSupported(): boolean {
  return typeof navigator.mediaDevices?.getUserMedia === 'function' && typeof window.MediaRecorder !== 'undefined';
}

/**
 * Request microphone access.
 */
export async function requestMicrophoneAccess(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      sampleRate: 48000,
    },
  });
}

/**
 * Create a recorder instance that captures audio chunks.
 */
export function createRecorder(stream: MediaStream): {
  recorder: MediaRecorder;
  getBlob: () => Promise<Blob>;
} {
  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus'
    : MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : 'audio/ogg';

  const recorder = new MediaRecorder(stream, {
    mimeType,
    audioBitsPerSecond: 64000,
  });

  const chunks: Blob[] = [];

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) {
      chunks.push(e.data);
    }
  };

  const getBlob = (): Promise<Blob> => {
    return new Promise((resolve) => {
      if (recorder.state === 'inactive') {
        resolve(new Blob(chunks, { type: mimeType }));
        return;
      }
      recorder.onstop = () => {
        resolve(new Blob(chunks, { type: mimeType }));
      };
    });
  };

  return { recorder, getBlob };
}

/**
 * Save a voice comment audio file to the vault.
 */
export async function saveVoiceComment(
  fs: FSAdapter,
  itemFilePath: string,
  audioBlob: Blob,
  comment: Omit<VoiceComment, 'filePath' | 'blobUrl'>
): Promise<VoiceComment> {
  const readingDir = `${itemFilePath}.reading`;
  const voiceDir = `${readingDir}/voice`;
  await fs.mkdir(voiceDir);

  // Save audio file as base64 (since writeFile only supports strings)
  const arrayBuffer = await audioBlob.arrayBuffer();
  const uint8 = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < uint8.length; i++) {
    binary += String.fromCharCode(uint8[i]);
  }
  const base64 = btoa(binary);

  const ext = audioBlob.type.includes('webm') ? 'webm' : 'ogg';
  const audioPath = `${voiceDir}/${comment.id}.${ext}`;

  // Write as a data URI text file (will be read back and converted)
  await fs.writeFile(audioPath + '.b64', base64);

  // Update index
  const indexPath = `${readingDir}/voice-comments.json`;
  let index: VoiceCommentIndex;
  try {
    const existing = await fs.readFile(indexPath);
    index = JSON.parse(existing);
  } catch {
    index = {
      file: itemFilePath.split('/').pop() || itemFilePath,
      comments: [],
    };
  }

  const voiceComment: VoiceComment = {
    ...comment,
    filePath: audioPath,
    blobUrl: URL.createObjectURL(audioBlob),
  };

  index.comments.push({
    id: comment.id,
    filePath: audioPath,
    duration: comment.duration,
    location: comment.location,
    selectedText: comment.selectedText,
    annotationId: comment.annotationId,
    createdAt: comment.createdAt,
  });

  await fs.writeFile(indexPath, JSON.stringify(index, null, 2));

  return voiceComment;
}

/**
 * Load voice comments index for an item.
 */
export async function loadVoiceComments(
  fs: FSAdapter,
  itemFilePath: string
): Promise<VoiceComment[]> {
  try {
    const readingDir = `${itemFilePath}.reading`;
    const indexPath = `${readingDir}/voice-comments.json`;
    const content = await fs.readFile(indexPath);
    const index: VoiceCommentIndex = JSON.parse(content);
    return index.comments.map((c) => ({ ...c, blobUrl: undefined }));
  } catch {
    return [];
  }
}

/**
 * Delete a voice comment from the vault.
 */
export async function deleteVoiceComment(
  fs: FSAdapter,
  itemFilePath: string,
  commentId: string
): Promise<void> {
  const readingDir = `${itemFilePath}.reading`;
  const indexPath = `${readingDir}/voice-comments.json`;

  try {
    const content = await fs.readFile(indexPath);
    const index: VoiceCommentIndex = JSON.parse(content);
    index.comments = index.comments.filter((c) => c.id !== commentId);
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
  } catch {
    // Index doesn't exist, nothing to delete
  }
}
