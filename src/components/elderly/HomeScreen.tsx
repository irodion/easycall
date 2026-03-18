import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useContactStore } from '@/stores/contactStore';
import { useActiveCall } from '@/hooks/useActiveCall';
import { RejoinPrompt } from './RejoinPrompt';
import { EasyCallCard } from '@/components/shared/EasyCallCard';
import { EasyCallText } from '@/components/shared/EasyCallText';
import { StatusIndicator } from '@/components/shared/StatusIndicator';
import { presenceI18nKeys } from '@/components/shared/presenceStyles';
import { Icon } from '@/components/shared/Icon';
import { useContactsPresence } from '@/hooks/useContactsPresence';

interface HomeScreenProps {
  userId: string;
}

export function HomeScreen({ userId }: HomeScreenProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const contacts = useContactStore((s) => s.contacts);
  const subscribeToContacts = useContactStore((s) => s.subscribeToContacts);
  const { activeCall, dismiss } = useActiveCall(userId);
  const contactUserIds = useMemo(() => contacts.map((c) => c.contactUserId), [contacts]);
  const presenceMap = useContactsPresence(contactUserIds);

  const [failedPhotoUrls, setFailedPhotoUrls] = useState<Set<string>>(new Set());

  useEffect(() => {
    return subscribeToContacts(userId);
  }, [userId, subscribeToContacts]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-primary/5 via-base-100 to-base-100 p-4 flex flex-col">
      {activeCall && <RejoinPrompt activeCall={activeCall} userId={userId} onDismiss={dismiss} />}

      <div className="flex justify-between items-center mb-6">
        <div>
          <span className="text-xs font-semibold text-primary tracking-wide uppercase">
            EasyCall
          </span>
          <EasyCallText as="h1" variant="heading">
            {t('home.title')}
          </EasyCallText>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => void navigate('/elderly/history')}
            aria-label={t('callHistory.title')}
            className="min-h-14 min-w-14 px-5 py-3 bg-base-200 text-base-content font-bold text-[length:var(--text-body)] rounded-2xl active:scale-95 transition-transform flex items-center gap-2"
          >
            <svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
            {t('home.history')}
          </button>
          <button
            type="button"
            onClick={() => void navigate('/elderly/settings')}
            aria-label={t('home.settings')}
            className="min-h-14 min-w-14 px-4 py-3 bg-base-200 text-base-content rounded-2xl active:scale-95 transition-transform flex items-center justify-center"
          >
            <Icon name="settings" size={24} />
          </button>
        </div>
      </div>

      {contacts.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <div className="text-base-content/15">
            <Icon name="phone" size={80} aria-hidden />
          </div>
          <EasyCallText as="p" variant="body" className="text-center text-base-content/60">
            {t('home.noContacts')}
          </EasyCallText>
          <EasyCallText as="p" variant="body" className="text-center text-base-content/40 text-sm">
            {t('home.noContactsHint')}
          </EasyCallText>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {contacts.map((contact) => (
            <EasyCallCard
              key={contact.id}
              onClick={() => void navigate(`/call/${contact.id}`)}
              aria-label={t('home.callContact', { name: contact.name })}
              className="flex flex-col items-center gap-2 p-4"
            >
              <div className="relative">
                {contact.photoURL && !failedPhotoUrls.has(contact.photoURL) ? (
                  <img
                    src={contact.photoURL}
                    alt=""
                    className="w-24 h-24 rounded-full object-cover ring-2 ring-primary/20"
                    onError={() =>
                      setFailedPhotoUrls((prev) => new Set(prev).add(contact.photoURL!))
                    }
                  />
                ) : (
                  <div className="w-24 h-24 rounded-full bg-primary flex items-center justify-center text-3xl font-bold text-primary-content ring-2 ring-primary/20">
                    {contact.name[0] ?? '?'}
                  </div>
                )}
                {contact.contactUserId && presenceMap.has(contact.contactUserId) && (
                  <StatusIndicator
                    state={presenceMap.get(contact.contactUserId)!.state}
                    size="md"
                    className="absolute bottom-0 right-0"
                  />
                )}
              </div>
              <EasyCallText as="span" variant="button" className="font-bold text-center">
                {contact.name}
              </EasyCallText>
              {contact.contactUserId && presenceMap.has(contact.contactUserId) && (
                <span className="text-xs text-base-content/60">
                  {t(presenceI18nKeys[presenceMap.get(contact.contactUserId)!.state])}
                </span>
              )}
            </EasyCallCard>
          ))}
        </div>
      )}
    </div>
  );
}
