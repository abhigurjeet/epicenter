import { Err, Ok, tryAsync, type Result } from 'wellcrafted/result';
import {
	active,
	isPermissionGranted,
	removeActive,
	requestPermission,
	sendNotification,
} from '@tauri-apps/plugin-notification';
import { nanoid } from 'nanoid/non-secure';
import type { NotificationService, NotificationServiceError } from '.';

export function createNotificationServiceDesktop(): NotificationService {
	const removeNotificationById = async (
		id: number,
	): Promise<Result<void, NotificationServiceError>> => {
		const { data: activeNotifications, error: activeNotificationsError } =
			await tryAsync({
				try: async () => await active(),
				mapError: (error): NotificationServiceError => ({
					name: 'NotificationServiceError',
					message: 'Unable to retrieve active desktop notifications.',
					context: { id },
					cause: error,
				}),
			});
		if (activeNotificationsError) return Err(activeNotificationsError);
		const matchingActiveNotification = activeNotifications.find(
			(notification) => notification.id === id,
		);
		if (matchingActiveNotification) {
			const { error: removeActiveError } = await tryAsync({
				try: async () => await removeActive([matchingActiveNotification]),
				mapError: (error): NotificationServiceError => ({
					name: 'NotificationServiceError',
					message: `Unable to remove notification with id ${id}.`,
					context: { id, matchingActiveNotification },
					cause: error,
				}),
			});
			if (removeActiveError) return Err(removeActiveError);
		}
		return Ok(undefined);
	};

	return {
		async notify({ id: idStringified = nanoid(), title, description }) {
			const id = stringToNumber(idStringified);

			await removeNotificationById(id);

			const { error: notifyError } = await tryAsync({
				try: async () => {
					let permissionGranted = await isPermissionGranted();
					if (!permissionGranted) {
						const permission = await requestPermission();
						permissionGranted = permission === 'granted';
					}
					if (permissionGranted) {
						sendNotification({ id: id, title, body: description });
					}
				},
				mapError: (error): NotificationServiceError => ({
					name: 'NotificationServiceError',
					message: 'Could not send notification',
					context: { idStringified, title, description },
					cause: error,
				}),
			});
			if (notifyError) return Err(notifyError);
			return Ok(idStringified);
		},
		clear: async (idStringified) => {
			const removeNotificationResult = await removeNotificationById(
				stringToNumber(idStringified),
			);
			return removeNotificationResult;
		},
	};
}

function stringToNumber(str: string): number {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash;
	}
	return Math.abs(hash);
}
