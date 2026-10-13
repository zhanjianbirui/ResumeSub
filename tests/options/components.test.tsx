// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CustomFields } from '@/entrypoints/options/CustomFields';
import { BASIC_FIELDS, EDUCATION_FIELDS, EXPERIENCE_FIELDS } from '@/entrypoints/options/fields';
import { splitLines } from '@/entrypoints/options/LinesInput';
import { ListSection } from '@/entrypoints/options/ListSection';
import { ObjectForm } from '@/entrypoints/options/ObjectForm';
import { emptyEducation, emptyExperience, emptyProfile } from '@/shared/schema/profile';

afterEach(cleanup);

describe('splitLines', () => {
  it('trims and drops blank lines', () => {
    expect(splitLines(' a \n\n b\n')).toEqual(['a', 'b']);
  });
});

describe('ObjectForm', () => {
  it('emits a new object without mutating the input', () => {
    const basic = emptyProfile().basic;
    const onChange = vi.fn();
    render(<ObjectForm fields={BASIC_FIELDS} value={basic} onChange={onChange} />);
    fireEvent.input(screen.getByLabelText('姓名'), { target: { value: '王五' } });
    expect(onChange).toHaveBeenCalledWith({ ...basic, name: '王五' });
    expect(basic.name).toBe('');
  });

  it('commits lines fields on blur', () => {
    const exp = emptyExperience();
    const onChange = vi.fn();
    render(<ObjectForm fields={EXPERIENCE_FIELDS} value={exp} onChange={onChange} />);
    const box = screen.getByLabelText('经历描述（每行一条）');
    fireEvent.input(box, { target: { value: '做了 A\n\n做了 B' } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.blur(box);
    expect(onChange).toHaveBeenCalledWith({ ...exp, bullets: ['做了 A', '做了 B'] });
  });

  it('toggles present for end dates', () => {
    const edu = { ...emptyEducation(), end: '2026-09' };
    const onChange = vi.fn();
    render(<ObjectForm fields={EDUCATION_FIELDS} value={edu} onChange={onChange} />);
    fireEvent.click(screen.getByLabelText('至今'));
    expect(onChange).toHaveBeenCalledWith({ ...edu, end: 'present' });
  });
});

describe('ListSection', () => {
  it('adds and removes items immutably', () => {
    const items = [{ ...emptyEducation(), school: '测试大学' }];
    const onChange = vi.fn();
    render(
      <ListSection
        title="教育经历"
        fields={EDUCATION_FIELDS}
        items={items}
        create={emptyEducation}
        onChange={onChange}
        itemLabel={(e) => e.school}
      />,
    );
    fireEvent.click(screen.getByText('+ 添加教育经历'));
    expect(onChange).toHaveBeenLastCalledWith([items[0], emptyEducation()]);
    fireEvent.click(screen.getByText('删除'));
    expect(onChange).toHaveBeenLastCalledWith([]);
    expect(items).toHaveLength(1);
  });
});

describe('CustomFields', () => {
  it('emits records and skips empty keys', () => {
    const onChange = vi.fn();
    render(<CustomFields value={{}} onChange={onChange} />);
    fireEvent.click(screen.getByText('+ 添加字段'));
    expect(onChange).toHaveBeenLastCalledWith({});
    fireEvent.input(screen.getByLabelText('字段名 1'), { target: { value: '是否接受调剂' } });
    fireEvent.input(screen.getByLabelText('字段值 1'), { target: { value: '是' } });
    expect(onChange).toHaveBeenLastCalledWith({ 是否接受调剂: '是' });
  });
});
