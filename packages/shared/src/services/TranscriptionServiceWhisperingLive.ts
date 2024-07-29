import { HttpClient, HttpClientRequest, HttpClientResponse } from '@effect/platform';
import { Schema } from '@effect/schema';
import { WhisperingError } from '@repo/shared';
import { Effect, Layer } from 'effect';
import { TranscriptionService } from './TranscriptionService.js';

const MAX_FILE_SIZE_MB = 25 as const;
const FILE_NAME = 'recording.wav';

export const TranscriptionServiceWhisperingLive = Layer.succeed(
	TranscriptionService,
	TranscriptionService.of({
		transcribe: (audioBlob, { apiKey, outputLanguage }) =>
			Effect.gen(function* () {
				if (!apiKey.startsWith('sk-')) {
					return yield* new WhisperingError({
						title: 'Invalid OpenAI API Key',
						description: 'The OpenAI API Key must start with "sk-"',
						action: {
							label: 'Update OpenAI API Key',
							goto: '/settings',
						},
					});
				}
				const blobSizeInMb = audioBlob.size / (1024 * 1024);
				if (blobSizeInMb > MAX_FILE_SIZE_MB) {
					return yield* new WhisperingError({
						title: `The file size (${blobSizeInMb}MB) is too large`,
						description: `Please upload a file smaller than ${MAX_FILE_SIZE_MB}MB.`,
					});
				}
				const wavFile = new File([audioBlob], FILE_NAME);
				const formData = new FormData();
				formData.append('file', wavFile);
				formData.append('model', 'whisper-1');
				if (outputLanguage !== 'auto') formData.append('language', outputLanguage);
				const data = yield* HttpClientRequest.post(
					'https://api.openai.com/v1/audio/transcriptions',
				).pipe(
					HttpClientRequest.setHeaders({
						Authorization: `Bearer ${apiKey}`,
					}),
					HttpClientRequest.formDataBody(formData),
					HttpClient.fetch,
					Effect.andThen(
						HttpClientResponse.schemaBodyJson(
							Schema.Union(
								Schema.Struct({
									text: Schema.String,
								}),
								Schema.Struct({
									error: Schema.Struct({
										message: Schema.String,
									}),
								}),
							),
						),
					),
					Effect.scoped,
					Effect.mapError(
						(error) =>
							new WhisperingError({
								title: 'Error transcribing audio',
								description: error.message,
								error,
							}),
					),
				);
				if ('error' in data) {
					return yield* new WhisperingError({
						title: 'Server error from Whisper API',
						description: data.error.message,
						error: data.error,
					});
				}
				return data.text;
			}),
	}),
);
