export const clean = (text: string | null | undefined): string => (text ?? '').replace(/\s+/g, ' ').trim();
