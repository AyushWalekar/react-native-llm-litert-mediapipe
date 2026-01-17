declare global {
  var GOOGLE_GENERATIVE_AI_API_KEY: string;
  namespace NodeJS {
    interface ProcessEnv {
      GOOGLE_GENERATIVE_AI_API_KEY?: string;
    }
  }
}
export {};
