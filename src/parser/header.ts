import type { Basic } from '@/shared/schema/profile';
import { lineText, type TextLine } from '@/shared/text-line';
import { extractContacts } from './contacts';
import { type Parsed, warnings } from './types';

const NAME_SPLIT = /\s*[|｜·•]\s*/;
const TITLE_LINE = /^(个人简历|简历|求职简历|resume|curriculum vitae|cv)$/i;

const isName = (text: string) => text.length >= 2 && text.length <= 40 && !/[\d@:：/]/.test(text);

/** “李明 13800138000”这类首行：取数字之前的词作为姓名候选。 */
function leadingWords(text: string): string {
  const words = text.split(/\s+/);
  const firstDigit = words.findIndex((w) => /\d/.test(w));
  return firstDigit > 0 ? words.slice(0, firstDigit).join(' ') : '';
}

/** 姓名取首行（跳过“个人简历”等标题行）的第一个片段。 */
function findName(header: readonly TextLine[]): string {
  const first = header[0] && TITLE_LINE.test(lineText(header[0]).trim()) ? header[1] : header[0];
  const candidate = first?.segments[0]?.split(NAME_SPLIT)[0]?.trim() ?? '';
  if (isName(candidate)) return candidate;
  const lead = leadingWords(candidate);
  return isName(lead) ? lead : '';
}

/** 联系方式先在页眉找；手机号和邮箱找不到时再在全文中找，链接只认页眉里的。 */
export function parseHeader(header: readonly TextLine[], fullText: string): Parsed<Basic> {
  const name = findName(header);
  const local = extractContacts(header.map(lineText).join(' | '));
  const global = extractContacts(fullText);
  const value: Basic = {
    name,
    phone: local.phone ?? global.phone ?? '',
    email: local.email ?? global.email ?? '',
    linkedin: local.linkedin,
    github: local.github,
    website: local.website,
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
