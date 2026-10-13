// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '@/entrypoints/options/App';
import { describeWarning } from '@/entrypoints/options/ReviewView';
import { ImportError } from '@/import/errors';
import { importResume } from '@/import/import-resume';
import { call } from '@/shared/client';
import { emptyProfile } from '@/shared/schema/profile';

vi.mock('@/shared/client', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/shared/client')>()),
  call: vi.fn(),
}));
vi.mock('@/import/import-resume', () => ({ importResume: vi.fn() }));

const mockCall = vi.mocked(call);
const mockImport = vi.mocked(importResume);
const FILE = { name: 'cv.pdf', mime: 'application/pdf' as const, dataBase64: 'JVBERi0=' };

function parsedProfile() {
  const base = emptyProfile();
  return { ...base, basic: { ...base.basic, name: '李明', email: 'liming@example.com' } };
}

function backend(saved: unknown[]) {
  mockCall.mockImplementation((async (req: { type: string; profile?: unknown; file?: unknown }) => {
    if (req.type === 'profile.get') return emptyProfile();
    if (req.type === 'prefs.get') return { autoLockMinutes: 60 };
    if (req.type === 'resume.import') { saved.push({ profile: req.profile, file: req.file }); return null; }
    if (req.type === 'profile.save') return null;
    throw new Error(`unexpected ${req.type}`);
  }) as never);
}

async function chooseFile() {
  const input = (await screen.findByLabelText('选择简历文件')) as HTMLInputElement;
  const file = new File(['%PDF'], 'cv.pdf', { type: 'application/pdf' });
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  fireEvent.change(input);
}

beforeEach(() => {
  mockCall.mockReset();
  mockImport.mockReset();
});
afterEach(() => {
  cleanup();
});

describe('describeWarning', () => {
  it('names the section and item position', () => {
    expect(describeWarning({ path: 'education.0.degree', message: '未识别到学历' })).toBe('教育经历 第 1 条：未识别到学历');
    expect(describeWarning({ path: 'basic.name', message: '未识别到姓名' })).toBe('基本信息：未识别到姓名');
    expect(describeWarning({ path: 'sections', message: 'x' })).toBe('整体：x');
  });
});

describe('import flow', () => {
  it('parses, reviews and saves profile with the original file', async () => {
    const saved: unknown[] = [];
    backend(saved);
    mockImport.mockResolvedValue({
      parse: {
        profile: parsedProfile(),
        warnings: [{ path: 'basic.phone', message: '未识别到手机号' }],
        text: '李明\nliming@example.com',
      },
      file: FILE,
    });
    render(<App />);
    await chooseFile();
    await screen.findByText('确认导入并加密保存');
    expect(screen.getByText('基本信息：未识别到手机号')).toBeTruthy();
    expect(screen.getByLabelText('简历原文').textContent).toContain('liming@example.com');
    expect((screen.getByLabelText('姓名') as HTMLInputElement).value).toBe('李明');
    fireEvent.click(screen.getByText('确认导入并加密保存'));
    await screen.findByLabelText('选择简历文件');
    expect(saved).toEqual([{ profile: parsedProfile(), file: FILE }]);
    expect((screen.getByLabelText('姓名') as HTMLInputElement).value).toBe('李明');
  });

  it('shows import errors and stays on the editor', async () => {
    backend([]);
    mockImport.mockRejectedValue(new ImportError('NO_TEXT'));
    render(<App />);
    await chooseFile();
    await screen.findByText(/未识别到文字/);
    expect(screen.queryByText('确认导入并加密保存')).toBeNull();
  });

  it('logs unexpected failures and shows a generic message', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    backend([]);
    const boom = new Error('boom');
    mockImport.mockRejectedValue(boom);
    render(<App />);
    await chooseFile();
    await screen.findByText('解析失败，请重试');
    expect(spy).toHaveBeenCalledWith('[ResumeSub] resume import failed', boom);
    spy.mockRestore();
  });

  it('does not log expected import errors', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    backend([]);
    mockImport.mockRejectedValue(new ImportError('NO_TEXT'));
    render(<App />);
    await chooseFile();
    await screen.findByText(/未识别到文字/);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('keeps a profile saved while the import was running', async () => {
    backend([]);
    let finish: (value: Awaited<ReturnType<typeof importResume>>) => void = () => {};
    mockImport.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    render(<App />);
    await chooseFile();
    fireEvent.input(screen.getByLabelText('姓名'), { target: { value: '赵六' } });
    fireEvent.click(screen.getByText('加密保存'));
    await screen.findByText('已加密保存');
    finish({ parse: { profile: parsedProfile(), warnings: [], text: '李明' }, file: FILE });
    fireEvent.click(await screen.findByText('放弃导入'));
    await screen.findByLabelText('选择简历文件');
    expect((screen.getByLabelText('姓名') as HTMLInputElement).value).toBe('赵六');
  });

  it('cancel returns to the editor without saving', async () => {
    const saved: unknown[] = [];
    backend(saved);
    mockImport.mockResolvedValue({ parse: { profile: parsedProfile(), warnings: [], text: '李明' }, file: FILE });
    render(<App />);
    await chooseFile();
    fireEvent.click(await screen.findByText('放弃导入'));
    await waitFor(() => expect(screen.queryByText('确认导入并加密保存')).toBeNull());
    expect(saved).toEqual([]);
  });
});
