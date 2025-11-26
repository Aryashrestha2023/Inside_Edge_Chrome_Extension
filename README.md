# 🌐 Inside Edge – AI-Powered Chrome Extension  

Inside Edge is an intelligent browser assistant designed to help users read smarter, learn faster, and work efficiently. It integrates AI-powered summarization, translation, note-taking, definitions, and contextual assistance directly inside webpages — without requiring users to switch tabs or break focus.

---

## ✨ Key Features

- **AI Text Summarization**
  - Summarize articles, research papers, or selected text using Google Gemini API.
  - Supports brief, detailed, and bullet-based summary styles.

- **Context Menu Smart Actions**
  - Right-click any text to:
    - Summarize  
    - Translate  
    - Save to Notes  
    - Define a word or phrase  

- **AI Chat Based on Page Content**
  - Ask questions about the webpage, and the extension answers strictly using page content.
  - Helps with learning, research, technical comprehension, and study tasks.

- **Smart Note System**
  - Save summaries, chat responses, translations, and highlights as timestamped notes.
  - Persistent storage using Chrome Storage Sync.

- **Inline Popup Bubble**
  - View AI responses instantly on the webpage — no new tab or modal required.

- **Language Translation**
  - Powered by *MyMemory Translation API* (no key required).
  - Supports multiple languages with inline UI.

- **Text-to-Speech**
  - Listen to AI answers using the Web Speech API.

- **API Key Management**
  - Users can update their Gemini API key anytime when usage limits are reached.

---

## 🔧 Tech Stack

| Technology | Purpose |
|-----------|---------|
| **JavaScript (ES6)** | Core extension logic |
| **Chrome Extension APIs (Manifest V3)** | Permissions, scripting, storage, UI |
| **Google Gemini API** | Summaries, chat, definitions, cheat-sheets |
| **MyMemory Translation API** | Text translation |
| **Web Speech API** | Text-to-Speech responses |
| **HTML / CSS** | Popup UI, styling |
| **pdf.js (optional)** | Capability for PDF extraction (disabled in current build) |

---

## 📦 Installation (Local Developer Mode)

1. Clone or download this repository:
   ```sh
   git clone https://github.com/Aryashrestha2023/Inside_Edge_Chrome_Extension.git
