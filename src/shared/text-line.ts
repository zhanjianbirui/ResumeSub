/** 解析器的输入单位：一行视觉文本。segments 是同一行中被较大水平间距隔开的片段（例如左边的机构名和右边的日期）。 */
export interface TextLine {
  page: number;
  y: number;
  size: number;
  segments: readonly string[];
}

export const lineText = (line: TextLine): string => line.segments.join(' ');
