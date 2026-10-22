'use client';

import { TransactionsTable } from '@/components/transactions-table';
import { PageHeader } from '@/components/ui';

export default function SuperAdminTransactionsPage() {
  return (
    <div>
      <PageHeader title="Transaction history" subtitle="Every payment across the platform, filterable by status, gateway and date." />
      <TransactionsTable endpoint="/superadmin/transactions" canReconcile />
    </div>
  );
}
