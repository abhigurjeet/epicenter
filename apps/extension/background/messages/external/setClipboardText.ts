import type { PlasmoMessaging } from '@plasmohq/messaging';
import type { ExternalMessage, ExternalMessageNameToReturnType, Result } from '@repo/shared';
import { WhisperingError, effectToResult } from '@repo/shared';
import { Effect } from 'effect';
import { getActiveTabId } from '~lib/background/external/getActiveTabId';
import { injectScript } from '~background/injectScript';
import { renderErrorAsNotification } from '~lib/errors';
import { NotificationServiceBgswLive } from '~lib/services/NotificationServiceBgswLive';
import { STORAGE_KEYS, extensionStorageService } from '~lib/services/extension-storage';

const setClipboardText = (text: string): Effect.Effect<void, WhisperingError> =>
	Effect.gen(function* () {
		const activeTabId = yield* getActiveTabId;
		yield* extensionStorageService[STORAGE_KEYS.LATEST_RECORDING_TRANSCRIBED_TEXT].set(text);
		yield* injectScript<string, [string]>({
			tabId: activeTabId,
			commandName: 'setClipboardText',
			func: (text) => {
				try {
					navigator.clipboard.writeText(text);
					return { isSuccess: true, data: text } as const;
				} catch (error) {
					return {
						isSuccess: false,
						error: {
							title: 'Unable to copy transcribed text to clipboard in active tab',
							description: error instanceof Error ? error.message : `Unknown error: ${error}`,
							error,
						},
					} as const;
				}
			},
			args: [text],
		});
	}).pipe(
		Effect.catchTags({
			GetActiveTabIdError: () =>
				new WhisperingError({
					title: 'Unable to get active tab ID to copy transcribed text to clipboard',
					description:
						'Please go to your recordings tab in the Whispering website to copy the transcribed text to clipboard',
				}),
		}),
	);

export type RequestBody = Extract<ExternalMessage, { name: 'external/setClipboardText' }>['body'];

export type ResponseBody = Result<ExternalMessageNameToReturnType['external/setClipboardText']>;

const handler: PlasmoMessaging.MessageHandler<RequestBody, ResponseBody> = ({ body }, res) =>
	Effect.gen(function* () {
		if (!body?.transcribedText) {
			return yield* new WhisperingError({
				title: 'Error invoking setClipboardText command',
				description: 'Text must be provided in the request body of the message',
			});
		}
		yield* setClipboardText(body.transcribedText);
	}).pipe(
		Effect.tapError(renderErrorAsNotification),
		Effect.provide(NotificationServiceBgswLive),
		effectToResult,
		Effect.map(res.send),
		Effect.runPromise,
	);

export default handler;
