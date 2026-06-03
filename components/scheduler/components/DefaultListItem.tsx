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

	return (
		<Pressable
			onPress={onPress}
			style={({ pressed }) => [
				styles.card,
				isCompleted ? { backgroundColor: '#e5e7eb' } : themeStyles.cardBg,
				{ borderLeftColor: bgColor, opacity: pressed ? 0.8 : 1 },
			]}
		>
			<View style={styles.content}>
				<Text
					style={[
						styles.title,
						isCompleted ? { color: '#000000' } : themeStyles.titleText,
					]}
					numberOfLines={1}
				>
					{event.title || 'No Title'}
				</Text>
				<View style={styles.timeRow}>
					<Text
						style={[
							styles.timeText,
							isCompleted ? { color: '#4b5563' } : themeStyles.timeText,
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
		borderLeftWidth: 4,
		marginVertical: 4,
		marginHorizontal: 16,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 2 },
		shadowOpacity: 0.05,
		shadowRadius: 3,
		elevation: 2,
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
		color: '#0e1726',
	},
	timeText: {
		color: '#515365',
	},
});

const darkStyles = StyleSheet.create({
	cardBg: {
		backgroundColor: '#1b2e4b',
	},
	titleText: {
		color: '#f1f2f3',
	},
	timeText: {
		color: '#888ea8',
	},
});
