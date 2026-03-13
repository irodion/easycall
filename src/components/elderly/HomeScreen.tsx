import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { useContactStore } from '@/stores/contactStore';
import { EasyCallCard } from '@/components/shared/EasyCallCard';
import { EasyCallText } from '@/components/shared/EasyCallText';
import { EasyCallButton } from '@/components/shared/EasyCallButton';

interface HomeScreenProps {
  userId: string;
}

export function HomeScreen({ userId }: HomeScreenProps) {
  const navigate = useNavigate();
  const contacts = useContactStore((s) => s.contacts);
  const subscribeToContacts = useContactStore((s) => s.subscribeToContacts);

  useEffect(() => {
    return subscribeToContacts(userId);
  }, [userId, subscribeToContacts]);

  return (
    <div className="min-h-screen bg-base-100 p-4 flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <EasyCallText as="h1" variant="heading">Your Contacts</EasyCallText>
        <EasyCallButton
          variant="secondary"
          size="default"
          onClick={() => void navigate('/elderly/settings')}
          aria-label="Settings"
        >
          ⚙
        </EasyCallButton>
      </div>

      {contacts.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <EasyCallText as="p" variant="body" className="text-center text-base-content/60">
            No contacts yet
          </EasyCallText>
          <EasyCallText as="p" variant="body" className="text-center text-base-content/40 text-sm">
            A caregiver can add contacts for you
          </EasyCallText>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {contacts.map((contact) => (
            <EasyCallCard
              key={contact.id}
              onClick={() => void navigate(`/call/${contact.id}`)}
              aria-label={`Call ${contact.name}`}
              className="flex flex-col items-center gap-2 p-4"
            >
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
