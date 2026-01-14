module.exports = {
    presets: ['@react-native/babel-preset'],
    plugins: [
        // Required for Zod v4 ES module export syntax
        '@babel/plugin-transform-export-namespace-from',
    ],
};
