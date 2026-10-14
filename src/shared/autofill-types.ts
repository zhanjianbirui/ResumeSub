/** content script 与 background 共用的纯类型（不引入 valibot，保持 content bundle 轻量）。 */
export const FIELD_KINDS = [
  'text', 'email', 'tel', 'url', 'number', 'date', 'month', 'textarea', 'select', 'radio', 'file', 'combobox', 'datepicker',
] as const;

export type FieldKind = (typeof FIELD_KINDS)[number];

export interface FieldOption {
  value: string;
  label: string;
}

export interface FieldDescriptor {
  signature: string;
  kind: FieldKind;
  label: string;
  name: string;
  id: string;
  placeholder: string;
  autocomplete: string;
  section: string;
  /** 字段位于第几个重复区块（如第 2 段教育经历为 1）；不在重复区块中为 0。 */
  repeatIndex: number;
  options?: FieldOption[];
}

export interface ResumeFileLike {
  name: string;
  mime: string;
  dataBase64: string;
}

export type EntryGroup = 'education' | 'experience' | 'projects';

export interface FillInstruction {
  signature: string;
  value?: string;
  /** combobox 用来匹配选项的候选文字。 */
  candidates?: string[];
  group?: EntryGroup;
  file?: ResumeFileLike;
}

export type PlanResponse =
  | { status: 'empty' }
  | { status: 'ready'; fills: FillInstruction[]; counts: Record<EntryGroup, number> };
