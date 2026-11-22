// Недельная подгрузка расписания — та же логика, что и на вебе (frontend/src/pages/Schedule/Schedule.tsx).
// Неделя идентифицируется ключом её понедельника: 'YYYY-MM-DD'.

export const getStartOfWeek = (date: Date): Date => {
	const clone = new Date(date.getTime());
	const day = clone.getDay();
	const diff = clone.getDate() - day + (day === 0 ? -6 : 1);
	const startOfWeek = new Date(clone.setDate(diff));
	startOfWeek.setHours(0, 0, 0, 0);
	return startOfWeek;
};

export const addWeeks = (date: Date, weeks: number): Date => {
	const clone = new Date(date);
	clone.setDate(clone.getDate() + weeks * 7);
	return clone;
};

export const getWeekKey = (date: Date): string => {
	const monday = getStartOfWeek(date);
	const yyyy = monday.getFullYear();
	const mm = String(monday.getMonth() + 1).padStart(2, '0');
	const dd = String(monday.getDate()).padStart(2, '0');
	return `${yyyy}-${mm}-${dd}`;
};

export const parseWeekKey = (weekKey: string): Date => {
	const [yyyy, mm, dd] = weekKey.split('-').map(Number);
	return new Date(yyyy, mm - 1, dd, 0, 0, 0, 0);
};

/** Недели вокруг даты: предыдущая, текущая и следующая (понедельники крайних) */
export const getWeekRangeAround = (date: Date): { start: Date; end: Date } => {
	const monday = getStartOfWeek(date);
	return { start: addWeeks(monday, -1), end: addWeeks(monday, 1) };
};

export const weekKeysBetween = (firstMonday: Date, lastMonday: Date): string[] => {
	const keys: string[] = [];
	for (let monday = getStartOfWeek(firstMonday); monday <= lastMonday; monday = addWeeks(monday, 1)) {
		keys.push(getWeekKey(monday));
	}
	return keys;
};

/**
 * Разбивает недели на непрерывные отрезки, чтобы грузить каждый одним запросом:
 * три недели вокруг даты — один запрос, а не три.
 */
export const groupConsecutiveWeeks = (weekKeys: string[]): string[][] => {
	const groups: string[][] = [];
	[...weekKeys].sort().forEach((key) => {
		const lastGroup = groups[groups.length - 1];
		const prevKey = lastGroup?.[lastGroup.length - 1];
		if (prevKey && getWeekKey(addWeeks(parseWeekKey(prevKey), 1)) === key) {
			lastGroup.push(key);
		} else {
			groups.push([key]);
		}
	});
	return groups;
};

/** Понедельник 00:00 первой недели — воскресенье 23:59:59.999 последней */
export const getWeeksBounds = (weekKeys: string[]): { start: Date; end: Date } => {
	const start = parseWeekKey(weekKeys[0]);
	const end = parseWeekKey(weekKeys[weekKeys.length - 1]);
	end.setDate(end.getDate() + 6);
	end.setHours(23, 59, 59, 999);
	return { start, end };
};

// ─── Постраничная подгрузка List ─────────────────────────────────────────────
// API хранит и отдаёт время «как на часах» без часового пояса: 'YYYY-MM-DD HH:mm:ss'.
// Курсором служит именно такая строка — без перевода в UTC и обратно.

export const LIST_PAGE_SIZE = 100;

const pad = (n: number) => String(n).padStart(2, '0');

export const toLocalDbString = (date: Date): string =>
	`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;

export const parseLocalDateTime = (value: string | Date): Date => {
	if (value instanceof Date) return value;
	const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/.exec(value);
	if (m && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(value)) {
		return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
	}
	return new Date(value);
};
