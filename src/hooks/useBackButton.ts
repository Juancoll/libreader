import { useEffect } from 'react';
import { isTauriNative } from '@/services/tauriFS';

/**
 * Global back button callback stack.
 * Only the LAST registered handler is called when the hardware back button is pressed.
 * This mimics the Android activity back stack: readers override app-level navigation.
 */
const backHandlerStack: Array<{ id: number; handler: () => void }> = [];
let nextId = 0;
let listenerRegistered = false;

function registerGlobalListener() {
  if (listenerRegistered) return;
  listenerRegistered = true;

  // On Tauri Android, listen for the back button via window event
  // Tauri emits a custom event for the Android back button
  document.addEventListener('keydown', (e) => {
    // Android back button maps to Escape in WebView
    if (e.key === 'Escape' || e.key === 'GoBack') {
      if (backHandlerStack.length > 0) {
        e.preventDefault();
        backHandlerStack[backHandlerStack.length - 1].handler();
      }
    }
  });
}

/**
 * Register a handler for the Android hardware back button.
 *
 * Only the most recently registered handler is invoked (stack-based priority).
 * When the component unmounts, its handler is removed and the previous one
 * becomes active again.
 *
 * On web (non-native), this hook is a no-op.
 *
 * @param handler Callback to run when the back button is pressed.
 *                Should handle cascade close (reader) or navigation (app-level).
 */
export function useBackButton(handler: () => void) {
  useEffect(() => {
    if (!isTauriNative()) return;

    // Ensure the global listener is registered once
    registerGlobalListener();

    // Register this handler on the stack
    const id = nextId++;
    backHandlerStack.push({ id, handler });

    return () => {
      // Remove this handler from the stack
      const idx = backHandlerStack.findIndex((h) => h.id === id);
      if (idx !== -1) backHandlerStack.splice(idx, 1);
    };
  });
  // No dep array: re-registers every render to keep handler closure fresh.
}
