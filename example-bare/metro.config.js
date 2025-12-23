const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const path = require('path');

// Path to the parent package (react-native-llm-litert-mediapipe)
const parentPackagePath = path.resolve(__dirname, '..');

// Path to the example-bare's node_modules
const exampleNodeModules = path.resolve(__dirname, 'node_modules');

/**
 * Metro configuration
 * https://reactnative.dev/docs/metro
 *
 * @type {import('metro-config').MetroConfig}
 */
const config = {
    watchFolders: [parentPackagePath],
    resolver: {
        // Make sure Metro can find the parent package
        nodeModulesPaths: [
            exampleNodeModules,
            path.resolve(parentPackagePath, 'node_modules'),
        ],
        // Ensure only one copy of React is used (from example-bare's node_modules)
        // This prevents "Invalid hook call" errors from multiple React copies
        extraNodeModules: {
            'react-native-llm-litert-mediapipe': parentPackagePath,
            'react': path.resolve(exampleNodeModules, 'react'),
            'react-native': path.resolve(exampleNodeModules, 'react-native'),
        },
        // Block the parent package's node_modules from providing React
        blockList: [
            new RegExp(`${parentPackagePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/node_modules/react/.*`),
            new RegExp(`${parentPackagePath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/node_modules/react-native/.*`),
        ],
    },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);
