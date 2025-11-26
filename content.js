// console.log("content.js injected");

// function getArticleText() {
//   // Prefer <article>
//   const article = document.querySelector("article");
//   if (article && article.innerText.trim().length > 0) {
//     return article.innerText.trim();
//   }

//   // Fallback: all <p>
//   const paragraphs = Array.from(document.querySelectorAll("p"));
//   const pText = paragraphs
//     .map(p => p.innerText.trim())
//     .filter(Boolean)
//     .join("\n\n");

//   if (pText.length > 0) return pText;

//   // Last resort: whole visible text
//   if (document.body && document.body.innerText) {
//     return document.body.innerText.replace(/\s+/g, " ").trim();
//   }
//   return "";
// }

// // Existing listener
// chrome.runtime.onMessage.addListener((req, _sender, sendResponse) => {
//   if (req && req.type === "GET_ARTICLE_TEXT") {
//     try {
//       const text = getArticleText();
//       sendResponse({ text });
//     } catch (e) {
//       console.error("Error extracting article text:", e);
//       sendResponse({ text: "" });
//     }
//   }
// });


// let lastContextMenuPos = { x: 0, y: 0 };

// document.addEventListener("contextmenu", (e) => {
//   lastContextMenuPos = { x: e.clientX, y: e.clientY };
// });


// chrome.runtime.onMessage.addListener((req, _sender, _sendResponse) => {
//   if (req && req.type === "SHOW_INLINE_SUMMARY") {
//     showInlineBubble(req.text || "No response.");
//   }
// });


// function showInlineBubble(text) {
//   // remove old bubble if any
//   const existing = document.getElementById("ai-inline-bubble");
//   if (existing) existing.remove();

//   const bubble = document.createElement("div");
//   bubble.id = "ai-inline-bubble";
//   bubble.innerText = text || "No content.";

//   Object.assign(bubble.style, {
//     position: "fixed",
//     top: lastContextMenuPos.y + 10 + "px",
//     left: lastContextMenuPos.x + 10 + "px",
//     maxWidth: "320px",
//     padding: "10px 12px",
//     background: "rgba(24,24,27,0.96)",
//     color: "#f9fafb",
//     borderRadius: "10px",
//     fontSize: "13px",
//     lineHeight: "1.4",
//     zIndex: "999999",
//     boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
//     backdropFilter: "blur(10px)",
//     border: "1px solid rgba(148,163,184,0.7)",
//     cursor: "pointer",
//     whiteSpace: "pre-wrap"
//   });

//   // click bubble to close
//   bubble.addEventListener("click", () => bubble.remove());

//   document.body.appendChild(bubble);
// }




// content.js
console.log("[AI for Webpage] content.js injected");

let lastContextMenuPos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };

// Track where the user opened the context menu
document.addEventListener("contextmenu", (e) => {
  lastContextMenuPos = { x: e.clientX, y: e.clientY };
  // Debug
  console.log("[AI for Webpage] contextmenu at", lastContextMenuPos);
});

// ---------- Article text extraction (used by popup summarizer) ----------
function getArticleText() {
  // Prefer <article>
  const article = document.querySelector("article");
  if (article && article.innerText.trim().length > 0) {
    return article.innerText.trim();
  }

  // Fallback: all <p>
  const paragraphs = Array.from(document.querySelectorAll("p"));
  const pText = paragraphs
    .map((p) => p.innerText.trim())
    .filter(Boolean)
    .join("\n\n");

  if (pText.length > 0) return pText;

  // Last resort: whole visible text
  if (document.body && document.body.innerText) {
    return document.body.innerText.replace(/\s+/g, " ").trim();
  }
  return "";
}

// Helper: Format text with clickable links
function formatTextWithLinks(text) {
  // Convert URLs to clickable links
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  return text.replace(urlRegex, '<a href="$1" target="_blank" style="color: #ec4899; text-decoration: underline;">$1</a>');
}

// ---------- Floating inline bubble ----------
function showInlineBubble(text) {
  console.log("[AI for Webpage] showInlineBubble called");

  // Remove old bubble if exists
  const existing = document.getElementById("ai-inline-bubble");
  if (existing) existing.remove();

  // Create outer container
  const bubble = document.createElement("div");
  bubble.id = "ai-inline-bubble";

  // Create close button
  const closeBtn = document.createElement("button");
  closeBtn.innerText = "✖";
  closeBtn.style.cssText = `
    border: none;
    background: transparent;
    font-size: 14px;
    cursor: pointer;
    position: absolute;
    top: 6px;
    right: 8px;
    color: #d22f76;
    opacity: .75;
  `;
  closeBtn.onclick = () => bubble.remove();

  // Create text block - support HTML for clickable links
  const textBox = document.createElement("div");
  textBox.innerHTML = formatTextWithLinks(text || "No content.");
  textBox.style.cssText = `
    font-size: 14px;
    line-height: 1.45;
    color: #4a003c;
    padding-right: 25px;
    white-space: pre-wrap;
  `;

  bubble.appendChild(closeBtn);
  bubble.appendChild(textBox);

  // Apply bubble styling
  Object.assign(bubble.style, {
    position: "fixed",
    top: lastContextMenuPos.y + 10 + "px",
    left: lastContextMenuPos.x + 10 + "px",
    maxWidth: "400px",
    maxHeight: "400px",
    overflowY: "auto",

    // 🌸 Pink UI theme
    background: "rgba(255, 240, 245, 0.96)",
    border: "1px solid rgba(255, 105, 180, 0.4)",
    borderRadius: "14px",
    padding: "12px 14px",
    backdropFilter: "blur(10px)",

    // Shadow
    boxShadow: "0px 10px 30px rgba(0, 0, 0, 0.2)",

    zIndex: "99999999",
    transition: "opacity .2s ease, transform .2s ease",

    // animation start
    opacity: "0",
    transform: "scale(0.95)"
  });

  // Append to page
  document.body.appendChild(bubble);

  // animation end
  requestAnimationFrame(() => {
    bubble.style.opacity = "1";
    bubble.style.transform = "scale(1)";
  });

   const btnRow = document.createElement("div");
  btnRow.style.cssText = `
    display:flex;
    gap:8px;
    margin-top:10px;
  `;

  // Save Button
  const saveBtn = document.createElement("button");
  saveBtn.textContent = "📌 Save to Notes";
  saveBtn.style.cssText = `
    background:#ffd1e8;
    border:none;
    padding:6px 10px;
    border-radius:8px;
    cursor:pointer;
    font-size:12px;
    font-weight:600;
  `;

  saveBtn.onclick = () => {
    chrome.storage.sync.get(["quickNotes"], (res) => {
      const notes = res.quickNotes || [];
      notes.push({ id: Date.now(), text, createdAt: Date.now() });
      chrome.storage.sync.set({ quickNotes: notes });
      saveBtn.textContent = "✔ Saved!";
      setTimeout(() => bubble.remove(), 1200);
    });
  };

  btnRow.appendChild(saveBtn);
  bubble.appendChild(btnRow);

  document.body.appendChild(bubble);
}


// ---------- Language Selection Bubble ----------
function showLanguageSelectionBubble(selectedText) {
  console.log("[AI for Webpage] showLanguageSelectionBubble called");

  // Remove old bubble if exists
  const existing = document.getElementById("ai-inline-bubble");
  if (existing) existing.remove();

  // Create outer container
  const bubble = document.createElement("div");
  bubble.id = "ai-inline-bubble";

  // Create close button
  const closeBtn = document.createElement("button");
  closeBtn.innerText = "✖";
  closeBtn.style.cssText = `
    border: none;
    background: transparent;
    font-size: 14px;
    cursor: pointer;
    position: absolute;
    top: 6px;
    right: 8px;
    color: #d22f76;
    opacity: .75;
  `;
  closeBtn.onclick = () => bubble.remove();

  // Create title
  const title = document.createElement("div");
  title.textContent = "🌐 Select Target Language:";
  title.style.cssText = `
    font-size: 14px;
    font-weight: 600;
    color: #4a003c;
    margin-bottom: 10px;
  `;

  // Create language select
  const langSelect = document.createElement("select");
  langSelect.style.cssText = `
    width: 100%;
    padding: 8px;
    border-radius: 8px;
    border: 1px solid rgba(255, 105, 180, 0.4);
    background: #ffffff;
    font-size: 13px;
    margin-bottom: 10px;
    cursor: pointer;
  `;

  const languages = [
    { code: "en", name: "English" },
    { code: "es", name: "Spanish" },
    { code: "fr", name: "French" },
    { code: "de", name: "German" },
    { code: "it", name: "Italian" },
    { code: "pt", name: "Portuguese" },
    { code: "ru", name: "Russian" },
    { code: "ja", name: "Japanese" },
    { code: "zh", name: "Chinese" },
    { code: "ar", name: "Arabic" },
    { code: "hi", name: "Hindi" }
  ];

  languages.forEach(lang => {
    const option = document.createElement("option");
    option.value = lang.code;
    option.textContent = lang.name;
    langSelect.appendChild(option);
  });

  // Create translate button
  const translateBtn = document.createElement("button");
  translateBtn.textContent = "Translate";
  translateBtn.style.cssText = `
    width: 100%;
    background: linear-gradient(135deg, #ec4899, #db2777);
    color: white;
    border: none;
    padding: 8px 12px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
  `;

  translateBtn.onclick = () => {
    const targetLang = langSelect.value;
    const langName = languages.find(l => l.code === targetLang)?.name || targetLang;
    
    // Send translation request to background
    chrome.runtime.sendMessage({
      type: "TRANSLATE_WITH_LANGUAGE",
      text: selectedText,
      targetLang: targetLang,
      langName: langName
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error("[AI for Webpage] Error sending translation request:", chrome.runtime.lastError);
        showInlineBubble("⚠ Translation failed. Please try again.");
      }
    });
    
    bubble.remove();
  };

  // Create container for content
  const contentDiv = document.createElement("div");
  contentDiv.appendChild(title);
  contentDiv.appendChild(langSelect);
  contentDiv.appendChild(translateBtn);

  bubble.appendChild(closeBtn);
  bubble.appendChild(contentDiv);

  // Apply bubble styling
  Object.assign(bubble.style, {
    position: "fixed",
    top: lastContextMenuPos.y + 10 + "px",
    left: lastContextMenuPos.x + 10 + "px",
    width: "280px",
    maxHeight: "400px",
    overflowY: "auto",

    // 🌸 Pink UI theme
    background: "rgba(255, 240, 245, 0.96)",
    border: "1px solid rgba(255, 105, 180, 0.4)",
    borderRadius: "14px",
    padding: "12px 14px",
    backdropFilter: "blur(10px)",

    // Shadow
    boxShadow: "0px 10px 30px rgba(0, 0, 0, 0.2)",

    zIndex: "99999999",
    transition: "opacity .2s ease, transform .2s ease",

    // animation start
    opacity: "0",
    transform: "scale(0.95)"
  });

  // Append to page
  document.body.appendChild(bubble);

  // animation end
  requestAnimationFrame(() => {
    bubble.style.opacity = "1";
    bubble.style.transform = "scale(1)";
  });
}

// ---------- Message handler ----------
chrome.runtime.onMessage.addListener((req, _sender, sendResponse) => {
  if (!req || !req.type) return;

  if (req.type === "GET_ARTICLE_TEXT") {
    try {
      const text = getArticleText();
      sendResponse({ text });
    } catch (e) {
      console.error("[AI for Webpage] error extracting article text:", e);
      sendResponse({ text: "" });
    }
  }

  if (req.type === "SHOW_INLINE_SUMMARY") {
    console.log("[AI for Webpage] received SHOW_INLINE_SUMMARY");
    showInlineBubble(req.text || "No response.");
  }

  if (req.type === "SHOW_LANGUAGE_SELECTION") {
    console.log("[AI for Webpage] received SHOW_LANGUAGE_SELECTION");
    showLanguageSelectionBubble(req.text || "");
  }
});





