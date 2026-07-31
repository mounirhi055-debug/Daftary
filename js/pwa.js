
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  });
}

if (navigator.storage && navigator.storage.persist) {
  navigator.storage.persist().catch(() => {});
}

let deferredInstallPrompt = null;

window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  document.querySelectorAll(".js-install-btn").forEach(btn => btn.style.display = "inline-flex");
});

document.addEventListener("click", async (e) => {
  const btn = e.target.closest(".js-install-btn");
  if (!btn) return;
  if (!deferredInstallPrompt) {
    UI?.toast?.("لتثبيت التطبيق: افتح قائمة المتصفح واختر «إضافة إلى الشاشة الرئيسية»", "");
    return;
  }
  deferredInstallPrompt.prompt();
  await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  document.querySelectorAll(".js-install-btn").forEach(b => b.style.display = "none");
});

window.addEventListener("appinstalled", () => {
  document.querySelectorAll(".js-install-btn").forEach(btn => btn.style.display = "none");
});

// ملاحظة: تمت إزالة "حارس الخروج" المخصّص (exit guard) الذي كان يعترض
// كل تنقّل للخلف (popstate) ويسأل "هل تريد الخروج من التطبيق؟" — كان
// يظهر بشكل خاطئ عند أي تنقّل عادي داخل الموقع (مثل الروابط الداخلية،
// إغلاق نافذة منبثقة، إلخ). المتصفح لا يحتاج لهذا السلوك في موقع ويب
// عادي، وإزالته تحل مشكلة ظهور رسالة التأكيد بشكل غير متوقع.
window.addEventListener("popstate", () => {
  const openModal = document.querySelector(".modal-overlay.open");
  const sidebar = document.getElementById("sidebar");
  if (openModal) {
    openModal.classList.remove("open");
    return;
  }
  if (sidebar && sidebar.classList.contains("open")) {
    sidebar.classList.remove("open");
    document.getElementById("sidebarOverlay")?.classList.remove("open");
    return;
  }
});
