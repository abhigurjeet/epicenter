import { Err, Ok, tryAsync, trySync } from '@epicenterhq/result';
import { WhisperingError, type VadState } from '@repo/shared';
import { MicVAD, utils } from '@ricky0123/vad-web';

export function createVadServiceWeb() {
	let maybeVad: MicVAD | null = null;
	let vadState: VadState = 'IDLE';

	return {
		getVadState: (): VadState => {
			return vadState;
		},
		initializeVad: async ({
			onSpeechStart,
			onSpeechEnd,
			deviceId,
		}: {
			onSpeechStart: () => void;
			onSpeechEnd: (blob: Blob) => void;
			deviceId: string | null;
		}) => {
			if (maybeVad) return Ok(maybeVad);
			const { data: newVad, error: initializeVadError } = await tryAsync({
				try: () =>
					MicVAD.new({
						additionalAudioConstraints: deviceId ? { deviceId } : undefined,
						submitUserSpeechOnPause: true,
						onSpeechStart: () => {
							vadState = 'SPEECH_DETECTED';
							onSpeechStart();
						},
						onSpeechEnd: (audio) => {
							vadState = 'LISTENING';
							const wavBuffer = utils.encodeWAV(audio);
							const blob = new Blob([wavBuffer], { type: 'audio/wav' });
							onSpeechEnd(blob);
						},
						onVADMisfire: () => {
							console.log('VAD misfire');
						},
						model: 'v5',
					}),
				mapError: (error) => ({
					name: 'WhisperingError',
					title: '❌ Failed to start voice activated capture',
					description: 'Your voice activated capture could not be started.',
					context: {},
					cause: error,
				}),
			});
			if (initializeVadError) return Err(initializeVadError);
			maybeVad = newVad;
			return Ok(maybeVad);
		},
		destroyVad: async () => {
			if (!maybeVad) return Ok(undefined);
			const vad = maybeVad;
			const { error: destroyError } = trySync({
				try: () => vad.destroy(),
				mapError: (error) =>
					WhisperingError({
						title: 'Failed to destroy Voice Activity Detector',
						description:
							error instanceof Error ? error.message : 'Failed to destroy VAD',
						context: {},
						cause: error,
					}),
			});
			if (destroyError) return Err(destroyError);
			maybeVad = null;
			vadState = 'IDLE';
			return Ok(undefined);
		},
		startListening: async () => {
			if (!maybeVad)
				return Err(
					WhisperingError({
						title: 'Voice Activity Detector not initialized',
						description:
							'The voice activity detector has not been initialized. Please ensure that the VAD is initialized before starting it.',
						context: {},
						cause: new Error('VAD not initialized'),
					}),
				);
			const vad = maybeVad;
			const { error: startError } = trySync({
				try: () => vad.start(),
				mapError: (error) =>
					WhisperingError({
						title: 'Failed to start Voice Activity Detector',
						description:
							error instanceof Error
								? error.message
								: 'An unknown error occurred while starting the VAD.',
						context: {},
						cause: error,
					}),
			});
			if (startError) return Err(startError);
			vadState = 'LISTENING';
			return Ok(undefined);
		},
		stopListening: async () => {
			if (!maybeVad)
				return Err(
					WhisperingError({
						title: 'Voice Activity Detector not initialized',
						description: 'VAD not initialized',
						context: {},
						cause: new Error('VAD not initialized'),
					}),
				);
			const vad = maybeVad;
			const { error: pauseError } = trySync({
				try: () => vad.pause(),
				mapError: (error) =>
					WhisperingError({
						title: 'Failed to pause Voice Activity Detector',
						description:
							error instanceof Error
								? error.message
								: 'An unknown error occurred while pausing the VAD.',
						context: {},
						cause: error,
					}),
			});
			if (pauseError) return Err(pauseError);
			vadState = 'IDLE';
			return Ok(undefined);
		},
	};
}
