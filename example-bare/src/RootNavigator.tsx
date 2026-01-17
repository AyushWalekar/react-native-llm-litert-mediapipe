/**
 * Root Navigator - Main app entry point
 */
import React, {useState} from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

import StandardApiDemo from './StandardApiDemo';
import GeminiApiDemo from './GeminiApiDemo';

type Tab = 'local' | 'gemini';

export default function RootNavigator() {
  const [activeTab, setActiveTab] = useState<Tab>('local');

  return (
    <LinearGradient
      colors={['#f5e09aff', '#fcede9ff']}
      start={{x: 0, y: 0}}
      end={{x: 1, y: 1}}
      style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.tabsContainer}>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'local' && styles.activeTab]}
            onPress={() => setActiveTab('local')}>
            <Text
              style={[
                styles.tabText,
                activeTab === 'local' && styles.activeTabText,
              ]}>
              Local LLM
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.tab, activeTab === 'gemini' && styles.activeTab]}
            onPress={() => setActiveTab('gemini')}>
            <Text
              style={[
                styles.tabText,
                activeTab === 'gemini' && styles.activeTabText,
              ]}>
              Gemini API
            </Text>
          </TouchableOpacity>
        </View>
        {activeTab === 'local' ? <StandardApiDemo /> : <GeminiApiDemo />}
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  tabsContainer: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    margin: 20,
    marginBottom: 0,
    borderRadius: 16,
    padding: 6,
  },
  tab: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  activeTab: {
    backgroundColor: '#fff',
    shadowColor: 'rgba(0, 0, 0, 0.1)',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 1,
    shadowRadius: 4,
    elevation: 2,
  },
  tabText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#636e72',
  },
  activeTabText: {
    color: '#2d3436',
  },
});
