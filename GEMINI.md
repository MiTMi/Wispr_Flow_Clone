# Wispr Flow Clone

## Project Overview

**Wispr Flow Clone** is a macOS-focused Electron application designed for high-performance voice dictation. It allows users to capture speech globally (across any application) using a configurable shortcut, transcribes it using Groq's fast inference API (Whisper), and formats the text using an LLM (Llama 3) before automatically injecting it into the active application.

### Key Technologies

*   **Electron:** Core framework for cross-platform desktop integration (window management, tray icon, global shortcuts).
*   **React:** Frontend library for the UI, including the floating dictation bar, audio visualizer, and settings dashboard.
*   **TypeScript:** Primary language for both Main and Renderer processes.
*   **Vite (electron-vite):** Fast build tool and bundler.
*   **Groq API:** Powers the AI pipeline:
    *   **Transcription:** `whisper-large-v3-turbo` for near-instant speech-to-text.
    *   **Formatting:** `llama-3.3-70b-versatile` for styling text (Polished, Casual, Bullet Points, etc.).
*   **uiohook-napi:** Handles global keyboard hooks for "Push-to-Talk" functionality.
*   **TailwindCSS:** Utility-first CSS framework for styling.

### Architecture

The application follows the standard Electron **Main/Renderer** process model:

1.  **Main Process (`src/main/`)**:
    *   **`index.ts`**: Application entry point. Manages `BrowserWindow` creation, tray icons, and global shortcuts (toggle/hold). Handles the `audio-data` IPC event to orchestrate the AI pipeline.
    *   **`openai.ts`**: (Note: Actually uses Groq) Handles the API calls. Receives audio buffer -> Saves temp file -> Transcribes -> Formats -> Injects via Clipboard/AppleScript.
    *   **`history.ts`**: Manages local JSON storage for dictation history and statistics.
    *   **`uiohook` Integration**: Monitors low-level keyboard events to support "Push-to-Talk" (hold key) which standard Electron shortcuts don't support well.

2.  **Renderer Process (`src/renderer/`)**:
    *   **`App.tsx`**: Main UI component. Handles the microphone stream (`MediaRecorder`), draws the audio visualizer (Web Audio API), and routes between views (`flow`, `settings`, `examples`).
    *   **IPC Communication**: Sends recorded audio buffers to the Main process and listens for state changes (processing, window visibility).

## Building and Running

### Prerequisites

*   Node.js (LTS recommended)
*   **Groq API Key**: Required for transcription and formatting.

### Setup

1.  **Install Dependencies:**
    ```bash
    npm install
    ```

2.  **Environment Configuration:**
    Create a `.env` file in the root directory (copy from `.env.example` if available) and add your API key:
    ```env
    GROQ_API_KEY=your_groq_api_key_here
    ```

3.  **Development Server:**
    Starts the Electron app with Hot Module Replacement (HMR).
    ```bash
    npm run dev
    ```

4.  **Production Build:**
    Builds the application for macOS (default target).
    ```bash
    npm run build:mac
    ```
    *   Other targets: `npm run build:win`, `npm run build:linux`.

### Code Quality

*   **Linting:** `npm run lint` (ESLint)
*   **Formatting:** `npm run format` (Prettier)
*   **Type Checking:** `npm run typecheck` (TypeScript)

## Development Conventions

*   **IPC Pattern:** The Renderer sends extensive work (audio processing) to the Main process to keep the UI responsive.
*   **State Management:** Local React state is used for UI (visualizer, recording status). Persistent settings are managed by the Main process (`settings.json`) and synchronized via IPC.
*   **Styling:** TailwindCSS classes are used directly in React components.
*   **Text Injection:** Uses a robust method involving saving the clipboard, writing text, triggering `Cmd+V` via AppleScript, and then restoring the original clipboard content.
