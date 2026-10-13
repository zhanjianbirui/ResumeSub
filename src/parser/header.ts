import type { Basic } from '@/shared/schema/profile';
import { lineText, type TextLine } from '@/shared/text-line';
import { extractContacts } from './contacts';
import { type Parsed, warnings } from './types';

const NAME_SPLIT = /\s*[|｜·•]\s*/;

const isName = (text: string) => text.length >= 2 && text.length <= 40 && !/[\d@:：/]/.test(text);

/** 姓名取首行的第一个片段；联系方式先在页眉找，找不到再在全文中找。 */
export function parseHeader(header: readonly TextLine[], fullText: string): Parsed<Basic> {
  const candidate = header[0]?.segments[0]?.split(NAME_SPLIT)[0]?.trim() ?? '';
  const name = isName(candidate) ? candidate : '';
  const local = extractContacts(header.map(lineText).join(' | '));
  const global = extractContacts(fullText);
  const contacts = { ...global, ...local };
  const value: Basic = {
    name,
    phone: contacts.phone ?? '',
    email: contacts.email ?? '',
    linkedin: contacts.linkedin,
    github: contacts.github,
    website: contacts.website,
  };
  return {
    value,
    warnings: warnings([
      [!name, 'basic.name', '未识别到姓名'],
      [!value.phone, 'basic.phone', '未识别到手机号'],
      [!value.email, 'basic.email', '未识别到邮箱'],
    ]),
  };
}
