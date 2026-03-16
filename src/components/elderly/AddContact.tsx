import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useContactStore } from '@/stores/contactStore';
import { compressImage, blobToDataUrl } from '@/utils/compressImage';
import { generateRoomId } from '@/utils/generateRoomId';
import { EasyCallText } from '@/components/shared/EasyCallText';
import { EasyCallButton } from '@/components/shared/EasyCallButton';

interface AddContactProps {
  userId: string;
}

type Step = 1 | 2 | 3;

export function AddContact({ userId }: AddContactProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const addContact = useContactStore((s) => s.addContact);
  const contacts = useContactStore((s) => s.contacts);
  const [step, setStep] = useState<Step>(1);
  const [name, setName] = useState('');
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const blobUrlRef = useRef<string | null>(null);

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
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
      const url = URL.createObjectURL(file);
      blobUrlRef.current = url;
      setPhotoPreview(url);
      setPhotoFile(file);
    }
  };

  const handleSave = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setError(null);
    try {
      let photoURL: string | null = null;
      if (photoFile) {
        try {
          const compressed = await compressImage(photoFile);
          photoURL = await blobToDataUrl(compressed);
        } catch {
          setError(t('addContact.photoError'));
          setIsSaving(false);
          return;
        }
      }
      const maxOrder = contacts.reduce((max, c) => Math.max(max, c.displayOrder), 0);
      const displayOrder = maxOrder + 1;
      await addContact(userId, {
        name,
        photoURL,
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
        <EasyCallText as="h1" variant="heading">
          {t('addContact.title')}
        </EasyCallText>
        <EasyCallText as="h2" variant="body" className="font-bold">
          {t('addContact.step1')}
        </EasyCallText>
        <label htmlFor="contact-name" className="sr-only">
          {t('addContact.contactName')}
        </label>
        <input
          id="contact-name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t('addContact.namePlaceholder')}
          className="input input-bordered w-full text-[length:var(--text-body)] min-h-14"
          aria-label={t('addContact.contactName')}
        />
        <div className="flex gap-3 mt-auto">
          <EasyCallButton
            variant="primary"
            onClick={() => setStep(2)}
            disabled={name.trim() === ''}
            aria-label={t('common.next')}
          >
            {t('common.next')}
          </EasyCallButton>
        </div>
      </div>
    );
  }

  if (step === 2) {
    return (
      <div className="min-h-screen bg-base-100 p-6 flex flex-col gap-6">
        <EasyCallText as="h1" variant="heading">
          {t('addContact.addPhoto')}
        </EasyCallText>
        <EasyCallText variant="body" className="font-bold">
          {t('addContact.step2')}
        </EasyCallText>
        {photoPreview && (
          <img
            src={photoPreview}
            alt={t('addContact.preview')}
            className="w-32 h-32 rounded-full object-cover mx-auto"
          />
        )}
        <input
          type="file"
          accept="image/*"
          onChange={handlePhotoChange}
          className="file-input file-input-bordered w-full min-h-14 min-w-14"
          aria-label={t('addContact.choosePhoto')}
        />
        <div className="flex gap-3 mt-auto">
          <EasyCallButton
            variant="secondary"
            onClick={() => setStep(1)}
            aria-label={t('common.back')}
          >
            {t('common.back')}
          </EasyCallButton>
          <EasyCallButton
            variant="primary"
            onClick={() => setStep(3)}
            aria-label={t('common.next')}
          >
            {t('common.next')}
          </EasyCallButton>
        </div>
      </div>
    );
  }

  // Step 3: Confirm
  return (
    <div className="min-h-screen bg-base-100 p-6 flex flex-col gap-6">
      <EasyCallText as="h1" variant="heading">
        {t('addContact.confirmTitle')}
      </EasyCallText>
      <EasyCallText variant="body" className="font-bold">
        {t('addContact.step3')}
      </EasyCallText>
      {photoPreview ? (
        <img
          src={photoPreview}
          alt={name}
          className="w-32 h-32 rounded-full object-cover mx-auto"
        />
      ) : (
        <div className="w-32 h-32 rounded-full bg-primary flex items-center justify-center text-4xl font-bold text-primary-content mx-auto">
          {name[0] ?? '?'}
        </div>
      )}
      {error && (
        <div role="alert" className="alert alert-error">
          <EasyCallText as="span" variant="body">{error}</EasyCallText>
        </div>
      )}
      <EasyCallText as="p" variant="heading" className="text-center font-bold">
        {name}
      </EasyCallText>
      <div className="flex gap-3 mt-auto">
        <EasyCallButton
          variant="secondary"
          onClick={() => setStep(2)}
          aria-label={t('common.back')}
        >
          {t('common.back')}
        </EasyCallButton>
        <EasyCallButton
          variant="primary"
          onClick={() => {
            void handleSave();
          }}
          disabled={isSaving}
          aria-label={t('common.save')}
        >
          {isSaving ? t('common.saving') : t('common.save')}
        </EasyCallButton>
      </div>
    </div>
  );
}
