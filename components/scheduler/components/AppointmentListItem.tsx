import React from 'react';
import { StyleSheet, Text, View, Pressable } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { CalendarEvent } from '../types';
import { formatDate } from '../utils/TimeHelper';
import DoubleCheck from './DoubleCheck';
import { useColorScheme } from '@/components/useColorScheme';

const STATUS_ON_MY_WAY = 1;
const STATUS_DONE = 2;

interface ITag {
	id: number;
	title: string;
	color: string;
}

export interface ListAppointment {
	id: number | string;
	status?: number;
	address?: string | null;
	paymentPending?: boolean;
	customer?: { name?: string } | null;
	tags?: ITag[];
	job?: {
		id?: number;
		services?: { title: string }[];
		tags?: ITag[];
	} | null;
}

/** Карточка аппоинтмента в List — повторяет веб (renderScheduleListItem) */
export default function AppointmentListItem({ event, onPress }: { event: CalendarEvent<ListAppointment>; onPress?: () => void }) {
	const colorScheme = useColorScheme();
	const isDark = colorScheme === 'dark';
	const t = isDark ? dark : light;

	const appointment = event.data;
	if (!appointment) return null;

	const color = event.color || '#4361ee';
	const isDone = appointment.status === STATUS_DONE;
	const isOnMyWay = appointment.status === STATUS_ON_MY_WAY;
	const services = appointment.job?.services ?? [];
	const tags = [...(appointment.job?.tags ?? []), ...(appointment.tags ?? [])];

	return (
		<Pressable
			onPress={onPress}
			style={({ pressed }) => [
				styles.card,
				{ backgroundColor: t.card, borderColor: t.border, borderLeftColor: color },
				// Законченные — на 40% прозрачнее, но остаются читаемыми
				{ opacity: (isDone ? 0.6 : 1) * (pressed ? 0.8 : 1) },
			]}
		>
			<View style={styles.topRow}>
				<Text style={[styles.jobLine, { color: t.muted }]} numberOfLines={1}>
					{appointment.job?.id ? `Job# ${appointment.job.id}` : ''}
					{services.length > 0 ? `  |  ${services.map((s) => s.title).join(', ')}` : ''}
				</Text>
				<View style={styles.badges}>
					{isOnMyWay && (
						<View style={[styles.onMyWay, { backgroundColor: color }]}>
							<DoubleCheck size={11} color="#ffffff" />
						</View>
					)}
					{appointment.paymentPending && isDone && <View style={styles.pendingDot} accessibilityLabel="Payment pending" />}
				</View>
			</View>

			<View style={styles.nameRow}>
				<Text style={[styles.name, { color: t.text }]} numberOfLines={1}>
					{appointment.customer?.name || event.title || 'Unknown Customer'}
				</Text>
				{isDone && (
					<View style={[styles.doneBadge, { backgroundColor: t.doneBg }]}>
						<Text style={[styles.doneText, { color: t.doneText }]}>COMPLETED</Text>
					</View>
				)}
			</View>
			<Text style={[styles.time, { color: t.muted }]}>
				{formatDate(event.start, 'hh:mm A')} - {formatDate(event.end, 'hh:mm A')}
			</Text>

			{!!appointment.address && (
				<View style={styles.addressRow}>
					<SymbolView
						name={{ ios: 'mappin.and.ellipse', android: 'location_on', web: 'location_on' }}
						size={13}
						tintColor={t.muted}
						style={{ marginTop: 1 }}
					/>
					<Text style={[styles.address, { color: t.sub }]} numberOfLines={2}>
						{appointment.address}
					</Text>
				</View>
			)}

			{tags.length > 0 && (
				<View style={styles.tags}>
					{tags.map((tag, i) => (
						<View key={`${tag.id}-${i}`} style={[styles.tag, { backgroundColor: tag.color }]}>
							<Text style={styles.tagText} numberOfLines={1}>
								{tag.title}
							</Text>
						</View>
					))}
				</View>
			)}
		</Pressable>
	);
}

const styles = StyleSheet.create({
	card: {
		paddingVertical: 10,
		paddingHorizontal: 12,
		borderRadius: 8,
		borderWidth: 1,
		borderLeftWidth: 4,
		gap: 3,
	},
	topRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
	},
	jobLine: {
		flex: 1,
		fontSize: 12,
		fontWeight: '500',
	},
	badges: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 6,
	},
	onMyWay: {
		borderRadius: 10,
		paddingHorizontal: 6,
		paddingVertical: 3,
	},
	pendingDot: {
		width: 10,
		height: 10,
		borderRadius: 5,
		backgroundColor: '#e7515a',
	},
	nameRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
	},
	name: {
		flexShrink: 1,
		fontSize: 15,
		fontWeight: '700',
	},
	doneBadge: {
		borderRadius: 4,
		paddingHorizontal: 5,
		paddingVertical: 2,
	},
	doneText: {
		fontSize: 9,
		fontWeight: '700',
		letterSpacing: 0.3,
	},
	time: {
		fontSize: 12,
		fontWeight: '500',
	},
	addressRow: {
		flexDirection: 'row',
		alignItems: 'flex-start',
		gap: 5,
		marginTop: 3,
	},
	address: {
		flex: 1,
		fontSize: 13,
	},
	tags: {
		flexDirection: 'row',
		flexWrap: 'wrap',
		gap: 6,
		marginTop: 5,
	},
	tag: {
		borderRadius: 5,
		paddingHorizontal: 7,
		paddingVertical: 3,
		maxWidth: 160,
	},
	tagText: {
		color: '#ffffff',
		fontSize: 11,
		fontWeight: '600',
	},
});

const light = {
	card: '#ffffff',
	border: '#e2e8f0',
	text: '#0f172a',
	sub: '#475569',
	muted: '#64748b',
	doneBg: '#e2e8f0',
	doneText: '#475569',
};

const dark = {
	card: '#18181b',
	border: '#27272a',
	text: '#f4f4f5',
	sub: '#d4d4d8',
	muted: '#a1a1aa',
	doneBg: '#3f3f46',
	doneText: '#d4d4d8',
};
