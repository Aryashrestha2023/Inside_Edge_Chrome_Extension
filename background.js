// // background.js

// // When extension is installed/updated
// chrome.runtime.onInstalled.addListener(() => {
//   // If you still want to open options when no API key, keep this:
//   chrome.storage.sync.get(["geminiApiKey"], (result) => {
//     if (!result.geminiApiKey) {
//       chrome.tabs.create({ url: "options.html" });
//     }
//   });

//   // Create context menu items for highlighted text
//   chrome.contextMenus.create({
//     id: "summarizeSelection",
//     title: "✨ Summarize selected text",
//     contexts: ["selection"]
//   });

//   chrome.contextMenus.create({
//     id: "askSelection",
//     title: "💬 Ask AI about selection",
//     contexts: ["selection"]
//   });
// });


// async function callGemini(prompt, apiKey) {
//   const res = await fetch(
//     `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
//     {
//       method: "POST",
//       headers: { "Content-Type": "application/json" },
//       body: JSON.stringify({
//         contents: [{ parts: [{ text: prompt }] }],
//         generationConfig: { temperature: 0.2 }
//       })
//     }
//   );
//   const data = await res.json();
//   return data?.candidates?.[0]?.content?.parts?.[0]?.text || "⚠ No response.";
// }

// chrome.contextMenus.onClicked.addListener(async (info, tab) => {
//   if (!info.selectionText || !tab?.id) return;

//   const sel = info.selectionText.trim();
//   const { geminiApiKey } = await chrome.storage.sync.get([GEMINI_KEY]);
//   if (!geminiApiKey) return;

//   let prompt;

//   if (info.menuItemId === "summarizeSelection") {
//     prompt = `Summarize this selected text clearly:\n\n${sel}`;
//   } else if (info.menuItemId === "askSelection") {
//     prompt = `
// You are an assistant that answers ONLY using this selected text:

// """
// ${sel}
// """

// Give a clear answer:
// `;
//   } else {
//     return;
//   }

//   try {
//     const answer = await callGemini(prompt, geminiApiKey);

//     // 🔥 Send to content script → shows inline bubble
//     chrome.tabs.sendMessage(tab.id, {
//       type: "SHOW_INLINE_SUMMARY",
//       text: answer
//     });
//   } catch (e) {
//     console.error("Gemini context menu error:", e);
//   }
// });


// background.js

const GEMINI_KEY = "geminiApiKey";

console.log("[AI for Webpage] background service worker loaded");

// Create context menus
chrome.runtime.onInstalled.addListener(() => {
  console.log("[AI for Webpage] onInstalled: creating context menus");

  chrome.storage.sync.get([GEMINI_KEY], (res) => {
    if (!res[GEMINI_KEY]) {
      console.log("[AI for Webpage] No API key, opening options.html");
      chrome.tabs.create({ url: "options.html" });
    }
  });

  chrome.contextMenus.create({
    id: "summarizeSelection",
    title: "✨ Summarize selected text",
    contexts: ["selection"]
  });

//   chrome.contextMenus.create({
//     id: "askSelection",
//     title: "💬 Ask AI about selection",
//     contexts: ["selection"]
//   });

  chrome.contextMenus.create({
    id: "save_selected_note",
    title: "📌 Save selected text to Notes",
    contexts: ["selection"]
  });

  chrome.contextMenus.create({
    id: "defineSelection",
    title: "📖 Define selected word",
    contexts: ["selection"]
  });

  chrome.contextMenus.create({
    id: "translateSelection",
    title: "🌐 Translate selected text",
    contexts: ["selection"]
  });

});

// Helper: call Gemini
async function callGemini(prompt, apiKey) {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/` +
    `gemini-2.0-flash:generateContent?key=${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature: 0.2 }
    })
  });

  const data = await res.json();
  if (!res.ok) {
    const msg = data?.error?.message || `HTTP ${res.status}`;
    console.error("[AI for Webpage] Gemini error:", msg);
    throw new Error(msg);
  }

  return (
    data?.candidates?.[0]?.content?.parts?.[0]?.text ||
    "⚠ No response from Gemini."
  );
}

// Helper: Translate using MyMemory Translation API (Free API - 10,000 words/day)
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

// Helper: Detect language using simple heuristics + MyMemory
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

// Ensure content.js is present in the tab
async function ensureContentScript(tabId) {
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"]
    });
    console.log("[AI for Webpage] content.js injected via scripting into tab", tabId);
  } catch (e) {
    // This will fail on some restricted pages; we log and continue
    console.warn("[AI for Webpage] scripting injection warning:", e?.message || e);
  }
}

// Handle translation with selected language
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "TRANSLATE_WITH_LANGUAGE") {
    (async () => {
      try {
        const { text, targetLang, langName } = request;
        
        // Detect source language
        const detectedLang = await detectLanguage(text);
        console.log("[AI for Webpage] Detected language:", detectedLang, "Target:", targetLang);

        // Translate
        const translated = await translateText(text, targetLang, detectedLang);
        console.log("[AI for Webpage] Translation completed");

        // Show translation in bubble
        if (sender.tab?.id) {
          chrome.tabs.sendMessage(
            sender.tab.id,
            { 
              type: "SHOW_INLINE_SUMMARY", 
              text: `Translation (${langName}):\n\n${translated}` 
            },
            () => {
              if (chrome.runtime.lastError) {
                console.warn(
                  "[AI for Webpage] sendMessage error (showTranslation):",
                  chrome.runtime.lastError.message
                );
              }
            }
          );
        }
      } catch (e) {
        console.error("[AI for Webpage] Error in translateWithLanguage:", e);
        // Try to show error in bubble
        if (sender.tab?.id) {
          try {
            chrome.tabs.sendMessage(
              sender.tab.id,
              { 
                type: "SHOW_INLINE_SUMMARY", 
                text: `⚠ Translation failed: ${e.message}` 
              }
            );
          } catch (err) {
            console.error("[AI for Webpage] Could not show error:", err);
          }
        }
      }
    })();
    return true; // Keep message channel open for async response
  }
});

// Handle context menu clicks
chrome.contextMenus.onClicked.addListener((info, tab) => {


  if (!info.selectionText || !tab || !tab.id) {
    console.warn("[AI for Webpage] No selection or tab in contextMenus.onClicked");
    return;
  }

  const selected = info.selectionText.trim();
  console.log("[AI for Webpage] context menu clicked:", info.menuItemId, "selection:", selected.slice(0, 80));

  if (info.menuItemId === "defineSelection") {
    chrome.storage.sync.get([GEMINI_KEY], async (res) => {
      const apiKey = res[GEMINI_KEY];
      if (!apiKey) {
        console.warn("[AI for Webpage] No Gemini API key set for defineSelection");
        return;
      }

      // Short, dictionary-style prompt
      const prompt = `
Act as an English dictionary.

For the following word or short phrase:

"${selected}"

Return a concise entry with:
- Part of speech
- 1–2 simple, clear definitions
- 1 short example sentence

Format nicely with bullet points. 
If it's not a real word or has no clear meaning, reply:
"I couldn't find a reliable meaning for this."
`;

      try {
        // ensure content.js exists in this tab
        await ensureContentScript(tab.id);

        const answer = await callGemini(prompt, apiKey);
        console.log("[AI for Webpage] Definition answer length:", answer.length);

        // Show in the inline bubble
        chrome.tabs.sendMessage(
          tab.id,
          { type: "SHOW_INLINE_SUMMARY", text: answer },
          () => {
            if (chrome.runtime.lastError) {
              console.warn(
                "[AI for Webpage] sendMessage error (defineSelection):",
                chrome.runtime.lastError.message
              );
            }
          }
        );
      } catch (e) {
        console.error("[AI for Webpage] Error in defineSelection:", e);
      }
    });

    // important: return here so other branches don't also run
    return;
  }

  if (info.menuItemId === "translateSelection") {
    (async () => {
      try {
        // ensure content.js exists in this tab
        await ensureContentScript(tab.id);

        // Show language selection bubble first
        chrome.tabs.sendMessage(
          tab.id,
          { 
            type: "SHOW_LANGUAGE_SELECTION", 
            text: selected 
          },
          () => {
            if (chrome.runtime.lastError) {
              console.warn(
                "[AI for Webpage] sendMessage error (showLanguageSelection):",
                chrome.runtime.lastError.message
              );
            }
          }
        );
      } catch (e) {
        console.error("[AI for Webpage] Error showing language selection:", e);
      }
    })();

    return;
  }

    // ------ ADD TO NOTES -------
  if (info.menuItemId === "save_selected_note") {
    const selected = info.selectionText.trim();
    if (!selected) return;

    chrome.storage.sync.get(["quickNotes"], (res) => {
      const notes = res.quickNotes || [];
      notes.push({ id: Date.now(), text: selected, createdAt: Date.now() });

      chrome.storage.sync.set({ quickNotes: notes }, () => {
        chrome.tabs.sendMessage(tab.id, { type: "SHOW_INLINE", text: "📌 Saved to Notes!" });
      });
    });

    return;
  }

  chrome.storage.sync.get([GEMINI_KEY], async (res) => {
    const apiKey = res[GEMINI_KEY];
    if (!apiKey) {
      console.warn("[AI for Webpage] No Gemini API key set");
      return;
    }

    let prompt;
    if (info.menuItemId === "summarizeSelection") {
      prompt = `Summarize this selected text clearly and concisely:\n\n${selected}`;
    } else if (info.menuItemId === "askSelection") {
      prompt = `
You are an assistant that must answer ONLY using the following selected text:

"""
${selected}
"""

Give a clear, helpful explanation or answer:
`;
    } else {
      return;
    }

    try {
      // Make sure content.js exists in the tab
      await ensureContentScript(tab.id);

      const answer = await callGemini(prompt, apiKey);
      console.log("[AI for Webpage] Gemini answer length:", answer.length);

      // Send to content script to display bubble
      chrome.tabs.sendMessage(
        tab.id,
        { type: "SHOW_INLINE_SUMMARY", text: answer },
        () => {
          if (chrome.runtime.lastError) {
            console.warn(
              "[AI for Webpage] sendMessage error:",
              chrome.runtime.lastError.message
            );
          } else {
            console.log("[AI for Webpage] SHOW_INLINE_SUMMARY sent to tab", tab.id);
          }
        }
      );
    } catch (e) {
      console.error("[AI for Webpage] Error handling context menu:", e);
    }
  });
});






// // background.js – minimal, safe

// // chrome.runtime.onInstalled.addListener(() => {
// //   console.log("AI for Webpage extension installed.");
// //   // Optional: You can open options manually from extension icon,
// //   // so we don't force-open a tab here.
// // });

