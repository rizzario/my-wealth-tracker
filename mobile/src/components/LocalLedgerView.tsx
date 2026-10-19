import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { getLocalSlips, deleteLocalSlip, clearAllLocalSlips, LocalSlipRecord } from '../services/localLedger';

interface LocalLedgerViewProps {
  onRefreshTrigger?: number;
}

export const LocalLedgerView: React.FC<LocalLedgerViewProps> = ({ onRefreshTrigger }) => {
  const [slips, setSlips] = useState<LocalSlipRecord[]>([]);

  const loadSlips = async () => {
    const data = await getLocalSlips();
    setSlips(data);
  };

  useEffect(() => {
    loadSlips();
  }, [onRefreshTrigger]);

  const handleDelete = (id: string) => {
    Alert.alert('ยืนยันการลบ', 'คุณต้องการลบสลิปนี้ออกจากเครื่องใช่หรือไม่?', [
      { text: 'ยกเลิก', style: 'cancel' },
      {
        text: 'ลบ',
        style: 'destructive',
        onPress: async () => {
          await deleteLocalSlip(id);
          await loadSlips();
        },
      },
    ]);
  };

  const handleClearAll = () => {
    Alert.alert('ล้างข้อมูลทั้งหมด', 'คุณต้องการลบสลิปทั้งหมดในเครื่องใช่หรือไม่?', [
      { text: 'ยกเลิก', style: 'cancel' },
      {
        text: 'ล้างทั้งหมด',
        style: 'destructive',
        onPress: async () => {
          await clearAllLocalSlips();
          await loadSlips();
        },
      },
    ]);
  };

  const totalAmount = slips.reduce((sum, s) => sum + (s.amount || 0), 0);

  return (
    <View style={styles.container}>
      {/* Header Summary */}
      <View style={styles.summaryCard}>
        <View>
          <Text style={styles.summaryLabel}>บันทึกในเครื่อง (Offline Ledger)</Text>
          <Text style={styles.summaryCount}>{slips.length} รายการ</Text>
        </View>
        <View style={styles.summaryAmountCol}>
          <Text style={styles.summaryAmountLabel}>ยอดรวมในเครื่อง</Text>
          <Text style={styles.summaryAmount}>฿{totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</Text>
        </View>
      </View>

      {slips.length > 0 && (
        <View style={styles.actionsBar}>
          <TouchableOpacity onPress={handleClearAll}>
            <Text style={styles.clearAllText}>🗑️ ล้างรายการทั้งหมดในเครื่อง</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Slip List */}
      <FlatList
        data={slips}
        keyExtractor={(item: LocalSlipRecord) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>📱</Text>
            <Text style={styles.emptyTitle}>ยังไม่มีสลิปที่บันทึกในเครื่อง</Text>
            <Text style={styles.emptyDesc}>
              ทดสอบและบันทึกสลิปจากแท็บ "Regex Tuner" เพื่อเก็บประวัติไว้ในเครื่องได้เลย
            </Text>
          </View>
        }
        renderItem={({ item }: { item: LocalSlipRecord }) => (
          <View style={styles.slipCard}>
            <View style={styles.slipCardTop}>
              <View style={styles.bankPill}>
                <Text style={styles.bankText}>{item.sender_bank || 'ธนาคาร'}</Text>
              </View>
              <TouchableOpacity onPress={() => handleDelete(item.id)}>
                <Text style={styles.deleteBtn}>✕ ลบ</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.slipCardBody}>
              <View style={styles.slipInfo}>
                <Text style={styles.receiverName}>{item.receiver_name || item.receiver_bank || 'ผู้รับ'}</Text>
                <Text style={styles.categoryText}>{item.category}</Text>
                <Text style={styles.dateText}>{item.parsed_date_display || item.transaction_date}</Text>
              </View>
              <View style={styles.slipAmountCol}>
                <Text style={styles.amountText}>
                  ฿{(item.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </Text>
                <Text style={styles.typeText}>
                  {item.type === 'EXPENSE' ? 'รายจ่าย' : item.type === 'INCOME' ? 'รายรับ' : 'โอนเงิน'}
                </Text>
              </View>
            </View>

            {item.memo ? (
              <View style={styles.memoBox}>
                <Text style={styles.memoText}>📝 {item.memo}</Text>
              </View>
            ) : null}
          </View>
        )}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  summaryCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
    marginBottom: 10,
  },
  summaryLabel: {
    color: '#94a3b8',
    fontSize: 11,
  },
  summaryCount: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 2,
  },
  summaryAmountCol: {
    alignItems: 'flex-end',
  },
  summaryAmountLabel: {
    color: '#94a3b8',
    fontSize: 11,
  },
  summaryAmount: {
    color: '#34d399',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 2,
  },
  actionsBar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 10,
  },
  clearAllText: {
    color: '#ef4444',
    fontSize: 12,
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: 30,
    gap: 10,
  },
  emptyBox: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#334155',
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  emptyTitle: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  emptyDesc: {
    color: '#94a3b8',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  slipCard: {
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
    gap: 8,
  },
  slipCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  bankPill: {
    backgroundColor: '#0f172a',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  bankText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
  },
  deleteBtn: {
    color: '#ef4444',
    fontSize: 11,
    fontWeight: '600',
  },
  slipCardBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  slipInfo: {
    flex: 1,
  },
  receiverName: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '600',
  },
  categoryText: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
  },
  dateText: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 2,
  },
  slipAmountCol: {
    alignItems: 'flex-end',
  },
  amountText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  typeText: {
    color: '#94a3b8',
    fontSize: 11,
    marginTop: 2,
  },
  memoBox: {
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  memoText: {
    color: '#94a3b8',
    fontSize: 11,
    fontStyle: 'italic',
  },
});
