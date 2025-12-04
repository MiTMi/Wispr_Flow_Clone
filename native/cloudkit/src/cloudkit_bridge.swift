import Foundation
import CloudKit

// MARK: - CloudKit Manager
@objc public class CloudKitManager: NSObject {
    private let container: CKContainer
    private let privateDB: CKDatabase
    private let deviceId: String

    @objc public init(containerIdentifier: String) {
        self.container = CKContainer(identifier: containerIdentifier)
        self.privateDB = container.privateCloudDatabase
        self.deviceId = UUID().uuidString
        super.init()
        print("[CloudKit] Initialized with container: \(containerIdentifier)")
    }

    // MARK: - Settings Operations
    @objc public func saveSettings(_ settingsDict: [String: Any], completion: @escaping (Bool, String?) -> Void) {
        let recordID = CKRecord.ID(recordName: "settings-\(deviceId)")
        let record = CKRecord(recordType: "Settings", recordID: recordID)

        // Map dictionary to CKRecord fields
        if let hotkey = settingsDict["hotkey"] as? String {
            record["hotkey"] = hotkey as CKRecordValue
        }
        if let triggerMode = settingsDict["triggerMode"] as? String {
            record["triggerMode"] = triggerMode as CKRecordValue
        }
        if let holdKey = settingsDict["holdKey"] as? Int64 {
            record["holdKey"] = holdKey as CKRecordValue
        }
        if let startOnLogin = settingsDict["startOnLogin"] as? Bool {
            record["startOnLogin"] = (startOnLogin ? 1 : 0) as CKRecordValue
        }
        if let style = settingsDict["style"] as? String {
            record["style"] = style as CKRecordValue
        }
        if let language = settingsDict["language"] as? String {
            record["language"] = language as CKRecordValue
        }
        if let customInstructions = settingsDict["customInstructions"] as? String {
            record["customInstructions"] = customInstructions as CKRecordValue
        }

        record["deviceId"] = deviceId as CKRecordValue
        record["modifiedAt"] = Date() as CKRecordValue

        privateDB.save(record) { (savedRecord, error) in
            if let error = error {
                completion(false, error.localizedDescription)
            } else {
                completion(true, nil)
            }
        }
    }

    @objc public func fetchSettings(completion: @escaping ([String: Any]?, String?) -> Void) {
        let recordID = CKRecord.ID(recordName: "settings-\(deviceId)")

        privateDB.fetch(withRecordID: recordID) { (record, error) in
            if let error = error {
                let ckError = error as NSError
                if ckError.code == CKError.unknownItem.rawValue {
                    // Record doesn't exist yet, not an error
                    completion(nil, nil)
                } else {
                    completion(nil, error.localizedDescription)
                }
                return
            }

            guard let record = record else {
                completion(nil, nil)
                return
            }

            var dict: [String: Any] = [:]
            dict["hotkey"] = record["hotkey"] as? String
            dict["triggerMode"] = record["triggerMode"] as? String
            dict["holdKey"] = record["holdKey"] as? Int64

            if let startOnLogin = record["startOnLogin"] as? Int64 {
                dict["startOnLogin"] = startOnLogin != 0
            }

            dict["style"] = record["style"] as? String
            dict["language"] = record["language"] as? String
            dict["customInstructions"] = record["customInstructions"] as? String

            completion(dict, nil)
        }
    }

    // MARK: - History Operations
    @objc public func saveHistoryItem(_ itemDict: [String: Any], completion: @escaping (Bool, String?) -> Void) {
        guard let itemId = itemDict["itemId"] as? String else {
            completion(false, "Missing itemId")
            return
        }

        let recordID = CKRecord.ID(recordName: "history-\(itemId)")
        let record = CKRecord(recordType: "HistoryItem", recordID: recordID)

        record["itemId"] = itemId as CKRecordValue

        if let text = itemDict["text"] as? String {
            record["text"] = text as CKRecordValue
        }
        if let timestamp = itemDict["timestamp"] as? Double {
            record["timestamp"] = Date(timeIntervalSince1970: timestamp / 1000) as CKRecordValue
        }
        if let duration = itemDict["duration"] as? Double {
            record["duration"] = duration as CKRecordValue
        }
        if let wpm = itemDict["wpm"] as? Int64 {
            record["wpm"] = wpm as CKRecordValue
        }

        record["deviceId"] = deviceId as CKRecordValue

        privateDB.save(record) { (savedRecord, error) in
            if let error = error {
                completion(false, error.localizedDescription)
            } else {
                completion(true, nil)
            }
        }
    }

    @objc public func fetchAllHistory(completion: @escaping ([[String: Any]]?, String?) -> Void) {
        let query = CKQuery(recordType: "HistoryItem", predicate: NSPredicate(value: true))
        query.sortDescriptors = [NSSortDescriptor(key: "timestamp", ascending: false)]

        privateDB.perform(query, inZoneWith: nil) { (records, error) in
            if let error = error {
                completion(nil, error.localizedDescription)
                return
            }

            guard let records = records else {
                completion([], nil)
                return
            }

            var items: [[String: Any]] = []
            for record in records {
                var dict: [String: Any] = [:]
                dict["itemId"] = record["itemId"] as? String
                dict["text"] = record["text"] as? String

                if let timestamp = record["timestamp"] as? Date {
                    dict["timestamp"] = timestamp.timeIntervalSince1970 * 1000
                }

                dict["duration"] = record["duration"] as? Double
                dict["wpm"] = record["wpm"] as? Int64

                items.append(dict)
            }

            completion(items, nil)
        }
    }

    @objc public func deleteHistoryItem(_ itemId: String, completion: @escaping (Bool, String?) -> Void) {
        let recordID = CKRecord.ID(recordName: "history-\(itemId)")

        privateDB.delete(withRecordID: recordID) { (deletedRecordID, error) in
            if let error = error {
                completion(false, error.localizedDescription)
            } else {
                completion(true, nil)
            }
        }
    }

    // MARK: - Notes Operations
    @objc public func saveNote(_ noteDict: [String: Any], completion: @escaping (Bool, String?) -> Void) {
        guard let itemId = noteDict["itemId"] as? String else {
            completion(false, "Missing itemId")
            return
        }

        let recordID = CKRecord.ID(recordName: "note-\(itemId)")
        let record = CKRecord(recordType: "NoteItem", recordID: recordID)

        record["itemId"] = itemId as CKRecordValue

        if let content = noteDict["content"] as? String {
            record["content"] = content as CKRecordValue
        }
        if let timestamp = noteDict["timestamp"] as? Double {
            record["timestamp"] = Date(timeIntervalSince1970: timestamp / 1000) as CKRecordValue
        }

        record["deviceId"] = deviceId as CKRecordValue

        privateDB.save(record) { (savedRecord, error) in
            if let error = error {
                completion(false, error.localizedDescription)
            } else {
                completion(true, nil)
            }
        }
    }

    @objc public func fetchAllNotes(completion: @escaping ([[String: Any]]?, String?) -> Void) {
        let query = CKQuery(recordType: "NoteItem", predicate: NSPredicate(value: true))
        query.sortDescriptors = [NSSortDescriptor(key: "timestamp", ascending: false)]

        privateDB.perform(query, inZoneWith: nil) { (records, error) in
            if let error = error {
                completion(nil, error.localizedDescription)
                return
            }

            guard let records = records else {
                completion([], nil)
                return
            }

            var items: [[String: Any]] = []
            for record in records {
                var dict: [String: Any] = [:]
                dict["itemId"] = record["itemId"] as? String
                dict["content"] = record["content"] as? String

                if let timestamp = record["timestamp"] as? Date {
                    dict["timestamp"] = timestamp.timeIntervalSince1970 * 1000
                }

                items.append(dict)
            }

            completion(items, nil)
        }
    }

    @objc public func deleteNote(_ itemId: String, completion: @escaping (Bool, String?) -> Void) {
        let recordID = CKRecord.ID(recordName: "note-\(itemId)")

        privateDB.delete(withRecordID: recordID) { (deletedRecordID, error) in
            if let error = error {
                completion(false, error.localizedDescription)
            } else {
                completion(true, nil)
            }
        }
    }
}
