const CONTROLS = 'input:not([type="hidden"]), select, textarea';
/** 与 background 的 MAX_REPEAT_INDEX 保持一致（content 不引入 valibot schema，这里复制数值）。 */
const MAX_REPEAT_INDEX = 50;
/** 区块标题里的序号（"教育经历 1"、"第二段"）不影响区块是否同构。 */
const ORDINALS = /[\s\d一二三四五六七八九十]/g;

const shapeOf = (el: Element) => `${el.tagName}.${el.className}`;

/**
 * 区块"指纹"：其中表单控件的类型和去掉数字的 name，加上去掉序号后的文字。
 * 同一类重复区块（第 1、2 段教育经历）指纹相同；"学校""专业"这类相邻但不同的字段行指纹不同。
 */
function fingerprint(el: Element, cache: WeakMap<Element, string>): string {
  const cached = cache.get(el);
  if (cached !== undefined) return cached;
  const controls = Array.from(el.querySelectorAll<HTMLInputElement>(CONTROLS))
    .map((c) => `${c.tagName}:${c.type}:${c.name.replace(/\d+/g, '')}`)
    .join(',');
  const value = `${controls}|${(el.textContent ?? '').replace(ORDINALS, '')}`;
  cache.set(el, value);
  return value;
}

function repeatPeers(node: Element, cache: WeakMap<Element, string>): Element[] {
  const parent = node.parentElement;
  if (!parent) return [];
  const shape = shapeOf(node);
  const sameShape = Array.from(parent.children).filter((c) => shapeOf(c) === shape && c.querySelector(CONTROLS));
  if (sameShape.length < 2) return [];
  const print = fingerprint(node, cache);
  return sameShape.filter((c) => fingerprint(c, cache) === print);
}

/** 从字段往上找最近的"重复区块"：父节点下有 ≥2 个标签、class、结构都相同且含表单控件的兄弟。 */
export function repeatIndexOf(el: HTMLElement, cache: WeakMap<Element, string> = new WeakMap()): number {
  for (let node: Element | null = el; node && node.parentElement; node = node.parentElement) {
    const peers = repeatPeers(node, cache);
    if (peers.length >= 2) return Math.min(peers.indexOf(node), MAX_REPEAT_INDEX);
  }
  return 0;
}
