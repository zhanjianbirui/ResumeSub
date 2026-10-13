const STYLES = {
  filled: '2px solid #2da44e',
  unfilled: '2px dashed #8c959f',
} as const;

export function markField(el: HTMLElement, state: keyof typeof STYLES): void {
  el.dataset.resumesub = state;
  el.style.setProperty('outline', STYLES[state], 'important');
  el.style.setProperty('outline-offset', '1px', 'important');
}
