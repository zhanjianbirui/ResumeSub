import * as v from 'valibot';
import { describe, expect, it, vi } from 'vitest';
import { normalizeMonth, parseResumeWithLlm, sanitizeProfile } from '@/background/llm/parse-resume';
import { ProfileSchema } from '@/shared/schema/profile';

const cfg = { provider: 'openai-compatible' as const, baseUrl: 'https://x/v1', model: 'm', apiKey: 'k' };

describe('sanitizeProfile', () => {
  it('normalises dates, degrees and gender and drops unknown junk', () => {
    const profile = sanitizeProfile({
      basic: { name: '张三', phone: 13800000000, email: 'z@example.com', gender: '男', birthDate: '2000/5/7', hacker: 'x' },
      education: [{ school: '示例大学', degree: '硕士研究生', major: 'AI', start: '2025.9', end: '至今' }],
      experience: [{ company: 'Acme', title: 'Intern', start: '2024-06', end: 'bad', bullets: ['做了 A', 3] }],
      skills: { languages: ['Python'], frameworks: 'not-an-array' },
      awards: [{ name: '奖', date: '2023年5月' }],
    });
    expect(v.safeParse(ProfileSchema, profile).success).toBe(true);
    expect(profile.basic).toMatchObject({ name: '张三', phone: '13800000000', gender: 'male', birthDate: '2000-05-07' });
    expect(profile.education[0]).toMatchObject({ degree: 'master', start: '2025-09', end: 'present' });
    expect(profile.experience[0]).toMatchObject({ end: '', bullets: ['做了 A', '3'] });
    expect(profile.skills.frameworks).toEqual([]);
    expect(profile.awards[0]?.date).toBe('2023-05');
  });

  it('normalizeMonth rejects invalid months', () => {
    expect(normalizeMonth('2024-13')).toBe('');
    expect(normalizeMonth('Present')).toBe('present');
  });
});

describe('parseResumeWithLlm', () => {
  it('parses a fenced JSON reply into a valid profile', async () => {
    const chat = vi.fn(async () => '```json\n{"basic":{"name":"李四"},"education":[]}\n```');
    const profile = await parseResumeWithLlm('简历原文', cfg, chat);
    expect(profile.basic.name).toBe('李四');
    expect((chat.mock.calls[0] as unknown as [unknown, { effort: string }])[1].effort).toBe('medium');
  });
});
