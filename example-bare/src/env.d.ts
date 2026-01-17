declare module 'react-native-fetch-api' {
  export function fetch(
    url: RequestInfo | URL,
    options?: RequestInit & {
      reactNative?: {textStreaming?: boolean};
    },
  ): Promise<Response>;
}

declare global {
  export const GOOGLE_GENERATIVE_AI_API_KEY: string;
  export const OPENAI_API_KEY: string;
  namespace NodeJS {
    interface ProcessEnv {
      GOOGLE_GENERATIVE_AI_API_KEY?: string;
      OPENAI_API_KEY?: string;
    }
  }
}
export {};
