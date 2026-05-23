(function () {
  "use strict";

  const data = window.WMData;
  const state = {
    products: [],
    categories: [],
    settings: {},
    orders: [],
    notifiedOrderIds: new Set(),
    audioContext: null,
    audioEnabled: false,
    pollingTimer: null,
    imageUpload: {
      file: null,
      currentUrl: "",
      removeCurrent: false,
      previewUrl: ""
    }
  };

  const elements = {
    productBody: document.getElementById("product-table-body"),
    ordersBody: document.getElementById("orders-table-body"),
    categoryList: document.getElementById("category-admin-list"),
    productModal: document.getElementById("product-modal"),
    productForm: document.getElementById("product-form"),
    categorySelect: document.getElementById("product-category-select"),
    imageDropzone: document.getElementById("product-image-dropzone"),
    imageInput: document.getElementById("product-image-input"),
    imagePrompt: document.getElementById("product-image-prompt"),
    selectedImagePreview: document.getElementById("selected-image-preview"),
    productPreview: document.getElementById("product-image-preview"),
    productImageFilename: document.getElementById("product-image-filename"),
    removeProductImage: document.getElementById("remove-product-image"),
    categoryModal: document.getElementById("category-modal"),
    categoryForm: document.getElementById("category-form"),
    settingsForm: document.getElementById("settings-form"),
    toasts: document.getElementById("toast-region"),
    alertRegion: document.getElementById("order-alert-region"),
    enableAudioAlerts: document.getElementById("enable-audio-alerts")
  };

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
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

  function audioContext() {
    if (!state.audioContext) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        state.audioContext = new AudioContext();
      }
    }
    return state.audioContext;
  }

  function beep(context, frequency, start, duration, volume) {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(volume, start + 0.015);
    gain.gain.linearRampToValueAtTime(0, start + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.01);
  }

  function playNotificationSound() {
    if (!state.audioEnabled) {
      return;
    }
    const context = audioContext();
    if (!context) {
      return;
    }
    const start = context.currentTime;
    beep(context, 880, start, 0.15, 0.16);
    beep(context, 1100, start + 0.25, 0.15, 0.16);
  }

  async function enableAudioAlerts() {
    const context = audioContext();
    if (!context) {
      toast("Alertas sonoros não são suportados neste navegador.", "error");
      return;
    }
    await context.resume();
    beep(context, 440, context.currentTime, 0.02, 0);
    state.audioEnabled = true;
    elements.enableAudioAlerts.classList.add("is-hidden");
    toast("Alertas sonoros ativados.");
  }

  function showOrderAlert(order) {
    const alert = document.createElement("div");
    alert.className = "order-alert";
    alert.innerHTML = '<span class="order-alert__icon" aria-hidden="true">&#128722;</span>' +
      '<span class="order-alert__text">Novo pedido recebido! — Cliente: ' +
      escapeHtml(order.nome_cliente) + " — Total: " + data.formatMoney(order.total) + "</span>" +
      '<button class="order-alert__close" type="button" aria-label="Fechar alerta">&times;</button>';
    const closeButton = alert.querySelector(".order-alert__close");
    const timeout = window.setTimeout(function () {
      alert.remove();
    }, 8000);
    closeButton.addEventListener("click", function () {
      window.clearTimeout(timeout);
      alert.remove();
    });
    elements.alertRegion.appendChild(alert);
  }

  async function loadState() {
    const results = await Promise.all([
      data.getAdminProducts(),
      data.getAdminCategories(),
      data.getSettings(),
      data.getOrders()
    ]);
    state.products = results[0];
    state.categories = results[1];
    state.settings = results[2];
    state.orders = results[3];
  }

  function categoryName(categoryId) {
    const category = state.categories.find(function (item) {
      return item.id === categoryId;
    });
    return category ? category.name : "Sem categoria";
  }

  function renderDashboard() {
    document.getElementById("product-count").textContent = state.products.length;
    document.getElementById("available-count").textContent = state.products.filter(function (product) {
      return product.available;
    }).length;
    document.getElementById("category-count").textContent = state.categories.filter(function (category) {
      return category.active;
    }).length;
    document.getElementById("dashboard-status").textContent = state.settings.isOpen ? "Aberta" : "Fechada";
  }

  function productTableImage(product) {
    if (product.image) {
      return '<img class="product-table-image" src="' + escapeHtml(product.image) + '" alt="' + escapeHtml(product.name) + '">';
    }
    return '<span class="product-table-placeholder" aria-hidden="true">&#128717;</span>';
  }

  function renderProducts() {
    elements.productBody.innerHTML = state.products.map(function (product) {
      return "<tr>" +
        '<td><div class="table-product">' + productTableImage(product) + '<span class="table-product-name">' +
        escapeHtml(product.name) + "</span></div></td>" +
        "<td>" + escapeHtml(categoryName(product.categoryId)) + "</td>" +
        "<td>" + data.formatMoney(product.price) + "</td>" +
        '<td><span class="availability ' + (product.available ? "" : "off") + '">' +
        (product.available ? "Disponível" : "Indisponível") + "</span></td>" +
        '<td><div class="row-actions">' +
        '<button class="action-button" type="button" data-edit-product="' + escapeHtml(product.id) + '">Editar</button>' +
        '<button class="action-button" type="button" data-toggle-product="' + escapeHtml(product.id) + '">' +
        (product.available ? "Desativar" : "Ativar") + "</button>" +
        '<button class="action-button danger" type="button" data-delete-product="' + escapeHtml(product.id) + '">Excluir</button>' +
        "</div></td></tr>";
    }).join("");
    if (!state.products.length) {
      elements.productBody.innerHTML = '<tr><td colspan="5" class="empty-table">Nenhum produto cadastrado.</td></tr>';
    }
    elements.productBody.querySelectorAll(".product-table-image").forEach(function (image) {
      image.addEventListener("error", function () {
        const placeholder = document.createElement("span");
        placeholder.className = "product-table-placeholder";
        placeholder.setAttribute("aria-hidden", "true");
        placeholder.innerHTML = "&#128717;";
        image.replaceWith(placeholder);
      }, { once: true });
    });
  }

  function renderCategories() {
    elements.categoryList.innerHTML = state.categories.map(function (category) {
      const productCount = state.products.filter(function (product) {
        return product.categoryId === category.id;
      }).length;
      return '<li class="category-admin-item"><div><strong>' + escapeHtml(category.name) + "</strong><small>Ordem " +
        category.order + " · " + productCount + (productCount === 1 ? " produto" : " produtos") + " · " +
        (category.active ? "Ativa" : "Inativa") + '</small></div><div class="row-actions">' +
        '<button class="action-button" type="button" data-edit-category="' + escapeHtml(category.id) + '">Editar</button>' +
        '<button class="action-button danger" type="button" data-delete-category="' + escapeHtml(category.id) + '">Excluir</button>' +
        "</div></li>";
    }).join("") || '<li class="empty-cart"><strong>Nenhuma categoria cadastrada</strong></li>';

    elements.categorySelect.innerHTML = state.categories.map(function (category) {
      return '<option value="' + escapeHtml(category.id) + '">' + escapeHtml(category.name) + "</option>";
    }).join("");
  }

  function renderSettings() {
    const form = elements.settingsForm.elements;
    form.name.value = state.settings.name || "";
    form.address.value = state.settings.address || "";
    form.whatsapp.value = state.settings.whatsapp || "";
    form.deliveryFee.value = Number(state.settings.deliveryFee || 0).toFixed(2);
    form.estimatedTime.value = state.settings.estimatedTime || "";
    form.isOpen.value = String(state.settings.isOpen);
  }

  function dateTime(value) {
    if (!value) {
      return "-";
    }
    return new Intl.DateTimeFormat("pt-BR", {
      dateStyle: "short",
      timeStyle: "short"
    }).format(new Date(value));
  }

  function statusOptions(current) {
    const statuses = ["novo", "confirmado", "em preparo", "saiu para entrega", "entregue", "cancelado"];
    if (current && !statuses.includes(current)) {
      statuses.unshift(current);
    }
    return statuses.map(function (status) {
      return '<option value="' + escapeHtml(status) + '"' + (status === current ? " selected" : "") + ">" +
        escapeHtml(status) + "</option>";
    }).join("");
  }

  function renderOrders() {
    elements.ordersBody.innerHTML = state.orders.map(function (order) {
      return "<tr>" +
        "<td><strong>#" + escapeHtml(String(order.id).slice(0, 8)) + "</strong></td>" +
        "<td>" + escapeHtml(order.nome_cliente) + "</td>" +
        "<td>" + data.formatMoney(order.total) + "</td>" +
        "<td>" + escapeHtml(order.forma_entrega) + "</td>" +
        '<td><select class="order-status" data-order-status="' + escapeHtml(order.id) + '">' +
        statusOptions(order.status || "novo") + "</select></td>" +
        "<td>" + escapeHtml(dateTime(order.created_at)) + "</td>" +
        "</tr>";
    }).join("");
    if (!state.orders.length) {
      elements.ordersBody.innerHTML = '<tr><td colspan="6" class="empty-table">Nenhum pedido recebido.</td></tr>';
    }
  }

  function renderAll() {
    renderDashboard();
    renderProducts();
    renderCategories();
    renderSettings();
    renderOrders();
  }

  async function refresh() {
    await loadState();
    renderAll();
  }

  async function pollNewOrders() {
    const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    try {
      const orders = await data.getRecentNewOrders(twoMinutesAgo);
      const unalerted = orders.filter(function (order) {
        return !state.notifiedOrderIds.has(String(order.id));
      });
      if (unalerted.length) {
        unalerted.slice().reverse().forEach(function (order) {
          state.notifiedOrderIds.add(String(order.id));
          playNotificationSound();
          showOrderAlert(order);
        });
        state.orders = await data.getOrders();
        renderOrders();
      }
    } catch (error) {
      console.error("Falha ao buscar novos pedidos:", error);
    }
  }

  function startOrderPolling() {
    pollNewOrders();
    state.pollingTimer = window.setInterval(pollNewOrders, 30000);
  }

  function releasePreviewUrl() {
    if (state.imageUpload.previewUrl) {
      URL.revokeObjectURL(state.imageUpload.previewUrl);
      state.imageUpload.previewUrl = "";
    }
  }

  function imageFileName(url) {
    if (!url) {
      return "";
    }
    try {
      return decodeURIComponent(url.split("/").pop().split("?")[0]);
    } catch (error) {
      return "Imagem atual";
    }
  }

  function renderImageUpload() {
    releasePreviewUrl();
    let previewUrl = "";
    let fileName = "";
    if (state.imageUpload.file) {
      state.imageUpload.previewUrl = URL.createObjectURL(state.imageUpload.file);
      previewUrl = state.imageUpload.previewUrl;
      fileName = state.imageUpload.file.name;
    } else if (state.imageUpload.currentUrl && !state.imageUpload.removeCurrent) {
      previewUrl = state.imageUpload.currentUrl;
      fileName = imageFileName(state.imageUpload.currentUrl) || "Imagem atual";
    }
    const hasImage = Boolean(previewUrl);
    elements.imagePrompt.classList.toggle("is-hidden", hasImage);
    elements.selectedImagePreview.classList.toggle("is-hidden", !hasImage);
    if (hasImage) {
      elements.productPreview.src = previewUrl;
      elements.productImageFilename.textContent = fileName;
    } else {
      elements.productPreview.removeAttribute("src");
      elements.productImageFilename.textContent = "";
    }
  }

  function resetImageUpload(product) {
    releasePreviewUrl();
    state.imageUpload.file = null;
    state.imageUpload.currentUrl = product && product.image ? product.image : "";
    state.imageUpload.removeCurrent = false;
    elements.imageInput.value = "";
    renderImageUpload();
  }

  function selectImageFile(file) {
    const acceptedTypes = ["image/jpeg", "image/png", "image/webp"];
    const acceptedName = /\.(jpe?g|png|webp)$/i.test(file.name);
    if (!acceptedTypes.includes(file.type) || !acceptedName) {
      toast("Selecione uma imagem JPG, PNG ou WEBP.", "error");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast("A imagem deve ter no máximo 5MB.", "error");
      return;
    }
    state.imageUpload.file = file;
    state.imageUpload.removeCurrent = false;
    renderImageUpload();
  }

  function removeSelectedImage(event) {
    event.stopPropagation();
    if (state.imageUpload.file) {
      state.imageUpload.file = null;
    } else {
      state.imageUpload.removeCurrent = true;
    }
    elements.imageInput.value = "";
    renderImageUpload();
  }

  function showProductModal(product) {
    elements.productForm.reset();
    elements.productForm.elements.id.value = product ? product.id : "";
    elements.productForm.elements.name.value = product ? product.name : "";
    elements.productForm.elements.description.value = product ? product.description : "";
    elements.productForm.elements.price.value = product ? product.price : "";
    elements.productForm.elements.categoryId.value = product ? product.categoryId : (state.categories[0] ? state.categories[0].id : "");
    elements.productForm.elements.available.checked = product ? product.available : true;
    document.getElementById("product-modal-title").textContent = product ? "Editar produto" : "Novo produto";
    resetImageUpload(product);
    elements.productModal.showModal();
  }

  function showCategoryModal(category) {
    elements.categoryForm.reset();
    elements.categoryForm.elements.id.value = category ? category.id : "";
    elements.categoryForm.elements.name.value = category ? category.name : "";
    elements.categoryForm.elements.order.value = category ? category.order : state.categories.length + 1;
    elements.categoryForm.elements.active.checked = category ? category.active : true;
    document.getElementById("category-modal-title").textContent = category ? "Editar categoria" : "Nova categoria";
    elements.categoryModal.showModal();
  }

  async function saveProduct(event) {
    event.preventDefault();
    if (!state.categories.length) {
      toast("Crie uma categoria antes de cadastrar produtos.", "error");
      return;
    }
    const form = elements.productForm.elements;
    const existingProduct = form.id.value
      ? state.products.find(function (item) { return item.id === form.id.value; })
      : null;
    const product = {
      name: form.name.value,
      description: form.description.value,
      price: Number(form.price.value),
      categoryId: form.categoryId.value,
      image: existingProduct ? existingProduct.image : "",
      available: form.available.checked,
      order: form.id.value
        ? existingProduct.order
        : Math.max(0, ...state.products.map(function (item) { return Number(item.order || 0); })) + 1
    };
    try {
      if (state.imageUpload.file) {
        const upload = await data.uploadProductImage(state.imageUpload.file);
        if (existingProduct && existingProduct.image) {
          await data.removeProductImage(existingProduct.image);
        }
        product.image = upload.url;
      } else if (state.imageUpload.removeCurrent && existingProduct && existingProduct.image) {
        await data.removeProductImage(existingProduct.image);
        product.image = "";
      }
      const savedProduct = form.id.value
        ? await data.updateProduct(form.id.value, product)
        : await data.createProduct(product);
      console.log("Produto salvo no Supabase:", savedProduct);
      elements.productModal.close();
      await refresh();
      toast(form.id.value ? "Produto atualizado." : "Produto criado.");
    } catch (error) {
      toast("Não foi possível salvar o produto.", "error");
    }
  }

  async function saveCategory(event) {
    event.preventDefault();
    const form = elements.categoryForm.elements;
    const category = {
      name: form.name.value,
      order: Number(form.order.value),
      active: form.active.checked
    };
    try {
      if (form.id.value) {
        await data.updateCategory(form.id.value, category);
      } else {
        await data.createCategory(category);
      }
      elements.categoryModal.close();
      await refresh();
      toast(form.id.value ? "Categoria atualizada." : "Categoria criada.");
    } catch (error) {
      toast("Não foi possível salvar a categoria.", "error");
    }
  }

  async function saveSettings(event) {
    event.preventDefault();
    if (!state.settings.id) {
      toast("Configuração da loja não encontrada.", "error");
      return;
    }
    const form = new FormData(elements.settingsForm);
    try {
      await data.saveSettings({
        id: state.settings.id,
        name: form.get("name"),
        address: form.get("address"),
        whatsapp: form.get("whatsapp"),
        deliveryFee: form.get("deliveryFee"),
        estimatedTime: form.get("estimatedTime"),
        isOpen: form.get("isOpen") === "true"
      });
      await refresh();
      toast("Configurações salvas.");
    } catch (error) {
      toast("Não foi possível salvar as configurações.", "error");
    }
  }

  async function handleProductAction(event) {
    const editButton = event.target.closest("[data-edit-product]");
    const toggleButton = event.target.closest("[data-toggle-product]");
    const deleteButton = event.target.closest("[data-delete-product]");
    if (editButton) {
      showProductModal(state.products.find(function (product) { return product.id === editButton.dataset.editProduct; }));
      return;
    }
    try {
      if (toggleButton) {
        const product = state.products.find(function (item) { return item.id === toggleButton.dataset.toggleProduct; });
        await data.toggleProduct(product.id, !product.available);
        await refresh();
        toast("Disponibilidade atualizada.");
      }
      if (deleteButton && window.confirm("Excluir este produto permanentemente?")) {
        await data.deleteProduct(deleteButton.dataset.deleteProduct);
        await refresh();
        toast("Produto excluído.");
      }
    } catch (error) {
      toast("Não foi possível atualizar o produto.", "error");
    }
  }

  async function handleCategoryAction(event) {
    const editButton = event.target.closest("[data-edit-category]");
    const deleteButton = event.target.closest("[data-delete-category]");
    if (editButton) {
      showCategoryModal(state.categories.find(function (category) { return category.id === editButton.dataset.editCategory; }));
      return;
    }
    if (deleteButton && window.confirm("Excluir esta categoria?")) {
      try {
        await data.deleteCategory(deleteButton.dataset.deleteCategory);
        await refresh();
        toast("Categoria excluída.");
      } catch (error) {
        toast(error.message === "CATEGORY_HAS_PRODUCTS"
          ? "Remova ou mova os produtos antes de excluir a categoria."
          : "Não foi possível excluir a categoria.", "error");
      }
    }
  }

  async function handleOrderStatus(event) {
    const select = event.target.closest("[data-order-status]");
    if (!select) {
      return;
    }
    select.disabled = true;
    try {
      await data.updateOrderStatus(select.dataset.orderStatus, select.value);
      await refresh();
      toast("Status do pedido atualizado.");
    } catch (error) {
      select.disabled = false;
      toast("Não foi possível atualizar o pedido.", "error");
    }
  }

  function bindEvents() {
    document.getElementById("logout-button").addEventListener("click", window.WMAuth.logout);
    document.getElementById("new-product-button").addEventListener("click", function () {
      showProductModal();
    });
    document.getElementById("new-category-button").addEventListener("click", function () {
      showCategoryModal();
    });
    elements.productBody.addEventListener("click", handleProductAction);
    elements.categoryList.addEventListener("click", handleCategoryAction);
    elements.ordersBody.addEventListener("change", handleOrderStatus);
    elements.enableAudioAlerts.addEventListener("click", enableAudioAlerts);
    elements.productForm.addEventListener("submit", saveProduct);
    elements.categoryForm.addEventListener("submit", saveCategory);
    elements.settingsForm.addEventListener("submit", saveSettings);
    elements.imageDropzone.addEventListener("click", function (event) {
      if (!event.target.closest("#remove-product-image")) {
        elements.imageInput.click();
      }
    });
    elements.imageDropzone.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        elements.imageInput.click();
      }
    });
    elements.imageInput.addEventListener("change", function () {
      if (elements.imageInput.files[0]) {
        selectImageFile(elements.imageInput.files[0]);
      }
    });
    ["dragenter", "dragover"].forEach(function (eventName) {
      elements.imageDropzone.addEventListener(eventName, function (event) {
        event.preventDefault();
        elements.imageDropzone.classList.add("drag-over");
      });
    });
    ["dragleave", "drop"].forEach(function (eventName) {
      elements.imageDropzone.addEventListener(eventName, function (event) {
        event.preventDefault();
        elements.imageDropzone.classList.remove("drag-over");
      });
    });
    elements.imageDropzone.addEventListener("drop", function (event) {
      if (event.dataTransfer.files[0]) {
        selectImageFile(event.dataTransfer.files[0]);
      }
    });
    elements.removeProductImage.addEventListener("click", removeSelectedImage);
    elements.productPreview.addEventListener("error", function () {
      toast("Não foi possível carregar a imagem selecionada.", "error");
      elements.productPreview.src = data.placeholderImage(elements.productForm.elements.name.value || "Produto");
    });
    document.querySelectorAll("[data-close-modal]").forEach(function (button) {
      button.addEventListener("click", function () {
        document.getElementById(button.dataset.closeModal).close();
      });
    });
  }

  (async function initialize() {
    if (!await window.WMAuth.requireAuth()) {
      return;
    }
    bindEvents();
    data.checkProductBucket();
    try {
      await refresh();
      startOrderPolling();
    } catch (error) {
      console.error("Falha ao carregar painel:", error);
      toast("Não foi possível carregar os dados do painel.", "error");
    }
  })();
})();
