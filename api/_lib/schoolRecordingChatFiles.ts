import type { DriveRecordingFile } from './googleDriveRecordings.js';

export function recordingChatFiles(
  recording: DriveRecordingFile,
  createTicket: (values: { fileId: string; recordingFileId: string }) => string,
): Array<{ id: string; name: string; streamUrl: string }> {
  return (recording.chatFiles || []).map((file) => ({
    id: file.id,
    name: file.name,
    streamUrl: `/api/school-lesson-recording-stream?t=${encodeURIComponent(createTicket({
      fileId: file.id,
      recordingFileId: recording.id,
    }))}`,
  }));
}
