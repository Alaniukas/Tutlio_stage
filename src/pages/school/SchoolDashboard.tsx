import { useEffect, useState } from 'react';
import SchoolLayout from '@/components/SchoolLayout';
import { supabase } from '@/lib/supabase';
import { Users, FileText, CreditCard, CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { Link } from 'react-router-dom';

interface Stats {
  totalStudents: number;
  registeredStudents: number;
  pendingStudents: number;
  totalContracts: number;
  signedContracts: number;
  draftContracts: number;
  totalInstallments: number;
  paidInstallments: number;
  pendingInstallments: number;
  totalPaidAmount: number;
  totalDueAmount: number;
}

const defaultStats: Stats = {
  totalStudents: 0, registeredStudents: 0, pendingStudents: 0,
  totalContracts: 0, signedContracts: 0, draftContracts: 0,
  totalInstallments: 0, paidInstallments: 0, pendingInstallments: 0,
  totalPaidAmount: 0, totalDueAmount: 0,
};

export default function SchoolDashboard() {
  const [loading, setLoading] = useState(true);
  const [schoolName, setSchoolName] = useState('');
  const [stats, setStats] = useState<Stats>(defaultStats);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data: admin } = await supabase
      .from('school_admins')
      .select('school_id, schools(name)')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!admin?.school_id) { setLoading(false); return; }
    setSchoolName((admin.schools as any)?.name || '');

    const [studentsRes, contractsRes, installmentsRes] = await Promise.all([
      supabase.from('students').select('id, linked_user_id, invite_code').eq('school_id', admin.school_id),
      supabase.from('school_contracts').select('id, signing_status').eq('school_id', admin.school_id),
      supabase.from('school_payment_installments').select('id, amount, payment_status, contract:school_contracts!inner(school_id)'),
    ]);

    const students = studentsRes.data || [];
    const contracts = contractsRes.data || [];
    const allInstallments = (installmentsRes.data || []).filter((i: any) => i.contract?.school_id === admin.school_id);

    setStats({
      totalStudents: students.length,
      registeredStudents: students.filter((s) => s.linked_user_id).length,
      pendingStudents: students.filter((s) => !s.linked_user_id).length,
      totalContracts: contracts.length,
      signedContracts: contracts.filter((c) => c.signing_status === 'signed').length,
      draftContracts: contracts.filter((c) => c.signing_status === 'draft').length,
      totalInstallments: allInstallments.length,
      paidInstallments: allInstallments.filter((i: any) => i.payment_status === 'paid').length,
      pendingInstallments: allInstallments.filter((i: any) => i.payment_status === 'pending').length,
      totalPaidAmount: allInstallments.filter((i: any) => i.payment_status === 'paid').reduce((s: number, i: any) => s + Number(i.amount), 0),
      totalDueAmount: allInstallments.reduce((s: number, i: any) => s + Number(i.amount), 0),
    });
    setLoading(false);
  };

  const cards = [
    {
      label: 'Students',
      value: stats.totalStudents,
      sub: `${stats.registeredStudents} registered, ${stats.pendingStudents} pending`,
      icon: <Users className="w-5 h-5" />,
      iconBg: 'bg-emerald-100',
      iconColor: 'text-emerald-600',
      href: '/school/students',
    },
    {
      label: 'Contracts',
      value: stats.totalContracts,
      sub: `${stats.signedContracts} signed, ${stats.draftContracts} draft`,
      icon: <FileText className="w-5 h-5" />,
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
      href: '/school/contracts',
    },
    {
      label: 'Payments',
      value: `${stats.paidInstallments}/${stats.totalInstallments}`,
      sub: `€${stats.totalPaidAmount.toFixed(2)} of €${stats.totalDueAmount.toFixed(2)} collected`,
      icon: <CreditCard className="w-5 h-5" />,
      iconBg: 'bg-violet-100',
      iconColor: 'text-violet-600',
      href: '/school/payments',
    },
  ];

  return (
    <SchoolLayout>
      <div className="max-w-5xl mx-auto space-y-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Welcome back{schoolName ? `, ${schoolName}` : ''}</h1>
          <p className="text-sm text-gray-500 mt-1">Here&apos;s an overview of your school&apos;s status.</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {cards.map((card) => (
                <Link
                  key={card.label}
                  to={card.href}
                  className="bg-white rounded-xl border border-gray-200 p-5 hover:border-emerald-300 hover:shadow-sm transition-all"
                >
                  <div className="flex items-center gap-3 mb-3">
                    <div className={`w-10 h-10 rounded-xl ${card.iconBg} ${card.iconColor} flex items-center justify-center`}>
                      {card.icon}
                    </div>
                    <p className="text-sm font-medium text-gray-500">{card.label}</p>
                  </div>
                  <p className="text-2xl font-bold text-gray-900">{card.value}</p>
                  <p className="text-sm text-gray-500 mt-1">{card.sub}</p>
                </Link>
              ))}
            </div>

            {/* Quick status */}
            <div className="bg-white rounded-xl border border-gray-200 p-5">
              <h2 className="font-semibold text-gray-900 mb-4">Quick Status</h2>
              <div className="space-y-3">
                {stats.draftContracts > 0 && (
                  <div className="flex items-center gap-3 text-sm">
                    <Clock className="w-4 h-4 text-amber-500" />
                    <span className="text-gray-700"><strong>{stats.draftContracts}</strong> contract{stats.draftContracts !== 1 ? 's' : ''} still in draft — <Link to="/school/contracts" className="text-emerald-600 hover:underline">send them</Link></span>
                  </div>
                )}
                {stats.pendingInstallments > 0 && (
                  <div className="flex items-center gap-3 text-sm">
                    <AlertCircle className="w-4 h-4 text-red-500" />
                    <span className="text-gray-700"><strong>{stats.pendingInstallments}</strong> installment{stats.pendingInstallments !== 1 ? 's' : ''} awaiting payment — <Link to="/school/payments" className="text-emerald-600 hover:underline">manage</Link></span>
                  </div>
                )}
                {stats.pendingStudents > 0 && (
                  <div className="flex items-center gap-3 text-sm">
                    <Users className="w-4 h-4 text-blue-500" />
                    <span className="text-gray-700"><strong>{stats.pendingStudents}</strong> student{stats.pendingStudents !== 1 ? 's' : ''} not yet registered on platform</span>
                  </div>
                )}
                {stats.draftContracts === 0 && stats.pendingInstallments === 0 && stats.pendingStudents === 0 && (
                  <div className="flex items-center gap-3 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-500" />
                    <span className="text-gray-700">Everything looks good!</span>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </SchoolLayout>
  );
}
