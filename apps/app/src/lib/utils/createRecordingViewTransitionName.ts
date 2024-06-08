import type { Recording } from '$lib/services/RecordingDbService';

export function createRecordingViewTransitionName({
	recordingId,
	propertyName,
}: {
	recordingId: Recording['id'];
	propertyName: keyof Recording;
}): string {
	return `recording-${recordingId}-${propertyName}`;
}
