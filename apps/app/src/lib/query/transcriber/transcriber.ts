import { useCopyTextToClipboardWithToast } from '$lib/query/clipboard/mutations';
import { ClipboardService, createResultMutation } from '$lib/services';
import type { Recording } from '$lib/services/db';
import {
	DbTransformationsService,
	RunTransformationService,
	playSoundIfEnabled,
	userConfiguredServices,
} from '$lib/services/index.js';
import { toast } from '$lib/services/toast';
import { settings } from '$lib/stores/settings.svelte';
import { Ok } from '@epicenterhq/result';
import {
	WHISPERING_RECORDINGS_PATHNAME,
	WhisperingErr,
	type WhisperingErrProperties,
	type WhisperingResult,
} from '@repo/shared';
import { createMutation } from '@tanstack/svelte-query';
import { nanoid } from 'nanoid/non-secure';
import { getContext, setContext } from 'svelte';
import { queryClient } from '..';
import { useUpdateRecording } from '../recordings/mutations';

export type Transcriber = ReturnType<typeof createTranscriber>;

export const initTranscriberInContext = () => {
	const transcriber = createTranscriber();
	setContext('transcriber', transcriber);
	return transcriber;
};

export const getTranscriberFromContext = () => {
	return getContext<Transcriber>('transcriber');
};

const transcriberKeys = {
	transcribe: ['transcriber', 'transcribe'] as const,
	transform: ['transcriber', 'transform'] as const,
} as const;

function createTranscriber() {
	const { copyTextToClipboardWithToast } = useCopyTextToClipboardWithToast();
	const { copyAndPasteTranscriptWithToast } =
		useCopyAndPasteTranscriptWithToast();
	const { transcribeAndUpdateRecording } =
		useTranscribeAndUpdateRecordingWithToastWithSoundWithCopyPaste();
	const {
		transformTranscribedTextFromRecordingWithToastWithSoundWithCopyPaste,
	} = useTransformTranscribedTextFromRecordingWithToastWithSoundWithCopyPaste();

	return {
		get isCurrentlyTranscribing() {
			return (
				queryClient.isMutating({
					mutationKey: transcriberKeys.transcribe,
				}) > 0
			);
		},
		get isCurrentlyTransforming() {
			return (
				queryClient.isMutating({
					mutationKey: transcriberKeys.transform,
				}) > 0
			);
		},
		transcribeAndUpdateRecordingWithToastWithSoundWithCopyPaste: async ({
			recording,
		}: {
			recording: Recording;
		}) => {
			const toastId = nanoid();
			toast.loading({
				id: toastId,
				title: '📋 Transcribing...',
				description: 'Your recording is being transcribed...',
			});
			transcribeAndUpdateRecording.mutate(
				{ recording },
				{
					onError: (error) => {
						toast.error({ id: toastId, ...error });
					},
					onSuccess: async (text) => {
						void playSoundIfEnabled('transcriptionComplete');

						const transcribedToast = ({
							toastId,
							text,
						}: {
							toastId: string;
							text: string;
						}) => {
							toast.success({
								id: toastId,
								title: '📝 Recording transcribed!',
								description: text,
								descriptionClass: 'line-clamp-2',
								action: {
									type: 'button',
									label: 'Copy to clipboard',
									onClick: () =>
										copyTextToClipboardWithToast.mutate({
											label: 'transcribed text',
											text: text,
										}),
								},
							});
						};

						const transcribedAndCopiedToast = ({
							toastId,
							text,
						}: {
							toastId: string;
							text: string;
						}) => {
							toast.success({
								id: toastId,
								title: '📝 Recording transcribed and copied to clipboard!',
								description: text,
								descriptionClass: 'line-clamp-2',
								action: {
									type: 'link',
									label: 'Go to recordings',
									goto: WHISPERING_RECORDINGS_PATHNAME,
								},
							});
						};

						const transcribedAndCopiedAndPastedToast = ({
							toastId,
							text,
						}: {
							toastId: string;
							text: string;
						}) => {
							toast.success({
								id: toastId,
								title:
									'📝📋✍️ Recording transcribed, copied to clipboard, and pasted!',
								description: text,
								descriptionClass: 'line-clamp-2',
								action: {
									type: 'link',
									label: 'Go to recordings',
									goto: WHISPERING_RECORDINGS_PATHNAME,
								},
							});
						};

						if (!settings.value['transcription.clipboard.copyOnSuccess']) {
							return transcribedToast({ toastId, text: text });
						}
						const copyResult = await ClipboardService.setClipboardText(text);
						if (!copyResult.ok) {
							toast.warning({
								id: toastId,
								title: '⚠️ Clipboard Access Failed',
								description:
									'Could not copy text to clipboard. This may be due to browser restrictions or permissions. You can copy the text manually below.',
								action: { type: 'more-details', error: copyResult.error },
							});
							transcribedToast({ toastId, text });
							return;
						}

						if (!settings.value['transcription.clipboard.pasteOnSuccess']) {
							return transcribedAndCopiedToast({ toastId, text });
						}
						const pasteResult = await ClipboardService.writeTextToCursor(text);
						if (!pasteResult.ok) {
							toast.warning({
								title: '⚠️ Paste Operation Failed',
								description:
									'Text was copied to clipboard but could not be pasted automatically. Please use Ctrl+V (Cmd+V on Mac) to paste manually.',
								action: { type: 'more-details', error: pasteResult.error },
							});
							transcribedAndCopiedToast({ toastId, text });
							return;
						}
						return transcribedAndCopiedAndPastedToast({ toastId, text });
					},
				},
			);
		},
		transformAndUpdateRecordingWithToastWithSoundWithCopyPaste: async ({
			recording,
			selectedTransformationId,
		}: {
			recording: Recording;
			selectedTransformationId: string;
		}) => {
			const toastId = nanoid();
			toast.loading({
				id: toastId,
				title: '🔄 Running transformation...',
				description:
					'Applying your selected transformation to the transcribed text...',
			});
			transformTranscribedTextFromRecordingWithToastWithSoundWithCopyPaste.mutate(
				{
					transcribedText: recording.transcribedText,
					selectedTransformationId,
					recordingId: recording.id,
				},
				{
					onError: (error) => {
						toast.error({ id: toastId, ...error });
					},
					onSuccess: (transformedText) => {
						void playSoundIfEnabled('transformationComplete');
						copyAndPasteTranscriptWithToast.mutate({
							text: transformedText,
							toastId,
						});
					},
				},
			);
		},
	};
}

export function useTranscribeAndUpdateRecordingWithToastWithSoundWithCopyPaste() {
	const { updateRecording } = useUpdateRecording();
	return {
		transcribeAndUpdateRecording: createResultMutation(() => ({
			mutationKey: transcriberKeys.transcribe,
			onMutate: ({ recording }: { recording: Recording }) => {
				updateRecording.mutate(
					{ ...recording, transcriptionStatus: 'TRANSCRIBING' },
					{
						onError: (error) => {
							toast.warning({
								title:
									'⚠️ Unable to set recording transcription status to transcribing',
								description: 'Continuing with the transcription process...',
								action: { type: 'more-details', error },
							});
						},
					},
				);
			},
			mutationFn: async ({ recording }: { recording: Recording }) => {
				if (!recording.blob) {
					return WhisperingErr({
						title: '⚠️ Recording blob not found',
						description: "Your recording doesn't have a blob to transcribe.",
					});
				}
				const transcriptionResult =
					await userConfiguredServices.transcription.transcribe(
						recording.blob,
						{
							outputLanguage: settings.value['transcription.outputLanguage'],
							prompt: settings.value['transcription.prompt'],
							temperature: settings.value['transcription.temperature'],
						},
					);
				return transcriptionResult;
			},
			onError: (_error, { recording }) => {
				updateRecording.mutate(
					{ ...recording, transcriptionStatus: 'FAILED' },
					{
						onError: (error) => {
							toast.error({
								title:
									'⚠️ Unable to set recording transcription status to failed',
								description:
									'Transcription failed and failed again to update recording transcription status to failed',
								action: { type: 'more-details', error },
							});
						},
					},
				);
			},
			onSuccess: (transcribedText, { recording }) => {
				updateRecording.mutate(
					{ ...recording, transcribedText, transcriptionStatus: 'DONE' },
					{
						onError: (error) => {
							toast.error({
								title: '⚠️ Unable to update recording after transcription',
								description:
									"Transcription completed but unable to update recording's transcribed text and status in database",
								action: { type: 'more-details', error },
							});
						},
					},
				);
			},
		})),
	};
}

export function useTransformTranscribedTextFromRecordingWithToastWithSoundWithCopyPaste() {
	return {
		transformTranscribedTextFromRecordingWithToastWithSoundWithCopyPaste:
			createResultMutation(() => ({
				mutationKey: transcriberKeys.transform,
				mutationFn: async ({
					transcribedText,
					selectedTransformationId,
					recordingId,
				}: {
					transcribedText: string;
					selectedTransformationId: string;
					recordingId: string;
				}): Promise<WhisperingResult<string>> => {
					const getTransformationResult =
						await DbTransformationsService.getTransformationById(
							selectedTransformationId,
						);
					if (!getTransformationResult.ok) {
						return WhisperingErr({
							title: '⚠️ Transformation not found',
							description:
								'Could not find the selected transformation. Using original transcription.',
						});
					}

					const transformation = getTransformationResult.data;
					if (!transformation) {
						return WhisperingErr({
							title: '⚠️ Transformation not found',
							description:
								'Could not find the selected transformation. Using original transcription.',
						});
					}

					const transformationResult =
						await RunTransformationService.runTransformation({
							input: transcribedText,
							transformation,
							recordingId,
						});

					if (!transformationResult.ok) {
						return WhisperingErr({
							title: '⚠️ Transformation failed',
							description:
								'Failed to apply the transformation. Using original transcription.',
						});
					}

					const transformationRun = transformationResult.data;
					if (transformationRun.error) {
						return WhisperingErr({
							title: '⚠️ Transformation error',
							description: transformationRun.error,
						});
					}

					if (!transformationRun.output) {
						return WhisperingErr({
							title: '⚠️ Transformation produced no output',
							description:
								'The transformation completed but produced no output. Using original transcription.',
						});
					}

					return Ok(transformationRun.output);
				},
			})),
	};
}

function useCopyAndPasteTranscriptWithToast() {
	return {
		copyAndPasteTranscriptWithToast: createMutation(() => ({
			mutationFn: async ({ text }: { text: string }) => {},
			onSuccess: ({ status, error }, { text, toastId }) => {},
		})),
	};
}

function usePasteTextIfEnabled() {
	const { copyTextToClipboardWithToast } = useCopyTextToClipboardWithToast();
	return {
		copyAndPasteTranscriptWithToast: createMutation(() => ({
			mutationFn: async ({ text }: { text: string }) => {},
			onSuccess: ({ status, error }, { text, toastId }) => {
				switch (status) {
					case 'transcribed':
						return;
					case 'transcribedButCopyFailed':
						toast.success({
							id: toastId,
							title: '📝 Recording transcribed!',
							description: text,
							descriptionClass: 'line-clamp-2',
							action: {
								type: 'button',
								label: 'Copy to clipboard',
								onClick: () =>
									copyTextToClipboardWithToast.mutate({
										label: 'transcribed text',
										text: text,
									}),
							},
						});
						toast.warning({
							id: toastId,
							title: '⚠️ Clipboard Access Failed',
							description:
								'Could not copy text to clipboard. This may be due to browser restrictions or permissions. You can copy the text manually below.',
							action: { type: 'more-details', error: error },
						});
						return;
					case 'transcribedAndCopied':
						toast.success({
							id: toastId,
							title: '📝 Recording transcribed and copied to clipboard!',
							description: text,
							descriptionClass: 'line-clamp-2',
							action: {
								type: 'link',
								label: 'Go to recordings',
								goto: WHISPERING_RECORDINGS_PATHNAME,
							},
						});
						return;
					case 'transcribedAndCopiedButPasteFailed':
						toast.success({
							id: toastId,
							title: '📝 Recording transcribed and copied to clipboard!',
							description: text,
							descriptionClass: 'line-clamp-2',
							action: {
								type: 'link',
								label: 'Go to recordings',
								goto: WHISPERING_RECORDINGS_PATHNAME,
							},
						});
						toast.warning({
							title: '⚠️ Paste Operation Failed',
							description:
								'Text was copied to clipboard but could not be pasted automatically. Please use Ctrl+V (Cmd+V on Mac) to paste manually.',
							action: { type: 'more-details', error: error },
						});
						return;
					case 'transcribedAndCopiedAndPasted':
						toast.success({
							id: toastId,
							title:
								'📝📋✍️ Recording transcribed, copied to clipboard, and pasted!',
							description: text,
							descriptionClass: 'line-clamp-2',
							action: {
								type: 'link',
								label: 'Go to recordings',
								goto: WHISPERING_RECORDINGS_PATHNAME,
							},
						});
						return;
				}
			},
		})),
	};
}
