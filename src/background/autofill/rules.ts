export type SectionGroup = 'education' | 'experience' | 'projects';

type BasicKey =
  | 'name' | 'nameFirst' | 'nameLast' | 'nameEn' | 'phone' | 'email' | 'gender' | 'birthDate' | 'idType'
  | 'idNumber' | 'nationality' | 'hometown' | 'politicalStatus' | 'currentCity' | 'address' | 'linkedin'
  | 'github' | 'website';

export type FieldPath =
  | `basic.${BasicKey}`
  | `education.${'school' | 'major' | 'degree' | 'start' | 'end' | 'gpa' | 'rank'}`
  | `experience.${'company' | 'title' | 'start' | 'end' | 'description' | 'location'}`
  | `projects.${'name' | 'role' | 'start' | 'end' | 'description'}`
  | `preferences.${'expectedCities' | 'expectedSalary' | 'availableFrom'}`
  | 'skills.all'
  | 'resume.file'
  | `custom:${string}`;

/** 命中即不填写：紧急联系人、家庭成员、导师、验证码、密码等，绝不能用本人信息去填。 */
export const SKIP = new RegExp([
  '紧急联系|emergency|推荐人|referee|\\breference|recommender|家庭成员|父亲|母亲|配偶|联系人|亲属|监护人|家属|家长|导师',
  'guardian|\\bparent|mother|father|spouse|next of kin|contact person|supervisor|验证码|captcha|密码|password',
].join('|'), 'i');

/** [path, 命中条件, 可选的排除条件]。path 为 null 表示明确不填写。 */
export type Rule = readonly [FieldPath | null, RegExp, RegExp?];

/** 顺序有意义：越具体的规则越靠前。 */
export const GLOBAL_RULES: readonly Rule[] = [
  ['basic.nameEn', /英文名|英文姓名|english name|拼音/i],
  ['basic.nameLast', /^姓$|姓氏|last ?name|family ?name|surname/i],
  ['basic.nameFirst', /^名$|first ?name|given ?name|forename/i],
  ['basic.name', /姓名|^name$|full ?name|your name|^名字$/i],
  [null, /公司地址|单位地址|employer address|company address|公司性质|公司规模|行业|单位电话|company size|industry/i],
  ['basic.email', /邮箱|e-?mail|电子邮件/i],
  ['basic.phone', /手机|电话|联系方式|phone|mobile|\btel\b/i],
  ['basic.idType', /证件类型|id ?type|document type/i],
  ['basic.idNumber', /身份证|证件号|\bid ?(?:no|number|card)\b|passport/i, /有效期|expir|issue|签发|地址|address|类型|type/i],
  ['basic.gender', /性别|gender|\bsex\b/i],
  ['basic.hometown', /出生地|place of birth|birthplace/i],
  ['basic.birthDate', /出生|生日|birth|\bdob\b/i],
  ['basic.politicalStatus', /政治面貌|political/i],
  ['basic.nationality', /国籍|nationality|citizenship/i],
  ['basic.hometown', /籍贯|户口|生源地|hometown|native place/i],
  ['preferences.expectedCities', /期望城市|意向城市|期望工作地|preferred (?:work )?location/i],
  ['preferences.expectedSalary', /期望薪|薪资要求|expected salary|salary expectation|desired salary/i],
  ['preferences.availableFrom', /到岗|入职时间|available (?:from|date|start)|start date available|notice period/i],
  ['basic.currentCity', /现居|所在城市|现住|居住城市|current (?:city|location)|^city$/i],
  ['basic.linkedin', /linkedin|领英/i],
  ['basic.github', /github/i],
  ['basic.website', /个人网站|个人主页|website|portfolio|blog/i],
  ['basic.address', /地址|address/i],
  [null, /应聘|意向岗位|期望职位|申请职位|desired (?:position|job)|position applied|applying for|which position/i],
  ['skills.all', /技能|特长|\bskills?\b/i],
  ['education.school', /学校|院校|school|university|college|institution/i],
  ['education.gpa', /gpa|绩点|平均分/i],
  ['education.rank', /排名|\brank/i],
  ['education.major', /专业|major|field of study|discipline/i],
  ['education.degree', /学历|学位|degree|education level/i],
  ['experience.company', /公司|单位|雇主|company|employer|organi[sz]ation/i],
  ['experience.title', /职位|岗位|职务|job title|position|\btitle\b/i],
  ['projects.name', /项目名称|project name|project title/i],
  ['projects.role', /项目角色|担任角色|project role/i],
];

export const SECTION_PATTERNS: readonly (readonly [SectionGroup, RegExp])[] = [
  ['education', /教育|学历|education|academic/i],
  ['experience', /实习|工作|职业|experience|employment|work history|internship/i],
  ['projects', /项目|project/i],
];

type SectionKey = 'start' | 'end' | 'description' | 'location';

export const SECTION_RULES: readonly (readonly [SectionKey, RegExp])[] = [
  ['start', /入学|开始|起始|\bstart|\bfrom\b|\bbegin/i],
  ['end', /毕业|结束|截止|离职|\bend\b|until|graduat|\bto\b/i],
  ['description', /内容|描述|职责|业绩|description|responsibilit|summary|details/i],
  ['location', /地点|城市|location|\bcity\b/i],
];

/** 各区块允许的字段，例如教育经历没有 description 和 location。 */
export const SECTION_KEYS: Readonly<Record<SectionGroup, readonly SectionKey[]>> = {
  education: ['start', 'end'],
  experience: ['start', 'end', 'description', 'location'],
  projects: ['start', 'end', 'description'],
};

export const AUTOCOMPLETE: Readonly<Record<string, FieldPath>> = {
  name: 'basic.name',
  'given-name': 'basic.nameFirst',
  'family-name': 'basic.nameLast',
  email: 'basic.email',
  tel: 'basic.phone',
  'tel-national': 'basic.phone',
  bday: 'basic.birthDate',
  sex: 'basic.gender',
  'street-address': 'basic.address',
  'address-line1': 'basic.address',
  'address-level2': 'basic.currentCity',
  organization: 'experience.company',
  'organization-title': 'experience.title',
  url: 'basic.website',
};

export const RESUME_FILE = /简历|resume|\bcv\b/i;
/** 求职信、成绩单、证书、作品集、照片等上传框不能放简历。 */
export const NOT_RESUME_FILE = /cover|成绩|证书|transcript|letter|portfolio|照片|photo/i;
