/**
 * Root Navigator - Main app entry point
 */
import React from 'react';
import {StyleSheet} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';

import StandardApiDemo from './StandardApiDemo';

export default function RootNavigator() {
  return (
    <LinearGradient
      colors={['#f5e09aff', '#fcede9ff']}
      start={{x: 0, y: 0}}
      end={{x: 1, y: 1}}
      style={styles.container}>
      <StandardApiDemo />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
