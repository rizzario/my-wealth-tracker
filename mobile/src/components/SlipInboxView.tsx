import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
} from 'react-native';
import { fetchPendingSlips, SlipInboxItem } from '../services/slipScanner';

interface SlipInboxViewProps {
  onRefreshTrigger?: number;
}

export const SlipInboxView: React.FC<SlipInboxViewProps> = ({ onRefreshTrigger }) => {
  const [slips, setSlips] = useState<SlipInboxItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadSlips = async () => {
    try {
      setErrorMsg(null);
      const data = await fetchPendingSlips();
      setSlips(data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to load inbox items');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadSlips();
  }, [onRefreshTrigger]);

  const onRefresh = () => {
    setRefreshing(true);
    loadSlips();
  };

  const totalPendingAmount = slips.reduce((sum, item) => sum + (item.amount || 0), 0);

  if (loading && !refreshing) {
    return (
      <View style={styles.centerBox}>
        <ActivityIndicator size="large" color="#38bdf8" />
        <Text style={styles.loadingText}>กำลังโหลดรายการใน Slip Inbox...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Summary Banner */}
      <View style={styles.summaryCard}>
        <View>
          <Text style={styles.summaryLabel}>สลิปรอตรวจสอบใน Inbox</Text>
          <Text style={styles.summaryCount}>{slips.length} รายการ</Text>
        </View>
        <View style={styles.summaryAmountBox}>
          <Text style={styles.summaryAmountLabel}>ยอดรวมรออนุมัติ</Text>
          <Text style={styles.summaryAmount}>฿{totalPendingAmount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Text>
        </View>
      </View>

      {errorMsg && (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>⚠️ {errorMsg}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={loadSlips}>
            <Text style={styles.retryText}>ลองใหม่</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* List of pending slips */}
      <FlatList
        data={slips}
        keyExtractor={(item: SlipInboxItem) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#38bdf8" />}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyIcon}>🎉</Text>
            <Text style={styles.emptyTitle}>ไม่มีสลิปรอตรวจสอบ</Text>
            <Text style={styles.emptyDesc}>
              สลิปทั้งหมดได้รับการอนุมัติแล้ว หรือถ่ายรูปสลิปใหม่จากแท็บ "สแกนสลิป" ได้เลย
            </Text>
          </View>
        }
        renderItem={({ item }: { item: SlipInboxItem }) => (
          <View style={styles.slipCard}>
            <View style={styles.slipCardHeader}>
              <View style={styles.bankPill}>
                <Text style={styles.bankPillText}>{item.sender_bank || 'ธนาคาร'}</Text>
              </View>
              <View style={styles.badgePending}>
                <Text style={styles.badgePendingText}>รอตรวจสอบ ⏳</Text>
              </View>
            </View>

            <View style={styles.slipCardBody}>
              <View style={styles.slipInfoCol}>
                <Text style={styles.receiverName} numberOfLines={1}>
                  {item.receiver_name || item.receiver_bank || 'ไม่ระบุผู้รับ'}
                </Text>
                <Text style={styles.categoryPillText}>{item.category || 'อื่นๆ'}</Text>
                <Text style={styles.dateText}>
                  {new Date(item.transaction_date).toLocaleString('th-TH', {
                    dateStyle: 'short',
                    timeStyle: 'short',
                  })}
                </Text>
              </View>

              <View style={styles.amountCol}>
                <Text style={styles.slipAmount}>
                  ฿{(item.amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </Text>
                <Text style={styles.sourceText}>
                  {item.source === 'expo_app' ? '📱 Expo App' : '⚡ ' + item.source}
                </Text>
              </View>
            </View>

            {item.memo ? (
              <View style={styles.memoBox}>
                <Text style={styles.memoText} numberOfLines={2}>
                  📝 {item.memo}
                </Text>
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
  centerBox: {
    paddingVertical: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#94a3b8',
    marginTop: 12,
    fontSize: 13,
  },
  summaryCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#1e293b',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#334155',
    alignItems: 'center',
  },
  summaryLabel: {
    color: '#94a3b8',
    fontSize: 12,
  },
  summaryCount: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 2,
  },
  summaryAmountBox: {
    alignItems: 'flex-end',
  },
  summaryAmountLabel: {
    color: '#94a3b8',
    fontSize: 12,
  },
  summaryAmount: {
    color: '#38bdf8',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 2,
  },
  errorBox: {
    backgroundColor: '#451a1a',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  errorText: {
    color: '#fca5a5',
    fontSize: 12,
    flex: 1,
  },
  retryBtn: {
    backgroundColor: '#b91c1c',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    marginLeft: 8,
  },
  retryText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: 30,
    gap: 12,
  },
  emptyBox: {
    paddingVertical: 40,
    alignItems: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 16,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: '#334155',
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 8,
  },
  emptyTitle: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '700',
  },
  emptyDesc: {
    color: '#94a3b8',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  slipCard: {
    backgroundColor: '#1e293b',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#334155',
  },
  slipCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  bankPill: {
    backgroundColor: '#0f172a',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#334155',
  },
  bankPillText: {
    color: '#38bdf8',
    fontSize: 11,
    fontWeight: '700',
  },
  badgePending: {
    backgroundColor: '#3b250c',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#d97706',
  },
  badgePendingText: {
    color: '#fbbf24',
    fontSize: 11,
    fontWeight: '600',
  },
  slipCardBody: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  slipInfoCol: {
    flex: 1,
    marginRight: 10,
  },
  receiverName: {
    color: '#f8fafc',
    fontSize: 15,
    fontWeight: '600',
  },
  categoryPillText: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
  },
  dateText: {
    color: '#64748b',
    fontSize: 11,
    marginTop: 4,
  },
  amountCol: {
    alignItems: 'flex-end',
  },
  slipAmount: {
    color: '#f8fafc',
    fontSize: 17,
    fontWeight: '700',
  },
  sourceText: {
    color: '#64748b',
    fontSize: 10,
    marginTop: 4,
  },
  memoBox: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  memoText: {
    color: '#94a3b8',
    fontSize: 11,
    fontStyle: 'italic',
  },
});
