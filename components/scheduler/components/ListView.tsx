import React, { useMemo } from 'react';
import { StyleSheet, Text, View, ScrollView, RefreshControl } from 'react-native';
import { ListViewProps, CalendarEvent } from '../types';
import { formatDate } from '../utils/TimeHelper';
import DefaultListItem from './DefaultListItem';
import { useColorScheme } from '@/components/useColorScheme';

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
							tintColor={isDark ? '#805dca' : '#4361ee'}
							colors={[isDark ? '#805dca' : '#4361ee']}
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

	const today = formatDate(new Date(), DATE_GROUP_FORMAT);

	return (
		<ScrollView
			style={styles.container}
			contentContainerStyle={styles.scrollContent}
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
			<View style={styles.list}>
				{groupByDate.map((group, groupIndex) => {
					const isToday = group.dateString === today;
					return (
						<View key={`date-group-${groupIndex}`} style={styles.dateGroup}>
							<View style={styles.dateCol}>
								<View style={[styles.dateBadge, isToday && styles.todayBadge]}>
									<Text style={[styles.dateText, isToday ? styles.todayText : themeStyles.textMain]}>
										{group.dateString}
									</Text>
								</View>
							</View>
							<View style={styles.itemsCol}>
								{group.events.map((event, index) =>
									renderListItem ? (
										<View key={`${event.id}-${index}`}>
											{renderListItem(event)}
										</View>
									) : (
										<DefaultListItem
											key={`${event.id}-${index}`}
											event={event}
											defaultAppointmentBgColor={defaultAppointmentBgColor}
											onPress={() => onAppointmentClick?.(event)}
										/>
									)
								)}
							</View>
						</View>
					);
				})}
			</View>
		</ScrollView>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
	},
	scrollContent: {
		paddingVertical: 12,
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
	list: {
		gap: 20,
	},
	dateGroup: {
		flexDirection: 'row',
		paddingRight: 16,
	},
	dateCol: {
		width: 70,
		alignItems: 'center',
		paddingTop: 8,
	},
	dateBadge: {
		paddingVertical: 6,
		paddingHorizontal: 8,
		borderRadius: 6,
		alignItems: 'center',
		justifyContent: 'center',
	},
	todayBadge: {
		backgroundColor: '#4361ee',
	},
	dateText: {
		fontSize: 12,
		fontWeight: '700',
		textAlign: 'center',
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
		color: '#888ea8',
	},
	textMain: {
		color: '#3b3f5c',
	},
});

const darkStyles = StyleSheet.create({
	textMuted: {
		color: '#888ea8',
	},
	textMain: {
		color: '#e0e6ed',
	},
});
