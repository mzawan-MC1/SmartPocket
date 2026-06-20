'use client';
import React, { Suspense } from 'react';
import { useTranslation } from 'react-i18next';
import AppLayout from '@/components/AppLayout';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import ManagedPersonForm from '@/app/people/components/ManagedPersonForm';

function NewPersonForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialName = searchParams.get('name') || '';

  return (
    <div className="card p-6 max-[480px]:p-4">
      <ManagedPersonForm
        initialName={initialName}
        onSuccess={(person) => router.push(`/people/${person.id}`)}
        onCancel={() => router.push('/people')}
      />
    </div>
  );
}

export default function NewPersonPage() {
  const { t } = useTranslation('portal');

  return (
    <AppLayout activeRoute="/people">
      <div className="mx-auto max-w-xl space-y-4 pb-6 max-[480px]:space-y-3">
        <div className="flex items-center gap-3 max-[480px]:gap-2">
          <Link href="/people" className="rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted">
            <ArrowLeft size={18} />
          </Link>
          <div>
            <h1 className="text-xl font-700 text-foreground max-[480px]:text-lg">{t('people.addPerson')}</h1>
            <p className="text-sm text-muted-foreground max-[480px]:text-xs">{t('people.form.createManagedProfile')}</p>
          </div>
        </div>
        <Suspense fallback={<div className="card p-6 animate-pulse h-64 bg-muted" />}>
          <NewPersonForm />
        </Suspense>
      </div>
    </AppLayout>
  );
}
