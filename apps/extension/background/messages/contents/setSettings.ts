import type { PlasmoMessaging } from '@plasmohq/messaging';
import type { Result, Settings } from '@repo/shared';
import { WhisperingError, effectToResult } from '@repo/shared';
import { Effect } from 'effect';
import { injectScript } from '~background/injectScript';
import { getOrCreateWhisperingTabId } from '~lib/background/contents/getOrCreateWhisperingTabId';
import { renderErrorAsNotification } from '~lib/errors';
import { NotificationServiceBgswLive } from '~lib/services/NotificationServiceBgswLive';
import { STORAGE_KEYS } from '~lib/services/extension-storage';

export type RequestBody = { settings: Settings };

export type ResponseBody = Result<void>;

const handler: PlasmoMessaging.MessageHandler<RequestBody, ResponseBody> = ({ body }, res) =>
	Effect.gen(function* () {
		if (!body || !body.settings) {
			return yield* new WhisperingError({
				title: 'Error setting Whispering settings',
				description: 'Settings must be provided in the message request body',
			});
		}
		const { settings } = body;
		const whisperingTabId = yield* getOrCreateWhisperingTabId;
		const returnedSettings = yield* injectScript<
			Settings,
			[typeof STORAGE_KEYS.SETTINGS, Settings]
		>({
			tabId: whisperingTabId,
			commandName: 'setSettings',
			func: (settingsKey, settings) => {
				try {
					localStorage.setItem(settingsKey, JSON.stringify(settings));
					return { isSuccess: true, data: settings } as const;
				} catch (error) {
					return {
						isSuccess: false,
						error: {
							title: 'Unable to set Whispering settings',
							description:
								error instanceof Error
									? error.message
									: 'An error occurred while setting Whispering settings.',
							error,
						},
					} as const;
				}
			},
			args: [STORAGE_KEYS.SETTINGS, settings],
		});
	}).pipe(
		Effect.tapError(renderErrorAsNotification),
		Effect.provide(NotificationServiceBgswLive),
		effectToResult,
		Effect.map(res.send),
		Effect.runPromise,
	);

export default handler;
