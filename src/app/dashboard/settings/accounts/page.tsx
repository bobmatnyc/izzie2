/**
 * Account Management Page
 * Manage connected Google accounts for multi-account support
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { SignOutButton } from '@/components/auth/SignOutButton';
import { useConfirmModal } from '@/components/ui/confirm-modal';
import { linkGoogleAccount, signIn } from '@/lib/auth/client';

type PageState = 'loading' | 'loaded' | 'error';

interface ConnectedAccount {
  id: string;
  accountId: string;
  providerId: string;
  label: string | null;
  isPrimary: boolean;
  accountEmail: string | null;
  hasAccessToken: boolean;
  hasRefreshToken: boolean;
  accessTokenExpiresAt: string | null;
  createdAt: string;
}

// Icons
const StarIcon = ({ className, filled }: { className?: string; filled?: boolean }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill={filled ? 'currentColor' : 'none'}
    stroke="currentColor"
    strokeWidth="1.5"
    className={className}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.562.562 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.562.562 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z"
    />
  </svg>
);

const TrashIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className={className}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0"
    />
  </svg>
);

const PlusIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className={className}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
  </svg>
);

const RefreshCwIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className={className}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99"
    />
  </svg>
);

const CheckIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className={className}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
  </svg>
);

const XIcon = ({ className }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    fill="none"
    viewBox="0 0 24 24"
    strokeWidth={1.5}
    stroke="currentColor"
    className={className}
  >
    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
  </svg>
);

const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" width="24" height="24">
    <path
      fill="#4285F4"
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
    />
    <path
      fill="#34A853"
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
    />
    <path
      fill="#FBBC05"
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
    />
    <path
      fill="#EA4335"
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
    />
  </svg>
);

export default function AccountsSettingsPage() {
  const { showConfirmation } = useConfirmModal();

  // Page state
  const [pageState, setPageState] = useState<PageState>('loading');
  const [pageError, setPageError] = useState<string | null>(null);

  // Data state
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);

  // Edit state
  const [editingLabel, setEditingLabel] = useState<string | null>(null);
  const [labelValue, setLabelValue] = useState('');

  // Operation feedback state
  const [actionMessage, setActionMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Fetch accounts
  const fetchAccounts = useCallback(async () => {
    try {
      setPageState('loading');
      const response = await fetch('/api/user/accounts');
      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Unauthorized');
        }
        throw new Error('Failed to fetch accounts');
      }
      const data = await response.json();
      setAccounts(data.accounts);
      setPageState('loaded');
      setPageError(null);
    } catch (err) {
      setPageError(err instanceof Error ? err.message : 'Failed to load accounts');
      setPageState('error');
    }
  }, []);

  // Initial load
  useEffect(() => {
    fetchAccounts();
  }, [fetchAccounts]);

  // Show action message with auto-clear
  const showMessage = (type: 'success' | 'error', text: string) => {
    setActionMessage({ type, text });
    setTimeout(() => setActionMessage(null), 4000);
  };

  // Set primary account
  const handleSetPrimary = async (accountId: string) => {
    try {
      const response = await fetch('/api/user/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, isPrimary: true }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to set primary');
      }

      await fetchAccounts();
      showMessage('success', 'Primary account updated');
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : 'Failed to update');
    }
  };

  // Update label
  const handleUpdateLabel = async (accountId: string, label: string) => {
    try {
      const response = await fetch('/api/user/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, label }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update label');
      }

      await fetchAccounts();
      setEditingLabel(null);
      showMessage('success', 'Label updated');
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : 'Failed to update');
    }
  };

  // Disconnect account
  const handleDisconnect = async (accountId: string) => {
    const confirmed = await showConfirmation({
      title: 'Disconnect Account?',
      message: 'Are you sure you want to disconnect this account?',
      confirmText: 'Disconnect',
      cancelText: 'Cancel',
      variant: 'destructive',
    });
    if (!confirmed) return;

    try {
      const response = await fetch('/api/user/accounts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to disconnect');
      }

      await fetchAccounts();
      showMessage('success', 'Account disconnected');
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : 'Failed to disconnect');
    }
  };

  // Add account using Better Auth's linkSocial method
  const handleAddAccount = async () => {
    try {
      await linkGoogleAccount('/dashboard/settings/accounts');
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : 'Failed to add account');
    }
  };

  // Reconnect account to refresh OAuth scopes
  // Deletes existing tokens BEFORE redirecting to OAuth to force full consent screen
  const handleReconnect = async (accountEmail: string | null) => {
    // Email is optional - used as login_hint in OAuth but not required
    // Backend will look up account by userId + providerId
    try {
      // Call the reconnect API to delete existing tokens
      // This ensures Google shows the FULL consent screen with ALL scopes
      const response = await fetch('/api/auth/reconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountEmail: accountEmail || undefined }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to initiate reconnect');
      }

      // Backend has cleared/deleted tokens - now initiate OAuth using Better Auth
      // This uses the same reliable client-side method as "Link Google Account"
      await signIn.social({
        provider: 'google',
        callbackURL: '/dashboard/settings/accounts',
      });
    } catch (error) {
      showMessage('error', error instanceof Error ? error.message : 'Failed to reconnect');
    }
  };

  // Format date
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  return (
    <div className="py-4">
      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Connected Accounts</h1>
          <p className="text-muted-foreground mt-1">
            Manage your connected Google accounts. Izzie can access calendar, email, and tasks from
            all connected accounts.
          </p>
        </div>
        {pageState === 'loaded' && (
          <Button onClick={handleAddAccount} className="shrink-0">
            <PlusIcon className="w-4 h-4 mr-2" />
            Add Account
          </Button>
        )}
      </div>

      {/* Action Message */}
      {actionMessage && (
        <div
          className={cn(
            'mb-4 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm',
            actionMessage.type === 'success'
              ? 'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-400'
              : 'border-destructive/50 bg-destructive/10 text-destructive'
          )}
        >
          {actionMessage.type === 'success' ? (
            <CheckIcon className="h-4 w-4" />
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="h-4 w-4"
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path
                fillRule="evenodd"
                d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                clipRule="evenodd"
              />
            </svg>
          )}
          <span>{actionMessage.text}</span>
        </div>
      )}

      {/* Loading State */}
      {pageState === 'loading' && (
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center gap-3">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
            <span className="text-muted-foreground">Loading accounts...</span>
          </div>
        </div>
      )}

      {/* Error State */}
      {pageState === 'error' && (
        <div className="rounded-lg border bg-card p-6">
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-destructive">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="h-5 w-5"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              <span>{pageError || 'Failed to load accounts'}</span>
            </div>
            <Button variant="outline" onClick={fetchAccounts}>
              Retry
            </Button>
          </div>
        </div>
      )}

      {/* Main Content */}
      {pageState === 'loaded' && (
        <div className="space-y-4">
          {/* Account List */}
          {accounts.map((account) => (
            <div key={account.id} className="rounded-lg border bg-card shadow-sm">
              <div className="flex items-center justify-between p-4">
                {/* Left: Icon + Account Info */}
                <div className="flex items-center gap-4">
                  {/* Google Icon */}
                  <div className="w-10 h-10 rounded-full bg-white border flex items-center justify-center shrink-0">
                    <GoogleIcon />
                  </div>

                  {/* Account Info */}
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      {editingLabel === account.id ? (
                        // Edit mode
                        <div className="flex items-center gap-2">
                          <input
                            type="text"
                            value={labelValue}
                            onChange={(e) => setLabelValue(e.target.value)}
                            placeholder="personal, work..."
                            className="w-32 h-8 rounded-md border border-input bg-background px-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-primary"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                handleUpdateLabel(account.id, labelValue);
                              } else if (e.key === 'Escape') {
                                setEditingLabel(null);
                              }
                            }}
                          />
                          <button
                            onClick={() => handleUpdateLabel(account.id, labelValue)}
                            className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-muted"
                          >
                            <CheckIcon className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setEditingLabel(null)}
                            className="h-8 w-8 inline-flex items-center justify-center rounded-md hover:bg-muted"
                          >
                            <XIcon className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        // Display mode
                        <>
                          <span className="font-medium text-foreground">
                            {account.accountEmail || 'Google Account'}
                          </span>
                          <button
                            onClick={() => {
                              setEditingLabel(account.id);
                              setLabelValue(account.label || '');
                            }}
                            className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors hover:bg-muted cursor-pointer"
                          >
                            {account.label || 'Set label'}
                          </button>
                          {account.isPrimary && (
                            <span className="inline-flex items-center rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-xs font-medium">
                              Primary
                            </span>
                          )}
                        </>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      Connected {formatDate(account.createdAt)}
                    </p>
                  </div>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-2">
                  {/* Reconnect button - always shown to allow refreshing OAuth scopes */}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleReconnect(account.accountEmail)}
                    title="Reconnect to update permissions"
                  >
                    <RefreshCwIcon className="w-4 h-4 mr-2" />
                    Reconnect
                  </Button>
                  {!account.isPrimary && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleSetPrimary(account.id)}
                    >
                      <StarIcon className="w-4 h-4 mr-2" />
                      Set Primary
                    </Button>
                  )}
                  {accounts.length > 1 && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDisconnect(account.id)}
                      className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    >
                      <TrashIcon className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {/* Empty State */}
          {accounts.length === 0 && (
            <div className="rounded-lg border bg-card p-8 text-center">
              <p className="text-muted-foreground">No accounts connected yet.</p>
              <Button onClick={handleAddAccount} className="mt-4">
                <PlusIcon className="w-4 h-4 mr-2" />
                Connect Google Account
              </Button>
            </div>
          )}

          {/* Help Section */}
          <div className="rounded-lg border bg-muted/50 p-4 mt-8">
            <h3 className="text-sm font-medium text-foreground mb-2">
              About Multi-Account Support
            </h3>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Connect multiple Google accounts to give Izzie full context across your personal and work accounts</li>
              <li>Calendar events from all accounts are shown together</li>
              <li>Email context includes all connected inboxes</li>
              <li>Tasks are aggregated across all accounts</li>
              <li>Specify which account to use: &quot;Send from my work email&quot;</li>
            </ul>
          </div>

          {/* Sign Out Section */}
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 mt-8">
            <h3 className="text-sm font-medium text-foreground mb-2">
              Sign Out
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Sign out of Izzie completely. You&apos;ll need to sign in again with your Google account.
              This is useful if you need to re-authenticate with updated permissions.
            </p>
            <SignOutButton variant="destructive" />
          </div>
        </div>
      )}
    </div>
  );
}
