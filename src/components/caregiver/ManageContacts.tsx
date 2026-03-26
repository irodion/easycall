import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { BackToDashboard } from '@/components/shared/BackToDashboard';
import { useContactStore } from '@/stores/contactStore';
import { generateLinkedRoomId } from '@/utils/generateRoomId';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EasyCallButton } from '@/components/shared/EasyCallButton';
import { EasyCallText } from '@/components/shared/EasyCallText';
import { LinkedUserPicker } from './LinkedUserPicker';
import { useLinkedUserNames } from '@/hooks/useLinkedUserNames';
import type { Contact } from '@/types/user';

interface ManageContactsProps {
  elderlyUserId: string;
  caregiverUserId: string;
}

export function ManageContacts({ elderlyUserId, caregiverUserId }: ManageContactsProps) {
  const { t } = useTranslation();
  const contacts = useContactStore((s) => s.contacts);
  const addContact = useContactStore((s) => s.addContact);
  const removeContact = useContactStore((s) => s.removeContact);
  const subscribeToContacts = useContactStore((s) => s.subscribeToContacts);

  const [displayName, setDisplayName] = useState<string | null>(null);
  const [showLinkedPicker, setShowLinkedPicker] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const contactUserIds = useMemo(() => contacts.map((c) => c.contactUserId), [contacts]);
  const existingContactUserIds = useMemo(() => contactUserIds.filter((id) => id), [contactUserIds]);
  const linkedUserNames = useLinkedUserNames(existingContactUserIds);

  useEffect(() => {
    return subscribeToContacts(elderlyUserId);
  }, [elderlyUserId, subscribeToContacts]);

  useEffect(() => {
    let active = true;
    setDisplayName(null);
    void getDoc(doc(db, 'users', elderlyUserId))
      .then((snap) => {
        if (active && snap.exists()) {
          const name = snap.data()['displayName'];
          if (typeof name === 'string') setDisplayName(name);
        }
      })
      .catch(() => {
        // Silently fall back to generic title if the read fails
      });
    return () => {
      active = false;
    };
  }, [elderlyUserId]);

  const handleAddLinkedUser = async (userId: string, linkedDisplayName: string) => {
    const maxOrder = contacts.reduce((max, c) => Math.max(max, c.displayOrder), -1);
    await addContact(elderlyUserId, {
      name: linkedDisplayName,
      photoURL: null,
      jitsiRoomId: generateLinkedRoomId(elderlyUserId, userId),
      contactUserId: userId,
      displayOrder: maxOrder + 1,
    });
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteId || isDeleting) return;
    setIsDeleting(true);
    setError(null);
    try {
      await removeContact(elderlyUserId, confirmDeleteId);
      setConfirmDeleteId(null);
    } catch (err) {
      setError(
        t('manageContacts.removeFailed', {
          error: err instanceof Error ? err.message : String(err),
        }),
      );
    } finally {
      setIsDeleting(false);
    }
  };

  const contactToDelete = contacts.find((c) => c.id === confirmDeleteId);

  return (
    <div className="min-h-screen bg-base-100 p-6 flex flex-col gap-6">
      <BackToDashboard />
      <EasyCallText as="h1" variant="heading">
        {displayName
          ? t('manageContacts.titleFor', { name: displayName })
          : t('manageContacts.title')}
      </EasyCallText>

      <EasyCallButton
        variant="primary"
        onClick={() => setShowLinkedPicker(!showLinkedPicker)}
        aria-label={t('manageContacts.addFromMembers')}
      >
        {t('manageContacts.addFromMembers')}
      </EasyCallButton>

      {error && (
        <div role="alert" className="alert alert-error">
          <EasyCallText as="span" variant="body">
            {error}
          </EasyCallText>
        </div>
      )}

      {showLinkedPicker && (
        <LinkedUserPicker
          elderlyUserId={elderlyUserId}
          caregiverUserId={caregiverUserId}
          existingContactUserIds={existingContactUserIds}
          onAdd={handleAddLinkedUser}
        />
      )}

      <div className="flex flex-col gap-3">
        {contacts.map((contact: Contact) => {
          const resolvedName = contact.contactUserId
            ? linkedUserNames.get(contact.contactUserId)
            : undefined;
          const contactDisplayName = resolvedName || contact.name;
          return (
            <div
              key={contact.id}
              className="card card-body bg-base-200 flex-row items-center justify-between gap-3"
            >
              <EasyCallText as="span" variant="button" className="font-bold">
                {contactDisplayName}
              </EasyCallText>
              <EasyCallButton
                variant="danger"
                onClick={() => setConfirmDeleteId(contact.id)}
                disabled={isDeleting}
                aria-label={t('manageContacts.removeContact', { name: contactDisplayName })}
              >
                {t('manageContacts.remove')}
              </EasyCallButton>
            </div>
          );
        })}
      </div>

      <ConfirmDialog
        open={confirmDeleteId !== null}
        message={t('manageContacts.confirmRemove', {
          name:
            (contactToDelete?.contactUserId
              ? linkedUserNames.get(contactToDelete.contactUserId)
              : undefined) ??
            contactToDelete?.name ??
            t('manageContacts.thisContact'),
        })}
        onConfirm={() => {
          void handleConfirmDelete();
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
