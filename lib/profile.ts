// lib/profile.ts
export interface UserProfile {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  preferred_currency?: string;
  gender: string | null;
  age: number | null;
  updated_at?: string;
  email?: string | null;
}

export const GENDER_OPTIONS = [
  { value: 'male', label: 'ชาย (Male)', icon: '👨' },
  { value: 'female', label: 'หญิง (Female)', icon: '👩' },
  { value: 'other', label: 'อื่นๆ (Other)', icon: '✨' },
  { value: 'unspecified', label: 'ไม่ระบุ (Prefer not to say)', icon: '🔒' },
];

/**
 * Returns user initials (up to 2 letters) for avatar fallback.
 */
export function getInitials(profile?: UserProfile | null, email?: string | null): string {
  if (profile?.first_name && profile?.last_name) {
    return (profile.first_name[0] + profile.last_name[0]).toUpperCase();
  }
  if (profile?.first_name) {
    return profile.first_name.slice(0, 2).toUpperCase();
  }
  if (profile?.full_name) {
    const parts = profile.full_name.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return parts[0].slice(0, 2).toUpperCase();
  }
  if (email) {
    return email.slice(0, 2).toUpperCase();
  }
  return 'U';
}

/**
 * Client-side avatar image compression and resizing (max 400x400 square).
 * Saves user bandwidth, storage tokens, and prevents oversized image uploads.
 */
export async function compressAvatarImage(file: File, maxDim = 400, quality = 0.85): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();

    reader.onload = (e) => {
      if (typeof e.target?.result !== 'string') {
        reject(new Error('Failed to read image file'));
        return;
      }
      img.src = e.target.result;
    };

    img.onload = () => {
      // Calculate crop to center square
      const size = Math.min(img.width, img.height);
      const startX = (img.width - size) / 2;
      const startY = (img.height - size) / 2;

      const targetDim = Math.min(size, maxDim);
      const canvas = document.createElement('canvas');
      canvas.width = targetDim;
      canvas.height = targetDim;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas 2d context'));
        return;
      }

      // Draw cropped and resized image
      ctx.drawImage(img, startX, startY, size, size, 0, 0, targetDim, targetDim);

      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error('Canvas toBlob returned null'));
          }
        },
        'image/jpeg',
        quality
      );
    };

    img.onerror = () => reject(new Error('Failed to load image into DOM'));
    reader.onerror = () => reject(new Error('FileReader error occurred'));

    reader.readAsDataURL(file);
  });
}
