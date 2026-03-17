import { useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useContactStore } from '@/stores/contactStore';
import { useActiveCall } from '@/hooks/useActiveCall';
import { RejoinPrompt } from './RejoinPrompt';
import { EasyCallCard } from '@/components/shared/EasyCallCard';
import { EasyCallText } from '@/components/shared/EasyCallText';
import { EasyCallButton } from '@/components/shared/EasyCallButton';
import { StatusIndicator } from '@/components/shared/StatusIndicator';
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

  useEffect(() => {
    return subscribeToContacts(userId);
  }, [userId, subscribeToContacts]);

  return (
    <div className="min-h-screen bg-base-100 p-4 flex flex-col">
      {activeCall && <RejoinPrompt activeCall={activeCall} userId={userId} onDismiss={dismiss} />}

      <div className="flex justify-between items-center mb-6">
        <EasyCallText as="h1" variant="heading">
          {t('home.title')}
        </EasyCallText>
        <div className="flex gap-2">
          <EasyCallButton
            variant="secondary"
            size="default"
            onClick={() => void navigate('/elderly/history')}
            aria-label={t('callHistory.title')}
          >
            {t('home.history')}
          </EasyCallButton>
          <EasyCallButton
            variant="secondary"
            size="default"
            onClick={() => void navigate('/elderly/settings')}
            aria-label={t('home.settings')}
          >
            ⚙
          </EasyCallButton>
        </div>
      </div>

      {contacts.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
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
                {contact.photoURL ? (
                  <img
                    src={contact.photoURL}
                    alt=""
                    className="w-20 h-20 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-20 h-20 rounded-full bg-primary flex items-center justify-center text-2xl font-bold text-primary-content">
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
            </EasyCallCard>
          ))}
        </div>
      )}
    </div>
  );
}
