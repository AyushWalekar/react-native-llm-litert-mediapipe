/**
 * Root Navigator - Simple tab-based navigation between demo screens
 * No external navigation library required
 */
import React, { useState } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  View,
  TouchableOpacity,
  Text,
} from 'react-native';

import App from './App';
import StandardApiDemo from './StandardApiDemo';

type Screen = 'legacy' | 'standard';

export default function RootNavigator() {
  const [activeScreen, setActiveScreen] = useState<Screen>('legacy');

  return (
    <View style={styles.container}>
      {/* Screen Content */}
      <View style={styles.screenContainer}>
        {activeScreen === 'legacy' ? <App /> : <StandardApiDemo />}
      </View>

      {/* Bottom Tab Bar */}
      <SafeAreaView style={styles.tabBarContainer}>
        <View style={styles.tabBar}>
          <TouchableOpacity
            style={[styles.tab, activeScreen === 'legacy' && styles.activeTab]}
            onPress={() => setActiveScreen('legacy')}
          >
            <Text style={[styles.tabIcon, activeScreen === 'legacy' && styles.activeTabText]}>
              🔧
            </Text>
            <Text style={[styles.tabLabel, activeScreen === 'legacy' && styles.activeTabText]}>
              Legacy API
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.tab, activeScreen === 'standard' && styles.activeTab]}
            onPress={() => setActiveScreen('standard')}
          >
            <Text style={[styles.tabIcon, activeScreen === 'standard' && styles.activeTabText]}>
              ✨
            </Text>
            <Text style={[styles.tabLabel, activeScreen === 'standard' && styles.activeTabText]}>
              Standard API
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#1a1a2e',
  },
  screenContainer: {
    flex: 1,
  },
  tabBarContainer: {
    backgroundColor: '#0f0f1a',
    borderTopWidth: 1,
    borderTopColor: '#333',
  },
  tabBar: {
    flexDirection: 'row',
    height: 60,
  },
  tab: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
  },
  activeTab: {
    backgroundColor: '#252542',
    borderTopWidth: 2,
    borderTopColor: '#6C63FF',
  },
  tabIcon: {
    fontSize: 20,
    marginBottom: 2,
  },
  tabLabel: {
    fontSize: 12,
    color: '#888',
    fontWeight: '500',
  },
  activeTabText: {
    color: '#6C63FF',
  },
});
