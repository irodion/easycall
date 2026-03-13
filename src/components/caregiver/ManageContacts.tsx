import { useState, useEffect } from 'react';
import { useContactStore } from '@/stores/contactStore';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { EasyCallButton } from '@/components/shared/EasyCallButton';
import { EasyCallText } from '@/components/shared/EasyCallText';
import type { Contact } from '@/types/user';

interface ManageContactsProps {
  elderlyUserId: string;
}

export function ManageContacts({ elderlyUserId }: ManageContactsProps) {
  const contacts = useContactStore((s) => s.contacts);
  const addContact = useContactStore((s) => s.addContact);
  const removeContact = useContactStore((s) => s.removeContact);
  const subscribeToContacts = useContactStore((s) => s.subscribeToContacts);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    return subscribeToContacts(elderlyUserId);
  }, [elderlyUserId, subscribeToContacts]);

  const handleAdd = async () => {
    if (!newName.trim() || isAdding) return;
    setIsAdding(true);
    setError(null);
    try {
      const maxOrder = contacts.reduce((max, c) => Math.max(max, c.displayOrder), 0);
      const displayOrder = maxOrder + 1;
      const sanitized = newName.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
      const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 6);
      const jitsiRoomId = `easycall-${sanitized}-${suffix}`;
      await addContact(elderlyUserId, {
        name: newName.trim(),
        photoURL: null,
        jitsiRoomId,
        contactUserId: '',
        displayOrder,
      });
      setNewName('');
      setShowAddForm(false);
    } catch (err) {
      setError(`Failed to add contact: ${err instanceof Error ? err.message : String(err)}`);
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
      setError(`Failed to remove contact: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const contactToDelete = contacts.find((c) => c.id === confirmDeleteId);

  return (
    <div className="min-h-screen bg-base-100 p-6 flex flex-col gap-6">
      <EasyCallText as="h1" variant="heading">Manage Contacts</EasyCallText>

      <EasyCallButton
        variant="primary"
        onClick={() => setShowAddForm(!showAddForm)}
        aria-label="Add Contact"
      >
        + Add Contact
      </EasyCallButton>

      {error && (
        <div role="alert" className="alert alert-error">
          <EasyCallText as="span" variant="body">{error}</EasyCallText>
        </div>
      )}

      {showAddForm && (
        <div className="card card-body bg-base-200 gap-3">
          <label htmlFor="new-contact-name" className="sr-only">Contact name</label>
          <input
            id="new-contact-name"
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Contact name"
            className="input input-bordered w-full text-[length:var(--text-body)] min-h-14"
          />
          <input type="file" accept="image/*" className="file-input file-input-bordered w-full min-h-14 min-w-14" />
          <div className="flex gap-3">
            <EasyCallButton
              variant="primary"
              onClick={() => { void handleAdd(); }}
              disabled={!newName.trim() || isAdding}
              aria-label="Save new contact"
            >
              {isAdding ? 'Saving...' : 'Save'}
            </EasyCallButton>
            <EasyCallButton
              variant="secondary"
              onClick={() => { setShowAddForm(false); setNewName(''); }}
              aria-label="Cancel add"
            >
              Cancel
            </EasyCallButton>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-3">
        {contacts.map((contact: Contact) => (
          <div key={contact.id} className="card card-body bg-base-200 flex-row items-center justify-between gap-3">
            <EasyCallText as="span" variant="button" className="font-bold">
              {contact.name}
            </EasyCallText>
            <EasyCallButton
              variant="danger"
              onClick={() => setConfirmDeleteId(contact.id)}
              disabled={isDeleting}
              aria-label={`Remove ${contact.name}`}
            >
              Remove
            </EasyCallButton>
          </div>
        ))}
      </div>

      <ConfirmDialog
        open={confirmDeleteId !== null}
        message={`Are you sure you want to remove ${contactToDelete?.name ?? 'this contact'}?`}
        onConfirm={() => { void handleConfirmDelete(); }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
