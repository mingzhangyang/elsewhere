import { useLayoutEffect, type RefObject } from 'react';

// Keep in step with the mobile inspector breakpoint in styles.css.
const DRAWER_MEDIA = '(max-width: 680px), (max-width: 1000px) and (pointer: coarse)';

/** Background controls covered by a mobile drawer must not receive input or keyboard focus. */
export function useDrawerFocus(ref: RefObject<HTMLElement>, open: boolean) {
  useLayoutEffect(() => {
    const drawer = ref.current;
    if (!open || !drawer || !window.matchMedia) return;
    const media = window.matchMedia(DRAWER_MEDIA);
    let release = () => {};
    const update = () => {
      release();
      release = () => {};
      if (!media.matches) return;

      // Inert sibling branches, never an ancestor of the drawer. Preserve pre-existing inert state.
      const background = new Map<HTMLElement, boolean>();
      let branch: HTMLElement = drawer;
      while (branch.parentElement && branch !== document.body) {
        for (const sibling of branch.parentElement.children) {
          // Closed dialogs are already unfocusable. Explicit inert would survive showModal().
          if (sibling.matches('dialog:not([open])')) continue;
          if (sibling !== branch && sibling instanceof HTMLElement) {
            background.set(sibling, sibling.inert);
            sibling.inert = true;
          }
        }
        branch = branch.parentElement;
        if (branch.classList.contains('app-shell')) break;
      }
      const heading = drawer.querySelector<HTMLElement>('h2');
      if (!drawer.contains(document.activeElement)) heading?.focus({ preventScroll: true });
      const trap = (event: KeyboardEvent) => {
        if (event.key !== 'Tab') return;
        const stops = [
          ...drawer.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]'),
        ].filter(
          (element) =>
            element.tabIndex >= 0 &&
            !element.matches(':disabled') &&
            !element.closest('[inert]') &&
            element.getClientRects().length > 0 &&
            getComputedStyle(element).visibility !== 'hidden',
        );
        const first = stops[0];
        const last = stops[stops.length - 1];
        const current = document.activeElement;
        if (!first) {
          event.preventDefault();
          heading?.focus();
        } else if (event.shiftKey && (current === first || !stops.includes(current as HTMLElement))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (current === last || !drawer.contains(current))) {
          event.preventDefault();
          first.focus();
        }
      };
      drawer.addEventListener('keydown', trap);
      release = () => {
        drawer.removeEventListener('keydown', trap);
        for (const [element, wasInert] of background) element.inert = wasInert;
      };
    };
    update();
    media.addEventListener('change', update);
    return () => {
      media.removeEventListener('change', update);
      release();
    };
  }, [ref, open]);
}
