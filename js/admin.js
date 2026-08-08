
let allShopsCache = [];
let unsubShops = null;

const PAGE_SIZE = 15;
let pendingShowCount = PAGE_SIZE;
let activeShowCount = PAGE_SIZE;
let allShowCount = PAGE_SIZE;

const ICON_TRASH = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>`;
const ICON_EXTEND = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M12 19V5"/><path d="m5 12 7-7 7 7"/></svg>`;
const ICON_SUSPEND = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><circle cx="12" cy="12" r="9"/><path d="m4.9 4.9 14.2 14.2"/></svg>`;
const ICON_CHEVRON_DOWN = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="m6 9 6 6 6-6"/></svg>`;
const ICON_CHEVRON_UP = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" width="15" height="15"><path d="m18 15-6-6-6 6"/></svg>`;

function renderLoadMoreButton(container, totalCount, shownCount, onLoadMore, onShowLess) {
  if (shownCount >= totalCount && shownCount <= PAGE_SIZE) return;
  const wrap = document.createElement("div");
  wrap.className = "load-more-wrap";
  if (shownCount < totalCount) {
    const btn = document.createElement("button");
    btn.className = "btn-load-more";
    btn.innerHTML = `${ICON_CHEVRON_DOWN} عرض المزيد <span class="lm-count">${totalCount - shownCount}</span>`;
    btn.addEventListener("click", onLoadMore);
    wrap.appendChild(btn);
  }
  if (shownCount > PAGE_SIZE && onShowLess) {
    const lessBtn = document.createElement("button");
    lessBtn.className = "btn-load-more less";
    lessBtn.innerHTML = `${ICON_CHEVRON_UP} عرض أقل`;
    lessBtn.addEventListener("click", onShowLess);
    wrap.appendChild(lessBtn);
  }
  container.appendChild(wrap);
}

document.addEventListener("DOMContentLoaded", () => {
  DB.Session.onChange(async (user) => {
    if (!user) { location.href = "index.html#login"; return; }
    const isAdmin = await DB.Session.isAdmin(user.uid);
    if (!isAdmin) {
      UI.toast("هذا الحساب غير مصرَّح له بدخول لوحة الإدارة", "error");
      await DB.Session.signOut();
      setTimeout(() => location.href = "index.html#login", 700);
      return;
    }

    bindNav();
    bindEvents();

    unsubShops = DB.Shops.watchAll((shops) => {
      allShopsCache = shops.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      renderAll();
    });
  });
});

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
      showView(link.dataset.view);
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
  ["pending", "active", "all"].forEach(v => {
    document.getElementById("view-" + v).style.display = "none";
  });
  const titles = { pending: "طلبات بانتظار الموافقة", active: "الحسابات المفعّلة", all: "جميع المحلات" };
  document.getElementById("view-" + view).style.display = "block";
  document.getElementById("topbarTitle").textContent = titles[view];
  if (view === "pending") { pendingShowCount = PAGE_SIZE; renderPending(); }
  if (view === "active") { activeShowCount = PAGE_SIZE; renderActiveTable(); }
  if (view === "all") { allShowCount = PAGE_SIZE; renderAllShopsTable(); }
}

function bindEvents() {
  document.getElementById("logoutBtn").addEventListener("click", async () => {
    if (!(await UI.confirmAction("هل أنت متأكد من تسجيل الخروج؟", { okLabel: "تسجيل الخروج", cancelLabel: "إلغاء" }))) return;
    if (unsubShops) unsubShops();
    await DB.Session.signOut();
    location.href = "index.html";
  });

  document.getElementById("approveForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("approveShopId").value;
    const days = parseInt(document.getElementById("durationDays").value, 10);
    await DB.Shops.approve(id, days);
    UI.closeModal("approveModal");
    UI.toast("تم تفعيل الحساب بنجاح ✅", "success");
  });

  document.getElementById("extendForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const id = document.getElementById("extendShopId").value;
    const days = parseInt(document.getElementById("extendDays").value, 10);
    await DB.Shops.extend(id, days);
    UI.closeModal("extendModal");
    UI.toast("تم تمديد الاشتراك بنجاح ✅", "success");
  });

  document.getElementById("searchAllInput")?.addEventListener("input", () => { allShowCount = PAGE_SIZE; renderAllShopsTable(); });
  document.getElementById("searchPendingInput")?.addEventListener("input", () => { pendingShowCount = PAGE_SIZE; renderPending(); });
  document.getElementById("searchActiveInput")?.addEventListener("input", () => { activeShowCount = PAGE_SIZE; renderActiveTable(); });
}

function renderAll() {
  renderStatsBar();
  renderPending();
  renderActiveTable();
  renderAllShopsTable();
}

function renderStatsBar() {
  const shops = allShopsCache;
  document.getElementById("statPending").textContent = shops.filter(s => s.status === "pending").length;
  document.getElementById("statActive").textContent = shops.filter(s => s.status === "active").length;
  document.getElementById("statExpired").textContent = shops.filter(s => s.status === "expired").length;
  document.getElementById("statTotal").textContent = shops.length;
  const pendingCount = shops.filter(s => s.status === "pending").length;
  document.getElementById("pendingCountBadge").textContent = pendingCount > 0 ? pendingCount : "";
}

function renderPending() {
  const query = (document.getElementById("searchPendingInput")?.value || "").trim().toLowerCase();
  let shops = allShopsCache.filter(s => s.status === "pending")
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  if (query) {
    shops = shops.filter(s =>
      s.shopName.toLowerCase().includes(query) ||
      s.ownerName.toLowerCase().includes(query) ||
      s.email.toLowerCase().includes(query));
  }
  const list = document.getElementById("pendingList");
  const empty = document.getElementById("emptyPending");
  list.innerHTML = "";

  if (shops.length === 0) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  shops.slice(0, pendingShowCount).forEach(shop => {
    const card = document.createElement("div");
    card.className = "pending-card";
    card.innerHTML = `
      <div class="pending-info">
        <strong>${UI.escapeHtml(shop.shopName)}</strong>
        <span>👤 ${UI.escapeHtml(shop.ownerName)} &nbsp;·&nbsp; 📧 ${UI.escapeHtml(shop.email)} &nbsp;·&nbsp; 📞 ${UI.escapeHtml(shop.phone)}</span><br>
        <span>🗓️ طلب بتاريخ ${shop.createdAt ? UI.formatDate(shop.createdAt) : "—"}</span>
      </div>
      <div class="pending-actions">
        <button class="btn btn-primary btn-sm js-approve">✅ موافقة وتفعيل</button>
        <button class="btn btn-danger btn-sm js-reject">✕ رفض</button>
      </div>
    `;
    card.querySelector(".js-approve").addEventListener("click", () => {
      document.getElementById("approveShopId").value = shop.id;
      document.getElementById("approveShopLabel").textContent = `تفعيل حساب: ${shop.shopName} (${shop.email})`;
      UI.openModal("approveModal");
    });
    card.querySelector(".js-reject").addEventListener("click", async () => {
      if (await UI.confirmAction(`هل أنت متأكد من رفض طلب "${shop.shopName}"؟`)) {
        await DB.Shops.reject(shop.id);
        UI.toast("تم رفض الطلب", "success");
      }
    });
    list.appendChild(card);
  });
  renderLoadMoreButton(list, shops.length, pendingShowCount, () => {
    pendingShowCount += PAGE_SIZE;
    renderPending();
  }, () => {
    pendingShowCount = PAGE_SIZE;
    renderPending();
  });
}

async function renderActiveTable() {
  const query = (document.getElementById("searchActiveInput")?.value || "").trim().toLowerCase();
  let shops = allShopsCache.filter(s => s.status === "active")
    .sort((a, b) => new Date(a.expiresAt) - new Date(b.expiresAt));
  if (query) {
    shops = shops.filter(s => s.shopName.toLowerCase().includes(query) || s.email.toLowerCase().includes(query));
  }
  const tbody = document.getElementById("activeTbody");
  const empty = document.getElementById("emptyActive");
  tbody.innerHTML = "";

  if (shops.length === 0) {
    empty.style.display = "block";
    return;
  }
  empty.style.display = "none";

  for (const shop of shops.slice(0, activeShowCount)) {
    let totals = { totalDue: 0 };
    try {
      const customersSnap = await DB.Customers.col(shop.id).get();
      const customers = customersSnap.docs.map(d => {
        const data = d.data();
        return { transactions: data.transactions || [] };
      });
      totals = DB.Customers.shopTotals(customers);
    } catch (err) {
      console.error("تعذّر جلب بيانات زبائن المحل", shop.id, err);
    }
    const daysLeft = UI.daysLeft(shop.expiresAt);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <div class="customer-name-cell">
          <div class="avatar-sm">${UI.escapeHtml((shop.shopName || "؟").trim().slice(0,2))}</div>
          <div>
            <strong>${UI.escapeHtml(shop.shopName)}</strong><br>
            <span style="font-size:.76rem;color:#8a8072;">${UI.escapeHtml(shop.ownerName)}</span>
            <div class="col-email-inline">${UI.escapeHtml(shop.email)}</div>
          </div>
        </div>
      </td>
      <td class="col-email">${UI.escapeHtml(shop.email)}</td>
      <td class="col-expiry">
        <div class="expiry-date">${UI.formatDate(shop.expiresAt)}</div>
        <span class="badge ${daysLeft <= 3 ? "badge-red" : "badge-green"}">${daysLeft >= 0 ? "باقي " + daysLeft + " يوم" : "منتهي"}</span>
      </td>
      <td><span class="balance ${totals.totalDue > 0 ? "due" : "clear"}">${UI.money(totals.totalDue)}</span></td>
      <td>
        <div class="row-actions">
          <button class="icon-btn icon-btn-primary js-extend" title="تمديد">${ICON_EXTEND}</button>
          <button class="icon-btn icon-btn-danger js-suspend" title="إلغاء التفعيل">${ICON_SUSPEND}</button>
        </div>
      </td>
    `;
    tr.querySelector(".js-extend").addEventListener("click", () => {
      document.getElementById("extendShopId").value = shop.id;
      UI.openModal("extendModal");
    });
    tr.querySelector(".js-suspend").addEventListener("click", async () => {
      if (await UI.confirmAction(`هل تريد إلغاء تفعيل حساب "${shop.shopName}" الآن؟`)) {
        await DB.Shops.suspend(shop.id);
        UI.toast("تم إلغاء تفعيل الحساب", "success");
      }
    });
    tbody.appendChild(tr);
  }
  const activeTableCard = tbody.closest(".table-card");
  document.getElementById("activeLoadMore")?.remove();
  if (activeTableCard) {
    const holder = document.createElement("div");
    holder.id = "activeLoadMore";
    renderLoadMoreButton(holder, shops.length, activeShowCount, () => {
      activeShowCount += PAGE_SIZE;
      renderActiveTable();
    }, () => {
      activeShowCount = PAGE_SIZE;
      renderActiveTable();
    });
    activeTableCard.appendChild(holder);
  }
}

function renderAllShopsTable() {
  const query = (document.getElementById("searchAllInput")?.value || "").trim().toLowerCase();
  let shops = allShopsCache;
  if (query) {
    shops = shops.filter(s => s.shopName.toLowerCase().includes(query) || s.email.toLowerCase().includes(query));
  }

  const tbody = document.getElementById("allTbody");
  tbody.innerHTML = "";
  shops.slice(0, allShowCount).forEach(shop => {
    const status = UI.statusLabel(shop.status);
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <div class="customer-name-cell">
          <div class="avatar-sm">${UI.escapeHtml((shop.shopName || "؟").trim().slice(0,2))}</div>
          <div>
            <strong>${UI.escapeHtml(shop.shopName)}</strong><br>
            <span style="font-size:.76rem;color:#8a8072;">${UI.escapeHtml(shop.ownerName)}</span>
            <div class="col-email-inline">${UI.escapeHtml(shop.email)}</div>
          </div>
        </div>
      </td>
      <td class="col-email">${UI.escapeHtml(shop.email)}</td>
      <td class="col-status"><span class="badge ${status.cls}">${status.text}</span></td>
      <td>
        <div class="row-actions">
          <button class="icon-btn icon-btn-danger js-delete" title="حذف الحساب نهائياً">${ICON_TRASH}</button>
        </div>
      </td>
    `;
    tr.querySelector(".js-delete").addEventListener("click", async () => {
      if (await UI.confirmAction(`حذف حساب "${shop.shopName}" نهائياً مع كل بيانات زبائنه؟ هذا الإجراء لا يمكن التراجع عنه. (يُفضّل أيضاً حذف مستخدم الدخول الخاص به من Firebase Console)`)) {
        await DB.Shops.remove(shop.id);
        UI.toast("تم حذف الحساب نهائياً", "success");
      }
    });
    tbody.appendChild(tr);
  });
  const allTableCard = tbody.closest(".table-card");
  document.getElementById("allLoadMore")?.remove();
  if (allTableCard) {
    const holder = document.createElement("div");
    holder.id = "allLoadMore";
    renderLoadMoreButton(holder, shops.length, allShowCount, () => {
      allShowCount += PAGE_SIZE;
      renderAllShopsTable();
    }, () => {
      allShowCount = PAGE_SIZE;
      renderAllShopsTable();
    });
    allTableCard.appendChild(holder);
  }
}
