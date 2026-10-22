'use client';

import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Avatar, Badge, Card, ErrorNote, Input, PageHeader, Pagination, Select, Spinner } from '@/components/ui';
import { api, ApiError, qs, useApi } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { fmtDate } from '@/lib/format';
import type { Paged, Role } from '@/lib/types';

interface Row {
  id: string;
  email: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
  studentProfile: { fullName: string } | null;
}

const ROLE_LABEL: Record<Role, string> = { GU: 'Student', ADMIN: 'Admin', SUPER_ADMIN: 'Super Admin' };

export default function StaffPage() {
  const { me } = useAuth();
  const [role, setRole] = useState<string>('ADMIN');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const { data, error, loading, reload } = useApi<Paged<Row>>('/admin/users' + qs({ role, q: search, page }));
  const [err, setErr] = useState<ApiError | null>(null);

  useEffect(() => {
    const t = setTimeout(() => (setSearch(q), setPage(1)), 300);
    return () => clearTimeout(t);
  }, [q]);

  const change = async (u: Row, next: Role) => {
    if (!confirm(`Change ${u.email} from ${ROLE_LABEL[u.role]} to ${ROLE_LABEL[next]}?`)) return;
    setErr(null);
    try {
      await api(`/superadmin/users/${u.id}/role`, { method: 'PATCH', json: { role: next } });
      reload();
    } catch (e) {
      setErr(e as ApiError);
    }
  };

  return (
    <div>
      <PageHeader title="Staff & roles" subtitle="Promote students to admin, manage admin privileges. role changes take effect on the user's next request." />
      <div className="mb-5 flex flex-wrap gap-3">
        <Select className="w-48" value={role} onChange={(e) => (setRole(e.target.value), setPage(1))}>
          <option value="ADMIN">Admins</option>
          <option value="SUPER_ADMIN">Super admins</option>
          <option value="GU">Students</option>
          <option value="">Everyone</option>
        </Select>
        <div className="relative w-72">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-ink-faint" />
          <Input className="pl-9" placeholder="Search by email…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <ErrorNote error={error ?? err} />
      <Card className="overflow-hidden">
        {loading && !data ? <Spinner /> : (
          <table className="w-full text-sm">
            <thead className="bg-brand-25 text-left text-[13px] font-medium text-ink-mute"><tr><th className="px-6 py-3">User</th><th className="px-4 py-3">Role</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Joined</th><th className="px-4 py-3">Change role</th></tr></thead>
            <tbody className="divide-y divide-line-soft">
              {data?.items.map((u) => (
                <tr key={u.id}>
                  <td className="px-6 py-3"><div className="flex items-center gap-3"><Avatar name={u.studentProfile?.fullName ?? u.email} size={34} /><div><p className="font-medium">{u.studentProfile?.fullName ?? u.email.split('@')[0]}</p><p className="text-ink-mute">{u.email}</p></div></div></td>
                  <td className="px-4 py-3"><Badge tone={u.role === 'SUPER_ADMIN' ? 'violet' : u.role === 'ADMIN' ? 'indigo' : 'gray'}>{ROLE_LABEL[u.role]}</Badge></td>
                  <td className="px-4 py-3"><Badge tone={u.isActive ? 'green' : 'red'}>{u.isActive ? 'Active' : 'Disabled'}</Badge></td>
                  <td className="px-4 py-3">{fmtDate(u.createdAt)}</td>
                  <td className="px-4 py-3">
                    <Select className="w-44" value={u.role} disabled={u.id === me?.id} onChange={(e) => change(u, e.target.value as Role)}>
                      {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </Select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data && <div className="border-t border-line px-5"><Pagination page={data.page} pageSize={data.pageSize} total={data.total} onPage={setPage} noun="users" /></div>}
      </Card>
    </div>
  );
}
