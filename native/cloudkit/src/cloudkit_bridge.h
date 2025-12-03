#ifndef CLOUDKIT_BRIDGE_H
#define CLOUDKIT_BRIDGE_H

#ifdef __cplusplus
extern "C" {
#endif

void* cloudkit_init(const char* containerIdentifier);
void cloudkit_save_settings(void* manager, const char* jsonSettings, void (*callback)(bool, const char*));
void cloudkit_fetch_settings(void* manager, void (*callback)(const char*, const char*));
void cloudkit_save_history_item(void* manager, const char* jsonItem, void (*callback)(bool, const char*));
void cloudkit_fetch_all_history(void* manager, void (*callback)(const char*, const char*));
void cloudkit_delete_history_item(void* manager, const char* itemId, void (*callback)(bool, const char*));
void cloudkit_save_note(void* manager, const char* jsonNote, void (*callback)(bool, const char*));
void cloudkit_fetch_all_notes(void* manager, void (*callback)(const char*, const char*));
void cloudkit_delete_note(void* manager, const char* itemId, void (*callback)(bool, const char*));

#ifdef __cplusplus
}
#endif

#endif // CLOUDKIT_BRIDGE_H
