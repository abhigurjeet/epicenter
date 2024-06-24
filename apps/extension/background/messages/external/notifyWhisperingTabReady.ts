import type { PlasmoMessaging } from '@plasmohq/messaging';
import type { ExternalMessage, ExternalMessageNameToReturnType, Result } from '@repo/shared';
import { effectToResult } from '@repo/shared';
import { Effect } from 'effect';
import { renderErrorAsNotification } from '~lib/errors';
import { NotificationServiceBgswLive } from '~lib/services/NotificationServiceBgswLive';

export type RequestBody = Extract<
	ExternalMessage,
	{ name: 'external/notifyWhisperingTabReady' }
>['body'];

export type ResponseBody = Result<
	ExternalMessageNameToReturnType['external/notifyWhisperingTabReady']
>;

const handler: PlasmoMessaging.MessageHandler<RequestBody, ResponseBody> = ({ body }, res) =>
	Effect.gen(function* () {}).pipe(
		Effect.tapError(renderErrorAsNotification),
		Effect.provide(NotificationServiceBgswLive),
		effectToResult,
		Effect.map(res.send),
		Effect.runPromise,
	);

export default handler;
