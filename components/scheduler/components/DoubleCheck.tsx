import React from 'react';
import { StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';

/** Двойная галочка «On my way» — две наложенные галочки, как в мессенджерах */
export default function DoubleCheck({ size = 12, color = '#ffffff' }: { size?: number; color?: string }) {
	const symbol = { ios: 'checkmark', android: 'check', web: 'check' } as const;
	const shift = Math.round(size * 0.4);
	return (
		<View style={[styles.wrap, { width: size + shift, height: size }]} accessibilityLabel="On my way">
			<SymbolView name={symbol} size={size} tintColor={color} weight="bold" style={styles.abs} />
			<SymbolView name={symbol} size={size} tintColor={color} weight="bold" style={[styles.abs, { left: shift }]} />
		</View>
	);
}

const styles = StyleSheet.create({
	wrap: {
		position: 'relative',
	},
	abs: {
		position: 'absolute',
		top: 0,
		left: 0,
	},
});
