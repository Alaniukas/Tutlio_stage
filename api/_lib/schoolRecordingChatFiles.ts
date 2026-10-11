import type { DriveRecordingFile } from './googleDriveRecordings.js';
import type { RecordingChatStatus } from '../../src/lib/schoolLessonRecordings.js';

export function recordingChatStatus(recording: DriveRecordingFile): RecordingChatStatus {
  if (recording.chatFiles?.length) return 'available';
  // A publication policy may remove readable chats from a legacy homework
  // link. Do not claim those chats are still available to that viewer.
  return recording.chatStatus === 'available' ? 'missing' : recording.chatStatus || 'missing';
}

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
