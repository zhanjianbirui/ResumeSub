const EMAIL = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/;
const CN_MOBILE = /(?<![\w.@])(?:\+?86[\s-]?)?1[3-9]\d(?:[\s-]?\d{4}){2}(?!\d)/;
const INTL_PHONE = /\+\d{1,3}[\s-]?\d[\d\s-]{6,14}\d/;
const LINKEDIN = /(?:https?:\/\/)?(?:[\w-]+\.)?linkedin\.com\/[^\s|｜,，]+/i;
const GITHUB = /(?:https?:\/\/)?(?:www\.)?github\.com\/[^\s|｜,，]+/i;
const URL = /https?:\/\/[^\s|｜,，]+/gi;

export interface Contacts {
  phone?: string;
  email?: string;
  linkedin?: string;
  github?: string;
  website?: string;
}

export function extractContacts(text: string): Contacts {
  const phone = (text.match(CN_MOBILE) ?? text.match(INTL_PHONE))?.[0].replace(/[\s-]/g, '');
  const website = [...text.matchAll(URL)].map((m) => m[0]).find((u) => !/linkedin\.com|github\.com/i.test(u));
  const found: Contacts = {
    email: text.match(EMAIL)?.[0],
    phone,
    linkedin: text.match(LINKEDIN)?.[0],
    github: text.match(GITHUB)?.[0],
    website,
  };
  return Object.fromEntries(Object.entries(found).filter(([, v]) => v !== undefined)) as Contacts;
}
