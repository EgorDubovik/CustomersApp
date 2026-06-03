import React, { useState, useEffect, useLayoutEffect, useMemo } from 'react';
import { StyleSheet, View, useWindowDimensions, ScrollView, RefreshControl } from 'react-native';
import { AppointmentsSchedulerProps, CalendarEvent, ITile, ViewType } from './types';
import { calculateViewDateTimes, getDaysArray, getTimesArray, getEventTiles } from './utils/helper';
import ListView from './components/ListView';
import Grids from './components/Grids';
import DaysRow from './components/DaysRow';
import TimesCol from './components/TimesCol';
import SchedulerHeader from './components/SchedulerHeader';
import { useColorScheme } from '@/components/useColorScheme';

export default function AppointmentsScheduler<T extends any>(props: AppointmentsSchedulerProps<T>) {
	const {
		startTime = '08:00',
		endTime = '20:00',
		blockHeight = 55,
		isDaysNames = true,
		isNavigation = true,
		viewType: controlledViewType,
		defaultViewType = 'week',
		onViewTypeChange,
		isHeader = true,
		events = [],
		refreshing,
		onRefresh,
		defaultAppointmentOpacity = 1,
		defaultAppointmentBgColor = '#3b82f6',
		currentDate = new Date(),
		onClickHandler,
		onCurrentDateChange,
		onRangeChange,
		renderTile,
		renderListItem,
		showCurrentTimeLine = true,
		currentTimeLineColor = '#e4ad15',
	} = props;

	const { width: screenWidth } = useWindowDimensions();
	const colorScheme = useColorScheme();
	const isDark = colorScheme === 'dark';
	const themeStyles = isDark ? darkStyles : lightStyles;

	const [currentViewDate, setCurrentViewDate] = useState<Date>(new Date(currentDate));
	const [eventTiles, setEventTiles] = useState<ITile<T>[][]>([]);
	const [daysArray, setDaysArray] = useState<{ title: string; isSelect: boolean; date: Date }[]>([]);
	const [timesArray, setTimesArray] = useState<string[]>([]);
	const [filteredEvents, setFilteredEvents] = useState<CalendarEvent<T>[]>([]);
	const [viewStartDateTime, setViewStartDateTime] = useState<Date>(new Date());
	const [viewEndDateTime, setViewEndDateTime] = useState<Date>(new Date());
	const [startHour, setStartHour] = useState<Date>(new Date());
	const [endHour, setEndHour] = useState<Date>(new Date());

	const [internalViewType, setInternalViewType] = useState<ViewType>(defaultViewType);
	const isControlled = controlledViewType !== undefined;
	const currentView = isControlled ? controlledViewType : internalViewType;

	const handleViewClick = (newView: ViewType) => {
		if (!isControlled) {
			setInternalViewType(newView);
		}
		if (onViewTypeChange) {
			onViewTypeChange(newView);
		}
	};

	useEffect(() => {
		if (currentDate) {
			setCurrentViewDate(new Date(currentDate));
		}
	}, [currentDate]);

	useLayoutEffect(() => {
		const start = new Date();
		const [sh, sm] = startTime.split(':').map(Number);
		start.setHours(sh, sm, 0, 0);
		setStartHour(start);

		const end = new Date();
		const [eh, em] = endTime.split(':').map(Number);
		end.setHours(eh, em, 0, 0);
		setEndHour(end);
	}, [startTime, endTime]);

	// Recalculate view range, days grid, and event tiles whenever key state changes
	useEffect(() => {
		const { start, end } = calculateViewDateTimes(currentViewDate, startHour, endHour, currentView);
		setViewStartDateTime(start);
		setViewEndDateTime(end);
		onRangeChange?.(currentViewDate, start, end, currentView);

		const days = getDaysArray(currentViewDate, currentView);
		setDaysArray(days);

		const times = getTimesArray(startHour, endHour, 'hh A', 1);
		setTimesArray(times);
	}, [currentViewDate, currentView, startHour, endHour]);

	// Filter and process events for the active view
	useEffect(() => {
		if (currentView === 'list') {
			const eventsToShow = props.filterEvent ? events.filter(props.filterEvent) : events;
			setFilteredEvents(eventsToShow);
		} else {
			const tiles = getEventTiles(events, viewStartDateTime, viewEndDateTime);
			setEventTiles(tiles);
		}
	}, [events, viewStartDateTime, viewEndDateTime, currentView, props.filterEvent]);

	// ─── Handlers ────────────────────────────────────────────────────────────

	const navigate = (delta: number) => {
		const newDate = new Date(currentViewDate);
		newDate.setDate(newDate.getDate() + (currentView === 'week' ? delta * 7 : delta));
		setCurrentViewDate(newDate);
		onCurrentDateChange?.(newDate);
	};

	const handleTodayClick = () => {
		const today = new Date();
		setCurrentViewDate(today);
		onCurrentDateChange?.(today);
	};

	// Column width depends on viewType:
	// Day view fits the screen minus time column (50) and a bit of margin (16)
	// Week view gives columns a comfortable scrollable width (95)
	const columnWidth = useMemo(() => {
		return currentView === 'day' ? (screenWidth - 66) : 95;
	}, [currentView, screenWidth]);

	return (
		<View style={[styles.container, themeStyles.container]}>
			{isHeader && (
				<SchedulerHeader
					view={currentView}
					currentViewDate={currentViewDate}
					onViewChange={handleViewClick}
					onPrev={() => navigate(-1)}
					onNext={() => navigate(1)}
					onToday={handleTodayClick}
					isNavigation={isNavigation}
				/>
			)}

			{currentView === 'list' ? (
				<View style={styles.listViewWrapper}>
					<ListView
						events={filteredEvents}
						startViewDateTime={viewStartDateTime}
						endViewDateTime={viewEndDateTime}
						defaultAppointmentBgColor={defaultAppointmentBgColor}
						defaultAppointmentOpacity={defaultAppointmentOpacity}
						renderListItem={renderListItem}
						onAppointmentClick={onClickHandler}
						refreshing={refreshing}
						onRefresh={onRefresh}
					/>
				</View>
			) : (
				<ScrollView
					style={styles.gridScrollView}
					contentContainerStyle={styles.gridScrollContent}
					showsVerticalScrollIndicator={false}
					refreshControl={
						onRefresh ? (
							<RefreshControl
								refreshing={refreshing ?? false}
								onRefresh={onRefresh}
								tintColor={isDark ? '#805dca' : '#4361ee'}
								colors={[isDark ? '#805dca' : '#4361ee']}
							/>
						) : undefined
					}
				>
					<View style={styles.schedulerRow}>
						{/* Pinned Times Column on Left */}
						<TimesCol timesArray={timesArray} blockHeight={blockHeight} hasSpacer={isDaysNames} />

						{/* Scrollable Day Columns on Right */}
						<ScrollView
							horizontal
							showsHorizontalScrollIndicator={false}
							style={styles.horizontalScroll}
							contentContainerStyle={styles.horizontalScrollContent}
						>
							<View style={styles.columnsWrapper}>
								{isDaysNames && (
									<DaysRow daysArray={daysArray} columnWidth={columnWidth} />
								)}
								<Grids
									eventTiles={eventTiles}
									daysArray={daysArray}
									startTime={startHour}
									endTime={endHour}
									timesArray={timesArray}
									blockHeight={blockHeight}
									onAppointmentClick={onClickHandler}
									defaultAppointmentOpacity={defaultAppointmentOpacity}
									defaultAppointmentBgColor={defaultAppointmentBgColor}
									renderTile={renderTile}
									showCurrentTimeLine={showCurrentTimeLine}
									currentTimeLineColor={currentTimeLineColor}
									columnWidth={columnWidth}
								/>
							</View>
						</ScrollView>
					</View>
				</ScrollView>
			)}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	listViewWrapper: {
		flex: 1,
	},
	gridScrollView: {
		flex: 1,
	},
	gridScrollContent: {
		paddingBottom: 24,
	},
	schedulerRow: {
		flexDirection: 'row',
		paddingHorizontal: 8,
	},
	horizontalScroll: {
		flex: 1,
	},
	horizontalScrollContent: {
		flexGrow: 1,
	},
	columnsWrapper: {
		flexDirection: 'column',
	},
});

const lightStyles = StyleSheet.create({
	container: {
		backgroundColor: '#f6f8fa',
	},
});

const darkStyles = StyleSheet.create({
	container: {
		backgroundColor: '#060818',
	},
});
