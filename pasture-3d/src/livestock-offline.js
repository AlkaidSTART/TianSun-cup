// 第 1 天「设备掉线 → 自动恢复」：纯数据 + 纯时间判定，不依赖 DOM，可在 Node 里直接跑自检。
//
// 规则：
//  - 掉线名额由 livestock-sprites.js 用固定种子选出（dayOfflineCandidate 标记），页面刷新后名单不变。
//  - 每头掉线持续 3-4 小时，到点自动恢复为原来的健康状态。
//  - 掉线期间保留最后已知位置、原地不动；恢复后用 REJOIN_HOURS 平滑归位，避免瞬移。
import { normalizeHour } from './livestock-day1-motion.js';

export const MIN_OFFLINE_HOURS = 3;
export const MAX_OFFLINE_HOURS = 4;
// 恢复后从「冻结位置」平滑回到当天轨迹所用的时间（小时）。
export const REJOIN_HOURS = 0.25;

// 第 1 天掉线时段表，按掉线名额顺序分配。
// 起点都排在默认起始时刻 10:00 之后，保证页面加载时能看到完整的「掉线 → 静止 → 恢复」全过程。
export const DAY_ONE_OFFLINE_WINDOWS = [
  { startHour: 10.5, durationHours: 3.5 },
  { startHour: 12, durationHours: 4 },
  { startHour: 14.5, durationHours: 3 },
  { startHour: 17, durationHours: 3.5 }
];

export function formatOfflineHour(hour) {
  const totalMinutes = Math.round(normalizeHour(hour) * 60) % 1440;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// 距离本次掉线开始已经过去多少小时（0 ~ 24，自动处理跨零点）。
export function hoursSinceOfflineStart(entry, hour) {
  return normalizeHour(hour - entry.startHour);
}

export function isOfflineAtHour(entry, hour) {
  return hoursSinceOfflineStart(entry, hour) < entry.durationHours;
}

// 距离本次恢复已经过去多少小时（用于平滑归位窗口）。
export function hoursSinceRecovery(entry, hour) {
  return normalizeHour(hour - entry.endHour);
}

// 把 dayOfflineCandidate 的牲畜排出第 1 天掉线计划（谁、几点掉线、掉多久、恢复成什么状态）。
export function createDayOneOfflineSchedule(livestock) {
  const candidates = livestock.filter((animal) => animal.dayOfflineCandidate);
  if (!candidates.length) throw new Error('[day1-offline] 没有找到第 1 天掉线牲畜（dayOfflineCandidate 标记缺失）');
  return candidates.map((animal, index) => {
    const window = DAY_ONE_OFFLINE_WINDOWS[index % DAY_ONE_OFFLINE_WINDOWS.length];
    const startHour = normalizeHour(window.startHour);
    const durationHours = window.durationHours;
    return {
      animal,
      animalId: animal.id,
      ownerName: animal.ownerName,
      healthStatus: animal.telemetry.lastHealthStatus,
      startHour,
      durationHours,
      endHour: normalizeHour(startHour + durationHours)
    };
  });
}

export function validateDayOneOfflineSchedule(schedule, { sampleStepHours = 0.5 } = {}) {
  const rows = schedule.map((entry) => ({
    编号: entry.animalId,
    牧户: entry.ownerName,
    原健康状态: entry.healthStatus,
    掉线开始: formatOfflineHour(entry.startHour),
    掉线结束: formatOfflineHour(entry.endHour),
    持续小时: entry.durationHours
  }));
  const durationViolations = schedule
    .filter((entry) => entry.durationHours < MIN_OFFLINE_HOURS || entry.durationHours > MAX_OFFLINE_HOURS)
    .map((entry) => entry.animalId);
  const hourSamples = [];
  for (let hour = 0; hour < 24; hour += sampleStepHours) {
    hourSamples.push({
      时刻: formatOfflineHour(hour),
      掉线头数: schedule.filter((entry) => isOfflineAtHour(entry, hour)).length
    });
  }
  const summary = {
    掉线头数: schedule.length,
    掉线编号: schedule.map((entry) => entry.animalId),
    时长范围: `${MIN_OFFLINE_HOURS}-${MAX_OFFLINE_HOURS} 小时`,
    时长违规: durationViolations,
    passed: durationViolations.length === 0
  };
  console.groupCollapsed('[day1-offline] 第 1 天掉线计划自检');
  console.table(rows);
  console.info('[day1-offline] 掉线计划汇总:', summary);
  console.table(hourSamples);
  console.groupEnd();
  if (durationViolations.length) console.error(`[day1-offline] 掉线时长超出 3-4 小时：${durationViolations.join('、')}`);
  return { rows, hourSamples, summary };
}
