'use client';
import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle, XCircle, Clock, AlertTriangle, Home, ArrowRight, Loader2 } from 'lucide-react';
import { getInvitationByToken, respondToInvitation, type SpaceInvitation } from '@/lib/spaces';
import { useAuth } from '@/contexts/AuthContext';

const ROLE_LABELS: Record<string, string> = {
  owner: 'Owner', manager: 'Manager', contributor: 'Contributor',
  viewer: 'Viewer', dependent: 'Dependent',
};

export default function InvitationPage() {
  const params = useParams();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
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
    !emailMismatch;

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
      setError((e as Error).message || 'Failed to respond to invitation');
    } finally {
      setResponding(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-3">
          <Loader2 size={32} className="mx-auto text-accent animate-spin" />
          <p className="text-muted-foreground text-sm">Loading invitation...</p>
        </div>
      </div>
    );
  }

  if (!invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="card p-8 max-w-md w-full text-center space-y-4">
          <AlertTriangle size={48} className="mx-auto text-warning" />
          <h1 className="text-xl font-700 text-foreground">Invitation Not Found</h1>
          <p className="text-sm text-muted-foreground">
            This invitation link is invalid or has been removed.
          </p>
          <Link href="/dashboard" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl gradient-teal text-white text-sm font-600 shadow-teal-glow">
            <Home size={16} /> Go to Dashboard
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
              <h1 className="text-xl font-700 text-foreground">Invitation Accepted!</h1>
              <p className="text-sm text-muted-foreground">
                You have joined <strong>{(invitation.space as any)?.name || 'the space'}</strong> as a {ROLE_LABELS[invitation.role]}.
              </p>
              <p className="text-xs text-muted-foreground">Redirecting to Spaces...</p>
            </>
          ) : (
            <>
              <XCircle size={56} className="mx-auto text-negative" />
              <h1 className="text-xl font-700 text-foreground">Invitation Declined</h1>
              <p className="text-sm text-muted-foreground">You have declined this invitation.</p>
              <Link href="/dashboard" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl gradient-teal text-white text-sm font-600 shadow-teal-glow">
                <Home size={16} /> Go to Dashboard
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
          <h1 className="text-xl font-700 text-foreground">Space Invitation</h1>
          <p className="text-sm text-muted-foreground mt-1">
            You have been invited to join a shared space
          </p>
        </div>

        {/* Invitation Details */}
        <div className="bg-muted/50 rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Space</span>
            <span className="font-600 text-foreground">{(invitation.space as any)?.name || 'Unknown Space'}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Role</span>
            <span className="font-600 text-foreground">{ROLE_LABELS[invitation.role]}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Invited by</span>
            <span className="font-600 text-foreground">{(invitation.inviter as any)?.full_name || 'Space Owner'}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Sent to</span>
            <span className="font-600 text-foreground">{invitation.email}</span>
          </div>
          {invitation.expires_at && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">Expires</span>
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
            {invitation.status === 'accepted' && '✓ You have already accepted this invitation'}
            {invitation.status === 'declined' && '✗ You have already declined this invitation'}
            {invitation.status === 'revoked' && '⊘ This invitation has been revoked by the space owner'}
          </div>
        )}

        {isExpired && invitation.status === 'pending' && (
          <div className="bg-warning-soft rounded-xl p-4 text-center text-sm font-600 text-warning flex items-center gap-2 justify-center">
            <Clock size={16} /> This invitation has expired
          </div>
        )}

        {!user && invitation.status === 'pending' && !isExpired && (
          <div className="bg-info-soft rounded-xl p-4 space-y-3">
            <p className="text-sm text-info font-600 text-center">Sign in to accept this invitation</p>
            <p className="text-xs text-muted-foreground text-center">
              You must sign in with <strong>{invitation.email}</strong> to accept this invitation.
            </p>
            <Link
              href={`/sign-up-login?redirect=/invite/${token}`}
              className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl gradient-teal text-white text-sm font-600 shadow-teal-glow"
            >
              Sign In <ArrowRight size={15} />
            </Link>
          </div>
        )}

        {emailMismatch && (
          <div className="bg-warning-soft rounded-xl p-4 text-sm text-warning font-600 text-center">
            ⚠ This invitation was sent to <strong>{invitation.email}</strong>, but you are signed in as <strong>{user?.email}</strong>.
            Please sign in with the correct account.
          </div>
        )}

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
              <XCircle size={16} /> Decline
            </button>
            <button
              onClick={() => handleRespond('accepted')}
              disabled={responding}
              className="flex-1 py-3 rounded-xl gradient-teal text-white text-sm font-600 shadow-teal-glow hover:opacity-90 transition-opacity disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {responding ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
              {responding ? 'Processing...' : 'Accept'}
            </button>
          </div>
        )}

        <div className="text-center">
          <Link href="/dashboard" className="text-xs text-muted-foreground hover:text-foreground transition-colors">
            ← Back to Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
