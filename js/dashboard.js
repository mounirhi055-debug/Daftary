
let currentShop = null;
let currentRole = "owner";
let currentEmployeeName = null;
let activeCustomerId = null;
let customersCache = [];
let unsubCustomers = null;
let unsubProfile = null;
let unsubEmployees = null;
let employeesCache = [];
let activityLogCache = [];
let unsubActivityLog = null;
let productsCache = [];
let unsubProducts = null;
let editingProductId = null;
let productImageBase64 = null;

const PAGE_SIZE = 15;
let customersShowCount = PAGE_SIZE;
let timelineShowCount = PAGE_SIZE;
let reminderShowCount = PAGE_SIZE;
let limitNearShowCount = PAGE_SIZE;
let salesLogShowCount = PAGE_SIZE;

function renderLoadMoreButton(container, totalCount, shownCount, onLoadMore, onShowLess) {
  if (shownCount >= totalCount && shownCount <= PAGE_SIZE) return;
  const wrap = document.createElement("div");
  wrap.className = "load-more-wrap";
  if (shownCount < totalCount) {
    const btn = document.createElement("button");
    btn.className = "btn btn-ghost btn-sm";
    btn.textContent = `عرض المزيد (${totalCount - shownCount} متبقٍ)`;
    btn.addEventListener("click", onLoadMore);
    wrap.appendChild(btn);
  }
  if (shownCount > PAGE_SIZE && onShowLess) {
    const lessBtn = document.createElement("button");
    lessBtn.className = "btn btn-ghost btn-sm";
    lessBtn.textContent = "عرض أقل";
    lessBtn.addEventListener("click", onShowLess);
    wrap.appendChild(lessBtn);
  }
  container.appendChild(wrap);
}

function logActivity(action, details) {
  const actorName = currentRole === "employee" ? (currentEmployeeName || "موظف") : (currentShop.ownerName || "صاحب المحل");
  DB.ActivityLog.log(currentShop.id, { action, actorName, actorRole: currentRole, details });
}

let pdfLibsPromise = null;
function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = () => reject(new Error("تعذّر تحميل المكتبة"));
    document.body.appendChild(s);
  });
}
function ensurePdfLibs() {
  if (!pdfLibsPromise) {
    pdfLibsPromise = Promise.all([
      loadScript("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"),
      loadScript("https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js")
    ]);
  }
  return pdfLibsPromise;
}

document.addEventListener("DOMContentLoaded", () => {
  DB.Session.onChange(async (user) => {
    if (!user) { location.href = "index.html#login"; return; }

    const session = await DB.Session.resolveSession(user.uid);
    if (!session || session.shop.status !== "active") {
      UI.toast("حسابك غير مفعّل حالياً", "error");
      await DB.Session.signOut();
      setTimeout(() => location.href = "index.html#login", 700);
      return;
    }
    currentShop = session.shop;
    currentRole = session.role;
    currentEmployeeName = session.employeeName || null;

    renderUserChip();
    renderExpiryAlert();
    bindNav();
    bindEvents();
    applyRolePermissions();
    renderNotifBadge();

    unsubProfile = DB.Shops.watchProfile(currentShop.id, (updated) => {
      if (!updated) return;
      currentShop = updated;
      renderUserChip();
      renderExpiryAlert();
      if (updated.status !== "active") {
        UI.toast("تم إيقاف تفعيل حسابك من قبل الإدارة", "error");
        setTimeout(() => { DB.Session.signOut(); location.href = "index.html#login"; }, 1200);
      }
    });

    unsubCustomers = DB.Customers.watchByShop(currentShop.id, (customers) => {
      customersCache = customers;
      renderCustomers();
      renderNotifBadge();
      if (document.getElementById("view-stats").style.display !== "none") renderStats();
      if (document.getElementById("view-notifications").style.display !== "none") renderNotifications();
      if (activeCustomerId && document.getElementById("view-customerDetail").style.display !== "none") {
        renderCustomerDetail();
      }
      if (document.getElementById("view-salesLog").style.display !== "none") renderSalesLog();
    });

    unsubProducts = DB.Products.watchByShop(currentShop.id, (products) => {
      productsCache = products;
      if (document.getElementById("view-products").style.display !== "none") renderProducts();
    });

    if (currentRole === "owner") {
      unsubEmployees = DB.Employees.watchByShop(currentShop.id, (employees) => {
        employeesCache = employees;
        if (document.getElementById("view-account").style.display !== "none") renderEmployees();
      });
      unsubActivityLog = DB.ActivityLog.watchByShop(currentShop.id, (entries) => {
        activityLogCache = entries;
        if (document.getElementById("view-activityLog").style.display !== "none") renderActivityLog();
        checkNewDeviceAlerts(entries);
      });
    }
  });
});

function renderUserChip() {
  document.getElementById("userAvatar").textContent = UI.initials(currentShop.shopName);
  document.getElementById("userName").textContent = currentShop.shopName;
  document.getElementById("userSub").textContent = currentRole === "employee"
    ? `موظف: ${currentEmployeeName || ""}`
    : currentShop.ownerName;
  const brandLogo = document.getElementById("brandLogoImg");
  if (brandLogo) brandLogo.src = currentShop.logoBase64 || "icons/logo.svg";

  const daysLeft = UI.daysLeft(currentShop.expiresAt);
  const pill = document.getElementById("subStatusPill");
  if (daysLeft !== null) {
    if (daysLeft <= 3) {
      pill.className = "status-pill badge-red";
      pill.textContent = `⏳ ينتهي خلال ${daysLeft} يوم`;
    } else {
      pill.className = "status-pill badge-green";
      pill.textContent = "مفعّل";
    }
  }
}

function applyRolePermissions() {
  const isEmployee = currentRole === "employee";
  document.querySelectorAll('.side-link[data-view="account"]').forEach(el => {
    el.style.display = isEmployee ? "none" : "";
  });
  document.querySelectorAll('.side-link[data-view="activityLog"]').forEach(el => {
    el.style.display = isEmployee ? "none" : "";
  });
  const deleteCustomerBtn = document.getElementById("deleteCustomerBtn");
  if (deleteCustomerBtn) deleteCustomerBtn.style.display = isEmployee ? "none" : "";
  const addCustomerBtn = document.getElementById("addCustomerBtn");
  if (addCustomerBtn) addCustomerBtn.style.display = isEmployee ? "none" : "";
  const editCustomerBtn = document.getElementById("editCustomerBtn");
  if (editCustomerBtn) editCustomerBtn.style.display = isEmployee ? "none" : "";
}

function renderExpiryAlert() {
  const daysLeft = UI.daysLeft(currentShop.expiresAt);
  const box = document.getElementById("expiryAlert");
  if (daysLeft !== null && daysLeft <= 5) {
    box.innerHTML = `<div class="alert alert-warn">⏳ ينتهي تفعيل حسابك خلال <strong>${daysLeft}</strong> يوم. يرجى التواصل مع الإدارة لتجديد الاشتراك وتفادي توقف الخدمة.</div>`;
  } else {
    box.innerHTML = "";
  }
}

function setSidebarOpen(open) {
  document.getElementById("sidebar").classList.toggle("open", open);
  document.getElementById("sidebarOverlay").classList.toggle("open", open);
  document.body.classList.toggle("sidebar-locked", open);
  const mainArea = document.getElementById("mainArea");
  if (mainArea) {
    if (open) { mainArea.setAttribute("inert", ""); mainArea.classList.add("bg-locked"); }
    else { mainArea.removeAttribute("inert"); mainArea.classList.remove("bg-locked"); }
  }
}

function bindNav() {
  document.querySelectorAll(".side-link[data-view]").forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      document.querySelectorAll(".side-link[data-view]").forEach(l => l.classList.remove("active"));
      link.classList.add("active");
      const view = link.dataset.view;
      showView(view);
      setSidebarOpen(false);
    });
  });

  document.getElementById("hamburgerBtn")?.addEventListener("click", () => {
    const isOpen = document.getElementById("sidebar").classList.contains("open");
    setSidebarOpen(!isOpen);
  });
  document.getElementById("sidebarOverlay")?.addEventListener("click", () => setSidebarOpen(false));
  document.getElementById("sidebarCloseBtn")?.addEventListener("click", () => setSidebarOpen(false));
}

function showView(view) {
  if (view === "account" && currentRole === "employee") view = "customers";
  if (view === "activityLog" && currentRole === "employee") view = "customers";
  ["customers", "customerDetail", "products", "salesLog", "stats", "account", "notifications", "activityLog"].forEach(v => {
    const el = document.getElementById("view-" + v);
    if (el) el.style.display = "none";
  });
  const titles = { customers: "الزبائن والكريدي", products: "السلع والمنتجات", salesLog: "سجل المبيعات", stats: "الإحصائيات", account: "بيانات المحل", customerDetail: "تفاصيل الزبون", notifications: "التنبيهات", activityLog: "سجل النشاط" };
  document.getElementById("view-" + view).style.display = "block";
  document.getElementById("topbarTitle").textContent = titles[view] || "";
  if (view === "products") renderProducts();
  if (view === "salesLog") { salesLogShowCount = PAGE_SIZE; renderSalesLog(); }
  if (view === "stats") renderStats();
  if (view === "account") { renderAccount(); if (currentRole === "owner") renderEmployees(); }
  if (view === "notifications") { reminderShowCount = PAGE_SIZE; limitNearShowCount = PAGE_SIZE; renderNotifications(); }
  if (view === "activityLog") renderActivityLog();
}

function bindEvents() {
  document.getElementById("logoutBtn").addEventListener("click", async () => {
    if (!(await UI.confirmAction("هل أنت متأكد من تسجيل الخروج؟", { okLabel: "تسجيل الخروج", cancelLabel: "إلغاء" }))) return;
    if (unsubCustomers) unsubCustomers();
    if (unsubProfile) unsubProfile();
    if (unsubEmployees) unsubEmployees();
    if (unsubActivityLog) unsubActivityLog();
    if (unsubProducts) unsubProducts();
    await DB.Session.signOut();
    location.href = "index.html";
  });

  document.getElementById("addCustomerBtn").addEventListener("click", () => {
    if (currentRole !== "owner") return;
    openCustomerModal();
  });
  document.getElementById("customerForm").addEventListener("submit", onSaveCustomer);

  document.getElementById("addProductBtn")?.addEventListener("click", () => openProductModal());
  document.getElementById("productForm")?.addEventListener("submit", onSaveProduct);
  document.getElementById("productSearchInput")?.addEventListener("input", renderProducts);
  document.getElementById("salesLogSearchInput")?.addEventListener("input", () => { salesLogShowCount = PAGE_SIZE; renderSalesLog(); });
  document.getElementById("salesLogFilterSelect")?.addEventListener("change", () => { salesLogShowCount = PAGE_SIZE; renderSalesLog(); });
  document.getElementById("productImageUploadBtn")?.addEventListener("click", () => {
    document.getElementById("productImageFileInput").click();
  });
  document.getElementById("productImageFileInput")?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      UI.toast("الرجاء اختيار صورة أصغر من 8MB", "error");
      e.target.value = "";
      return;
    }
    try {
      productImageBase64 = await UI.compressImage(file, { maxDim: 500, quality: 0.8 });
      setProductImagePreview(productImageBase64);
    } catch (err) {
      UI.toast("تعذّرت معالجة الصورة", "error");
    }
    e.target.value = "";
  });
  document.getElementById("productImageRemoveBtn")?.addEventListener("click", () => {
    productImageBase64 = null;
    setProductImagePreview(null);
  });
  document.getElementById("searchInput").addEventListener("input", () => { customersShowCount = PAGE_SIZE; renderCustomers(); });
  document.getElementById("filterSelect")?.addEventListener("change", () => { customersShowCount = PAGE_SIZE; renderCustomers(); });
  document.getElementById("sortSelect")?.addEventListener("change", () => { customersShowCount = PAGE_SIZE; renderCustomers(); });

  document.getElementById("exportStatementBtn")?.addEventListener("click", exportCustomerStatement);

  document.getElementById("accLogoUploadBtn")?.addEventListener("click", () => {
    document.getElementById("accLogoFileInput").click();
  });
  document.getElementById("accLogoFileInput")?.addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      UI.toast("الرجاء اختيار صورة أصغر من 8MB", "error");
      e.target.value = "";
      return;
    }
    let base64;
    try {
      base64 = await UI.compressImage(file, { maxDim: 300, quality: 0.8 });
    } catch (err) {
      UI.toast("تعذّرت معالجة الصورة", "error");
      e.target.value = "";
      return;
    }
    await DB.Shops.updateLogo(currentShop.id, base64);
    currentShop.logoBase64 = base64;
    renderUserChip();
    renderAccount();
    UI.toast("تم تحديث شعار المحل", "success");
    e.target.value = "";
  });
  document.getElementById("accLogoRemoveBtn")?.addEventListener("click", async () => {
    await DB.Shops.updateLogo(currentShop.id, null);
    currentShop.logoBase64 = null;
    renderUserChip();
    renderAccount();
    UI.toast("تمت إزالة الشعار", "success");
  });

  document.getElementById("accountForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const shopName = document.getElementById("accShopName").value.trim();
    const ownerName = document.getElementById("accOwnerName").value.trim();
    const phone = document.getElementById("accPhone").value.trim();
    if (!shopName || !ownerName) {
      UI.toast("يرجى تعبئة اسم المحل واسم صاحب المحل", "error");
      return;
    }
    if (!/^0[5-9][0-9]{8}$/.test(phone)) {
      UI.toast("رقم الهاتف غير صحيح: 10 أرقام تبدأ بـ 0 ثم رقم من 5 إلى 9", "error");
      return;
    }
    const saveBtn = document.getElementById("accSaveBtn");
    saveBtn.disabled = true;
    saveBtn.textContent = "جارٍ الحفظ...";
    try {
      await DB.Shops.updateProfile(currentShop.id, { shopName, ownerName, phone });
      currentShop.shopName = shopName;
      currentShop.ownerName = ownerName;
      currentShop.phone = phone;
      renderUserChip();
      UI.toast("تم حفظ بيانات المحل", "success");
    } catch (err) {
      UI.toast(UI.friendlyError(err, "تعذّر حفظ التعديلات"), "error");
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = "💾 حفظ التعديلات";
    }
  });

  document.getElementById("addEmployeeBtn")?.addEventListener("click", () => {
    document.getElementById("employeeForm").reset();
    UI.openModal("employeeModal");
  });
  document.getElementById("employeeForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("empName").value.trim();
    const email = document.getElementById("empEmail").value.trim();
    const password = document.getElementById("empPassword").value;
    if (!name || !email) {
      UI.toast("يرجى تعبئة اسم الموظف والبريد الإلكتروني", "error");
      return;
    }
    const passwordPattern = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d@$!%*#?&_.\-]{8,}$/;
    if (!passwordPattern.test(password)) {
      UI.toast("كلمة المرور يجب أن تكون 8 أحرف على الأقل وتحتوي على حرف ورقم", "error");
      return;
    }
    const submitBtn = e.target.querySelector("button[type=submit]");
    submitBtn.disabled = true;
    submitBtn.textContent = "جارٍ الإنشاء...";
    try {
      await DB.Employees.add(currentShop.id, { name, email, password });
      logActivity("add_employee", `إنشاء حساب موظف جديد "${name}" (${email})`);
      UI.toast("تم إنشاء حساب الموظف بنجاح", "success");
      UI.closeModal("employeeModal");
    } catch (err) {
      UI.toast(UI.friendlyError(err, "تعذّر إنشاء حساب الموظف"), "error");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "إنشاء حساب الموظف";
    }
  });

  document.getElementById("backToListBtn").addEventListener("click", () => {
    document.querySelectorAll(".side-link[data-view]").forEach(l => l.classList.remove("active"));
    document.querySelector('.side-link[data-view="customers"]').classList.add("active");
    showView("customers");
  });

  document.getElementById("addTxBtn").addEventListener("click", () => {
    document.getElementById("txForm").reset();
    resetTxCart();
    setupTxLimitState();
    toggleTxNoteField();
    populateTxProductSelect();
    UI.openModal("txModal");
  });
  document.getElementById("txForm").addEventListener("submit", onSaveTransaction);
  document.getElementById("txProductSearch")?.addEventListener("input", renderTxSearchResults);
  document.getElementById("txProductSearch")?.addEventListener("focus", renderTxSearchResults);
  document.addEventListener("click", (e) => {
    const combo = document.getElementById("txProductField");
    const results = document.getElementById("txSearchResults");
    if (combo && results && !combo.contains(e.target)) results.style.display = "none";
  });
  document.getElementById("txQtyMinus")?.addEventListener("click", () => {
    const qtyInput = document.getElementById("txProductQty");
    qtyInput.value = Math.max(1, (parseInt(qtyInput.value, 10) || 1) - 1);
  });
  document.getElementById("txQtyPlus")?.addEventListener("click", () => {
    const qtyInput = document.getElementById("txProductQty");
    qtyInput.value = (parseInt(qtyInput.value, 10) || 1) + 1;
  });
  document.getElementById("txAddItemBtn")?.addEventListener("click", onTxAddItem);
  document.querySelectorAll('input[name="txType"]').forEach(input => {
    input.addEventListener("change", toggleTxNoteField);
  });

  document.getElementById("editCustomerBtn").addEventListener("click", () => {
    if (currentRole !== "owner") return;
    const c = customersCache.find(x => x.id === activeCustomerId);
    if (c) openCustomerModal(c);
  });

  document.getElementById("deleteCustomerBtn").addEventListener("click", async () => {
    if (currentRole !== "owner") return;
    const c = customersCache.find(x => x.id === activeCustomerId);
    if (!c) return;
    if (await UI.confirmAction(`هل أنت متأكد من حذف الزبون "${c.name}"؟ سيتم حذف كل عملياته نهائياً.`)) {
      try {
        await DB.Customers.remove(currentShop.id, c.id);
        logActivity("remove_customer", `حذف الزبون "${c.name}"`);
        UI.toast("تم حذف الزبون", "success");
        showView("customers");
      } catch (err) {
        UI.toast(UI.friendlyError(err, "تعذّر حذف الزبون"), "error");
      }
    }
  });
}

function trustLabel(level) {
  if (level === "trusted") return "زبون موثوق";
  if (level === "medium") return "ثقة متوسطة";
  return "يحتاج انتباه";
}

function renderCustomers() {
  const query = (document.getElementById("searchInput")?.value || "").trim().toLowerCase();
  const filter = document.getElementById("filterSelect")?.value || "all";
  const sort = document.getElementById("sortSelect")?.value || "recent";
  let customers = customersCache;
  if (query) {
    customers = customers.filter(c => c.name.toLowerCase().includes(query) || (c.phone || "").includes(query));
  }
  if (filter === "due") customers = customers.filter(c => DB.Customers.balance(c) > 0);
  if (filter === "clear") customers = customers.filter(c => DB.Customers.balance(c) <= 0);

  customers = customers.slice();
  if (sort === "name") customers.sort((a, b) => a.name.localeCompare(b.name, "ar"));
  else if (sort === "balanceDesc") customers.sort((a, b) => DB.Customers.balance(b) - DB.Customers.balance(a));

  const tbody = document.getElementById("customersTbody");
  const emptyBox = document.getElementById("emptyCustomers");
  tbody.innerHTML = "";

  if (customers.length === 0) {
    emptyBox.style.display = "block";
    document.getElementById("customersTable").style.display = "none";
  } else {
    emptyBox.style.display = "none";
    document.getElementById("customersTable").style.display = "table";
    customers.slice(0, customersShowCount).forEach(c => {
      const balance = DB.Customers.balance(c);
      const lastTx = c.transactions[0];
      const trust = DB.Customers.trustScore(c);
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>
          <div class="customer-name-cell">
            <div class="avatar-sm">${UI.escapeHtml(UI.initials(c.name))}</div>
            <div>
              <div style="font-weight:700;display:flex;align-items:center;gap:6px;">
                ${UI.escapeHtml(c.name)}
                <span class="trust-dot trust-${trust.level}" title="${trustLabel(trust.level)} (${trust.score}/100)"></span>
              </div>
              ${c.note ? `<div style="font-size:.76rem;color:#8a8072;">${UI.escapeHtml(c.note)}</div>` : ""}
            </div>
          </div>
        </td>
        <td class="col-phone">${UI.escapeHtml(c.phone || "—")}</td>
        <td class="col-balance"><span class="balance ${balance > 0 ? "due" : "clear"}">${UI.money(balance)}</span></td>
        <td class="col-date" style="font-size:.8rem;color:#7a8580;">${lastTx ? UI.formatDate(lastTx.date) : "—"}</td>
        <td class="col-actions">
          <div class="row-actions">
            <button class="icon-btn js-open-customer" title="فتح السجل">↗️</button>
          </div>
        </td>
      `;
      tr.querySelector(".js-open-customer").addEventListener("click", () => openCustomerDetail(c.id));
      tr.addEventListener("dblclick", () => openCustomerDetail(c.id));
      tbody.appendChild(tr);
    });
  }

  const tableCard = document.getElementById("customersTable")?.closest(".table-card");
  document.getElementById("customersLoadMore")?.remove();
  if (tableCard) {
    const holder = document.createElement("div");
    holder.id = "customersLoadMore";
    renderLoadMoreButton(holder, customers.length, customersShowCount, () => {
      customersShowCount += PAGE_SIZE;
      renderCustomers();
    }, () => {
      customersShowCount = PAGE_SIZE;
      renderCustomers();
    });
    tableCard.appendChild(holder);
  }
}

function openCustomerModal(customer = null) {
  document.getElementById("customerForm").reset();
  document.getElementById("customerModalTitle").textContent = customer ? "تعديل بيانات الزبون" : "إضافة زبون جديد";
  document.getElementById("customerId").value = customer ? customer.id : "";
  document.getElementById("custName").value = customer ? customer.name : "";
  document.getElementById("custPhone").value = customer ? customer.phone : "";
  document.getElementById("custCreditLimit").value = (customer && customer.creditLimit != null) ? customer.creditLimit : "";
  document.getElementById("custNote").value = customer ? customer.note : "";
  document.getElementById("custReminderDate").value = customer && customer.reminderDate ? customer.reminderDate.slice(0, 10) : "";
  UI.openModal("customerModal");
}

async function onSaveCustomer(e) {
  e.preventDefault();
  if (currentRole !== "owner") {
    UI.toast("لا تملك صلاحية إضافة أو تعديل بيانات الزبون", "error");
    return;
  }
  const id = document.getElementById("customerId").value;
  const name = document.getElementById("custName").value.trim();
  const phone = document.getElementById("custPhone").value.trim();
  const note = document.getElementById("custNote").value.trim();
  const creditLimitRaw = document.getElementById("custCreditLimit").value.trim();
  const creditLimit = creditLimitRaw === "" ? null : Number(creditLimitRaw);
  const reminderDate = document.getElementById("custReminderDate").value || null;

  if (!name) {
    UI.toast("يرجى إدخال اسم الزبون", "error");
    return;
  }
  if (phone && !/^0[5-9][0-9]{8}$/.test(phone)) {
    UI.toast("رقم الهاتف غير صحيح: 10 أرقام تبدأ بـ 0 ثم رقم من 5 إلى 9", "error");
    return;
  }
  if (creditLimit != null && (isNaN(creditLimit) || creditLimit < 0)) {
    UI.toast("يرجى إدخال حد كريدي صحيح", "error");
    return;
  }

  try {
    const dup = await DB.Customers.checkDuplicate(currentShop.id, { name, phone, excludeId: id || null });
    if (dup.nameTaken) {
      UI.toast("يوجد زبون آخر بنفس الاسم مسبقاً", "error");
      return;
    }
    if (dup.phoneTaken) {
      UI.toast("يوجد زبون آخر بنفس رقم الهاتف مسبقاً", "error");
      return;
    }

    if (id) {
      await DB.Customers.update(currentShop.id, { id, name, phone, note, creditLimit });
      await DB.Customers.setReminder(currentShop.id, id, reminderDate);
      logActivity("update_customer", `تعديل بيانات الزبون "${name}"`);
      UI.toast("تم تحديث بيانات الزبون", "success");
      if (activeCustomerId === id) renderCustomerDetail();
    } else {
      const newId = await DB.Customers.add(currentShop.id, { name, phone, note, creditLimit });
      if (reminderDate) await DB.Customers.setReminder(currentShop.id, newId, reminderDate);
      logActivity("add_customer", `إضافة زبون جديد "${name}"`);
      UI.toast("تمت إضافة الزبون بنجاح", "success");
    }
    UI.closeModal("customerModal");
  } catch (err) {
    UI.toast(UI.friendlyError(err, "تعذّر حفظ بيانات الزبون"), "error");
  }
}

function openCustomerDetail(customerId) {
  activeCustomerId = customerId;
  timelineShowCount = PAGE_SIZE;
  document.querySelectorAll(".side-link[data-view]").forEach(l => l.classList.remove("active"));
  showView("customerDetail");
  renderCustomerDetail();
}

function renderCustomerDetail() {
  const c = customersCache.find(x => x.id === activeCustomerId);
  if (!c) { showView("customers"); return; }

  const balance = DB.Customers.balance(c);
  document.getElementById("detailAvatar").textContent = UI.initials(c.name);
  document.getElementById("detailName").textContent = c.name;
  document.getElementById("detailPhone").textContent = c.phone || "لا يوجد رقم هاتف مسجَّل";
  const trust = DB.Customers.trustScore(c);
  const trustPill = document.getElementById("detailTrustPill");
  const trustBadgeClass = trust.level === "trusted" ? "badge-green" : trust.level === "medium" ? "badge-gold" : "badge-red";
  const trustIcon = trust.level === "trusted" ? "🟢" : trust.level === "medium" ? "🟡" : "🔴";
  trustPill.className = "status-pill " + trustBadgeClass;
  trustPill.textContent = `${trustIcon} ${trustLabel(trust.level)} (${trust.score}/100)`;
  const balEl = document.getElementById("detailBalance");
  balEl.textContent = UI.money(balance);
  balEl.className = "balance cd-balance " + (balance > 0 ? "due" : "clear");

  const limitInfoEl = document.getElementById("detailLimitInfo");
  if (c.creditLimit != null) {
    const remaining = Math.max(0, c.creditLimit - balance);
    limitInfoEl.innerHTML = remaining > 0
      ? `الحد الأقصى: ${UI.money(c.creditLimit)} · متبقٍ له: <strong>${UI.money(remaining)}</strong>`
      : `<span class="cd-limit-reached">⚠ بلغ الحد الأقصى (${UI.money(c.creditLimit)})</span>`;
  } else {
    limitInfoEl.textContent = "";
  }

  const wrap = document.getElementById("timelineWrap");
  const emptyBox = document.getElementById("emptyTimeline");
  wrap.innerHTML = "";

  if (c.transactions.length === 0) {
    emptyBox.style.display = "block";
  } else {
    emptyBox.style.display = "none";
    c.transactions.slice(0, timelineShowCount).forEach(t => {
      const hasItems = Array.isArray(t.items) && t.items.length > 0;
      const itemsCount = hasItems ? t.items.reduce((s, it) => s + it.qty, 0) : 0;
      const itemsSummary = hasItems
        ? `${t.items.length > 1 ? `${t.items.length} سلع (${itemsCount} قطعة)` : `${UI.escapeHtml(t.items[0].name)} × ${t.items[0].qty}`}`
        : "";
      const itemsDetail = hasItems
        ? `<ul class="tl-items">${t.items.map(it => `<li>${UI.escapeHtml(it.name)} × ${it.qty} — ${UI.money(it.price * it.qty)}</li>`).join("")}</ul>`
        : "";

      const item = document.createElement("div");
      item.className = "timeline-item";
      item.innerHTML = `
        <div class="tl-icon ${t.type}">${t.type === "credit" ? "🔴" : "🟢"}</div>
        <div class="tl-body">
          <div class="tl-top">
            <strong>${t.type === "credit" ? "كريدي جديد" : "تسديد مبلغ"}</strong>
            <span class="tl-amount ${t.type}">${t.type === "credit" ? "+" : "−"}${UI.money(t.amount)}</span>
          </div>
          <div class="tl-date">${UI.formatDate(t.date)}</div>
          ${hasItems ? `<div class="tl-note tl-items-toggle">🛒 ${itemsSummary} <span class="tl-items-arrow">▾</span></div>` : (t.note ? `<div class="tl-note">${UI.escapeHtml(t.note)}</div>` : "")}
          ${hasItems ? `<div class="tl-items-wrap" style="display:none;">${itemsDetail}${t.note ? `<div class="tl-note">${UI.escapeHtml(t.note)}</div>` : ""}</div>` : ""}
        </div>
        ${currentRole === "owner" ? `<button class="icon-btn js-del-tx" title="حذف العملية">🗑️</button>` : ""}
      `;
      const toggle = item.querySelector(".tl-items-toggle");
      if (toggle) {
        toggle.addEventListener("click", () => {
          const wrap = item.querySelector(".tl-items-wrap");
          const arrow = item.querySelector(".tl-items-arrow");
          const open = wrap.style.display !== "none";
          wrap.style.display = open ? "none" : "block";
          arrow.textContent = open ? "▾" : "▴";
        });
      }
      item.querySelector(".js-del-tx")?.addEventListener("click", async () => {
        if (await UI.confirmAction("هل تريد حذف هذه العملية؟")) {
          try {
            await DB.Customers.removeTransaction(currentShop.id, c.id, t.id);
            logActivity("remove_transaction", `حذف عملية ${t.type === "credit" ? "كريدي" : "تسديد"} بقيمة ${UI.money(t.amount)} للزبون "${c.name}"`);
            UI.toast("تم حذف العملية", "success");
          } catch (err) {
            UI.toast(UI.friendlyError(err, "تعذّر حذف العملية"), "error");
          }
        }
      });
      wrap.appendChild(item);
    });
    renderLoadMoreButton(wrap, c.transactions.length, timelineShowCount, () => {
      timelineShowCount += PAGE_SIZE;
      renderCustomerDetail();
    }, () => {
      timelineShowCount = PAGE_SIZE;
      renderCustomerDetail();
    });
  }
}

function setupTxLimitState() {
  const c = customersCache.find(x => x.id === activeCustomerId);
  const creditRadio = document.getElementById("txTypeCredit");
  const paymentRadio = document.querySelector('input[name="txType"][value="payment"]');
  const warningEl = document.getElementById("txLimitWarning");
  creditRadio.disabled = false;

  if (!c || c.creditLimit == null) {
    warningEl.style.display = "none";
    return;
  }
  const balance = DB.Customers.balance(c);
  if (balance >= c.creditLimit) {
    creditRadio.disabled = true;
    paymentRadio.checked = true;
    warningEl.textContent = `⚠ هذا الزبون بلغ الحد الأقصى المسموح به (${UI.money(c.creditLimit)})، لا يمكن تسجيل كريدي جديد له إلا بعد التسديد`;
    warningEl.style.display = "block";
  } else {
    warningEl.style.display = "none";
  }
}

let txCart = []; // { productId, name, price, qty }
let txSelectedProduct = null;

function toggleTxNoteField() {
  const type = document.querySelector('input[name="txType"]:checked')?.value;
  const field = document.getElementById("txNoteField");
  const productField = document.getElementById("txProductField");
  const amountHint = document.getElementById("txAmountHint");
  if (!field) return;
  if (type === "payment") {
    field.style.display = "none";
    document.getElementById("txNote").value = "";
    if (productField) productField.style.display = "none";
    if (amountHint) amountHint.style.display = "none";
    document.getElementById("txAmount").required = true;
  } else {
    field.style.display = "";
    if (productField) productField.style.display = "";
    document.getElementById("txAmount").required = txCart.length === 0;
    renderTxCart();
  }
}

function populateTxProductSelect() {
  const select = document.getElementById("txProduct");
  if (!select) return;
  select.innerHTML = `<option value="">— اختر سلعة —</option>` +
    productsCache.map(p => `<option value="${p.id}">${UI.escapeHtml(p.name)} — ${UI.money(p.price)}</option>`).join("");
}

function resetTxCart() {
  txCart = [];
  txSelectedProduct = null;
  const searchInput = document.getElementById("txProductSearch");
  const qtyInput = document.getElementById("txProductQty");
  const qtyRow = document.getElementById("txQtyRow");
  const results = document.getElementById("txSearchResults");
  if (searchInput) searchInput.value = "";
  if (qtyInput) qtyInput.value = 1;
  if (qtyRow) qtyRow.style.display = "none";
  if (results) results.style.display = "none";
  renderTxCart();
}

function renderTxSearchResults() {
  const input = document.getElementById("txProductSearch");
  const results = document.getElementById("txSearchResults");
  if (!input || !results) return;
  const q = input.value.trim().toLowerCase();

  if (!q) {
    results.style.display = "none";
    results.innerHTML = "";
    return;
  }

  const matches = productsCache.filter(p => p.name.toLowerCase().includes(q)).slice(0, 8);

  if (matches.length === 0) {
    results.innerHTML = `<div class="tx-search-empty">لا توجد سلع مطابقة</div>`;
    results.style.display = "block";
    return;
  }

  results.innerHTML = matches.map(p => `
    <div class="tx-search-item" data-id="${p.id}">
      <span class="tsi-name">${UI.escapeHtml(p.name)}</span>
      <span class="tsi-price">${UI.money(p.price)}</span>
    </div>
  `).join("");
  results.style.display = "block";

  results.querySelectorAll(".tx-search-item").forEach(el => {
    el.addEventListener("click", () => onTxSelectProduct(el.dataset.id));
  });
}

function onTxSelectProduct(productId) {
  const product = productsCache.find(p => p.id === productId);
  if (!product) return;
  txSelectedProduct = product;

  document.getElementById("txProduct").value = product.id;
  document.getElementById("txProductSearch").value = product.name;
  document.getElementById("txSelectedProductName").textContent = `${product.name} — ${UI.money(product.price)}`;
  document.getElementById("txProductQty").value = 1;
  document.getElementById("txQtyRow").style.display = "flex";

  const results = document.getElementById("txSearchResults");
  results.style.display = "none";
  results.innerHTML = "";
}

function onTxAddItem() {
  const qtyInput = document.getElementById("txProductQty");
  const product = txSelectedProduct;
  if (!product) {
    UI.toast("يرجى البحث واختيار سلعة أولاً", "error");
    return;
  }
  const qty = Math.max(1, parseInt(qtyInput.value, 10) || 1);

  const existing = txCart.find(it => it.productId === product.id);
  if (existing) {
    existing.qty += qty;
  } else {
    txCart.push({ productId: product.id, name: product.name, price: product.price, qty });
  }

  txSelectedProduct = null;
  document.getElementById("txProduct").value = "";
  document.getElementById("txProductSearch").value = "";
  document.getElementById("txQtyRow").style.display = "none";
  qtyInput.value = 1;
  renderTxCart();
}

function txCartTotal() {
  return txCart.reduce((sum, it) => sum + it.price * it.qty, 0);
}

function renderTxCart() {
  const list = document.getElementById("txCartList");
  const totalEl = document.getElementById("txCartTotal");
  const amountInput = document.getElementById("txAmount");
  const amountHint = document.getElementById("txAmountHint");
  if (!list) return;

  list.innerHTML = txCart.map((it, idx) => `
    <li data-idx="${idx}">
      <span>
        <span class="tci-name">${UI.escapeHtml(it.name)}</span>
        <span class="tci-meta">× ${it.qty} — ${UI.money(it.price * it.qty)}</span>
      </span>
      <button type="button" class="tci-remove" title="حذف">✕</button>
    </li>
  `).join("");

  list.querySelectorAll(".tci-remove").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = Number(btn.closest("li").dataset.idx);
      txCart.splice(idx, 1);
      renderTxCart();
    });
  });

  if (txCart.length > 0) {
    const total = txCartTotal();
    totalEl.style.display = "block";
    totalEl.textContent = `مجموع السلع: ${UI.money(total)}`;
    amountInput.value = total;
    amountInput.required = false;
    if (amountHint) amountHint.style.display = "block";
  } else {
    totalEl.style.display = "none";
    if (amountHint) amountHint.style.display = "none";
    amountInput.required = true;
  }
}

async function onSaveTransaction(e) {
  e.preventDefault();
  const type = document.querySelector('input[name="txType"]:checked').value;
  const hasCart = type === "credit" && txCart.length > 0;
  const amount = hasCart ? txCartTotal() : parseFloat(document.getElementById("txAmount").value);
  let note = type === "credit" ? document.getElementById("txNote").value.trim() : "";
  if (type === "credit" && !note && hasCart) {
    note = txCart.map(it => `${it.name} ×${it.qty}`).join("، ");
  }

  if (!amount || amount <= 0) {
    UI.toast("يرجى إدخال مبلغ صحيح أو إضافة سلعة واحدة على الأقل", "error");
    return;
  }

  const c = customersCache.find(x => x.id === activeCustomerId);
  const balance = c ? DB.Customers.balance(c) : 0;

  if (type === "payment" && amount > balance) {
    UI.toast(`المبلغ المسدد أكبر من الدين المستحق (${UI.money(balance)}). لا يمكن تسجيل هذه العملية`, "error");
    return;
  }

  if (type === "credit" && c && c.creditLimit != null && (balance + amount) > c.creditLimit) {
    UI.toast(`هذا الزبون سيتجاوز الحد الأقصى المسموح به للكريدي (${UI.money(c.creditLimit)}). لا يمكن تسجيل هذه العملية`, "error");
    return;
  }

  try {
    const actorName = currentRole === "employee" ? (currentEmployeeName || "موظف") : (currentShop.ownerName || "صاحب المحل");
    const productId = !hasCart ? (document.getElementById("txProduct")?.value || null) : null;
    const items = hasCart ? txCart.map(it => ({ productId: it.productId, name: it.name, price: it.price, qty: it.qty })) : null;
    await DB.Customers.addTransaction(currentShop.id, activeCustomerId, { type, amount, note, addedByName: actorName, addedByRole: currentRole, productId, items });
    logActivity("add_transaction", `${type === "credit" ? "تسجيل كريدي" : "تسجيل تسديد"} بقيمة ${UI.money(amount)} للزبون "${c ? c.name : ""}"`);
    resetTxCart();
    UI.closeModal("txModal");
    UI.toast(type === "credit" ? "تم تسجيل الكريدي بنجاح" : "تم تسجيل التسديد بنجاح", "success");
  } catch (err) {
    UI.toast(UI.friendlyError(err, "تعذّر تسجيل العملية"), "error");
  }
}

function renderStats() {
  const totals = DB.Customers.shopTotals(customersCache);
  document.getElementById("stat2Due").textContent = UI.money(totals.totalDue);
  document.getElementById("stat2Credit").textContent = UI.money(totals.totalCredit);
  document.getElementById("stat2Paid").textContent = UI.money(totals.totalPaid);
  document.getElementById("stat2Count").textContent = totals.customersCount;

  const topDebtors = customersCache
    .map(c => ({ c, balance: DB.Customers.balance(c) }))
    .filter(x => x.balance > 0)
    .sort((a, b) => b.balance - a.balance)
    .slice(0, 5);

  const list = document.getElementById("topDebtorsList");
  if (topDebtors.length === 0) {
    list.innerHTML = `<p style="color:#8a8072; font-size:.88rem;">لا يوجد زبائن عليهم ديون حالياً 🎉</p>`;
  } else {
    list.innerHTML = topDebtors.map(({ c, balance }) => `
      <div class="lm-row" style="padding:12px 0;">
        <div class="lm-name">${UI.escapeHtml(c.name)}</div>
        <div class="lm-amount" style="color:var(--red)">${UI.money(balance)}</div>
      </div>
    `).join("");
  }

  renderMonthlyChart();
}

function renderMonthlyChart() {
  const box = document.getElementById("monthlyChart");
  if (!box) return;

  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString("ar", { month: "short" }), credit: 0, paid: 0 });
  }
  const byKey = Object.fromEntries(months.map(m => [m.key, m]));

  customersCache.forEach(c => {
    c.transactions.forEach(t => {
      const d = new Date(t.date);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      if (byKey[key]) {
        if (t.type === "credit") byKey[key].credit += t.amount;
        else byKey[key].paid += t.amount;
      }
    });
  });

  const max = Math.max(1, ...months.map(m => Math.max(m.credit, m.paid)));
  box.innerHTML = months.map(m => `
    <div class="mc-col">
      <div class="mc-bars">
        <div class="mc-bar credit" style="height:${Math.round((m.credit / max) * 120)}px" title="كريدي: ${UI.money(m.credit)}"></div>
        <div class="mc-bar paid" style="height:${Math.round((m.paid / max) * 120)}px" title="تسديد: ${UI.money(m.paid)}"></div>
      </div>
      <div class="mc-label">${m.label}</div>
    </div>
  `).join("");
}

function getReminderDueCustomers() {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return customersCache.filter(c => {
    if (!c.reminderDate) return false;
    const d = new Date(c.reminderDate); d.setHours(0, 0, 0, 0);
    return d <= today && DB.Customers.balance(c) > 0;
  });
}

function getNearLimitCustomers() {
  return customersCache.filter(c => {
    if (c.creditLimit == null) return false;
    const balance = DB.Customers.balance(c);
    return balance > 0 && balance >= c.creditLimit * 0.8;
  });
}

function renderNotifBadge() {
  const badge = document.getElementById("notifBadge");
  if (!badge) return;
  const count = getReminderDueCustomers().length + getNearLimitCustomers().length;
  if (count > 0) {
    badge.style.display = "flex";
    badge.textContent = count;
  } else {
    badge.style.display = "none";
  }
}

function renderNotifications() {
  const dueList = document.getElementById("reminderDueList");
  const dueCustomers = getReminderDueCustomers();
  dueList.innerHTML = "";
  if (dueCustomers.length === 0) {
    dueList.innerHTML = `<p style="color:#8a8072; font-size:.88rem;">لا توجد تذكيرات مستحقة حالياً.</p>`;
  } else {
    dueCustomers.slice(0, reminderShowCount).forEach(c => {
      const row = document.createElement("div");
      row.className = "notif-row";
      row.innerHTML = `
        <div>
          <strong>${UI.escapeHtml(c.name)}</strong>
          <div class="notif-meta">تذكير بتاريخ ${UI.formatDate(c.reminderDate)} · متبقٍ عليه ${UI.money(DB.Customers.balance(c))}</div>
        </div>
        <button class="btn btn-ghost btn-sm js-open-cust">فتح الزبون</button>
      `;
      row.querySelector(".js-open-cust").addEventListener("click", () => {
        document.querySelectorAll(".side-link[data-view]").forEach(l => l.classList.remove("active"));
        document.querySelector('.side-link[data-view="customers"]').classList.add("active");
        openCustomerDetail(c.id);
      });
      dueList.appendChild(row);
    });
    renderLoadMoreButton(dueList, dueCustomers.length, reminderShowCount, () => {
      reminderShowCount += PAGE_SIZE;
      renderNotifications();
    }, () => {
      reminderShowCount = PAGE_SIZE;
      renderNotifications();
    });
  }

  const limitList = document.getElementById("limitNearList");
  const nearLimit = getNearLimitCustomers();
  limitList.innerHTML = "";
  if (nearLimit.length === 0) {
    limitList.innerHTML = `<p style="color:#8a8072; font-size:.88rem;">لا يوجد زبائن قريبون من حدهم الأقصى حالياً.</p>`;
  } else {
    nearLimit.slice(0, limitNearShowCount).forEach(c => {
      const row = document.createElement("div");
      row.className = "notif-row";
      row.innerHTML = `
        <div>
          <strong>${UI.escapeHtml(c.name)}</strong>
          <div class="notif-meta">${UI.money(DB.Customers.balance(c))} من أصل ${UI.money(c.creditLimit)}</div>
        </div>
        <button class="btn btn-ghost btn-sm js-open-cust2">فتح الزبون</button>
      `;
      row.querySelector(".js-open-cust2").addEventListener("click", () => {
        document.querySelectorAll(".side-link[data-view]").forEach(l => l.classList.remove("active"));
        document.querySelector('.side-link[data-view="customers"]').classList.add("active");
        openCustomerDetail(c.id);
      });
      limitList.appendChild(row);
    });
    renderLoadMoreButton(limitList, nearLimit.length, limitNearShowCount, () => {
      limitNearShowCount += PAGE_SIZE;
      renderNotifications();
    }, () => {
      limitNearShowCount = PAGE_SIZE;
      renderNotifications();
    });
  }
}

async function exportCustomerStatement() {
  const c = customersCache.find(x => x.id === activeCustomerId);
  if (!c) return;

  const btn = document.getElementById("exportStatementBtn");
  const originalLabel = btn ? btn.textContent : "";
  if (btn) { btn.disabled = true; btn.textContent = "جارٍ التجهيز..."; }

  try {
    await ensurePdfLibs();
    const balance = DB.Customers.balance(c);

    const rows = c.transactions.slice().reverse().map(t => `
      <tr>
        <td>${UI.formatDate(t.date)}</td>
        <td>${t.type === "credit" ? "كريدي جديد" : "تسديد"}</td>
        <td style="color:${t.type === "credit" ? "#B54A3F" : "#3E7D5A"}">${t.type === "credit" ? "+" : "−"}${UI.money(t.amount)}</td>
        <td>${t.note ? UI.escapeHtml(t.note) : "—"}</td>
      </tr>
    `).join("");

    const wrap = document.createElement("div");
    wrap.style.cssText = "position:fixed; top:0; left:-99999px; width:780px; background:#fff; padding:32px; direction:rtl; font-family:Tahoma, Arial, sans-serif; color:#2b2620;";
    wrap.innerHTML = `
      <div style="display:flex; align-items:center; gap:14px; border-bottom:2px solid #D4A24C; padding-bottom:16px; margin-bottom:20px;">
        ${currentShop.logoBase64 ? `<img src="${currentShop.logoBase64}" style="width:52px; height:52px; border-radius:10px; object-fit:cover;">` : ""}
        <div>
          <h1 style="font-size:1.3rem; margin:0;">${UI.escapeHtml(currentShop.shopName)}</h1>
          <div style="color:#8a8072; font-size:.85rem; margin-top:2px;">كشف حساب الزبون — ${new Date().toLocaleDateString("ar")}</div>
        </div>
      </div>
      <div style="display:flex; gap:24px; margin-bottom:22px; flex-wrap:wrap;">
        <div style="background:#faf7f0; border-radius:10px; padding:12px 18px;">الزبون<strong style="display:block; font-size:1.1rem; margin-top:4px;">${UI.escapeHtml(c.name)}</strong></div>
        <div style="background:#faf7f0; border-radius:10px; padding:12px 18px;">الهاتف<strong style="display:block; font-size:1.1rem; margin-top:4px;">${UI.escapeHtml(c.phone || "—")}</strong></div>
        <div style="background:#faf7f0; border-radius:10px; padding:12px 18px;">الرصيد المتبقي<strong style="display:block; font-size:1.1rem; margin-top:4px;">${UI.money(balance)}</strong></div>
      </div>
      <table style="width:100%; border-collapse:collapse; font-size:.9rem;">
        <thead><tr>
          <th style="padding:9px 8px; border-bottom:1px solid #eee; text-align:right; background:#faf7f0;">التاريخ</th>
          <th style="padding:9px 8px; border-bottom:1px solid #eee; text-align:right; background:#faf7f0;">نوع العملية</th>
          <th style="padding:9px 8px; border-bottom:1px solid #eee; text-align:right; background:#faf7f0;">المبلغ</th>
          <th style="padding:9px 8px; border-bottom:1px solid #eee; text-align:right; background:#faf7f0;">ملاحظة</th>
        </tr></thead>
        <tbody>${rows || `<tr><td colspan="4" style="padding:9px 8px; border-bottom:1px solid #eee;">لا توجد عمليات مسجَّلة</td></tr>`}</tbody>
      </table>
      <div style="margin-top:26px; font-size:.75rem; color:#8a8072;">تم إنشاء هذا الكشف بواسطة تطبيق دفتري</div>
    `;
    document.body.appendChild(wrap);

    const canvas = await html2canvas(wrap, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
    wrap.remove();

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const imgData = canvas.toDataURL("image/jpeg", 0.95);

    if (imgHeight <= pageHeight) {
      pdf.addImage(imgData, "JPEG", 0, 0, imgWidth, imgHeight);
    } else {

      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        position = heightLeft - imgHeight;
        pdf.addPage();
        pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }
    }

    pdf.save(`كشف-حساب-${c.name}.pdf`);
  } catch (err) {
    UI.toast("تعذّر إنشاء ملف PDF", "error");
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = originalLabel; }
  }
}

function renderAccount() {
  document.getElementById("accShopName").value = currentShop.shopName;
  document.getElementById("accOwnerName").value = currentShop.ownerName;
  document.getElementById("accEmail").value = currentShop.email;
  document.getElementById("accPhone").value = currentShop.phone;
  const logoPreview = document.getElementById("accLogoPreview");
  if (logoPreview) logoPreview.src = currentShop.logoBase64 || "icons/logo.svg";
  const status = UI.statusLabel(currentShop.status);
  document.getElementById("accStatus").innerHTML = `<span class="badge ${status.cls}">${status.text}</span>`;
  document.getElementById("accExpiry").value = currentShop.expiresAt ? UI.formatDate(currentShop.expiresAt) : "—";
}

const ACTION_LABELS = {
  add_customer: "➕ إضافة زبون",
  update_customer: "✏️ تعديل زبون",
  remove_customer: "🗑️ حذف زبون",
  add_transaction: "💳 عملية جديدة",
  remove_transaction: "🗑️ حذف عملية",
  add_employee: "👤 إضافة موظف",
  remove_employee: "🗑️ حذف موظف",
  login_new_device: "⚠️ دخول من جهاز جديد"
};

function renderActivityLog() {
  const wrap = document.getElementById("activityLogList");
  if (!wrap) return;
  if (activityLogCache.length === 0) {
    wrap.innerHTML = `<p class="hint">لا يوجد أي نشاط مسجَّل بعد.</p>`;
    return;
  }
  wrap.innerHTML = activityLogCache.map(entry => `
    <div class="notif-row">
      <div>
        <strong>${ACTION_LABELS[entry.action] || entry.action}</strong>
        <div class="notif-meta">${UI.escapeHtml(entry.details || "")}</div>
        <div class="notif-meta">${UI.escapeHtml(entry.actorName)} (${entry.actorRole === "employee" ? "موظف" : "صاحب المحل"}) · ${entry.at ? UI.formatDate(entry.at) : ""}</div>
      </div>
    </div>
  `).join("");
}

function checkNewDeviceAlerts(entries) {
  if (currentRole !== "owner") return;
  const lastSeenKey = `daftary_last_seen_device_alert_${currentShop.id}`;
  const lastSeen = Number(localStorage.getItem(lastSeenKey) || 0);
  let newest = lastSeen;
  entries.filter(e => e.action === "login_new_device").forEach(e => {
    const t = e.at ? new Date(e.at).getTime() : 0;
    if (t > lastSeen) {
      UI.toast(`⚠️ تسجيل دخول من جهاز جديد: ${e.actorName}`, "error");
    }
    if (t > newest) newest = t;
  });
  if (newest > lastSeen) localStorage.setItem(lastSeenKey, String(newest));
}

function renderEmployees() {
  const wrap = document.getElementById("employeesList");
  if (!wrap) return;
  if (employeesCache.length === 0) {
    wrap.innerHTML = `<p class="hint">لا يوجد موظفون مضافون بعد.</p>`;
    return;
  }
  wrap.innerHTML = employeesCache.map(emp => `
    <div class="notif-row" data-emp-id="${emp.id}">
      <div>
        <strong>${UI.escapeHtml(emp.name)}</strong>
        <div class="notif-meta">${UI.escapeHtml(emp.email)}</div>
      </div>
      <button class="icon-btn js-del-emp" title="حذف الموظف">🗑️</button>
    </div>
  `).join("");
  wrap.querySelectorAll(".js-del-emp").forEach(btn => {
    btn.addEventListener("click", async () => {
      const row = btn.closest("[data-emp-id]");
      const emp = employeesCache.find(x => x.id === row.dataset.empId);
      if (!emp) return;
      if (await UI.confirmAction(`هل تريد حذف حساب الموظف "${emp.name}"؟ لن يتمكن بعدها من الدخول للوحة التحكم.`)) {
        try {
          await DB.Employees.remove(emp.id);
          logActivity("remove_employee", `حذف حساب الموظف "${emp.name}"`);
          UI.toast("تم حذف حساب الموظف", "success");
        } catch (err) {
          UI.toast(UI.friendlyError(err, "تعذّر حذف حساب الموظف"), "error");
        }
      }
    });
  });
}

function setProductImagePreview(base64) {
  const img = document.getElementById("productImagePreview");
  const placeholder = document.getElementById("productImagePlaceholder");
  if (base64) {
    img.src = base64;
    img.style.display = "block";
    placeholder.style.display = "none";
  } else {
    img.src = "";
    img.style.display = "none";
    placeholder.style.display = "flex";
  }
}

function openProductModal(product = null) {
  editingProductId = product ? product.id : null;
  productImageBase64 = product ? product.imageBase64 : null;
  document.getElementById("productForm").reset();
  document.getElementById("productModalTitle").textContent = product ? "تعديل السلعة" : "إضافة سلعة جديدة";
  document.getElementById("productId").value = product ? product.id : "";
  document.getElementById("productName").value = product ? product.name : "";
  document.getElementById("productPrice").value = product ? product.price : "";
  document.getElementById("productNote").value = product ? product.note : "";
  setProductImagePreview(productImageBase64);
  const priceField = document.getElementById("productPrice");
  const lockPrice = currentRole === "employee" && !!product;
  priceField.disabled = lockPrice;
  priceField.title = lockPrice ? "لا تملك صلاحية تعديل السعر" : "";
  UI.openModal("productModal");
}

async function onSaveProduct(e) {
  e.preventDefault();
  const id = document.getElementById("productId").value;
  const name = document.getElementById("productName").value.trim();
  const priceRaw = document.getElementById("productPrice").value.trim();
  const note = document.getElementById("productNote").value.trim();
  let price = Number(priceRaw);

  if (id && currentRole === "employee") {
    const original = productsCache.find(p => p.id === id);
    if (original) price = original.price;
  }

  if (!name) {
    UI.toast("يرجى إدخال اسم السلعة", "error");
    return;
  }
  if (priceRaw === "" || isNaN(price) || price < 0) {
    UI.toast("يرجى إدخال سعر صحيح", "error");
    return;
  }

  const submitBtn = e.target.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  try {
    if (id) {
      await DB.Products.update(currentShop.id, { id, name, price, imageBase64: productImageBase64, note });
      logActivity("update_product", `تعديل السلعة "${name}"`);
      UI.toast("تم تحديث السلعة", "success");
    } else {
      const actorName = currentRole === "employee" ? (currentEmployeeName || "موظف") : (currentShop.ownerName || "صاحب المحل");
      await DB.Products.add(currentShop.id, {
        name, price, imageBase64: productImageBase64, note,
        addedByName: actorName, addedByRole: currentRole
      });
      logActivity("add_product", `إضافة سلعة جديدة "${name}"`);
      UI.toast("تمت إضافة السلعة", "success");
    }
    UI.closeModal("productModal");
  } catch (err) {
    UI.toast(UI.friendlyError(err, "تعذّر حفظ السلعة"), "error");
  } finally {
    submitBtn.disabled = false;
  }
}

async function onDeleteProduct(product) {
  if (!(await UI.confirmAction(`هل تريد حذف السلعة "${product.name}"؟`))) return;
  try {
    await DB.Products.remove(currentShop.id, product.id);
    logActivity("delete_product", `حذف السلعة "${product.name}"`);
    UI.toast("تم حذف السلعة", "success");
  } catch (err) {
    UI.toast(UI.friendlyError(err, "تعذّر حذف السلعة"), "error");
  }
}

function renderProducts() {
  const grid = document.getElementById("productsGrid");
  const empty = document.getElementById("emptyProducts");
  if (!grid) return;

  const q = (document.getElementById("productSearchInput")?.value || "").trim().toLowerCase();
  const list = q ? productsCache.filter(p => p.name.toLowerCase().includes(q)) : productsCache;

  if (productsCache.length === 0) {
    grid.innerHTML = "";
    grid.style.display = "none";
    empty.style.display = "block";
    return;
  }
  grid.style.display = "grid";
  empty.style.display = "none";

  if (list.length === 0) {
    grid.innerHTML = `<p class="hint" style="grid-column:1/-1;">لا توجد نتائج مطابقة للبحث.</p>`;
    return;
  }

  grid.innerHTML = list.map(p => `
    <div class="product-card" data-product-id="${p.id}">
      <div class="product-card-img">
        ${p.imageBase64 ? `<img src="${p.imageBase64}" alt="${UI.escapeHtml(p.name)}">` : `<span class="product-card-noimg">🛒</span>`}
      </div>
      <div class="product-card-body">
        <h4>${UI.escapeHtml(p.name)}</h4>
        <div class="product-card-price">${UI.money(p.price)}</div>
        ${p.note ? `<p class="product-card-note">${UI.escapeHtml(p.note)}</p>` : ""}
        <div class="product-card-meta">أضافها: ${UI.escapeHtml(p.addedByName || "—")}</div>
      </div>
      <div class="product-card-actions">
        <button class="icon-btn js-edit-product" title="تعديل">✏️</button>
        <button class="icon-btn js-del-product" title="حذف">🗑️</button>
      </div>
    </div>
  `).join("");

  grid.querySelectorAll(".js-edit-product").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.closest("[data-product-id]").dataset.productId;
      const product = productsCache.find(x => x.id === id);
      if (product) openProductModal(product);
    });
  });
  grid.querySelectorAll(".js-del-product").forEach(btn => {
    btn.addEventListener("click", () => {
      const id = btn.closest("[data-product-id]").dataset.productId;
      const product = productsCache.find(x => x.id === id);
      if (product) onDeleteProduct(product);
    });
  });
}

function buildSalesLogEntries() {
  const entries = [];
  customersCache.forEach(c => {
    c.transactions.forEach(t => {
      entries.push({
        customerId: c.id,
        customerName: c.name,
        type: t.type,
        amount: t.amount,
        note: t.note || "",
        date: t.date,
        addedByName: t.addedByName || "",
        addedByRole: t.addedByRole || "owner",
        productId: t.productId || null
      });
    });
  });
  entries.sort((a, b) => new Date(b.date) - new Date(a.date));
  return entries;
}

function renderSalesLog() {
  const tbody = document.getElementById("salesLogTbody");
  const emptyBox = document.getElementById("emptySalesLog");
  const table = document.getElementById("salesLogTable");
  if (!tbody) return;

  const q = (document.getElementById("salesLogSearchInput")?.value || "").trim().toLowerCase();
  const typeFilter = document.getElementById("salesLogFilterSelect")?.value || "all";

  let entries = buildSalesLogEntries();

  const todayStr = new Date().toDateString();
  const todayEntries = entries.filter(e => new Date(e.date).toDateString() === todayStr);
  const todayCredit = todayEntries.filter(e => e.type === "credit").reduce((s, e) => s + e.amount, 0);
  const todayPaid = todayEntries.filter(e => e.type === "payment").reduce((s, e) => s + e.amount, 0);
  const creditEl = document.getElementById("slTodayCredit");
  const paidEl = document.getElementById("slTodayPaid");
  if (creditEl) creditEl.textContent = UI.money(todayCredit);
  if (paidEl) paidEl.textContent = UI.money(todayPaid);

  if (typeFilter !== "all") entries = entries.filter(e => e.type === typeFilter);
  if (q) {
    entries = entries.filter(e =>
      e.customerName.toLowerCase().includes(q) ||
      e.note.toLowerCase().includes(q)
    );
  }

  tbody.innerHTML = "";

  if (entries.length === 0) {
    emptyBox.style.display = "block";
    table.style.display = "none";
  } else {
    emptyBox.style.display = "none";
    table.style.display = "table";
    entries.slice(0, salesLogShowCount).forEach(en => {
      const tr = document.createElement("tr");
      const isCredit = en.type === "credit";
      const product = en.productId ? productsCache.find(p => p.id === en.productId) : null;
      const noteHtml = product && product.imageBase64
        ? `<div style="display:flex;align-items:center;gap:8px;">
             <img src="${product.imageBase64}" alt="${UI.escapeHtml(product.name)}" style="width:28px;height:28px;border-radius:6px;object-fit:cover;flex-shrink:0;">
             <span class="sl-note-cell">${en.note ? UI.escapeHtml(en.note) : "—"}</span>
           </div>`
        : `<span class="sl-note-cell">${en.note ? UI.escapeHtml(en.note) : "—"}</span>`;
      tr.innerHTML = `
        <td>
          <div class="customer-name-cell">
            <div class="avatar-sm">${UI.escapeHtml(UI.initials(en.customerName))}</div>
            <div style="font-weight:700;">${UI.escapeHtml(en.customerName)}</div>
          </div>
        </td>
        <td class="col-sl-note">${noteHtml}</td>
        <td class="col-sl-type"><span class="tx-type-badge ${isCredit ? "badge-red" : "badge-green"}">${isCredit ? "🔴 كريدي" : "🟢 تسديد"}</span></td>
        <td><span class="balance ${isCredit ? "due" : "clear"}">${isCredit ? "+" : "−"}${UI.money(en.amount)}</span></td>
        <td class="col-sl-by" style="font-size:.82rem;color:#7a8580;">${UI.escapeHtml(en.addedByName || "—")}</td>
        <td class="col-date" style="font-size:.8rem;color:#7a8580;">${UI.formatDate(en.date)}</td>
      `;
      tr.addEventListener("click", () => openCustomerDetail(en.customerId));
      tbody.appendChild(tr);
    });
  }

  const tableCard = table?.closest(".table-card");
  document.getElementById("salesLogLoadMore")?.remove();
  if (tableCard) {
    const holder = document.createElement("div");
    holder.id = "salesLogLoadMore";
    renderLoadMoreButton(holder, entries.length, salesLogShowCount, () => {
      salesLogShowCount += PAGE_SIZE;
      renderSalesLog();
    }, () => {
      salesLogShowCount = PAGE_SIZE;
      renderSalesLog();
    });
    tableCard.appendChild(holder);
  }
}
