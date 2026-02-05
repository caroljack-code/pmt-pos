// State
let products = [];
let cart = [];
let authToken = localStorage.getItem('pos_token');
let API_BASE = (localStorage.getItem('pos_api_base') || '').replace(/\/$/, '');
let userRole = localStorage.getItem('pos_role');
let userName = localStorage.getItem('pos_username');
const VAT_RATE = 0.16;

// DOM Elements
const productsListEl = document.getElementById('products-list');
const cartItemsEl = document.getElementById('cart-items');
const cartTotalEl = document.getElementById('cart-total');
const cartSubtotalEl = document.getElementById('cart-subtotal');
const checkoutBtn = document.getElementById('checkout-btn');
const receiptModal = document.getElementById('receipt-modal');
const receiptDetailsEl = document.getElementById('receipt-details');
const productSearchInput = document.getElementById('product-search');
const loginModal = document.getElementById('login-modal');
const barcodeInput = document.getElementById('barcode-input');
const paymentMethodEl = document.getElementById('payment-method');
const paymentRefEl = document.getElementById('payment-ref');
const paymentRefRow = document.getElementById('payment-ref-row');

// --- Auth Functions ---
window.logout = function() {
    if (confirm('Are you sure you want to logout?')) {
        authToken = null;
        userRole = null;
        userName = null;
        localStorage.removeItem('pos_token');
        localStorage.removeItem('pos_role');
        localStorage.removeItem('pos_username');
        window.location.reload();
    }
};

window.resetApp = function() {
    if (confirm('Troubleshoot: This will clear all local data and reload. Continue?')) {
        localStorage.clear();
        window.location.reload();
    }
};

async function login() {
    const usernameInput = document.getElementById('login-username');
    const passwordInput = document.getElementById('login-password');
    const errorEl = document.getElementById('login-error');
    
    const username = usernameInput.value;
    const password = passwordInput.value;
    
    if (!username || !password) {
        errorEl.textContent = 'Please enter username and password';
        errorEl.style.display = 'block';
        return;
    }
    
    try {
        const loginUrl = (API_BASE ? API_BASE : '') + '/api/login';
        const response = await fetch(loginUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            authToken = result.token;
            userRole = result.role;
            userName = result.username;
            localStorage.setItem('pos_token', authToken);
            localStorage.setItem('pos_role', userRole);
            localStorage.setItem('pos_username', userName);
            
            loginModal.style.display = 'none';
            document.querySelector('.user-profile span').textContent = userName + ' (' + userRole + ')';
            setupRoleUI();
            fetchProducts();
        } else {
            errorEl.textContent = result.message || 'Login failed';
            errorEl.style.display = 'block';
        }
    } catch (error) {
        errorEl.textContent = 'Connection error';
        errorEl.style.display = 'block';
    }
}

// Check auth on load
if (authToken) {
    loginModal.style.display = 'none';
    userName = localStorage.getItem('pos_username') || userName || '';
    if (userName && userRole) {
        const userDisplay = document.getElementById('user-display-name') || document.querySelector('.user-profile span');
        if (userDisplay) userDisplay.textContent = userName + ' (' + userRole + ')';
    }
    setupRoleUI();
    fetchProducts();
    loadBrandLogo();
    if (barcodeInput) {
        barcodeInput.focus();
    }
    if (paymentMethodEl) {
        const v = paymentMethodEl.value;
        const needsRef = ['mpesa', 'bank', 'card', 'cheque'].includes(v);
        if (paymentRefRow) {
            paymentRefRow.style.display = needsRef ? '' : 'none';
            updateRefPlaceholder(v);
        }
    }
} else {
    loginModal.style.display = 'block';
    loadBrandLogo();
}

function updateRefPlaceholder(method) {
    if (!paymentRefEl) return;
    if (method === 'mpesa') paymentRefEl.placeholder = 'M-Pesa Code';
    else if (method === 'bank') paymentRefEl.placeholder = 'Transaction Ref';
    else if (method === 'card') paymentRefEl.placeholder = 'Last 4 Digits / Ref';
    else if (method === 'cheque') paymentRefEl.placeholder = 'Cheque Number';
    else paymentRefEl.placeholder = 'Reference';
}

// API Helper
async function apiCall(url, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };
    
    if (authToken) {
        headers['Authorization'] = `Bearer ${authToken}`;
    }
    
    const fullUrl = url.startsWith('/api/') && API_BASE ? (API_BASE + url) : url;
    const response = await fetch(fullUrl, { ...options, headers });
    
    if (response.status === 401) {
        // Token expired or invalid
        authToken = null;
        localStorage.removeItem('pos_token');
        loginModal.style.display = 'block';
        throw new Error('Unauthorized');
    }
    
    return response;
}
window.setApiBase = function() {
    const current = API_BASE || '';
    const next = prompt('Enter Backend URL (e.g., https://example.com)', current);
    if (next !== null) {
        API_BASE = (next || '').replace(/\/$/, '');
        localStorage.setItem('pos_api_base', API_BASE);
        window.location.reload();
    }
};

// --- Navigation ---
function getAllowedTabs(role) {
    if (role === 'cashier') return ['pos'];
    if (role === 'admin') return ['pos', 'reports', 'inventory', 'users'];
    return ['pos', 'reports', 'backups', 'inventory', 'users'];
}

function setupRoleUI() {
    const role = userRole;
    const allowed = getAllowedTabs(role);
    const reports = document.getElementById('nav-reports');
    const inventory = document.getElementById('nav-inventory');
    const backups = document.getElementById('nav-backups');
    const users = document.getElementById('nav-users');
    const adminPanel = document.getElementById('product-admin-panel');
    if (reports) reports.style.display = allowed.includes('reports') ? '' : 'none';
    if (inventory) inventory.style.display = role === 'cashier' ? 'none' : '';
    if (backups) backups.style.display = allowed.includes('backups') ? '' : 'none';
    if (users) users.style.display = allowed.includes('users') ? '' : 'none';
    if (adminPanel) adminPanel.style.display = (role === 'admin' || role === 'super_admin') ? '' : 'none';
}

window.switchTab = function(tabName) {
    const allowed = getAllowedTabs(userRole);
    if (!allowed.includes(tabName)) tabName = 'pos';
    document.querySelectorAll('.view-section').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-links li').forEach(el => el.classList.remove('active'));
    
    if (tabName === 'pos') {
        document.getElementById('pos-view').style.display = 'flex';
        document.getElementById('pos-view').classList.add('active');
        document.querySelector('.nav-links li:nth-child(1)').classList.add('active');
        if (barcodeInput) {
            barcodeInput.focus();
        }
        if (userRole === 'admin') {
            fetchLowStockAlerts();
        }
    } else if (tabName === 'reports') {
        document.getElementById('reports-view').style.display = 'block';
        document.getElementById('reports-view').classList.add('active');
        document.querySelector('.nav-links li:nth-child(2)').classList.add('active');
        fetchDailyReport();
    } else if (tabName === 'backups') {
        document.getElementById('backups-view').style.display = 'block';
        document.getElementById('backups-view').classList.add('active');
        document.querySelector('.nav-links li:nth-child(3)').classList.add('active');
    } else if (tabName === 'inventory') {
        document.getElementById('inventory-view').style.display = 'block';
        document.getElementById('inventory-view').classList.add('active');
        document.querySelector('.nav-links li:nth-child(4)').classList.add('active');
        fetchInventory();
    } else if (tabName === 'users') {
        document.getElementById('users-view').style.display = 'block';
        document.getElementById('users-view').classList.add('active');
        document.querySelector('.nav-links li:nth-child(5)').classList.add('active');
        fetchUsers();
    }
};

// --- Inventory Management ---
async function fetchInventory() {
    try {
        const response = await apiCall('/api/products');
        const result = await response.json();
        if (response.ok && result.message === 'success') {
            products = result.data;
            renderInventory(products);
        }
    } catch (e) {
        const tbody = document.getElementById('inventory-body');
        if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="color:red;">Failed to load products</td></tr>';
    }
}

function renderInventory(rows) {
    const tbody = document.getElementById('inventory-body');
    if (!tbody) return;
    if (!rows || rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No products</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map(r => {
        const thr = r.low_stock_threshold == null ? '' : r.low_stock_threshold;
        return `
            <tr>
                <td>${r.name}</td>
                <td>${r.category || ''}</td>
                <td>KES ${Number(r.price || 0).toLocaleString()}</td>
                <td>
                    <input id="inv-stock-${r.id}" type="number" value="${r.stock}" style="width:90px;padding:0.4rem;border:1px solid var(--border-color);border-radius:6px;">
                </td>
                <td>
                    <input id="inv-thr-${r.id}" type="number" value="${thr}" placeholder="-" style="width:120px;padding:0.4rem;border:1px solid var(--border-color);border-radius:6px;">
                </td>
                <td style="display:flex;gap:0.5rem;">
                    <button class="secondary-btn" style="padding:0.4rem 0.6rem;" onclick="updateStock(${r.id})">Save Stock</button>
                    <button class="secondary-btn" style="padding:0.4rem 0.6rem;" onclick="updateThreshold(${r.id})">Save Threshold</button>
                </td>
            </tr>
        `;
    }).join('');
}

window.updateStock = async function(id) {
    const el = document.getElementById(`inv-stock-${id}`);
    if (!el) return;
    const stock = parseInt(el.value, 10);
    if (Number.isNaN(stock)) { alert('Invalid stock'); return; }
    try {
        const response = await apiCall(`/api/products/${id}/stock`, {
            method: 'PUT',
            body: JSON.stringify({ stock })
        });
        const result = await response.json();
        if (response.ok && result.message === 'success') {
            alert('Stock updated');
            fetchInventory();
        } else {
            alert('Update failed: ' + (result.error || 'Unknown error'));
        }
    } catch (e) {
        alert('Connection error');
    }
};

window.updateThreshold = async function(id) {
    const el = document.getElementById(`inv-thr-${id}`);
    if (!el) return;
    const thr = parseInt(el.value, 10);
    if (Number.isNaN(thr)) { alert('Invalid threshold'); return; }
    try {
        const response = await apiCall(`/api/products/${id}/threshold`, {
            method: 'PUT',
            body: JSON.stringify({ low_stock_threshold: thr })
        });
        const result = await response.json();
        if (response.ok && result.message === 'success') {
            alert('Threshold updated');
            fetchInventory();
        } else {
            alert('Update failed: ' + (result.error || 'Unknown error'));
        }
    } catch (e) {
        alert('Connection error');
    }
};
// --- Branding: Upload Logo ---
async function uploadLogo(file) {
    try {
        const form = new FormData();
        form.append('file', file);
        const response = await fetch('/api/branding/logo', {
            method: 'POST',
            headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {},
            body: form
        });
        const result = await response.json();
        if (response.ok && result.message === 'success') {
            const logoEl = document.getElementById('app-logo');
            if (logoEl) {
                const url = result.image_url + '?t=' + Date.now();
                logoEl.src = url;
                logoEl.style.display = 'inline-block';
                const fallback = document.querySelector('.fallback-logo');
                if (fallback) fallback.style.display = 'none';
            }
            alert('Logo updated successfully');
        } else {
            alert('Logo update failed: ' + (result.error || 'Unknown error'));
        }
    } catch (e) {
        alert('Failed to update logo');
    }
}

window.uploadLogoClick = function() {
    if (!(userRole === 'admin' || userRole === 'super_admin')) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
        const file = input.files && input.files[0];
        if (!file) return;
        uploadLogo(file);
    };
    input.click();
};

async function loadBrandLogo() {
    try {
        const response = await fetch('/api/branding/logo');
        if (!response.ok) return;
        const result = await response.json();
        const url = result.image_url;
        const logoEl = document.getElementById('app-logo');
        if (logoEl && url) {
            logoEl.src = url + '?t=' + Date.now();
            logoEl.style.display = 'inline-block';
            const fallback = document.querySelector('.fallback-logo');
            if (fallback) fallback.style.display = 'none';
        }
    } catch (e) {
        // ignore
    }
}

// --- Users Management ---
async function fetchUsers() {
    try {
        const response = await apiCall('/api/users?role=cashier');
        const result = await response.json();
        const tbody = document.getElementById('users-body');
        if (!tbody) return;
        if (response.ok && result.message === 'success') {
            renderUsers(result.data || []);
        } else {
            tbody.innerHTML = '<tr><td colspan="3" style="color:red;">Failed to load users</td></tr>';
        }
    } catch (e) {
        const tbody = document.getElementById('users-body');
        if (tbody) tbody.innerHTML = '<tr><td colspan="3" style="color:red;">Connection error</td></tr>';
    }
}

function renderUsers(rows) {
    const tbody = document.getElementById('users-body');
    if (!tbody) return;
    if (!rows || rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">No cashiers</td></tr>';
        return;
    }
    tbody.innerHTML = rows.map(u => `
        <tr>
            <td>${u.id}</td>
            <td>${u.username}</td>
            <td>${u.role}</td>
        </tr>
    `).join('');
}

window.createUser = async function() {
    const uEl = document.getElementById('new-user-username');
    const pEl = document.getElementById('new-user-password');
    const err = document.getElementById('new-user-error');
    if (!uEl || !pEl) return;
    const username = (uEl.value || '').trim();
    const password = (pEl.value || '').trim();
    if (!username || !password) {
        if (err) { err.textContent = 'Username and password required'; err.style.display = 'block'; }
        return;
    }
    try {
        const response = await apiCall('/api/users', {
            method: 'POST',
            body: JSON.stringify({ username, password, role: 'cashier' })
        });
        const result = await response.json();
        if (response.ok && result.message === 'success') {
            if (err) { err.style.display = 'none'; }
            uEl.value = '';
            pEl.value = '';
            fetchUsers();
            alert('Cashier created');
        } else {
            if (err) { err.textContent = result.error || 'Create failed'; err.style.display = 'block'; }
        }
    } catch (e) {
        if (err) { err.textContent = 'Connection error'; err.style.display = 'block'; }
    }
};

window.changeMyPassword = async function() {
    const oldEl = document.getElementById('my-old-password');
    const newEl = document.getElementById('my-new-password');
    const err = document.getElementById('my-password-error');
    if (!oldEl || !newEl) return;
    const old_password = (oldEl.value || '').trim();
    const new_password = (newEl.value || '').trim();
    if (!old_password || !new_password) {
        if (err) { err.textContent = 'Both fields required'; err.style.display = 'block'; }
        return;
    }
    try {
        const response = await apiCall('/api/me/password', {
            method: 'POST',
            body: JSON.stringify({ old_password, new_password })
        });
        const result = await response.json();
        if (response.ok && result.message === 'success') {
            if (err) { err.style.display = 'none'; }
            oldEl.value = '';
            newEl.value = '';
            alert('Password updated');
        } else {
            if (err) { err.textContent = result.error || 'Update failed'; err.style.display = 'block'; }
        }
    } catch (e) {
        if (err) { err.textContent = 'Connection error'; err.style.display = 'block'; }
    }
};
// --- POS Functions ---

// Fetch products from API
async function fetchProducts() {
    try {
        const response = await apiCall('/api/products');
        const result = await response.json();
        if (result.message === 'success') {
            products = result.data;
            renderProducts(products);
            if (userRole === 'admin') {
                fetchLowStockAlerts();
            }
        }
    } catch (error) {
        console.error('Error fetching products:', error);
        // Only show error if not auth error (handled by apiCall)
        if (error.message !== 'Unauthorized') {
             productsListEl.innerHTML = '<p class="error">Failed to load products. Make sure server is running.</p>';
        }
    }
}

// Render products to the grid
function renderProducts(productsToRender) {
    productsListEl.innerHTML = '';
    productsToRender.forEach(product => {
        const productCard = document.createElement('div');
        productCard.className = 'product-card' + (product.low_stock ? ' low-stock' : '');
        const imgHtml = product.image_url ? `<img src="${product.image_url}" alt="${product.name}" style="width:100%;height:160px;object-fit:cover;border-radius:12px;margin-bottom:8px;">` : '';
        const adminControls = userRole === 'admin' || userRole === 'super_admin'
            ? `<div style="display:flex;gap:8px;margin-top:8px;">
                   <button onclick="setProductImage(${product.id})" class="secondary-btn" style="padding:6px 10px;">Set Image</button>
                   ${product.image_url ? `<button onclick="removeProductImage(${product.id})" class="secondary-btn danger" style="padding:6px 10px;">Remove</button>` : ''}
               </div>`
            : '';
        productCard.innerHTML = `
            ${product.low_stock ? '<span class="low-stock-badge"><i class="fa-solid fa-triangle-exclamation"></i> Low stock</span>' : ''}
            ${imgHtml}
            <h3>${product.name}</h3>
            <p class="category">${product.category}</p>
            <p class="price">KES ${product.price.toLocaleString()}</p>
            <p class="stock">Stock: ${product.stock}</p>
            <button onclick="addToCart(${product.id})" ${product.stock === 0 ? 'disabled' : ''}>
                ${product.stock === 0 ? 'Out of Stock' : '<i class="fa-solid fa-cart-plus"></i> Add to Cart'}
            </button>
            ${adminControls}
        `;
        productsListEl.appendChild(productCard);
    });
    ensureBarcodeFocus();
}

window.setProductImage = async function(productId) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async () => {
        const file = input.files && input.files[0];
        if (!file) return;
        await uploadProductImage(productId, file);
    };
    input.click();
};

window.removeProductImage = async function(productId) {
    if (!confirm('Remove product image?')) return;
    try {
        const response = await apiCall(`/api/products/${productId}/image`, {
            method: 'DELETE'
        });
        const result = await response.json();
        if (response.ok && result.message === 'success') {
            fetchProducts();
        } else {
            alert('Remove failed: ' + (result.error || 'Unknown error'));
        }
    } catch (e) {
        alert('Failed to remove image');
    }
};

async function uploadProductImage(productId, file) {
    try {
        const form = new FormData();
        form.append('file', file);
        const response = await fetch(`/api/products/${productId}/image/upload`, {
            method: 'POST',
            headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {},
            body: form
        });
        const result = await response.json();
        if (response.ok && result.message === 'success') {
            fetchProducts();
        } else {
            alert('Image upload failed: ' + (result.error || 'Unknown error'));
        }
    } catch (e) {
        alert('Failed to upload image');
    }
}
// Search Functionality
if (productSearchInput) {
    productSearchInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        const filteredProducts = products.filter(product => 
            product.name.toLowerCase().includes(searchTerm) || 
            product.category.toLowerCase().includes(searchTerm)
        );
        renderProducts(filteredProducts);
    });
}

// Payment method listener removed (replaced by handlePaymentChange above)

// Add item to cart
window.addToCart = function(productId) {
    const product = products.find(p => p.id === productId);
    if (!product || product.stock === 0) return;

    const cartItem = cart.find(item => item.productId === productId);
    if (cartItem) {
        if (cartItem.quantity < product.stock) {
            cartItem.quantity++;
        } else {
            alert('Cannot add more than available stock');
        }
    } else {
        cart.push({
            productId: product.id,
            name: product.name,
            price: product.price,
            quantity: 1
        });
    }
    renderCart();
};

function processBarcode(code) {
    const cleaned = (code || '').trim();
    if (!cleaned) return;
    const product = products.find(p => String(p.barcode || '').trim() === cleaned);
    if (product) {
        addToCart(product.id);
    } else {
        apiBarcodeLookup(cleaned);
    }
}

async function apiBarcodeLookup(code) {
    try {
        const response = await apiCall(`/api/products/barcode/${encodeURIComponent(code)}`);
        const result = await response.json();
        if (response.ok && result.message === 'success' && result.data) {
            const p = result.data;
            const existing = products.find(pr => pr.id === p.id);
            if (!existing) {
                products.push(p);
            }
            if (p.stock > 0) {
                addToCart(p.id);
            }
        }
    } catch (e) {
        console.error('Barcode lookup failed', e);
    }
}

if (barcodeInput) {
    barcodeInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            processBarcode(barcodeInput.value);
            barcodeInput.value = '';
            barcodeInput.focus();
        }
    });
    barcodeInput.addEventListener('blur', () => {
        setTimeout(() => {
            const el = document.activeElement;
            const tag = (el && el.tagName || '').toLowerCase();
            const isInputLike = tag === 'input' || tag === 'textarea' || (el && el.isContentEditable);
            if (!isInputLike) barcodeInput.focus();
        }, 0);
    });
}

// Remove item from cart
window.removeFromCart = function(productId) {
    const index = cart.findIndex(item => item.productId === productId);
    if (index !== -1) {
        cart.splice(index, 1);
        renderCart();
    }
};

// Clear Cart
window.clearCart = function() {
    if (confirm('Are you sure you want to clear the cart?')) {
        cart = [];
        renderCart();
    }
};

// Update quantity
window.updateQuantity = function(productId, change) {
    const cartItem = cart.find(item => item.productId === productId);
    const product = products.find(p => p.id === productId);
    
    if (cartItem && product) {
        const newQuantity = cartItem.quantity + change;
        if (newQuantity > 0 && newQuantity <= product.stock) {
            cartItem.quantity = newQuantity;
        } else if (newQuantity <= 0) {
            removeFromCart(productId);
            return;
        }
    }
    renderCart();
};

// Render cart items
function renderCart() {
    cartItemsEl.innerHTML = '';
    let total = 0;

    if (cart.length === 0) {
        cartItemsEl.innerHTML = '<p class="empty-cart-msg">No items added</p>';
        checkoutBtn.disabled = true;
    } else {
        cart.forEach(item => {
            const itemTotal = item.price * item.quantity;
            total += itemTotal;
            
            const cartItemEl = document.createElement('div');
            cartItemEl.className = 'cart-item';
            cartItemEl.innerHTML = `
                <div class="item-info">
                    <h4>${item.name}</h4>
                    <p>KES ${item.price.toLocaleString()} x ${item.quantity}</p>
                </div>
                <div class="item-actions">
                    <button onclick="updateQuantity(${item.productId}, -1)"><i class="fa-solid fa-minus"></i></button>
                    <span>${item.quantity}</span>
                    <button onclick="updateQuantity(${item.productId}, 1)"><i class="fa-solid fa-plus"></i></button>
                    <button class="remove-btn" onclick="removeFromCart(${item.productId})"><i class="fa-solid fa-times"></i></button>
                </div>
            `;
            cartItemsEl.appendChild(cartItemEl);
        });
        checkoutBtn.disabled = false;
    }

    if (cartSubtotalEl) cartSubtotalEl.textContent = `KES ${total.toLocaleString()}`;
    cartTotalEl.textContent = `KES ${total.toLocaleString()}`;
    ensureBarcodeFocus();
}

// Process Sale
checkoutBtn.addEventListener('click', async () => {
    if (cart.length === 0) return;

    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const vat = Math.round(subtotal * VAT_RATE);
    const total = subtotal + vat;
    const saleData = {
        total: total,
        items: cart,
        payment_method: paymentMethodEl ? paymentMethodEl.value : 'cash',
        payment_reference: paymentRefEl ? paymentRefEl.value.trim() : ''
    };

    try {
        checkoutBtn.disabled = true;
        checkoutBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';

        const response = await apiCall('/api/sales', {
            method: 'POST',
            body: JSON.stringify(saleData)
        });

        const result = await response.json();
        
        if (result.message === 'success') {
            const saleId = result.saleId;
            const items = [...cart];
            const saleSubtotal = subtotal;
            const saleVat = vat;
            const saleTotal = total;
            const method = saleData.payment_method;
            const reference = saleData.payment_reference;
            
            cart = [];
            renderCart();
            fetchProducts();
            
            showReceipt(saleId, items, saleSubtotal, saleVat, saleTotal, method, reference);
        } else {
            alert('Error processing sale: ' + result.error);
        }
    } catch (error) {
        console.error('Error:', error);
        alert('Failed to connect to server');
    } finally {
        checkoutBtn.disabled = false;
        checkoutBtn.innerHTML = '<span>Checkout</span> <i class="fa-solid fa-arrow-right"></i>';
        ensureBarcodeFocus();
    }
});

// --- Receipt Modal ---
function showReceipt(saleId, items, subtotal, vat, total, method, reference) {
    const date = new Date().toLocaleString();
    let itemsHtml = items.map(item => {
        const lineTotal = item.price * item.quantity;
        return `
            <div style="display:flex;justify-content:space-between;margin-bottom:5px;">
                <span>${item.name}</span>
                <span>${item.quantity} x KES ${item.price.toLocaleString()}</span>
                <span>KES ${lineTotal.toLocaleString()}</span>
            </div>
        `;
    }).join('');
    
    receiptDetailsEl.innerHTML = `
        <div style="text-align: center; margin-bottom: 15px; border-bottom: 1px dashed #ccc; padding-bottom: 10px;">
            <strong>PIMUT TRADERS</strong><br>
            Wholesale Shop<br>
            Tel: +254 700 000 000
        </div>
        <p><strong>Sale ID:</strong> #${saleId}</p>
        <p><strong>Date:</strong> ${date}</p>
        <p><strong>Cashier:</strong> ${userName || 'Unknown'}</p>
        <p><strong>Payment:</strong> ${method || 'cash'}${reference ? ' (' + reference + ')' : ''}</p>
        <hr style="border: 0; border-top: 1px dashed #ccc; margin: 10px 0;">
        ${itemsHtml}
        <hr style="border: 0; border-top: 1px dashed #ccc; margin: 10px 0;">
        <div style="display:flex;justify-content:space-between;"><span>Subtotal</span><span>KES ${subtotal.toLocaleString()}</span></div>
        <div style="display:flex;justify-content:space-between;"><span>VAT (${Math.round(VAT_RATE*100)}%)</span><span>KES ${vat.toLocaleString()}</span></div>
        <div style="display:flex;justify-content:space-between;font-weight:bold;font-size:1.1em;"><span>Total</span><span>KES ${total.toLocaleString()}</span></div>
        <div style="text-align: center; margin-top: 15px; font-size: 0.8em;">
            Thank you for shopping with us!
        </div>
    `;
    receiptModal.style.display = 'block';
}

window.closeReceipt = function() {
    receiptModal.style.display = 'none';
};

// Close modal when clicking X
document.querySelector('.close-modal').addEventListener('click', window.closeReceipt);

// Close modal when clicking outside
window.onclick = function(event) {
    if (event.target == receiptModal) {
        receiptModal.style.display = 'none';
    }
};

function ensureBarcodeFocus() {
    const posActive = document.getElementById('pos-view') && document.getElementById('pos-view').classList.contains('active');
    if (barcodeInput && posActive) {
        const el = document.activeElement;
        const tag = (el && el.tagName || '').toLowerCase();
        const isInputLike = tag === 'input' || tag === 'textarea' || (el && el.isContentEditable);
        if (!isInputLike || el === barcodeInput) {
            barcodeInput.focus();
        }
    }
}

document.addEventListener('keydown', (e) => {
    if (!barcodeInput) return;
    if (receiptModal && receiptModal.style.display === 'block') return;
    const tag = (e.target.tagName || '').toLowerCase();
    const isInputLike = tag === 'input' || tag === 'textarea' || e.target.isContentEditable;
    const isBarcodeFocused = document.activeElement === barcodeInput;
    if (!isBarcodeFocused && !isInputLike) {
        if (e.key.length === 1 && /[0-9A-Za-z]/.test(e.key)) {
            e.preventDefault();
            barcodeInput.focus();
            barcodeInput.value += e.key;
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const val = (barcodeInput.value || '').trim();
            if (val) {
                processBarcode(val);
                barcodeInput.value = '';
            }
            barcodeInput.focus();
        }
    }
});
async function downloadCSV(url, filename) {
    try {
        const response = await apiCall(url);
        if (!response.ok) {
            const err = await response.text();
            alert('Export failed: ' + err);
            return;
        }
        const blob = await response.blob();
        const link = document.createElement('a');
        const objUrl = URL.createObjectURL(blob);
        link.href = objUrl;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(objUrl);
    } catch (e) {
        alert('Export error');
    }
}

function downloadSalesCSV(useBackupInputs=false) {
    const startEl = document.getElementById(useBackupInputs ? 'backup-start' : 'report-start');
    const endEl = document.getElementById(useBackupInputs ? 'backup-end' : 'report-end');
    const start = startEl && startEl.value ? startEl.value : '';
    const end = endEl && endEl.value ? endEl.value : '';
    const url = start && end ? `/api/export/sales.csv?start=${start}&end=${end}` : '/api/export/sales.csv';
    downloadCSV(url, 'sales_export.csv');
}

function downloadProductsCSV() {
    const url = '/api/export/products.csv';
    downloadCSV(url, 'products_export.csv');
}
async function fetchLowStockAlerts() {
    const box = document.getElementById('low-stock-alerts');
    if (!box) return;
    try {
        const response = await apiCall('/api/products/low-stock');
        if (!response.ok) {
            box.style.display = 'none';
            return;
        }
        const result = await response.json();
        const rows = result.data || [];
        if (rows.length === 0) {
            box.style.display = 'none';
            box.innerHTML = '';
            return;
        }
        const names = rows.slice(0, 5).map(r => r.name).join(', ');
        const extra = rows.length > 5 ? ` +${rows.length - 5} more` : '';
        box.innerHTML = `<i class="fa-solid fa-bell"></i> Low stock: ${names}${extra}`;
        box.style.display = 'block';
    } catch (e) {
        const box2 = document.getElementById('low-stock-alerts');
        if (box2) box2.style.display = 'none';
    }
}
// --- Reports ---
async function fetchDailyReport() {
    const tbody = document.getElementById('daily-sales-body');
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">Loading...</td></tr>';
    
    try {
        const startEl = document.getElementById('report-start');
        const endEl = document.getElementById('report-end');
        const start = startEl && startEl.value ? startEl.value : '';
        const end = endEl && endEl.value ? endEl.value : '';
        const url = start && end ? `/api/reports/daily?start=${start}&end=${end}` : '/api/reports/daily';
        const response = await apiCall(url);
        const result = await response.json();
        
        if (result.message === 'success') {
            const data = result.data;
            if (data.length === 0) {
                tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;">No sales records found</td></tr>';
                return;
            }
            
            tbody.innerHTML = data.map(row => {
                const subtotal = (row.subtotal_sum || 0).toLocaleString();
                const vat = (row.vat_sum || 0).toLocaleString();
                const total = (row.total_sum || 0).toLocaleString();
                return `
                    <tr>
                        <td>${row.sale_date}</td>
                        <td>${row.total_sales || 0}</td>
                        <td>KES ${subtotal}</td>
                        <td>KES ${vat}</td>
                        <td>KES ${total}</td>
                    </tr>
                `;
            }).join('');
        } else {
            tbody.innerHTML = `<tr><td colspan="3" style="color: red;">Error: ${result.error || 'Unknown error'}</td></tr>`;
        }
    } catch (error) {
        console.error('Error fetching report:', error);
        tbody.innerHTML = '<tr><td colspan="3" style="color: red;">Failed to load report</td></tr>';
    }
}

async function fetchCashierReport() {
    const tbody = document.getElementById('cashier-sales-body');
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Loading...</td></tr>';
    try {
        const startEl = document.getElementById('report-start');
        const endEl = document.getElementById('report-end');
        const start = startEl && startEl.value ? startEl.value : '';
        const end = endEl && endEl.value ? endEl.value : '';
        const url = start && end ? `/api/reports/cashier?start=${start}&end=${end}` : '/api/reports/cashier';
        const response = await apiCall(url);
        const result = await response.json();
        if (result.message === 'success') {
            const rows = result.data;
            if (rows.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No data</td></tr>';
                return;
            }
            tbody.innerHTML = rows.map(r => `
                <tr>
                    <td>${r.cashier || 'Unknown'}</td>
                    <td>${r.total_sales || 0}</td>
                    <td>KES ${(r.subtotal_sum || 0).toLocaleString()}</td>
                    <td>KES ${(r.vat_sum || 0).toLocaleString()}</td>
                    <td>KES ${(r.total_sum || 0).toLocaleString()}</td>
                </tr>
            `).join('');
        } else {
            tbody.innerHTML = `<tr><td colspan="5" style="color:red;">Error: ${result.error || 'Unknown error'}</td></tr>`;
        }
    } catch (e) {
        console.error('Error fetching cashier report', e);
        tbody.innerHTML = '<tr><td colspan="5" style="color:red;">Failed to load</td></tr>';
    }
}

function refreshReports() {
    fetchDailyReport();
    fetchCashierReport();
}

// Payment Method Selection
window.selectPayment = function(method) {
    console.log('Payment method selected:', method);
    const paymentMethodInput = document.getElementById('payment-method');
    if (paymentMethodInput) {
        paymentMethodInput.value = method;
    }

    // Update buttons UI
    document.querySelectorAll('.pay-btn').forEach(btn => {
        if (btn.dataset.method === method) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Update reference field visibility
    const needsRef = ['mpesa', 'bank', 'card', 'cheque'].includes(method);
    const refRow = document.getElementById('payment-ref-row');
    if (refRow) {
        refRow.style.display = needsRef ? 'flex' : 'none';
    }

    // Update placeholder
    if (typeof updateRefPlaceholder === 'function') {
        updateRefPlaceholder(method);
    }
    
    // Focus on reference field if needed
    if (needsRef) {
        const refInput = document.getElementById('payment-ref');
        if (refInput) setTimeout(() => refInput.focus(), 100);
    }
};

// --- Admin: Create Product ---
window.createProduct = async function() {
    const nameEl = document.getElementById('admin-prod-name');
    const catEl = document.getElementById('admin-prod-category');
    const priceEl = document.getElementById('admin-prod-price');
    const stockEl = document.getElementById('admin-prod-stock');
    const barcodeEl = document.getElementById('admin-prod-barcode');
    const imageEl = document.getElementById('admin-prod-image');
    const errEl = document.getElementById('admin-prod-error');
    if (!nameEl || !priceEl || !stockEl || !catEl) return;
    const name = (nameEl.value || '').trim();
    const category = (catEl.value || '').trim() || 'General';
    const price = priceEl.value;
    const stock = stockEl.value;
    const barcode = (barcodeEl && barcodeEl.value || '').trim();
    const imageFileEl = document.getElementById('admin-prod-image-file');
    if (!name || !price || !stock) {
        if (errEl) {
            errEl.textContent = 'Please fill name, price and stock';
            errEl.style.display = 'block';
        } else {
            alert('Please fill name, price and stock');
        }
        return;
    }
    try {
        const response = await apiCall('/api/products', {
            method: 'POST',
            body: JSON.stringify({ name, category, price, stock, barcode })
        });
        const result = await response.json();
        if (response.ok && result.message === 'success') {
            nameEl.value = '';
            catEl.value = '';
            priceEl.value = '';
            stockEl.value = '';
            if (barcodeEl) barcodeEl.value = '';
            const newId = result.id;
            const file = imageFileEl && imageFileEl.files && imageFileEl.files[0];
            if (file && newId) {
                await uploadProductImage(newId, file);
            }
            if (errEl) errEl.style.display = 'none';
            fetchProducts();
            alert('Product added successfully');
        } else {
            const msg = result.error || 'Failed to add product';
            if (errEl) {
                errEl.textContent = msg;
                errEl.style.display = 'block';
            } else {
                alert(msg);
            }
        }
    } catch (e) {
        if (errEl) {
            errEl.textContent = 'Connection error';
            errEl.style.display = 'block';
        } else {
            alert('Connection error');
        }
    }
};
// Initial load
// fetchProducts() is called after auth check
