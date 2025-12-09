import { app, safeStorage } from 'electron'
import crypto from 'crypto'
import { machineId } from 'node-machine-id'
import { join } from 'path'
import { readFileSync, writeFileSync, existsSync } from 'fs'

// Encryption configuration
const ALGORITHM = 'aes-256-gcm'
const KEY_LENGTH = 32 // 256 bits
const IV_LENGTH = 16 // 128 bits for GCM
const PBKDF2_ITERATIONS = 100000
const KEY_STORAGE_FILE = 'encryption-key.enc'

// Encrypted payload format
export interface EncryptedPayload {
  version: 2
  encrypted: string // hex-encoded ciphertext
  iv: string // hex-encoded initialization vector
  tag: string // hex-encoded auth tag
  timestamp: number
}

// Storage wrapper for version detection
export interface StorageWrapper<T> {
  version: 1 | 2 // 1=plaintext, 2=encrypted
  data: T | EncryptedPayload
}

// Master key cache
let masterKeyCache: Buffer | null = null

/**
 * Get the path to the encryption key storage file
 */
const getKeyStoragePath = (): string => {
  return join(app.getPath('userData'), KEY_STORAGE_FILE)
}

/**
 * Generate a master encryption key from machine ID
 * Uses PBKDF2 with machine ID + platform as input
 */
const generateMasterKey = async (): Promise<Buffer> => {
  try {
    const id = await machineId()
    const salt = crypto.createHash('sha256').update(id + process.platform).digest()

    return crypto.pbkdf2Sync(
      id + process.platform, // input
      salt.slice(0, 16), // salt (first 16 bytes)
      PBKDF2_ITERATIONS,
      KEY_LENGTH,
      'sha256'
    )
  } catch (error) {
    console.error('[Encryption] Failed to generate master key:', error)
    throw new Error('Failed to generate encryption key')
  }
}

/**
 * Store master key in OS keychain using safeStorage
 */
export const storeMasterKey = async (key: Buffer): Promise<void> => {
  try {
    if (!safeStorage.isEncryptionAvailable()) {
      console.warn('[Encryption] safeStorage not available, storing key in file')
      // Fallback: store encrypted key in file
      const keyPath = getKeyStoragePath()
      writeFileSync(keyPath, key.toString('base64'), 'utf-8')
      return
    }

    const encrypted = safeStorage.encryptString(key.toString('base64'))
    const keyPath = getKeyStoragePath()
    writeFileSync(keyPath, encrypted)

    console.log('[Encryption] Master key stored securely')
  } catch (error) {
    console.error('[Encryption] Failed to store master key:', error)
    throw error
  }
}

/**
 * Retrieve master key from OS keychain
 */
const retrieveStoredKey = async (): Promise<Buffer | null> => {
  try {
    const keyPath = getKeyStoragePath()

    if (!existsSync(keyPath)) {
      return null
    }

    const encrypted = readFileSync(keyPath)

    if (!safeStorage.isEncryptionAvailable()) {
      // Fallback: read base64 key from file
      const keyString = encrypted.toString('utf-8')
      return Buffer.from(keyString, 'base64')
    }

    const decrypted = safeStorage.decryptString(encrypted)
    return Buffer.from(decrypted, 'base64')
  } catch (error) {
    console.error('[Encryption] Failed to retrieve stored key:', error)
    return null
  }
}

/**
 * Get or generate the master encryption key
 * Caches the key in memory for performance
 */
export const getMasterKey = async (): Promise<Buffer> => {
  // Return cached key if available
  if (masterKeyCache) {
    return masterKeyCache
  }

  // Try to retrieve stored key
  const storedKey = await retrieveStoredKey()

  if (storedKey) {
    masterKeyCache = storedKey
    console.log('[Encryption] Using stored master key')
    return storedKey
  }

  // Generate new key
  console.log('[Encryption] Generating new master key')
  const newKey = await generateMasterKey()

  // Store the key
  await storeMasterKey(newKey)

  // Cache it
  masterKeyCache = newKey

  return newKey
}

/**
 * Encrypt data using AES-256-GCM
 */
export const encryptData = async (data: any): Promise<EncryptedPayload> => {
  try {
    const key = await getMasterKey()
    const iv = crypto.randomBytes(IV_LENGTH)
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv)

    // Convert data to JSON string
    const plaintext = JSON.stringify(data)

    // Encrypt
    let encrypted = cipher.update(plaintext, 'utf8', 'hex')
    encrypted += cipher.final('hex')

    // Get authentication tag
    const tag = cipher.getAuthTag()

    return {
      version: 2,
      encrypted,
      iv: iv.toString('hex'),
      tag: tag.toString('hex'),
      timestamp: Date.now()
    }
  } catch (error) {
    console.error('[Encryption] Encryption failed:', error)
    throw new Error('Failed to encrypt data')
  }
}

/**
 * Decrypt data using AES-256-GCM
 */
export const decryptData = async (payload: EncryptedPayload): Promise<any> => {
  try {
    const key = await getMasterKey()
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(payload.iv, 'hex')
    )

    // Set authentication tag
    decipher.setAuthTag(Buffer.from(payload.tag, 'hex'))

    // Decrypt
    let decrypted = decipher.update(payload.encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')

    // Parse JSON
    return JSON.parse(decrypted)
  } catch (error) {
    console.error('[Encryption] Decryption failed:', error)
    throw new Error('Failed to decrypt data - data may be corrupted or key is incorrect')
  }
}

/**
 * Initialize encryption system
 * Call this on app startup
 */
export const initializeEncryption = async (): Promise<void> => {
  try {
    console.log('[Encryption] Initializing encryption system')
    await getMasterKey()
    console.log('[Encryption] Encryption system ready')
  } catch (error) {
    console.error('[Encryption] Failed to initialize encryption:', error)
    throw error
  }
}

/**
 * Export the master key as a base64 string for backup
 */
export const exportMasterKey = async (): Promise<string> => {
  try {
    const key = await getMasterKey()
    return key.toString('base64')
  } catch (error) {
    console.error('[Encryption] Failed to export key:', error)
    throw new Error('Failed to export encryption key')
  }
}

/**
 * Import a master key from a base64 string
 */
export const importMasterKey = async (keyString: string): Promise<boolean> => {
  try {
    // Decode and validate
    const key = Buffer.from(keyString, 'base64')

    if (key.length !== KEY_LENGTH) {
      throw new Error(`Invalid key length: expected ${KEY_LENGTH} bytes, got ${key.length}`)
    }

    // Store the key
    await storeMasterKey(key)

    // Update cache
    masterKeyCache = key

    console.log('[Encryption] Master key imported successfully')
    return true
  } catch (error) {
    console.error('[Encryption] Key import failed:', error)
    return false
  }
}

/**
 * Check if data is encrypted (version 2) or plaintext (version 1 or array)
 */
export const isEncrypted = (data: any): boolean => {
  return data && typeof data === 'object' && data.version === 2 && 'encrypted' in data
}

/**
 * Helper to detect storage format version
 */
export const detectStorageVersion = (data: any): 1 | 2 => {
  if (Array.isArray(data)) {
    return 1 // Old plaintext array format
  }
  if (data && typeof data === 'object' && data.version === 2) {
    return 2 // Encrypted format
  }
  return 1 // Default to plaintext
}
