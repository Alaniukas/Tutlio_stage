import { useTranslation } from '@/lib/i18n';
import type { StaffDocumentPreview } from '@/lib/schoolStaffDocumentPreview';

export default function StaffDocumentPreviewContent({ preview }: { preview: StaffDocumentPreview }) {
  const { t } = useTranslation();
  const title = t(`school.staffPreview.${preview.documentType}`);
  return (
    <div className="space-y-4">
      {preview.isDraft && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">{t('school.staffPreview.draftHint')}</p>}
      {preview.pdfUrl ? (
        <>
          <a href={preview.pdfUrl} target="_blank" rel="noreferrer" className="inline-block text-sm text-indigo-700 underline">{t('school.openPdf')}</a>
          <iframe src={preview.pdfUrl} title={title} className="h-[60dvh] min-h-64 w-full rounded-lg border border-slate-200 bg-white" />
        </>
      ) : preview.sections.map((section) => (
        <section key={section.kind} className="space-y-4">
          <h3 className="font-semibold text-slate-900">{t(`school.staffPreview.${section.kind}`)}</h3>
          {section.text.split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => (
            <p key={index} className="whitespace-pre-line break-words text-sm leading-7 text-slate-800">{paragraph}</p>
          ))}
        </section>
      ))}
    </div>
  );
}
