import React, { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { StyleSheet, View, useWindowDimensions, ScrollView, RefreshControl, Animated, PanResponder } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { AppointmentsSchedulerProps, CalendarEvent, ITile, ViewType } from './types';
import { calculateViewDateTimes, getDaysArray, getTimesArray, getEventTiles } from './utils/helper';
import ListView from './components/ListView';
import Grids from './components/Grids';
import DaysRow from './components/DaysRow';
import TimesCol from './components/TimesCol';
import SchedulerHeader from './components/SchedulerHeader';
import { useColorScheme } from '@/components/useColorScheme';

const VIEW_TYPE_STORAGE_KEY = 'scheduler_view_type';
const VALID_VIEW_TYPES: ViewType[] = ['week', 'day', 'list'];

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
	const [viewTypeLoaded, setViewTypeLoaded] = useState(false);
	const isControlled = controlledViewType !== undefined;
	const currentView = isControlled ? controlledViewType : internalViewType;

	// Load saved view type from SecureStore on mount
	useEffect(() => {
		if (isControlled) {
			setViewTypeLoaded(true);
			return;
		}
		(async () => {
			try {
				const saved = await SecureStore.getItemAsync(VIEW_TYPE_STORAGE_KEY);
				if (saved && VALID_VIEW_TYPES.includes(saved as ViewType)) {
					setInternalViewType(saved as ViewType);
				}
			} catch (e) {
				// ignore read errors – fall back to defaultViewType
			} finally {
				setViewTypeLoaded(true);
			}
		})();
	}, []);

	const handleViewClick = (newView: ViewType) => {
		if (!isControlled) {
			setInternalViewType(newView);
			// Persist the choice so it survives app restarts
			SecureStore.setItemAsync(VIEW_TYPE_STORAGE_KEY, newView).catch(() => {});
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

	const panX = useRef(new Animated.Value(0)).current;
	const isAnimating = useRef(false);

	// Keep refs to latest values so PanResponder callbacks never read stale closures
	const currentViewRef = useRef(currentView);
	currentViewRef.current = currentView;
	const screenWidthRef = useRef(screenWidth);
	screenWidthRef.current = screenWidth;
	const navigateRef = useRef(navigate);
	navigateRef.current = navigate;

	const panResponder = useMemo(
		() =>
			PanResponder.create({
				onMoveShouldSetPanResponder: (_evt, gestureState) => {
					if (currentViewRef.current !== 'day' || isAnimating.current) return false;
					const { dx, dy } = gestureState;
					return Math.abs(dx) > 15 && Math.abs(dx) > Math.abs(dy) * 1.5;
				},
				onPanResponderMove: (_evt, gestureState) => {
					panX.setValue(gestureState.dx);
				},
				onPanResponderRelease: (_evt, gestureState) => {
					const { dx, vx } = gestureState;
					const sw = screenWidthRef.current;
					const swipeThreshold = sw * 0.3;

					if (dx < -swipeThreshold || vx < -0.5) {
						isAnimating.current = true;
						Animated.timing(panX, {
							toValue: -sw,
							duration: 200,
							useNativeDriver: true,
						}).start(() => {
							navigateRef.current(1);
							panX.setValue(sw);
							Animated.timing(panX, {
								toValue: 0,
								duration: 200,
								useNativeDriver: true,
							}).start(() => {
								isAnimating.current = false;
							});
						});
					} else if (dx > swipeThreshold || vx > 0.5) {
						isAnimating.current = true;
						Animated.timing(panX, {
							toValue: sw,
							duration: 200,
							useNativeDriver: true,
						}).start(() => {
							navigateRef.current(-1);
							panX.setValue(-sw);
							Animated.timing(panX, {
								toValue: 0,
								duration: 200,
								useNativeDriver: true,
							}).start(() => {
								isAnimating.current = false;
							});
						});
					} else {
						Animated.spring(panX, {
							toValue: 0,
							useNativeDriver: true,
						}).start();
					}
				},
				onPanResponderTerminate: () => {
					Animated.spring(panX, {
						toValue: 0,
						useNativeDriver: true,
					}).start();
				},
			}),
		[panX]
	);

	return (
		<View 
			style={[styles.container, themeStyles.container]}
			{...(currentView === 'day' ? panResponder.panHandlers : {})}
		>
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
						<Animated.View style={[styles.horizontalScroll, { transform: [{ translateX: panX }] }]}>
							<ScrollView
								horizontal
								showsHorizontalScrollIndicator={false}
								style={{ flex: 1 }}
								contentContainerStyle={styles.horizontalScrollContent}
								scrollEnabled={currentView !== 'day'}
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
						</Animated.View>
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
