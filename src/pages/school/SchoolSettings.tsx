import { useState, useEffect } from 'react';
import SchoolLayout from '@/components/SchoolLayout';
import { supabase } from '@/lib/supabase';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Settings, Save } from 'lucide-react';
import Toast from '@/components/Toast';

export default function SchoolSettings() {
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: admin } = await supabase
        .from('school_admins')
        .select('school_id, schools(name, email)')
        .eq('user_id', user.id)
        .maybeSingle();

      if (admin?.school_id) {
        setSchoolId(admin.school_id);
        setName((admin.schools as any)?.name || '');
        setEmail((admin.schools as any)?.email || '');
      }
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    if (!schoolId || !name.trim() || !email.trim()) return;
    setSaving(true);

    const { error } = await supabase
      .from('schools')
      .update({ name: name.trim(), email: email.trim() })
      .eq('id', schoolId);

    setSaving(false);
    if (error) {
      setToast({ message: error.message, type: 'error' });
    } else {
      setToast({ message: 'Settings saved', type: 'success' });
    }
  };

  return (
    <SchoolLayout>
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
          <p className="text-sm text-gray-500 mt-1">Manage your school information</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-6 space-y-5">
            <div className="flex items-center gap-3 mb-2">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center">
                <Settings className="w-5 h-5" />
              </div>
              <h2 className="font-semibold text-gray-900">School Information</h2>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>School Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="School name" />
              </div>
              <div className="space-y-2">
                <Label>Contact Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@school.lt" />
              </div>
            </div>

            <Button onClick={handleSave} disabled={saving || !name.trim() || !email.trim()} className="bg-emerald-600 hover:bg-emerald-700">
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        )}
      </div>
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </SchoolLayout>
  );
}
