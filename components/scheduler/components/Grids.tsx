import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, Text, View, Modal, Pressable } from 'react-native';
import { CalendarEvent, ITile, GridsProps, IDayInfo } from '../types';
import { formatDate } from '../utils/TimeHelper';
import DefaultTile from './DefaultTile';
import { useColorScheme } from '@/components/useColorScheme';

interface CurrentTimeLineProps {
	startTime: Date;
	endTime: Date;
	currentTime: Date;
	color?: string;
}

const CurrentTimeLine = ({ startTime, endTime, currentTime, color = '#e4ad15' }: CurrentTimeLineProps) => {
	const startHour = startTime.getHours() + startTime.getMinutes() / 60;
	// Add 1 hour for slot display offset
	const endHour = endTime.getHours() + endTime.getMinutes() / 60 + 1;
	const nowHour = currentTime.getHours() + currentTime.getMinutes() / 60;

	if (nowHour < startHour || nowHour > endHour) return null;

	const topPct = ((nowHour - startHour) / (endHour - startHour)) * 100;

	return (
		<View style={[styles.timelineContainer, { top: `${topPct}%` }]} pointerEvents="none">
			<View style={[styles.timelineDot, { backgroundColor: color }]} />
			<View style={[styles.timelineLine, { backgroundColor: color }]} />
		</View>
	);
};

export default function Grids<T extends any>({
	eventTiles,
	daysArray,
	defaultAppointmentOpacity,
	defaultAppointmentBgColor,
	timesArray,
	blockHeight,
	onAppointmentClick,
	renderTile,
	startTime,
	endTime,
	showCurrentTimeLine = true,
	currentTimeLineColor = '#e4ad15',
	columnWidth,
}: GridsProps<T> & { columnWidth: number }) {
	const colorScheme = useColorScheme();
	const isDark = colorScheme === 'dark';
	const themeStyles = isDark ? darkStyles : lightStyles;

	const [currentTime, setCurrentTime] = useState(new Date());
	const [selectedEvent, setSelectedEvent] = useState<CalendarEvent<T> | null>(null);

	useEffect(() => {
		const interval = setInterval(() => setCurrentTime(new Date()), 60_000);
		return () => clearInterval(interval);
	}, []);

	const handleTileClick = (event: CalendarEvent<T>) => {
		if (onAppointmentClick) {
			onAppointmentClick(event);
		} else {
			setSelectedEvent(event);
		}
	};

	return (
		<View style={styles.container}>
			<View style={styles.gridContainer}>
				{/* Current Time Line */}
				{showCurrentTimeLine && (
					<CurrentTimeLine
						startTime={startTime}
						endTime={endTime}
						currentTime={currentTime}
						color={currentTimeLineColor}
					/>
				)}

				{/* Columns */}
				{daysArray.map((day: IDayInfo, dayIndex: number) => (
					<View
						key={dayIndex}
						style={[
							styles.dayColumn,
							{ width: columnWidth },
							dayIndex > 0 && themeStyles.borderLeft,
						]}
					>
						{/* Grid Row Lines */}
						{timesArray.map((_, timeIndex) => (
							<View
								key={timeIndex}
								style={[styles.gridRowLine, { height: blockHeight }, themeStyles.borderTop]}
							/>
						))}

						{/* Appointments Layer */}
						<View style={StyleSheet.absoluteFill} pointerEvents="box-none">
							{eventTiles[dayIndex]?.map((tile: ITile<T>, tileIndex: number) => (
								<View
									key={`${tile.event.id}-${tileIndex}`}
									style={[
										styles.tileWrapper,
										{
											height: `${tile.height}%`,
											width: `${tile.width}%`,
											left: `${tile.left}%`,
											top: `${tile.top}%`,
										},
									]}
								>
									{renderTile ? (
										renderTile(tile.event.data as T, tile.event)
									) : (
										<DefaultTile
											start={tile.event.start as Date}
											end={tile.event.end as Date}
											title={tile.title}
											color={tile.event.color || defaultAppointmentBgColor}
											status={(tile.event.data as any)?.status}
											paymentPending={(tile.event.data as any)?.paymentPending}
											onClick={() => handleTileClick(tile.event)}
										/>
									)}
								</View>
							))}
						</View>
					</View>
				))}
			</View>

			{/* Appointment Details Modal Fallback */}
			<Modal
				animationType="fade"
				transparent={true}
				visible={selectedEvent !== null}
				onRequestClose={() => setSelectedEvent(null)}
			>
				<View style={styles.modalOverlay}>
					<View style={[styles.modalCard, themeStyles.cardBg]}>
						<Text style={[styles.modalTitle, themeStyles.textMain]}>
							{selectedEvent?.title || 'Appointment Details'}
						</Text>

						{selectedEvent && (
							<View style={styles.modalContent}>
								<View style={styles.detailRow}>
									<Text style={styles.detailLabel}>ID</Text>
									<Text style={[styles.detailValue, themeStyles.textMain]}>
										{selectedEvent.id}
									</Text>
								</View>
								<View style={styles.detailRow}>
									<Text style={styles.detailLabel}>Start</Text>
									<Text style={[styles.detailValue, themeStyles.textMain]}>
										{formatDate(selectedEvent.start, 'YYYY-MM-DD hh:mm A')}
									</Text>
								</View>
								<View style={styles.detailRow}>
									<Text style={styles.detailLabel}>End</Text>
									<Text style={[styles.detailValue, themeStyles.textMain]}>
										{formatDate(selectedEvent.end, 'YYYY-MM-DD hh:mm A')}
									</Text>
								</View>
								{selectedEvent.color && (
									<View style={styles.detailRow}>
										<Text style={styles.detailLabel}>Color</Text>
										<View
											style={[
												styles.colorIndicator,
												{ backgroundColor: selectedEvent.color },
											]}
										/>
									</View>
								)}
							</View>
						)}

						<Pressable
							onPress={() => setSelectedEvent(null)}
							style={[styles.closeButton, themeStyles.closeButton]}
						>
							<Text style={styles.closeButtonText}>Close</Text>
						</Pressable>
					</View>
				</View>
			</Modal>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flex: 1,
		paddingTop: 10,
	},
	gridContainer: {
		flexDirection: 'row',
		position: 'relative',
	},
	dayColumn: {
		position: 'relative',
	},
	gridRowLine: {
		borderTopWidth: 1,
	},
	tileWrapper: {
		position: 'absolute',
		padding: 1.5,
	},
	timelineContainer: {
		position: 'absolute',
		left: 0,
		right: 0,
		zIndex: 20,
		flexDirection: 'row',
		alignItems: 'center',
		marginTop: -3,
	},
	timelineDot: {
		width: 6,
		height: 6,
		borderRadius: 3,
		marginRight: -1,
		zIndex: 21,
	},
	timelineLine: {
		flex: 1,
		height: 1.5,
		opacity: 0.8,
	},
	modalOverlay: {
		flex: 1,
		backgroundColor: 'rgba(0,0,0,0.5)',
		justifyContent: 'center',
		alignItems: 'center',
		padding: 24,
	},
	modalCard: {
		width: '100%',
		maxWidth: 320,
		borderRadius: 12,
		padding: 20,
		shadowColor: '#000',
		shadowOffset: { width: 0, height: 4 },
		shadowOpacity: 0.25,
		shadowRadius: 5,
		elevation: 5,
	},
	modalTitle: {
		fontSize: 18,
		fontWeight: '700',
		marginBottom: 16,
		borderBottomWidth: 1,
		borderBottomColor: '#e0e6ed',
		paddingBottom: 8,
	},
	modalContent: {
		gap: 12,
		marginBottom: 20,
	},
	detailRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
	},
	detailLabel: {
		fontSize: 13,
		fontWeight: '600',
		color: '#888ea8',
	},
	detailValue: {
		fontSize: 13,
		fontWeight: '500',
	},
	colorIndicator: {
		width: 30,
		height: 12,
		borderRadius: 3,
	},
	closeButton: {
		paddingVertical: 10,
		borderRadius: 6,
		alignItems: 'center',
		justifyContent: 'center',
	},
	closeButtonText: {
		color: '#ffffff',
		fontSize: 14,
		fontWeight: '700',
	},
});

const lightStyles = StyleSheet.create({
	borderTop: {
		borderTopColor: '#e0e6ed',
	},
	borderLeft: {
		borderLeftWidth: 1,
		borderLeftColor: '#e0e6ed',
	},
	cardBg: {
		backgroundColor: '#ffffff',
	},
	textMain: {
		color: '#0e1726',
	},
	closeButton: {
		backgroundColor: '#4361ee',
	},
});

const darkStyles = StyleSheet.create({
	borderTop: {
		borderTopColor: '#191e3a',
	},
	borderLeft: {
		borderLeftWidth: 1,
		borderLeftColor: '#191e3a',
	},
	cardBg: {
		backgroundColor: '#0e1726',
	},
	textMain: {
		color: '#f1f2f3',
	},
	closeButton: {
		backgroundColor: '#805dca',
	},
});
