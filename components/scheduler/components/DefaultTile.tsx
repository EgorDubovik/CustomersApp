import React from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { formatDate } from '../utils/TimeHelper';

interface DefaultTileProps {
	start: Date;
	end: Date;
	title?: string;
	color?: string;
	status?: number;
	paymentPending?: boolean;
	onClick?: () => void;
}

export default function DefaultTile({ start, end, title, color = '#3b82f6', status, paymentPending, onClick }: DefaultTileProps) {
	const formattedTime = `${formatDate(start, 'hh:mm A')} - ${formatDate(end, 'hh:mm A')}`;
	const isCompleted = status === 2;
	const showPendingDot = isCompleted && paymentPending;

	return (
		<Pressable
			onPress={onClick}
			style={({ pressed }) => [
				styles.tileContainer,
				isCompleted
					? [styles.completedTile, { borderLeftColor: color, opacity: pressed ? 0.8 : 1 }]
					: { backgroundColor: color, opacity: pressed ? 0.8 : 1 },
			]}
		>
			<View style={styles.content}>
				<Text
					style={[styles.titleText, isCompleted && styles.completedText]}
					numberOfLines={1}
				>
					{title || 'unknown'}
				</Text>
				<Text
					style={[
						styles.timeText,
						isCompleted ? styles.completedTimeText : { color: 'rgba(255, 255, 255, 0.85)' },
					]}
					numberOfLines={1}
				>
					{formattedTime}
				</Text>
			</View>

			{showPendingDot && (
				<View style={styles.pendingDot} />
			)}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	tileContainer: {
		flex: 1,
		borderRadius: 6,
		paddingVertical: 4,
		paddingHorizontal: 6,
		height: '100%',
		width: '100%',
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.1,
		shadowRadius: 1,
		elevation: 1,
		overflow: 'hidden',
	},
	content: {
		flex: 1,
		justifyContent: 'flex-start',
	},
	titleText: {
		color: '#ffffff',
		fontSize: 11,
		fontWeight: '700',
		lineHeight: 13,
	},
	timeText: {
		color: 'rgba(255, 255, 255, 0.85)',
		fontSize: 9,
		fontWeight: '500',
		marginTop: 2,
	},
	completedTile: {
		backgroundColor: '#e5e7eb',
		borderLeftWidth: 4,
	},
	completedText: {
		color: '#000000',
	},
	completedTimeText: {
		color: '#4b5563',
		fontSize: 9,
		fontWeight: '500',
		marginTop: 2,
	},
	pendingDot: {
		position: 'absolute',
		bottom: 4,
		right: 4,
		width: 8,
		height: 8,
		borderRadius: 4,
		backgroundColor: '#e7515a',
	},
});
