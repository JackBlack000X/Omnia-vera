#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(WidgetCenterBridge, NSObject)

RCT_EXTERN_METHOD(reloadAllTimelines:(RCTPromiseResolveBlock)resolve
                  rejecter:(RCTPromiseRejectBlock)reject)

@end
