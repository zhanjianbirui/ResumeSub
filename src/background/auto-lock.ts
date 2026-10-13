import { AUTO_LOCK_ALARM } from '@/shared/constants';

export interface AlarmsLike {
  create(name: string, info: { delayInMinutes: number }): Promise<void>;
  clear(name: string): Promise<boolean>;
}

export interface AutoLock {
  /** 用户每次有效操作后调用，重新开始闲置计时。 */
  touch(): Promise<void>;
  cancel(): Promise<void>;
}

export function createAutoLock(alarms: AlarmsLike, getMinutes: () => Promise<number>): AutoLock {
  return {
    async touch() {
      const minutes = await getMinutes();
      if (minutes <= 0) {
        await alarms.clear(AUTO_LOCK_ALARM);
        return;
      }
      await alarms.create(AUTO_LOCK_ALARM, { delayInMinutes: minutes });
    },
    async cancel() {
      await alarms.clear(AUTO_LOCK_ALARM);
    },
  };
}

export function isAutoLockAlarm(alarm: { name: string }): boolean {
  return alarm.name === AUTO_LOCK_ALARM;
}
