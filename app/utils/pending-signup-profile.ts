const PENDING_SIGNUP_PROFILE_KEY = 'pending_signup_profile';

type PendingSignupProfile = {
  email: string;
  username: string;
  cpf: string;
  birth_date: string;
};

const isBrowser = () => typeof window !== 'undefined';

const normalizeEmail = (value: string) => String(value || '').trim().toLowerCase();

export const savePendingSignupProfile = (profile: PendingSignupProfile) => {
  if (!isBrowser()) return;

  window.localStorage.setItem(PENDING_SIGNUP_PROFILE_KEY, JSON.stringify(profile));
};

export const readPendingSignupProfile = (): PendingSignupProfile | null => {
  if (!isBrowser()) return null;

  const raw = window.localStorage.getItem(PENDING_SIGNUP_PROFILE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<PendingSignupProfile>;

    if (
      !normalizeEmail(parsed.email || '') ||
      !String(parsed.username || '').trim() ||
      !String(parsed.cpf || '').trim() ||
      !String(parsed.birth_date || '').trim()
    ) {
      return null;
    }

    return {
      email: normalizeEmail(parsed.email || ''),
      username: String(parsed.username || '').trim(),
      cpf: String(parsed.cpf || '').trim(),
      birth_date: String(parsed.birth_date || '').trim(),
    };
  } catch {
    return null;
  }
};

export const clearPendingSignupProfile = () => {
  if (!isBrowser()) return;

  window.localStorage.removeItem(PENDING_SIGNUP_PROFILE_KEY);
};

export const consumePendingSignupProfile = (email: string) => {
  const pendingProfile = readPendingSignupProfile();
  const normalizedEmail = normalizeEmail(email);

  if (!pendingProfile) return null;
  if (!normalizedEmail || pendingProfile.email !== normalizedEmail) return null;

  clearPendingSignupProfile();
  return pendingProfile;
};
