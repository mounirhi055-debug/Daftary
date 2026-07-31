
const UI = (() => {
  function ensureToastWrap() {
    let wrap = document.querySelector(".toast-wrap");
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "toast-wrap";
      document.body.appendChild(wrap);
    }
    return wrap;
  }

  function toast(message, type = "") {
    const wrap = ensureToastWrap();
    const DURATION = 3200;
    const icons = { success: "✓", error: "✕", "": "ℹ" };
    const el = document.createElement("div");
    el.className = `toast ${type}`.trim();
    el.style.setProperty("--toast-duration", DURATION + "ms");
    el.innerHTML = `
      <span class="toast-ic">${icons[type] ?? "ℹ"}</span>
      <span class="toast-msg"></span>
      <button type="button" class="toast-close" aria-label="إغلاق">✕</button>
    `;
    el.querySelector(".toast-msg").textContent = message;
    wrap.appendChild(el);

    let dismissed = false;
    function dismiss() {
      if (dismissed) return;
      dismissed = true;
      el.classList.add("leaving");
      setTimeout(() => el.remove(), 250);
    }
    el.querySelector(".toast-close").addEventListener("click", dismiss);
    const timer = setTimeout(dismiss, DURATION);
    el.addEventListener("mouseenter", () => clearTimeout(timer));
  }

  function money(n) {
    const num = Number(n) || 0;
    return num.toLocaleString("ar-DZ", { minimumFractionDigits: 0, maximumFractionDigits: 2 }) + " د.ج";
  }

  function formatDate(iso) {
    const d = new Date(iso);
    return d.toLocaleDateString("ar-DZ", { year: "numeric", month: "short", day: "numeric" }) +
      " · " + d.toLocaleTimeString("ar-DZ", { hour: "2-digit", minute: "2-digit" });
  }

  function daysLeft(iso) {
    if (!iso) return null;
    const diff = new Date(iso) - new Date();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  function initials(name) {
    if (!name) return "؟";
    const parts = name.trim().split(/\s+/);
    return parts.length > 1 ? (parts[0][0] + parts[1][0]) : name.slice(0, 2);
  }

  function compressImage(file, { maxDim = 300, quality = 0.8 } = {}) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          let { width, height } = img;
          if (width > maxDim || height > maxDim) {
            if (width > height) { height = Math.round(height * (maxDim / width)); width = maxDim; }
            else { width = Math.round(width * (maxDim / height)); height = maxDim; }
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL("image/jpeg", quality));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function friendlyError(err, fallback = "حدث خطأ، الرجاء إعادة المحاولة") {
    const msg = err && err.message;
    if (msg && /[\u0600-\u06FF]/.test(msg)) return msg;
    return fallback;
  }

  function ensureOfflineBanner() {
    let bar = document.getElementById("offlineBanner");
    if (!bar) {
      bar = document.createElement("div");
      bar.id = "offlineBanner";
      bar.className = "offline-banner";
      bar.innerHTML = `⚠️ لا يوجد اتصال بالإنترنت — التطبيق يعمل محلياً وستتم مزامنة بياناتك تلقائياً عند عودة الاتصال`;
      document.body.appendChild(bar);
    }
    return bar;
  }
  function updateOfflineBanner() {
    const bar = ensureOfflineBanner();
    bar.classList.toggle("show", !navigator.onLine);
  }
  window.addEventListener("online", updateOfflineBanner);
  window.addEventListener("offline", updateOfflineBanner);
  document.addEventListener("DOMContentLoaded", updateOfflineBanner);

  function refreshBodyLock() {
    const anyOpen = document.querySelector(".modal-overlay.open");
    document.body.classList.toggle("modal-locked", !!anyOpen);
  }

  function confirmAction(message, opts = {}) {
    return new Promise((resolve) => {
      let overlay = document.getElementById("confirmOverlay");
      if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "confirmOverlay";
        overlay.className = "modal-overlay";
        overlay.innerHTML = `
          <div class="modal confirm-modal">
            <div class="modal-head">
              <h3 id="confirmTitle">تأكيد</h3>
            </div>
            <p class="confirm-message" id="confirmMessage"></p>
            <div class="modal-actions">
              <button class="btn btn-ghost" id="confirmCancelBtn"></button>
              <button class="btn btn-danger" id="confirmOkBtn"></button>
            </div>
          </div>`;
        document.body.appendChild(overlay);
      }
      overlay.querySelector("#confirmTitle").textContent = opts.title || "تأكيد الإجراء";
      overlay.querySelector("#confirmMessage").textContent = message;
      const okBtn = overlay.querySelector("#confirmOkBtn");
      const cancelBtn = overlay.querySelector("#confirmCancelBtn");
      okBtn.textContent = opts.okLabel || "تأكيد";
      cancelBtn.textContent = opts.cancelLabel || "إلغاء";
      okBtn.className = `btn ${opts.danger === false ? "btn-primary" : "btn-danger"}`;

      const cleanup = (result) => {
        overlay.classList.remove("open");
        okBtn.removeEventListener("click", onOk);
        cancelBtn.removeEventListener("click", onCancel);
        overlay.removeEventListener("click", onOverlay);
        document.removeEventListener("keydown", onKey);
        refreshBodyLock();
        resolve(result);
      };
      const onOk = () => cleanup(true);
      const onCancel = () => cleanup(false);
      const onOverlay = (e) => { if (e.target === overlay) cleanup(false); };
      const onKey = (e) => { if (e.key === "Escape") cleanup(false); };

      okBtn.addEventListener("click", onOk);
      cancelBtn.addEventListener("click", onCancel);
      overlay.addEventListener("click", onOverlay);
      document.addEventListener("keydown", onKey);

      document.querySelectorAll(".modal-overlay.open").forEach(m => { if (m !== overlay) m.classList.remove("open"); });
      overlay.classList.add("open");
      refreshBodyLock();
    });
  }

  function openModal(id) {
    const target = document.getElementById(id);
    if (!target) return;

    document.querySelectorAll(".modal-overlay.open").forEach(m => { if (m !== target) m.classList.remove("open"); });
    target.classList.add("open");
    refreshBodyLock();
  }
  function closeModal(id) {
    document.getElementById(id)?.classList.remove("open");
    refreshBodyLock();
  }

  function statusLabel(status) {
    switch (status) {
      case "pending": return { text: "بانتظار الموافقة", cls: "badge-gold" };
      case "active": return { text: "مفعّل", cls: "badge-green" };
      case "expired": return { text: "منتهي الصلاحية", cls: "badge-red" };
      case "rejected": return { text: "مرفوض", cls: "badge-gray" };
      default: return { text: status, cls: "badge-gray" };
    }
  }

  function enhanceSelect(select) {
    if (typeof select === "string") select = document.getElementById(select);
    if (!select || select.dataset.csEnhanced) return;
    select.dataset.csEnhanced = "1";

    const wrap = document.createElement("div");
    wrap.className = "custom-select";
    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);
    select.classList.add("custom-select-native");
    select.setAttribute("tabindex", "-1");
    select.setAttribute("aria-hidden", "true");

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "custom-select-trigger";
    trigger.innerHTML = `<span class="cs-label"></span><svg class="cs-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>`;
    wrap.appendChild(trigger);

    const panel = document.createElement("div");
    panel.className = "custom-select-panel";
    panel.setAttribute("role", "listbox");
    wrap.appendChild(panel);

    const label = trigger.querySelector(".cs-label");

    function syncLabel() {
      const opt = select.options[select.selectedIndex];
      label.textContent = opt ? opt.textContent : "";
      wrap.classList.toggle("has-value", !!(opt && opt.value));
    }

    function buildPanel() {
      panel.innerHTML = "";
      Array.from(select.options).forEach((opt, i) => {
        const item = document.createElement("div");
        item.className = "custom-select-option" + (i === select.selectedIndex ? " selected" : "");
        item.setAttribute("role", "option");
        item.innerHTML = `<span>${opt.textContent}</span>`;
        item.addEventListener("click", () => {
          select.value = opt.value;
          select.dispatchEvent(new Event("change", { bubbles: true }));
          syncLabel();
          closePanel();
        });
        panel.appendChild(item);
      });
    }

    function onDocClick(e) {
      if (!wrap.contains(e.target)) closePanel();
    }
    function onEsc(e) {
      if (e.key === "Escape") closePanel();
    }
    function openPanel() {
      if (select.disabled) return;
      buildPanel();
      wrap.classList.add("open");
      document.addEventListener("click", onDocClick);
      document.addEventListener("keydown", onEsc);
    }
    function closePanel() {
      wrap.classList.remove("open");
      document.removeEventListener("click", onDocClick);
      document.removeEventListener("keydown", onEsc);
    }

    trigger.addEventListener("click", () => {
      wrap.classList.contains("open") ? closePanel() : openPanel();
    });

    new MutationObserver(syncLabel).observe(select, { childList: true, subtree: true });
    select.addEventListener("change", syncLabel);

    syncLabel();
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
  }

  document.addEventListener("click", (e) => {
    if (e.target.classList.contains("modal-overlay")) {
      e.target.classList.remove("open");
      refreshBodyLock();
    }
    const closeBtn = e.target.closest("[data-close-modal]");
    if (closeBtn) {
      closeBtn.closest(".modal-overlay")?.classList.remove("open");
      refreshBodyLock();
    }
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      document.querySelectorAll(".modal-overlay.open").forEach(m => m.classList.remove("open"));
      refreshBodyLock();
    }
  });

  return { toast, money, formatDate, daysLeft, initials, confirmAction, compressImage, openModal, closeModal, statusLabel, escapeHtml, friendlyError, enhanceSelect };
})();
