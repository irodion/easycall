import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useContactStore } from '@/stores/contactStore';
import { EasyCallText } from '@/components/shared/EasyCallText';
import { EasyCallButton } from '@/components/shared/EasyCallButton';

interface AddContactProps {
  userId: string;
}

type Step = 1 | 2 | 3;

function generateRoomId(name: string): string {
  const sanitized = name.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8);
  const suffix = crypto.randomUUID().replace(/-/g, '').slice(0, 6);
  return `easycall-${sanitized}-${suffix}`;
}

export function AddContact({ userId }: AddContactProps) {
  const navigate = useNavigate();
  const addContact = useContactStore((s) => s.addContact);
  const contacts = useContactStore((s) => s.contacts);
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const blobUrlRef = useRef<string | null>(null);

  // Revoke blob URL on unmount
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
    };
  }, []);

  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Revoke previous blob URL to prevent memory leaks
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
      const url = URL.createObjectURL(file);
      blobUrlRef.current = url;
      setPhotoPreview(url);
    }
  };

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const maxOrder = contacts.reduce((max, c) => Math.max(max, c.displayOrder), 0);
      const displayOrder = maxOrder + 1;
      await addContact(userId, {
        name,
        photoURL: null,
        jitsiRoomId: generateRoomId(name),
        contactUserId: '',
        displayOrder,
      });
      void navigate('/elderly');
    } finally {
      setIsSaving(false);
    }
  };

  if (step === 1) {
    return (
      <div className="min-h-screen bg-base-100 p-6 flex flex-col gap-6">
        <EasyCallText as="h1" variant="heading">Add Contact</EasyCallText>
        <EasyCallText as="h2" variant="body" className="font-bold">Step 1: Name</EasyCallText>
        <label htmlFor="contact-name" className="sr-only">
          Contact Name
        </label>
        <input
          id="contact-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Enter contact name"
          className="input input-bordered w-full text-[length:var(--text-body)] min-h-14"
          aria-label="Name"
        />
        <div className="flex gap-3 mt-auto">
          <EasyCallButton
            variant="primary"
            onClick={() => setStep(2)}
            disabled={name.trim() === ''}
            aria-label="Next"
          >
            Next
          </EasyCallButton>
        </div>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="min-h-screen bg-base-100 p-6 flex flex-col gap-6">
        <EasyCallText as="h1" variant="heading">Add Photo</EasyCallText>
        <EasyCallText variant="body" className="font-bold">Step 2: Photo (optional)</EasyCallText>
        {photoPreview && (
          <img src={photoPreview} alt="Preview" className="w-32 h-32 rounded-full object-cover mx-auto" />
        )}
        <input
          type="file"
          accept="image/*"
          onChange={handlePhotoChange}
          className="file-input file-input-bordered w-full min-h-14 min-w-14"
          aria-label="Choose photo"
        />
        <div className="flex gap-3 mt-auto">
          <EasyCallButton variant="secondary" onClick={() => setStep(1)} aria-label="Back">
            Back
          </EasyCallButton>
          <EasyCallButton variant="primary" onClick={() => setStep(3)} aria-label="Next">
            Next
          </EasyCallButton>
        </div>
      </div>
    );
  }

  // Step 3: Confirm
  return (
    <div className="min-h-screen bg-base-100 p-6 flex flex-col gap-6">
      <EasyCallText as="h1" variant="heading">Confirm</EasyCallText>
      <EasyCallText variant="body" className="font-bold">Step 3: Confirm</EasyCallText>
      {photoPreview ? (
        <img src={photoPreview} alt={name} className="w-32 h-32 rounded-full object-cover mx-auto" />
      ) : (
        <div className="w-32 h-32 rounded-full bg-primary flex items-center justify-center text-4xl font-bold text-primary-content mx-auto">
          {name[0] ?? '?'}
        </div>
      )}
      <EasyCallText as="p" variant="heading" className="text-center font-bold">
        {name}
      </EasyCallText>
      <div className="flex gap-3 mt-auto">
        <EasyCallButton variant="secondary" onClick={() => setStep(2)} aria-label="Back">
          Back
        </EasyCallButton>
        <EasyCallButton
          variant="primary"
          onClick={() => { void handleSave(); }}
          disabled={isSaving}
          aria-label="Save"
        >
          {isSaving ? 'Saving...' : 'Save'}
        </EasyCallButton>
      </div>
    </div>
  );
}
