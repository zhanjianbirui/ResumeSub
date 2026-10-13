import type { TextLine } from '@/shared/text-line';

type LineInput = string | readonly string[];

export function line(text: LineInput, size = 10): TextLine {
  return { page: 1, y: 0, size, segments: typeof text === 'string' ? [text] : text };
}

export const lines = (...items: LineInput[]): TextLine[] => items.map((t) => line(t));

/** 虚构中文简历，排版仿照常见单栏中文模板：右侧为日期或地点片段。 */
export const ZH_RESUME = lines(
  '李明',
  '13800138000 | liming@example.com',
  '教育背景',
  ['伦敦示例大学（Example University London）', '2025.09 – 2026.09'],
  ['数据科学 – 理学硕士（在读）', 'London, UK'],
  '• 核心课程：机器学习、统计推断',
  ['示例师范大学', '2021.09 – 2025.06'],
  ['软件工程 – 本科', '杭州，中国'],
  '• GPA：3.7/4.0，专业排名 前 10%',
  '项目经验',
  ['图像分类系统（导师：Prof. Alex Smith）', '2025.10 – 至今'],
  ['PyTorch · CNN · 图像分析', '团队项目'],
  '• 基于 PyTorch 构建 CNN 进行多类别分类，设计数据增强策略缓解样本不足问',
  '题，验证集准确率提升约 8%',
  '实习经验',
  ['示例计算中心 – AI 实习生（线上）', '2026.04 – 至今'],
  '• 参与图像识别算法研发',
  ['示例科技有限公司 – Java 后端开发实习生', '2023.07 – 2023.09'],
  '• 基于 Spring Boot 设计 RESTful API',
  '技能特长',
  '编程语言：Python、Java、SQL',
  'AI / ML：PyTorch、scikit-learn',
  '工具 / 工程：Git、Linux、MySQL',
  '语言：中文（母语）、英语（雅思 7，CET-6）',
  '荣誉奖项',
  '• 国家级创新项目负责人（2022–2024）',
  '• 省级程序设计竞赛三等奖 · 校一等奖学金',
);

/** 虚构英文简历。 */
export const EN_RESUME = lines(
  'Alex Chen',
  'alex.chen@example.com | +44 7700 900123 | linkedin.com/in/alexchen | github.com/alexchen',
  'EDUCATION',
  ['Example University', 'Sep 2024 – Jun 2025'],
  ['MSc Artificial Intelligence', 'Manchester, UK'],
  'EXPERIENCE',
  ['Acme Corp | Software Engineer Intern', 'Jun 2023 – Aug 2023'],
  '- Built REST APIs in Go',
  'PROJECTS',
  ['Chess Engine', '2022 – 2023'],
  ['Rust | WebAssembly', 'Individual'],
  '- Implemented alpha-beta search',
  'SKILLS',
  'Languages: Python, Rust, Go',
  'Tools: Docker, Git',
);
