import { mediaStreamManager } from '$lib/services/MediaRecorderService.svelte';
import { toast } from '$lib/services/ToastService';
import { settings } from '$lib/stores/settings.svelte';
import { WhisperingError } from '@repo/shared';
import { Data, Effect } from 'effect';
import { nanoid } from 'nanoid/non-secure';

const TIMESLICE_MS = 1000;

class TryResuseStreamError extends Data.TaggedError('TryResuseStreamError') {}

export const MediaRecorderService = Effect.gen(function* () {
	let mediaRecorder: MediaRecorder | null = null;
	const recordedChunks: Blob[] = [];

	const resetRecorder = () => {
		recordedChunks.length = 0;
		mediaRecorder = null;
		if (!settings.value.isFasterRerecordEnabled) {
			mediaStreamManager.release();
		}
	};

	return {
		get recordingState() {
			if (!mediaRecorder) return 'inactive';
			return mediaRecorder.state;
		},
		startRecording: () =>
			Effect.gen(function* () {
				if (mediaRecorder) {
					return yield* new WhisperingError({
						title: 'Unexpected media recorder already exists',
						description:
							'It seems like it was not properly deinitialized after the previous stopRecording or cancelRecording call.',
					});
				}
				const connectingToRecordingDeviceToastId = nanoid();
				const newOrExistingStream = settings.value.isFasterRerecordEnabled
					? yield* mediaStreamManager.getOrRefreshStream()
					: yield* mediaStreamManager.refreshStream();
				const newMediaRecorder = yield* Effect.try({
					try: () =>
						new MediaRecorder(newOrExistingStream, {
							bitsPerSecond: settings.value.bitsPerSecond,
						}),
					catch: () => new TryResuseStreamError(),
				}).pipe(
					Effect.catchAll(() =>
						Effect.gen(function* () {
							yield* toast({
								id: connectingToRecordingDeviceToastId,
								variant: 'loading',
								title:
									'Error initializing media recorder with preferred device',
								description:
									'Trying to find another available audio input device...',
							});
							const stream = yield* mediaStreamManager.refreshStream();
							return new MediaRecorder(stream, {
								bitsPerSecond: settings.value.bitsPerSecond,
							});
						}),
					),
				);
				newMediaRecorder.addEventListener(
					'dataavailable',
					(event: BlobEvent) => {
						if (!event.data.size) return;
						recordedChunks.push(event.data);
					},
				);
				newMediaRecorder.start(TIMESLICE_MS);
				mediaRecorder = newMediaRecorder;
			}),
		stopRecording: Effect.async<Blob, Error>((resume) => {
			if (!mediaRecorder) return;
			mediaRecorder.addEventListener('stop', () => {
				if (!mediaRecorder) return;
				const audioBlob = new Blob(recordedChunks, {
					type: mediaRecorder.mimeType,
				});
				resume(Effect.succeed(audioBlob));
				resetRecorder();
			});
			mediaRecorder.stop();
		}).pipe(
			Effect.catchAll((error) => {
				resetRecorder();
				return new WhisperingError({
					title: 'Error canceling media recorder',
					description:
						error instanceof Error ? error.message : 'Please try again',
					error: error,
				});
			}),
		),
		cancelRecording: Effect.async<undefined, Error>((resume) => {
			if (!mediaRecorder) return;
			mediaRecorder.addEventListener('stop', () => {
				resetRecorder();
				resume(Effect.succeed(undefined));
			});
			mediaRecorder.stop();
		}).pipe(
			Effect.catchAll((error) => {
				resetRecorder();
				return new WhisperingError({
					title: 'Error stopping media recorder',
					description:
						error instanceof Error ? error.message : 'Please try again',
					error: error,
				});
			}),
		),
	};
});
