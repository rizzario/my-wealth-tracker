// app/profile/page.tsx
'use client';

import { useState, useEffect, useRef } from 'react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import {
  UserProfile,
  GENDER_OPTIONS,
  getInitials,
  compressAvatarImage,
} from '@/lib/profile';
import {
  User,
  Camera,
  ArrowLeft,
  Check,
  AlertCircle,
  Loader2,
  Trash2,
  Upload,
  Mail,
  ShieldCheck,
  Sparkles,
  LogOut,
  Calendar,
} from 'lucide-react';

export default function ProfilePage() {
  const router = useRouter();
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [userId, setUserId] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [authProvider, setAuthProvider] = useState<string>('email');

  // Form states
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [gender, setGender] = useState('unspecified');
  const [age, setAge] = useState<string>('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [previewAvatar, setPreviewAvatar] = useState<string | null>(null);

  useEffect(() => {
    async function loadUserProfile() {
      try {
        setLoading(true);
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          router.push('/login');
          return;
        }

        setUserId(user.id);
        setEmail(user.email || '');
        setAuthProvider(user.app_metadata?.provider || 'email');

        // Fetch existing profile from public.profiles
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .maybeSingle();

        if (profile) {
          setFirstName(profile.first_name || '');
          setLastName(profile.last_name || '');
          setGender(profile.gender || 'unspecified');
          setAge(profile.age != null ? String(profile.age) : '');
          setAvatarUrl(profile.avatar_url || null);
        } else {
          // If no row yet, prefill from OAuth metadata if available
          const rawMeta = user.user_metadata || {};
          const fullName = rawMeta.full_name || rawMeta.name || '';
          const nameParts = fullName.split(' ');
          setFirstName(rawMeta.first_name || nameParts[0] || '');
          setLastName(rawMeta.last_name || nameParts.slice(1).join(' ') || '');
          setAvatarUrl(rawMeta.avatar_url || rawMeta.picture || null);
        }
      } catch (err: any) {
        console.error('Load profile error:', err);
        setErrorMessage('ไม่สามารถโหลดข้อมูลโปรไฟล์ได้ กรุณาลองใหม่อีกครั้ง');
      } finally {
        setLoading(false);
      }
    }

    loadUserProfile();
  }, [router, supabase]);

  // Handle local image file selection & upload to Supabase Storage
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    // Reset input
    if (fileInputRef.current) fileInputRef.current.value = '';

    try {
      setUploadingImage(true);
      setErrorMessage(null);

      // Local preview
      const localUrl = URL.createObjectURL(file);
      setPreviewAvatar(localUrl);

      // Compress client-side to max 400x400 square JPEG
      const compressedBlob = await compressAvatarImage(file, 400, 0.85);

      // Upload path: <userId>/avatar_<timestamp>.jpg
      const fileName = `${userId}/avatar_${Date.now()}.jpg`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(fileName, compressedBlob, {
          contentType: 'image/jpeg',
          upsert: true,
        });

      if (uploadError) {
        // If storage bucket is missing or RLS blocked, report helpful error
        if (uploadError.message?.includes('bucket not found') || uploadError.message?.includes('Bucket not found')) {
          throw new Error('ยังไม่ได้สร้าง Storage Bucket "avatars" บน Supabase กรุณารันสคริปต์ SQL ก่อน');
        }
        throw uploadError;
      }

      // Get public URL
      const {
        data: { publicUrl },
      } = supabase.storage.from('avatars').getPublicUrl(fileName);

      setAvatarUrl(publicUrl);
      setPreviewAvatar(null);
      setSuccessMessage('อัปโหลดรูปภาพโปรไฟล์สำเร็จ (อย่าลืมกดบันทึกข้อมูล)');
    } catch (err: any) {
      console.error('Avatar upload error:', err);
      setPreviewAvatar(null);
      setErrorMessage(err.message || 'เกิดข้อผิดพลาดในการอัปโหลดรูปภาพ');
    } finally {
      setUploadingImage(false);
    }
  };

  // Remove current avatar
  const handleRemoveAvatar = () => {
    setAvatarUrl(null);
    setPreviewAvatar(null);
    setSuccessMessage('นำรูปโปรไฟล์ออกแล้ว (อย่าลืมกดบันทึกข้อมูล)');
  };

  // Submit profile updates
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userId) return;

    try {
      setSaving(true);
      setSuccessMessage(null);
      setErrorMessage(null);

      const parsedAge = age.trim() !== '' ? parseInt(age.trim(), 10) : null;
      if (parsedAge !== null && (isNaN(parsedAge) || parsedAge < 0 || parsedAge > 150)) {
        setErrorMessage('กรุณาระบุอายุให้ถูกต้อง (ระหว่าง 0 ถึง 150 ปี)');
        setSaving(false);
        return;
      }

      const trimmedFirst = firstName.trim();
      const trimmedLast = lastName.trim();
      const computedFullName =
        trimmedFirst || trimmedLast
          ? `${trimmedFirst} ${trimmedLast}`.trim()
          : email.split('@')[0];

      const profilePayload = {
        id: userId,
        first_name: trimmedFirst || null,
        last_name: trimmedLast || null,
        full_name: computedFullName,
        gender: gender || null,
        age: parsedAge,
        avatar_url: avatarUrl,
        updated_at: new Date().toISOString(),
      };

      const { error: upsertError } = await supabase
        .from('profiles')
        .upsert(profilePayload);

      if (upsertError) throw upsertError;

      setSuccessMessage('บันทึกข้อมูลโปรไฟล์เรียบร้อยแล้ว!');
      setTimeout(() => {
        setSuccessMessage(null);
      }, 4000);
    } catch (err: any) {
      console.error('Save profile error:', err);
      setErrorMessage(err.message || 'ไม่สามารถบันทึกข้อมูลได้ กรุณาลองใหม่อีกครั้ง');
    } finally {
      setSaving(false);
    }
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  };

  const currentDisplayAvatar = previewAvatar || avatarUrl;
  const initials = getInitials(
    {
      id: userId,
      full_name: null,
      first_name: firstName,
      last_name: lastName,
      avatar_url: null,
      gender: null,
      age: null,
    },
    email
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
        <div className="flex items-center gap-2 text-sm text-slate-600 bg-white px-5 py-3 rounded-2xl shadow-xs border border-slate-200">
          <Loader2 className="w-4 h-4 animate-spin text-emerald-600" />
          <span>กำลังโหลดข้อมูลโปรไฟล์...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-16">
      {/* Top Navigation Bar */}
      <header className="bg-emerald-950 text-white border-b border-emerald-900 sticky top-0 z-30 shadow-md">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.push('/')}
            className="flex items-center gap-2 text-xs sm:text-sm font-semibold text-emerald-200 hover:text-white transition-colors cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>กลับสู่หน้าหลัก</span>
          </button>

          <div className="flex items-center gap-2">
            <span className="text-xs text-emerald-300 font-medium hidden sm:inline">
              Personal Wealth Hub
            </span>
          </div>
        </div>
      </header>

      {/* Main Content Container */}
      <main className="max-w-3xl mx-auto px-4 pt-6 sm:pt-10">
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200/90 overflow-hidden">
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-emerald-900 via-emerald-800 to-teal-900 p-6 sm:p-8 text-white relative">
            <div className="flex flex-col sm:flex-row items-center gap-5 sm:gap-6 text-center sm:text-left">
              {/* Avatar Uploader Circle */}
              <div className="relative group shrink-0">
                <div className="w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden border-3 border-white/90 shadow-lg bg-emerald-800 flex items-center justify-center text-white relative">
                  {currentDisplayAvatar ? (
                    <img
                      src={currentDisplayAvatar}
                      alt="Avatar"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-3xl sm:text-4xl font-bold font-mono tracking-wider text-emerald-100">
                      {initials}
                    </span>
                  )}

                  {/* Uploading Overlay */}
                  {uploadingImage && (
                    <div className="absolute inset-0 bg-black/60 flex flex-col items-center justify-center text-white text-[11px] font-medium gap-1">
                      <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
                      <span>กำลังอัปโหลด...</span>
                    </div>
                  )}

                  {/* Hover Overlay to Trigger Upload */}
                  {!uploadingImage && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center text-white text-[11px] font-medium gap-1 cursor-pointer"
                      title="คลิกเพื่อเปลี่ยนรูปโปรไฟล์"
                    >
                      <Camera className="w-5 h-5" />
                      <span>เปลี่ยนรูป</span>
                    </button>
                  )}
                </div>

                {/* Floating Camera Button (Mobile Friendly) */}
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploadingImage}
                  className="absolute bottom-0 right-0 p-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-full shadow-md border-2 border-white transition cursor-pointer"
                  title="อัปโหลดรูปภาพ"
                  aria-label="อัปโหลดรูปภาพ"
                >
                  <Camera className="w-4 h-4" />
                </button>

                {/* Hidden File Input */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </div>

              {/* User Title & Info */}
              <div className="space-y-1.5 flex-1 min-w-0">
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2">
                  <h1 className="text-xl sm:text-2xl font-bold truncate">
                    {firstName || lastName
                      ? `${firstName} ${lastName}`.trim()
                      : email.split('@')[0]}
                  </h1>
                  <span className="text-[10px] font-semibold bg-emerald-700/80 text-emerald-100 px-2 py-0.5 rounded-full border border-emerald-600/60 inline-flex items-center gap-1">
                    <ShieldCheck className="w-3 h-3 text-emerald-300" />
                    บัญชีผู้ใช้
                  </span>
                </div>

                <p className="text-xs sm:text-sm text-emerald-200/90 truncate flex items-center justify-center sm:justify-start gap-1.5">
                  <Mail className="w-3.5 h-3.5 opacity-80" />
                  <span>{email}</span>
                </p>

                <p className="text-[11px] text-emerald-300/80">
                  ระบบล็อกอินผ่าน: <strong className="capitalize text-white">{authProvider}</strong>
                </p>
              </div>

              {/* Remove Avatar Button (If avatar exists) */}
              {avatarUrl && (
                <button
                  type="button"
                  onClick={handleRemoveAvatar}
                  disabled={uploadingImage || saving}
                  className="self-center sm:self-start text-[11px] text-emerald-200 hover:text-rose-200 bg-emerald-900/60 hover:bg-rose-950/60 border border-emerald-700/60 hover:border-rose-800/80 px-2.5 py-1 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>ลบรูปโปรไฟล์</span>
                </button>
              )}
            </div>
          </div>

          {/* Alert Messages */}
          {successMessage && (
            <div className="m-5 p-3.5 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl flex items-center gap-2.5 text-xs sm:text-sm animate-in fade-in duration-200">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {errorMessage && (
            <div className="m-5 p-3.5 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl flex items-start gap-2.5 text-xs sm:text-sm animate-in fade-in duration-200">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <span className="block font-semibold">พบข้อผิดพลาด:</span>
                <span>{errorMessage}</span>
              </div>
            </div>
          )}

          {/* Profile Form */}
          <form onSubmit={handleSaveProfile} className="p-6 sm:p-8 space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <User className="w-4 h-4 text-emerald-600" />
                <span>ข้อมูลส่วนตัว (Personal Details)</span>
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                ข้อมูลส่วนนี้เป็นทางเลือก (Optional) สามารถระบุหรือเว้นว่างไว้ได้ตามต้องการ
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              {/* ชื่อ (First Name) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  ชื่อ (First Name)
                </label>
                <input
                  type="text"
                  placeholder="เช่น กิตติกร"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl bg-slate-50/50 focus:bg-white outline-none focus:ring-2 focus:ring-emerald-500 transition font-medium"
                />
              </div>

              {/* นามสกุล (Last Name / Surname) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  นามสกุล (Last Name / Surname)
                </label>
                <input
                  type="text"
                  placeholder="เช่น วัฒนาสกุล"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl bg-slate-50/50 focus:bg-white outline-none focus:ring-2 focus:ring-emerald-500 transition font-medium"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
              {/* เพศ (Gender) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  เพศ (Gender)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {GENDER_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setGender(opt.value)}
                      className={`px-3 py-2 text-xs font-semibold rounded-xl border text-left transition flex items-center gap-2 cursor-pointer ${
                        gender === opt.value
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-950 shadow-xs ring-1 ring-emerald-500'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:border-slate-300'
                      }`}
                    >
                      <span className="text-sm">{opt.icon}</span>
                      <span className="truncate">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* อายุ (Age) */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
                  <span>อายุ (Age)</span>
                  <span className="text-[11px] text-slate-400 font-normal">ปีบริบูรณ์</span>
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="150"
                    placeholder="เช่น 28"
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-xl bg-slate-50/50 focus:bg-white outline-none focus:ring-2 focus:ring-emerald-500 transition font-mono font-medium"
                  />
                  <div className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-400 pointer-events-none">
                    ปี
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  ใช้สำหรับสรุปสถิติการวางแผนเกษียณและประกัน
                </p>
              </div>
            </div>

            {/* Read-only Security Summary Box */}
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>การปกป้องข้อมูลส่วนบุคคล (Row Level Security)</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                ข้อมูลโปรไฟล์ของคุณได้รับการเข้ารหัสและป้องกันด้วยระบบ Row Level Security (RLS)
                ของ Supabase เฉพาะเจ้าของบัญชีเท่านั้นที่สามารถเข้าถึงและแก้ไขข้อมูลนี้ได้
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={handleSignOut}
                className="w-full sm:w-auto px-4 py-2 text-xs font-semibold text-rose-700 hover:text-rose-800 bg-rose-50 hover:bg-rose-100/80 rounded-xl transition cursor-pointer flex items-center justify-center gap-1.5"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>ออกจากระบบ</span>
              </button>

              <div className="flex items-center gap-2.5 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => router.push('/')}
                  className="flex-1 sm:flex-initial px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-xl transition cursor-pointer"
                >
                  ยกเลิก
                </button>

                <button
                  type="submit"
                  disabled={saving || uploadingImage}
                  className="flex-1 sm:flex-initial px-5 py-2.5 text-xs sm:text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 rounded-xl shadow-xs transition disabled:opacity-50 cursor-pointer flex items-center justify-center gap-1.5"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>กำลังบันทึก...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>บันทึกข้อมูลโปรไฟล์</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}
