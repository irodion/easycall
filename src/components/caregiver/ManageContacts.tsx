import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/services/firebase';
import { BackToDashboard } from '@/components/shared/BackToDashboard';
import { useContactStore } from '@/stores/contactStore';
import { generateRoomId } from '@/utils/generateRoomId';
import { compressImage, blobToDataUrl } from '@/utils/compressImage';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EasyCallButton } from '@/components/shared/EasyCallButton';
import { EasyCallText } from '@/components/shared/EasyCallText';
import type { Contact } from '@/types/user';

interface ManageContactsProps {
  elderlyUserId: string;
}

export function ManageContacts({ elderlyUserId }: ManageContactsProps) {
  const { t } = useTranslation();
  const contacts = useContactStore((s) => s.contacts);
  const addContact = useContactStore((s) => s.addContact);
  const removeContact = useContactStore((s) => s.removeContact);
  const subscribeToContacts = useContactStore((s) => s.subscribeToContacts);

  const [displayName, setDisplayName] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const handleAdd = async () => {
    if (!newName.trim() || isAdding) return;
    setIsAdding(true);
    setError(null);
    try {
      let photoURL: string | null = null;
      if (photoFile) {
        try {
          const compressed = await compressImage(photoFile);
          photoURL = await blobToDataUrl(compressed);
        } catch {
          setPhotoFile(null);
          setError(t('addContact.photoError'));
          setIsAdding(false);
          return;
        }
      }
      const maxOrder = contacts.reduce((max, c) => Math.max(max, c.displayOrder), -1);
      const displayOrder = maxOrder + 1;
      const jitsiRoomId = generateRoomId(newName);
      await addContact(elderlyUserId, {
        name: newName.trim(),
        photoURL,
        jitsiRoomId,
        contactUserId: '',
        displayOrder,
      });
      setNewName('');
      setPhotoFile(null);
      setShowAddForm(false);
    } catch (err) {
      setError(
        t('manageContacts.addFailed', { error: err instanceof Error ? err.message : String(err) }),
      );
    } finally {
      setIsAdding(false);
    }
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
        onClick={() => setShowAddForm(!showAddForm)}
        aria-label={t('manageContacts.addContact')}
      >
        {t('manageContacts.addContact')}
      </EasyCallButton>

      {error && (
        <div role="alert" className="alert alert-error">
          <EasyCallText as="span" variant="body">
            {error}
          </EasyCallText>
        </div>
      )}

      {showAddForm && (
        <div className="card card-body bg-base-200 gap-3">
          <label htmlFor="new-contact-name" className="sr-only">
            {t('manageContacts.contactName')}
          </label>
          <input
            id="new-contact-name"
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t('manageContacts.namePlaceholder')}
            className="input input-bordered w-full text-[length:var(--text-body)] min-h-14"
          />
          <input
            type="file"
            accept="image/*"
            className="file-input file-input-bordered w-full min-h-14 min-w-14"
            onChange={(e) => setPhotoFile(e.target.files?.[0] ?? null)}
            aria-label={t('manageContacts.choosePhoto')}
          />
          <div className="flex gap-3">
            <EasyCallButton
              variant="primary"
              onClick={() => {
                void handleAdd();
              }}
              disabled={!newName.trim() || isAdding}
              aria-label={t('manageContacts.saveNewContact')}
            >
              {isAdding ? t('common.saving') : t('common.save')}
            </EasyCallButton>
            <EasyCallButton
              variant="secondary"
              onClick={() => {
                setShowAddForm(false);
                setNewName('');
                setPhotoFile(null);
              }}
              aria-label={t('manageContacts.cancelAdd')}
            >
              {t('common.cancel')}
            </EasyCallButton>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {contacts.map((contact: Contact) => (
          <div
            key={contact.id}
            className="card card-body bg-base-200 flex-row items-center justify-between gap-3"
          >
            <EasyCallText as="span" variant="button" className="font-bold">
              {contact.name}
            </EasyCallText>
            <EasyCallButton
              variant="danger"
              onClick={() => setConfirmDeleteId(contact.id)}
              disabled={isDeleting}
              aria-label={t('manageContacts.removeContact', { name: contact.name })}
            >
              {t('manageContacts.remove')}
            </EasyCallButton>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={confirmDeleteId !== null}
        message={t('manageContacts.confirmRemove', {
          name: contactToDelete?.name ?? t('manageContacts.thisContact'),
        })}
        onConfirm={() => {
          void handleConfirmDelete();
        }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
