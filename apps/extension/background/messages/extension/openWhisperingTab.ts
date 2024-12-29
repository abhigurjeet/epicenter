import { Ok } from '@epicenterhq/result';
import type { PlasmoMessaging } from '@plasmohq/messaging';
import type { WhisperingResult } from '@repo/shared';
import { WhisperingErr } from '@repo/shared';
import { injectScript } from '~background/injectScript';
import { getOrCreateWhisperingTabId } from '~lib/getOrCreateWhisperingTabId';

export async function openWhisperingTab(
	{ path }: OpenWhisperingTabMessage | undefined = { path: undefined },
): Promise<WhisperingResult<void>> {
	const getWhisperingTabIdResult = await getOrCreateWhisperingTabId();
	if (!getWhisperingTabIdResult.ok) return getWhisperingTabIdResult;
	const whisperingTabId = getWhisperingTabIdResult.data;
	if (!whisperingTabId)
		return WhisperingErr({
			title: 'Whispering tab not found',
			description: 'The Whispering tab was not found.',
		});
	await chrome.tabs.update(whisperingTabId, { active: true });
	if (path) {
		const injectScriptResult = await injectScript<undefined, [string]>({
			tabId: whisperingTabId,
			commandName: 'goto',
			func: (route) => {
				try {
					window.goto(route);
					return { ok: true, data: undefined } as const;
				} catch (error) {
					return {
						ok: false,
						error: {
							_tag: 'WhisperingError',
							variant: 'error',
							title: `Unable to go to route ${route} in Whispering tab`,
							description:
								'There was an error going to the route in the Whispering tab.',
							action: {
								type: 'more-details',
								error,
							},
						},
					} as const;
				}
			},
			args: [path],
		});
		if (!injectScriptResult.ok) return injectScriptResult;
	}
	return Ok(undefined);
}

export type OpenWhisperingTabMessage = {
	path?: string;
};
export type OpenWhisperingTabResult = WhisperingResult<void>;

const handler: PlasmoMessaging.MessageHandler<
	OpenWhisperingTabMessage,
	OpenWhisperingTabResult
> = async ({ body }, res) => {
	res.send(await openWhisperingTab(body));
};

export default handler;
