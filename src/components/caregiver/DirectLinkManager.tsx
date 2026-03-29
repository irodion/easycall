import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { auth } from '@/services/firebase';
import {
  generateDirectLink,
  revokeDirectLink,
  subscribeToDirectLinks,
} from '@/services/directLinks';
import type { DirectLink } from '@/services/directLinks';
import { useContactStore } from '@/stores/contactStore';
import { BackToDashboard } from '@/components/shared/BackToDashboard';
import { EasyCallButton } from '@/components/shared/EasyCallButton';
import { EasyCallText } from '@/components/shared/EasyCallText';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';

const PAGE_CLASS =
  'min-h-screen bg-gradient-to-b from-base-200/30 to-base-100 flex flex-col p-[var(--space-md)]';

interface DirectLinkManagerProps {
  elderlyUserId: string;
}

type LinkStatus = 'active' | 'expired' | 'revoked';

function getLinkStatus(link: DirectLink): LinkStatus {
  if (link.revoked) return 'revoked';
  if (link.expiresAt.seconds * 1000 < Date.now()) return 'expired';
  return 'active';
}

function formatDate(seconds: number): string {
  return new Date(seconds * 1000).toLocaleDateString();
}

export function DirectLinkManager({ elderlyUserId }: DirectLinkManagerProps) {
  const { t } = useTranslation();
  const [links, setLinks] = useState<DirectLink[]>([]);
  const [creating, setCreating] = useState(false);
  const [callerName, setCallerName] = useState('');
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revokeTarget, setRevokeTarget] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [showForm, setShowForm] = useState(false);

  const contacts = useContactStore((s) => s.contacts);
  const subscribeToContacts = useContactStore((s) => s.subscribeToContacts);

  // Load contacts for this elderly user
  useEffect(() => {
    return subscribeToContacts(elderlyUserId);
  }, [elderlyUserId, subscribeToContacts]);

  // Subscribe to direct links
  useEffect(() => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    return subscribeToDirectLinks(elderlyUserId, uid, setLinks);
  }, [elderlyUserId]);

  const handleCreate = useCallback(async () => {
    if (!selectedContactId || !callerName.trim()) return;
    setCreating(true);
    setError(null);
    try {
      const { url } = await generateDirectLink(elderlyUserId, selectedContactId, callerName.trim());
      setGeneratedUrl(url);
    } catch (err) {
      const msg = (err as { message?: string }).message ?? '';
      setError(t('directLinks.createFailed', { error: msg }));
    } finally {
      setCreating(false);
    }
  }, [elderlyUserId, selectedContactId, callerName, t]);

  const handleCopy = useCallback(async () => {
    if (!generatedUrl) return;
    await navigator.clipboard.writeText(generatedUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [generatedUrl]);

  const handleRevoke = useCallback(
    async (linkId: string) => {
      setRevoking(true);
      try {
        await revokeDirectLink(linkId);
      } catch (err) {
        const msg = (err as { message?: string }).message ?? '';
        setError(t('directLinks.revokeFailed', { error: msg }));
      } finally {
        setRevoking(false);
        setRevokeTarget(null);
      }
    },
    [t],
  );

  const handleDone = useCallback(() => {
    setShowForm(false);
    setGeneratedUrl(null);
    setSelectedContactId(null);
    setCallerName('');
    setCopied(false);
  }, []);

  return (
    <div className={PAGE_CLASS}>
      <BackToDashboard />
      <EasyCallText as="h1" variant="heading" className="mb-4">
        {t('directLinks.title')}
      </EasyCallText>
      <EasyCallText as="p" variant="body" className="mb-6 text-base-content/70">
        {t('directLinks.description')}
      </EasyCallText>

      {error && (
        <div role="alert" className="alert alert-error mb-4">
          <EasyCallText as="span" variant="body">
            {error}
          </EasyCallText>
        </div>
      )}

      {/* Create link form */}
      {!showForm && !generatedUrl && (
        <EasyCallButton
          variant="primary"
          size="default"
          onClick={() => setShowForm(true)}
          className="mb-6"
        >
          {t('directLinks.createLink')}
        </EasyCallButton>
      )}

      {showForm && !generatedUrl && (
        <div className="card bg-base-200 p-4 mb-6 flex flex-col gap-4">
          <EasyCallText as="label" variant="body" className="font-semibold">
            {t('directLinks.selectContact')}
          </EasyCallText>
          <select
            className="select select-bordered w-full"
            value={selectedContactId ?? ''}
            onChange={(e) => setSelectedContactId(e.target.value || null)}
          >
            <option value="">—</option>
            {contacts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <label className="form-control w-full">
            <EasyCallText as="span" variant="body" className="label-text font-semibold mb-1">
              {t('directLinks.callerName')}
            </EasyCallText>
            <input
              type="text"
              className="input input-bordered w-full"
              placeholder={t('directLinks.callerNamePlaceholder')}
              value={callerName}
              onChange={(e) => setCallerName(e.target.value)}
            />
          </label>

          <div className="flex gap-2">
            <EasyCallButton
              variant="primary"
              size="default"
              onClick={() => void handleCreate()}
              disabled={creating || !selectedContactId || !callerName.trim()}
            >
              {creating ? t('directLinks.generating') : t('directLinks.createLink')}
            </EasyCallButton>
            <EasyCallButton variant="secondary" size="default" onClick={handleDone}>
              {t('common.cancel')}
            </EasyCallButton>
          </div>
        </div>
      )}

      {/* Generated link display */}
      {generatedUrl && (
        <div className="card bg-success/10 border border-success p-4 mb-6 flex flex-col gap-3">
          <EasyCallText as="p" variant="body" className="font-semibold text-success">
            {t('directLinks.linkReady')}
          </EasyCallText>
          <input
            type="text"
            readOnly
            value={generatedUrl}
            className="input input-bordered w-full text-xs"
            onClick={(e) => (e.target as HTMLInputElement).select()}
          />
          <div className="flex gap-2">
            <EasyCallButton variant="primary" size="default" onClick={() => void handleCopy()}>
              {copied ? t('directLinks.copied') : t('directLinks.copyLink')}
            </EasyCallButton>
            <EasyCallButton variant="secondary" size="default" onClick={handleDone}>
              {t('common.dismiss')}
            </EasyCallButton>
          </div>
        </div>
      )}

      {/* Links list */}
      {links.length === 0 && !showForm && !generatedUrl && (
        <EasyCallText as="p" variant="body" className="text-base-content/50 text-center mt-8">
          {t('directLinks.noLinks')}
        </EasyCallText>
      )}

      {links.length > 0 && (
        <div className="flex flex-col gap-3">
          {links.map((link) => {
            const status = getLinkStatus(link);
            return (
              <div key={link.linkId} className="card bg-base-200 p-4 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <EasyCallText as="span" variant="body" className="font-semibold">
                    {t('directLinks.contactLabel', { name: link.contactName })}
                  </EasyCallText>
                  <span
                    className={`badge ${
                      status === 'active'
                        ? 'badge-success'
                        : status === 'expired'
                          ? 'badge-warning'
                          : 'badge-error'
                    }`}
                  >
                    {t(`directLinks.${status}`)}
                  </span>
                </div>
                <EasyCallText as="span" variant="body" className="text-sm text-base-content/60">
                  {t('directLinks.createdOn', { date: formatDate(link.createdAt.seconds) })}
                  {' · '}
                  {t('directLinks.expiresOn', { date: formatDate(link.expiresAt.seconds) })}
                </EasyCallText>
                {status === 'active' && (
                  <EasyCallButton
                    variant="danger"
                    size="default"
                    onClick={() => setRevokeTarget(link.linkId)}
                    className="self-start"
                  >
                    {t('directLinks.revoke')}
                  </EasyCallButton>
                )}
              </div>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={revokeTarget !== null}
        message={t('directLinks.revokeConfirm')}
        confirmLabel={revoking ? t('directLinks.revoking') : t('directLinks.revoke')}
        onConfirm={() => revokeTarget && void handleRevoke(revokeTarget)}
        onCancel={() => setRevokeTarget(null)}
      />
    </div>
  );
}
