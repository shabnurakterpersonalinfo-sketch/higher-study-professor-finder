'use client';

import { TransactionsTable } from '@/components/transactions-table';
import { PageHeader } from '@/components/ui';

export default function AdminTransactionsPage() {
  return (
    <div>
      <PageHeader title="Reconcile payments" subtitle="Resolve failed or pending bKash/Nagad payments, and record offline payments. every action is logged." />
      <TransactionsTable endpoint="/admin/transactions" defaultStatus="FAILED" canReconcile />
    </div>
  );
}
