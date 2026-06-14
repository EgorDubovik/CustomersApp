import React from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { CalendarEvent } from '../types';
import { formatDate } from '../utils/TimeHelper';
import { useColorScheme } from '@/components/useColorScheme';

interface DefaultListItemProps<T extends CalendarEvent> {
	event: T;
	defaultAppointmentBgColor: string;
	onPress?: () => void;
}

export default function DefaultListItem<T extends CalendarEvent>({
	event,
	defaultAppointmentBgColor,
	onPress,
}: DefaultListItemProps<T>) {
	const colorScheme = useColorScheme();
	const isDark = colorScheme === 'dark';
	const themeStyles = isDark ? darkStyles : lightStyles;

	const bgColor = event.color || defaultAppointmentBgColor;
	const isCompleted = event.data?.status === 2;

	const completedBgColor = isDark ? '#27272a' : '#f1f5f9';
	const completedTitleColor = isDark ? '#71717a' : '#94a3b8';
	const completedTimeColor = isDark ? '#71717a' : '#94a3b8';

	return (
		<Pressable
			onPress={onPress}
			style={({ pressed }) => [
				styles.card,
				isCompleted ? { backgroundColor: completedBgColor } : themeStyles.cardBg,
				{
					borderLeftColor: bgColor,
					borderColor: isDark ? '#27272a' : '#e2e8f0',
					opacity: pressed ? 0.8 : 1,
				},
			]}
		>
			<View style={styles.content}>
				<Text
					style={[
						styles.title,
						isCompleted ? { color: completedTitleColor } : themeStyles.titleText,
					]}
					numberOfLines={1}
				>
					{event.title || 'No Title'}
				</Text>
				<View style={styles.timeRow}>
					<Text
						style={[
							styles.timeText,
							isCompleted ? { color: completedTimeColor } : themeStyles.timeText,
						]}
					>
						{formatDate(event.start, 'hh:mm A')} - {formatDate(event.end, 'hh:mm A')}
					</Text>
				</View>
			</View>
		</Pressable>
	);
}

const styles = StyleSheet.create({
	card: {
		flexDirection: 'row',
		paddingVertical: 12,
		paddingHorizontal: 16,
		borderRadius: 8,
		borderWidth: 1,
		borderLeftWidth: 4,
		marginVertical: 4,
		marginHorizontal: 16,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.02,
		shadowRadius: 6,
		elevation: 1,
	},
	content: {
		flex: 1,
		justifyContent: 'center',
	},
	title: {
		fontSize: 14,
		fontWeight: '700',
		marginBottom: 4,
	},
	timeRow: {
		flexDirection: 'row',
		alignItems: 'center',
	},
	timeText: {
		fontSize: 12,
		fontWeight: '500',
	},
});

const lightStyles = StyleSheet.create({
	cardBg: {
		backgroundColor: '#ffffff',
	},
	titleText: {
		color: '#0f172a',
	},
	timeText: {
		color: '#64748b',
	},
});

const darkStyles = StyleSheet.create({
	cardBg: {
		backgroundColor: '#18181b',
	},
	titleText: {
		color: '#f4f4f5',
	},
	timeText: {
		color: '#a1a1aa',
	},
});
