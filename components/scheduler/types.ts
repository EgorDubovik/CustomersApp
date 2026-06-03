import React from 'react';

// ─── View Type ───────────────────────────────────────────────────────────────

export type ViewType = 'week' | 'day' | 'list';

// ─── Core Event ──────────────────────────────────────────────────────────────

export interface CalendarEvent<T = any> {
	id: string | number;
	start: string | Date;
	end: string | Date;
	title?: string;
	color?: string;
	opacity?: number;
	onClick?: () => void;
	data?: T;
}

// ─── Scheduler Props ─────────────────────────────────────────────────────────

export interface AppointmentsSchedulerProps<T = any> {
	// Layout
	startTime?: string;
	endTime?: string;
	blockHeight?: number;
	isDaysNames?: boolean;
	isNavigation?: boolean;
	isHeader?: boolean;
	// State
	viewType?: ViewType;
	defaultViewType?: ViewType;
	currentDate?: string | Date;
	events?: CalendarEvent<T>[];
	// Refresh
	refreshing?: boolean;
	onRefresh?: () => void;
	// Appearance
	defaultAppointmentOpacity?: number;
	defaultAppointmentBgColor?: string;
	// Time line
	showCurrentTimeLine?: boolean;
	currentTimeLineColor?: string;
	showTooltip?: boolean;
	// Callbacks
	onClickHandler?: (event: CalendarEvent<T>) => void;
	onCurrentDateChange?: (date: Date) => void;
	onViewTypeChange?: (viewType: ViewType) => void;
	onRangeChange?: (selectedDate: Date, startDate: Date, endDate: Date, viewType: ViewType) => void;
	// Customization
	renderTile?: (data: T, event: CalendarEvent<T>) => React.ReactNode;
	renderListItem?: (event: CalendarEvent<T>) => React.ReactNode;
	renderTooltip?: (event: CalendarEvent<T>) => React.ReactNode;
	filterEvent?: (event: CalendarEvent<T>) => boolean;
}

// ─── Internal Types ───────────────────────────────────────────────────────────

export interface ITile<T = any> {
	event: CalendarEvent<T>;
	top: number;
	start: Date;
	end: Date;
	left: number;
	width: number;
	columnIndex?: number;
	maxDepth?: number;
	span?: number;
	height: number;
	title?: string;
}

export interface IDayInfo {
	title: string;
	isSelect: boolean;
	date: Date;
}

// ─── Component Props ──────────────────────────────────────────────────────────

export interface GridsProps<T = any> {
	eventTiles: ITile<T>[][];
	daysArray: IDayInfo[];
	startTime: Date;
	endTime: Date;
	timesArray: string[];
	blockHeight: number;
	onAppointmentClick?: (event: CalendarEvent<T>) => void;
	defaultAppointmentOpacity: number;
	defaultAppointmentBgColor: string;
	renderTile?: (data: T, event: CalendarEvent<T>) => React.ReactNode;
	renderTooltip?: (event: CalendarEvent<T>) => React.ReactNode;
	showTooltip?: boolean;
	showCurrentTimeLine?: boolean;
	currentTimeLineColor?: string;
}

export interface ListViewProps<T = any> {
	events: CalendarEvent<T>[];
	startViewDateTime?: Date;
	endViewDateTime?: Date;
	defaultAppointmentBgColor: string;
	defaultAppointmentOpacity: number;
	showAll?: boolean;
	renderListItem?: (event: CalendarEvent<T>) => React.ReactNode;
}
