import { toast } from '$lib/services/ToastService';
import { renderErrorAsToast } from '$lib/services/renderErrorAsToast';
import { createJobQueue } from '$lib/utils/createJobQueue';
import { createPersistedState } from '$lib/utils/createPersistedState.svelte';
import { Schema as S } from '@effect/schema';
import { getDefaultSettings, settingsSchema, WhisperingError } from '@repo/shared';
import { register, unregisterAll } from '@tauri-apps/api/globalShortcut';
import { Effect } from 'effect';
import hotkeys from 'hotkeys-js';
import { recorder } from './recorder.svelte';

export const settings = createPersistedState({
	key: 'whispering-settings',
	schema: settingsSchema.pipe(S.mutable),
	defaultValue: getDefaultSettings('app'),
});

type RegisterShortcutJob = Effect.Effect<void>;

const unregisterAllLocalShortcuts = Effect.try({
	try: () => hotkeys.unbind(),
	catch: (error) =>
		new WhisperingError({
			title: 'Error unregistering all shortcuts',
			description: error instanceof Error ? error.message : 'Please try again.',
			error,
		}),
});

const unregisterAllGlobalShortcuts = Effect.tryPromise({
	try: () => unregisterAll(),
	catch: (error) =>
		new WhisperingError({
			title: 'Error unregistering all shortcuts',
			description: error instanceof Error ? error.message : 'Please try again.',
			error,
		}),
});

const registerLocalShortcut = ({
	shortcut,
	callback,
}: {
	shortcut: string;
	callback: () => void;
}) =>
	Effect.gen(function* () {
		yield* unregisterAllLocalShortcuts;
		yield* Effect.try({
			try: () =>
				hotkeys(shortcut, function (event, handler) {
					// Prevent the default refresh event under WINDOWS system
					event.preventDefault();
					callback();
				}),
			catch: (error) =>
				new WhisperingError({
					title: 'Error registering local shortcut',
					description:
						error instanceof Error
							? error.message
							: 'Please make sure it is a valid keyboard shortcut.',
					error,
				}),
		});
	});

const registerGlobalShortcut = ({
	shortcut,
	callback,
}: {
	shortcut: string;
	callback: () => void;
}) =>
	Effect.gen(function* () {
		yield* unregisterAllGlobalShortcuts;
		yield* Effect.tryPromise({
			try: () => register(shortcut, callback),
			catch: (error) =>
				new WhisperingError({
					title:
						'Error registering global shortcut. Please make sure it is a valid Electron keyboard shortcut.',
					description:
						error instanceof Error
							? error.message
							: 'You can find more information in the console.',
					error,
				}),
		});
	});

export const registerShortcuts = Effect.gen(function* () {
	const jobQueue = yield* createJobQueue<RegisterShortcutJob>();

	const initialSilentJob = Effect.gen(function* () {
		yield* unregisterAllLocalShortcuts;
		yield* unregisterAllGlobalShortcuts;
		yield* registerLocalShortcut({
			shortcut: settings.value.currentLocalShortcut,
			callback: recorder.toggleRecording,
		});
		yield* registerGlobalShortcut({
			shortcut: settings.value.currentGlobalShortcut,
			callback: recorder.toggleRecording,
		});
	}).pipe(Effect.catchAll(renderErrorAsToast));

	jobQueue.addJobToQueue(initialSilentJob).pipe(Effect.runPromise);

	return {
		registerLocalShortcut: ({ shortcut, callback }: { shortcut: string; callback: () => void }) =>
			Effect.gen(function* () {
				const job = Effect.gen(function* () {
					yield* unregisterAllLocalShortcuts;
					yield* registerLocalShortcut({ shortcut, callback });
					yield* toast({
						variant: 'success',
						title: `Local shortcut set to ${shortcut}`,
						description: 'Press the shortcut to start recording',
					});
				}).pipe(Effect.catchAll(renderErrorAsToast));
				jobQueue.addJobToQueue(job).pipe(Effect.runPromise);
			}),
		registerGlobalShortcut: ({ shortcut, callback }: { shortcut: string; callback: () => void }) =>
			Effect.gen(function* () {
				const job = Effect.gen(function* () {
					yield* unregisterAllGlobalShortcuts;
					yield* registerGlobalShortcut({ shortcut, callback });
					yield* toast({
						variant: 'success',
						title: `Global shortcut set to ${shortcut}`,
						description: 'Press the shortcut to start recording',
					});
				}).pipe(Effect.catchAll(renderErrorAsToast));
				jobQueue.addJobToQueue(job).pipe(Effect.runPromise);
			}),
	};
}).pipe(Effect.runSync);
