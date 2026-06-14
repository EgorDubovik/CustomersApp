import React, { useMemo, useRef, useEffect } from 'react';
import { StyleSheet, Text, View, ScrollView, RefreshControl } from 'react-native';
import { ListViewProps, CalendarEvent } from '../types';
import { formatDate } from '../utils/TimeHelper';
import DefaultListItem from './DefaultListItem';
import { useColorScheme } from '@/components/useColorScheme';
import Colors from '@/constants/Colors';

const DATE_GROUP_FORMAT = 'MMM DD';

export default function ListView<T extends any>({
	events,
	defaultAppointmentBgColor,
	onAppointmentClick,
	renderListItem,
	refreshing,
	onRefresh,
}: ListViewProps<T> & {
	onAppointmentClick?: (event: CalendarEvent<T>) => void;
	refreshing?: boolean;
	onRefresh?: () => void;
}) {
	const colorScheme = useColorScheme();
	const isDark = colorScheme === 'dark';
	const themeStyles = isDark ? darkStyles : lightStyles;

	const groupByDate = useMemo(() => {
		const groups: { [key: string]: CalendarEvent<T>[] } = {};

		events.forEach((event) => {
			const date = formatDate(event.start, 'YYYY-MM-DD');
			if (!groups[date]) groups[date] = [];
			groups[date].push(event);
		});

		return Object.keys(groups)
			.sort()
			.map((date) => ({
				date: new Date(date),
				dateString: formatDate(date, DATE_GROUP_FORMAT),
				events: groups[date],
			}));
	}, [events]);

	const todayKey = useMemo(() => formatDate(new Date(), 'YYYY-MM-DD'), []);

	const todayHeaderKey = useMemo(() => {
		const todayGroupIndex = groupByDate.findIndex((group) => {
			const dateKey = formatDate(group.date, 'YYYY-MM-DD');
			return dateKey === todayKey;
		});
		if (todayGroupIndex !== -1) {
			const group = groupByDate[todayGroupIndex];
			const dateKey = formatDate(group.date, 'YYYY-MM-DD');
			return `header-${todayGroupIndex}-${dateKey}`;
		}
		const nextGroupIndex = groupByDate.findIndex((group) => {
			const dateKey = formatDate(group.date, 'YYYY-MM-DD');
			return dateKey >= todayKey;
		});
		if (nextGroupIndex !== -1) {
			const group = groupByDate[nextGroupIndex];
			const dateKey = formatDate(group.date, 'YYYY-MM-DD');
			return `header-${nextGroupIndex}-${dateKey}`;
		}
		return null;
	}, [groupByDate, todayKey]);

	const scrollViewRef = useRef<ScrollView>(null);
	const hasScrolledRef = useRef(false);

	useEffect(() => {
		hasScrolledRef.current = false;
	}, [events, todayHeaderKey]);

	const { flatList, stickyIndices } = useMemo(() => {
		const list: Array<
			| { type: 'header'; key: string; month: string; day: string; isToday: boolean }
			| { type: 'event'; key: string; event: CalendarEvent<T>; isFirstOfGroup: boolean }
		> = [];
		const stickyIndices: number[] = [];

		groupByDate.forEach((group, groupIndex) => {
			const dateKey = formatDate(group.date, 'YYYY-MM-DD');
			const isToday = dateKey === todayKey;

			stickyIndices.push(list.length);
			list.push({
				type: 'header',
				key: `header-${groupIndex}-${dateKey}`,
				month: formatDate(group.date, 'MMM'),
				day: formatDate(group.date, 'D'),
				isToday,
			});

			group.events.forEach((event, eventIndex) => {
				list.push({
					type: 'event',
					key: `event-${event.id}-${eventIndex}`,
					event,
					isFirstOfGroup: eventIndex === 0,
				});
			});
		});

		return { flatList: list, stickyIndices };
	}, [groupByDate, todayKey]);

	if (events.length === 0) {
		return (
			<ScrollView
				style={styles.container}
				contentContainerStyle={styles.emptyContainer}
				refreshControl={
					onRefresh ? (
						<RefreshControl
							refreshing={refreshing ?? false}
							onRefresh={onRefresh}
							tintColor={Colors[colorScheme].tint}
							colors={[Colors[colorScheme].tint]}
						/>
					) : undefined
				}
			>
				<Text style={[styles.emptyText, themeStyles.textMuted]}>
					No appointments scheduled
				</Text>
			</ScrollView>
		);
	}

	return (
		<ScrollView
			ref={scrollViewRef}
			style={styles.container}
			contentContainerStyle={styles.scrollContent}
			showsVerticalScrollIndicator={false}
			stickyHeaderIndices={stickyIndices}
			refreshControl={
				onRefresh ? (
					<RefreshControl
						refreshing={refreshing ?? false}
						onRefresh={onRefresh}
						tintColor={Colors[colorScheme].tint}
						colors={[Colors[colorScheme].tint]}
					/>
				) : undefined
			}
		>
			{flatList.map((item) => {
				if (item.type === 'header') {
					return (
						<View
							key={item.key}
							style={styles.stickyHeaderContainer}
							pointerEvents="box-none"
							onLayout={(event) => {
								const { y } = event.nativeEvent.layout;
								if (item.key === todayHeaderKey && !hasScrolledRef.current) {
									hasScrolledRef.current = true;
									setTimeout(() => {
										scrollViewRef.current?.scrollTo({ y, animated: false });
									}, 100);
								}
							}}
						>
							<View style={styles.dateCol}>
								<View style={[
									styles.dateBadge,
									themeStyles.badgeBg,
									item.isToday && [styles.todayBadge, { backgroundColor: Colors[colorScheme].tint }]
								]}>
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
				} else {
					const event = item.event;
					return (
						<View
							key={item.key}
							style={[
								styles.eventRow,
								item.isFirstOfGroup && styles.firstEventRow
							]}
						>
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
				}
			})}
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
	emptyContainer: {
		flex: 1,
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
	todayBadge: {
		backgroundColor: '#4361ee',
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
