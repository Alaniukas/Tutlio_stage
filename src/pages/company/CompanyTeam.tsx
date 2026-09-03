import { useEffect, useMemo, useState } from 'react';
import { Check, Crown, Pencil, ShieldCheck, Trash2, UserPlus, UserRoundCheck, UserRoundX } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useTranslation } from '@/lib/i18n';
import { useOrgAdminAccess } from '@/contexts/OrgAdminAccessContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import Toast from '@/components/Toast';
import {
  ORG_ADMIN_PERMISSION_GROUPS,
  normalizeOrgAdminPermissions,
  permissionGroupsForTeamManager,
  permissionsForRole,
  roleLabelKey,
  type OrgAdminPermission,
  type OrgAdminPermissionMap,
  type OrgAdminRole,
  type OrgAdminStatus,
} from '@/lib/orgAdminPermissions';

interface TeamMember {
  id: string;
  userId: string;
  fullName: string;
  email: string;
  role: OrgAdminRole;
  status: OrgAdminStatus;
  permissions: OrgAdminPermissionMap;
  acceptedAt: string | null;
  createdAt: string;
}

type ManagedRole = Exclude<OrgAdminRole, 'owner'>;

async function callMembersApi(method: 'GET' | 'POST', body?: Record<string, unknown>) {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Not authenticated');
  const response = await fetch('/api/org-admin-members', {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload?.error || 'Request failed');
  return payload as { members?: TeamMember[]; currentUserId?: string };
}

export default function CompanyTeam() {
  const { t } = useTranslation();
  const { membership, refresh, isOwner, can } = useOrgAdminAccess();
  const seesPeerOwners = isOwner && can('finance.totals');
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<TeamMember | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<ManagedRole>('admin');
  const [permissions, setPermissions] = useState<OrgAdminPermissionMap>(() => permissionsForRole('admin'));
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const canViewTeam = can('team.view');

  useEffect(() => {
    let active = true;

    const load = async () => {
      if (!canViewTeam) {
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        const payload = await callMembersApi('GET');
        if (active) setMembers(payload.members || []);
      } catch (error: any) {
        if (active) setToast({ message: error?.message || t('orgTeam.loadError'), type: 'error' });
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
    };
  }, [canViewTeam, t]);

  const permissionGroups = useMemo(
    () => permissionGroupsForTeamManager(isOwner),
    [isOwner],
  );

  const sortedMembers = useMemo(() => [...members]
    .filter((member) => seesPeerOwners || member.role !== 'owner' || member.userId === membership?.userId)
    .sort((a, b) => {
      if (a.role === 'owner') return -1;
      if (b.role === 'owner') return 1;
      return a.fullName.localeCompare(b.fullName);
    }), [members, membership?.userId, seesPeerOwners]);

  const openInvite = () => {
    setEditing(null);
    setFullName('');
    setEmail('');
    setRole('admin');
    setPermissions(permissionsForRole('admin'));
    setDialogOpen(true);
  };

  const openEdit = (member: TeamMember) => {
    if (member.role === 'owner') return;
    setEditing(member);
    setFullName(member.fullName);
    setEmail(member.email);
    setRole(member.role);
    setPermissions(normalizeOrgAdminPermissions(member.permissions));
    setDialogOpen(true);
  };

  const changeRole = (next: ManagedRole) => {
    setRole(next);
    setPermissions(permissionsForRole(next, next === 'custom' ? permissions : {}));
  };

  const togglePermission = (permission: OrgAdminPermission, checked: boolean) => {
    setRole('custom');
    setPermissions((current) => {
      const next = { ...current, [permission]: checked };
      const group = ORG_ADMIN_PERMISSION_GROUPS.find((item) => item.view === permission || item.edit === permission);
      if (group?.edit === permission && checked) next[group.view] = true;
      if (group?.view === permission && !checked && group.edit) next[group.edit] = false;
      return normalizeOrgAdminPermissions(next);
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      const payload = await callMembersApi('POST', editing
        ? { action: 'update', memberId: editing.id, role, permissions }
        : { action: 'invite', fullName, email, role, permissions });
      setMembers(payload.members || []);
      setDialogOpen(false);
      setToast({ message: editing ? t('orgTeam.updated') : t('orgTeam.invited'), type: 'success' });
    } catch (error: any) {
      setToast({ message: error?.message || t('orgTeam.saveError'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const memberAction = async (member: TeamMember, action: 'set_status' | 'remove' | 'transfer_owner') => {
    const confirmation = action === 'remove'
      ? t('orgTeam.confirmRemove')
      : action === 'transfer_owner'
        ? t('orgTeam.confirmTransfer')
        : null;
    if (confirmation && !window.confirm(confirmation)) return;
    setSaving(true);
    try {
      const payload = await callMembersApi('POST', {
        action,
        memberId: member.id,
        ...(action === 'set_status' ? { status: member.status === 'active' ? 'suspended' : 'active' } : {}),
      });
      setMembers(payload.members || []);
      if (action === 'transfer_owner') await refresh();
      setToast({ message: t('orgTeam.actionDone'), type: 'success' });
    } catch (error: any) {
      setToast({ message: error?.message || t('orgTeam.saveError'), type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
            <ShieldCheck className="h-6 w-6 text-indigo-600" />
            {t('orgTeam.title')}
          </h1>
          <p className="mt-1 text-sm text-gray-500">{t('orgTeam.subtitle')}</p>
        </div>
        <Button onClick={openInvite} disabled={!can('team.edit')} className="gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700">
          <UserPlus className="h-4 w-4" />
          {t('orgTeam.invite')}
        </Button>
      </div>

      <div className="rounded-2xl border border-indigo-100 bg-indigo-50 px-5 py-4 text-sm text-indigo-900">
        {t('orgTeam.unlimitedSeats')}
      </div>

      {loading ? (
        <div className="flex min-h-48 items-center justify-center rounded-2xl border border-gray-200 bg-white">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="divide-y divide-gray-100">
            {sortedMembers.map((member) => {
              const owner = member.role === 'owner';
              const pending = !member.acceptedAt;
              return (
                <div key={member.id} className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-full bg-slate-100 font-semibold text-slate-700">
                      {(member.fullName || member.email || '?').slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate font-semibold text-gray-900">{member.fullName || member.email}</p>
                        {owner && <Crown className="h-4 w-4 text-amber-500" />}
                        {member.userId === membership?.userId && (
                          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">{t('orgTeam.you')}</span>
                        )}
                      </div>
                      <p className="truncate text-sm text-gray-500">{member.email}</p>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 lg:w-72">
                    <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
                      {t(roleLabelKey(member.role))}
                    </span>
                    <span className={`rounded-full px-3 py-1 text-xs font-medium ${
                      member.status === 'suspended'
                        ? 'bg-red-50 text-red-700'
                        : pending
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-emerald-50 text-emerald-700'
                    }`}>
                      {member.status === 'suspended'
                        ? t('orgTeam.suspended')
                        : pending
                          ? t('orgTeam.pending')
                          : t('orgTeam.active')}
                    </span>
                  </div>

                  {!owner && can('team.edit') && (
                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <Button variant="outline" size="sm" onClick={() => openEdit(member)} disabled={saving} className="gap-1.5">
                        <Pencil className="h-3.5 w-3.5" /> {t('common.edit')}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => void memberAction(member, 'set_status')} disabled={saving} className="gap-1.5">
                        {member.status === 'active' ? <UserRoundX className="h-3.5 w-3.5" /> : <UserRoundCheck className="h-3.5 w-3.5" />}
                        {member.status === 'active' ? t('orgTeam.suspend') : t('orgTeam.activate')}
                      </Button>
                      {member.acceptedAt && seesPeerOwners && (
                        <Button variant="outline" size="sm" onClick={() => void memberAction(member, 'transfer_owner')} disabled={saving} className="gap-1.5">
                          <Crown className="h-3.5 w-3.5" /> {t('orgTeam.transfer')}
                        </Button>
                      )}
                      {isOwner && (
                        <Button variant="outline" size="sm" onClick={() => void memberAction(member, 'remove')} disabled={saving} className="gap-1.5 text-red-600 hover:text-red-700">
                          <Trash2 className="h-3.5 w-3.5" /> {t('common.delete')}
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? t('orgTeam.editSeat') : t('orgTeam.inviteSeat')}</DialogTitle>
          </DialogHeader>

          <div className="space-y-5 py-2">
            {!editing && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="team-name">{t('common.name')}</Label>
                  <Input id="team-name" value={fullName} onChange={(event) => setFullName(event.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="team-email">{t('common.email')}</Label>
                  <Input id="team-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>{t('orgTeam.roleLabel')}</Label>
              <Select value={role} onValueChange={(value) => changeRole(value as ManagedRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">{t('orgTeam.role.admin')}</SelectItem>
                  <SelectItem value="accountant">{t('orgTeam.role.accountant')}</SelectItem>
                  <SelectItem value="custom">{t('orgTeam.role.custom')}</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500">{t(`orgTeam.roleDescription.${role}`)}</p>
            </div>

            <div className="space-y-3">
              <div>
                <Label>{t('orgTeam.permissions')}</Label>
                <p className="mt-1 text-xs text-gray-500">{t('orgTeam.permissionsHint')}</p>
              </div>
              <div className="overflow-hidden rounded-xl border border-gray-200">
                <div className="grid grid-cols-[1fr_90px_90px] bg-gray-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <span>{t('orgTeam.area')}</span>
                  <span className="text-center">{t('orgTeam.view')}</span>
                  <span className="text-center">{t('orgTeam.edit')}</span>
                </div>
                {permissionGroups.map((group) => (
                  <div key={group.id} className="grid grid-cols-[1fr_90px_90px] items-center border-t border-gray-100 px-4 py-3 text-sm">
                    <span className="font-medium text-gray-800">{t(group.labelKey)}</span>
                    <label className="flex justify-center">
                      <Checkbox
                        checked={permissions[group.view] === true}
                        onChange={(event) => togglePermission(group.view, event.target.checked)}
                        aria-label={`${t(group.labelKey)} ${t('orgTeam.view')}`}
                      />
                    </label>
                    <label className="flex justify-center">
                      {group.edit ? (
                        <Checkbox
                          checked={permissions[group.edit] === true}
                          onChange={(event) => togglePermission(group.edit!, event.target.checked)}
                          aria-label={`${t(group.labelKey)} ${t('orgTeam.edit')}`}
                        />
                      ) : (
                        <Check className="h-4 w-4 text-gray-300" />
                      )}
                    </label>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('common.cancel')}</Button>
            <Button
              onClick={() => void save()}
              disabled={saving || (!editing && (!fullName.trim() || !email.trim()))}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {saving ? t('common.saving') : editing ? t('common.save') : t('orgTeam.sendInvite')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
    </div>
  );
}
