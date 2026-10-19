import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
  Share,
} from 'react-native';
import { parseThaiBankSlipOcr, ParsedSlipRegexResult } from '../services/slip-regex-parser';
import { saveSlipLocally } from '../services/localLedger';
import { STANDARD_CATEGORIES } from '../config';

const POPULAR_BANKS = [
  'PAOTANG',
  'TUNGNGERN',
  'KBANK',
  'SCB',
  'BBL',
  'KTB',
  'BAY',
  'TTB',
  'GSB',
  'PROMPTPAY',
  'TRUEMONEY',
  'DIME',
  'UOB',
];

const PRESETS = [
  {
    name: 'เป๋าตัง BTS (ไทยช่วยไทย)',
    bank: 'PAOTANG',
    text: `โดะช่วยไทย
พลัส
60/40
เป๋าตัง
ทำรายการสำเร็จ
รหัสอ้างอิง 5a909529f63b48afb988ab986e573330
18 ต.ค. 2569 15:56 น.
G
กิตติพงศ์ ก***
G-Wallet ID: ****
*******
3419
ถุงเงิน
ระบบขนส่งมวลชนกรุงเทพ
กลุ่มขนส่งสาธารณะ
ค่าสินค้า/บริการ
สิทธิไทยช่วยไทยพลัส
จำนวนเงินที่ชำระ
118 บาท
-70.80 บาท
47.20 บาท`,
  },
  {
    name: 'K PLUS จ่ายเวนดิ้งบุญเติม (QR ร้านค้า)',
    bank: 'KBANK',
    text: `ชำระเงินสำเร็จ
16 ต.ค. 69 13:15 น.
K+
บุญเติมกั
นาย กิตติพงศ์ ก
ธ.กสิกรไทย
xxX-X-x4554-x
ร้านเวนดิ้งบายบุญเติม
บมจ. ฟอร์ท สมาร์ท เซอร์วิส
202610161458170
1000
-1000
oMinto Ine
จำนวน:
5.00 บาท
ค่าธรรมเนียม:
เลขที่รายการ:
0.00 บาท
016289131547DQR05334
สแกน
ตรวจสอบสลิป`,
  },
  {
    name: 'K PLUS โอนเงินบุคคล (KBank to KBank)',
    bank: 'KBANK',
    text: `โอนเงินสำเร็จ
25 พ.ค. 64 12:19 น.
นาย กิตติพงศ์ ก
ธ.กสิกรไทย
XXX-X-X4554-x
K+
น.ส. สุภาพรรณ เอมเปีย
ธ.กสิกรไทย
xxX-x-x5337-x
เลขที่รายการ:
011145121906935408
จำนวน:
100.00 บาท
ค่าธรรมเนียม:
0.00 บาท
Verified by K+`,
  },
  {
    name: 'SCB สแกนจ่าย Biller / ร้านค้า',
    bank: 'SCB',
    text: `SCB÷
จ่ายเงินสำเร็จ
16 ต.ค. 2569 - 06:22
รหัสอ้างอิง: 202610166rSiDWod5z89sb5yp
จาก
ไปยัง
นาย กิตติพงศ์ ก.
xXX-xxX623-9
ร้านเวนดิ้งบายบุญเติม
Biller ID : 010753600031501
รหัสร้านค้า : EXT01001408519
รหัสธุรกรรม : APIC179210655631030G
จำนวนเงิน
35.00
ผู้รับเงินสามารถสแกนคิวอาร์โค้ดนี้เพื่อ
ตรวจสอบสถานะการจ่ายเงิน`,
  },
  {
    name: 'SCB ปั๊มน้ำมัน',
    bank: 'SCB',
    text: `โอนเงินสำเร็จ
12 ต.ค. 2569 - 18:30
จาก: SCB x-7890 นาย สมศักดิ์
ไปยัง: PTT Station สาขาพระราม 9
จำนวนเงิน 1,200.00 บาท
รหัสอ้างอิง: 20261012SCB001122
บันทึกช่วยจำ: เติมน้ำมันดีเซล`,
  },
  {
    name: 'BBL โอนเงินบุคคล (นาย กิตติพงศ์ -> นางปราณี)',
    bank: 'BBL',
    text: `Bangkok Bank
รายการสำเร็จ
30 ส.ค. 69, 11:14
จำนวนเงิน
500.00 TH
จาก
ไปที่
นาย กิตติพงศ์
208-4-xxx978
ธนาคารกรุงเทพ
นางปราณี กิตติรุ่งเจริญ
211-0-xxx988
ธนาคารกรุงเทพ
ค่าธรรมเนียม 0.00 THB
หมายเลขอ้างอิง
504498
เลขที่อ้างอิง
2026083011145124001067308`,
  },
  {
    name: 'BBL ฮาโลวีน 64 (OCR Cyrillic x ในเลขบัญชี)',
    bank: 'BBL',
    text: `HAPPY
HALLOWEEN
Bangkok Bank
รายการสำเร็จ
28 ต.ค. 64, 21:18
จำนวนเงิน
7,500.00 THB
จาก
ไปที่
นาย กิตติพงศ์
208-4-хxx978
ธนาคารกรุงเทพ
นางปราณี กิตติรุ่งเจริญ
211-0-xxx988
ธนาคารกรุงเทพ
ค่าธรรมเนียม 0.00 THB
หมายเลขอ้างอิง
687984
เลขที่อ้างอิง
2021102821181924003961208`,
  },
  {
    name: 'BAY ชำระบัตรเครดิต',
    bank: 'BAY',
    text: `โอนเงินสำเร็จ
28 ก.ย. 2569 20:10 น.
จาก: BAY ออมทรัพย์ xxx-x-x4567-x
ไปยัง: ชำระค่าบัตรเครดิต KTC Visa Platinum
จำนวนเงิน: 8,450.00 บาท
ค่าธรรมเนียม: 0.00 บาท
รหัสอ้างอิง: BAY20260928778899
บันทึกช่วยจำ: ปิดยอดบัตร KTC เดือนกันยายน`,
  },
  {
    name: 'TrueMoney เซเว่น',
    bank: 'TRUEMONEY',
    text: `การโอนเงินสำเร็จ
10/10/2026 11:05
TrueMoney Wallet 089-xxx-4321
ไปยัง: เซเว่น อีเลฟเว่น สาขาอารีย์
ยอดเงิน ฿79.00
รหัสอ้างอิง: TMN99887766
บันทึก: ซื้อขนมปังและนม`,
  },
];

interface RegexTunerViewProps {
  onSavedLocally?: () => void;
}

export const RegexTunerView: React.FC<RegexTunerViewProps> = ({ onSavedLocally }) => {
  const [inputText, setInputText] = useState(PRESETS[0].text);
  const [parsedResult, setParsedResult] = useState<ParsedSlipRegexResult | null>(() =>
    parseThaiBankSlipOcr(PRESETS[0].text)
  );

  // Editable fields for user manual correction
  const [isEditing, setIsEditing] = useState(false);
  const [editAmount, setEditAmount] = useState(
    parsedResult?.amount ? parsedResult.amount.toString() : ''
  );
  const [editBank, setEditBank] = useState(parsedResult?.sender_bank || 'KBANK');
  const [editReceiver, setEditReceiver] = useState(parsedResult?.receiver_name || '');
  const [editCategory, setEditCategory] = useState(parsedResult?.category || 'อื่นๆ');
  const [editType, setEditType] = useState<'EXPENSE' | 'INCOME' | 'TRANSFER'>(
    parsedResult?.type || 'EXPENSE'
  );
  const [editMemo, setEditMemo] = useState(parsedResult?.memo || '');

  const [showRulesDebug, setShowRulesDebug] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const applyParsedToEditable = (res: ParsedSlipRegexResult) => {
    setEditAmount(res.amount !== null ? res.amount.toString() : '');
    setEditBank(res.sender_bank || 'KBANK');
    setEditReceiver(res.receiver_name || res.receiver_bank || '');
    setEditCategory(res.category || 'อื่นๆ');
    setEditType(res.type || 'EXPENSE');
    setEditMemo(res.memo || '');
  };

  const handleTestParse = () => {
    if (!inputText.trim()) {
      Alert.alert('ข้อความว่างเปล่า', 'กรุณากรอกหรือวางข้อความสลิปเพื่อทดสอบ');
      return;
    }
    const result = parseThaiBankSlipOcr(inputText);
    setParsedResult(result);
    applyParsedToEditable(result);
    setSavedSuccess(false);
  };

  const handleSelectPreset = (presetText: string) => {
    setInputText(presetText);
    const result = parseThaiBankSlipOcr(presetText);
    setParsedResult(result);
    applyParsedToEditable(result);
    setSavedSuccess(false);
  };

  const handleSaveToDevice = async () => {
    if (!parsedResult) return;
    const finalAmount = parseFloat(editAmount);
    if (isNaN(finalAmount) || finalAmount <= 0) {
      Alert.alert('จำนวนเงินไม่ถูกต้อง', 'กรุณาระบุจำนวนเงินมากกว่า 0');
      return;
    }

    try {
      const finalSlip: ParsedSlipRegexResult = {
        ...parsedResult,
        amount: finalAmount,
        sender_bank: editBank,
        receiver_name: editReceiver,
        category: editCategory,
        type: editType,
        memo: editMemo,
      };

      await saveSlipLocally(finalSlip);
      setSavedSuccess(true);
      Alert.alert('💾 บันทึกสำเร็จ', 'บันทึกข้อมูลสลิปลงความจำเครื่องเรียบร้อยแล้ว (ออฟไลน์ 100%)');
      if (onSavedLocally) {
        onSavedLocally();
      }
    } catch (err: any) {
      Alert.alert('เกิดข้อผิดพลาด', err.message || 'Could not save locally.');
    }
  };

  // Share text report so user can send it to AI to fine-tune regex rules
  const handleShareReport = async () => {
    if (!parsedResult) return;
    const report = `[SLIP TEST REPORT]
Bank: ${editBank}
Parsed Amount: ${parsedResult.amount} -> Expected: ${editAmount}
Parsed Receiver: ${parsedResult.receiver_name} -> Expected: ${editReceiver}
Parsed Category: ${parsedResult.category} -> Expected: ${editCategory}
Parsed Date: ${parsedResult.parsed_date_display} ${parsedResult.parsed_time_display}
Matched Rules:
${JSON.stringify(parsedResult.matched_rules, null, 2)}

RAW TEXT:
${inputText}`;

    try {
      await Share.share({
        message: report,
        title: `Slip Report - ${editBank}`,
      });
    } catch (err: any) {
      Alert.alert('Share Failed', err.message);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Banner */}
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>🔬 Regex Tuner & Local Parser</Text>
        <Text style={styles.bannerDesc}>
          ทดสอบสลิปแต่ละธนาคาร ตรวจสอบผลลัพธ์ ปรับแก้ให้ถูกต้อง และเซฟเก็บไว้ในเครื่อง
        </Text>
      </View>

      {/* Preset Buttons */}
      <Text style={styles.sectionHeader}>ตัวอย่างข้อความสลิป (Presets):</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.presetScroll}>
        {PRESETS.map((p, idx) => (
          <TouchableOpacity
            key={idx}
            style={styles.presetChip}
            onPress={() => handleSelectPreset(p.text)}
          >
            <Text style={styles.presetChipText}>{p.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* OCR Input Field */}
      <View style={styles.inputContainer}>
        <View style={styles.inputHeader}>
          <Text style={styles.inputLabel}>ข้อความดิบจาก OCR (วางสลิปจาก iPhone ที่นี่):</Text>
          <TouchableOpacity onPress={() => setInputText('')}>
            <Text style={styles.clearText}>ล้างข้อความ</Text>
          </TouchableOpacity>
        </View>
        <TextInput
          style={styles.textArea}
          multiline
          numberOfLines={8}
          value={inputText}
          onChangeText={setInputText}
          placeholder="วางข้อความสลิปที่คัดลอกมาจาก iPhone Shortcut หรือ Live Text ที่นี่..."
          placeholderTextColor="#64748b"
        />
        <TouchableOpacity style={styles.parseButton} onPress={handleTestParse} activeOpacity={0.8}>
          <Text style={styles.parseButtonText}>⚡ รันการทดสอบ Regex (Parse)</Text>
        </TouchableOpacity>
      </View>

      {/* Parsed Result Display */}
      {parsedResult && (
        <View style={styles.resultContainer}>
          <View style={styles.resultHeader}>
            <View>
              <Text style={styles.resultTitle}>ผลการสกัดข้อมูล (Parsed Result)</Text>
              <Text style={styles.resultSubtitle}>
                {parsedResult.confidence_score === 1
                  ? 'อ่านข้อมูลครบถ้วน 🟢'
                  : 'ต้องการตรวจสอบ/ปรับแก้ 🟡'}
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.editModeToggle, isEditing && styles.editModeToggleActive]}
              onPress={() => setIsEditing(!isEditing)}
            >
              <Text style={[styles.editModeText, isEditing && styles.editModeTextActive]}>
                {isEditing ? '✕ ปิดโหมดแก้ไข' : '✏️ ปรับแก้ข้อมูล'}
              </Text>
            </TouchableOpacity>
          </View>

          {/* Quick Metrics */}
          <View style={styles.metricsGrid}>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>จำนวนเงิน (Amount)</Text>
              {isEditing ? (
                <View style={styles.editRow}>
                  <Text style={styles.currencyPrefix}>฿</Text>
                  <TextInput
                    style={styles.editAmountInput}
                    value={editAmount}
                    onChangeText={setEditAmount}
                    keyboardType="decimal-pad"
                  />
                </View>
              ) : (
                <Text style={styles.metricAmount}>
                  ฿{parseFloat(editAmount || '0').toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </Text>
              )}
            </View>

            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>ประเภทรายการ (Type)</Text>
              <Text style={styles.metricType}>
                {editType === 'EXPENSE' ? 'รายจ่าย' : editType === 'INCOME' ? 'รายรับ' : 'โอนเงิน'}
              </Text>
            </View>
          </View>

          {/* Bank Selection (When Editing) */}
          {isEditing && (
            <View style={styles.editSection}>
              <Text style={styles.editSectionLabel}>เลือกธนาคารต้นทางที่ถูกต้อง:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
                {POPULAR_BANKS.map((b) => (
                  <TouchableOpacity
                    key={b}
                    style={[styles.bankChip, editBank === b && styles.bankChipActive]}
                    onPress={() => setEditBank(b)}
                  >
                    <Text style={[styles.bankChipText, editBank === b && styles.bankChipTextActive]}>
                      {b}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Category Selection (When Editing) */}
          {isEditing && (
            <View style={styles.editSection}>
              <Text style={styles.editSectionLabel}>เลือกหมวดหมู่ที่ถูกต้อง:</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsScroll}>
                {STANDARD_CATEGORIES.map((c) => (
                  <TouchableOpacity
                    key={c}
                    style={[styles.catChip, editCategory === c && styles.catChipActive]}
                    onPress={() => setEditCategory(c)}
                  >
                    <Text style={[styles.catChipText, editCategory === c && styles.catChipTextActive]}>
                      {c}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* Details Table */}
          <View style={styles.detailsBox}>
            <View style={styles.detailRow}>
              <Text style={styles.detailKey}>ธนาคารผู้โอน:</Text>
              <Text style={styles.detailValueHighlight}>{editBank}</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailKey}>ผู้รับเงิน / ร้านค้า:</Text>
              {isEditing ? (
                <TextInput
                  style={styles.inlineInput}
                  value={editReceiver}
                  onChangeText={setEditReceiver}
                  placeholder="ระบุชื่อผู้รับ..."
                  placeholderTextColor="#64748b"
                />
              ) : (
                <Text style={styles.detailValue}>{editReceiver || 'ไม่พบ'}</Text>
              )}
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailKey}>หมวดหมู่:</Text>
              <Text style={styles.detailValueHighlight}>{editCategory}</Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailKey}>วันที่ / เวลา:</Text>
              <Text style={styles.detailValue}>
                {parsedResult.parsed_date_display || '-'} {parsedResult.parsed_time_display || ''}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailKey}>บันทึกช่วยจำ (Memo):</Text>
              {isEditing ? (
                <TextInput
                  style={styles.inlineInput}
                  value={editMemo}
                  onChangeText={setEditMemo}
                  placeholder="เช่น ค่ากาแฟ, น้ำมัน"
                  placeholderTextColor="#64748b"
                />
              ) : (
                <Text style={styles.detailValue}>{editMemo || '-'}</Text>
              )}
            </View>

            <View style={styles.detailRow}>
              <Text style={styles.detailKey}>รหัสอ้างอิง:</Text>
              <Text style={styles.detailValue}>{parsedResult.reference_number || '-'}</Text>
            </View>
          </View>

          {/* Regex Debug Tracing Accordion */}
          <TouchableOpacity
            style={styles.debugToggle}
            onPress={() => setShowRulesDebug(!showRulesDebug)}
          >
            <Text style={styles.debugToggleText}>
              {showRulesDebug ? '▼ ซ่อน Rule Tracing Debug Log' : '▶ ดู Rule Tracing Debug Log (การจับคู่ Regex)'}
            </Text>
          </TouchableOpacity>

          {showRulesDebug && (
            <View style={styles.debugBox}>
              <Text style={styles.debugBoxTitle}>กฎ Regex ที่ถูกกระตุ้น (Triggered Rules):</Text>
              {Object.entries(parsedResult.matched_rules).map(([key, rule], i) => (
                <View key={i} style={styles.ruleItem}>
                  <Text style={styles.ruleKey}>• {key}:</Text>
                  <Text style={styles.ruleDesc}>{rule}</Text>
                </View>
              ))}
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.shareReportBtn}
              onPress={handleShareReport}
              activeOpacity={0.8}
            >
              <Text style={styles.shareReportBtnText}>📤 แชร์รายงานสลิปให้ AI จูน</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveLocalBtn, savedSuccess && styles.saveLocalBtnSuccess]}
              onPress={handleSaveToDevice}
              activeOpacity={0.8}
            >
              <Text style={styles.saveLocalBtnText}>
                {savedSuccess ? '✓ บันทึกสำเร็จ' : '💾 บันทึกลงเครื่อง'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingBottom: 40,
    gap: 14,
  },
  banner: {
    backgroundColor: '#1e1b4b',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#4338ca',
  },
  bannerTitle: {
    color: '#c7d2fe',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  bannerDesc: {
    color: '#a5b4fc',
    fontSize: 12,
    lineHeight: 18,
  },
  sectionHeader: {
    color: '#94a3b8',
    fontSize: 12,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  presetScroll: {
    flexDirection: 'row',
  },
  presetChip: {
    backgroundColor: '#1e293b',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginRight: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  presetChipText: {
    color: '#38bdf8',
    fontSize: 12,
    fontWeight: '600',
  },
  inputContainer: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 10,
  },
  inputHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  inputLabel: {
    color: '#f8fafc',
    fontSize: 13,
    fontWeight: '600',
  },
  clearText: {
    color: '#ef4444',
    fontSize: 12,
  },
  textArea: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    padding: 12,
    color: '#ffffff',
    fontSize: 12,
    minHeight: 120,
    textAlignVertical: 'top',
    borderWidth: 1,
    borderColor: '#334155',
  },
  parseButton: {
    backgroundColor: '#4f46e5',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  parseButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  resultContainer: {
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 12,
  },
  resultHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  resultTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '700',
  },
  resultSubtitle: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
  },
  editModeToggle: {
    backgroundColor: '#0f172a',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#475569',
  },
  editModeToggleActive: {
    backgroundColor: '#0369a1',
    borderColor: '#38bdf8',
  },
  editModeText: {
    color: '#cbd5e1',
    fontSize: 12,
    fontWeight: '600',
  },
  editModeTextActive: {
    color: '#ffffff',
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 10,
  },
  metricCard: {
    flex: 1,
    backgroundColor: '#0f172a',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#334155',
  },
  metricLabel: {
    color: '#94a3b8',
    fontSize: 11,
    marginBottom: 4,
  },
  metricAmount: {
    color: '#38bdf8',
    fontSize: 18,
    fontWeight: '700',
  },
  metricType: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '600',
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  currencyPrefix: {
    color: '#38bdf8',
    fontSize: 16,
    fontWeight: '700',
    marginRight: 4,
  },
  editAmountInput: {
    flex: 1,
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    padding: 0,
  },
  editSection: {
    gap: 6,
  },
  editSectionLabel: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  chipsScroll: {
    flexDirection: 'row',
  },
  bankChip: {
    backgroundColor: '#0f172a',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  bankChipActive: {
    backgroundColor: '#0284c7',
    borderColor: '#38bdf8',
  },
  bankChipText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  bankChipTextActive: {
    color: '#ffffff',
  },
  catChip: {
    backgroundColor: '#0f172a',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginRight: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  catChipActive: {
    backgroundColor: '#047857',
    borderColor: '#34d399',
  },
  catChipText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  catChipTextActive: {
    color: '#ffffff',
  },
  detailsBox: {
    backgroundColor: '#0f172a',
    borderRadius: 10,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#334155',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailKey: {
    color: '#94a3b8',
    fontSize: 12,
    flex: 1,
  },
  detailValue: {
    color: '#e2e8f0',
    fontSize: 12,
    fontWeight: '500',
    flex: 2,
    textAlign: 'right',
  },
  detailValueHighlight: {
    color: '#fbbf24',
    fontSize: 12,
    fontWeight: '600',
    flex: 2,
    textAlign: 'right',
  },
  inlineInput: {
    flex: 2,
    backgroundColor: '#1e293b',
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    color: '#ffffff',
    fontSize: 12,
    textAlign: 'right',
    borderWidth: 1,
    borderColor: '#475569',
  },
  debugToggle: {
    paddingVertical: 6,
  },
  debugToggleText: {
    color: '#818cf8',
    fontSize: 12,
    fontWeight: '600',
  },
  debugBox: {
    backgroundColor: '#090d16',
    borderRadius: 10,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  debugBoxTitle: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 4,
    textTransform: 'uppercase',
  },
  ruleItem: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  ruleKey: {
    color: '#60a5fa',
    fontSize: 11,
    fontWeight: '600',
  },
  ruleDesc: {
    color: '#94a3b8',
    fontSize: 11,
    flex: 1,
  },
  actionRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
  },
  shareReportBtn: {
    flex: 1,
    backgroundColor: '#334155',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#475569',
  },
  shareReportBtnText: {
    color: '#cbd5e1',
    fontSize: 13,
    fontWeight: '600',
  },
  saveLocalBtn: {
    flex: 1,
    backgroundColor: '#059669',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  saveLocalBtnSuccess: {
    backgroundColor: '#047857',
  },
  saveLocalBtnText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '700',
  },
});
