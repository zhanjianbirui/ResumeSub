import * as v from 'valibot';

const YEAR_MONTH = /^(|\d{4}-(0[1-9]|1[0-2])|present)$/;
const DATE = /^(|\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01]))$/;

const yearMonth = () => v.pipe(v.string(), v.regex(YEAR_MONTH, '日期格式应为 YYYY-MM 或 present'));
const optText = () => v.optional(v.string());
const textList = () => v.array(v.string());

export const BasicSchema = v.object({
  name: v.string(),
  nameEn: optText(),
  phone: v.string(),
  email: v.string(),
  gender: optText(),
  birthDate: v.optional(v.pipe(v.string(), v.regex(DATE, '出生日期格式应为 YYYY-MM-DD'))),
  idType: optText(),
  idNumber: optText(),
  nationality: optText(),
  hometown: optText(),
  politicalStatus: optText(),
  currentCity: optText(),
  address: optText(),
  linkedin: optText(),
  github: optText(),
  website: optText(),
});

export const EducationSchema = v.object({
  school: v.string(),
  schoolEn: optText(),
  degree: v.string(),
  major: v.string(),
  start: yearMonth(),
  end: yearMonth(),
  gpa: optText(),
  rank: optText(),
  courses: optText(),
  city: optText(),
  country: optText(),
});

export const ExperienceSchema = v.object({
  company: v.string(),
  title: v.string(),
  start: yearMonth(),
  end: yearMonth(),
  type: v.picklist(['intern', 'fulltime']),
  location: optText(),
  bullets: textList(),
});

export const ProjectSchema = v.object({
  name: v.string(),
  role: optText(),
  start: yearMonth(),
  end: yearMonth(),
  tech: textList(),
  bullets: textList(),
});

export const SkillsSchema = v.object({
  languages: textList(),
  frameworks: textList(),
  tools: textList(),
  langCerts: textList(),
});

export const AwardSchema = v.object({ name: v.string(), date: optText(), level: optText() });

export const PreferencesSchema = v.object({
  expectedCities: textList(),
  expectedSalary: optText(),
  availableFrom: optText(),
  jobTypes: textList(),
});

export const ProfileSchema = v.object({
  basic: BasicSchema,
  education: v.array(EducationSchema),
  experience: v.array(ExperienceSchema),
  projects: v.array(ProjectSchema),
  skills: SkillsSchema,
  awards: v.array(AwardSchema),
  preferences: PreferencesSchema,
  custom: v.record(v.string(), v.string()),
});

export type Basic = v.InferOutput<typeof BasicSchema>;
export type Education = v.InferOutput<typeof EducationSchema>;
export type Experience = v.InferOutput<typeof ExperienceSchema>;
export type Project = v.InferOutput<typeof ProjectSchema>;
export type Skills = v.InferOutput<typeof SkillsSchema>;
export type Award = v.InferOutput<typeof AwardSchema>;
export type Preferences = v.InferOutput<typeof PreferencesSchema>;
export type Profile = v.InferOutput<typeof ProfileSchema>;

export const emptyEducation = (): Education => ({ school: '', degree: '', major: '', start: '', end: '' });
export const emptyExperience = (): Experience => ({
  company: '', title: '', start: '', end: '', type: 'intern', bullets: [],
});
export const emptyProject = (): Project => ({ name: '', start: '', end: '', tech: [], bullets: [] });
export const emptyAward = (): Award => ({ name: '' });

export function emptyProfile(): Profile {
  return {
    basic: { name: '', phone: '', email: '' },
    education: [],
    experience: [],
    projects: [],
    skills: { languages: [], frameworks: [], tools: [], langCerts: [] },
    awards: [],
    preferences: { expectedCities: [], jobTypes: [] },
    custom: {},
  };
}
