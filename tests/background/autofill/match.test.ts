import { describe, expect, it } from 'vitest';
import { matchField } from '@/background/autofill/match';
import { SKIP } from '@/background/autofill/rules';
import type { FieldDescriptor } from '@/shared/autofill-types';

const desc = (label: string, extra: Partial<FieldDescriptor> = {}): FieldDescriptor => ({
  signature: 's', kind: 'text', label, name: '', id: '', placeholder: '', autocomplete: '', section: '', repeatIndex: 0, ...extra,
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

describe('tightened rules (A1)', () => {
  it.each([
    ['护照有效期'], ['Passport expiry date'], ['身份证地址'], ['证件签发机关'], ['ID card issue date'],
  ])('%s is not an id number', (label) => {
    expect(matchField(desc(label), [])).not.toBe('basic.idNumber');
  });

  it.each([
    ['Android number', null],
    ['ID Number', 'basic.idNumber'],
    ['Passport No.', 'basic.idNumber'],
    ['护照号码', 'basic.idNumber'],
    ['护照号', 'basic.idNumber'],
    ['护照签发地', null],
    ['出生地', 'basic.hometown'],
    ['Place of Birth', 'basic.hometown'],
    ['Birthplace', 'basic.hometown'],
    ['出生日期', 'basic.birthDate'],
    ['专业排名', 'education.rank'],
    ['Are you available to work weekends?', null],
    ['Date available from', 'preferences.availableFrom'],
    ['Notice period', 'preferences.availableFrom'],
    ['公司地址', null],
    ['Employer address', null],
    ['公司性质', null],
    ['公司规模', null],
    ['所属行业', null],
    ['单位电话', null],
    ['Which position are you applying for', null],
    ['Position applied for', null],
    ['联系人电话', null],
    ['Parent/Guardian email', null],
    ['Contact person phone', null],
    ['姓 名', 'basic.name'],
    ['出 生 日 期', 'basic.birthDate'],
  ])('%s → %s', (label, path) => {
    expect(matchField(desc(label), [])).toBe(path);
  });

  it('does not treat "preference" as a reference (A2)', () => {
    expect(SKIP.test('Location preference')).toBe(false);
    expect(SKIP.test('Reference name')).toBe(true);
    expect(matchField(desc('Location preference', { section: 'Work Experience' }), [])).toBe('experience.location');
  });
});

describe('file inputs (A3)', () => {
  it.each([
    ['上传简历', 'resume.file'],
    ['简历附件', 'resume.file'],
    ['上传附件', null],
    ['Attachment', null],
    ['Cover letter', null],
    ['Resume cover letter', null],
    ['成绩单', null],
    ['Transcript', null],
    ['证书扫描件（简历补充）', null],
    ['个人照片', null],
    ['推荐人简历', null],
    ['Reference letter', null],
  ])('%s → %s', (label, path) => {
    expect(matchField(desc(label, { kind: 'file' }), [])).toBe(path);
  });
});
