import React, { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  TouchableOpacity,
  ScrollView,
} from 'react-native';
import { RegexTunerView } from './src/components/RegexTunerView';
import { LocalLedgerView } from './src/components/LocalLedgerView';
import { SlipScannerView } from './src/components/SlipScannerView';

export default function App() {
  const [activeTab, setActiveTab] = useState<'tuner' | 'local' | 'scanner' | 'pro'>('tuner');
  const [localRefreshTrigger, setLocalRefreshTrigger] = useState(0);

  const handleSavedLocally = () => {
    setLocalRefreshTrigger((prev) => prev + 1);
    setActiveTab('local');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="light" />

      {/* Main Top Header */}
      <View style={styles.header}>
        <View>
          <Text style={styles.appName}>Thai Slip Regex Engine</Text>
          <Text style={styles.subtitle}>Standalone Mobile • On-Device Parser</Text>
        </View>
        <View style={styles.badgeStandalone}>
          <Text style={styles.badgeStandaloneText}>Offline 100% ⚡</Text>
        </View>
      </View>

      {/* Top Segmented Tab Switcher */}
      <View style={styles.tabBar}>
        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'tuner' && styles.tabButtonActive]}
          onPress={() => setActiveTab('tuner')}
        >
          <Text style={[styles.tabText, activeTab === 'tuner' && styles.tabTextActive]}>
            🔬 จูน Regex
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'local' && styles.tabButtonActive]}
          onPress={() => setActiveTab('local')}
        >
          <Text style={[styles.tabText, activeTab === 'local' && styles.tabTextActive]}>
            📱 ในเครื่อง
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'scanner' && styles.tabButtonActive]}
          onPress={() => setActiveTab('scanner')}
        >
          <Text style={[styles.tabText, activeTab === 'scanner' && styles.tabTextActive]}>
            📸 สแกนสลิป
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.tabButton, activeTab === 'pro' && styles.tabButtonActive]}
          onPress={() => setActiveTab('pro')}
        >
          <Text style={[styles.tabText, activeTab === 'pro' && styles.tabTextActive]}>
            🔒 Cloud Pro
          </Text>
        </TouchableOpacity>
      </View>

      {/* Main Content Area */}
      <View style={styles.contentArea}>
        {activeTab === 'tuner' && (
          <RegexTunerView onSavedLocally={handleSavedLocally} />
        )}

        {activeTab === 'local' && (
          <LocalLedgerView onRefreshTrigger={localRefreshTrigger} />
        )}

        {activeTab === 'scanner' && (
          <SlipScannerView onSavedSuccess={() => {}} />
        )}

        {activeTab === 'pro' && (
          <ScrollView contentContainerStyle={styles.proScroll}>
            <View style={styles.proLockCard}>
              <View style={styles.lockBadge}>
                <Text style={styles.lockIcon}>🔒</Text>
              </View>
              <Text style={styles.proTitle}>Web & Cloud Sync (Pro)</Text>
              <Text style={styles.proSubtitle}>
                คุณสมบัติเชื่อมต่อคลาวด์และเว็บแดชบอร์ดถูกล็อคไว้
              </Text>

              <View style={styles.featureList}>
                <View style={styles.featureRow}>
                  <Text style={styles.featureCheck}>✓</Text>
                  <Text style={styles.featureText}>ซิงค์ข้อมูลสลิปเข้า Supabase Cloud อัตโนมัติ</Text>
                </View>
                <View style={styles.featureRow}>
                  <Text style={styles.featureCheck}>✓</Text>
                  <Text style={styles.featureText}>แดชบอร์ดบริหารความมั่งคั่ง (Net Worth Dashboard)</Text>
                </View>
                <View style={styles.featureRow}>
                  <Text style={styles.featureCheck}>✓</Text>
                  <Text style={styles.featureText}>ติดตามพอร์ตหุ้นไทย/สหรัฐ คริปโต ทองคำ กองทุน</Text>
                </View>
                <View style={styles.featureRow}>
                  <Text style={styles.featureCheck}>✓</Text>
                  <Text style={styles.featureText}>วางแผนภาษี PVD, SSF, RMF และ Cash Flow Projection</Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.upgradeBtn}
                onPress={() => {}}
                activeOpacity={0.8}
              >
                <Text style={styles.upgradeBtnText}>🚀 ปลดล็อคเมื่อต้องการใช้งาน (Paywall)</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.statusCard}>
              <Text style={styles.statusTitle}>📱 โหมดปัจจุบัน: Standalone Local First</Text>
              <Text style={styles.statusDesc}>
                แอพมือถือของคุณทำงานแบบออฟไลน์ 100% สกัดข้อความด้วย Regex ในเครื่อง ไม่ส่งข้อมูลขึ้นเซิร์ฟเวอร์ใดๆ
              </Text>
            </View>
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  appName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  subtitle: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 2,
  },
  badgeStandalone: {
    backgroundColor: '#064e3b',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#059669',
  },
  badgeStandaloneText: {
    color: '#34d399',
    fontSize: 10,
    fontWeight: '700',
  },
  tabBar: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: '#1e293b',
    borderRadius: 12,
    padding: 3,
    borderWidth: 1,
    borderColor: '#334155',
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
  },
  tabButtonActive: {
    backgroundColor: '#0284c7',
  },
  tabText: {
    color: '#94a3b8',
    fontSize: 11,
    fontWeight: '600',
  },
  tabTextActive: {
    color: '#ffffff',
    fontWeight: '700',
  },
  contentArea: {
    flex: 1,
    paddingHorizontal: 16,
  },
  proScroll: {
    paddingBottom: 40,
    gap: 16,
  },
  proLockCard: {
    backgroundColor: '#1e293b',
    borderRadius: 18,
    padding: 24,
    borderWidth: 1.5,
    borderColor: '#6366f1',
    alignItems: 'center',
  },
  lockBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#1e1b4b',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#6366f1',
  },
  lockIcon: {
    fontSize: 28,
  },
  proTitle: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  proSubtitle: {
    color: '#a5b4fc',
    fontSize: 12,
    textAlign: 'center',
    marginBottom: 16,
  },
  featureList: {
    width: '100%',
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#334155',
    marginBottom: 20,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  featureCheck: {
    color: '#34d399',
    fontSize: 14,
    fontWeight: '700',
    marginRight: 10,
  },
  featureText: {
    color: '#cbd5e1',
    fontSize: 12,
    flex: 1,
  },
  upgradeBtn: {
    backgroundColor: '#4f46e5',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    width: '100%',
    alignItems: 'center',
  },
  upgradeBtnText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '700',
  },
  statusCard: {
    backgroundColor: '#0f172a',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#334155',
  },
  statusTitle: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 4,
  },
  statusDesc: {
    color: '#94a3b8',
    fontSize: 12,
    lineHeight: 18,
  },
});
