'use client';

import { useState, useMemo } from 'react';
import {
  X,
  Users,
  UserPlus,
  Heart,
  Star,
  Trash2,
  Edit2,
  Check,
  Search,
  Tag,
  Building2,
  CreditCard,
  Plus,
  Loader2,
  Filter,
} from 'lucide-react';
import { UserFavoriteContact } from '@/lib/favorite-contacts';

interface FavoriteContactsModalProps {
  isOpen: boolean;
  onClose: () => void;
  contacts: UserFavoriteContact[];
  onContactsUpdated: () => void;
  expenseCategories: string[];
  initialData?: Partial<UserFavoriteContact> | null;
}

const PRESET_GROUPS = [
  { id: 'ALL', label: 'ทั้งหมด', icon: '🌟' },
  { id: 'Family', label: 'ครอบครัว', icon: '👨‍👩‍👧' },
  { id: 'Friends', label: 'เพื่อนฝูง', icon: '🤝' },
  { id: 'Work', label: 'ที่ทำงาน', icon: '💼' },
  { id: 'Shop', label: 'ร้านค้า/ประจำ', icon: '🛒' },
  { id: 'Other', label: 'อื่นๆ', icon: '🏷️' },
];

const PRESET_ICONS = ['💖', '👨‍👩‍👧', '👩', '👨', '👵', '👴', '🤝', '💼', '🛒', '☕', '🚗', '🏠', '⭐'];

const PRESET_BANKS = [
  { code: '', label: 'ทุกธนาคาร (ไม่จำกัด)' },
  { code: 'BBL', label: 'BBL (กรุงเทพ)' },
  { code: 'KBANK', label: 'KBANK (กสิกรไทย)' },
  { code: 'SCB', label: 'SCB (ไทยพาณิชย์)' },
  { code: 'KTB', label: 'KTB (กรุงไทย)' },
  { code: 'BAY', label: 'BAY (กรุงศรี)' },
  { code: 'TTB', label: 'TTB (ทหารไทยธนชาต)' },
  { code: 'GSB', label: 'GSB (ออมสิน)' },
  { code: 'PROMPTPAY', label: 'พร้อมเพย์' },
  { code: 'TRUEMONEY', label: 'TrueMoney' },
];

export default function FavoriteContactsModal({
  isOpen,
  onClose,
  contacts,
  onContactsUpdated,
  expenseCategories,
  initialData,
}: FavoriteContactsModalProps) {
  const [selectedGroup, setSelectedGroup] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);

  // Form State
  const [nickname, setNickname] = useState('');
  const [groupName, setGroupName] = useState('Family');
  const [icon, setIcon] = useState('💖');
  const [defaultCategory, setDefaultCategory] = useState('ให้ครอบครัว');
  const [defaultType, setDefaultType] = useState<'EXPENSE' | 'INCOME' | 'TRANSFER'>('EXPENSE');
  const [matchedNamesText, setMatchedNamesText] = useState('');
  const [matchedAccountsText, setMatchedAccountsText] = useState('');
  const [bankCode, setBankCode] = useState('');
  const [note, setNote] = useState('');

  // Open Edit/Add form with pre-filled initialData if provided
  const handleOpenAddForm = (prefill?: Partial<UserFavoriteContact> | null) => {
    setIsEditing(true);
    setEditingId(prefill?.id || null);
    setNickname(prefill?.nickname || '');
    setGroupName(prefill?.group_name || 'Family');
    setIcon(prefill?.icon || '💖');
    setDefaultCategory(prefill?.default_category || (expenseCategories.includes('ให้ครอบครัว') ? 'ให้ครอบครัว' : expenseCategories[0] || 'อื่นๆ'));
    setDefaultType(prefill?.default_type || 'EXPENSE');
    setMatchedNamesText(prefill?.matched_names ? prefill.matched_names.join(', ') : '');
    setMatchedAccountsText(prefill?.matched_accounts ? prefill.matched_accounts.join(', ') : '');
    setBankCode(prefill?.bank_code || '');
    setNote(prefill?.note || '');
  };

  // If initialData changes when opened, pre-fill and switch to edit mode
  useMemo(() => {
    if (initialData && isOpen) {
      handleOpenAddForm(initialData);
    }
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  // Filter contacts by group and search
  const filteredContacts = contacts.filter((c) => {
    if (selectedGroup !== 'ALL' && c.group_name !== selectedGroup) return false;
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      c.nickname.toLowerCase().includes(q) ||
      c.group_name.toLowerCase().includes(q) ||
      (c.default_category && c.default_category.toLowerCase().includes(q)) ||
      (c.matched_names && c.matched_names.some((n) => n.toLowerCase().includes(q))) ||
      (c.matched_accounts && c.matched_accounts.some((a) => a.includes(q)))
    );
  });

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nickname.trim()) {
      alert('กรุณาระบุชื่อเล่นหรือชื่อเรียก เช่น คุณแม่, พี่บอย, ภรรยา');
      return;
    }

    try {
      setIsSaving(true);
      const namesArray = matchedNamesText
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter(Boolean);
      const accountsArray = matchedAccountsText
        .split(/[,;\n]/)
        .map((s) => s.trim())
        .filter(Boolean);

      const payload = {
        id: editingId || undefined,
        nickname: nickname.trim(),
        group_name: groupName.trim(),
        icon,
        default_category: defaultCategory.trim(),
        default_type: defaultType,
        matched_names: namesArray,
        matched_accounts: accountsArray,
        bank_code: bankCode.trim() || null,
        note: note.trim() || null,
      };

      const res = await fetch('/api/slip-inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_contact',
          contact: payload,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'บันทึกไม่สำเร็จ');

      setIsEditing(false);
      setEditingId(null);
      onContactsUpdated();
    } catch (err: any) {
      alert(`บันทึกไม่สำเร็จ: ${err.message}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteContact = async (id: string, name: string) => {
    if (!confirm(`คุณต้องการลบ "${name}" ออกจากรายชื่อคนโปรดใช่หรือไม่?`)) return;

    try {
      setIsDeletingId(id);
      const res = await fetch('/api/slip-inbox', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_contact',
          id,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'ลบไม่สำเร็จ');
      }

      onContactsUpdated();
    } catch (err: any) {
      alert(`ลบไม่สำเร็จ: ${err.message}`);
    } finally {
      setIsDeletingId(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-pink-100 text-pink-600 flex items-center justify-center shadow-xs">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <span>จัดการคนโปรด & กลุ่มครอบครัว</span>
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-pink-100 text-pink-700">
                  {contacts.length} รายการ
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                ผูกชื่อ/เลขบัญชีเพื่อจัดหมวดหมู่อัตโนมัติ (เช่น ให้ครอบครัว) และแสดงชื่อเรียกในสลิป
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {isEditing ? (
            /* Add / Edit Form */
            <form onSubmit={handleSaveContact} className="p-5 bg-slate-50 border border-slate-200 rounded-xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                  <Heart className="w-4 h-4 text-pink-500" />
                  <span>{editingId ? 'แก้ไขข้อมูลคนโปรด' : 'เพิ่มคนโปรดใหม่'}</span>
                </h3>
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="text-xs text-slate-500 hover:text-slate-700 cursor-pointer"
                >
                  ยกเลิก
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Nickname */}
                <div className="sm:col-span-2">
                  <label className="text-xs font-semibold text-slate-700 block mb-1">
                    ชื่อเล่น / ชื่อเรียก <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder="เช่น คุณแม่, นายสมชาย, พี่ชาย, Netflix"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-pink-500 outline-hidden bg-white"
                  />
                </div>

                {/* Group */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">กลุ่ม</label>
                  <select
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-pink-500 outline-hidden bg-white cursor-pointer"
                  >
                    <option value="Family">👨‍👩‍👧 Family (ครอบครัว)</option>
                    <option value="Friends">🤝 Friends (เพื่อนฝูง)</option>
                    <option value="Work">💼 Work (ที่ทำงาน)</option>
                    <option value="Shop">🛒 Shop (ร้านค้า/ประจำ)</option>
                    <option value="Other">🏷️ Other (อื่นๆ)</option>
                  </select>
                </div>
              </div>

              {/* Icon & Category */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Icon Selection */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">ไอคอนประจำตัว</label>
                  <div className="flex flex-wrap gap-1.5 p-1.5 bg-white border border-slate-300 rounded-lg">
                    {PRESET_ICONS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => setIcon(emoji)}
                        className={`w-7 h-7 text-sm flex items-center justify-center rounded-md transition cursor-pointer ${
                          icon === emoji ? 'bg-pink-100 ring-2 ring-pink-500' : 'hover:bg-slate-100'
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Auto Category */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">หมวดหมู่อัตโนมัติ</label>
                  <select
                    value={defaultCategory}
                    onChange={(e) => setDefaultCategory(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-pink-500 outline-hidden bg-white cursor-pointer"
                  >
                    <option value="ให้ครอบครัว">ให้ครอบครัว</option>
                    {expenseCategories
                      .filter((c) => c !== 'ให้ครอบครัว')
                      .map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                  </select>
                </div>

                {/* Bank */}
                <div>
                  <label className="text-xs font-semibold text-slate-700 block mb-1">ธนาคาร (ทางเลือก)</label>
                  <select
                    value={bankCode}
                    onChange={(e) => setBankCode(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-pink-500 outline-hidden bg-white cursor-pointer"
                  >
                    {PRESET_BANKS.map((b) => (
                      <option key={b.code} value={b.code}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Match Criteria */}
              <div className="p-3 bg-white border border-pink-100 rounded-xl space-y-3">
                <span className="text-xs font-bold text-pink-700 block">
                  เงื่อนไขการจับคู่จากสลิป (ระบบจะตรวจข้อความจากสลิปอัตโนมัติ):
                </span>

                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-0.5">
                    ชื่อผู้รับ/ผู้โอนในสลิป (คั่นด้วยจุลภาค , ถ้ามีหลายชื่อ):
                  </label>
                  <input
                    type="text"
                    value={matchedNamesText}
                    onChange={(e) => setMatchedNamesText(e.target.value)}
                    placeholder="เช่น นางสมหญิง ใจดี, นายสมชาย เข็มกลัด, SOMYING"
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-pink-500 outline-hidden"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-slate-600 block mb-0.5">
                    เลขบัญชี หรือ เลขบัญชีแบบเซ็นเซอร์ (xxx) ในสลิป:
                  </label>
                  <input
                    type="text"
                    value={matchedAccountsText}
                    onChange={(e) => setMatchedAccountsText(e.target.value)}
                    placeholder="เช่น 123-4-xxx567, 567, 0812345678"
                    className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-2 focus:ring-pink-500 outline-hidden"
                  />
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    * ระบบรองรับทั้งเลขเต็ม เลขแบบเซ็นเซอร์ (xxx) และเลขท้าย 3-4 หลัก
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200 rounded-lg transition cursor-pointer"
                >
                  ยกเลิก
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-bold text-white bg-pink-600 hover:bg-pink-700 disabled:opacity-50 rounded-lg transition shadow-xs cursor-pointer"
                >
                  {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                  <span>{editingId ? 'บันทึกการแก้ไข' : 'เพิ่มคนโปรด'}</span>
                </button>
              </div>
            </form>
          ) : (
            /* Normal List Mode */
            <>
              {/* Filter Bar & Add Button */}
              <div className="flex flex-wrap items-center justify-between gap-2">
                {/* Group Filter Tabs */}
                <div className="flex flex-wrap items-center gap-1">
                  {PRESET_GROUPS.map((g) => (
                    <button
                      key={g.id}
                      type="button"
                      onClick={() => setSelectedGroup(g.id)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition cursor-pointer ${
                        selectedGroup === g.id
                          ? 'bg-pink-600 text-white shadow-xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      <span>{g.icon}</span>
                      <span>{g.label}</span>
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={() => handleOpenAddForm(null)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-white bg-pink-600 hover:bg-pink-700 rounded-xl transition shadow-xs cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>เพิ่มคนโปรด</span>
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="ค้นหาชื่อเล่น, ชื่อจริง, เลขบัญชี, หมวดหมู่..."
                  className="w-full pl-9 pr-3 py-1.5 text-xs border border-slate-200 rounded-xl focus:ring-2 focus:ring-pink-500 outline-hidden bg-white"
                />
              </div>

              {/* Contacts Grid */}
              {filteredContacts.length === 0 ? (
                <div className="text-center py-10 px-4 bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
                  <div className="w-12 h-12 mx-auto rounded-full bg-pink-50 text-pink-400 flex items-center justify-center mb-2">
                    <Heart className="w-6 h-6" />
                  </div>
                  <h4 className="text-sm font-semibold text-slate-700">ยังไม่มีรายชื่อคนโปรดในกลุ่มนี้</h4>
                  <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                    กดปุ่ม &quot;เพิ่มคนโปรด&quot; หรือกด &quot;จำคนนี้&quot; ที่รายการสลิปเพื่อให้ระบบจำและจัดหมวดหมู่อัตโนมัติ
                  </p>
                  <button
                    type="button"
                    onClick={() => handleOpenAddForm(null)}
                    className="mt-3 inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-pink-700 bg-pink-50 hover:bg-pink-100 border border-pink-200 rounded-xl transition cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>เพิ่มคนโปรดคนแรก</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {filteredContacts.map((contact) => (
                    <div
                      key={contact.id}
                      className="p-3.5 bg-white border border-slate-200 hover:border-pink-300 rounded-xl shadow-2xs hover:shadow-xs transition space-y-2 group"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span className="text-2xl">{contact.icon || '💖'}</span>
                          <div>
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-bold text-slate-800">{contact.nickname}</span>
                              <span className="px-1.5 py-0.5 text-[10px] font-semibold rounded bg-slate-100 text-slate-600">
                                {contact.group_name}
                              </span>
                            </div>
                            {contact.default_category && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-pink-700 mt-0.5">
                                <Tag className="w-3 h-3 text-pink-500" />
                                <span>{contact.default_category}</span>
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition">
                          <button
                            type="button"
                            onClick={() => handleOpenAddForm(contact)}
                            className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-md transition cursor-pointer"
                            title="แก้ไข"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteContact(contact.id, contact.nickname)}
                            disabled={isDeletingId === contact.id}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition cursor-pointer"
                            title="ลบ"
                          >
                            {isDeletingId === contact.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Trash2 className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                      </div>

                      {/* Matching info */}
                      <div className="text-[11px] text-slate-500 bg-slate-50 p-2 rounded-lg space-y-1">
                        {contact.matched_names && contact.matched_names.length > 0 && (
                          <div className="truncate">
                            <span className="font-semibold text-slate-600">ชื่อ: </span>
                            <span>{contact.matched_names.join(', ')}</span>
                          </div>
                        )}
                        {contact.matched_accounts && contact.matched_accounts.length > 0 && (
                          <div className="truncate font-mono">
                            <span className="font-semibold text-slate-600 font-sans">บัญชี: </span>
                            <span>{contact.matched_accounts.join(', ')}</span>
                          </div>
                        )}
                        {contact.bank_code && (
                          <div>
                            <span className="font-semibold text-slate-600">ธนาคาร: </span>
                            <span className="font-bold text-indigo-600">{contact.bank_code}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
          <span>* ข้อมูลคนโปรดจะถูกนำไปจับคู่ชื่อและบัญชีอัตโนมัติเมื่อเพิ่มหรือสแกนสลิป</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 font-semibold text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-xl transition cursor-pointer"
          >
            ปิดหน้าต่าง
          </button>
        </div>
      </div>
    </div>
  );
}
