import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useColorScheme } from '@/components/useColorScheme';

interface TimesColProps {
	blockHeight: number;
	timesArray: string[];
	hasSpacer?: boolean;
}

export default function TimesCol({ blockHeight, timesArray, hasSpacer = true }: TimesColProps) {
	const colorScheme = useColorScheme();
	const isDark = colorScheme === 'dark';

	const themeStyles = isDark ? darkStyles : lightStyles;

	return (
		<View style={styles.container}>
			{hasSpacer && <View style={styles.headerSpacer} />}
			<View style={styles.slotsContainer}>
				{timesArray.map((time, index) => (
					<View
						key={`time-${time}-${index}`}
						style={[styles.timeSlot, { height: blockHeight }]}
					>
						<View style={styles.labelWrapper}>
							<Text style={[styles.timeText, themeStyles.text]}>{time}</Text>
						</View>
					</View>
				))}
			</View>
		</View>
	);
}

const styles = StyleSheet.create({
	container: {
		width: 50,
	},
	headerSpacer: {
		height: 38,
	},
	slotsContainer: {
		paddingTop: 10, // offsets the top grid borders
	},
	timeSlot: {
		borderTopWidth: 1,
		borderTopColor: 'transparent', // just to match grid border offsets
	},
	labelWrapper: {
		position: 'absolute',
		top: -8, // negative margin equivalent to place label right on the line
		left: 0,
		right: 0,
		alignItems: 'center',
	},
	timeText: {
		fontSize: 10,
		fontWeight: '600',
	},
});

const lightStyles = StyleSheet.create({
	text: {
		color: '#515365',
	},
});

const darkStyles = StyleSheet.create({
	text: {
		color: '#888ea8',
	},
});
