import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { IDayInfo } from '../types';
import { useColorScheme } from '@/components/useColorScheme';

interface DaysRowProps {
	daysArray: IDayInfo[];
	columnWidth: number;
}

export default function DaysRow({ daysArray, columnWidth }: DaysRowProps) {
	const colorScheme = useColorScheme();
	const isDark = colorScheme === 'dark';

	const themeStyles = isDark ? darkStyles : lightStyles;

	return (
		<View style={[styles.container, themeStyles.borderBottom]}>
			{daysArray.map((day: IDayInfo, index: number) => {
				const isSelect = day.isSelect;
				return (
					<View
						key={`${day.date.toISOString()}-${index}`}
						style={[
							styles.weekdayItem,
							{ width: columnWidth },
							isSelect && themeStyles.selectedBg,
						]}
					>
						<Text
							style={[
								styles.dayText,
								isSelect ? styles.selectedText : themeStyles.inactiveText,
							]}
						>
							{day.title}
						</Text>
					</View>
				);
			})}
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		flexDirection: 'row',
		borderBottomWidth: 1,
		height: 38,
	},
	weekdayItem: {
		height: 38,
		alignItems: 'center',
		justifyContent: 'center',
	},
	dayText: {
		fontSize: 12,
		fontWeight: '500',
	},
	selectedText: {
		fontWeight: '700',
		color: '#ffffff',
	},
});

const lightStyles = StyleSheet.create({
	borderBottom: {
		borderColor: '#e0e6ed',
	},
	selectedBg: {
		backgroundColor: '#3b82f6', // matches blue-300 / blue-700
		borderTopLeftRadius: 6,
		borderTopRightRadius: 6,
	},
	inactiveText: {
		color: '#3b3f5c',
	},
});

const darkStyles = StyleSheet.create({
	borderBottom: {
		borderColor: '#191e3a',
	},
	selectedBg: {
		backgroundColor: '#1e3a8a', // matches dark:bg-blue-900
		borderTopLeftRadius: 6,
		borderTopRightRadius: 6,
	},
	inactiveText: {
		color: '#888ea8',
	},
});
