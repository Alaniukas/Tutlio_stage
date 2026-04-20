import { useState, useEffect } from 'react';
import SchoolLayout from '@/components/SchoolLayout';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Plus, Trash2, User, Mail, Phone, Search, CheckCircle, XCircle, Copy, Check } from 'lucide-react';
import Toast from '@/components/Toast';
import { useTranslation } from '@/lib/i18n';

interface Student {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  invite_code: string | null;
  linked_user_id: string | null;
  school_id: string | null;
  payer_name: string | null;
  payer_email: string | null;
  payer_phone: string | null;
  created_at: string;
}

interface NewStudentForm {
  full_name: string;
  email: string;
  phone: string;
  payer_name: string;
  payer_email: string;
  payer_phone: string;
}

const emptyForm: NewStudentForm = {
  full_name: '',
  email: '',
  phone: '',
  payer_name: '',
  payer_email: '',
  payer_phone: '',
};

export default function SchoolStudents() {
  const { t } = useTranslation();
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState<NewStudentForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);

  useEffect(() => {
    loadStudents();
  }, []);

  const loadStudents = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: admin } = await supabase
      .from('school_admins')
      .select('school_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!admin?.school_id) { setLoading(false); return; }
    setSchoolId(admin.school_id);

    const { data, error } = await supabase
      .from('students')
      .select('id, full_name, email, phone, invite_code, linked_user_id, school_id, payer_name, payer_email, payer_phone, created_at')
      .eq('school_id', admin.school_id)
      .order('created_at', { ascending: false });

    if (error) console.error('Error loading students:', error);
    setStudents(data || []);
    setLoading(false);
  };

  const handleAdd = async () => {
    if (!schoolId || !form.full_name.trim()) return;
    setSaving(true);

    const { data, error } = await supabase
      .from('students')
      .insert({
        full_name: form.full_name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        payer_name: form.payer_name.trim() || null,
        payer_email: form.payer_email.trim() || null,
        payer_phone: form.payer_phone.trim() || null,
        school_id: schoolId,
        payment_payer: form.payer_email.trim() ? 'parent' : 'self',
      })
      .select()
      .single();

    setSaving(false);
    if (error) {
      setToast({ message: t('school.toastError', { msg: error.message }), type: 'error' });
      return;
    }

    setStudents((prev) => [data, ...prev]);
    setForm(emptyForm);
    setAddOpen(false);
    setToast({ message: t('school.toastStudentAdded'), type: 'success' });
  };

  const handleDelete = async (id: string) => {
    if (!confirm(t('school.confirmDeleteStudent'))) return;
    const { error } = await supabase.from('students').delete().eq('id', id);
    if (error) {
      setToast({ message: t('school.toastError', { msg: error.message }), type: 'error' });
      return;
    }
    setStudents((prev) => prev.filter((s) => s.id !== id));
    if (selectedStudent?.id === id) setSelectedStudent(null);
    setToast({ message: t('school.toastStudentRemoved'), type: 'success' });
  };

  const copyInviteCode = (code: string, studentId: string) => {
    const url = `${window.location.origin}/book/${code}`;
    navigator.clipboard.writeText(url);
    setCopiedId(studentId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filtered = students.filter((s) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      s.full_name.toLowerCase().includes(q) ||
      (s.email || '').toLowerCase().includes(q) ||
      (s.payer_email || '').toLowerCase().includes(q)
    );
  });

  return (
    <SchoolLayout>
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">{t('school.studentsTitle')}</h1>
            <p className="text-sm text-gray-500 mt-1">{t('school.studentsCount', { n: students.length })}</p>
          </div>
          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button className="bg-emerald-600 hover:bg-emerald-700">
                <Plus className="w-4 h-4 mr-2" /> {t('school.addStudent')}
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{t('school.addStudentTitle')}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>{t('school.studentName')}</Label>
                  <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} placeholder="Jonas Jonaitis" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label>{t('school.studentEmail')}</Label>
                    <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="student@email.com" />
                  </div>
                  <div className="space-y-2">
                    <Label>{t('school.studentPhone')}</Label>
                    <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+370..." />
                  </div>
                </div>
                <div className="border-t pt-4">
                  <p className="text-sm font-medium text-gray-700 mb-3">{t('school.parentSection')}</p>
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label>{t('school.parentName')}</Label>
                      <Input value={form.payer_name} onChange={(e) => setForm({ ...form, payer_name: e.target.value })} placeholder="Vardas Pavardė" />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>{t('school.parentEmail')}</Label>
                        <Input type="email" value={form.payer_email} onChange={(e) => setForm({ ...form, payer_email: e.target.value })} placeholder="parent@email.com" />
                      </div>
                      <div className="space-y-2">
                        <Label>{t('school.parentPhone')}</Label>
                        <Input value={form.payer_phone} onChange={(e) => setForm({ ...form, payer_phone: e.target.value })} placeholder="+370..." />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddOpen(false)}>{t('school.cancel')}</Button>
                <Button onClick={handleAdd} disabled={saving || !form.full_name.trim()} className="bg-emerald-600 hover:bg-emerald-700">
                  {saving ? t('school.adding') : t('school.addStudent')}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('school.searchStudents')}
            className="pl-10"
          />
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-20">
            <User className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">
              {search ? t('school.noStudentsSearch') : t('school.noStudents')}
            </p>
          </div>
        ) : (
          <div className="grid gap-3">
            {filtered.map((student) => {
              const isCopied = copiedId === student.id;
              const initials = student.full_name.split(' ').map((n) => n[0]).join('').toUpperCase().slice(0, 2);

              return (
                <div
                  key={student.id}
                  onClick={() => setSelectedStudent(student)}
                  className="bg-white rounded-xl border border-gray-200 p-4 hover:border-emerald-300 hover:shadow-sm transition-all cursor-pointer"
                >
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-sm flex-shrink-0">
                      {initials}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-gray-900">{student.full_name}</p>
                        {student.linked_user_id ? (
                          <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                            <CheckCircle className="w-3 h-3" /> {t('school.statusRegistered')}
                          </span>
                        ) : student.invite_code ? (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                            {t('school.statusInviteSent')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                            <XCircle className="w-3 h-3" /> {t('school.statusPending')}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
                        {student.email && (
                          <span className="flex items-center gap-1 truncate">
                            <Mail className="w-3.5 h-3.5" /> {student.email}
                          </span>
                        )}
                        {student.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3.5 h-3.5" /> {student.phone}
                          </span>
                        )}
                      </div>
                      {student.payer_name && (
                        <p className="text-xs text-gray-400 mt-1">
                          {t('school.payerLine', {
                            name: student.payer_name,
                            extra: student.payer_email ? ` (${student.payer_email})` : '',
                          })}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {student.invite_code && (
                        <button
                          onClick={(e) => { e.stopPropagation(); copyInviteCode(student.invite_code!, student.id); }}
                          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                            isCopied
                              ? 'bg-green-50 border-green-200 text-green-700'
                              : 'bg-white border-gray-200 text-gray-600 hover:border-emerald-300 hover:text-emerald-600'
                          }`}
                        >
                          {isCopied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                          {isCopied ? t('school.copied') : student.invite_code}
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(student.id); }}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Student detail dialog */}
      <Dialog open={!!selectedStudent} onOpenChange={(open) => { if (!open) setSelectedStudent(null); }}>
        <DialogContent className="max-w-lg">
          {selectedStudent && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedStudent.full_name}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-gray-400 mb-1">{t('common.email')}</p>
                    <p className="text-sm font-medium text-gray-900">{selectedStudent.email || '---'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-400 mb-1">{t('common.phone')}</p>
                    <p className="text-sm font-medium text-gray-900">{selectedStudent.phone || '---'}</p>
                  </div>
                </div>
                {(selectedStudent.payer_name || selectedStudent.payer_email) && (
                  <div className="bg-gray-50 rounded-xl p-4 border border-gray-100">
                    <p className="text-xs text-gray-500 font-medium mb-2">{t('school.detailParent')}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-xs text-gray-400">{t('common.name')}</p>
                        <p className="text-sm font-medium">{selectedStudent.payer_name || '---'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">{t('common.email')}</p>
                        <p className="text-sm font-medium">{selectedStudent.payer_email || '---'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-400">{t('common.phone')}</p>
                        <p className="text-sm font-medium">{selectedStudent.payer_phone || '---'}</p>
                      </div>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <p className="text-xs text-gray-400">{t('school.detailStatus')}</p>
                  {selectedStudent.linked_user_id ? (
                    <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                      <CheckCircle className="w-3 h-3" /> {t('school.detailRegisteredPlatform')}
                    </span>
                  ) : selectedStudent.invite_code ? (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                      {t('school.detailInviteCode', { code: selectedStudent.invite_code })}
                    </span>
                  ) : (
                    <span className="text-xs text-gray-500">{t('school.detailAwaiting')}</span>
                  )}
                </div>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </SchoolLayout>
  );
}
