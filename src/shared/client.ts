import type { RequestMessage, ResponseMessage } from '@shared/messages';

/** Promisified wrapper around chrome.runtime.sendMessage with typed responses. */
export function sendMessage(message: RequestMessage): Promise<ResponseMessage> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response: ResponseMessage) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        resolve({ ok: false, error: lastError.message ?? 'Extension messaging error.' });
        return;
      }
      resolve(response);
    });
  });
}

/** Reads the active tab's URL (used by the popup's "Track Current Build"). */
export function getActiveTabUrl(): Promise<string | undefined> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs[0]?.url);
    });
  });
}
