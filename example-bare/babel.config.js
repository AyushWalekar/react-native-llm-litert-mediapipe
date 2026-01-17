module.exports = {
    presets: ['@react-native/babel-preset'],
    plugins: [
        // Required for Zod v4 ES module export syntax
        '@babel/plugin-transform-export-namespace-from',
        // Load environment variables from .env file as global variables
        [
            'module:react-native-dotenv',
            {
                path: '.env',
                whitelist: ['GOOGLE_GENERATIVE_AI_API_KEY'],
                safe: false,
                allowUndefined: true,
            },
        ],
    ],
};
