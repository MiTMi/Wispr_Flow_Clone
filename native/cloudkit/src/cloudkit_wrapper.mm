#import <Foundation/Foundation.h>
#import "cloudkit_bridge.h"
#import "wispr-flow-clone-Swift.h"

extern "C" {
    void* cloudkit_init(const char* containerIdentifier) {
        @autoreleasepool {
            NSString *identifier = [NSString stringWithUTF8String:containerIdentifier];
            CloudKitManager *manager = [[CloudKitManager alloc] initWithContainerIdentifier:identifier];
            return (__bridge_retained void*)manager;
        }
    }

    void cloudkit_save_settings(void* manager, const char* jsonSettings, void (*callback)(bool, const char*)) {
        @autoreleasepool {
            CloudKitManager *ckManager = (__bridge CloudKitManager*)manager;
            NSString *json = [NSString stringWithUTF8String:jsonSettings];
            NSData *data = [json dataUsingEncoding:NSUTF8StringEncoding];

            NSError *error = nil;
            NSDictionary *dict = [NSJSONSerialization JSONObjectWithData:data options:0 error:&error];

            if (error) {
                callback(false, [[error localizedDescription] UTF8String]);
                return;
            }

            [ckManager saveSettings:dict completion:^(BOOL success, NSString *errorMsg) {
                callback(success, errorMsg ? [errorMsg UTF8String] : nullptr);
            }];
        }
    }

    void cloudkit_fetch_settings(void* manager, void (*callback)(const char*, const char*)) {
        @autoreleasepool {
            CloudKitManager *ckManager = (__bridge CloudKitManager*)manager;

            [ckManager fetchSettingsWithCompletion:^(NSDictionary *dict, NSString *errorMsg) {
                if (errorMsg) {
                    callback(nullptr, [errorMsg UTF8String]);
                    return;
                }

                if (!dict) {
                    callback(nullptr, nullptr);
                    return;
                }

                NSError *error = nil;
                NSData *jsonData = [NSJSONSerialization dataWithJSONObject:dict options:0 error:&error];

                if (error) {
                    callback(nullptr, [[error localizedDescription] UTF8String]);
                    return;
                }

                NSString *jsonString = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
                callback([jsonString UTF8String], nullptr);
            }];
        }
    }

    void cloudkit_save_history_item(void* manager, const char* jsonItem, void (*callback)(bool, const char*)) {
        @autoreleasepool {
            CloudKitManager *ckManager = (__bridge CloudKitManager*)manager;
            NSString *json = [NSString stringWithUTF8String:jsonItem];
            NSData *data = [json dataUsingEncoding:NSUTF8StringEncoding];

            NSError *error = nil;
            NSDictionary *dict = [NSJSONSerialization JSONObjectWithData:data options:0 error:&error];

            if (error) {
                callback(false, [[error localizedDescription] UTF8String]);
                return;
            }

            [ckManager saveHistoryItem:dict completion:^(BOOL success, NSString *errorMsg) {
                callback(success, errorMsg ? [errorMsg UTF8String] : nullptr);
            }];
        }
    }

    void cloudkit_fetch_all_history(void* manager, void (*callback)(const char*, const char*)) {
        @autoreleasepool {
            CloudKitManager *ckManager = (__bridge CloudKitManager*)manager;

            [ckManager fetchAllHistoryWithCompletion:^(NSArray *items, NSString *errorMsg) {
                if (errorMsg) {
                    callback(nullptr, [errorMsg UTF8String]);
                    return;
                }

                NSError *error = nil;
                NSData *jsonData = [NSJSONSerialization dataWithJSONObject:items ?: @[] options:0 error:&error];

                if (error) {
                    callback(nullptr, [[error localizedDescription] UTF8String]);
                    return;
                }

                NSString *jsonString = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
                callback([jsonString UTF8String], nullptr);
            }];
        }
    }

    void cloudkit_delete_history_item(void* manager, const char* itemId, void (*callback)(bool, const char*)) {
        @autoreleasepool {
            CloudKitManager *ckManager = (__bridge CloudKitManager*)manager;
            NSString *idString = [NSString stringWithUTF8String:itemId];

            [ckManager deleteHistoryItem:idString completion:^(BOOL success, NSString *errorMsg) {
                callback(success, errorMsg ? [errorMsg UTF8String] : nullptr);
            }];
        }
    }

    void cloudkit_save_note(void* manager, const char* jsonNote, void (*callback)(bool, const char*)) {
        @autoreleasepool {
            CloudKitManager *ckManager = (__bridge CloudKitManager*)manager;
            NSString *json = [NSString stringWithUTF8String:jsonNote];
            NSData *data = [json dataUsingEncoding:NSUTF8StringEncoding];

            NSError *error = nil;
            NSDictionary *dict = [NSJSONSerialization JSONObjectWithData:data options:0 error:&error];

            if (error) {
                callback(false, [[error localizedDescription] UTF8String]);
                return;
            }

            [ckManager saveNote:dict completion:^(BOOL success, NSString *errorMsg) {
                callback(success, errorMsg ? [errorMsg UTF8String] : nullptr);
            }];
        }
    }

    void cloudkit_fetch_all_notes(void* manager, void (*callback)(const char*, const char*)) {
        @autoreleasepool {
            CloudKitManager *ckManager = (__bridge CloudKitManager*)manager;

            [ckManager fetchAllNotesWithCompletion:^(NSArray *items, NSString *errorMsg) {
                if (errorMsg) {
                    callback(nullptr, [errorMsg UTF8String]);
                    return;
                }

                NSError *error = nil;
                NSData *jsonData = [NSJSONSerialization dataWithJSONObject:items ?: @[] options:0 error:&error];

                if (error) {
                    callback(nullptr, [[error localizedDescription] UTF8String]);
                    return;
                }

                NSString *jsonString = [[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding];
                callback([jsonString UTF8String], nullptr);
            }];
        }
    }

    void cloudkit_delete_note(void* manager, const char* itemId, void (*callback)(bool, const char*)) {
        @autoreleasepool {
            CloudKitManager *ckManager = (__bridge CloudKitManager*)manager;
            NSString *idString = [NSString stringWithUTF8String:itemId];

            [ckManager deleteNote:idString completion:^(BOOL success, NSString *errorMsg) {
                callback(success, errorMsg ? [errorMsg UTF8String] : nullptr);
            }];
        }
    }
}
