import { formatDate } from './TimeHelper';
import { CalendarEvent, ITile } from '../types';

const MINUTES_PER_HOUR = 60;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns true if two dates fall on the same calendar day. */
const isSameDay = (a: Date, b: Date): boolean => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

// ─── View Date Calculations ───────────────────────────────────────────────────

export const calculateViewDateTimes = (selectedDate: Date, startTime: Date, endTime: Date, viewType: string): { start: Date; end: Date } => {
	const getStartOfWeek = (date: Date): Date => {
		const clone = new Date(date.getTime());
		const day = clone.getDay();
		const diff = clone.getDate() - day + (day === 0 ? -6 : 1); // adjust for Sunday
		return new Date(clone.setDate(diff));
	};

	const setDateTime = (baseDate: Date, time: Date): Date => {
		const newDate = new Date(baseDate);
		newDate.setHours(time.getHours(), time.getMinutes(), 0, 0);
		return newDate;
	};

	if (viewType === 'week') {
		const startOfWeek = getStartOfWeek(selectedDate);
		const endOfWeek = new Date(startOfWeek);
		endOfWeek.setDate(startOfWeek.getDate() + 6);
		return {
			start: setDateTime(startOfWeek, startTime),
			end: setDateTime(endOfWeek, endTime),
		};
	}

	if (viewType === 'day') {
		return {
			start: setDateTime(selectedDate, startTime),
			end: setDateTime(selectedDate, endTime),
		};
	}

	return { start: selectedDate, end: new Date() };
};

// ─── Array Builders ───────────────────────────────────────────────────────────

export const getTimesArray = (start: Date, end: Date, format: string, step: number): string[] => {
	const startClone = new Date(start.getTime());
	const endClone = new Date(end.getTime());
	const timesArray: string[] = [];

	if (startClone.getTime() === endClone.getTime()) {
		endClone.setDate(endClone.getDate() + 1);
	}

	while (startClone <= endClone) {
		timesArray.push(formatDate(startClone, format));
		startClone.setHours(startClone.getHours() + step);
	}

	return timesArray;
};

export const getDaysArray = (selectedDay: Date, viewType: string): { title: string; isSelect: boolean; date: Date }[] => {
	const today = new Date();

	if (viewType === 'day') {
		return [
			{
				title: formatDate(selectedDay, 'DDD DD'),
				isSelect: isSameDay(selectedDay, today),
				date: selectedDay,
			},
		];
	}

	const current = new Date(selectedDay.getTime());
	const dayOfWeek = current.getDay();
	const diffToMonday = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
	current.setDate(current.getDate() + diffToMonday);

	const daysArray: { title: string; isSelect: boolean; date: Date }[] = [];

	for (let i = 0; i < 7; i++) {
		daysArray.push({
			title: formatDate(current, 'DDD DD'),
			isSelect: isSameDay(current, today),
			date: new Date(current.getTime()),
		});
		current.setDate(current.getDate() + 1);
	}

	return daysArray;
};

// ─── Event Normalization ──────────────────────────────────────────────────────

/**
 * Ensures event.start <= event.end and converts string dates to Date objects.
 */
const normalizeEventTimes = <T>(event: CalendarEvent<T>): CalendarEvent<T> => {
	const start = typeof event.start === 'string' ? new Date(event.start) : event.start;
	const end = typeof event.end === 'string' ? new Date(event.end) : event.end;

	// Swap if start is after end
	if (start.getTime() > end.getTime()) {
		return { ...event, start: end, end: start };
	}

	return { ...event, start, end };
};

// ─── Event Queries ────────────────────────────────────────────────────────────

export const getEventsForCurrentDate = <T>(events: CalendarEvent<T>[], firstDate: Date, lastDate: Date): CalendarEvent<T>[] => {
	const normalized = events.map(normalizeEventTimes);
	const firstTime = firstDate.getTime();
	const lastTime = lastDate.getTime();

	return normalized
		.filter((event) => {
			const startTime = (event.start as Date).getTime();
			const endTime = (event.end as Date).getTime();
			return startTime < lastTime && endTime > firstTime;
		})
		.sort((a, b) => (a.start as Date).getTime() - (b.start as Date).getTime());
};

export const getEventTiles = <T>(events: CalendarEvent<T>[], startDateTime: Date, endDateTime: Date): ITile<T>[][] => {
	const startClone = new Date(startDateTime.getTime());
	const endClone = new Date(endDateTime.getTime());
	const returnArray: ITile<T>[][] = [];

	const normalizedEvents = events.map(normalizeEventTimes);

	while (startClone.getTime() < endClone.getTime()) {
		const dayEnd = new Date(startClone.getTime());
		dayEnd.setHours(endClone.getHours(), endClone.getMinutes(), 0, 0);

		const dayEvents = normalizedEvents.filter((event) => {
			const startTime = (event.start as Date).getTime();
			const endTime = (event.end as Date).getTime();
			return startTime < dayEnd.getTime() && endTime > startClone.getTime();
		});

		const tilesForOneDay: ITile<T>[] = dayEvents.map((event) => {
			const { top, height } = calculatePositionAndHeight(startClone, dayEnd, event.start as Date, event.end as Date);
			return {
				start: event.start as Date,
				end: event.end as Date,
				event,
				top,
				title: event.title || 'unknown',
				left: 0,
				width: 100,
				height,
			};
		});
		const conflictGroups = findConflictGroups(tilesForOneDay.sort((a, b) => a.start.getTime() - b.start.getTime()));
		const laidOutTiles = conflictGroups.flatMap((group) => calculateLayout(group));
		returnArray.push(laidOutTiles as ITile<T>[]);

		startClone.setDate(startClone.getDate() + 1);
	}

	return returnArray;
};

// ─── Layout Calculations ──────────────────────────────────────────────────────

const findConflictGroups = <T>(tiles: ITile<T>[]): ITile<T>[][] => {
	const groups: ITile<T>[][] = [];

	for (const tile of tiles) {
		let addedToGroup = false;

		for (const group of groups) {
			const isConflicting = group.some((existing) => tile.start.getTime() < existing.end.getTime() && tile.end.getTime() > existing.start.getTime());
			if (isConflicting) {
				group.push(tile);
				addedToGroup = true;
				break;
			}
		}

		if (!addedToGroup) {
			groups.push([tile]);
		}
	}

	return groups;
};

/**
 * Calculates width, left offset, and columnIndex for all events in a conflict group.
 */
const calculateLayout = <T>(conflictGroup: ITile<T>[]) => {
	if (conflictGroup.length === 0) return [];

	// Determine max simultaneous depth
	const points: { time: number; type: 'start' | 'end' }[] = [];
	for (const event of conflictGroup) {
		points.push({ time: event.start.getTime(), type: 'start' });
		points.push({ time: event.end.getTime(), type: 'end' });
	}
	points.sort((a, b) => (a.time !== b.time ? a.time - b.time : a.type === 'end' ? -1 : 1));

	let currentDepth = 0;
	let maxDepth = 0;
	for (const point of points) {
		currentDepth += point.type === 'start' ? 1 : -1;
		maxDepth = Math.max(maxDepth, currentDepth);
	}

	const baseWidth = 100 / maxDepth;
	const columnFreeTime = new Array(maxDepth).fill({ start: 0, end: 0 });

	// Assign columns
	const laidOutEvents = conflictGroup.map((event) => {
		let bestColumnIndex = -1;
		let earliestFreeTime = Infinity;

		for (let i = 0; i < maxDepth; i++) {
			if (columnFreeTime[i].end <= event.start.getTime()) {
				if (columnFreeTime[i].end < earliestFreeTime) {
					earliestFreeTime = columnFreeTime[i].end;
					bestColumnIndex = i;
					break;
				}
			}
		}

		const columnIndex = bestColumnIndex !== -1 ? bestColumnIndex : 0;
		columnFreeTime[columnIndex] = {
			start: columnFreeTime[columnIndex].start === 0 ? event.start.getTime() : columnFreeTime[columnIndex].start,
			end: event.end.getTime(),
		};

		return { ...event, columnIndex, maxDepth, width: baseWidth, left: columnIndex * baseWidth };
	});

	// Calculate span (how many columns an event can expand into)
	return laidOutEvents.map((event) => {
		let span = 1;
		for (let j = event.columnIndex + 1; j < maxDepth; j++) {
			const colStart = columnFreeTime[j].start;
			const colEnd = columnFreeTime[j].end;
			const overlaps =
				(event.start.getTime() >= colStart && event.start.getTime() < colEnd) ||
				(event.end.getTime() > colStart && event.end.getTime() <= colEnd) ||
				(event.start.getTime() <= colStart && event.end.getTime() >= colEnd);
			if (overlaps) break;
			span++;
		}
		return { ...event, span, width: baseWidth * span };
	});
};

const calculatePositionAndHeight = (startDate: Date, endDate: Date, eventStart: Date, eventEnd: Date) => {
	const totalDuration = (endDate.getTime() - startDate.getTime()) / 1000 / MINUTES_PER_HOUR + MINUTES_PER_HOUR;
	const startOffset = eventStart.getTime() < startDate.getTime() ? 0 : (eventStart.getTime() - startDate.getTime()) / 1000 / MINUTES_PER_HOUR;
	const endOffset = eventEnd.getTime() > endDate.getTime() ? totalDuration : (eventEnd.getTime() - startDate.getTime()) / 1000 / MINUTES_PER_HOUR;
	const duration = endOffset - startOffset;

	return {
		top: (startOffset / totalDuration) * 100,
		height: (duration / totalDuration) * 100,
	};
};
