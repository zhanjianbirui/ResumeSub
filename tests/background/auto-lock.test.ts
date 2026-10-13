import { describe, expect, it } from 'vitest';
import { createAutoLock, isAutoLockAlarm } from '@/background/auto-lock';
import { AUTO_LOCK_ALARM } from '@/shared/constants';

function fakeAlarms() {
  const calls: string[] = [];
  return {
    calls,
    create: async (name: string, info: { delayInMinutes: number }) => {
      calls.push(`create:${name}:${info.delayInMinutes}`);
    },
    clear: async (name: string) => {
      calls.push(`clear:${name}`);
      return true;
    },
  };
}

describe('auto lock', () => {
  it('schedules an alarm for the configured minutes', async () => {
    const alarms = fakeAlarms();
    await createAutoLock(alarms, async () => 15).touch();
    expect(alarms.calls).toEqual([`create:${AUTO_LOCK_ALARM}:15`]);
  });

  it('clears the alarm when minutes is 0 (lock on browser close only)', async () => {
    const alarms = fakeAlarms();
    await createAutoLock(alarms, async () => 0).touch();
    expect(alarms.calls).toEqual([`clear:${AUTO_LOCK_ALARM}`]);
  });

  it('cancel clears the alarm', async () => {
    const alarms = fakeAlarms();
    await createAutoLock(alarms, async () => 60).cancel();
    expect(alarms.calls).toEqual([`clear:${AUTO_LOCK_ALARM}`]);
  });

  it('recognises its own alarm', () => {
    expect(isAutoLockAlarm({ name: AUTO_LOCK_ALARM })).toBe(true);
    expect(isAutoLockAlarm({ name: 'other' })).toBe(false);
  });
});
