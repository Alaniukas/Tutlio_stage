import React from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import CompanyInvoices from '@/pages/company/CompanyInvoices';
import CompanyStudents from '@/pages/company/CompanyStudents';
import CompanyTutors from '@/pages/company/CompanyTutors';
import Students from '@/pages/Students';
import SchoolExtraLessonsAccept from '@/pages/SchoolExtraLessonsAccept';
import { schoolPreview } from './school-preview';
import './style.css';
import { loadLocaleDict } from '@/lib/i18n';
const view = new URLSearchParams(location.search).get('view');
const Page = view === 'school-accept' ? SchoolExtraLessonsAccept : view === 'students' ? CompanyStudents : view === 'tutors' ? CompanyTutors : view === 'tutor-students' ? Students : CompanyInvoices;
if (view === 'school-accept') window.fetch = async () => new Response(JSON.stringify({ ...schoolPreview, pdfUrl: null }), { headers: { 'Content-Type': 'application/json' } });
await loadLocaleDict('lt');
createRoot(document.getElementById('root')!).render(<MemoryRouter initialEntries={[view === 'school-accept' ? '/school-extra-lessons-accept?token=legalqawithin14aaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' : view === 'tutor-students' ? '/students' : '/company/' + (view || 'invoices')]}><div className="min-h-screen bg-slate-50 p-4 sm:p-8">
  <p className="mb-4 text-sm text-slate-600">PRO klasė · Vietinė QA aplinka · Testiniai duomenys</p>
  <nav className="flex flex-wrap gap-4 mb-6"><a href="?view=students">Mokiniai</a><a href="?view=tutors">Korepetitoriai</a><a href="?view=invoices">Sąskaitos</a><a href="?view=tutor-students">Korepetitoriaus mokiniai</a></nav>
  <Page />
</div></MemoryRouter>);
