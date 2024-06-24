import { Schema as S } from '@effect/schema';
import type { Effect } from 'effect';
import { Context } from 'effect';

export const notificationOptionsSchema = S.Struct({
	id: S.optional(S.String),
	title: S.String,
	description: S.String,
	action: S.optional(
		S.Struct({
			label: S.String,
			goto: S.String,
		}),
	),
});

type NotificationOptions = S.Schema.Type<typeof notificationOptionsSchema>;

export class NotificationService extends Context.Tag('NotificationService')<
	NotificationService,
	{
		notify: (options: NotificationOptions) => Effect.Effect<string>;
		clear: (id: string) => Effect.Effect<void>;
	}
>() {}
