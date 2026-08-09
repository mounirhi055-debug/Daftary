
const auth = firebase.auth();
const fs = firebase.firestore();

const secondaryApp = firebase.initializeApp(firebaseConfig, "Secondary");
const secondaryAuth = secondaryApp.auth();

fs.enablePersistence({ synchronizeTabs: true }).catch((err) => {
  console.warn("Firestore persistence not enabled:", err.code);
});

const DB = (() => {
  const FieldValue = firebase.firestore.FieldValue;

  function uid(prefix = "id") {
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  }

  const LoginGuard = (() => {
    const STORAGE_KEY = "daftary_login_guard";
    const MAX_ATTEMPTS = 5;
    const LOCK_MINUTES = 5;

    function readAll() {
      try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {}; }
      catch (e) { return {}; }
    }
    function writeAll(data) {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); }
      catch (e) {  }
    }
    function key(email) { return (email || "").trim().toLowerCase(); }

    return {

      assertNotLocked(email) {
        const all = readAll();
        const entry = all[key(email)];
        if (entry && entry.lockUntil && entry.lockUntil > Date.now()) {
          const minutesLeft = Math.ceil((entry.lockUntil - Date.now()) / 60000);
          throw new Error(`تم حظر تسجيل الدخول مؤقتاً بسبب محاولات فاشلة متكررة، حاول بعد ${minutesLeft} ${minutesLeft === 1 ? "دقيقة" : "دقائق"}`);
        }
      },
      recordFailure(email) {
        const all = readAll();
        const k = key(email);
        const entry = all[k] || { count: 0, lockUntil: 0 };
        entry.count += 1;
        if (entry.count >= MAX_ATTEMPTS) {
          entry.lockUntil = Date.now() + LOCK_MINUTES * 60000;
          entry.count = 0;
        }
        all[k] = entry;
        writeAll(all);
      },
      recordSuccess(email) {
        const all = readAll();
        delete all[key(email)];
        writeAll(all);
      }
    };
  })();

  function tsToIso(ts) {
    if (!ts) return null;
    if (typeof ts === "string") return ts;
    if (ts.toDate) return ts.toDate().toISOString();
    return new Date(ts).toISOString();
  }

  function shopFromDoc(docSnap) {
    if (!docSnap.exists) return null;
    const d = docSnap.data();
    return {
      id: docSnap.id,
      shopName: d.shopName,
      ownerName: d.ownerName,
      email: d.email,
      phone: d.phone,
      status: d.status,
      createdAt: tsToIso(d.createdAt),
      activatedAt: tsToIso(d.activatedAt),
      expiresAt: tsToIso(d.expiresAt),
      durationDays: d.durationDays || null,
      logoBase64: d.logoBase64 || null
    };
  }

  function customerFromDoc(docSnap) {
    const d = docSnap.data();
    return {
      id: docSnap.id,
      shopId: d.shopId,
      name: d.name,
      phone: d.phone || "",
      note: d.note || "",
      creditLimit: d.creditLimit ?? null,
      reminderDate: d.reminderDate || null,
      createdAt: tsToIso(d.createdAt),
      transactions: (d.transactions || []).slice().sort((a, b) => new Date(b.date) - new Date(a.date))
    };
  }

  function productFromDoc(docSnap) {
    const d = docSnap.data();
    return {
      id: docSnap.id,
      shopId: d.shopId,
      name: d.name,
      price: d.price,
      imageBase64: d.imageBase64 || null,
      note: d.note || "",
      addedByName: d.addedByName || "",
      addedByRole: d.addedByRole || "owner",
      createdAt: tsToIso(d.createdAt)
    };
  }

  function employeeFromDoc(docSnap) {
    if (!docSnap.exists) return null;
    const d = docSnap.data();
    return {
      id: docSnap.id,
      shopId: d.shopId,
      name: d.name,
      email: d.email,
      createdAt: tsToIso(d.createdAt)
    };
  }

  const Shops = {

    async checkExists({ shopName, ownerName, email }) {
      const result = { emailTaken: false, shopNameTaken: false, ownerNameTaken: false };
      const normalize = (s) => (s || "").trim().toLowerCase();
      const emailN = normalize(email), shopN = normalize(shopName), ownerN = normalize(ownerName);

      const snap = await fs.collection("shop_registry").get();
      snap.docs.forEach((docSnap) => {
        const d = docSnap.data();
        if (emailN && d.emailLower === emailN) result.emailTaken = true;
        if (shopN && d.shopNameLower === shopN) result.shopNameTaken = true;
        if (ownerN && d.ownerNameLower === ownerN) result.ownerNameTaken = true;
      });
      return result;
    },

    async register({ shopName, ownerName, email, phone, password }) {
      let cred;
      try {
        cred = await auth.createUserWithEmailAndPassword(email, password);
      } catch (err) {
        throw new Error(mapAuthError(err));
      }
      await fs.collection("shops").doc(cred.user.uid).set({
        shopName, ownerName, email, phone,
        status: "pending",
        createdAt: FieldValue.serverTimestamp(),
        activatedAt: null,
        expiresAt: null,
        durationDays: null
      });

      await fs.collection("shop_registry").doc(cred.user.uid).set({
        shopNameLower: (shopName || "").trim().toLowerCase(),
        ownerNameLower: (ownerName || "").trim().toLowerCase(),
        emailLower: (email || "").trim().toLowerCase()
      });
      return cred.user.uid;
    },

    async login(email, password) {
      let cred;
      try {
        cred = await auth.signInWithEmailAndPassword(email, password);
      } catch (err) {
        throw new Error(mapAuthError(err));
      }
      const docSnap = await fs.collection("shops").doc(cred.user.uid).get();
      const shop = shopFromDoc(docSnap);
      if (!shop) throw new Error("لا يوجد حساب محل مرتبط بهذا المستخدم");
      if (shop.status === "pending") throw new Error("الحساب بانتظار موافقة الإدارة");
      if (shop.status === "rejected") throw new Error("تم رفض طلب تفعيل هذا الحساب");
      if (shop.status === "expired" && shop.expiresAt && new Date(shop.expiresAt) < new Date()) {
        throw new Error("انتهت مدة تفعيل الحساب، يرجى التواصل مع الإدارة لتجديده");
      }
      return shop;
    },

    async getProfile(shopId) {
      const docSnap = await fs.collection("shops").doc(shopId).get();
      return shopFromDoc(docSnap);
    },

    watchProfile(shopId, cb) {
      return fs.collection("shops").doc(shopId).onSnapshot((docSnap) => {
        cb(shopFromDoc(docSnap));
      });
    },

    watchPending(cb) {
      return fs.collection("shops").where("status", "==", "pending")
        .onSnapshot((qs) => cb(qs.docs.map(shopFromDoc)));
    },
    watchActive(cb) {
      return fs.collection("shops").where("status", "==", "active")
        .onSnapshot((qs) => cb(qs.docs.map(shopFromDoc)));
    },
    watchAll(cb) {
      return fs.collection("shops").onSnapshot((qs) => cb(qs.docs.map(shopFromDoc)));
    },

    async approve(id, durationDays) {
      const now = new Date();
      const expires = new Date(now.getTime() + durationDays * 24 * 60 * 60 * 1000);
      await fs.collection("shops").doc(id).update({
        status: "active",
        activatedAt: FieldValue.serverTimestamp(),
        expiresAt: firebase.firestore.Timestamp.fromDate(expires),
        durationDays
      });
    },
    async reject(id) {
      await fs.collection("shops").doc(id).update({ status: "rejected" });
    },
    async extend(id, extraDays) {
      const docSnap = await fs.collection("shops").doc(id).get();
      const shop = shopFromDoc(docSnap);
      const base = shop.expiresAt && new Date(shop.expiresAt) > new Date() ? new Date(shop.expiresAt) : new Date();
      const expires = new Date(base.getTime() + extraDays * 24 * 60 * 60 * 1000);
      await fs.collection("shops").doc(id).update({
        status: "active",
        expiresAt: firebase.firestore.Timestamp.fromDate(expires)
      });
    },
    async suspend(id) {
      await fs.collection("shops").doc(id).update({ status: "expired" });
    },
    async remove(id) {

      await fs.collection("shops").doc(id).delete();
    },

    async updateLogo(id, logoBase64) {
      await fs.collection("shops").doc(id).update({ logoBase64: logoBase64 || null });
    },

    async updateProfile(id, { shopName, ownerName, phone }) {
      await fs.collection("shops").doc(id).update({ shopName, ownerName, phone });
    }
  };

  const Customers = {
    col(shopId) { return fs.collection("shops").doc(shopId).collection("customers"); },

    watchByShop(shopId, cb) {
      return this.col(shopId).orderBy("createdAt", "desc").onSnapshot((qs) => {
        cb(qs.docs.map(customerFromDoc));
      });
    },

    async findById(shopId, customerId) {
      const docSnap = await this.col(shopId).doc(customerId).get();
      return docSnap.exists ? customerFromDoc(docSnap) : null;
    },

    async checkDuplicate(shopId, { name, phone, excludeId }) {
      const normalize = (s) => (s || "").trim().toLowerCase();
      const nameN = normalize(name), phoneN = normalize(phone);
      const snap = await this.col(shopId).get();
      const result = { nameTaken: false, phoneTaken: false };
      snap.docs.forEach((docSnap) => {
        if (excludeId && docSnap.id === excludeId) return;
        const d = docSnap.data();
        if (nameN && normalize(d.name) === nameN) result.nameTaken = true;
        if (phoneN && normalize(d.phone) === phoneN) result.phoneTaken = true;
      });
      return result;
    },

    async add(shopId, { name, phone, note, creditLimit }) {
      const ref = await this.col(shopId).add({
        shopId, name, phone: phone || "", note: note || "",
        creditLimit: (creditLimit === "" || creditLimit == null || isNaN(creditLimit)) ? null : Number(creditLimit),
        createdAt: FieldValue.serverTimestamp(),
        transactions: []
      });
      return ref.id;
    },

    async update(shopId, customer) {
      await this.col(shopId).doc(customer.id).update({
        name: customer.name,
        phone: customer.phone || "",
        note: customer.note || "",
        creditLimit: customer.creditLimit ?? null
      });
    },

    async setReminder(shopId, customerId, reminderDate) {
      await this.col(shopId).doc(customerId).update({ reminderDate: reminderDate || null });
    },

    async remove(shopId, customerId) {
      await this.col(shopId).doc(customerId).delete();
    },

    async addTransaction(shopId, customerId, { type, amount, note, addedByName, addedByRole, productId, items }) {
      // items: optional array of { productId, name, price, qty } يوثّق تفاصيل السلع المشتراة
      // للعرض فقط (إيصال/سجل) — المبلغ الفعلي المحفوظ يُؤخذ دائماً من `amount` كما
      // أرسلته الواجهة، حتى لو عدّله المستخدم يدوياً ليختلف عن مجموع السلع
      // (مثال: بيع نصف كمية السلعة بسعر أقل من سعرها الكامل).
      const cleanItems = Array.isArray(items) && items.length
        ? items.map(it => ({
            productId: it.productId || null,
            name: it.name || "",
            price: Number(it.price) || 0,
            qty: Number(it.qty) || 1
          }))
        : null;
      const total = Number(amount) || 0;

      const tx = {
        id: uid("tx"),
        type, amount: total,
        note: note || "",
        date: new Date().toISOString(),
        addedByName: addedByName || "",
        addedByRole: addedByRole || "owner",
        productId: productId || null,
        items: cleanItems
      };
      await this.col(shopId).doc(customerId).update({
        transactions: FieldValue.arrayUnion(tx)
      });
      return { ok: true };
    },

    async removeTransaction(shopId, customerId, tx) {
      // نفس أسلوب arrayUnion في الإضافة: عملية ذرّية تُحفظ بالطابور تلقائياً
      // لو الجهاز أوفلاين، وتندمج بأمان مع أي تعديلات أخرى عند عودة الاتصال —
      // بدل runTransaction التي تحتاج اتصالاً حياً وقت التنفيذ.
      await this.col(shopId).doc(customerId).update({
        transactions: FieldValue.arrayRemove(tx)
      });
    },

    balance(customer) {
      return customer.transactions.reduce((sum, t) => sum + (t.type === "credit" ? t.amount : -t.amount), 0);
    },

    trustScore(customer) {
      const txs = customer.transactions || [];
      const totalCredit = txs.filter(t => t.type === "credit").reduce((s, t) => s + t.amount, 0);
      const totalPaid = txs.filter(t => t.type === "payment").reduce((s, t) => s + t.amount, 0);
      const balance = totalCredit - totalPaid;

      if (totalCredit === 0) return { score: 100, level: "trusted" };

      let score = Math.min(70, (totalPaid / totalCredit) * 70);

      if (customer.creditLimit != null && customer.creditLimit > 0) {
        const ratio = balance / customer.creditLimit;
        if (ratio > 1) score -= 20;
        else if (ratio > 0.8) score -= 10;
      }

      const sorted = txs.slice().sort((a, b) => new Date(b.date) - new Date(a.date));
      const lastTx = sorted[0];
      if (lastTx) {
        const daysSince = (Date.now() - new Date(lastTx.date).getTime()) / 86400000;
        if (balance > 0 && daysSince > 30) score -= 15;
        else if (lastTx.type === "payment" && daysSince < 14) score += 10;
      }

      score = Math.max(0, Math.min(100, Math.round(score)));
      const level = score >= 70 ? "trusted" : score >= 40 ? "medium" : "risky";
      return { score, level };
    },

    shopTotals(customers) {
      let totalDue = 0, totalCredit = 0, totalPaid = 0;
      customers.forEach((c) => {
        c.transactions.forEach((t) => {
          if (t.type === "credit") totalCredit += t.amount;
          else totalPaid += t.amount;
        });
      });
      totalDue = totalCredit - totalPaid;
      return { totalDue, totalCredit, totalPaid, customersCount: customers.length };
    }
  };

  const Products = {
    col(shopId) { return fs.collection("shops").doc(shopId).collection("products"); },

    watchByShop(shopId, cb) {
      return this.col(shopId).orderBy("createdAt", "desc").onSnapshot((qs) => cb(qs.docs.map(productFromDoc)));
    },

    async add(shopId, { name, price, imageBase64, note, addedByName, addedByRole }) {
      const ref = await this.col(shopId).add({
        shopId, name, price: Number(price),
        imageBase64: imageBase64 || null,
        note: note || "",
        addedByName: addedByName || "",
        addedByRole: addedByRole || "owner",
        createdAt: FieldValue.serverTimestamp()
      });
      return ref.id;
    },

    async update(shopId, product) {
      await this.col(shopId).doc(product.id).update({
        name: product.name,
        price: Number(product.price),
        imageBase64: product.imageBase64 || null,
        note: product.note || ""
      });
    },

    async remove(shopId, productId) {
      await this.col(shopId).doc(productId).delete();
    }
  };

  const Employees = {
    watchByShop(shopId, cb) {
      return fs.collection("employees").where("shopId", "==", shopId)
        .onSnapshot((qs) => cb(qs.docs.map(employeeFromDoc)));
    },
    async getProfile(uid) {
      const docSnap = await fs.collection("employees").doc(uid).get();
      return employeeFromDoc(docSnap);
    },

    async add(shopId, { name, email, password }) {
      let cred;
      try {
        cred = await secondaryAuth.createUserWithEmailAndPassword(email, password);
      } catch (err) {
        throw new Error(mapAuthError(err));
      }
      const uidNew = cred.user.uid;
      await fs.collection("employees").doc(uidNew).set({
        shopId, name, email,
        createdAt: FieldValue.serverTimestamp()
      });
      await secondaryAuth.signOut();
      return uidNew;
    },

    async remove(uid) {
      await fs.collection("employees").doc(uid).delete();
    }
  };

  const ActivityLog = {
    col(shopId) { return fs.collection("shops").doc(shopId).collection("activity_log"); },

    async log(shopId, { action, actorName, actorRole, details }) {
      try {
        await this.col(shopId).add({
          action,
          actorName: actorName || "غير معروف",
          actorRole: actorRole || "owner",
          details: details || "",
          at: FieldValue.serverTimestamp()
        });
      } catch (err) {

        console.warn("تعذّر تسجيل النشاط:", err);
      }
    },

    watchByShop(shopId, cb, max = 100) {
      return this.col(shopId).orderBy("at", "desc").limit(max).onSnapshot((qs) => {
        cb(qs.docs.map((d) => {
          const data = d.data();
          return { id: d.id, ...data, at: tsToIso(data.at) };
        }));
      });
    }
  };

  function getDeviceId() {
    let id = localStorage.getItem("daftary_device_id");
    if (!id) {
      id = uid("dev");
      localStorage.setItem("daftary_device_id", id);
    }
    return id;
  }
  function deviceLabel() {
    const ua = navigator.userAgent || "";
    let browser = "متصفح غير معروف";
    if (ua.includes("Chrome") && !ua.includes("Edg")) browser = "Chrome";
    else if (ua.includes("Firefox")) browser = "Firefox";
    else if (ua.includes("Safari") && !ua.includes("Chrome")) browser = "Safari";
    else if (ua.includes("Edg")) browser = "Edge";
    const platform = /Android/i.test(ua) ? "Android" : /iPhone|iPad/i.test(ua) ? "iOS" : /Win/i.test(ua) ? "Windows" : /Mac/i.test(ua) ? "Mac" : "";
    return [browser, platform].filter(Boolean).join(" · ");
  }

  const Session = {

    onChange(cb) {
      return auth.onAuthStateChanged(cb);
    },
    async isAdmin(uidToCheck) {
      const theUid = uidToCheck || (auth.currentUser && auth.currentUser.uid);
      if (!theUid) return false;
      const docSnap = await fs.collection("admins").doc(theUid).get();
      return docSnap.exists;
    },

    async resolveSession(uid) {
      const shop = await Shops.getProfile(uid);
      if (shop) return { role: "owner", shop };
      const employee = await Employees.getProfile(uid);
      if (employee) {
        const parentShop = await Shops.getProfile(employee.shopId);
        if (!parentShop) return null;
        return { role: "employee", shop: parentShop, employeeName: employee.name };
      }
      return null;
    },

    async flagNewDeviceIfNeeded(userUid, shopId, session) {
      try {
        const deviceId = getDeviceId();
        const ref = fs.collection("known_devices").doc(userUid);
        const docSnap = await ref.get();
        const known = docSnap.exists ? (docSnap.data().deviceIds || []) : null;
        if (known === null) {

          await ref.set({ deviceIds: [deviceId] });
          return;
        }
        if (!known.includes(deviceId)) {
          await ref.update({ deviceIds: FieldValue.arrayUnion(deviceId) });
          await ActivityLog.log(shopId, {
            action: "login_new_device",
            actorName: session.role === "employee" ? session.employeeName : (session.shop.ownerName || "صاحب المحل"),
            actorRole: session.role,
            details: `تسجيل دخول من جهاز جديد (${deviceLabel()})`
          });
        }
      } catch (err) {
        console.warn("تعذّر التحقق من الجهاز:", err);
      }
    },

    async login(email, password) {
      LoginGuard.assertNotLocked(email);
      let cred;
      try {
        cred = await auth.signInWithEmailAndPassword(email, password);
      } catch (err) {
        LoginGuard.recordFailure(email);
        throw new Error(mapAuthError(err));
      }
      LoginGuard.recordSuccess(email);
      const session = await this.resolveSession(cred.user.uid);
      if (!session) {
        await auth.signOut();
        throw new Error("لا يوجد حساب مرتبط بهذا المستخدم");
      }
      const { shop } = session;
      if (shop.status === "pending") throw new Error("الحساب بانتظار موافقة الإدارة");
      if (shop.status === "rejected") throw new Error("تم رفض طلب تفعيل هذا الحساب");
      if (shop.status === "expired" || (shop.expiresAt && new Date(shop.expiresAt) < new Date())) {
        await auth.signOut();
        throw new Error("انتهت مدة تفعيل الحساب، يرجى التواصل مع الإدارة لتجديده");
      }
      await this.flagNewDeviceIfNeeded(cred.user.uid, shop.id, session);
      return session;
    },
    // تسجيل دخول موحّد: يحدد تلقائياً هل المستخدم أدمن أو صاحب محل/موظف،
    // ويعيد كائناً موحّداً بدل افتراض دور واحد سلفاً.
    async loginAny(email, password) {
      LoginGuard.assertNotLocked(email);
      let cred;
      try {
        cred = await auth.signInWithEmailAndPassword(email, password);
      } catch (err) {
        LoginGuard.recordFailure(email);
        throw new Error(mapAuthError(err));
      }
      LoginGuard.recordSuccess(email);

      const isAdminUser = await this.isAdmin(cred.user.uid);
      if (isAdminUser) return { role: "admin" };

      const session = await this.resolveSession(cred.user.uid);
      if (!session) {
        await auth.signOut();
        throw new Error("لا يوجد حساب مرتبط بهذا المستخدم");
      }
      const { shop } = session;
      if (shop.status === "pending") throw new Error("الحساب بانتظار موافقة الإدارة");
      if (shop.status === "rejected") throw new Error("تم رفض طلب تفعيل هذا الحساب");
      if (shop.status === "expired" || (shop.expiresAt && new Date(shop.expiresAt) < new Date())) {
        await auth.signOut();
        throw new Error("انتهت مدة تفعيل الحساب، يرجى التواصل مع الإدارة لتجديده");
      }
      await this.flagNewDeviceIfNeeded(cred.user.uid, shop.id, session);
      return session;
    },
    async signOut() {
      await auth.signOut();
    },
    async sendPasswordReset(email) {
      try {
        await auth.sendPasswordResetEmail(email);
      } catch (err) {
        throw new Error(mapAuthError(err));
      }
    }
  };

  function mapAuthError(err) {
    const map = {
      "auth/email-already-in-use": "هذا البريد الإلكتروني مسجل مسبقاً",
      "auth/invalid-email": "البريد الإلكتروني غير صالح",
      "auth/weak-password": "كلمة المرور ضعيفة جداً (٦ أحرف على الأقل)",
      "auth/user-not-found": "لا يوجد حساب بهذا البريد الإلكتروني",
      "auth/wrong-password": "كلمة المرور غير صحيحة",
      "auth/invalid-credential": "البريد الإلكتروني أو كلمة المرور غير صحيحة",
      "auth/too-many-requests": "محاولات كثيرة، يرجى المحاولة لاحقاً",
      "auth/network-request-failed": "لا يوجد اتصال بالإنترنت — يلزم اتصال واحد لتسجيل الدخول لأول مرة"
    };
    return map[err.code] || err.message || "حدث خطأ غير متوقع";
  }

  return { Shops, Customers, Products, Employees, Session, LoginGuard, ActivityLog, uid };
})();
