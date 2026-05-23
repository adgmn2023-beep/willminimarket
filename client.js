(function () {
  "use strict";

  const data = window.WMData;
  const state = {
    products: [],
    categories: [],
    settings: {},
    cart: {},
    sectionObserver: null
  };

  const elements = {
    categoryNav: document.getElementById("category-nav"),
    menuSections: document.getElementById("menu-sections"),
    skeleton: document.getElementById("menu-skeleton"),
    cartBadge: document.getElementById("cart-badge"),
    cartQuantity: document.getElementById("cart-quantity"),
    cartTotal: document.getElementById("cart-total"),
    cartItems: document.getElementById("cart-items"),
    emptyCart: document.getElementById("empty-cart"),
    clearCart: document.getElementById("clear-cart"),
    openCart: document.getElementById("open-cart"),
    closeCart: document.getElementById("close-cart"),
    drawer: document.getElementById("cart-drawer"),
    backdrop: document.getElementById("drawer-backdrop"),
    form: document.getElementById("checkout-form"),
    addressField: document.getElementById("address-field"),
    changeField: document.getElementById("change-field"),
    summarySubtotal: document.getElementById("summary-subtotal"),
    summaryFee: document.getElementById("summary-fee"),
    summaryFeeRow: document.getElementById("summary-fee-row"),
    summaryTotal: document.getElementById("summary-total"),
    submitOrder: document.getElementById("submit-order"),
    toasts: document.getElementById("toast-region")
  };

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }

  async function loadState() {
    const results = await Promise.all([
      data.getProducts(),
      data.getCategories(),
      data.getSettings()
    ]);
    state.products = results[0];
    state.categories = results[1];
    state.settings = results[2];
    state.cart = data.getCart();
    removeUnavailableCartItems();
  }

  function removeUnavailableCartItems() {
    const availableIds = state.products.filter(function (product) {
      return product.available;
    }).map(function (product) {
      return product.id;
    });
    let changed = false;
    Object.keys(state.cart).forEach(function (productId) {
      if (!availableIds.includes(productId) || Number(state.cart[productId]) < 1) {
        delete state.cart[productId];
        changed = true;
      }
    });
    if (changed) {
      data.saveCart(state.cart);
    }
  }

  function visibleCategories() {
    return state.categories.filter(function (category) {
      return category.active && state.products.some(function (product) {
        return product.available && product.categoryId === category.id;
      });
    });
  }

  function productById(productId) {
    return state.products.find(function (product) {
      return product.id === productId;
    });
  }

  function itemCount() {
    return Object.values(state.cart).reduce(function (total, quantity) {
      return total + Number(quantity);
    }, 0);
  }

  function subtotal() {
    return Object.entries(state.cart).reduce(function (total, entry) {
      const product = productById(entry[0]);
      return total + (product ? product.price * Number(entry[1]) : 0);
    }, 0);
  }

  function usesDelivery() {
    const selected = elements.form.querySelector('input[name="deliveryMethod"]:checked');
    return selected && selected.value === "Delivery";
  }

  function total() {
    return subtotal() + (usesDelivery() ? Number(state.settings.deliveryFee || 0) : 0);
  }

  function renderStore() {
    document.getElementById("store-name").textContent = state.settings.name;
    document.getElementById("store-address").textContent = state.settings.address;
    document.getElementById("estimated-time").textContent = "Entrega estimada: " + state.settings.estimatedTime;
    document.getElementById("delivery-fee").textContent = "Taxa de entrega: " + data.formatMoney(state.settings.deliveryFee);
    const status = document.getElementById("store-status");
    const closedNotice = document.getElementById("closed-notice");
    status.textContent = state.settings.isOpen ? "Aberta" : "Fechada";
    status.classList.toggle("closed", !state.settings.isOpen);
    closedNotice.classList.toggle("is-hidden", state.settings.isOpen);
  }

  function renderCategories() {
    elements.categoryNav.innerHTML = visibleCategories().map(function (category, index) {
      return '<button type="button" class="category-chip ' + (index === 0 ? "active" : "") +
        '" data-category-link="' + escapeHtml(category.id) + '">' + escapeHtml(category.name) + "</button>";
    }).join("");
  }

  function quantityMarkup(productId) {
    const quantity = Number(state.cart[productId] || 0);
    if (!quantity) {
      return '<button class="add-button" type="button" data-add="' + escapeHtml(productId) + '">+ Adicionar</button>';
    }
    return '<div class="quantity-control" aria-label="Quantidade">' +
      '<button type="button" data-decrease="' + escapeHtml(productId) + '" aria-label="Remover uma unidade">-</button>' +
      "<span>" + quantity + "</span>" +
      '<button type="button" data-increase="' + escapeHtml(productId) + '" aria-label="Adicionar uma unidade">+</button>' +
      "</div>";
  }

  function renderMenu() {
    const categoryHtml = visibleCategories().map(function (category) {
      const products = state.products.filter(function (product) {
        return product.available && product.categoryId === category.id;
      });
      return '<section class="menu-category" id="category-' + escapeHtml(category.id) + '" data-section="' + escapeHtml(category.id) + '">' +
        '<header class="category-title"><h2>' + escapeHtml(category.name) + '</h2><p>' + products.length +
        (products.length === 1 ? " produto disponível" : " produtos disponíveis") + "</p></header>" +
        '<div class="products-grid">' + products.map(function (product) {
          return '<article class="product-card" data-card="' + escapeHtml(product.id) + '">' +
            '<img class="product-image" src="' + escapeHtml(data.productImage(product)) + '" alt="' + escapeHtml(product.name) + '">' +
            '<div class="product-content"><h3>' + escapeHtml(product.name) + '</h3>' +
            '<p class="product-description">' + escapeHtml(product.description) + '</p>' +
            '<div class="product-footer"><strong class="product-price">' + data.formatMoney(product.price) + "</strong>" +
            quantityMarkup(product.id) + "</div></div></article>";
        }).join("") + "</div></section>";
    }).join("");

    elements.menuSections.innerHTML = categoryHtml || '<div class="empty-cart"><strong>Nenhum produto disponível</strong><span>Novos itens aparecerão em breve.</span></div>';
    elements.menuSections.querySelectorAll(".product-image").forEach(function (image) {
      image.addEventListener("error", function () {
        const product = productById(image.closest("[data-card]").dataset.card);
        image.src = data.placeholderImage(product.name, product.tone);
      }, { once: true });
    });
    observeSections();
  }

  function renderCart() {
    const entries = Object.entries(state.cart);
    const count = itemCount();
    elements.cartBadge.textContent = count;
    elements.cartQuantity.textContent = count === 0 ? "Nenhum item" : count + (count === 1 ? " item" : " itens");
    elements.cartTotal.textContent = data.formatMoney(subtotal());
    elements.emptyCart.classList.toggle("is-hidden", entries.length > 0);
    elements.clearCart.classList.toggle("is-hidden", entries.length === 0);
    elements.cartItems.innerHTML = entries.map(function (entry) {
      const product = productById(entry[0]);
      const quantity = Number(entry[1]);
      if (!product) {
        return "";
      }
      return '<li class="cart-item"><img src="' + escapeHtml(data.productImage(product)) + '" alt="">' +
        '<div><strong>' + escapeHtml(product.name) + '</strong><span>' + quantity + " x " +
        data.formatMoney(product.price) + "</span></div>" + quantityMarkup(product.id) + "</li>";
    }).join("");
    elements.cartItems.querySelectorAll("img").forEach(function (image, index) {
      image.addEventListener("error", function () {
        const product = productById(entries[index][0]);
        image.src = data.placeholderImage(product.name, product.tone);
      }, { once: true });
    });
    renderSummary();
    elements.submitOrder.disabled = entries.length === 0 || !state.settings.isOpen;
  }

  function renderSummary() {
    const delivery = usesDelivery();
    elements.summarySubtotal.textContent = data.formatMoney(subtotal());
    elements.summaryFee.textContent = data.formatMoney(state.settings.deliveryFee);
    elements.summaryFeeRow.classList.toggle("is-hidden", !delivery);
    elements.summaryTotal.textContent = data.formatMoney(total());
  }

  function updateQuantity(productId, amount) {
    const current = Number(state.cart[productId] || 0);
    const next = current + amount;
    if (next <= 0) {
      delete state.cart[productId];
      toast("Produto removido do carrinho.");
    } else {
      state.cart[productId] = next;
      toast(amount > 0 ? "Produto adicionado ao carrinho." : "Quantidade atualizada.");
    }
    data.saveCart(state.cart);
    renderMenu();
    renderCart();
    const card = elements.menuSections.querySelector('[data-card="' + CSS.escape(productId) + '"]');
    if (amount > 0 && card) {
      card.classList.add("added");
      window.setTimeout(function () { card.classList.remove("added"); }, 380);
    }
  }

  function openDrawer() {
    elements.drawer.classList.add("open");
    elements.drawer.setAttribute("aria-hidden", "false");
    elements.openCart.setAttribute("aria-expanded", "true");
    elements.backdrop.classList.remove("is-hidden");
  }

  function closeDrawer() {
    elements.drawer.classList.remove("open");
    elements.drawer.setAttribute("aria-hidden", "true");
    elements.openCart.setAttribute("aria-expanded", "false");
    elements.backdrop.classList.add("is-hidden");
  }

  function toast(message, type) {
    const notification = document.createElement("div");
    notification.className = "toast" + (type === "error" ? " error" : "");
    notification.textContent = message;
    elements.toasts.appendChild(notification);
    window.setTimeout(function () {
      notification.remove();
    }, 2800);
  }

  function observeSections() {
    if (!("IntersectionObserver" in window)) {
      return;
    }
    if (state.sectionObserver) {
      state.sectionObserver.disconnect();
    }
    state.sectionObserver = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) {
          return;
        }
        elements.categoryNav.querySelectorAll(".category-chip").forEach(function (chip) {
          chip.classList.toggle("active", chip.dataset.categoryLink === entry.target.dataset.section);
        });
      });
    }, { rootMargin: "-25% 0px -62% 0px", threshold: 0 });
    elements.menuSections.querySelectorAll(".menu-category").forEach(function (section) {
      state.sectionObserver.observe(section);
    });
  }

  function toggleConditionalFields() {
    const delivery = usesDelivery();
    const payment = elements.form.querySelector('input[name="paymentMethod"]:checked');
    const address = elements.form.elements.address;
    elements.addressField.classList.toggle("is-hidden", !delivery);
    address.required = delivery;
    elements.changeField.classList.toggle("is-hidden", !payment || payment.value !== "Dinheiro");
    renderSummary();
  }

  function whatsappNumber() {
    const digits = state.settings.whatsapp.replace(/\D/g, "");
    return digits.startsWith("55") ? digits : "55" + digits;
  }

  function composeMessage(formData) {
    const delivery = formData.get("deliveryMethod");
    const payment = formData.get("paymentMethod");
    const lines = [
      "🛒 NOVO PEDIDO - WILL MINIMARKET",
      "👤 Cliente: " + formData.get("customerName").trim(),
      "📱 Telefone: " + formData.get("customerPhone").trim(),
      "📦 Itens do pedido:",
      ""
    ];
    Object.entries(state.cart).forEach(function (entry) {
      const product = productById(entry[0]);
      const quantity = Number(entry[1]);
      lines.push(quantity + "x " + product.name + " - " + data.formatMoney(product.price) + " = " + data.formatMoney(product.price * quantity));
    });
    lines.push("");
    lines.push("💰 Subtotal: " + data.formatMoney(subtotal()));
    if (delivery === "Delivery") {
      lines.push("🛵 Taxa de entrega: " + data.formatMoney(state.settings.deliveryFee));
    }
    lines.push("💰 Total: " + data.formatMoney(total()));
    lines.push("🚗 Entrega: " + delivery);
    if (delivery === "Delivery") {
      lines.push("📍 Endereço: " + formData.get("address").trim());
    }
    lines.push("💳 Pagamento: " + payment);
    if (payment === "Dinheiro" && formData.get("changeFor").trim()) {
      lines.push("💵 Troco para: " + formData.get("changeFor").trim());
    }
    if (formData.get("notes").trim()) {
      lines.push("📝 Obs: " + formData.get("notes").trim());
    }
    return lines.join("\n");
  }

  function buildOrder(formData) {
    const delivery = formData.get("deliveryMethod");
    const items = Object.entries(state.cart).map(function (entry) {
      const product = productById(entry[0]);
      const quantity = Number(entry[1]);
      return {
        nome: product.name,
        quantidade: quantity,
        preco_unitario: Number(product.price),
        subtotal: Number((product.price * quantity).toFixed(2))
      };
    });
    return {
      nome_cliente: formData.get("customerName").trim(),
      telefone: formData.get("customerPhone").trim(),
      forma_entrega: delivery,
      endereco: delivery === "Delivery" ? formData.get("address").trim() : null,
      forma_pagamento: formData.get("paymentMethod"),
      troco_para: formData.get("paymentMethod") === "Dinheiro" ? (formData.get("changeFor").trim() || null) : null,
      observacoes: formData.get("notes").trim() || null,
      itens: items,
      subtotal: Number(subtotal().toFixed(2)),
      taxa_entrega: delivery === "Delivery" ? Number(state.settings.deliveryFee || 0) : 0,
      total: Number(total().toFixed(2))
    };
  }

  async function sendOrder(formData) {
    const message = composeMessage(formData);
    const link = "https://wa.me/" + whatsappNumber() + "?text=" + encodeURIComponent(message);
    const whatsappWindow = window.open("about:blank", "will-minimarket-whatsapp");
    if (whatsappWindow) {
      whatsappWindow.opener = null;
    }

    try {
      const order = buildOrder(formData);
      const savedOrder = await data.createOrder(order);
      const webhookPayload = Object.assign({
        pedido_id: savedOrder.id,
        timestamp: new Date().toISOString()
      }, order);

      try {
        const response = await fetch(WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(webhookPayload)
        });
        if (!response.ok) {
          throw new Error("Webhook retornou HTTP " + response.status);
        }
        try {
          await data.markWebhookSent(savedOrder.id);
        } catch (updateError) {
          console.error("Webhook enviado, mas não foi possível atualizar o pedido:", updateError);
        }
      } catch (webhookError) {
        console.error("Falha ao disparar webhook do pedido:", webhookError);
      }

      if (whatsappWindow) {
        whatsappWindow.location.href = link;
      } else {
        window.open(link, "_blank", "noopener");
      }
      toast("Pedido salvo. Abrindo WhatsApp.");
    } catch (error) {
      if (whatsappWindow) {
        whatsappWindow.close();
      }
      console.error("Falha ao salvar pedido:", error);
      toast("Não foi possível registrar o pedido. Tente novamente.", "error");
      throw error;
    }
  }

  function bindEvents() {
    elements.menuSections.addEventListener("click", function (event) {
      const button = event.target.closest("button");
      if (!button) {
        return;
      }
      if (button.dataset.add || button.dataset.increase) {
        updateQuantity(button.dataset.add || button.dataset.increase, 1);
      }
      if (button.dataset.decrease) {
        updateQuantity(button.dataset.decrease, -1);
      }
    });

    elements.cartItems.addEventListener("click", function (event) {
      const button = event.target.closest("button");
      if (!button) {
        return;
      }
      if (button.dataset.increase) {
        updateQuantity(button.dataset.increase, 1);
      }
      if (button.dataset.decrease) {
        updateQuantity(button.dataset.decrease, -1);
      }
    });

    elements.categoryNav.addEventListener("click", function (event) {
      const button = event.target.closest("[data-category-link]");
      if (!button) {
        return;
      }
      document.getElementById("category-" + button.dataset.categoryLink).scrollIntoView({ behavior: "smooth" });
    });

    elements.openCart.addEventListener("click", openDrawer);
    elements.closeCart.addEventListener("click", closeDrawer);
    elements.backdrop.addEventListener("click", closeDrawer);
    elements.clearCart.addEventListener("click", function () {
      if (window.confirm("Deseja limpar todos os itens do carrinho?")) {
        state.cart = {};
        data.saveCart(state.cart);
        renderMenu();
        renderCart();
        toast("Carrinho limpo.");
      }
    });

    elements.form.addEventListener("change", toggleConditionalFields);
    elements.form.addEventListener("submit", async function (event) {
      event.preventDefault();
      if (!itemCount()) {
        toast("Adicione produtos antes de finalizar.", "error");
        return;
      }
      if (!state.settings.isOpen) {
        toast("A loja está fechada no momento.", "error");
        return;
      }
      const formData = new FormData(elements.form);
      elements.submitOrder.disabled = true;
      elements.submitOrder.textContent = "Enviando pedido...";
      try {
        await sendOrder(formData);
      } catch (error) {
        // O erro já foi exibido para o cliente.
      } finally {
        elements.submitOrder.textContent = "Enviar pedido via WhatsApp";
        renderCart();
      }
    });
  }

  async function initialize() {
    bindEvents();
    try {
      await loadState();
      renderStore();
      renderCategories();
      renderMenu();
      renderCart();
      toggleConditionalFields();
    } catch (error) {
      console.error("Falha ao carregar cardápio:", error);
      elements.menuSections.innerHTML = '<div class="empty-cart"><strong>Não foi possível carregar o cardápio</strong><span>Tente novamente em instantes.</span></div>';
      elements.menuSections.classList.remove("is-hidden");
      toast("Não foi possível carregar o cardápio.", "error");
    } finally {
      elements.skeleton.classList.add("is-hidden");
      elements.menuSections.classList.remove("is-hidden");
    }
  }

  initialize();
})();
