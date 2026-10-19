import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  TextInput,
  ScrollView,
  Alert,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import {
  scanSlipWithAI,
  saveSlipToInbox,
  ParsedSlip,
} from '../services/slipScanner';
import { parseThaiBankSlipOcr } from '../services/slip-regex-parser';
import { STANDARD_CATEGORIES } from '../config';

interface SlipScannerViewProps {
  onSavedSuccess?: () => void;
}

export const SlipScannerView: React.FC<SlipScannerViewProps> = ({ onSavedSuccess }) => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [parsedSlip, setParsedSlip] = useState<ParsedSlip | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [showTextInput, setShowTextInput] = useState(false);
  const [rawOcrInput, setRawOcrInput] = useState('');

  // Editable fields state
  const [amountInput, setAmountInput] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('อาหาร & เครื่องดื่ม');
  const [selectedType, setSelectedType] = useState<'EXPENSE' | 'INCOME' | 'TRANSFER'>('EXPENSE');
  const [memoInput, setMemoInput] = useState('');

  const pickImage = async (useCamera: boolean) => {
    try {
      setSaveSuccess(false);
      setParsedSlip(null);
      setShowTextInput(false);

      // Check permissions
      if (useCamera) {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Denied', 'Camera permission is required to scan slips.');
          return;
        }
      } else {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          Alert.alert('Permission Denied', 'Photo library permission is required to select slips.');
          return;
        }
      }

      // allowsEditing: false disables the crop border selection completely!
      const result = useCamera
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            allowsEditing: false,
            quality: 0.8,
            base64: true,
          })
        : await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: false,
            quality: 0.8,
            base64: true,
          });

      if (result.canceled || !result.assets || result.assets.length === 0) {
        return;
      }

      const asset = result.assets[0];
      setSelectedImage(asset.uri);

      if (!asset.base64) {
        Alert.alert('Error', 'Could not read image data.');
        return;
      }

      // Start AI Scan
      setIsScanning(true);
      try {
        const parsed = await scanSlipWithAI(asset.base64);
        setParsedSlip(parsed);
        setAmountInput(parsed.amount ? parsed.amount.toString() : '');
        setSelectedCategory(parsed.category || 'อาหาร & เครื่องดื่ม');
        setSelectedType(parsed.type);
        setMemoInput(parsed.memo || '');
      } catch (scanErr: any) {
        Alert.alert('Scan Failed', scanErr.message || 'Unable to parse slip with AI.');
      } finally {
        setIsScanning(false);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message || 'Something went wrong.');
      setIsScanning(false);
    }
  };

  // 100% On-Device Local Regex Parser (No Cloud Call, Pure iPhone Regex)
  const handleParseLocalOcrText = () => {
    if (!rawOcrInput.trim()) {
      Alert.alert('ข้อความว่างเปล่า', 'กรุณาวางข้อความ OCR ที่คัดลอกมาจากรูปสลิปใน iPhone');
      return;
    }

    try {
      const parsedRegex = parseThaiBankSlipOcr(rawOcrInput);
      const parsed: ParsedSlip = {
        amount: parsedRegex.amount,
        transaction_date: parsedRegex.transaction_date || new Date().toISOString(),
        type: parsedRegex.type,
        category: parsedRegex.category || 'อื่นๆ',
        sender_bank: parsedRegex.sender_bank,
        sender_account_masked: parsedRegex.sender_account_masked,
        sender_name: parsedRegex.sender_name,
        receiver_bank: parsedRegex.receiver_bank,
        receiver_account_masked: parsedRegex.receiver_account_masked,
        receiver_name: parsedRegex.receiver_name,
        memo: parsedRegex.memo,
        reference_number: parsedRegex.reference_number,
        confidence_score: parsedRegex.confidence_score,
        raw_text: rawOcrInput,
      };

      setParsedSlip(parsed);
      setAmountInput(parsed.amount ? parsed.amount.toString() : '');
      setSelectedCategory(parsed.category);
      setSelectedType(parsed.type);
      setMemoInput(parsed.memo || '');
      setShowTextInput(false);
    } catch (err: any) {
      Alert.alert('Parse Error', err.message || 'Could not parse text locally.');
    }
  };

  const handleSaveToInbox = async () => {
    if (!parsedSlip) return;

    const parsedAmount = parseFloat(amountInput);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert('Invalid Amount', 'Please enter a valid amount greater than 0.');
      return;
    }

    setIsSaving(true);
    try {
      const finalSlip: ParsedSlip = {
        ...parsedSlip,
        amount: parsedAmount,
        category: selectedCategory,
        type: selectedType,
        memo: memoInput.trim() || parsedSlip.memo,
      };

      await saveSlipToInbox(finalSlip);
      setSaveSuccess(true);
      Alert.alert('🎉 สำเร็จ!', 'บันทึกสลิปเข้า Slip Inbox เรียบร้อยแล้ว พร้อมให้คุณตรวจสอบ');
      if (onSavedSuccess) {
        onSavedSuccess();
      }
    } catch (saveErr: any) {
      Alert.alert('บันทึกล้มเหลว', saveErr.message || 'Could not save slip.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setSelectedImage(null);
    setParsedSlip(null);
    setSaveSuccess(false);
    setAmountInput('');
    setMemoInput('');
    setRawOcrInput('');
    setShowTextInput(false);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Action Buttons to Choose / Snap Image or Paste Local Text */}
      {!selectedImage && !parsedSlip && (
        <View style={styles.actionContainer}>
          <TouchableOpacity
            style={styles.primaryActionButton}
            onPress={() => pickImage(true)}
            activeOpacity={0.8}
          >
            <Text style={styles.actionIcon}>📸</Text>
            <Text style={styles.actionButtonText}>ถ่ายรูปสลิปทันที</Text>
            <Text style={styles.actionButtonSub}>เปิดกล้องถ่ายภาพเต็มรูป (ไม่ต้องเลือกขอบภาพ)</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.secondaryActionButton}
            onPress={() => pickImage(false)}
            activeOpacity={0.8}
          >
            <Text style={styles.actionIcon}>🖼️</Text>
            <Text style={styles.actionButtonText}>เลือกรูปจากอัลบั้ม</Text>
            <Text style={styles.actionButtonSub}>เลือกจาก Photos ทันที (ไม่ต้องเลือกขอบภาพ)</Text>
          </TouchableOpacity>

          {/* Local On-Device iPhone Live Text Option */}
          <TouchableOpacity
            style={styles.localOcrButton}
            onPress={() => setShowTextInput(!showTextInput)}
            activeOpacity={0.8}
          >
            <Text style={styles.actionIcon}>📋</Text>
            <Text style={styles.localOcrButtonText}>วางข้อความจาก iPhone Live Text</Text>
            <Text style={styles.localOcrButtonSub}>สกัดข้อมูลในเครื่อง 100% ไม่ส่งรูปขึ้นคลาวด์</Text>
          </TouchableOpacity>

          {showTextInput && (
            <View style={styles.localInputCard}>
              <Text style={styles.localInputTitle}>คัดลอกข้อความสลิปจากแอพ Photos แล้ววางที่นี่:</Text>
              <TextInput
                style={styles.localTextInput}
                multiline
                numberOfLines={6}
                value={rawOcrInput}
                onChangeText={setRawOcrInput}
                placeholder="กดค้างที่รูปสลิปใน iPhone แล้วเลือก 'คัดลอกข้อความทั้งหมด' (Live Text) แล้วนำมาวางที่นี่..."
                placeholderTextColor="#64748b"
              />
              <TouchableOpacity
                style={styles.parseLocalBtn}
                onPress={handleParseLocalOcrText}
              >
                <Text style={styles.parseLocalBtnText}>⚡ วิเคราะห์ข้อความในเครื่อง (Local Regex)</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      )}

      {/* Selected Image & Scanning State */}
      {selectedImage && (
        <View style={styles.previewContainer}>
          <View style={styles.imageWrapper}>
            <Image source={{ uri: selectedImage }} style={styles.slipImage} resizeMode="contain" />
            <TouchableOpacity style={styles.retakeButton} onPress={handleReset}>
              <Text style={styles.retakeText}>✕ ยกเลิก / สแกนใหม่</Text>
            </TouchableOpacity>
          </View>

          {isScanning && (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#38bdf8" />
              <Text style={styles.loadingText}>🧠 กำลังอ่านข้อมูลสลิปด้วย AI Vision...</Text>
              <Text style={styles.loadingSubText}>Cloudflare Llama 3.2 Vision • OpenTyphoon</Text>
            </View>
          )}
        </View>
      )}

      {/* Parsed Result Review Card */}
      {parsedSlip && !isScanning && (
        <View style={styles.resultCard}>
          <View style={styles.resultHeader}>
            <View>
              <Text style={styles.resultTitle}>ตรวจสอบข้อมูลสลิป</Text>
              <Text style={styles.resultSubtitle}>
                {parsedSlip.sender_bank || 'ธนาคาร'} → {parsedSlip.receiver_name || parsedSlip.receiver_bank || 'ผู้รับ'}
              </Text>
            </View>
            <View style={styles.confidenceBadge}>
              <Text style={styles.confidenceText}>
                {Math.round((parsedSlip.confidence_score ?? 1) * 100)}% แม่นยำ
              </Text>
            </View>
          </View>

          {/* Amount Field */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>จำนวนเงิน (บาท)</Text>
            <View style={styles.amountInputRow}>
              <Text style={styles.currencySymbol}>฿</Text>
              <TextInput
                style={styles.amountInput}
                value={amountInput}
                onChangeText={setAmountInput}
                keyboardType="decimal-pad"
                placeholder="0.00"
                placeholderTextColor="#64748b"
              />
            </View>
          </View>

          {/* Type Toggle */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>ประเภทรายการ</Text>
            <View style={styles.typeSelector}>
              {(['EXPENSE', 'INCOME', 'TRANSFER'] as const).map((t) => (
                <TouchableOpacity
                  key={t}
                  style={[styles.typeButton, selectedType === t && styles.typeButtonActive]}
                  onPress={() => setSelectedType(t)}
                >
                  <Text
                    style={[
                      styles.typeButtonText,
                      selectedType === t && styles.typeButtonTextActive,
                    ]}
                  >
                    {t === 'EXPENSE' ? 'รายจ่าย' : t === 'INCOME' ? 'รายรับ' : 'โอนเงิน'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Category Selector */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>หมวดหมู่</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.categoryScroll}>
              {STANDARD_CATEGORIES.map((cat) => (
                <TouchableOpacity
                  key={cat}
                  style={[
                    styles.categoryChip,
                    selectedCategory === cat && styles.categoryChipActive,
                  ]}
                  onPress={() => setSelectedCategory(cat)}
                >
                  <Text
                    style={[
                      styles.categoryChipText,
                      selectedCategory === cat && styles.categoryChipTextActive,
                    ]}
                  >
                    {cat}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>

          {/* Details Metadata */}
          <View style={styles.metaBox}>
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>วันที่รายการ:</Text>
              <Text style={styles.metaValue}>
                {new Date(parsedSlip.transaction_date).toLocaleString('th-TH', {
                  dateStyle: 'medium',
                  timeStyle: 'short',
                })}
              </Text>
            </View>
            {parsedSlip.reference_number ? (
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>รหัสอ้างอิง:</Text>
                <Text style={styles.metaValue} numberOfLines={1}>
                  {parsedSlip.reference_number}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Memo Input */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>บันทึกช่วยจำ (Memo)</Text>
            <TextInput
              style={styles.memoInput}
              value={memoInput}
              onChangeText={setMemoInput}
              placeholder="เช่น ค่าอาหารเที่ยง, กาแฟ"
              placeholderTextColor="#64748b"
            />
          </View>

          {/* Save Action */}
          <TouchableOpacity
            style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
            onPress={handleSaveToInbox}
            disabled={isSaving || saveSuccess}
          >
            {isSaving ? (
              <ActivityIndicator color="#ffffff" />
            ) : saveSuccess ? (
              <Text style={styles.saveButtonText}>✓ บันทึกเข้า Slip Inbox แล้ว</Text>
            ) : (
              <Text style={styles.saveButtonText}>⚡ บันทึกลง Slip Inbox</Text>
            )}
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingBottom: 40,
  },
  actionContainer: {
    marginTop: 10,
    gap: 16,
  },
  primaryActionButton: {
    backgroundColor: '#0284c7',
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    shadowColor: '#0284c7',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  secondaryActionButton: {
    backgroundColor: '#1e293b',
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#334155',
  },
  localOcrButton: {
    backgroundColor: '#1e1b4b',
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#6366f1',
  },
  localOcrButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#c7d2fe',
  },
  localOcrButtonSub: {
    fontSize: 12,
    color: '#a5b4fc',
    marginTop: 4,
  },
  localInputCard: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#6366f1',
    gap: 12,
  },
  localInputTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#e2e8f0',
  },
  localTextInput: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 12,
    color: '#ffffff',
    fontSize: 13,
    minHeight: 110,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#334155',
  },
  parseLocalBtn: {
    backgroundColor: '#4f46e5',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  parseLocalBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  actionIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  actionButtonText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  actionButtonSub: {
    fontSize: 12,
    color: '#cbd5e1',
    marginTop: 4,
  },
  previewContainer: {
    marginBottom: 16,
  },
  imageWrapper: {
    backgroundColor: '#020617',
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  slipImage: {
    width: '100%',
    height: 240,
  },
  retakeButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#475569',
  },
  retakeText: {
    color: '#f8fafc',
    fontSize: 11,
    fontWeight: '600',
  },
  loadingBox: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 20,
    marginTop: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#38bdf8',
  },
  loadingText: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 10,
  },
  loadingSubText: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 4,
  },
  resultCard: {
    backgroundColor: '#1e293b',
    borderRadius: 18,
    padding: 18,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 16,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  resultTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#ffffff',
  },
  resultSubtitle: {
    fontSize: 13,
    color: '#94a3b8',
    marginTop: 2,
  },
  confidenceBadge: {
    backgroundColor: '#064e3b',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#059669',
  },
  confidenceText: {
    color: '#34d399',
    fontSize: 11,
    fontWeight: '600',
  },
  inputGroup: {
    gap: 6,
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#94a3b8',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  amountInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0f172a',
    borderRadius: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  currencySymbol: {
    fontSize: 22,
    fontWeight: '700',
    color: '#38bdf8',
    marginRight: 6,
  },
  amountInput: {
    flex: 1,
    fontSize: 24,
    fontWeight: '700',
    color: '#ffffff',
    paddingVertical: 10,
  },
  typeSelector: {
    flexDirection: 'row',
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: '#334155',
  },
  typeButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  typeButtonActive: {
    backgroundColor: '#0284c7',
  },
  typeButtonText: {
    color: '#94a3b8',
    fontSize: 13,
    fontWeight: '600',
  },
  typeButtonTextActive: {
    color: '#ffffff',
  },
  categoryScroll: {
    flexDirection: 'row',
  },
  categoryChip: {
    backgroundColor: '#0f172a',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  categoryChipActive: {
    backgroundColor: '#0369a1',
    borderColor: '#38bdf8',
  },
  categoryChipText: {
    color: '#cbd5e1',
    fontSize: 12,
  },
  categoryChipTextActive: {
    color: '#ffffff',
    fontWeight: '600',
  },
  metaBox: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  metaLabel: {
    fontSize: 12,
    color: '#64748b',
  },
  metaValue: {
    fontSize: 12,
    color: '#cbd5e1',
    fontWeight: '500',
  },
  memoInput: {
    backgroundColor: '#0f172a',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: '#ffffff',
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  saveButton: {
    backgroundColor: '#059669',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    marginTop: 4,
  },
  saveButtonDisabled: {
    opacity: 0.7,
  },
  saveButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
});
