import { describe, expect, it } from 'vitest';
import { chooseOption, synonymsFor } from '@/background/autofill/options';
import { entryCounts, planFills } from '@/background/autofill/plan';
import { formatDate, splitName } from '@/background/autofill/values';
import type { FieldDescriptor } from '@/shared/autofill-types';
import { emptyEducation, emptyExperience, emptyProfile } from '@/shared/schema/profile';
import { emptyVaultData, type VaultData } from '@/shared/schema/vault-data';

const desc = (signature: string, label: string, extra: Partial<FieldDescriptor> = {}): FieldDescriptor => ({
  signature, kind: 'text', label, name: '', id: '', placeholder: '', autocomplete: '', section: '', repeatIndex: 0, ...extra,
});

function data(): VaultData {
  const base = emptyProfile();
  return {
    ...emptyVaultData(),
    profile: {
      ...base,
      basic: { ...base.basic, name: '李明', nameEn: 'Ming Li', phone: '13800138000', email: 'li@example.com', gender: 'male' },
      education: [
        { ...emptyEducation(), school: '伦敦示例大学', degree: 'master', major: '数据科学', start: '2025-09', end: 'present' },
        { ...emptyEducation(), school: '示例师范大学', degree: 'bachelor', major: '软件工程', start: '2021-09', end: '2025-06' },
      ],
      experience: [{ ...emptyExperience(), company: '示例科技', title: '实习生', start: '2023-07', end: '2023-09', bullets: ['做了 A', '做了 B'] }],
      skills: { languages: ['Python', 'Go'], frameworks: ['PyTorch'], tools: [], langCerts: [] },
      custom: { 是否接受调剂: '是' },
    },
    resumeFile: { name: 'cv.pdf', mime: 'application/pdf', dataBase64: 'JVBERi0=' },
  };
}

describe('helpers', () => {
  it('splitName handles Chinese, compound surnames and English names', () => {
    expect(splitName({ name: '李明', phone: '', email: '' }, false)).toEqual({ last: '李', first: '明' });
    expect(splitName({ name: '欧阳娜娜', phone: '', email: '' }, false)).toEqual({ last: '欧阳', first: '娜娜' });
    expect(splitName({ name: '李明', nameEn: 'Ming Li', phone: '', email: '' }, true)).toEqual({ first: 'Ming', last: 'Li' });
  });

  it('formatDate follows the control type and placeholder style', () => {
    const f = (extra: Partial<FieldDescriptor>) => desc('s', '开始时间', extra);
    expect(formatDate('2025-09', f({ kind: 'month' }), false)).toBe('2025-09');
    expect(formatDate('2025-09', f({ kind: 'date' }), false)).toBe('2025-09-01');
    expect(formatDate('2025-09', f({ placeholder: 'YYYY/MM' }), false)).toBe('2025/09');
    expect(formatDate('2025-09', f({ placeholder: '2020.01' }), false)).toBe('2025.09');
    expect(formatDate('2025-09', f({ placeholder: '如 2020年1月' }), false)).toBe('2025年09月');
    expect(formatDate('present', f({}), false)).toBe('至今');
    expect(formatDate('present', f({}), true)).toBe('Present');
    expect(formatDate('present', f({ kind: 'month' }), false)).toBeNull();
    expect(formatDate('', f({}), false)).toBeNull();
  });

  it('chooseOption matches exact, then loose, ignoring placeholders', () => {
    const options = [{ value: '', label: '请选择' }, { value: '1', label: '本科' }, { value: '2', label: '硕士研究生' }];
    expect(chooseOption(options, ['本科', '学士'])).toBe('1');
    expect(chooseOption(options, ['硕士', 'master'])).toBe('2');
    expect(chooseOption(options, ['博士'])).toBeNull();
    expect(chooseOption([{ value: 'M', label: 'M' }, { value: 'F', label: 'F' }], ['男', 'male', 'm'])).toBe('M');
  });

  it('chooseOption does not loosely map 博士后 or 研究生及以上 (R5)', () => {
    const phd = synonymsFor('education.degree', 'phd');
    const master = synonymsFor('education.degree', 'master');
    expect(chooseOption([{ value: 'pd', label: '博士后' }], phd)).toBeNull();
    expect(chooseOption([{ value: 'pd', label: '博士后' }, { value: 'd', label: '博士研究生' }], phd)).toBe('d');
    expect(chooseOption([{ value: 'up', label: '研究生及以上' }], master)).toBeNull();
    expect(chooseOption([{ value: 'up', label: '硕士以上' }], master)).toBeNull();
    expect(chooseOption([{ value: 'm', label: '硕士研究生' }], master)).toBe('m');
  });
});

describe('planFills', () => {
  it('fills basic text fields and skips unmatched or empty ones', () => {
    const fills = planFills([
      desc('a', '姓名'), desc('b', '手机号'), desc('c', '身份证号'), desc('d', '奇怪字段'),
    ], data());
    expect(fills).toEqual([{ signature: 'a', value: '李明' }, { signature: 'b', value: '13800138000' }]);
  });

  it('uses English names on English forms', () => {
    const fills = planFills([desc('a', 'First Name'), desc('b', 'Last Name'), desc('c', 'Full Name')], data());
    expect(fills.map((f) => f.value)).toEqual(['Ming', 'Li', 'Ming Li']);
  });

  it('indexes repeated education blocks by repeatIndex and formats dates', () => {
    const fills = planFills([
      desc('s1', '学校名称', { section: '教育经历' }),
      desc('e1', '毕业时间', { section: '教育经历' }),
      desc('s2', '学校名称', { section: '教育经历', repeatIndex: 1 }),
      desc('e2', '毕业时间', { section: '教育经历', kind: 'month', repeatIndex: 1 }),
    ], data());
    expect(fills).toEqual([
      { signature: 's1', value: '伦敦示例大学', group: 'education' },
      { signature: 'e1', value: '至今', group: 'education' },
      { signature: 's2', value: '示例师范大学', group: 'education' },
      { signature: 'e2', value: '2025-06', group: 'education' },
    ]);
  });

  it('maps select/radio options by code synonyms and text fields by display value', () => {
    const fills = planFills([
      desc('g', '性别', { kind: 'radio', options: [{ value: 'f', label: '女' }, { value: 'm', label: '男' }] }),
      desc('d', '学历', { kind: 'select', options: [{ value: '', label: '请选择' }, { value: 'ms', label: '硕士' }] }),
    ], data());
    expect(fills).toEqual([{ signature: 'g', value: 'm' }, { signature: 'd', value: 'ms', group: 'education' }]);
    expect(planFills([desc('t', 'Degree')], data())).toEqual([{ signature: 't', value: 'Master', group: 'education' }]);
  });

  it('fills descriptions, skills, custom fields and the resume file', () => {
    const fills = planFills([
      desc('x', '工作内容', { section: '实习经历', kind: 'textarea' }),
      desc('k', '专业技能'),
      desc('c', '是否接受调剂'),
      desc('f', '上传简历', { kind: 'file' }),
    ], data());
    expect(fills).toEqual([
      { signature: 'x', value: '做了 A\n做了 B', group: 'experience' },
      { signature: 'k', value: 'Python、Go、PyTorch' },
      { signature: 'c', value: '是' },
      { signature: 'f', file: { name: 'cv.pdf', mime: 'application/pdf', dataBase64: 'JVBERi0=' } },
    ]);
  });

  it('skips the resume file when none is stored', () => {
    expect(planFills([desc('f', '上传简历', { kind: 'file' })], emptyVaultData())).toEqual([]);
  });
});

describe('resume file once per plan (A3)', () => {
  it('attaches the resume to the first matching file input only', () => {
    const fills = planFills([
      desc('f1', '上传简历', { kind: 'file' }),
      desc('f2', 'Resume/CV', { kind: 'file' }),
    ], data());
    expect(fills.map((f) => f.signature)).toEqual(['f1']);
  });
});

describe('chooseOption (A4)', () => {
  const male = ['男', 'male', 'man', '先生', 'm', '男性'];
  it('requires exact matches for Latin labels', () => {
    expect(chooseOption([{ value: 'F', label: 'Female' }, { value: 'M', label: 'Male' }], male)).toBe('M');
    expect(chooseOption([{ value: '1', label: 'Mastercard' }], ['master'])).toBeNull();
    expect(chooseOption([{ value: '1', label: 'Bachelor of Science' }], ['bachelor'])).toBe('1');
  });

  it('never picks Female (女) for male', () => {
    const options = [{ value: '1', label: 'Female (女)' }, { value: '2', label: 'Male (男)' }];
    expect(chooseOption(options, male)).toBe('2');
    expect(chooseOption(options, ['女', 'female', 'woman', '女士', 'f', '女性'])).toBe('1');
  });

  it('maps 男性/女性 options through gender synonyms', () => {
    const options = [{ value: '1', label: '男性' }, { value: '2', label: '女性' }];
    expect(chooseOption(options, synonymsFor('basic.gender', 'male'))).toBe('1');
    expect(chooseOption(options, synonymsFor('basic.gender', 'female'))).toBe('2');
  });
});

describe('formatDate placeholders (A5)', () => {
  const f = (placeholder: string) => desc('s', '开始时间', { placeholder });
  it.each([
    ['MM/YYYY', '09/2025'],
    ['YYYY', '2025'],
    ['e.g. 2020-01', '2025-09'],
    ['YYYY.MM', '2025.09'],
    ['YYYY年MM月', '2025年09月'],
    ['09/2020', '09/2025'],
  ])('month value with %s → %s', (placeholder, expected) => {
    expect(formatDate('2025-09', f(placeholder), false)).toBe(expected);
  });

  it.each([
    ['', '2000-01-02'],
    ['YYYY/MM/DD', '2000/01/02'],
    ['YYYY年MM月DD日', '2000年01月02日'],
    ['DD/MM/YYYY', '02/01/2000'],
    ['YYYY', '2000'],
  ])('full date with %s keeps the day → %s', (placeholder, expected) => {
    expect(formatDate('2000-01-02', f(placeholder), false)).toBe(expected);
  });

  it('ignores words that merely contain format letters on datepickers', () => {
    const picker = (placeholder: string) => desc('s', '开始时间', { kind: 'datepicker', placeholder });
    expect(formatDate('2025-09', picker('Summary'), false)).toBe('2025-09');
    expect(formatDate('2025-09', picker('Daddy yy'), false)).toBe('2025-09');
    expect(formatDate('2025-09', picker('YYYY/MM'), false)).toBe('2025/09');
    expect(formatDate('2025-09', picker('如2020年1月'), false)).toBe('2025年09月');
  });

  it('keeps the birth date day on text fields', () => {
    const base = data();
    const withBirth = { ...base, profile: { ...base.profile, basic: { ...base.profile.basic, birthDate: '2000-01-02' } } };
    expect(planFills([desc('b', '出生日期')], withBirth)).toEqual([{ signature: 'b', value: '2000-01-02' }]);
  });
});

describe('repeat sections (B2)', () => {
  it('a top-level degree field does not shift the education blocks', () => {
    const fills = planFills([
      desc('top', '最高学历'),
      desc('s1', '学校名称', { section: '教育经历', repeatIndex: 0 }),
      desc('d1', '学历', { section: '教育经历', repeatIndex: 0 }),
      desc('s2', '学校名称', { section: '教育经历', repeatIndex: 1 }),
      desc('d2', '学历', { section: '教育经历', repeatIndex: 1 }),
    ], data());
    expect(fills).toEqual([
      { signature: 'top', value: '硕士', group: 'education' },
      { signature: 's1', value: '伦敦示例大学', group: 'education' },
      { signature: 'd1', value: '硕士', group: 'education' },
      { signature: 's2', value: '示例师范大学', group: 'education' },
      { signature: 'd2', value: '本科', group: 'education' },
    ]);
  });

  it('blocks sent in separate plan requests keep their own entry', () => {
    expect(planFills([desc('a', '学校名称', { repeatIndex: 0 })], data())).toEqual([{ signature: 'a', value: '伦敦示例大学', group: 'education' }]);
    expect(planFills([desc('b', '学校名称', { repeatIndex: 1 })], data())).toEqual([{ signature: 'b', value: '示例师范大学', group: 'education' }]);
  });

  it('a block missing a field does not shift the next block', () => {
    const fills = planFills([
      desc('s1', '学校名称', { section: '教育经历', repeatIndex: 0 }),
      desc('s2', '学校名称', { section: '教育经历', repeatIndex: 1 }),
      desc('e2', '毕业时间', { section: '教育经历', repeatIndex: 1 }),
    ], data());
    expect(fills).toContainEqual({ signature: 'e2', value: '2025-06', group: 'education' });
  });
});

describe('M4 plan extensions', () => {
  it('returns display text plus synonym candidates for comboboxes', () => {
    const fills = planFills([desc('d', '学历', { kind: 'combobox' })], data());
    expect(fills).toEqual([{ signature: 'd', value: '硕士', candidates: ['硕士', '研究生', 'master', "master's", 'postgraduate', 'msc'], group: 'education' }]);
  });

  it('formats datepicker values like month inputs and never sends 至今', () => {
    const fills = planFills([
      desc('s', '入学时间', { kind: 'datepicker', section: '教育经历' }),
      desc('e', '毕业时间', { kind: 'datepicker', section: '教育经历' }),
      desc('b', '出生日期', { kind: 'datepicker' }),
    ], { ...data(), profile: { ...data().profile, basic: { ...data().profile.basic, birthDate: '2000-05-17' } } });
    expect(fills).toEqual([
      { signature: 's', value: '2025-09', group: 'education' },
      { signature: 'b', value: '2000-05-17' },
    ]);
  });

  it('tags entry fills with their group and reports entry counts', () => {
    const fills = planFills([desc('c', '公司名称', { section: '实习经历' }), desc('n', '姓名')], data());
    expect(fills).toEqual([
      { signature: 'c', value: '示例科技', group: 'experience' },
      { signature: 'n', value: '李明' },
    ]);
    expect(entryCounts(data())).toEqual({ education: 2, experience: 1, projects: 0 });
  });
});
