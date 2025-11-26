console.log("Popup ready.");

const NOTE_KEY = "quickNotes";
const GEMINI_KEY = "geminiApiKey";
const CHAT_HISTORY_KEY = "chatHistory";

// UI elements
const summarizeBtn = document.getElementById("summarize");
const summaryTypeSelect = document.getElementById("summary-type");
const resultDiv = document.getElementById("result");
const saveSummaryBtn = document.getElementById("save-summary-note");
const clearSummaryBtn = document.getElementById("clear-summary");
const saveSummaryFeedbackEl = document.getElementById("save-summary-feedback");

const noteInput = document.getElementById("note-input");
const notesList = document.getElementById("notes-list");
const saveNoteBtn = document.getElementById("save-note");
const clearNotesBtn = document.getElementById("clear-notes");
const newNoteBtn = document.getElementById("new-note");

const chatWindow = document.getElementById("chat-window");
const chatInput = document.getElementById("chat-input");
const askBtn = document.getElementById("ask-btn");
const clearChatBtn = document.getElementById("clear-chat");
const ttsBtn = document.getElementById("tts-btn");
const micBtn = document.getElementById("mic-btn");
const saveChatNoteBtn = document.getElementById("save-chat-note");   // 🆕

// Translation UI elements
const translatePageBtn = document.getElementById("translate-page");
const translateTargetLangSelect = document.getElementById("translate-target-lang");
const translationResultDiv = document.getElementById("translation-result");
const saveTranslationNoteBtn = document.getElementById("save-translation-note");
const clearTranslationBtn = document.getElementById("clear-translation");
const openApiSettingsBtn = document.getElementById("open-api-settings");
const downloadTranslationBtn = document.getElementById("download-translation");
const translationWarning = document.getElementById("translation-warning");



let lastAIAnswer = "";
let editingNoteId = null;
let lastTranslation = "";


const downloadCheatsheetBtn = document.getElementById("download-cheatsheet");
const cheatsheetStatus = document.getElementById("cheatsheet-status");




// ---------- Ensure content script ----------
async function ensureContentScript() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return null;
  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ["content.js"]
    });
  } catch (e) {
    console.warn("content.js injection warning:", e);
  }
  return tab.id;
}

// ---------- PDF extraction using pdf.js ----------
// --- PDF text extraction using pdf.js + fetch ---
async function extractPdfText(url) {
  if (typeof pdfjsLib === "undefined") {
    console.error("pdfjsLib is not available. Check pdf.js inclusion.");
    return "";
  }

  // Worker path inside your extension
  pdfjsLib.GlobalWorkerOptions.workerSrc = chrome.runtime.getURL("pdf.worker.js");

  console.log("Fetching PDF bytes:", url);
  const resp = await fetch(url);
  if (!resp.ok) {
    console.error("Failed to fetch PDF:", resp.status, resp.statusText);
    return "";
  }

  const buffer = await resp.arrayBuffer();
  const uint8 = new Uint8Array(buffer);

  console.log("PDF bytes length:", uint8.length);

  const pdf = await pdfjsLib.getDocument({ data: uint8 }).promise;

  let fullText = "";
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const content = await page.getTextContent();
    const strings = content.items.map(it => it.str);
    fullText += strings.join(" ") + "\n\n";
  }

  console.log("Final extracted PDF text length:", fullText.length);
  return fullText;
}


// ---------- Get page text (HTML or PDF) ----------
// --- Get page text: PDF first, then HTML fallback ---
// --- Get page text: PDF first, then HTML fallback, with debug ---
async function getPageText() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) {
    lastExtractDebug = "No active tab.";
    return "";
  }

  const url = tab.url || "";
  console.log("Active tab URL:", url);
  lastExtractDebug = "URL: " + url;

  // 1) Detect PDF URL
  let pdfUrl = null;

  if (url.startsWith("chrome-extension://") && url.includes("file=")) {
    try {
      pdfUrl = decodeURIComponent(url.split("file=")[1].split("&")[0]);
      console.log("Detected Chrome PDF viewer. PDF URL:", pdfUrl);
      lastExtractDebug = "Chrome PDF viewer → " + pdfUrl;
    } catch (e) {
      console.error("Failed to parse PDF URL from viewer:", e);
      lastExtractDebug = "Failed to parse PDF URL from viewer: " + e.message;
    }
  } else if (url.toLowerCase().includes(".pdf")) {
    pdfUrl = url;
    console.log("Detected direct PDF URL:", pdfUrl);
    lastExtractDebug = "Direct PDF URL: " + pdfUrl;
  }

  // 2) If we have a PDF URL → pdf.js
  if (pdfUrl) {
    try {
      const pdfText = await extractPdfText(pdfUrl);
      console.log("PDF text length:", pdfText.length);
      lastExtractDebug += " | PDF text length=" + pdfText.length;
      if (pdfText && pdfText.length > 50) {
        return pdfText;
      }
    } catch (e) {
      console.error("PDF extraction failed:", e);
      lastExtractDebug += " | PDF extraction error: " + e.message;
    }
  }

  // 3) Fallback: HTML via content.js
  const tabId = await ensureContentScript();
  if (!tabId) {
    lastExtractDebug += " | No tabId for content script.";
    return "";
  }

  const htmlText = await new Promise(resolve => {
    chrome.tabs.sendMessage(tabId, { type: "GET_ARTICLE_TEXT" }, res => {
      if (chrome.runtime.lastError) {
        const msg = chrome.runtime.lastError.message;
        console.warn("Content script error:", msg);
        lastExtractDebug += " | Content script error: " + msg;
        resolve("");
      } else {
        resolve(res?.text || "");
      }
    });
  });

  console.log("HTML fallback text length:", htmlText.length);
  lastExtractDebug += " | HTML text length=" + htmlText.length;

  return htmlText || "";
}



// ---------- Translation Functions ----------
async function translateText(text, targetLang = "en", sourceLang = "auto") {
  // MyMemory Translation API - Free tier: 10,000 words/day, no API key needed
  // Max query length: 500 characters per request
  const MAX_CHUNK_SIZE = 450; // Use 450 to be safe (accounting for encoding)
  
  // If sourceLang is "auto", detect it from first chunk
  let detectedSourceLang = sourceLang;
  if (sourceLang === "auto") {
    const sampleText = text.substring(0, Math.min(100, text.length));
    detectedSourceLang = await detectLanguage(sampleText);
  }

  // Map language codes to MyMemory format
  const langMap = {
    "en": "en", "es": "es", "fr": "fr", "de": "de", "it": "it",
    "pt": "pt", "ru": "ru", "ja": "ja", "zh": "zh", "ar": "ar", "hi": "hi"
  };
  
  const source = langMap[detectedSourceLang] || "en";
  const target = langMap[targetLang] || "en";

  // Split text into chunks if it's too long
  if (text.length <= MAX_CHUNK_SIZE) {
    // Single request for short text
    return await translateChunk(text, source, target);
  }

  // Split into chunks (try to split at word boundaries)
  const chunks = [];
  let currentChunk = "";
  
  const words = text.split(/(\s+)/); // Split but keep whitespace
  for (const word of words) {
    if ((currentChunk + word).length <= MAX_CHUNK_SIZE) {
      currentChunk += word;
    } else {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      // If single word is longer than MAX_CHUNK_SIZE, split it
      if (word.length > MAX_CHUNK_SIZE) {
        for (let i = 0; i < word.length; i += MAX_CHUNK_SIZE) {
          chunks.push(word.substring(i, i + MAX_CHUNK_SIZE));
        }
        currentChunk = "";
      } else {
        currentChunk = word;
      }
    }
  }
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  // Translate each chunk
  console.log(`[AI for Webpage] Translating ${chunks.length} chunks`);
  const translatedChunks = [];
  for (let i = 0; i < chunks.length; i++) {
    try {
      const translated = await translateChunk(chunks[i], source, target);
      translatedChunks.push(translated);
      // Small delay to avoid rate limiting
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    } catch (e) {
      console.error(`[AI for Webpage] Error translating chunk ${i + 1}:`, e);
      translatedChunks.push(chunks[i]); // Use original text if translation fails
    }
  }

  return translatedChunks.join(" ");
}

// Helper: Translate a single chunk (max 500 chars)
async function translateChunk(text, source, target) {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${source}|${target}`;

  const res = await fetch(url);
  const data = await res.json();
  
  // MyMemory always returns HTTP 200, but uses responseStatus in JSON
  if (data.responseStatus !== 200) {
    let errorMsg = "Translation failed";
    if (data.quotaFinished) {
      errorMsg = "Daily translation quota exceeded (10,000 words). Try again tomorrow.";
    } else if (data.errorMessage) {
      errorMsg = data.errorMessage;
    } else if (data.responseDetails) {
      errorMsg = data.responseDetails;
    }
    throw new Error(errorMsg);
  }

  // Check if responseData exists and has translatedText
  if (!data.responseData || !data.responseData.translatedText) {
    throw new Error("No translation received from API");
  }

  return data.responseData.translatedText;
}

async function detectLanguage(text) {
  // Simple language detection using character patterns
  // This is a basic fallback - MyMemory doesn't have a detect endpoint
  const textSample = text.substring(0, 100).toLowerCase();
  
  // Check for common language patterns
  if (/[\u4e00-\u9fff]/.test(textSample)) return "zh"; // Chinese
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(textSample)) return "ja"; // Japanese
  if (/[\u0600-\u06ff]/.test(textSample)) return "ar"; // Arabic
  if (/[\u0400-\u04ff]/.test(textSample)) return "ru"; // Russian
  if (/[àáâãäåæçèéêëìíîïðñòóôõö]/.test(textSample)) {
    if (/[ñ]/.test(textSample)) return "es"; // Spanish
    if (/[ç]/.test(textSample)) return "fr"; // French
    return "es"; // Default to Spanish for accented characters
  }
  if (/[äöüß]/.test(textSample)) return "de"; // German
  if (/[àèéìíîòóùú]/.test(textSample)) return "it"; // Italian
  if (/[ãõç]/.test(textSample)) return "pt"; // Portuguese
  if (/[\u0900-\u097f]/.test(textSample)) return "hi"; // Hindi
  
  // Default to English if no pattern matches
  return "en";
}

async function translatePage() {
  if (!translationResultDiv || !translateTargetLangSelect) return;

  translationResultDiv.style.display = "block";
  translationResultDiv.innerHTML = `<div class="loader"></div>`;
  lastTranslation = ""; // Reset translation

  // Reset buttons + warning
  if (saveTranslationNoteBtn) {
    saveTranslationNoteBtn.style.display = "none";
    saveTranslationNoteBtn.disabled = true;
    saveTranslationNoteBtn.textContent = "Save Translation to Notes";
  }
  if (downloadTranslationBtn) {
    downloadTranslationBtn.style.display = "none";
  }
  if (translationWarning) {
    translationWarning.style.display = "none";
  }

  try {
    // Get page text
    const fullText = await getPageText();
    const len = fullText?.length || 0;
    console.log("Text to translate length:", len);

    if (!fullText || len < 10) {
      translationResultDiv.textContent = "❌ Could not extract enough text from this page.";
      return;
    }

    // Limit text length for translation
    const MAX_TRANSLATE_LENGTH = 5000;
    const textToTranslate = len > MAX_TRANSLATE_LENGTH
      ? fullText.slice(0, MAX_TRANSLATE_LENGTH) + "..."
      : fullText;

    const targetLang = translateTargetLangSelect.value || "en";
    
    // Detect source language
    const sourceLang = await detectLanguage(textToTranslate);
    console.log("Detected source language:", sourceLang);

    // Translate
    const translated = await translateText(textToTranslate, targetLang, sourceLang);
    
    // Store translation
    lastTranslation = translated;
    translationResultDiv.textContent = translated;

    // Show save button
    if (saveTranslationNoteBtn) {
      saveTranslationNoteBtn.style.display = "inline-block";
      saveTranslationNoteBtn.disabled = false;
      console.log("[AI for Webpage] Translation completed, save button visible");
    }

    // Show download button and warning if translation is large
    const LARGE_TRANSLATION_THRESHOLD = 2000; // tweak if you want
    if (downloadTranslationBtn) {
      downloadTranslationBtn.style.display = "inline-block";
    }
    if (translationWarning) {
      translationWarning.style.display =
        translated.length > LARGE_TRANSLATION_THRESHOLD ? "block" : "none";
    }

  } catch (e) {
    translationResultDiv.textContent = `❌ Translation error: ${e.message}`;
    console.error("[AI for Webpage] Translation error:", e);
    lastTranslation = ""; // Clear on error
  }
}

if (downloadTranslationBtn) {
  downloadTranslationBtn.addEventListener("click", () => {
    if (!lastTranslation || lastTranslation.trim() === "") {
      alert("No translation available to download.");
      return;
    }

    const blob = new Blob([lastTranslation], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "inside_edge_translation.txt";
    a.click();

    URL.revokeObjectURL(url);
  });
}

if (clearTranslationBtn) {
  clearTranslationBtn.addEventListener("click", () => {
    if (!translationResultDiv) return;
    translationResultDiv.style.display = "none";
    translationResultDiv.textContent = "";
    lastTranslation = "";
    if (saveTranslationNoteBtn) {
      saveTranslationNoteBtn.style.display = "none";
      saveTranslationNoteBtn.disabled = true;
    }
    if (downloadTranslationBtn) {
      downloadTranslationBtn.style.display = "none";
    }
    if (translationWarning) {
      translationWarning.style.display = "none";
    }
  });
}


if (translatePageBtn) {
  translatePageBtn.addEventListener("click", translatePage);
}

if (clearTranslationBtn) {
  clearTranslationBtn.addEventListener("click", () => {
    if (!translationResultDiv) return;
    translationResultDiv.style.display = "none";
    translationResultDiv.textContent = "";
    lastTranslation = "";
    if (saveTranslationNoteBtn) {
      saveTranslationNoteBtn.style.display = "none";
      saveTranslationNoteBtn.disabled = true;
    }
  });
}

if (saveTranslationNoteBtn) {
  saveTranslationNoteBtn.addEventListener("click", () => {
    console.log("[AI for Webpage] Save translation button clicked");
    console.log("[AI for Webpage] lastTranslation:", lastTranslation ? lastTranslation.substring(0, 50) + "..." : "empty");
    
    if (!lastTranslation || lastTranslation.trim() === "") {
      console.warn("[AI for Webpage] No translation to save");
      alert("No translation available to save. Please translate the page first.");
      return;
    }

    chrome.storage.sync.get([NOTE_KEY], res => {
      const notes = res[NOTE_KEY] || [];
      const targetLang = translateTargetLangSelect?.value || "en";
      const langNames = {
        en: "English", es: "Spanish", fr: "French", de: "German",
        it: "Italian", pt: "Portuguese", ru: "Russian", ja: "Japanese",
        zh: "Chinese", ar: "Arabic", hi: "Hindi"
      };
      const langName = langNames[targetLang] || targetLang;

      const noteText = `Translation (${langName}):\n\n${lastTranslation.length > 5000 ? lastTranslation.slice(0, 5000) + "…" : lastTranslation}`;
      
      notes.push({
        id: Date.now(),
        text: noteText,
        createdAt: Date.now()
      });

      chrome.storage.sync.set({ [NOTE_KEY]: notes }, () => {
        if (chrome.runtime.lastError) {
          console.error("[AI for Webpage] Error saving translation:", chrome.runtime.lastError);
          alert("Error saving translation: " + chrome.runtime.lastError.message);
          return;
        }
        
        console.log("[AI for Webpage] Translation saved to notes");
        
        if (typeof renderNotes === "function") {
          renderNotes();
        }
        
        saveTranslationNoteBtn.textContent = "✔ Saved!";
        setTimeout(() => {
          saveTranslationNoteBtn.textContent = "Save Translation to Notes";
        }, 1500);
      });
    });
  });
}

// ---------- Summary ----------
function updateSaveSummaryButtonState() {
  if (!saveSummaryBtn) return;
  const hasText = !!(resultDiv && resultDiv.textContent.trim());
  saveSummaryBtn.disabled = !hasText;
}

async function summarize() {
  if (!resultDiv) return;

  resultDiv.innerHTML = `<div class="loader"></div>`;
  updateSaveSummaryButtonState();

  const stored = await chrome.storage.sync.get([GEMINI_KEY]);
  const geminiApiKey = stored[GEMINI_KEY];
  if (!geminiApiKey) {
    resultDiv.textContent = "⚠ API key missing. Set it in options.";
    updateSaveSummaryButtonState();
    return;
  }

  const fullText = await getPageText();
  const len = fullText?.length || 0;
  console.log("Extracted text length:", len);

    if (!fullText || len < 50) {
    resultDiv.textContent =
        "❌ Could not extract enough text from this page.\n\nDebug: " +
        (lastExtractDebug || "no extra info");
    updateSaveSummaryButtonState && updateSaveSummaryButtonState();
    return;
    }

  const PAGE_TEXT_LIMIT = 60000;
  const text = len > PAGE_TEXT_LIMIT ? fullText.slice(0, PAGE_TEXT_LIMIT) : fullText;
  const mode = summaryTypeSelect ? summaryTypeSelect.value : "brief";

  const prompts = {
    brief: `Summarize the following webpage in 2–3 sentences:\n\n${text}`,
    detailed: `Write a detailed, structured summary of the following webpage. Organize with clear sections if possible:\n\n${text}`,
    bullets: `Summarize the following webpage in 5–10 bullet points:\n\n${text}`
  };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompts[mode] || prompts.brief }] }]
      })
    }
  );

  const data = await res.json();
  resultDiv.textContent =
    data?.candidates?.[0]?.content?.parts?.[0]?.text || "No output.";

  updateSaveSummaryButtonState();
}

if (summarizeBtn) {
  summarizeBtn.addEventListener("click", summarize);
}

if (clearSummaryBtn) {
  clearSummaryBtn.addEventListener("click", () => {
    if (!resultDiv) return;
    resultDiv.textContent = "Select a type and click Summarize...";
    updateSaveSummaryButtonState();
  });
}

if (saveSummaryBtn) {
  saveSummaryBtn.addEventListener("click", () => {
    if (!resultDiv) return;
    const text = resultDiv.textContent.trim();
    if (!text) return;

    chrome.storage.sync.get([NOTE_KEY], res => {
      const notes = res[NOTE_KEY] || [];
      notes.push({
        id: Date.now(),
        text: text.length > 5000 ? text.slice(0, 5000) + "…" : text,
        createdAt: Date.now()
      });
      chrome.storage.sync.set({ [NOTE_KEY]: notes }, () => {
        renderNotes();
        if (saveSummaryFeedbackEl) {
          saveSummaryFeedbackEl.style.display = "inline-block";
          setTimeout(() => {
            saveSummaryFeedbackEl.style.display = "none";
          }, 1200);
        }
      });
    });
  });
}

// ---------- Notes ----------
function renderNotes() {
  if (!notesList) return;
  chrome.storage.sync.get([NOTE_KEY], res => {
    const notes = res[NOTE_KEY] || [];
    notesList.innerHTML = "";

    if (!notes.length) {
      notesList.innerHTML = `<div style="opacity:.6;font-size:13px;">No notes yet</div>`;
      return;
    }

    notes.slice().reverse().forEach(note => {
      const item = document.createElement("div");
      item.className = "note-item";

      const textDiv = document.createElement("div");
      textDiv.className = "note-text";
      const firstLine = (note.text || "").split("\n")[0].trim();
      textDiv.textContent =
        firstLine.length > 60 ? firstLine.slice(0, 60) + "…" :
        firstLine || "(empty note)";

      const metaDiv = document.createElement("div");
      metaDiv.className = "note-meta";

      const ts = document.createElement("span");
      const d = new Date(note.createdAt || Date.now());
      ts.textContent = d.toLocaleString();

      const btnGroup = document.createElement("div");
      const editBtn = document.createElement("button");
      editBtn.className = "note-btn";
      editBtn.textContent = "Edit";

      const delBtn = document.createElement("button");
      delBtn.className = "note-btn";
      delBtn.textContent = "Delete";

      editBtn.addEventListener("click", e => {
        e.stopPropagation();
        if (noteInput) {
          noteInput.value = note.text || "";
        }
        editingNoteId = note.id;
      });

      delBtn.addEventListener("click", e => {
        e.stopPropagation();
        deleteNote(note.id);
      });

      btnGroup.appendChild(editBtn);
      btnGroup.appendChild(delBtn);
      metaDiv.appendChild(ts);
      metaDiv.appendChild(btnGroup);

      item.addEventListener("click", () => {
        if (noteInput) {
          noteInput.value = note.text || "";
        }
        editingNoteId = note.id;
      });

      item.appendChild(textDiv);
      item.appendChild(metaDiv);
      notesList.appendChild(item);
    });
  });
}

function deleteNote(id) {
  chrome.storage.sync.get([NOTE_KEY], res => {
    const notes = res[NOTE_KEY] || [];
    const filtered = notes.filter(n => n.id !== id);
    chrome.storage.sync.set({ [NOTE_KEY]: filtered }, () => {
      if (editingNoteId === id && noteInput) {
        editingNoteId = null;
        noteInput.value = "";
      }
      renderNotes();
    });
  });
}

if (saveNoteBtn) {
  saveNoteBtn.addEventListener("click", () => {
    if (!noteInput) return;
    const txt = noteInput.value.trim();
    if (!txt) return;

    chrome.storage.sync.get([NOTE_KEY], res => {
      const notes = res[NOTE_KEY] || [];
      let updated;

      if (editingNoteId) {
        updated = notes.map(n =>
          n.id === editingNoteId ? { ...n, text: txt, updatedAt: Date.now() } : n
        );
      } else {
        updated = [
          ...notes,
          {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
            text: txt,
            createdAt: Date.now()
          }
        ];
      }

      chrome.storage.sync.set({ [NOTE_KEY]: updated }, () => {
        noteInput.value = "";
        editingNoteId = null;
        renderNotes();
      });
    });
  });
}

if (clearNotesBtn) {
  clearNotesBtn.addEventListener("click", () => {
    if (!confirm("Clear all notes?")) return;
    chrome.storage.sync.set({ [NOTE_KEY]: [] }, () => {
      editingNoteId = null;
      if (noteInput) noteInput.value = "";
      renderNotes();
    });
  });
}

if (newNoteBtn) {
  newNoteBtn.addEventListener("click", () => {
    editingNoteId = null;
    if (noteInput) noteInput.value = "";
  });
}

// ---------- Chat ----------
function renderChat() {
  if (!chatWindow) return;
  chrome.storage.sync.get([CHAT_HISTORY_KEY], res => {
    const history = res[CHAT_HISTORY_KEY] || [];
    chatWindow.innerHTML = "";
    if (!history.length) {
      chatWindow.innerHTML = `<div style="opacity:.6;">💬 Start chatting...</div>`;
      return;
    }
    history.forEach(msg => {
      const div = document.createElement("div");
      div.className = msg.role === "user" ? "chat-user" : "chat-ai";
      div.textContent = `${msg.role === "user" ? "🧑" : "🤖"}: ${msg.text}`;
      chatWindow.appendChild(div);
    });
    chatWindow.scrollTop = chatWindow.scrollHeight;
  });
}

function saveChat(role, text) {
  chrome.storage.sync.get([CHAT_HISTORY_KEY], res => {
    const updated = [...(res[CHAT_HISTORY_KEY] || []), { role, text }];
    chrome.storage.sync.set({ [CHAT_HISTORY_KEY]: updated }, renderChat);
  });
}

async function sendChat(question) {
  saveChat("user", question);

  const stored = await chrome.storage.sync.get([GEMINI_KEY]);
  const geminiApiKey = stored[GEMINI_KEY];
  if (!geminiApiKey) {
    saveChat("assistant", "⚠ API key missing. Set it in options.");
    return;
  }

  const text = await getPageText();
  const PAGE_TEXT_LIMIT = 60000;
  const trimmed = text.length > PAGE_TEXT_LIMIT ? text.slice(0, PAGE_TEXT_LIMIT) : text;

  const prompt = `
You are an assistant that answers questions using ONLY the webpage text below.

- You MUST base your answer on this text.
- You ARE allowed to INFER and expand on ideas as long as they are logically supported by the text.
- If the information is truly not present and cannot be inferred, reply exactly:
  "Not available in the page."

WEBPAGE TEXT:
"""
${trimmed}
"""

QUESTION: ${question}
`;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
    }
  );

  const data = await res.json();
  const answer = data?.candidates?.[0]?.content?.parts?.[0]?.text || "⚠ No answer.";

  lastAIAnswer = answer;
  saveChat("assistant", answer);
}

if (askBtn && chatInput) {
  askBtn.addEventListener("click", async () => {
    const q = chatInput.value.trim();
    if (!q) return;
    await ensureContentScript();
    sendChat(q);
    chatInput.value = "";
  });
}

if (clearChatBtn) {
  clearChatBtn.addEventListener("click", () => {
    chrome.storage.sync.set({ [CHAT_HISTORY_KEY]: [] }, renderChat);
  });
}

// TTS
if (ttsBtn) {
  ttsBtn.addEventListener("click", () => {
    if (!lastAIAnswer) {
      console.warn("No AI answer to speak.");
      return;
    }
    if (!("speechSynthesis" in window)) {
      alert("Text-to-speech is not supported.");
      return;
    }
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(lastAIAnswer);
    utterance.lang = "en-US";
    speechSynthesis.speak(utterance);
  });
}

// Mic (speech-to-text)
if (micBtn && chatInput) {
  micBtn.addEventListener("click", () => {
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Speech recognition is not supported in this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = event => {
      const transcript = event.results[0][0].transcript;
      console.log("Heard:", transcript);
      chatInput.value = transcript;
    };

    recognition.onerror = event => {
      console.error("Speech recognition error:", event.error);
    };

    recognition.start();
  });
}

// --- Save entire chat history as a single note ---
if (saveChatNoteBtn) {
  saveChatNoteBtn.addEventListener("click", () => {
    chrome.storage.sync.get([CHAT_HISTORY_KEY, NOTE_KEY], res => {
      const history = res[CHAT_HISTORY_KEY] || [];
      if (!history.length) {
        alert("No chat messages to save yet.");
        return;
      }

      // Format chat as text
      const chatText = history
        .map(m => `${m.role === "user" ? "🧑" : "🤖"}: ${m.text}`)
        .join("\n");

      const MAX_NOTE_LEN = 5000;
      const finalText =
        chatText.length > MAX_NOTE_LEN
          ? chatText.slice(0, MAX_NOTE_LEN) + "…"
          : chatText;

      const notes = res[NOTE_KEY] || [];
      notes.push({
        id: Date.now(),
        text: finalText,
        createdAt: Date.now()
      });

      chrome.storage.sync.set({ [NOTE_KEY]: notes }, () => {
        // refresh notes UI if your renderNotes() exists
        if (typeof renderNotes === "function") {
          renderNotes();
        }
      });
    });
  });
}


async function downloadCheatsheet() {
  if (!downloadCheatsheetBtn) return;

  // UI: loading state
  downloadCheatsheetBtn.disabled = true;
  const originalLabel = downloadCheatsheetBtn.textContent;
  downloadCheatsheetBtn.textContent = "Generating...";
  if (cheatsheetStatus) cheatsheetStatus.textContent = "";

  try {
    // 1) Get API key
    const { geminiApiKey } = await chrome.storage.sync.get([GEMINI_KEY]);
    if (!geminiApiKey) {
      if (cheatsheetStatus) cheatsheetStatus.textContent = "⚠ No API key set.";
      return;
    }

    // 2) Get full page/PDF text
    const fullText = await getPageText();
    const len = fullText?.length || 0;
    console.log("Cheatsheet text length:", len);

    if (!fullText || len < 50) {
      if (cheatsheetStatus) cheatsheetStatus.textContent =
        "❌ Could not extract enough text from this page.";
      return;
    }

    // 3) Limit to safe size for Gemini
    const PAGE_TEXT_LIMIT = 60000;
    const text = len > PAGE_TEXT_LIMIT ? fullText.slice(0, PAGE_TEXT_LIMIT) : fullText;

    // 4) Build cheatsheet prompt
    const prompt = `
Create a concise, exam-style study cheatsheet for the following content.

Include these sections:
1. Ultra-short overview (2–3 lines)
2. Key ideas (bullet points)
3. Important terms & simple definitions
4. Any formulas / important numbers / key data
5. 5 quick self-test questions

Use clear headings and bullet points. Keep it compact but very useful for revision.

CONTENT:
${text}
`;

    // 5) Call Gemini
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${geminiApiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.2 }
        })
      }
    );

    const data = await res.json();
    console.log("Cheatsheet API response:", data);

    const cheatsheet =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "No cheatsheet could be generated.";

    // 6) Download as .txt
    const blob = new Blob([cheatsheet], {
      type: "text/plain;charset=utf-8"
    });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "study_cheatsheet.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);

    if (cheatsheetStatus) cheatsheetStatus.textContent = "📥 Cheatsheet downloaded!";
  } catch (err) {
    console.error("Error generating cheatsheet:", err);
    if (cheatsheetStatus) cheatsheetStatus.textContent = "❌ Error generating cheatsheet.";
  } finally {
    downloadCheatsheetBtn.disabled = false;
    downloadCheatsheetBtn.textContent = originalLabel;
  }
}

if (downloadCheatsheetBtn) {
  downloadCheatsheetBtn.addEventListener("click", downloadCheatsheet);
}

if (openApiSettingsBtn) {
  openApiSettingsBtn.addEventListener("click", () => {
    if (chrome.runtime.openOptionsPage) {
      chrome.runtime.openOptionsPage();
    } else {
      // Fallback for older browsers
      window.open(chrome.runtime.getURL("options.html"));
    }
  });
}


// init
renderChat();
renderNotes();
updateSaveSummaryButtonState();
