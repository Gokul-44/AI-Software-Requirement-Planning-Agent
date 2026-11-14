import { useEffect } from 'react';

export const PRODUCT_NAME = 'SPM Planning Agent';

/** Sets the browser tab title for the current route. */
export function useDocumentTitle(title: string | null | undefined): void {
  useEffect(() => {
    document.title = title
      ? `${title} · ${PRODUCT_NAME}`
      : `${PRODUCT_NAME} · AI generates, algorithms verify`;
  }, [title]);
}
