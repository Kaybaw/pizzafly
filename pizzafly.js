// pizzafly.js (auth gate + 2-page flow + tracking + grouped cart + builder)
// noinspection JSUnresolvedReference

// ===================== Auth helpers =====================
function getUser() {
  try {
    const raw = localStorage.getItem('pf_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function setUser(userObj) {
  localStorage.setItem('pf_user', JSON.stringify(userObj || {}));
}

function clearUser() {
  localStorage.removeItem('pf_user');
}

// Parse ?next=... from URL
function getNextParam(defaultPath = 'index') {
  try {
    const url = new URL(location.href);
    const next = url.searchParams.get('next') || defaultPath;
    if (next === 'order') return './order.html';
    if (next === 'index') return './index.html';
    // fallback: if a full path passed, allow it; else go index
    return next.startsWith('./') || next.endsWith('.html') ? next : './index.html';
  } catch {
    return './index.html';
  }
}

// ===================== Storage Init =====================
let cart = [];

function normalizeCart(arr) {
  return (Array.isArray(arr) ? arr : []).map(it => {
    const priceNum = parsePrice(it.price);
    return {
      name: it.name || "Item",
      price: it.price || `$${priceNum.toFixed(2)}`,
      unitPrice: Number.isFinite(it.unitPrice) ? it.unitPrice : priceNum,
      image: it.image || "",
      qty: Number.isFinite(it.qty) && it.qty > 0 ? it.qty : 1
    };
  });
}

try {
  cart = normalizeCart(JSON.parse(localStorage.getItem("cart")));
  localStorage.setItem("cart", JSON.stringify(cart));
} catch {
  cart = [];
  localStorage.setItem("cart", JSON.stringify(cart));
}

let rewardPoints = 0;
try {
  const storedPoints = parseInt(localStorage.getItem("rewardPoints"), 10);
  rewardPoints = isNaN(storedPoints) ? 0 : storedPoints;
  localStorage.setItem("rewardPoints", rewardPoints);
} catch {
  rewardPoints = 0;
  localStorage.setItem("rewardPoints", rewardPoints);
}

// Active order (for tracking)
function getActiveOrder() {
  try {
    return JSON.parse(localStorage.getItem("activeOrder"));
  } catch {
    return null;
  }
}

function setActiveOrder(order) {
  localStorage.setItem("activeOrder", JSON.stringify(order));
}

// ===================== Utilities =====================
function saveCart() {
  localStorage.setItem("cart", JSON.stringify(cart));
}

function savePoints() {
  localStorage.setItem("rewardPoints", rewardPoints);
}

function updateCartQuantity() {
  const el = document.getElementById("cartQuantity");
  const count = cart.reduce((s, it) => s + it.qty, 0);
  if (el) el.textContent = String(count);
}

function updatePointsDisplay() {
  const p1 = document.getElementById("rewardPointsDisplay");
  const p2 = document.getElementById("rewardPointsDisplayOrder");
  if (p1) p1.textContent = rewardPoints;
  if (p2) p2.textContent = rewardPoints;
}

function parsePrice(v) {
  if (typeof v === "number") return v;
  if (typeof v !== "string") return 0;
  return parseFloat(v.replace(/[^0-9.-]+/g, "")) || 0;
}

function formatPrice(n) {
  return (Number.isFinite(n) ? n : 0).toFixed(2);
}

function findCartIndex(name, unitPrice) {
  return cart.findIndex(it =>
    it.name.trim().toLowerCase() === name.trim().toLowerCase() &&
    Math.abs(it.unitPrice - unitPrice) < 1e-6
  );
}

// ===================== Cart Render (Grouped + qty ±) =====================
function renderCart() {
  const list = document.getElementById("cart-items");
  const totalEl = document.getElementById("cart-total");
  const discountLabel = document.getElementById("cart-discount-label");
  const discountValEl = document.getElementById("cart-discount");

  if (!list || !totalEl) {
    updateCartQuantity();
    updatePointsDisplay();
    return;
  }

  list.innerHTML = "";
  let subtotal = 0;

  if (cart.length === 0) {
    list.innerHTML = "<li>Your cart is empty.</li>";
  } else {
    cart.forEach((item, idx) => {
      const lineTotal = item.unitPrice * item.qty;
      subtotal += lineTotal;

      const li = document.createElement("li");
      li.className = "cart-item";
      li.innerHTML = `
        <img src="${item.image}" alt="${item.name}" height="60" />
        <div class="cart-item-info">
          <strong>${item.name}</strong>
          <div>$${formatPrice(item.unitPrice)} × <span class="qty" data-idx="${idx}">${item.qty}</span> = <strong>$${formatPrice(lineTotal)}</strong></div>
        </div>
        <div class="qty-controls">
          <button class="btn-primary btn-qty" data-action="dec" data-index="${idx}" aria-label="Decrease ${item.name}">−</button>
          <button class="btn-primary btn-qty" data-action="inc" data-index="${idx}" aria-label="Increase ${item.name}">+</button>
        </div>
      `;
      list.appendChild(li);
    });
  }

  let discount = parseFloat(localStorage.getItem("cartDiscount")) || 0;
  if (!Number.isFinite(discount)) discount = 0;
  const total = Math.max(0, subtotal - discount);

  totalEl.textContent = formatPrice(total);
  if (discountLabel && discountValEl) {
    if (discount > 0) {
      discountLabel.style.display = "inline";
      discountValEl.textContent = formatPrice(discount);
    } else {
      discountLabel.style.display = "none";
    }
  }

  updateCartQuantity();
  updatePointsDisplay();

  // qty buttons
  list.querySelectorAll(".btn-qty").forEach(btn => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.index, 10);
      const action = btn.dataset.action;
      if (isNaN(idx) || !cart[idx]) return;

      if (action === "inc") {
        cart[idx].qty += 1;
        // add points for one unit
        rewardPoints += Math.floor(cart[idx].unitPrice);
      } else if (action === "dec") {
        // remove points for one unit (floored)
        rewardPoints = Math.max(0, rewardPoints - Math.floor(cart[idx].unitPrice));
        cart[idx].qty -= 1;
        if (cart[idx].qty <= 0) cart.splice(idx, 1);
      }

      saveCart();
      savePoints();
      renderCart();
    });
  });
}

// ===================== Redeem Points =====================
function setupRedeemPoints() {
  const btn = document.getElementById("redeemPointsBtn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    const MIN_POINTS = 50;
    const POINT_VALUE = 0.1; // $0.10 per point
    if (rewardPoints < MIN_POINTS) {
      alert(`You need at least ${MIN_POINTS} points to redeem.`);
      return;
    }
    const discount = rewardPoints * POINT_VALUE;
    localStorage.setItem("cartDiscount", discount.toFixed(2));
    rewardPoints = 0;
    savePoints();
    alert(`You redeemed points for $${discount.toFixed(2)} off your order!`);
    renderCart();
  });
}

// ===================== Filters / UI =====================
function setupFilterButtons() {
  const filterContainer = document.querySelector(".filter-buttons");
  if (!filterContainer) return;
  filterContainer.addEventListener("click", e => {
    const target = e.target.closest(".filter-btn");
    if (!target) return;
    const filter = target.dataset.filter;
    document.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
    target.classList.add("active");
    document.querySelectorAll(".menu-card").forEach(card => {
      const category = card.dataset.category;
      card.style.display = (filter === "all" || category === filter) ? "block" : "none";
    });
  });
}

function setupExploreScroll() {
  const exploreBtn = document.getElementById("exploreBtn");
  const menuSection = document.getElementById("menu");
  if (!exploreBtn || !menuSection) return;
  exploreBtn.addEventListener("click", e => {
    e.preventDefault();
    menuSection.scrollIntoView({behavior: "smooth"});
  });
}

function setupScrollTopButton() {
  const scrollTopBtn = document.querySelector(".scroll-top");
  if (!scrollTopBtn) return;
  window.addEventListener("scroll", () => {
    scrollTopBtn.style.display = window.scrollY > 300 ? "block" : "none";
  });
  scrollTopBtn.addEventListener("click", () => window.scrollTo({top: 0, behavior: "smooth"}));
}

// ===================== Order Now Behavior =====================
function setupOrderNowButton() {
  const orderNowBtn = document.getElementById("orderNowBtn");
  if (!orderNowBtn) return;
  orderNowBtn.addEventListener("click", () => {
    // let normal navigation happen to order.html
  });
}

// ===================== Add To Cart (Aggregated) =====================
function setupAddToCartButtons() {
  document.querySelectorAll(".add-to-cart-btn").forEach(button => {
    button.addEventListener("click", () => {
      const card = button.closest(".menu-card");
      if (!card) return alert("Could not determine item.");
      const nameEl = card.querySelector("h3");
      const priceEl = card.querySelector(".price");
      const imageEl = card.querySelector("img");
      if (!nameEl || !priceEl || !imageEl) return alert("Missing item details.");

      const name = nameEl.textContent.trim();
      const priceStr = priceEl.textContent.trim();
      const unitPrice = parsePrice(priceStr);
      const image = imageEl.src;

      const idx = findCartIndex(name, unitPrice);
      if (idx >= 0) {
        cart[idx].qty += 1;
      } else {
        cart.push({name, price: priceStr, unitPrice, image, qty: 1});
      }
      saveCart();

      rewardPoints += Math.floor(unitPrice);
      savePoints();

      updateCartQuantity();
      updatePointsDisplay();
      renderCart();

      const prev = button.textContent;
      button.textContent = "Added ✓";
      setTimeout(() => (button.textContent = prev), 900);
    });
  });
}

// ===================== Custom Pizza Builder =====================
function initBuilder() {
  const size = document.getElementById('sizeSelect');
  const crust = document.getElementById('crustSelect');
  const sauce = document.getElementById('sauceSelect');
  const cheese = document.getElementById('cheeseSelect');
  const topChecks = document.querySelectorAll('.topCheck');
  const title = document.getElementById('builderTitle');
  const desc = document.getElementById('builderDesc');
  const priceEl = document.getElementById('builderPrice');
  const summary = document.getElementById('builderSummary');

  if (!size || !crust || !sauce || !cheese || !title || !desc || !priceEl) return;

  const TOPPING_PRICE = 1.25;

  function recalc() {
    const sizeText = size.value;
    const base = parseFloat(size.options[size.selectedIndex].dataset.price || "0");
    const crustText = crust.value;
    const crustUp = parseFloat(crust.options[crust.selectedIndex].dataset.up || "0");
    const sauceText = sauce.value;
    const sauceUp = parseFloat(sauce.options[sauce.selectedIndex].dataset.up || "0");
    const cheeseText = cheese.value;
    const cheeseUp = parseFloat(cheese.options[cheese.selectedIndex].dataset.up || "0");
    const tops = Array.from(topChecks).filter(c => c.checked).map(c => c.value);
    const topCost = tops.length * TOPPING_PRICE;

    const total = base + crustUp + sauceUp + cheeseUp + topCost;

    // Update card (used by add-to-cart)
    title.textContent = `Custom Pizza — ${sizeText} (${tops.length} toppings)`;
    desc.textContent = `${crustText} • ${sauceText} • ${cheeseText}`;
    priceEl.textContent = `$${total.toFixed(2)}`;

    if (summary) {
      summary.textContent = `${sizeText} • ${crustText} • ${sauceText} • ${cheeseText} • ${tops.length} toppings`;
    }
  }

  [size, crust, sauce, cheese].forEach(el => el.addEventListener('change', recalc));
  topChecks.forEach(c => c.addEventListener('change', recalc));
  recalc();
}

// ===================== Tracking =====================
const STAGES = ["received", "preparing", "baking", "out_for_delivery", "delivered"];
const STAGE_MINUTES = [0, 1, 3, 5, 6];

function computeStage(createdAtMs) {
  const elapsedMin = (Date.now() - createdAtMs) / 60000;
  let stageIndex = 0;
  for (let i = 0; i < STAGE_MINUTES.length; i++) if (elapsedMin >= STAGE_MINUTES[i]) stageIndex = i;
  return STAGES[stageIndex] || "received";
}

function updateTrackingUI(order) {
  const idEl = document.getElementById("orderId");
  const statusEl = document.getElementById("status");
  const indicators = document.querySelectorAll(".progress-indicator");
  if (!idEl || !statusEl || !indicators.length) return;
  idEl.textContent = order?.id || "—";
  const stage = computeStage(order.createdAt);
  statusEl.textContent = stage.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  indicators.forEach(el => {
    const s = el.getAttribute("data-stage");
    if (!s) return;
    const active = STAGES.indexOf(s) <= STAGES.indexOf(stage);
    el.classList.toggle("active", active);
  });
}

function tickTracking() {
  const order = getActiveOrder();
  if (!order) return;
  updateTrackingUI(order);
  const stage = computeStage(order.createdAt);
  if (stage !== "delivered") setTimeout(tickTracking, 15000);
}

// ===================== Checkout (create order) =====================
function setupOrderForm() {
  const form = document.getElementById("order-form");
  if (!form) return;

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = (document.getElementById("name") || {}).value?.trim();
    const address = (document.getElementById("address") || {}).value?.trim();
    const phone = (document.getElementById("phone") || {}).value?.trim();
    if (!name || !address || !phone) return alert("Please complete your name, address, and phone.");

    let subtotal = cart.reduce((sum, it) => sum + it.unitPrice * it.qty, 0);
    const discount = parseFloat(localStorage.getItem("cartDiscount")) || 0;
    const total = Math.max(0, subtotal - discount);

    const orderId = "PF-" + Math.random().toString(36).slice(2, 8).toUpperCase();
    const order = {
      id: orderId, name, address, phone,
      total: Number(total.toFixed(2)),
      items: cart.slice(),
      createdAt: Date.now()
    };

    setActiveOrder(order);
    localStorage.removeItem("cartDiscount");

    // award points on total
    rewardPoints += Math.floor(order.total);
    savePoints();

    cart = [];
    saveCart();
    renderCart();
    updatePointsDisplay();

    alert(`Thanks ${name}! Your order ${orderId} has been received.`);
    updateTrackingUI(order);
    tickTracking();
  });
}

// ===================== Auth page init =====================
function initAuthPage() {
  const signInTab = document.getElementById('tabSignIn');
  const regTab = document.getElementById('tabRegister');
  const signInForm = document.getElementById('authSignInForm');
  const regForm = document.getElementById('authRegisterForm');
  const title = document.getElementById('authTitle');
  const guestBtn = document.getElementById('continueGuestBtn');

  if (!signInTab || !regTab || !signInForm || !regForm) return;

  const showSignIn = () => {
    title.textContent = 'Welcome back';
    signInForm.style.display = 'block';
    regForm.style.display = 'none';
  };
  const showRegister = () => {
    title.textContent = 'Create your account';
    signInForm.style.display = 'none';
    regForm.style.display = 'block';
  };

  signInTab.addEventListener('click', showSignIn);
  regTab.addEventListener('click', showRegister);

  signInForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = document.getElementById('signinEmail').value.trim();
    const pass = document.getElementById('signinPassword').value.trim();
    if (!email || !pass) return alert('Please enter email and password.');
    setUser({email, name: email.split('@')[0]});
    location.replace(getNextParam('index'));
  });

  regForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('regName').value.trim();
    const email = document.getElementById('regEmail').value.trim();
    const pass = document.getElementById('regPassword').value.trim();
    if (!name || !email || !pass) return alert('Please fill all fields.');
    setUser({email, name});
    location.replace(getNextParam('index'));
  });

  if (guestBtn) {
    guestBtn.addEventListener('click', () => {
      setUser({guest: true});
      location.replace(getNextParam('index'));
    });
  }
}

// ===================== Boot =====================
window.addEventListener("DOMContentLoaded", () => {
  // Page detection
  const path = location.pathname.toLowerCase();

  // Auth page setup
  if (path.endsWith('/auth.html') || path.endsWith('auth.html')) {
    initAuthPage();
  }

  // General UI
  setupFilterButtons();
  setupExploreScroll();
  setupScrollTopButton();
  setupOrderNowButton();
  setupAddToCartButtons();
  setupRedeemPoints();
  setupOrderForm();
  initBuilder(); // safe no-op if builder controls don’t exist

  // Points + cart on load
  renderCart();
  updatePointsDisplay();

  // Tracking resume
  const order = getActiveOrder();
  if (order) {
    updateTrackingUI(order);
    tickTracking();
  }

  // Order gate (show only if no user)
  const checkoutGate = document.getElementById('checkoutGate');
  const checkoutContent = document.getElementById('checkoutContent');
  const guestBtn = document.getElementById('guestCheckoutBtn');

  if (checkoutGate && checkoutContent) {
    const user = getUser();
    if (!user) {
      checkoutGate.style.display = 'block';
      checkoutContent.style.display = 'none';
      if (guestBtn) {
        guestBtn.addEventListener('click', () => {
          setUser({guest: true});
          checkoutGate.style.display = 'none';
          checkoutContent.style.display = 'block';
        });
      }
    } else {
      checkoutGate.style.display = 'none';
      checkoutContent.style.display = 'block';
    }
  }
});
