import { Schema } from '@effect/schema';
import {
	WHISPERING_URL,
	WHISPERING_URL_WILDCARD,
	WhisperingError,
	externalMessageSchema,
	type ExternalMessageBody,
} from '@repo/shared';
import { Effect, Either } from 'effect';
import { injectScript } from '~background/injectScript';

export const getOrCreateWhisperingTabId = Effect.gen(function* () {
	const whisperingTabs = yield* getAllWhisperingTabs();

	if (whisperingTabs.length === 0) {
		return yield* createAndSetupNewTab();
	}

	const selectedTabId = yield* Effect.gen(function* () {
		const undiscardedWhisperingTabs = whisperingTabs.filter((tab) => !tab.discarded);
		const pinnedUndiscardedWhisperingTabs = undiscardedWhisperingTabs.filter((tab) => tab.pinned);
		for (const pinnedUndiscardedTab of pinnedUndiscardedWhisperingTabs) {
			if (!pinnedUndiscardedTab.id) return;
			const isResponsive = yield* checkTabResponsiveness(pinnedUndiscardedTab.id);
			if (isResponsive) return pinnedUndiscardedTab;
		}
		for (const undiscardedTab of undiscardedWhisperingTabs) {
			if (!undiscardedTab.id) return;
			const isResponsive = yield* checkTabResponsiveness(undiscardedTab.id);
			if (isResponsive) return undiscardedTab;
		}
		return yield* createAndSetupNewTab();
	});

	const otherTabIds = whisperingTabs
		.map((tab) => tab.id)
		.filter((tabId) => tabId !== undefined)
		.filter((tabId) => tabId !== selectedTabId);
	yield* removeTabsById(otherTabIds);
	return selectedTabId;
});

function checkTabResponsiveness(tabId: number) {
	return injectScript<true, []>({
		tabId,
		commandName: 'ping',
		func: () => ({ isSuccess: true, data: true }),
		args: [],
	}).pipe(Effect.catchAll(() => Effect.succeed(false)));
}

function createAndSetupNewTab() {
	return Effect.gen(function* () {
		const newTabId = yield* createWhisperingTab();
		yield* makeTabUndiscardableById(newTabId);
		yield* pinTabById(newTabId);
		return newTabId;
	});
}

function getAllWhisperingTabs() {
	return Effect.tryPromise({
		try: () => chrome.tabs.query({ url: WHISPERING_URL_WILDCARD }),
		catch: (error) =>
			new WhisperingError({
				title: 'Error getting Whispering tabs',
				description: 'Error querying for Whispering tabs in the browser.',
				error,
			}),
	});
}

/**
 * Creates a new Whispering tab, then waits for a Whispering content script to
 * send a message indicating that it's ready to toggle recording, cancel
 * recording, etc.
 */
function createWhisperingTab() {
	return Effect.async<number>((resume) => {
		chrome.runtime.onMessage.addListener(
			function contentReadyListener(message, sender, sendResponse) {
				if (!isNotifyWhisperingTabReadyMessage(message)) return;
				if (!sender.tab?.id) return;
				resume(Effect.succeed(sender.tab.id));
				chrome.runtime.onMessage.removeListener(contentReadyListener);
			},
		);
		// Perform your desired action here
		chrome.tabs.create({ url: WHISPERING_URL, active: false, pinned: true });
	});
}

function isNotifyWhisperingTabReadyMessage(
	message: unknown,
): message is ExternalMessageBody<'whispering-extension/notifyWhisperingTabReady'> {
	const externalMessageResult = Schema.decodeUnknownEither(externalMessageSchema)(message);
	if (Either.isLeft(externalMessageResult)) return false;
	const externalMessage = externalMessageResult.right;
	return externalMessage.name === 'whispering-extension/notifyWhisperingTabReady';
}

function makeTabUndiscardableById(tabId: number) {
	return Effect.tryPromise({
		try: () => chrome.tabs.update(tabId, { autoDiscardable: false }),
		catch: (error) =>
			new WhisperingError({
				title: 'Unable to make Whispering tab undiscardable',
				description: 'Error updating Whispering tab to make it undiscardable.',
				error,
			}),
	});
}

function pinTabById(tabId: number) {
	return Effect.promise(() => chrome.tabs.update(tabId, { pinned: true }));
}

function removeTabsById(tabIds: number[]) {
	return Effect.all(
		tabIds.map((tabId) =>
			Effect.tryPromise({
				try: () => chrome.tabs.remove(tabId),
				catch: (error) =>
					new WhisperingError({
						title: `Error closing Whispering tab ${tabId}`,
						description: `Error closing Whispering tab ${tabId} in the browser.`,
						error,
					}),
			}),
		),
		{ concurrency: 'unbounded' },
	);
}
