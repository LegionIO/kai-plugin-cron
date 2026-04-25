const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function formatTime(hour: number, minute: number): string {
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  return `${h12}:${pad2(minute)} ${suffix}`;
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

type Field = {
  type: 'every' | 'step' | 'range' | 'list' | 'single';
  value?: number;
  step?: number;
  start?: number;
  end?: number;
  values?: number[];
  raw: string;
};

function parseField(raw: string, min: number, max: number): Field {
  const s = raw.trim();
  if (s === '*') return { type: 'every', raw: s };

  if (s.startsWith('*/')) {
    const step = parseInt(s.slice(2), 10);
    if (!isNaN(step)) return { type: 'step', step, raw: s };
  }

  if (s.includes('/')) {
    const [rangePart, stepPart] = s.split('/');
    const step = parseInt(stepPart, 10);
    if (rangePart === '*') return { type: 'step', step, raw: s };
    if (rangePart.includes('-')) {
      const [a, b] = rangePart.split('-').map(Number);
      return { type: 'step', start: a, end: b, step, raw: s };
    }
  }

  if (s.includes('-') && !s.includes(',')) {
    const [a, b] = s.split('-').map(Number);
    return { type: 'range', start: a, end: b, raw: s };
  }

  if (s.includes(',')) {
    const values = s.split(',').map(Number).filter((n) => !isNaN(n));
    return { type: 'list', values, raw: s };
  }

  const n = parseInt(s, 10);
  if (!isNaN(n)) return { type: 'single', value: n, raw: s };

  return { type: 'every', raw: s };
}

function describeDow(field: Field): string {
  if (field.type === 'every') return '';
  if (field.type === 'single') return `on ${DAY_NAMES[field.value! % 7]}`;
  if (field.type === 'range') {
    if (field.start === 1 && field.end === 5) return 'on weekdays';
    if (field.start === 0 && field.end === 6) return '';
    return `on ${DAY_SHORT[field.start! % 7]} through ${DAY_SHORT[field.end! % 7]}`;
  }
  if (field.type === 'list') {
    const vals = field.values!;
    if (vals.length === 2) {
      const sorted = [...vals].sort();
      if ((sorted[0] === 0 && sorted[1] === 6) || (sorted[0] === 6 && sorted[1] === 0)) return 'on weekends';
    }
    const names = vals.map((v) => DAY_SHORT[v % 7]);
    if (names.length <= 2) return `on ${names.join(' and ')}`;
    return `on ${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
  }
  return '';
}

function describeMonth(field: Field): string {
  if (field.type === 'every') return '';
  if (field.type === 'single') return `in ${MONTH_NAMES[field.value! - 1] ?? `month ${field.value}`}`;
  if (field.type === 'list') {
    const names = field.values!.map((v) => MONTH_NAMES[v - 1] ?? `month ${v}`);
    if (names.length <= 2) return `in ${names.join(' and ')}`;
    return `in ${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
  }
  if (field.type === 'range') {
    return `from ${MONTH_NAMES[(field.start ?? 1) - 1]} through ${MONTH_NAMES[(field.end ?? 12) - 1]}`;
  }
  return '';
}

function describeDom(field: Field): string {
  if (field.type === 'every') return '';
  if (field.type === 'single') return `on the ${ordinal(field.value!)}`;
  if (field.type === 'list') {
    const ords = field.values!.map(ordinal);
    if (ords.length <= 2) return `on the ${ords.join(' and ')}`;
    return `on the ${ords.slice(0, -1).join(', ')}, and ${ords[ords.length - 1]}`;
  }
  if (field.type === 'range') {
    return `on the ${ordinal(field.start!)} through ${ordinal(field.end!)}`;
  }
  if (field.type === 'step') {
    return `every ${ordinal(field.step!)} day`;
  }
  return '';
}

export function cronToHuman(expression: string): string {
  const trimmed = expression.trim();
  const parts = trimmed.split(/\s+/);
  if (parts.length < 5) return trimmed;

  const [minRaw, hourRaw, domRaw, monthRaw, dowRaw] = parts;

  const minute = parseField(minRaw, 0, 59);
  const hour = parseField(hourRaw, 0, 23);
  const dom = parseField(domRaw, 1, 31);
  const month = parseField(monthRaw, 1, 12);
  const dow = parseField(dowRaw, 0, 6);

  const segments: string[] = [];

  // Frequency / time description
  if (minute.type === 'every' && hour.type === 'every') {
    segments.push('Every minute');
  } else if (minute.type === 'step' && hour.type === 'every') {
    segments.push(`Every ${minute.step} minute${minute.step! > 1 ? 's' : ''}`);
  } else if (minute.type === 'every' && hour.type === 'step') {
    segments.push(`Every ${hour.step} hour${hour.step! > 1 ? 's' : ''}`);
  } else if (minute.type === 'single' && hour.type === 'every') {
    segments.push(`Every hour at :${pad2(minute.value!)}`);
  } else if (minute.type === 'single' && hour.type === 'step') {
    segments.push(`At :${pad2(minute.value!)} every ${hour.step} hour${hour.step! > 1 ? 's' : ''}`);
  } else if (minute.type === 'single' && hour.type === 'single') {
    segments.push(`At ${formatTime(hour.value!, minute.value!)}`);
  } else if (minute.type === 'single' && hour.type === 'list') {
    const times = hour.values!.map((h) => formatTime(h, minute.value!));
    if (times.length <= 3) {
      segments.push(`At ${times.join(' and ')}`);
    } else {
      segments.push(`At ${times.slice(0, -1).join(', ')}, and ${times[times.length - 1]}`);
    }
  } else if (minute.type === 'single' && hour.type === 'range') {
    segments.push(`At :${pad2(minute.value!)} from ${formatTime(hour.start!, 0)} through ${formatTime(hour.end!, 0)}`);
  } else if (minute.type === 'list' && hour.type === 'single') {
    const times = minute.values!.map((m) => `:${pad2(m)}`);
    segments.push(`At ${formatTime(hour.value!, minute.values![0])} (minutes ${times.join(', ')})`);
  } else {
    // Fallback for complex minute/hour combos
    if (hour.type !== 'every') {
      segments.push(`Hour: ${hourRaw}`);
    }
    if (minute.type !== 'every') {
      segments.push(`Minute: ${minRaw}`);
    }
    if (segments.length === 0) segments.push('Every minute');
  }

  // Day of month
  const domDesc = describeDom(dom);
  if (domDesc) segments.push(domDesc);

  // Month
  const monthDesc = describeMonth(month);
  if (monthDesc) segments.push(monthDesc);

  // Day of week
  const dowDesc = describeDow(dow);
  if (dowDesc) segments.push(dowDesc);

  return segments.join(', ');
}
