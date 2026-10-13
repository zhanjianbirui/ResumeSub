import type { Basic, Profile, Skills } from '@/shared/schema/profile';

const pick = <T>(next: readonly T[], prev: readonly T[]): T[] => (next.length > 0 ? [...next] : [...prev]);

function nonEmpty(basic: Basic): Partial<Basic> {
  return Object.fromEntries(
    Object.entries(basic).filter(([, value]) => typeof value === 'string' && value.trim() !== ''),
  ) as Partial<Basic>;
}

function mergeSkills(current: Skills, parsed: Skills): Skills {
  return {
    languages: pick(parsed.languages, current.languages),
    frameworks: pick(parsed.frameworks, current.frameworks),
    tools: pick(parsed.tools, current.tools),
    langCerts: pick(parsed.langCerts, current.langCerts),
  };
}

/** 合并策略：基本信息中解析到的非空字段覆盖；列表只在解析结果非空时整体替换；求职偏好和自定义字段始终保留。 */
export function mergeParsed(current: Profile, parsed: Profile): Profile {
  return {
    ...current,
    basic: { ...current.basic, ...nonEmpty(parsed.basic) },
    education: pick(parsed.education, current.education),
    experience: pick(parsed.experience, current.experience),
    projects: pick(parsed.projects, current.projects),
    awards: pick(parsed.awards, current.awards),
    skills: mergeSkills(current.skills, parsed.skills),
  };
}
