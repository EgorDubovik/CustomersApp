import React from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { ViewType } from '../types';
import { formatDate } from '../utils/TimeHelper';
import { useColorScheme } from '@/components/useColorScheme';

interface SchedulerHeaderProps {
	view: ViewType;
	isNavigation?: boolean;
	currentViewDate: Date;
	onViewChange: (v: ViewType) => void;
	onPrev: () => void;
	onNext: () => void;
	onToday: () => void;
}

const VIEW_TABS: { key: ViewType; label: string }[] = [
	{ key: 'list', label: 'List' },
	{ key: 'day', label: 'Day' },
	{ key: 'week', label: 'Week' },
];

export default function SchedulerHeader({
	view,
	currentViewDate,
	onViewChange,
	onPrev,
	onNext,
	onToday,
	isNavigation = true,
}: SchedulerHeaderProps) {
	const colorScheme = useColorScheme();
	const isDark = colorScheme === 'dark';

	const themeStyles = isDark ? darkStyles : lightStyles;

	return (
		<View style={[styles.headerContainer, themeStyles.container]}>
			{isNavigation && (
				<View style={[styles.switcherContainer, themeStyles.switcherBg]}>
					{VIEW_TABS.map(({ key, label }) => {
						const isActive = view === key;
						return (
							<Pressable
								key={key}
								onPress={() => onViewChange(key)}
								style={[
									styles.tabButton,
									isActive && [styles.activeTabButton, themeStyles.activeTabBg],
								]}
							>
								<Text
									style={[
										styles.tabLabel,
										isActive
											? [styles.activeTabText, themeStyles.activeTabText]
											: themeStyles.inactiveTabText,
									]}
								>
									{label}
								</Text>
							</Pressable>
						);
					})}
				</View>
			)}

			<View style={styles.navRow}>
				{view !== 'list' ? (
					<Text style={[styles.dateTitle, themeStyles.textMain]}>
						{formatDate(currentViewDate, 'MMMM YYYY')}
					</Text>
				) : (
					<Text style={[styles.dateTitle, themeStyles.textMain]}>
						Appointments
					</Text>
				)}

				<View style={styles.navButtons}>
					<Pressable
						onPress={onPrev}
						style={({ pressed }) => [
							styles.navBtn,
							themeStyles.btnBorder,
							pressed && styles.btnPressed,
						]}
					>
						<Text style={[styles.navBtnText, themeStyles.textPrimary]}>&lt;</Text>
					</Pressable>

					<Pressable
						onPress={onToday}
						style={({ pressed }) => [
							styles.navBtn,
							styles.todayBtn,
							themeStyles.btnBorder,
							pressed && styles.btnPressed,
						]}
					>
						<Text style={[styles.todayBtnText, themeStyles.textPrimary]}>Today</Text>
					</Pressable>

					<Pressable
						onPress={onNext}
						style={({ pressed }) => [
							styles.navBtn,
							themeStyles.btnBorder,
							pressed && styles.btnPressed,
						]}
					>
						<Text style={[styles.navBtnText, themeStyles.textPrimary]}>&gt;</Text>
					</Pressable>
				</View>
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	headerContainer: {
		paddingVertical: 12,
		paddingHorizontal: 16,
		borderBottomWidth: 1,
		gap: 12,
	},
	switcherContainer: {
		flexDirection: 'row',
		borderRadius: 8,
		padding: 4,
		alignSelf: 'flex-start',
	},
	tabButton: {
		flex: 1,
		paddingVertical: 6,
		paddingHorizontal: 16,
		borderRadius: 6,
		alignItems: 'center',
		justifyContent: 'center',
	},
	activeTabButton: {
		shadowOffset: { width: 0, height: 1 },
		shadowOpacity: 0.15,
		shadowRadius: 2,
		elevation: 1,
	},
	tabLabel: {
		fontSize: 13,
		fontWeight: '600',
	},
	activeTabText: {
		fontWeight: '700',
	},
	navRow: {
		flexDirection: 'row',
		alignItems: 'center',
		justifyContent: 'space-between',
		flexWrap: 'wrap',
		gap: 8,
	},
	dateTitle: {
		fontSize: 16,
		fontWeight: '700',
	},
	navButtons: {
		flexDirection: 'row',
		gap: 6,
	},
	navBtn: {
		borderWidth: 1,
		borderRadius: 6,
		width: 32,
		height: 32,
		alignItems: 'center',
		justifyContent: 'center',
	},
	todayBtn: {
		width: 'auto',
		paddingHorizontal: 12,
	},
	navBtnText: {
		fontSize: 14,
		fontWeight: '600',
	},
	todayBtnText: {
		fontSize: 12,
		fontWeight: '700',
	},
	btnPressed: {
		opacity: 0.7,
	},
});

const lightStyles = StyleSheet.create({
	container: {
		borderColor: '#e2e8f0',
		backgroundColor: '#ffffff',
	},
	switcherBg: {
		backgroundColor: '#f1f5f9',
	},
	activeTabBg: {
		backgroundColor: '#ffffff',
	},
	activeTabText: {
		color: '#4f46e5',
	},
	inactiveTabText: {
		color: '#64748b',
	},
	textMain: {
		color: '#0f172a',
	},
	textPrimary: {
		color: '#4f46e5',
	},
	btnBorder: {
		borderColor: '#e2e8f0',
	},
});

const darkStyles = StyleSheet.create({
	container: {
		borderColor: '#27272a',
		backgroundColor: '#09090b',
	},
	switcherBg: {
		backgroundColor: '#18181b',
	},
	activeTabBg: {
		backgroundColor: '#27272a',
	},
	activeTabText: {
		color: '#f4f4f5',
	},
	inactiveTabText: {
		color: '#a1a1aa',
	},
	textMain: {
		color: '#f4f4f5',
	},
	textPrimary: {
		color: '#818cf8',
	},
	btnBorder: {
		borderColor: '#27272a',
	},
});
