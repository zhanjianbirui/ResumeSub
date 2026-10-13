import * as v from 'valibot';

/** 不含敏感信息、上锁状态下也需要读取的偏好，明文存储。 */
export const PrefsSchema = v.object({
  autoLockMinutes: v.picklist([0, 15, 60]),
});

export type Prefs = v.InferOutput<typeof PrefsSchema>;

export const DEFAULT_PREFS: Prefs = { autoLockMinutes: 60 };
