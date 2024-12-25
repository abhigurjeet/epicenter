import { Ok, tryAsync } from '@epicenterhq/result';
import {
	WHISPERING_URL,
	WHISPERING_URL_WILDCARD,
	WhisperingErr,
	type WhisperingResult,
} from '@repo/shared';
import { injectScript } from '~background/injectScript';

export const getOrCreateWhisperingTabId = async (): Promise<
	WhisperingResult<number>
> => {
	const getAllWhisperingTabsResult = await getAllWhisperingTabs();
	if (!getAllWhisperingTabsResult.ok) return getAllWhisperingTabsResult;
	const whisperingTabs = getAllWhisperingTabsResult.data;

	if (whisperingTabs.length === 0) {
		return await createAndSetupNewTab();
	}

	const getBestWhisperingTabResult = await getBestWhisperingTab(whisperingTabs);
	if (!getBestWhisperingTabResult.ok) return getBestWhisperingTabResult;
	const bestWhisperingTabId = getBestWhisperingTabResult.data;

	const otherWhisperingTabIds = whisperingTabs
		.map((tab) => tab.id)
		.filter((tabId) => tabId !== undefined)
		.filter((tabId) => tabId !== bestWhisperingTabId);

	const results = await removeTabsById(otherWhisperingTabIds);
	return Ok(bestWhisperingTabId);
};

function getAllWhisperingTabs() {
	return tryAsync({
		try: () => chrome.tabs.query({ url: WHISPERING_URL_WILDCARD }),
		mapErr: (error) =>
			WhisperingErr({
				title: 'Error getting Whispering tabs',
				description: 'Error querying for Whispering tabs in the browser.',
				action: { type: 'more-details', error },
			}),
	});
}

async function createAndSetupNewTab(): Promise<WhisperingResult<number>> {
	const createWhisperingTabResult = await createWhisperingTab();
	if (!createWhisperingTabResult.ok) return createWhisperingTabResult;
	const newTabId = createWhisperingTabResult.data;
	const makeTabUndiscardableByIdResult =
		await makeTabUndiscardableById(newTabId);
	if (!makeTabUndiscardableByIdResult.ok) return makeTabUndiscardableByIdResult;
	const pinTabByIdResult = await pinTabById(newTabId);
	if (!pinTabByIdResult.ok) return pinTabByIdResult;
	return Ok(newTabId);
}

function pinTabById(tabId: number) {
	return tryAsync({
		try: () => chrome.tabs.update(tabId, { pinned: true }),
		mapErr: (error) =>
			WhisperingErr({
				title: 'Unable to pin Whispering tab',
				description: 'Error pinning Whispering tab.',
				action: { type: 'more-details', error },
			}),
	});
}

async function getBestWhisperingTab(
	tabs: chrome.tabs.Tab[],
): Promise<WhisperingResult<number>> {
	const undiscardedWhisperingTabs = tabs.filter((tab) => !tab.discarded);
	const pinnedUndiscardedWhisperingTabs = undiscardedWhisperingTabs.filter(
		(tab) => tab.pinned,
	);
	for (const pinnedUndiscardedTab of pinnedUndiscardedWhisperingTabs) {
		if (!pinnedUndiscardedTab.id) continue;
		const isResponsive = await checkTabResponsiveness(pinnedUndiscardedTab.id);
		if (isResponsive) return Ok(pinnedUndiscardedTab.id);
	}
	for (const undiscardedTab of undiscardedWhisperingTabs) {
		if (!undiscardedTab.id) continue;
		const isResponsive = await checkTabResponsiveness(undiscardedTab.id);
		if (isResponsive) return Ok(undiscardedTab.id);
	}
	return await createAndSetupNewTab();
}

async function checkTabResponsiveness(tabId: number) {
	const injectScriptResult = await injectScript<'pong', []>({
		tabId,
		commandName: 'ping',
		func: () => ({ ok: true, data: 'pong' }),
		args: [],
	});
	if (!injectScriptResult.ok) return false;
	return true;
}

/**
 * Creates a new Whispering tab, then waits for a Whispering content script to
 * send a message indicating that it's ready to toggle recording, cancel
 * recording, etc.
 */
function createWhisperingTab() {
	return tryAsync({
		try: () =>
			new Promise<number>((resolve, reject) => {
				chrome.runtime.onMessage.addListener(
					function contentReadyListener(message, sender, sendResponse) {
						if (
							message.name === 'extension/notifyWhisperingTabReady' &&
							sender.tab?.id
						) {
							resolve(sender.tab.id);
							chrome.runtime.onMessage.removeListener(contentReadyListener);
						}
					},
				);
				// Perform your desired action here
				chrome.tabs.create({
					url: WHISPERING_URL,
					active: false,
					pinned: true,
				});
			}),
		mapErr: (error) =>
			WhisperingErr({
				title: 'Error creating Whispering tab',
				description: 'Error creating Whispering tab in the browser.',
				action: { type: 'more-details', error },
			}),
	});
}

function makeTabUndiscardableById(tabId: number) {
	return tryAsync({
		try: () => chrome.tabs.update(tabId, { autoDiscardable: false }),
		mapErr: (error) =>
			WhisperingErr({
				title: 'Unable to make Whispering tab undiscardable',
				description: 'Error updating Whispering tab to make it undiscardable.',
				action: { type: 'more-details', error },
			}),
	});
}

function removeTabsById(tabIds: number[]) {
	return Promise.all(
		tabIds.map((tabId) =>
			tryAsync({
				try: () => chrome.tabs.remove(tabId),
				mapErr: (error) =>
					WhisperingErr({
						title: `Error closing Whispering tab ${tabId}`,
						description: `Error closing Whispering tab ${tabId} in the browser.`,
						action: { type: 'more-details', error },
					}),
			}),
		),
	);
}
