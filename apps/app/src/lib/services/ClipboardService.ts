import type { WhisperingError, WhisperingErrorProperties } from '@repo/shared';
import type { Effect } from 'effect';
import { Context, Data } from 'effect';

export class ClipboardError extends Data.TaggedError('ClipboardError')<WhisperingErrorProperties> {}

export class ClipboardService extends Context.Tag('ClipboardService')<
	ClipboardService,
	{
		/**
		 * Writes text to the user's clipboard.
		 * @param text The text to write to the clipboard.
		 */
		readonly setClipboardText: (
			text: string,
		) => Effect.Effect<void, WhisperingError | ClipboardError>;
		/**
		 * Pastes text from the user's clipboard.
		 * - Web: No need to implement this function.
		 * - Desktop: This function should trigger a paste action, as if the user had pressed `Ctrl` + `V`.
		 * - Mobile: This function should trigger a paste action, as if the user had pressed `Paste` in the context menu.
		 */
		readonly writeText: (text: string) => Effect.Effect<void, WhisperingError | ClipboardError>;
	}
>() {}
