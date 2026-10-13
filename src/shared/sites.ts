/** 常见招聘系统的域名匹配模式，供用户一键批量授权。 */
export const PRESET_SITES: readonly { name: string; pattern: string }[] = [
  { name: 'Workday', pattern: 'https://*.myworkdayjobs.com/*' },
  { name: 'Workday', pattern: 'https://*.myworkdaysite.com/*' },
  { name: 'Greenhouse', pattern: 'https://boards.greenhouse.io/*' },
  { name: 'Greenhouse', pattern: 'https://job-boards.greenhouse.io/*' },
  { name: 'Lever', pattern: 'https://jobs.lever.co/*' },
  { name: 'SmartRecruiters', pattern: 'https://*.smartrecruiters.com/*' },
  { name: 'SuccessFactors', pattern: 'https://*.successfactors.com/*' },
  { name: 'SuccessFactors', pattern: 'https://*.successfactors.eu/*' },
  { name: 'Taleo', pattern: 'https://*.taleo.net/*' },
  { name: 'iCIMS', pattern: 'https://*.icims.com/*' },
  { name: '北森', pattern: 'https://*.zhiye.com/*' },
  { name: 'Moka', pattern: 'https://*.mokahr.com/*' },
  { name: '飞书招聘', pattern: 'https://*.jobs.feishu.cn/*' },
  { name: '牛客', pattern: 'https://*.nowcoder.com/*' },
  { name: '智联/前程无忧（校招）', pattern: 'https://*.hotjob.cn/*' },
];
