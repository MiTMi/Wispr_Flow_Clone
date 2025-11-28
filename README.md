# Wispr Flow Clone

A macOS voice dictation app inspired by Wispr Flow.

## Features

- **Global Shortcut**: Press `Cmd+Shift+Space` to toggle the floating bar.
- **Voice Dictation**: Records your voice and transcribes it using OpenAI Whisper.
- **AI Formatting**: Formats the text using GPT-4o to remove filler words and improve flow.
- **Auto-Injection**: Automatically types the formatted text into the active application.

## Setup

1.  Install dependencies:
    ```bash
    npm install
    ```
2.  Copy `.env.example` to `.env` and add your OpenAI API Key:
    ```bash
    cp .env.example .env
    ```
3.  Run the app:
    ```bash
    npm run dev
    ```

## Usage

1.  Run the app.
2.  Focus on any text field (e.g., Notes, TextEdit, Browser).
3.  Press `Cmd+Shift+Space`.
4.  Speak your thoughts.
5.  Press `Cmd+Shift+Space` again to stop.
6.  Watch the text appear!
