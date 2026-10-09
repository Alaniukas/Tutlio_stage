export type StaffDocumentPreview = {
  documentType: 'confidentiality' | 'consent';
  pdfUrl: string | null;
  isDraft: boolean;
  sections: Array<{
    kind: 'confidentiality' | 'annex' | 'consent';
    text: string;
  }>;
};
