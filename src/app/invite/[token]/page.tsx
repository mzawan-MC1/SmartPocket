'use client';
import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle, XCircle, Clock, AlertTriangle, Home, ArrowRight, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getInvitationByToken, respondToInvitation, type SpaceInvitation } from '@/lib/spaces';
import { useAuth } from '@/contexts/AuthContext';
import { useSubscriptionSummary } from '@/contexts/SubscriptionSummaryContext';
import { hasSubscriptionFeature } from '@/lib/subscription/entitlements';

function mapInvitationError(
  message: string,
  t: (key: string, options?: Record<string, unknown>) => string
) {
  switch (message) {
    case 'Invitation not found':
      return t('spaces.invitationPage.errors.notFound', { ns: 'portal' });
    case 'This invitation was sent to a different email address':
      return t('spaces.invitationPage.errors.emailMismatch', { ns: 'portal' });
    case 'This invitation has expired':
      return t('spaces.invitationPage.errors.expired', { ns: 'portal' });
    case 'Not authenticated':
      return t('spaces.invitationPage.errors.notAuthenticated', { ns: 'portal' });
    default:
      if (message.startsWith('Invitation is already ')) {
        const status = message.replace('Invitation is already ', '');
        return t('spaces.invitationPage.errors.alreadyProcessed', {
          ns: 'portal',
          status: t(`spaces.status.${status}` as const, { ns: 'portal', defaultValue: status }),
        });
      }
      return message;
  }
}

export default function InvitationPage() {
  const { t } = useTranslation(['portal', 'common']);
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { summary } = useSubscriptionSummary();
  const token = params.token as string;

  const [invitation, setInvitation] = useState<SpaceInvitation | null>(null);
  const [loading, setLoading] = useState(true);
  const [responding, setResponding] = useState(false);
  const [result, setResult] = useState<'accepted' | 'declined' | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    getInvitationByToken(token).then((inv) => {
      setInvitation(inv);
      setLoading(false);
    });
  }, [token]);

  const isExpired = invitation?.expires_at
    ? new Date(invitation.expires_at) < new Date()
    : false;

  const emailMismatch = user && invitation
    ? user.email?.toLowerCase() !== invitation.email.toLowerCase()
    : false;

  const canRespond =
    invitation &&
    invitation.status === 'pending' &&
    !isExpired &&
    user &&
    !emailMismatch &&
    hasSubscriptionFeature(summary, 'shared_spaces');

  const handleRespond = async (response: 'accepted' | 'declined') => {
    if (!invitation) return;
    setResponding(true);
    setError(null);
    try {
      await respondToInvitation(invitation.id, response);
      setResult(response);
      if (response === 'accepted') {
        setTimeout(() => router.push('/spaces'), 2000);
      }
    } catch (e: unknown) {
      setError(mapInvitationError((e as Error).message || t('spaces.invitationPage.errors.respondFailed', { ns: 'portal' }), t));
    } finally {
      setResponding(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <Loader2 size={32} className="mx-auto text-accent animate-spin" />
          <p className="text-muted-foreground text-sm">{t('spaces.invitationPage.loading', { ns: 'portal' })}</p>
        </div>
      </div>
    );
  }

  if (!invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="card p-8 max-w-md w-full text-center space-y-4">
          <AlertTriangle size={48} className="mx-auto text-warning" />
          <h1 className="text-xl font-700 text-foreground">{t('spaces.invitationPage.notFoundTitle', { ns: 'portal' })}</h1>
          <p className="text-sm text-muted-foreground">
            {t('spaces.invitationPage.notFoundDescription', { ns: 'portal' })}
          </p>
          <Link href="/dashboard" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl gradient-teal text-white text-sm font-600 shadow-teal-glow">
            <Home size={16} /> {t('spaces.invitationPage.goToDashboard', { ns: 'portal' })}
          </Link>
        </div>
      </div>
    );
  }

  if (result) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="card p-8 max-w-md w-full text-center space-y-4">
          {result === 'accepted' ? (
            <>
              <CheckCircle size={56} className="mx-auto text-positive" />
              <h1 className="text-xl font-700 text-foreground">{t('spaces.invitationPage.acceptedTitle', { ns: 'portal' })}</h1>
              <p className="text-sm text-muted-foreground">
                {t('spaces.invitationPage.acceptedDescription', {
                  ns: 'portal',
                  space: (invitation.space as any)?.name || t('spaces.invitationPage.fallbackSpace', { ns: 'portal' }),
                  role: t(`spaces.roles.${invitation.role}` as const, { ns: 'portal' }),
                })}
              </p>
              <p className="text-xs text-muted-foreground">{t('spaces.invitationPage.redirecting', { ns: 'portal' })}</p>
            </>
          ) : (
            <>
              <XCircle size={56} className="mx-auto text-negative" />
              <h1 className="text-xl font-700 text-foreground">{t('spaces.invitationPage.declinedTitle', { ns: 'portal' })}</h1>
              <p className="text-sm text-muted-foreground">{t('spaces.invitationPage.declinedDescription', { ns: 'portal' })}</p>
              <Link href="/dashboard" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl gradient-teal text-white text-sm font-600 shadow-teal-glow">
                <Home size={16} /> {t('spaces.invitationPage.goToDashboard', { ns: 'portal' })}
              </Link>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="card p-8 max-w-md w-full space-y-6">
        {/* Space Icon */}
        <div className="text-center">
          <div
            className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center text-white mb-4"
            style={{ backgroundColor: (invitation.space as any)?.color || '#0f3460' }}
          >
            <Home size={28} />
          </div>
          <h1 className="text-xl font-700 text-foreground">{t('spaces.invitationPage.title', { ns: 'portal' })}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t('spaces.invitationPage.description', { ns: 'portal' })}
          </p>
        </div>

        {/* Invitation Details */}
        <div className="bg-muted/50 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t('spaces.invitationPage.details.space', { ns: 'portal' })}</span>
            <span className="font-600 text-foreground">{(invitation.space as any)?.name || t('spaces.invitationPage.fallbackUnknownSpace', { ns: 'portal' })}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t('spaces.invitationPage.details.role', { ns: 'portal' })}</span>
            <span className="font-600 text-foreground">{t(`spaces.roles.${invitation.role}` as const, { ns: 'portal' })}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t('spaces.invitationPage.details.invitedBy', { ns: 'portal' })}</span>
            <span className="font-600 text-foreground">{(invitation.inviter as any)?.full_name || t('spaces.invitationPage.fallbackInviter', { ns: 'portal' })}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">{t('spaces.invitationPage.details.sentTo', { ns: 'portal' })}</span>
            <span className="font-600 text-foreground">{invitation.email}</span>
          </div>
          {invitation.expires_at && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{t('spaces.invitationPage.details.expires', { ns: 'portal' })}</span>
              <span className={`font-600 flex items-center gap-1 ${isExpired ? 'text-negative' : 'text-foreground'}`}>
                <Clock size={12} />
                {new Date(invitation.expires_at).toLocaleDateString()}
              </span>
            </div>
          )}
        </div>

        {/* Status Messages */}
        {invitation.status !== 'pending' && (
          <div className={`rounded-xl p-4 text-center text-sm font-600 ${
            invitation.status === 'accepted' ? 'bg-positive-soft text-positive' :
            invitation.status === 'declined'? 'bg-negative-soft text-negative' : 'bg-muted text-muted-foreground'
          }`}>
            {invitation.status === 'accepted' && t('spaces.invitationPage.status.accepted', { ns: 'portal' })}
            {invitation.status === 'declined' && t('spaces.invitationPage.status.declined', { ns: 'portal' })}
            {invitation.status === 'revoked' && t('spaces.invitationPage.status.revoked', { ns: 'portal' })}
          </div>
        )}

        {isExpired && invitation.status === 'pending' && (
          <div className="bg-warning-soft rounded-xl p-4 text-center text-sm font-600 text-warning flex items-center gap-2 justify-center">
            <Clock size={16} /> {t('spaces.invitationPage.expiredBanner', { ns: 'portal' })}
          </div>
        )}

        {!user && invitation.status === 'pending' && !isExpired && (
          <div className="bg-info-soft rounded-xl p-4 space-y-3">
            <p className="text-sm text-info font-600 text-center">{t('spaces.invitationPage.signInTitle', { ns: 'portal' })}</p>
            <p className="text-xs text-muted-foreground text-center">
              {t('spaces.invitationPage.signInDescription', { ns: 'portal', email: invitation.email })}
            </p>
            <Link
              href={`/sign-up-login?redirect=/invite/${token}`}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl gradient-teal text-white text-sm font-600 shadow-teal-glow"
            >
              {t('nav.signIn', { ns: 'common' })} <ArrowRight size={15} />
            </Link>
          </div>
        )}

        {emailMismatch && (
          <div className="bg-warning-soft rounded-xl p-4 text-sm text-warning font-600 text-center">
            {t('spaces.invitationPage.emailMismatch', { ns: 'portal', invitedEmail: invitation.email, currentEmail: user?.email })}
          </div>
        )}

        {user && !hasSubscriptionFeature(summary, 'shared_spaces') && invitation.status === 'pending' && !isExpired ? (
          <div className="bg-warning-soft rounded-xl p-4 text-sm text-warning font-600 text-center">
            {t('featureGate.description', {
              ns: 'portal',
              feature: t('featureGate.features.sharedSpaces', { ns: 'portal' }),
            })}
          </div>
        ) : null}

        {error && (
          <div className="bg-negative-soft rounded-xl p-3 text-sm text-negative font-500 text-center">
            {error}
          </div>
        )}

        {/* Action Buttons */}
        {canRespond && (
          <div className="flex gap-3">
            <button
              onClick={() => handleRespond('declined')}
              disabled={responding}
              className="flex-1 py-3 rounded-xl border border-border text-sm font-600 text-muted-foreground hover:bg-muted transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            >
              <XCircle size={16} /> {t('spaces.invitationPage.decline', { ns: 'portal' })}
            </button>
            <button
              onClick={() => handleRespond('accepted')}
              disabled={responding}
              className="flex-1 py-3 rounded-xl gradient-teal text-white text-sm font-600 shadow-teal-glow hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {responding ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
              {responding ? t('status.processing', { ns: 'common' }) : t('spaces.invitationPage.accept', { ns: 'portal' })}
            </button>
          </div>
        )}

        <div className="text-center">
          <Link href="/dashboard" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            {t('spaces.invitationPage.backToDashboard', { ns: 'portal' })}
          </Link>
        </div>
      </div>
    </div>
  );
}
