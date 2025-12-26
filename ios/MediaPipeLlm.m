/**
 * MediaPipeLlm.m
 * Objective-C bridge for MediaPipeLlm Swift module
 */

#import <React/RCTBridgeModule.h>
#import <React/RCTEventEmitter.h>

@interface RCT_EXTERN_MODULE (MediaPipeLlm, RCTEventEmitter)

// Model creation
RCT_EXTERN_METHOD(
    createModel : (NSString *)modelPath maxTokens : (int)maxTokens topK : (int)
        topK temperature : (double)temperature randomSeed : (int)
            randomSeed resolver : (RCTPromiseResolveBlock)
                resolve rejecter : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(createModelFromAsset : (NSString *)modelName maxTokens : (int)
                      maxTokens topK : (int)topK temperature : (double)
                          temperature randomSeed : (int)randomSeed resolver : (
                              RCTPromiseResolveBlock)
                              resolve rejecter : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(releaseModel : (int)handle resolver : (RCTPromiseResolveBlock)
                      resolve rejecter : (RCTPromiseRejectBlock)reject)

// Generation
RCT_EXTERN_METHOD(generateResponse : (int)handle requestId : (int)
                      requestId prompt : (NSString *)
                          prompt resolver : (RCTPromiseResolveBlock)
                              resolve rejecter : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(generateResponseAsync : (int)handle requestId : (int)
                      requestId prompt : (NSString *)
                          prompt resolver : (RCTPromiseResolveBlock)
                              resolve rejecter : (RCTPromiseRejectBlock)reject)

// Download management
RCT_EXTERN_METHOD(isModelDownloaded : (NSString *)modelName resolver : (
    RCTPromiseResolveBlock)resolve rejecter : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getDownloadedModels : (RCTPromiseResolveBlock)
                      resolve rejecter : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(deleteDownloadedModel : (NSString *)modelName resolver : (
    RCTPromiseResolveBlock)resolve rejecter : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(downloadModel : (NSString *)url modelName : (NSString *)
                      modelName options : (NSDictionary *)
                          options resolver : (RCTPromiseResolveBlock)
                              resolve rejecter : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(cancelDownload : (NSString *)modelName resolver : (
    RCTPromiseResolveBlock)resolve rejecter : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(
    createModelFromDownloaded : (NSString *)modelName maxTokens : (
        nonnull NSNumber *)maxTokens topK : (nonnull NSNumber *)
        topK temperature : (nonnull NSNumber *)temperature randomSeed : (
            nonnull NSNumber *)randomSeed options : (NSDictionary *)
            options resolver : (RCTPromiseResolveBlock)
                resolve rejecter : (RCTPromiseRejectBlock)reject)

// Multimodal (stubs for iOS)
RCT_EXTERN_METHOD(addImageToSession : (int)handle imagePath : (NSString *)
                      imagePath resolver : (RCTPromiseResolveBlock)
                          resolve rejecter : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(addAudioToSession : (int)handle audioPath : (NSString *)
                      audioPath resolver : (RCTPromiseResolveBlock)
                          resolve rejecter : (RCTPromiseRejectBlock)reject)

@end
