// -------------------------------------------------------------
// Image Upload Module
// -------------------------------------------------------------
import { uploadImage } from "./api.js";

function insertAtCursor(textarea, text) {
  const start = textarea.selectionStart || 0;
  const end = textarea.selectionEnd || 0;
  const val = textarea.value;
  textarea.value = val.substring(0, start) + text + val.substring(end);
  textarea.selectionStart = textarea.selectionEnd = start + text.length;
  textarea.focus();
}

export function setupImageUpload({ contentTextarea, uploadBtn, fileInput, statusEl }) {
  async function handleFile(file) {
    if (!file) return;
    if (statusEl) {
      statusEl.textContent = "Uploading image...";
      statusEl.classList.remove("hidden");
    }

    try {
      const data = await uploadImage(file);
      const markdown = `\n![${data.original_name || "Image"}](${data.url})\n`;
      insertAtCursor(contentTextarea, markdown);

      if (statusEl) {
        statusEl.textContent = "Image uploaded successfully!";
        setTimeout(() => statusEl.classList.add("hidden"), 3000);
      }
    } catch (err) {
      if (statusEl) {
        statusEl.textContent = `Upload error: ${err.message}`;
      } else {
        alert(`Upload error: ${err.message}`);
      }
    } finally {
      if (fileInput) fileInput.value = "";
    }
  }

  if (uploadBtn && fileInput) {
    uploadBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) {
        handleFile(e.target.files[0]);
      }
    });
  }

  if (contentTextarea) {
    contentTextarea.addEventListener("paste", (e) => {
      const items = (e.clipboardData || (e.originalEvent && e.originalEvent.clipboardData))?.items;
      if (!items) return;
      for (const item of items) {
        if (item.type.indexOf("image") === 0) {
          const file = item.getAsFile();
          if (file) {
            e.preventDefault();
            handleFile(file);
            break;
          }
        }
      }
    });

    contentTextarea.addEventListener("dragover", (e) => {
      e.preventDefault();
    });

    contentTextarea.addEventListener("drop", (e) => {
      if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
        const file = e.dataTransfer.files[0];
        if (file.type.startsWith("image/")) {
          e.preventDefault();
          handleFile(file);
        }
      }
    });
  }
}
