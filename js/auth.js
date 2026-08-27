
let pendingUnsub = null;

function initHeaderAuthState() {
  const loggedOut = document.getElementById("authLoggedOut");
  const loggedIn = document.getElementById("authLoggedIn");
  if (!loggedOut || !loggedIn) return;

  const dashBtn = document.getElementById("goToDashboardBtn");
  const logoutBtn = document.getElementById("headerLogoutBtn");

  auth.onAuthStateChanged(async (user) => {
    if (!user) {
      loggedOut.style.display = "flex";
      loggedIn.style.display = "none";
      return;
    }
    loggedOut.style.display = "none";
    loggedIn.style.display = "flex";
    if (dashBtn) dashBtn.style.display = "";
    try {
      const isAdmin = await DB.Session.isAdmin(user.uid);
      if (isAdmin) {
        if (dashBtn) { dashBtn.href = "admin.html"; dashBtn.textContent = "لوحة الإدارة"; }
        return;
      }
      const session = await DB.Session.resolveSession(user.uid);
      if (session && session.shop.status === "active") {
        if (dashBtn) { dashBtn.href = "dashboard.html"; dashBtn.textContent = "لوحة التحكم"; }
      } else if (dashBtn) {
        dashBtn.style.display = "none";
      }
    } catch (err) {
      if (dashBtn) dashBtn.style.display = "none";
    }
  });

  logoutBtn?.addEventListener("click", async () => {
    logoutBtn.disabled = true;
    try {
      await DB.Session.signOut();
      UI.toast("تم تسجيل الخروج", "success");
    } finally {
      location.href = "index.html";
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {

  initHeaderAuthState();

  if (document.getElementById("pendingCard")) {
    auth.onAuthStateChanged(async (user) => {
      if (!user) return;
      try {
        const isAdmin = await DB.Session.isAdmin(user.uid);
        if (isAdmin) { location.href = "admin.html"; return; }
        const session = await DB.Session.resolveSession(user.uid);
        if (!session) return;
        if (session.role === "owner" && session.shop.status === "pending") { showPendingScreen(user.uid); return; }
        if (session.shop.status === "active") location.href = "dashboard.html";
      } catch (err) {
        // تعذّر تحديد دور المستخدم — غالباً بسبب انقطاع الاتصال بدون نسخة
        // محفوظة محلياً لهذا الحساب على هذا الجهاز بعد. بدل ما يبقى عالقاً
        // بصمت بصفحة الدخول (وهذا بالضبط سبب عدم "الدخول التلقائي" أوفلاين)،
        // ننتقل مباشرة للوحة التحكم، وهي نفسها مصمَّمة للتعامل مع انقطاع
        // الاتصال بأمان (بدون تسجيل خروج) وتعيد المحاولة تلقائياً عند عودة النت.
        if (!navigator.onLine || err.code === "unavailable") {
          location.href = "dashboard.html";
        }
      }
    });
  }

  const loginForm = document.getElementById("loginForm");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("loginEmail").value.trim();
      const password = document.getElementById("loginPassword").value;
      const alertBox = document.getElementById("loginAlert");
      const submitBtn = document.getElementById("loginSubmitBtn");
      alertBox.innerHTML = "";
      submitBtn.disabled = true;
      try {
        const session = await DB.Session.loginAny(email, password);
        if (session.role === "admin") {
          UI.toast("تم الدخول كإدارة، جاري التحويل...", "success");
          setTimeout(() => location.href = "admin.html", 400);
        } else {
          UI.toast("مرحباً بك، جاري تحويلك إلى لوحة التحكم...", "success");
          setTimeout(() => location.href = "dashboard.html", 400);
        }
      } catch (err) {
        if (err.message.includes("بانتظار موافقة")) {
          showPendingScreen(auth.currentUser.uid);
        } else {
          alertBox.innerHTML = `<div class="alert alert-error">⚠️ ${UI.escapeHtml(UI.friendlyError(err, "تعذّر تسجيل الدخول"))}</div>`;
          submitBtn.disabled = false;
        }
      }
    });
  }

  const registerForm = document.getElementById("registerForm");
  if (registerForm) {
    registerForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const alertBox = document.getElementById("registerAlert");
      alertBox.innerHTML = "";

      const shopName = document.getElementById("shopName").value.trim();
      const ownerName = document.getElementById("ownerName").value.trim();
      const phone = document.getElementById("phone").value.trim();
      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value;
      const password2 = document.getElementById("password2").value;
      const submitBtn = registerForm.querySelector("button[type=submit]");

      if (!shopName || !ownerName || !phone || !email) {
        alertBox.innerHTML = `<div class="alert alert-error">⚠️ يرجى تعبئة جميع الحقول المطلوبة</div>`;
        return;
      }
      if (!document.getElementById("agreeTerms").checked) {
        alertBox.innerHTML = `<div class="alert alert-error">⚠️ يجب الموافقة على شروط الاستخدام وسياسة الخصوصية للاستمرار</div>`;
        return;
      }
      if (password !== password2) {
        alertBox.innerHTML = `<div class="alert alert-error">⚠️ كلمتا المرور غير متطابقتين</div>`;
        return;
      }
      const passwordPattern = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&_.\-]{8,}$/;
      if (!passwordPattern.test(password)) {
        alertBox.innerHTML = `<div class="alert alert-error">⚠️ كلمة المرور يجب أن تكون 8 أحرف على الأقل وتحتوي على حرف ورقم على الأقل</div>`;
        return;
      }
      const phonePattern = /^0[5-9][0-9]{8}$/;
      if (!phonePattern.test(phone)) {
        alertBox.innerHTML = `<div class="alert alert-error">⚠️ رقم الهاتف غير صحيح: يجب أن يتكون من 10 أرقام ويبدأ بـ 0 ثم رقم من 5 إلى 9</div>`;
        return;
      }

      submitBtn.disabled = true;
      submitBtn.textContent = "جاري التحقق...";
      try {
        const dup = await DB.Shops.checkExists({ shopName, ownerName, email });
        if (dup.emailTaken) {
          alertBox.innerHTML = `<div class="alert alert-error">⚠️ هذا البريد الإلكتروني مستخدم من قبل، يرجى استخدام بريد آخر</div>`;
          return;
        }
        if (dup.shopNameTaken) {
          alertBox.innerHTML = `<div class="alert alert-error">⚠️ اسم المحل "${UI.escapeHtml(shopName)}" مستخدم من قبل، يرجى اختيار اسم آخر</div>`;
          return;
        }

        await DB.Shops.register({ shopName, ownerName, email, phone, password });
        registerForm.style.display = "none";
        alertBox.innerHTML = `
          <div class="alert alert-success">
            ✅ تم إرسال طلبك بنجاح! حسابك الآن بانتظار موافقة الإدارة. بمجرد التفعيل ستنتقل تلقائياً
            إلى لوحة التحكم من صفحة تسجيل الدخول (يلزم اتصال بالإنترنت لمرة واحدة عند التفعيل فقط).
          </div>
          <a href="index.html#login" class="btn btn-primary btn-block">الذهاب لتسجيل الدخول</a>
        `;
      } catch (err) {
        alertBox.innerHTML = `<div class="alert alert-error">⚠️ ${UI.escapeHtml(UI.friendlyError(err, "تعذّر إنشاء الحساب، حاول لاحقاً"))}</div>`;
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = "إرسال طلب إنشاء الحساب";
      }
    });
  }

  document.getElementById("forgotPasswordLink")?.addEventListener("click", (e) => {
    e.preventDefault();
    document.getElementById("forgotPasswordForm").reset();
    UI.openModal("forgotPasswordModal");
  });
  document.getElementById("forgotPasswordForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("forgotEmail").value.trim();
    const submitBtn = e.target.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    try {
      await DB.Session.sendPasswordReset(email);
      UI.toast("تم إرسال رابط استعادة كلمة المرور إلى بريدك، يرجى مراجعة صندوق الوارد", "success");
      UI.closeModal("forgotPasswordModal");
    } catch (err) {
      UI.toast(UI.friendlyError(err, "تعذّر إرسال رابط الاستعادة، تحقق من البريد المدخل"), "error");
    } finally {
      submitBtn.disabled = false;
    }
  });

  document.getElementById("pendingSignOutBtn")?.addEventListener("click", async () => {
    if (pendingUnsub) pendingUnsub();
    await DB.Session.signOut();
    location.reload();
  });
});

function showPendingScreen(shopId) {
  document.getElementById("loginForm").style.display = "none";
  const card = document.getElementById("pendingCard");
  card.style.display = "block";

  pendingUnsub = DB.Shops.watchProfile(shopId, (shop) => {
    if (!shop) return;
    if (shop.status === "active") {
      document.getElementById("pendingTitle").textContent = "تم تفعيل حسابك ✅";
      document.getElementById("pendingText").textContent = "جاري تحويلك إلى لوحة التحكم...";
      if (pendingUnsub) pendingUnsub();
      setTimeout(() => location.href = "dashboard.html", 900);
    } else if (shop.status === "rejected") {
      document.getElementById("pendingTitle").textContent = "تم رفض طلب التفعيل";
      document.getElementById("pendingText").textContent = "يرجى التواصل مع الإدارة لمزيد من التفاصيل.";
    }
  });
}
