import { describe, expect, it } from 'vitest';
import { matchField } from '@/background/autofill/match';
import type { FieldDescriptor } from '@/shared/autofill-types';

const desc = (label: string, extra: Partial<FieldDescriptor> = {}): FieldDescriptor => ({
  signature: 's', kind: 'text', label, name: '', id: '', placeholder: '', autocomplete: '', section: '', ...extra,
});

describe('matchField', () => {
  it.each([
    ['姓名', 'basic.name'],
    ['* 姓名：', 'basic.name'],
    ['英文名', 'basic.nameEn'],
    ['First Name', 'basic.nameFirst'],
    ['Last Name', 'basic.nameLast'],
    ['手机号码', 'basic.phone'],
    ['Email Address', 'basic.email'],
    ['性别', 'basic.gender'],
    ['出生日期', 'basic.birthDate'],
    ['身份证号', 'basic.idNumber'],
    ['政治面貌', 'basic.politicalStatus'],
    ['毕业院校', 'education.school'],
    ['所学专业', 'education.major'],
    ['最高学历', 'education.degree'],
    ['GPA', 'education.gpa'],
    ['公司名称', 'experience.company'],
    ['职位名称', 'experience.title'],
    ['期望城市', 'preferences.expectedCities'],
    ['期望薪资', 'preferences.expectedSalary'],
    ['最快到岗时间', 'preferences.availableFrom'],
    ['LinkedIn Profile', 'basic.linkedin'],
  ])('%s → %s', (label, path) => {
    expect(matchField(desc(label), [])).toBe(path);
  });

  it('skips emergency contacts, referees, captcha and applied-position fields', () => {
    expect(matchField(desc('紧急联系人电话'), [])).toBeNull();
    expect(matchField(desc('电话', { name: 'emergency_phone' }), [])).toBeNull();
    expect(matchField(desc('验证码'), [])).toBeNull();
    expect(matchField(desc('应聘岗位'), [])).toBeNull();
    expect(matchField(desc('完全无关的字段'), [])).toBeNull();
  });

  it('resolves start/end/description by section', () => {
    expect(matchField(desc('开始时间', { section: '教育经历' }), [])).toBe('education.start');
    expect(matchField(desc('结束时间', { section: '实习经历' }), [])).toBe('experience.end');
    expect(matchField(desc('工作内容', { section: 'Work Experience' }), [])).toBe('experience.description');
    expect(matchField(desc('项目描述'), [])).toBe('projects.description');
    expect(matchField(desc('开始时间'), [])).toBeNull();
    expect(matchField(desc('地点', { section: '教育背景' }), [])).toBeNull();
  });

  it('prefers autocomplete tokens and falls back to name/id/placeholder', () => {
    expect(matchField(desc('', { autocomplete: 'section-a given-name' }), [])).toBe('basic.nameFirst');
    expect(matchField(desc('', { name: 'candidate_email' }), [])).toBe('basic.email');
    expect(matchField(desc('', { placeholder: '请输入毕业院校' }), [])).toBe('education.school');
  });

  it('matches custom keys exactly before rules', () => {
    expect(matchField(desc('是否接受调剂：'), ['是否接受调剂'])).toBe('custom:是否接受调剂');
  });

  it('only maps file inputs that look like resume uploads', () => {
    expect(matchField(desc('上传简历', { kind: 'file' }), [])).toBe('resume.file');
    expect(matchField(desc('Resume/CV', { kind: 'file' }), [])).toBe('resume.file');
    expect(matchField(desc('证件照', { kind: 'file' }), [])).toBeNull();
  });
});
