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
import LinearGradient from 'react-native-linear-gradient';

import App from './App';
import StandardApiDemo from './StandardApiDemo';

type Screen = 'legacy' | 'standard';

export default function RootNavigator() {
  const [activeScreen, setActiveScreen] = useState<Screen>('legacy');

  return (
    <LinearGradient colors={['#f5e09aff', '#fcede9ff']} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.container}>
      <View style={styles.screenContainer}>
        {activeScreen === 'legacy' ? <App /> : <StandardApiDemo />}
      </View>

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
              AI-SDK Like API
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex:1,
  },
  screenContainer: {
    flex:1,
  },
  tabBarContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.5)',
  },
  tabBar: {
    flexDirection: 'row',
    height: 64,
    paddingTop: 8,
  },
  tab: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
  },
  activeTab: {
    borderTopWidth: 3,
    borderTopColor: '#6c5ce7',
  },
  tabIcon: {
    fontSize: 22,
    marginBottom: 4,
  },
  tabLabel: {
    fontSize: 12,
    color: '#636e72',
    fontWeight: '500',
  },
  activeTabText: {
    color: '#2d3436',
  },
});
