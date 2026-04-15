import { useRef } from 'react';
import { Paperclip, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslation } from '@/lib/i18n';

interface ChatFileUploadProps {
  onFileSelect: (file: File) => void;
  uploading: boolean;
  disabled?: boolean;
}

const ACCEPTED_TYPES =
  '.pdf,.png,.jpg,.jpeg,.gif,.webp,.doc,.docx,.xlsx,.txt';

export default function ChatFileUpload({ onFileSelect, uploading, disabled }: ChatFileUploadProps) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) onFileSelect(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        accept={ACCEPTED_TYPES}
        onChange={handleChange}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading || disabled}
        className={cn(
          'p-2 rounded-xl text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors',
          (uploading || disabled) && 'opacity-50 cursor-not-allowed',
        )}
        title={t('chat.attachFile')}
      >
        {uploading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <Paperclip className="w-5 h-5" />
        )}
      </button>
    </>
  );
}
