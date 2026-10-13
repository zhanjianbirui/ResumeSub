export type FieldKind = 'text' | 'date' | 'month' | 'lines' | 'select';

export interface FieldDef {
  key: string;
  label: string;
  kind?: FieldKind;
  options?: readonly { value: string; label: string }[];
  allowPresent?: boolean;
}

const DEGREES = [
  { value: '', label: '—' },
  { value: 'highschool', label: '高中' },
  { value: 'associate', label: '大专' },
  { value: 'bachelor', label: '本科' },
  { value: 'master', label: '硕士' },
  { value: 'phd', label: '博士' },
] as const;

export const BASIC_FIELDS: readonly FieldDef[] = [
  { key: 'name', label: '姓名' },
  { key: 'nameEn', label: '英文名' },
  { key: 'phone', label: '手机号' },
  { key: 'email', label: '邮箱' },
  { key: 'gender', label: '性别', kind: 'select', options: [
    { value: '', label: '—' }, { value: 'male', label: '男' }, { value: 'female', label: '女' },
  ] },
  { key: 'birthDate', label: '出生日期', kind: 'date' },
  { key: 'idType', label: '证件类型' },
  { key: 'idNumber', label: '证件号码' },
  { key: 'nationality', label: '国籍' },
  { key: 'hometown', label: '籍贯' },
  { key: 'politicalStatus', label: '政治面貌' },
  { key: 'currentCity', label: '现居城市' },
  { key: 'address', label: '通讯地址' },
  { key: 'linkedin', label: 'LinkedIn' },
  { key: 'github', label: 'GitHub' },
  { key: 'website', label: '个人网站' },
];

export const EDUCATION_FIELDS: readonly FieldDef[] = [
  { key: 'school', label: '学校' },
  { key: 'schoolEn', label: '学校英文名' },
  { key: 'degree', label: '学历', kind: 'select', options: DEGREES },
  { key: 'major', label: '专业' },
  { key: 'start', label: '入学时间', kind: 'month' },
  { key: 'end', label: '毕业时间', kind: 'month', allowPresent: true },
  { key: 'gpa', label: 'GPA' },
  { key: 'rank', label: '排名' },
  { key: 'courses', label: '主修课程' },
  { key: 'city', label: '城市' },
  { key: 'country', label: '国家' },
];

export const EXPERIENCE_FIELDS: readonly FieldDef[] = [
  { key: 'company', label: '公司' },
  { key: 'title', label: '职位' },
  { key: 'type', label: '类型', kind: 'select', options: [
    { value: 'intern', label: '实习' }, { value: 'fulltime', label: '全职' },
  ] },
  { key: 'start', label: '开始时间', kind: 'month' },
  { key: 'end', label: '结束时间', kind: 'month', allowPresent: true },
  { key: 'location', label: '地点' },
  { key: 'bullets', label: '经历描述（每行一条）', kind: 'lines' },
];

export const PROJECT_FIELDS: readonly FieldDef[] = [
  { key: 'name', label: '项目名称' },
  { key: 'role', label: '角色' },
  { key: 'start', label: '开始时间', kind: 'month' },
  { key: 'end', label: '结束时间', kind: 'month', allowPresent: true },
  { key: 'tech', label: '技术栈（每行一个）', kind: 'lines' },
  { key: 'bullets', label: '项目描述（每行一条）', kind: 'lines' },
];

export const AWARD_FIELDS: readonly FieldDef[] = [
  { key: 'name', label: '奖项名称' },
  { key: 'date', label: '获奖时间', kind: 'month' },
  { key: 'level', label: '级别' },
];

export const SKILLS_FIELDS: readonly FieldDef[] = [
  { key: 'languages', label: '编程语言（每行一个）', kind: 'lines' },
  { key: 'frameworks', label: '框架 / 库（每行一个）', kind: 'lines' },
  { key: 'tools', label: '工具（每行一个）', kind: 'lines' },
  { key: 'langCerts', label: '语言证书（每行一个，如 雅思 7）', kind: 'lines' },
];

export const PREFERENCES_FIELDS: readonly FieldDef[] = [
  { key: 'expectedCities', label: '期望城市（每行一个）', kind: 'lines' },
  { key: 'expectedSalary', label: '期望薪资' },
  { key: 'availableFrom', label: '最早到岗时间', kind: 'month' },
  { key: 'jobTypes', label: '求职类型（每行一个）', kind: 'lines' },
];
