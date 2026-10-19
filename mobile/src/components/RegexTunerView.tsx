import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Alert,
} from 'react-native';
import { parseThaiBankSlipOcr, ParsedSlipRegexResult } from '../services/slip-regex-parser';
import { saveSlipLocally } from '../services/localLedger';

const PRESETS = [
  {
    name: 'KBANK กาแฟ',
    text: `โอนเงินสำเร็จ
14 ต.ค. 69 09:15 น.
นาย กิตติพงษ์
ธ.กสิกรไทย
xxx-x-x1234-x
ไปยัง
ร้าน อเมซอน คาเฟ่
พร้อมเพย์
081-xxx-5678
จำนวนเงิน
185.00 บาท
ค่าธรรมเนียม
0.00 บาท
รหัสอ้างอิง: 20261014KB987654
บันทึกช่วยจำ: กาแฟสดและขนมปัง`,
  },
  {
    name: 'SCB ปั๊มน้ำมัน',
    text: `โอนเงินสำเร็จ
12 ต.ค. 2569 - 18:30
จาก: SCB x-7890 นาย สมศักดิ์
ไปยัง: PTT Station สาขาพระราม 9
จำนวนเงิน 1,200.00 บาท
รหัสอ้างอิง: 20261012SCB001122
บันทึกช่วยจำ: เติมน้ำมันดีเซล`,
  },
  {
    name: 'BBL โอนระหว่างบัญชี',
    text: `โอนเงินสำเร็จ
05 ต.ค. 2569 เวลา 14:20 น.
จากบัญชี ธนาคารกรุงเทพ xxx-x-xx123-x
เข้าบัญชี ธนาคารกสิกรไทย xxx-x-xx999-x
จำนวนเงิน 5,000.00 บาท
รหัสอ้างอิง: 20261005BBL556677
บันทึกช่วยจำ: โอนเงินระหว่างบัญชี ค่าใช้จ่ายส่วนตัว`,
  },
  {
    name: 'BAY ชำระบัตรเครดิต',
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
  const [showRulesDebug, setShowRulesDebug] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleTestParse = () => {
    if (!inputText.trim()) {
      Alert.alert('ข้อความว่างเปล่า', 'กรุณากรอกหรือวางข้อความสลิปเพื่อทดสอบ');
      return;
    }
    const result = parseThaiBankSlipOcr(inputText);
    setParsedResult(result);
    setSavedSuccess(false);
  };

  const handleSelectPreset = (presetText: string) => {
    setInputText(presetText);
    const result = parseThaiBankSlipOcr(presetText);
    setParsedResult(result);
    setSavedSuccess(false);
  };

  const handleSaveToDevice = async () => {
    if (!parsedResult) return;
    try {
      await saveSlipLocally(parsedResult);
      setSavedSuccess(true);
      Alert.alert('💾 บันทึกสำเร็จ', 'บันทึกข้อมูลสลิปลงความจำเครื่องเรียบร้อยแล้ว (ออฟไลน์ 100%)');
      if (onSavedLocally) {
        onSavedLocally();
      }
    } catch (err: any) {
      Alert.alert('เกิดข้อผิดพลาด', err.message || 'Could not save locally.');
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Banner */}
      <View style={styles.banner}>
        <Text style={styles.bannerTitle}>🔬 Regex Tuner & Local Parser</Text>
        <Text style={styles.bannerDesc}>
          ทดสอบและปรับจูน Regular Expression สำหรับอ่านสลิปธนาคารไทย ทำงานในเครื่อง 100% ไม่ใช้เน็ต
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
          <Text style={styles.inputLabel}>ข้อความดิบจาก OCR (Raw Text):</Text>
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
          placeholder="วางข้อความสลิปที่คัดลอกจาก iPhone ที่นี่..."
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
            <Text style={styles.resultTitle}>ผลการสกัดข้อมูล (Parsed Result)</Text>
            <View style={styles.confidencePill}>
              <Text style={styles.confidenceText}>
                {Math.round(parsedResult.confidence_score * 100)}% Match
              </Text>
            </View>
          </View>

          {/* Key Metrics */}
          <View style={styles.metricsGrid}>
            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>จำนวนเงิน (Amount)</Text>
              <Text style={styles.metricAmount}>
                {parsedResult.amount !== null
                  ? `฿${parsedResult.amount.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                  : '❌ หาไม่พบ'}
              </Text>
            </View>

            <View style={styles.metricCard}>
              <Text style={styles.metricLabel}>ประเภทรายการ (Type)</Text>
              <Text style={styles.metricType}>
                {parsedResult.type === 'EXPENSE'
                  ? 'รายจ่าย'
                  : parsedResult.type === 'INCOME'
                  ? 'รายรับ'
                  : 'โอนเงิน'}
              </Text>
            </View>
          </View>

          {/* Details Table */}
          <View style={styles.detailsBox}>
            <View style={styles.detailRow}>
              <Text style={styles.detailKey}>หมวดหมู่:</Text>
              <Text style={styles.detailValueHighlight}>{parsedResult.category}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailKey}>วันที่ / เวลา:</Text>
              <Text style={styles.detailValue}>
                {parsedResult.parsed_date_display || '-'} {parsedResult.parsed_time_display || ''}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailKey}>ธนาคารผู้โอน:</Text>
              <Text style={styles.detailValue}>
                {parsedResult.sender_bank || 'ไม่พบ'} ({parsedResult.sender_account_masked || 'ไม่ระบุเลข'})
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailKey}>ผู้รับเงิน / ร้านค้า:</Text>
              <Text style={styles.detailValue}>
                {parsedResult.receiver_name || parsedResult.receiver_bank || 'ไม่พบ'}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailKey}>บันทึกช่วยจำ (Memo):</Text>
              <Text style={styles.detailValue}>{parsedResult.memo || '-'}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailKey}>รหัสอ้างอิง (Ref No):</Text>
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

          {/* Save locally action */}
          <TouchableOpacity
            style={[styles.saveLocalBtn, savedSuccess && styles.saveLocalBtnSuccess]}
            onPress={handleSaveToDevice}
          >
            <Text style={styles.saveLocalBtnText}>
              {savedSuccess ? '✓ บันทึกลงเครื่องแล้ว' : '💾 บันทึกผลลัพธ์ลงเครื่อง (Local Standalone)'}
            </Text>
          </TouchableOpacity>
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
  confidencePill: {
    backgroundColor: '#064e3b',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#059669',
  },
  confidenceText: {
    color: '#34d399',
    fontSize: 11,
    fontWeight: '600',
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
    alignItems: 'flex-start',
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
  saveLocalBtn: {
    backgroundColor: '#059669',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  saveLocalBtnSuccess: {
    backgroundColor: '#047857',
  },
  saveLocalBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
});
