export const formatDate = (date: Date | string | undefined, format: string, H = false) => {
	if (date === undefined || !date) return '';
	if (typeof date === 'string') {
		if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
			const [y, m, d] = date.split('-').map(Number);
			date = new Date(y, m - 1, d); // LOCAL date
		} else {
			date = new Date(date);
		}
	}
	if (!(date instanceof Date)) {
		throw new Error('Invalid date object');
	}

	if (H) {
		// if H is true that means show today if date is today, hide year if same year
		const today = new Date();
		if (date.getFullYear() === today.getFullYear() && date.getMonth() === today.getMonth() && date.getDate() === today.getDate()) {
			return 'Today';
		}
		if (date.getFullYear() === today.getFullYear()) {
			format = format.replace('YYYY', '');
		}
	}

	const zeroPad = (num: number) => num.toString().padStart(2, '0');

	const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

	const monthAbbreviations = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

	const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

	const dayAbbreviations = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

	// First, handle longer tokens to avoid partial replacements
	const replacements: { [key: string]: string | number } = {
		YYYY: date.getFullYear(),
		YY: date.getFullYear().toString().slice(-2),
		MMMM: monthNames[date.getMonth()],
		MMM: monthAbbreviations[date.getMonth()],
		MM: zeroPad(date.getMonth() + 1), // Months are zero-based in JavaScript
		M: date.getMonth() + 1,
		DDDD: dayNames[date.getDay()],
		DDD: dayAbbreviations[date.getDay()],
		DD: zeroPad(date.getDate()),
		D: date.getDate(),
		HH: zeroPad(date.getHours()),
		H: date.getHours(),
		hh: zeroPad(date.getHours() % 12 || 12),
		h: date.getHours() % 12 || 12,
		mm: zeroPad(date.getMinutes()),
		m: date.getMinutes(),
		A: date.getHours() < 12 ? 'AM' : 'PM',
		ss: zeroPad(date.getSeconds()),
	};

	return format.replace(/YYYY|YY|MMMM|MMM|MM|M|DDDD|DDD|DD|D|HH|H|hh|h|mm|m|A|ss/g, (match) => replacements[match as keyof typeof replacements].toString());
};

// Function to parse a time string into a Date object
const parseTimeToDate = (time: string): Date => {
	const now = new Date();
	let hours = 0;
	let minutes = 0;

	// Handle time format "7 am", "7 pm", etc.
	const amPmMatch = time.match(/^(\d{1,2})\s?(am|pm)$/i);
	if (amPmMatch) {
		hours = parseInt(amPmMatch[1]);
		if (amPmMatch[2].toLowerCase() === 'pm' && hours !== 12) {
			hours += 12;
		}
		if (amPmMatch[2].toLowerCase() === 'am' && hours === 12) {
			hours = 0;
		}
	}

	// Handle time format "07:00"
	const hhMmMatch = time.match(/^(\d{1,2}):(\d{2})$/);
	if (hhMmMatch) {
		hours = parseInt(hhMmMatch[1]);
		minutes = parseInt(hhMmMatch[2]);
	}

	const date = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes, 0);

	return date;
};

// Function to add hours to a Date object
const addHours = (date: Date, hours: number): Date => {
	const result = new Date(date);
	result.setTime(result.getTime() + hours * 60 * 60 * 1000);
	return result;
};

// Function to add days to a Date object
const addDays = (date: Date, days: number): Date => {
	const result = new Date(date);
	result.setTime(result.getTime() + days * 24 * 60 * 60 * 1000);
	return result;
};

// Function add weeks to a Date object
const addWeeks = (date: Date, weeks: number): Date => {
	const result = new Date(date);
	result.setTime(result.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);
	return result;
};

export { addHours, addWeeks, parseTimeToDate, addDays };
