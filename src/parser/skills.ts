import type { Skills } from '@/shared/schema/profile';
import { lineText, type TextLine } from '@/shared/text-line';
import { stripBullet } from './entries';
import { splitList } from './text';
import type { ParseWarning, Parsed } from './types';

const LABEL = /^([^：:]{1,24})[：:]\s*(.+)$/;
const PROGRAMMING = /^(python|java|c|c\+\+|c#|go|golang|rust|javascript|typescript|sql|kotlin|swift|r|matlab|scala|php|ruby)$/i;

const RULES: readonly (readonly [keyof Skills, RegExp])[] = [
  ['languages', /编程|开发语言|programming|coding/i],
  ['tools', /工具|工程|平台|数据库|运维|tool|platform|database|devops|cloud/i],
  ['frameworks', /框架|库|\bAI\b|\bML\b|机器学习|深度学习|framework|librar/i],
  ['langCerts', /语言|外语|证书|英语|日语|韩语|德语|法语|雅思|托福|ielts|toefl|language|certif/i],
];

function classify(label: string, values: readonly string[]): keyof Skills | null {
  const key = RULES.find(([, re]) => re.test(label))?.[0] ?? null;
  if (key === 'langCerts' && values.some((v) => PROGRAMMING.test(v))) return 'languages';
  return key;
}

const emptySkills = (): Skills => ({ languages: [], frameworks: [], tools: [], langCerts: [] });

export function parseSkills(lines: readonly TextLine[]): Parsed<Skills> {
  const texts = lines.map((l) => stripBullet(lineText(l))).filter(Boolean);
  return texts.reduce<Parsed<Skills>>(
    (acc, text) => {
      const match = LABEL.exec(text);
      const label = match?.[1] ?? '';
      const values = splitList(match ? (match[2] ?? '') : text);
      const key = match ? classify(label, values) : null;
      const target = key ?? 'tools';
      const warning: ParseWarning[] = match && !key
        ? [{ path: 'skills.tools', message: `未知技能分类「${label.trim()}」，已归入工具` }]
        : [];
      return {
        value: { ...acc.value, [target]: [...acc.value[target], ...values] },
        warnings: [...acc.warnings, ...warning],
      };
    },
    { value: emptySkills(), warnings: [] },
  );
}
