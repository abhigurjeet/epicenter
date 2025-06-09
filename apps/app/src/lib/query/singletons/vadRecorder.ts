import {
	createResultMutation,
	createResultQuery,
} from '@tanstack/svelte-query';
import { recordings } from '$lib/query/recordings';
import { playSoundIfEnabled } from '$lib/services/index.js';
import { createVadServiceWeb } from '$lib/services/recorder/VadService.web';
import { toast } from '$lib/services/toast';
import { settings } from '$lib/stores/settings.svelte';
import { Ok } from '@epicenterhq/result';
import { nanoid } from 'nanoid/non-secure';
import { getContext, setContext } from 'svelte';
import { queryClient } from '..';
import type { Transformer } from './transformer';
import { transcription } from '../transcription';
import { maybeCopyAndPaste } from './maybeCopyAndPaste';

export type VadRecorder = ReturnType<typeof createVadRecorder>;

export const initVadRecorderInContext = () => {
	const vad = createVadRecorder();
	setContext('vad', vad);
	return vad;
};

export const getVadRecorderFromContext = () => {
	return getContext<VadRecorder>('vad');
};

const vadRecorderKeys = {
	all: ['vadRecorder'] as const,
	state: ['vadRecorder', 'state'] as const,
};

function createVadRecorder() {
	const VadService = createVadServiceWeb();
	const invalidateVadState = () =>
		queryClient.invalidateQueries({ queryKey: vadRecorderKeys.state });
	const createRecording = createResultMutation(recordings.createRecording);
	const transcribeRecording = createResultMutation(
		transcription.transcribeRecording,
	);

	const vadState = createResultQuery(() => ({
		queryKey: vadRecorderKeys.state,
		queryFn: () => {
			const vadState = VadService.getVadState();
			return Ok(vadState);
		},
	}));

	const ensureVadSession = createResultMutation(() => ({
		mutationFn: async () => {
			const ensureVadResult = await VadService.ensureVad({
				deviceId:
					settings.value['recording.navigator.selectedAudioInputDeviceId'],
				onSpeechEnd: (blob) => {
					const toastId = nanoid();
					toast.success({
						id: toastId,
						title: '🎙️ Voice activated speech captured',
						description: 'Your voice activated speech has been captured.',
					});
					console.info('Voice activated speech captured');
					void playSoundIfEnabled('vad-capture');

					const now = new Date().toISOString();
					const newRecordingId = nanoid();

					createRecording.mutate(
						{
							id: newRecordingId,
							title: '',
							subtitle: '',
							createdAt: now,
							updatedAt: now,
							timestamp: now,
							transcribedText: '',
							blob,
							transcriptionStatus: 'UNPROCESSED',
						},
						{
							onError(error) {
								toast.error({
									id: toastId,
									title: '❌ Database Save Failed',
									description:
										'Your voice activated capture was captured but could not be saved to the database. Please check your storage space and permissions.',
									action: {
										type: 'more-details',
										error: error,
									},
								});
							},
							onSuccess: async (createdRecording) => {
								toast.loading({
									id: toastId,
									title: '✨ Voice activated capture complete!',
									description: settings.value[
										'recording.isFasterRerecordEnabled'
									]
										? 'Voice activated capture complete! Ready for another take'
										: 'Voice activated capture complete! Session closed successfully',
								});

								const transcribeToastId = nanoid();
								toast.loading({
									id: transcribeToastId,
									title: '📋 Transcribing...',
									description: 'Your recording is being transcribed...',
								});
								transcribeRecording.mutate(createdRecording, {
									onSuccess: (transcribedText) => {
										toast.success({
											id: transcribeToastId,
											title: 'Transcribed recording!',
											description: 'Your recording has been transcribed.',
										});
										maybeCopyAndPaste({
											text: transcribedText,
											toastId,
											shouldCopy:
												settings.value['transcription.clipboard.copyOnSuccess'],
											shouldPaste:
												settings.value[
													'transcription.clipboard.pasteOnSuccess'
												],
											statusToToastText(status) {
												switch (status) {
													case null:
														return '📝 Recording transcribed!';
													case 'COPIED':
														return '📝 Recording transcribed and copied to clipboard!';
													case 'COPIED+PASTED':
														return '📝📋✍️ Recording transcribed, copied to clipboard, and pasted!';
												}
											},
										});
										if (
											settings.value['transformations.selectedTransformationId']
										) {
											const transformToastId = nanoid();
											transformRecording.mutate({
												recordingId: createdRecording.id,
												transformationId:
													settings.value[
														'transformations.selectedTransformationId'
													],
												toastId: transformToastId,
											});
										}
									},
									onError: (error) => {
										if (error.name === 'WhisperingError') {
											toast.error({ id: transcribeToastId, ...error });
											return;
										}
										toast.error({
											id: transcribeToastId,
											title: '❌ Failed to transcribe recording',
											description: 'Your recording could not be transcribed.',
											action: { type: 'more-details', error: error },
										});
									},
								});
							},
						},
					);
				},
			});
			return ensureVadResult;
		},
		onSettled: invalidateVadState,
	}));

	const closeVadSession = createResultMutation(() => ({
		mutationFn: async () => {
			const closeResult = await VadService.closeVad();
			return closeResult;
		},
		onSettled: invalidateVadState,
	}));

	const startActiveListening = createResultMutation(() => ({
		onMutate: async () => {
			const toastId = nanoid();
			toast.loading({
				id: toastId,
				title: '🎙️ Preparing to start voice activated capture...',
				description: 'Setting up your voice activated capture environment...',
			});
			await ensureVadSession.mutateAsync();
			return { toastId };
		},
		mutationFn: async () => {
			const startVadResult = await VadService.startVad();
			return startVadResult;
		},
		onError: (error, _variables, ctx) => {
			if (!ctx) return;
			const { toastId } = ctx;
			toast.error({ id: toastId, ...error });
		},
		onSuccess: (_data, _variables, ctx) => {
			if (!ctx) return;
			const { toastId } = ctx;
			toast.success({
				id: toastId,
				title: '🎙️ Voice activated capture session started...',
				description:
					'Speak now. Will transcribe until you end the voice activated capture session',
			});
			console.info('Voice activated capture started');
			void playSoundIfEnabled('vad-start');
		},
		onSettled: invalidateVadState,
	}));

	const stopVad = createResultMutation(() => ({
		onMutate: () => {
			const toastId = nanoid();
			toast.loading({
				id: toastId,
				title: '⏸️ Stopping voice activated capture...',
				description: 'Finalizing your voice activated capture...',
			});
			return { toastId };
		},
		mutationFn: async () => {
			const stopResult = await VadService.closeVad();
			return stopResult;
		},
		onError: (error, _variables, ctx) => {
			if (!ctx) return;
			const { toastId } = ctx;
			toast.error({ id: toastId, ...error });
		},
		onSuccess: async (_, _variables, ctx) => {
			if (!ctx) return;
			const { toastId } = ctx;

			console.info('Stopping voice activated capture');
			void playSoundIfEnabled('vad-stop');

			if (!settings.value['recording.isFasterRerecordEnabled']) {
				toast.loading({
					id: toastId,
					title: '⏳ Closing voice activated capture session...',
					description: 'Wrapping things up, just a moment...',
				});
				closeVadSession.mutate(undefined, {
					onSuccess: async () => {
						toast.success({
							id: toastId,
							title: '✨ Session Closed Successfully',
							description:
								'Your voice activated capture session has been neatly wrapped up',
						});
					},
					onError: (error) => {
						toast.warning({
							id: toastId,
							title: '⚠️ Unable to close voice activated capture session',
							description:
								'You might need to restart the application to continue voice activated capture',
							action: {
								type: 'more-details',
								error: error,
							},
						});
					},
				});
			}
		},
		onSettled: invalidateVadState,
	}));

	return {
		get vadState() {
			return vadState.data ?? 'IDLE';
		},
		toggleVad: async () => {
			if (vadState.data === 'SESSION+RECORDING') {
				stopVad.mutate();
			} else {
				startActiveListening.mutate();
			}
		},
	};
}
