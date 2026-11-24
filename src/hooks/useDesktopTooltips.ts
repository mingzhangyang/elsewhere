import { useEffect } from 'react';

const CONTROLS = [
  'button.icon-button[aria-label]',
  '.location-trigger[aria-label]',
  '.time-readout[aria-label]',
  '.play-button[aria-label]',
  '.timeline-row input[aria-label]',
  '.timeline-row select[aria-label]',
  '[data-tooltip]',
].join(', ');

function control(target: EventTarget | null): HTMLElement | null {
  return target instanceof Element ? target.closest<HTMLElement>(CONTROLS) : null;
}

function label(target: HTMLElement) {
  return target.dataset.tooltip || target.getAttribute('aria-label') || '';
}

/** One visual hint for existing accessible control names; no React updates on pointer movement. */
export function useDesktopTooltips() {
  useEffect(() => {
    const media = window.matchMedia?.('(hover: hover) and (pointer: fine)');
    if (!media) return;
    const tooltip = document.createElement('div');
    tooltip.className = 'desktop-tooltip';
    // These hints mirror accessible names or explain already labelled controls.
    tooltip.setAttribute('aria-hidden', 'true');
    const topLayer = typeof tooltip.showPopover === 'function';
    if (topLayer) tooltip.setAttribute('popover', 'manual');

    let anchor: HTMLElement | null = null;
    let timer: number | undefined;

    function cancelTimer() {
      window.clearTimeout(timer);
      timer = undefined;
    }

    function hide() {
      cancelTimer();
      observer.disconnect();
      if (topLayer && tooltip.matches(':popover-open')) tooltip.hidePopover();
      tooltip.remove();
      anchor = null;
    }

    function position(target: HTMLElement) {
      const rect = target.getBoundingClientRect();
      const { width, height } = tooltip.getBoundingClientRect();
      const edge = 8;
      const gap = 5;
      const left = Math.max(
        edge,
        Math.min(rect.left + (rect.width - width) / 2, window.innerWidth - width - edge),
      );
      const above = rect.top - height - gap;
      const below = rect.bottom + gap;
      const top = Math.max(edge, Math.min(above >= edge ? above : below, window.innerHeight - height - edge));
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    }

    const observer = new MutationObserver(() => {
      if (!anchor || !anchor.isConnected || anchor.closest('dialog:not([open])')) {
        hide();
      } else if (tooltip.textContent !== label(anchor)) {
        tooltip.textContent = label(anchor);
        if (!tooltip.textContent) hide();
        else position(anchor);
      }
    });

    function show() {
      if (!anchor || !media?.matches || !anchor.isConnected || !anchor.getClientRects().length) {
        hide();
        return;
      }
      const dialog = anchor.closest('dialog');
      const text = label(anchor);
      if (!text || (dialog && !dialog.open) || getComputedStyle(anchor).visibility !== 'visible') {
        hide();
        return;
      }
      tooltip.textContent = text;
      // A native modal makes the rest of the document inert. Keep its hint inside the modal.
      (dialog ?? document.body).append(tooltip);
      if (topLayer) tooltip.showPopover();
      position(anchor);
      observer.observe(anchor, { attributes: true, attributeFilter: ['aria-label', 'data-tooltip'] });
      // Remove stale hints when an inspector, dialog, or notice disappears.
      observer.observe(document.body, { childList: true, subtree: true });
      if (dialog) observer.observe(dialog, { attributes: true, attributeFilter: ['open'] });
    }

    function schedule(target: HTMLElement) {
      if (!media?.matches || target.matches(':disabled') || !label(target)) return;
      if (anchor === target) {
        if (tooltip.isConnected) cancelTimer();
        return;
      }
      hide();
      anchor = target;
      timer = window.setTimeout(show, 350);
    }

    function pointerOver(event: PointerEvent) {
      if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return;
      if (event.target === tooltip) {
        cancelTimer();
        return;
      }
      const target = control(event.target);
      if (target && target !== control(event.relatedTarget)) schedule(target);
    }

    function pointerOut(event: PointerEvent) {
      if (!anchor || (event.pointerType !== 'mouse' && event.pointerType !== 'pen')) return;
      if (event.target !== tooltip && control(event.target) !== anchor) return;
      if (event.relatedTarget === tooltip || control(event.relatedTarget) === anchor) return;
      if (!tooltip.isConnected) {
        hide();
        return;
      }
      cancelTimer();
      // Allow moving across the small gap onto the hint without losing it.
      timer = window.setTimeout(hide, 180);
    }

    function focusIn(event: FocusEvent) {
      const target = control(event.target);
      if (target?.matches(':focus-visible')) schedule(target);
    }

    function focusOut(event: FocusEvent) {
      if (anchor && control(event.target) === anchor) hide();
    }

    function keyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') hide();
    }

    document.addEventListener('pointerover', pointerOver);
    document.addEventListener('pointerout', pointerOut);
    document.addEventListener('pointerdown', hide, true);
    document.addEventListener('focusin', focusIn);
    document.addEventListener('focusout', focusOut);
    document.addEventListener('keydown', keyDown, true);
    document.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    window.addEventListener('blur', hide);
    media.addEventListener?.('change', hide);

    return () => {
      hide();
      document.removeEventListener('pointerover', pointerOver);
      document.removeEventListener('pointerout', pointerOut);
      document.removeEventListener('pointerdown', hide, true);
      document.removeEventListener('focusin', focusIn);
      document.removeEventListener('focusout', focusOut);
      document.removeEventListener('keydown', keyDown, true);
      document.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
      window.removeEventListener('blur', hide);
      media.removeEventListener?.('change', hide);
    };
  }, []);
}
