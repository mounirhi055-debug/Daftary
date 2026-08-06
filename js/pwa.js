
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").then((reg) => {
      // اسأل عن وجود نسخة جديدة من sw.js كل مرة يفتح فيها المستخدم
      // التطبيق أو يرجع له بعد أن كان في الخلفية — بدون أي تدخل يدوي.
      reg.update().catch(() => {});
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") reg.update().catch(() => {});
      });
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000); // كل ساعة
    }).catch(() => {});
  });

  // When a new service worker takes over (new deploy), reload the page
  // once so the user is always on the latest version automatically.
  let swReloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (swReloaded) return;
    swReloaded = true;
    window.location.reload();
  });

  // Fallback signal from sw.js's activate step, in case controllerchange
  // doesn't fire (e.g. first install with skipWaiting already applied).
  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "SW_UPDATED" && !swReloaded) {
      swReloaded = true;
      window.location.reload();
    }
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
    if (typeof window.setSidebarOpen === "function") {
      window.setSidebarOpen(false);
    } else {
      sidebar.classList.remove("open");
      document.getElementById("sidebarOverlay")?.classList.remove("open");
      document.body.classList.remove("sidebar-locked");
      const mainArea = document.getElementById("mainArea");
      mainArea?.removeAttribute("inert");
      mainArea?.classList.remove("bg-locked");
    }
    return;
  }
});
