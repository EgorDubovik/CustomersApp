import React, { useMemo, useRef, useEffect, useCallback } from 'react';
import {
	StyleSheet,
	Text,
	View,
	ScrollView,
	RefreshControl,
	Pressable,
	ActivityIndicator,
	NativeScrollEvent,
	NativeSyntheticEvent,
} from 'react-native';
import { ListViewProps, CalendarEvent, ListLoadDirection } from '../types';
import { formatDate } from '../utils/TimeHelper';
import DefaultListItem from './DefaultListItem';
import { useColorScheme } from '@/components/useColorScheme';
import { useRefreshControlKey } from '@/hooks/useRefreshControlKey';
import Colors from '@/constants/Colors';

const DATE_KEY_FORMAT = 'YYYY-MM-DD';
// За сколько пикселей до края списка начинаем подгружать следующую неделю
const LOAD_MORE_THRESHOLD = 400;
const EDGE_HEIGHT = 44;

type FlatItem<T> =
	| { type: 'header'; key: string; dateKey: string; month: string; day: string; isToday: boolean }
	| { type: 'event'; key: string; event: CalendarEvent<T>; isFirstOfGroup: boolean };

export default function ListView<T extends any>({
	events,
	defaultAppointmentBgColor,
	onAppointmentClick,
	renderListItem,
	refreshing,
	onRefresh,
	focusDate,
	focusKey,
	loading,
	loadError,
	reached,
	onLoadMore,
	onRetry,
}: ListViewProps<T> & {
	onAppointmentClick?: (event: CalendarEvent<T>) => void;
	refreshing?: boolean;
	onRefresh?: () => void;
}) {
	const colorScheme = useColorScheme();
	const refreshKey = useRefreshControlKey();
	const isDark = colorScheme === 'dark';
	const themeStyles = isDark ? darkStyles : lightStyles;
	const tint = Colors[colorScheme].tint;

	const todayKey = formatDate(new Date(), DATE_KEY_FORMAT);

	const { flatList, stickyIndices } = useMemo(() => {
		const groups: { [key: string]: CalendarEvent<T>[] } = {};
		events.forEach((event) => {
			const date = formatDate(event.start, DATE_KEY_FORMAT);
			if (!groups[date]) groups[date] = [];
			groups[date].push(event);
		});

		const list: FlatItem<T>[] = [];
		const sticky: number[] = [];
		Object.keys(groups)
			.sort()
			.forEach((dateKey) => {
				const dayEvents = groups[dateKey].sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
				// +1: первым ребёнком ScrollView идёт верхний край («Loading…»)
				sticky.push(list.length + 1);
				list.push({
					type: 'header',
					key: `header-${dateKey}`,
					dateKey,
					month: formatDate(dateKey, 'MMM'),
					day: formatDate(dateKey, 'D'),
					isToday: dateKey === todayKey,
				});
				dayEvents.forEach((event, eventIndex) => {
					list.push({ type: 'event', key: `event-${event.id}`, event, isFirstOfGroup: eventIndex === 0 });
				});
			});

		return { flatList: list, stickyIndices: sticky };
	}, [events, todayKey]);

	const scrollViewRef = useRef<ScrollView>(null);
	// Y каждой шапки дня внутри контента — по ним прокручиваемся к focusDate
	const headerYRef = useRef<Record<string, number>>({});
	// Пока true — прокручиваемся к focusDate (открытие списка / Today / стрелки) и не подгружаем края
	const pendingFocusRef = useRef(true);
	const contentHeightRef = useRef(0);
	const viewportHeightRef = useRef(0);

	const loadingRef = useRef(loading);
	loadingRef.current = loading;
	const reachedRef = useRef(reached);
	reachedRef.current = reached;

	useEffect(() => {
		pendingFocusRef.current = true;
	}, [focusKey]);

	const tryFocus = useCallback(() => {
		if (!pendingFocusRef.current) return;
		const focusDateKey = formatDate(focusDate ?? new Date(), DATE_KEY_FORMAT);
		const target = flatList.find((item) => item.type === 'header' && item.dateKey >= focusDateKey) as
			| Extract<FlatItem<T>, { type: 'header' }>
			| undefined;
		const stillLoading = loadingRef.current?.start || loadingRef.current?.end;

		if (target) {
			const y = headerYRef.current[target.dateKey];
			if (y === undefined) return; // шапка ещё не разложена — дождёмся её onLayout
			scrollViewRef.current?.scrollTo({ y, animated: false });
		} else if (flatList.length > 0) {
			scrollViewRef.current?.scrollToEnd({ animated: false });
		} else {
			scrollViewRef.current?.scrollTo({ y: EDGE_HEIGHT, animated: false });
		}
		// Недели вокруг даты ещё грузятся — прокрутимся повторно, когда придут данные
		if (!stillLoading) {
			// Отпускаем флаг после кадра, чтобы onScroll от нашей же прокрутки не дёрнул подгрузку
			requestAnimationFrame(() => {
				pendingFocusRef.current = false;
			});
		}
	}, [flatList, focusDate]);

	useEffect(() => {
		tryFocus();
	}, [flatList, loading?.start, loading?.end, focusKey, tryFocus]);

	const requestMore = (direction: ListLoadDirection) => {
		if (loadingRef.current?.[direction] || reachedRef.current?.[direction] || loadError) return;
		onLoadMore?.(direction);
	};

	const handleScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
		if (pendingFocusRef.current) return;
		const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
		if (contentOffset.y < LOAD_MORE_THRESHOLD) requestMore('start');
		if (contentSize.height - contentOffset.y - layoutMeasurement.height < LOAD_MORE_THRESHOLD) requestMore('end');
	};

	// Если загруженного мало и экран не заполнен, скролла не будет — догружаем вниз сами
	const checkFill = () => {
		if (pendingFocusRef.current || viewportHeightRef.current === 0) return;
		if (contentHeightRef.current < viewportHeightRef.current + LOAD_MORE_THRESHOLD) requestMore('end');
	};

	const renderEdge = (direction: ListLoadDirection) => (
		<View key={`edge-${direction}`} style={styles.edge}>
			{reached?.[direction] ? (
				<Text style={[styles.edgeText, themeStyles.textMuted]}>
					{direction === 'start' ? 'No earlier appointments' : 'No more appointments'}
				</Text>
			) : loadError ? (
				<Pressable onPress={onRetry} hitSlop={10}>
					<Text style={[styles.edgeText, { color: '#e7515a' }]}>Failed to load. Tap to retry</Text>
				</Pressable>
			) : loading?.[direction] ? (
				<ActivityIndicator size="small" color={tint} />
			) : (
				<Pressable onPress={() => requestMore(direction)} hitSlop={10}>
					<Text style={[styles.edgeText, { color: tint }]}>{direction === 'start' ? 'Show earlier' : 'Show later'}</Text>
				</Pressable>
			)}
		</View>
	);

	return (
		<ScrollView
			ref={scrollViewRef}
			style={styles.container}
			contentContainerStyle={styles.scrollContent}
			showsVerticalScrollIndicator={false}
			stickyHeaderIndices={stickyIndices}
			// Неделя, добавленная сверху, не сдвигает то, что сейчас на экране.
			// minIndexForVisible: 1 — якорем служит первый день, а не верхний «Loading…».
			maintainVisibleContentPosition={{ minIndexForVisible: 1 }}
			onScroll={handleScroll}
			scrollEventThrottle={32}
			onLayout={(e) => {
				viewportHeightRef.current = e.nativeEvent.layout.height;
				checkFill();
			}}
			onContentSizeChange={(_w, h) => {
				contentHeightRef.current = h;
				checkFill();
			}}
			refreshControl={
				onRefresh ? (
					<RefreshControl
						key={refreshKey}
						refreshing={refreshing ?? false}
						onRefresh={onRefresh}
						tintColor={tint}
						colors={[tint]}
					/>
				) : undefined
			}
		>
			{renderEdge('start')}
			{flatList.map((item) => {
				if (item.type === 'header') {
					return (
						<View
							key={item.key}
							style={styles.stickyHeaderContainer}
							pointerEvents="box-none"
							onLayout={(event) => {
								headerYRef.current[item.dateKey] = event.nativeEvent.layout.y;
								tryFocus();
							}}
						>
							<View style={styles.dateCol}>
								<View
									style={[
										styles.dateBadge,
										themeStyles.badgeBg,
										item.isToday && { backgroundColor: tint },
									]}
								>
									<Text style={[styles.monthText, item.isToday ? styles.todayText : themeStyles.textMuted]}>
										{item.month}
									</Text>
									<Text style={[styles.dayText, item.isToday ? styles.todayText : themeStyles.textMain]}>
										{item.day}
									</Text>
								</View>
							</View>
						</View>
					);
				}
				const event = item.event;
				return (
					<View key={item.key} style={[styles.eventRow, item.isFirstOfGroup && styles.firstEventRow]}>
						<View style={styles.dateColPlaceholder} />
						<View style={styles.itemsCol}>
							{renderListItem ? (
								renderListItem(event)
							) : (
								<DefaultListItem
									event={event}
									defaultAppointmentBgColor={defaultAppointmentBgColor}
									onPress={() => onAppointmentClick?.(event)}
								/>
							)}
						</View>
					</View>
				);
			})}
			{flatList.length === 0 && !loading?.start && !loading?.end && (
				<View key="empty" style={styles.emptyContainer}>
					<Text style={[styles.emptyText, themeStyles.textMuted]}>No appointments scheduled</Text>
				</View>
			)}
			{renderEdge('end')}
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	scrollContent: {
		paddingBottom: 24,
	},
	edge: {
		height: EDGE_HEIGHT,
		alignItems: 'center',
		justifyContent: 'center',
	},
	edgeText: {
		fontSize: 13,
		fontWeight: '600',
	},
	emptyContainer: {
		alignItems: 'center',
		justifyContent: 'center',
		paddingVertical: 60,
	},
	emptyText: {
		fontSize: 16,
		fontWeight: '600',
	},
	stickyHeaderContainer: {
		flexDirection: 'row',
		paddingRight: 16,
		paddingTop: 12,
		zIndex: 10,
		height: 56,
	},
	eventRow: {
		flexDirection: 'row',
		paddingRight: 16,
		marginBottom: 8,
	},
	firstEventRow: {
		marginTop: -44, // Align with the top of the date badge (header height 56 minus paddingTop 12)
	},
	dateCol: {
		width: 58,
		alignItems: 'center',
	},
	dateColPlaceholder: {
		width: 58,
	},
	dateBadge: {
		width: 44,
		height: 44,
		borderRadius: 8,
		alignItems: 'center',
		justifyContent: 'center',
	},
	monthText: {
		fontSize: 10,
		fontWeight: '600',
		textTransform: 'uppercase',
		letterSpacing: 0.5,
	},
	dayText: {
		fontSize: 15,
		fontWeight: '700',
		marginTop: 1,
	},
	todayText: {
		color: '#ffffff',
	},
	itemsCol: {
		flex: 1,
		gap: 8,
	},
});

const lightStyles = StyleSheet.create({
	textMuted: {
		color: '#64748b',
	},
	textMain: {
		color: '#0f172a',
	},
	badgeBg: {
		backgroundColor: '#f1f5f9',
	},
});

const darkStyles = StyleSheet.create({
	textMuted: {
		color: '#a1a1aa',
	},
	textMain: {
		color: '#f4f4f5',
	},
	badgeBg: {
		backgroundColor: '#18181b',
	},
});
