import { describe, expect, it, vi } from 'vitest';
import { importResume } from '@/import/import-resume';
import { base64ToBytes } from '@/shared/base64';
import { MAX_RESUME_BYTES } from '@/shared/constants';
import { ZH_RESUME } from '../helpers/lines';

const pdf = (bytes: Uint8Array<ArrayBuffer> | string = 'pdf-bytes') => new File([bytes], 'cv.pdf', { type: 'application/pdf' });

describe('importResume', () => {
  it('parses lines and encodes the original file', async () => {
    const result = await importResume(pdf(), async () => ZH_RESUME);
    expect(result.parse.profile.basic.name).toBe('李明');
    expect(result.file).toMatchObject({ name: 'cv.pdf', mime: 'application/pdf' });
    expect(new TextDecoder().decode(base64ToBytes(result.file.dataBase64))).toBe('pdf-bytes');
  });

  it('rejects unsupported types before extracting', async () => {
    const extract = vi.fn();
    await expect(importResume(new File(['x'], 'cv.txt'), extract)).rejects.toMatchObject({ code: 'UNSUPPORTED_TYPE' });
    expect(extract).not.toHaveBeenCalled();
  });

  it('rejects files over the size limit', async () => {
    await expect(importResume(pdf(new Uint8Array(MAX_RESUME_BYTES + 1)), async () => ZH_RESUME))
      .rejects.toMatchObject({ code: 'TOO_LARGE' });
  });

  it('reports scanned documents without text as NO_TEXT', async () => {
    await expect(importResume(pdf(), async () => [])).rejects.toMatchObject({ code: 'NO_TEXT' });
  });

  it('maps extraction failures to READ_FAILED and logs the cause', async () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(importResume(pdf(), async () => { throw new Error('bad pdf'); }))
      .rejects.toMatchObject({ code: 'READ_FAILED' });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
