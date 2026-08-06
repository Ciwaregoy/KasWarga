// CONFIGURATION & SUPABASE INITIALIZATION
const SUPABASE_URL = "https://hbzjnsoopjiybbdijlnh.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imhiempuc29vcGppeWJiZGlqbG5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU4OTkwNjAsImV4cCI6MjEwMTQ3NTA2MH0.TtTHfXIPKGSK63gtg82j_FQWxpp9Qa2TZtCmivQMgCg";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// GLOBAL STATE
let state = {
    isAdmin: false,
    residents: [],
    duesPayments: [],
    expenses: [],
    otherIncomes: [],
    announcements: [],
    inventories: [],
    itemUsages: [],
    confirmCallback: null
};

// CALENDAR STATE
let calState = {
    targetModule: 'dues', // 'dues', 'mutation', 'form-dues-date', 'form-bulk-date', 'form-income-date', 'form-expense-date', 'form-use-date', 'form-return-date'
    currentYear: 2026,
    currentMonth: 7, // 7 = Agustus 2026
    startDate: null,
    endDate: null,
    
    duesStart: '',
    duesEnd: '',
    mutationStart: '',
    mutationEnd: ''
};

const MONTH_NAMES = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

// DOM CONTENT LOADED
document.addEventListener("DOMContentLoaded", () => {
    initApp();
    setupEventListeners();
    setupCalendarListeners();
});

async function initApp() {
    if (localStorage.getItem("admin_session") === "true") {
        state.isAdmin = true;
    }
    initTodayDates();
    await loadAllData();
}

function initTodayDates() {
    const todayStr = new Date().toISOString().split('T')[0];
    const formDateIds = [
        'input-dues-date', 'input-bulk-date', 'input-income-date', 
        'input-expense-date', 'input-use-date', 'input-return-date'
    ];
    
    formDateIds.forEach(id => {
        const inputEl = document.getElementById(id);
        if (inputEl) inputEl.value = todayStr;

        const displayId = id.replace('input-', 'display-');
        const displayEl = document.getElementById(displayId);
        if (displayEl) displayEl.innerText = formatDate(todayStr);
    });
}

// FETCH ALL DATA FROM SUPABASE
async function loadAllData() {
    try {
        const fetchResidents = sb.from('residents').select('*').order('house_number', { ascending: true });
        const fetchDues = sb.from('dues_payments').select('*').order('id', { ascending: false });
        const fetchExpenses = sb.from('expenses').select('*').order('id', { ascending: false });
        const fetchIncomes = sb.from('other_incomes').select('*').order('id', { ascending: false });
        const fetchAnnouncements = sb.from('announcements').select('*').order('id', { ascending: false });
        const fetchInventories = sb.from('inventories').select('*').order('id', { ascending: false });
        const fetchUsages = sb.from('item_usages').select('*').order('id', { ascending: false });

        const [resResidents, resDues, resExp, resInc, resAnn, resInv, resUsage] = await Promise.all([
            fetchResidents, fetchDues, fetchExpenses, fetchIncomes, fetchAnnouncements, fetchInventories, fetchUsages
        ]);

        state.residents = resResidents.data || [];
        state.duesPayments = resDues.data || [];
        state.expenses = resExp.data || [];
        state.otherIncomes = resInc.data || [];
        state.announcements = resAnn.data || [];
        state.inventories = resInv.data || [];
        state.itemUsages = resUsage.data || [];

        renderDashboard();
        renderDuesTab();
        renderMutations();
        renderAnnouncements();
        renderInventoryTab();
        renderUsageTab();
        populateHouseSelect();
        populateInventorySelect();
    } catch (err) {
        console.error("Critical Database Fetch Error:", err);
        showCustomAlert("Gagal Memuat Data", "Terjadi kesalahan koneksi database: " + err.message);
    }
}

// UTILS
function maskName(name) {
    if (!name) return "";
    return name.split(' ').map(word => {
        if (word.length <= 1) return word;
        return word[0] + '*'.repeat(word.length - 1);
    }).join(' ');
}

function formatRupiah(amount) {
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(amount || 0);
}

function formatDate(dateString) {
    if (!dateString) return "-";
    const d = new Date(dateString);
    return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

// DASHBOARD
function renderDashboard() {
    const totalDues = state.duesPayments.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
    const totalOtherInc = state.otherIncomes.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
    const totalIncome = totalDues + totalOtherInc;
    
    const totalExpense = state.expenses.reduce((acc, curr) => acc + Number(curr.amount || 0), 0);
    const totalBalance = totalIncome - totalExpense;

    const elBalance = document.getElementById('total-balance');
    const elIncome = document.getElementById('total-income');
    const elExpense = document.getElementById('total-expense');

    if (elBalance) elBalance.innerText = formatRupiah(totalBalance);
    if (elIncome) elIncome.innerText = formatRupiah(totalIncome);
    if (elExpense) elExpense.innerText = formatRupiah(totalExpense);
}

// RENDER TAB DETAIL INFORMASI
function renderDuesTab() {
    const container = document.getElementById('dues-list');
    if (!container) return;

    const searchInput = document.getElementById('search-resident');
    const searchQuery = searchInput ? searchInput.value.toLowerCase() : '';

    const startDate = calState.duesStart;
    const endDate = calState.duesEnd;

    let filteredDues = state.duesPayments.filter(item => {
        if (!item.created_at) return true;
        const d = item.created_at.split('T')[0];
        
        let matchStart = startDate ? d >= startDate : true;
        let matchEnd = endDate ? d <= endDate : true;

        return matchStart && matchEnd;
    });

    const filteredResidents = state.residents.filter(r => 
        (r.house_number && r.house_number.toLowerCase().includes(searchQuery)) || 
        (r.full_name && r.full_name.toLowerCase().includes(searchQuery))
    );

    if (filteredResidents.length === 0) {
        container.innerHTML = '<div class="loading-state">Data warga tidak ditemukan</div>';
        return;
    }

    let html = '';
    filteredResidents.forEach(res => {
        const housePayments = filteredDues.filter(p => p.house_number && p.house_number.toLowerCase() === res.house_number.toLowerCase());
        
        let badgeHtml = '';
        if (housePayments.length === 0) {
            badgeHtml = `<span class="badge badge-none">Belum Ada Catatan</span>`;
        } else {
            const latest = housePayments[0];
            const amount = Number(latest.amount);
            if (amount === 0) {
                badgeHtml = `<span class="badge badge-gray">Rp 0</span>`;
            } else {
                badgeHtml = `<span class="badge badge-success">${formatRupiah(amount)}</span>`;
            }
        }

        html += `
            <div class="resident-card">
                <div class="res-house">Rumah ${res.house_number}</div>
                <div class="res-name">${maskName(res.full_name)}</div>
                ${badgeHtml}
            </div>
        `;
    });

    container.innerHTML = html;
}

// RENDER MUTASI TRANSAKSI
function renderMutations() {
    const container = document.getElementById('mutation-list');
    if (!container) return;

    let list = [];

    state.duesPayments.forEach(d => {
        if (Number(d.amount) > 0) {
            list.push({
                type: 'in',
                title: `Iuran Rumah ${d.house_number}`,
                amount: Number(d.amount),
                date: d.created_at || new Date().toISOString(),
                sub: 'Iuran Warga'
            });
        }
    });

    state.otherIncomes.forEach(i => {
        list.push({
            type: 'in',
            title: i.title,
            amount: Number(i.amount),
            date: i.created_at || new Date().toISOString(),
            sub: 'Pemasukan Lain'
        });
    });

    state.expenses.forEach(e => {
        list.push({
            type: 'out',
            title: e.title,
            amount: Number(e.amount),
            date: e.created_at || new Date().toISOString(),
            sub: `[${e.category || 'Pengeluaran'}] PIC: ${e.pic || '-'}`,
            receipt: e.receipt_url,
            proof: e.proof_url
        });
    });

    const startDate = calState.mutationStart;
    const endDate = calState.mutationEnd;

    if (startDate) {
        list = list.filter(item => item.date.split('T')[0] >= startDate);
    }
    if (endDate) {
        list = list.filter(item => item.date.split('T')[0] <= endDate);
    }

    list.sort((a,b) => new Date(b.date || 0) - new Date(a.date || 0));

    if (list.length === 0) {
        container.innerHTML = '<div class="loading-state">Tidak ada transaksi pada periode tanggal ini</div>';
        return;
    }

    let html = '';
    list.forEach(item => {
        const isIn = item.type === 'in';
        let links = '';
        if (item.receipt) links += `<a href="${item.receipt}" target="_blank" class="btn-sm btn-outline-blue">Nota</a> `;
        if (item.proof) links += `<a href="${item.proof}" target="_blank" class="btn-sm btn-outline-blue">Bukti</a>`;

        html += `
            <div class="list-item">
                <div class="item-info">
                    <h4>${item.title}</h4>
                    <small>${formatDate(item.date)} • ${item.sub}</small>
                    ${links ? `<div style="margin-top:4px;">${links}</div>` : ''}
                </div>
                <div class="item-amount ${isIn ? 'text-income' : 'text-expense'}">
                    ${isIn ? '+' : '-'}${formatRupiah(item.amount)}
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// CUSTOM CALENDAR LOGIC & CONTROLLER
window.openCalendarModal = function(targetModule) {
    calState.targetModule = targetModule;
    
    if (targetModule === 'dues') {
        calState.startDate = calState.duesStart ? new Date(calState.duesStart) : null;
        calState.endDate = calState.duesEnd ? new Date(calState.duesEnd) : null;
    } else if (targetModule === 'mutation') {
        calState.startDate = calState.mutationStart ? new Date(calState.mutationStart) : null;
        calState.endDate = calState.mutationEnd ? new Date(calState.mutationEnd) : null;
    } else {
        // Single Date Input Mode for Forms
        const hiddenInputId = targetModule.replace('form-', 'input-');
        const currentVal = document.getElementById(hiddenInputId)?.value;
        calState.startDate = currentVal ? new Date(currentVal) : new Date(2026, 7, 5);
        calState.endDate = null;
    }

    const baseDate = calState.startDate || new Date(2026, 7, 5);
    calState.currentYear = baseDate.getFullYear();
    calState.currentMonth = baseDate.getMonth();

    renderCalendarGrid();
    openModal('modal-calendar');
};

function renderCalendarGrid() {
    const monthText = document.getElementById('cal-month-year-text');
    if (monthText) {
        monthText.innerText = `${MONTH_NAMES[calState.currentMonth]} ${calState.currentYear}`;
    }

    const grid = document.getElementById('calendar-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const firstDayIndex = new Date(calState.currentYear, calState.currentMonth, 1).getDay();
    const daysInMonth = new Date(calState.currentYear, calState.currentMonth + 1, 0).getDate();

    for (let i = 0; i < firstDayIndex; i++) {
        const emptyDiv = document.createElement('div');
        emptyDiv.className = 'cal-day-cell empty';
        grid.appendChild(emptyDiv);
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const cell = document.createElement('div');
        cell.className = 'cal-day-cell';
        cell.innerText = day;

        const thisDate = new Date(calState.currentYear, calState.currentMonth, day);
        const thisStr = formatDateToISO(thisDate);

        const startStr = calState.startDate ? formatDateToISO(calState.startDate) : null;
        const endStr = calState.endDate ? formatDateToISO(calState.endDate) : null;

        if (startStr && endStr) {
            if (thisStr === startStr && thisStr === endStr) {
                cell.classList.add('selected-single');
            } else if (thisStr === startStr) {
                cell.classList.add('selected-start');
            } else if (thisStr === endStr) {
                cell.classList.add('selected-end');
            } else if (thisStr > startStr && thisStr < endStr) {
                cell.classList.add('in-range');
            }
        } else if (startStr && thisStr === startStr) {
            cell.classList.add('selected-single');
        }

        cell.addEventListener('click', () => handleDateClick(thisDate));
        grid.appendChild(cell);
    }
}

function handleDateClick(dateObj) {
    const isSingleMode = calState.targetModule.startsWith('form-');

    if (isSingleMode) {
        calState.startDate = dateObj;
        calState.endDate = null;
    } else {
        if (!calState.startDate || (calState.startDate && calState.endDate)) {
            calState.startDate = dateObj;
            calState.endDate = null;
        } else if (calState.startDate && !calState.endDate) {
            if (dateObj < calState.startDate) {
                calState.startDate = dateObj;
            } else {
                calState.endDate = dateObj;
            }
        }
    }
    renderCalendarGrid();
}

function formatDateToISO(d) {
    if (!d) return '';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function setupCalendarListeners() {
    const btnPrev = document.getElementById('cal-prev-month');
    if (btnPrev) {
        btnPrev.addEventListener('click', () => {
            calState.currentMonth--;
            if (calState.currentMonth < 0) {
                calState.currentMonth = 11;
                calState.currentYear--;
            }
            renderCalendarGrid();
        });
    }

    const btnNext = document.getElementById('cal-next-month');
    if (btnNext) {
        btnNext.addEventListener('click', () => {
            calState.currentMonth++;
            if (calState.currentMonth > 11) {
                calState.currentMonth = 0;
                calState.currentYear++;
            }
            renderCalendarGrid();
        });
    }

    const btnApply = document.getElementById('btn-apply-calendar');
    if (btnApply) {
        btnApply.addEventListener('click', () => {
            const startISO = calState.startDate ? formatDateToISO(calState.startDate) : '';
            const endISO = calState.endDate ? formatDateToISO(calState.endDate) : startISO;

            if (calState.targetModule === 'dues') {
                calState.duesStart = startISO;
                calState.duesEnd = endISO;

                document.getElementById('display-dues-start').innerText = startISO ? formatDate(startISO) : 'Pilih Tanggal';
                document.getElementById('display-dues-end').innerText = endISO ? formatDate(endISO) : 'Pilih Tanggal';
                renderDuesTab();
            } else if (calState.targetModule === 'mutation') {
                calState.mutationStart = startISO;
                calState.mutationEnd = endISO;

                document.getElementById('display-mutation-start').innerText = startISO ? formatDate(startISO) : 'Pilih Tanggal';
                document.getElementById('display-mutation-end').innerText = endISO ? formatDate(endISO) : 'Pilih Tanggal';
                renderMutations();
            } else if (calState.targetModule.startsWith('form-')) {
                // Apply single date to form hidden input & display text
                const hiddenInputId = calState.targetModule.replace('form-', 'input-');
                const displayId = calState.targetModule.replace('form-', 'display-');

                const inputEl = document.getElementById(hiddenInputId);
                const displayEl = document.getElementById(displayId);

                if (inputEl) inputEl.value = startISO;
                if (displayEl) displayEl.innerText = formatDate(startISO);
            }

            closeModal('modal-calendar');
        });
    }
}

// RENDER PENGUMUMAN
function renderAnnouncements() {
    const container = document.getElementById('announcement-list');
    if (!container) return;

    if (state.announcements.length === 0) {
        container.innerHTML = '<div class="loading-state">Belum ada pengumuman</div>';
        return;
    }

    let html = '';
    state.announcements.forEach(a => {
        html += `
            <div class="list-item">
                <div class="item-info">
                    <h4>${a.title}</h4>
                    <p style="font-size:12px; margin:4px 0;">${a.content}</p>
                    <small>${formatDate(a.created_at)}</small>
                </div>
            </div>
        `;
    });
    container.innerHTML = html;
}

// RENDER BARANG ASET
function renderInventoryTab() {
    const container = document.getElementById('inventory-list');
    if (!container) return;

    if (state.inventories.length === 0) {
        container.innerHTML = '<div class="loading-state">Belum ada data barang aset</div>';
        return;
    }

    let html = '';
    state.inventories.forEach(inv => {
        const qty = Number(inv.quantity || 0);
        const price = Number(inv.price || 0);

        let statusBadge = qty > 0 ? 'badge-success' : 'badge-danger';
        let statusText = qty > 0 ? `Tersedia (${qty} unit)` : 'Stok Habis / Dipinjam';

        html += `
            <div class="list-item">
                <div class="item-info">
                    <h4>${inv.name}</h4>
                    <small>Stok Tersedia: <b>${qty} unit</b> | @ ${formatRupiah(price)}</small>
                </div>
                <div>
                    <span class="badge ${statusBadge}">${statusText}</span>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// RENDER SEWA / PINJAM
function renderUsageTab() {
    const container = document.getElementById('usage-list');
    if (!container) return;

    if (state.itemUsages.length === 0) {
        container.innerHTML = '<div class="loading-state">Belum ada aktivitas sirkulasi barang</div>';
        return;
    }

    let html = '';
    state.itemUsages.forEach(u => {
        const invObj = state.inventories.find(i => i.id === u.inventory_id);
        const itemName = invObj ? invObj.name : 'Barang';
        const isDone = u.status === 'Selesai';
        const badgeClass = isDone ? 'badge-gray' : (u.use_type === 'Disewa' ? 'badge-info' : 'badge-warning');

        let actionBtn = '';
        if (!isDone && state.isAdmin) {
            actionBtn = `<button class="btn-sm btn-outline-blue" style="margin-top:6px;" onclick="window.openReturnModal('${u.id}')">
                            <i class="fa-solid fa-rotate-left"></i> Dikembalikan
                         </button>`;
        }

        html += `
            <div class="list-item">
                <div class="item-info">
                    <h4>${u.user_name} (${u.use_type})</h4>
                    <small><b>${itemName}</b> - ${u.quantity} unit</small><br>
                    <small>Tgl Pinjam: ${formatDate(u.use_date)}</small><br>
                    <small>Tgl Balik: <b>${isDone ? formatDate(u.return_date) : 'Belum Dikembalikan'}</b></small>
                    ${Number(u.income_amount) > 0 ? `<br><small class="text-success">Kas Masuk: ${formatRupiah(u.income_amount)}</small>` : ''}
                </div>
                <div style="text-align:right;">
                    <span class="badge ${badgeClass}">${u.status}</span><br>
                    ${actionBtn}
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

function populateHouseSelect() {
    const select = document.getElementById('dues-house-number');
    if (!select) return;

    select.innerHTML = '';
    state.residents.forEach(r => {
        select.innerHTML += `<option value="${r.house_number}">Rumah ${r.house_number} (${maskName(r.full_name)})</option>`;
    });
}

function populateInventorySelect() {
    const select = document.getElementById('use-inventory-id');
    if (!select) return;

    select.innerHTML = '';
    state.inventories.forEach(i => {
        select.innerHTML += `<option value="${i.id}">${i.name} (Stok: ${i.quantity})</option>`;
    });
}

// EVENT LISTENERS GENERAL
function setupEventListeners() {
    document.querySelectorAll('.bottom-nav .nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.bottom-nav .nav-item').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
            
            btn.classList.add('active');
            const targetTab = document.getElementById(btn.dataset.tab);
            if (targetTab) targetTab.classList.add('active');
        });
    });

    document.querySelectorAll('.subtab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.subtab-btn').forEach(b => b.classList.remove('active'));
            document.querySelectorAll('.subtab-content').forEach(c => c.classList.remove('active'));
            
            btn.classList.add('active');
            const targetSub = document.getElementById(btn.dataset.subtab);
            if (targetSub) targetSub.classList.add('active');

            if(btn.dataset.subtab === 'sub-manage') renderManageData();
        });
    });

    const btnSearchMut = document.getElementById('btn-search-mutation');
    if (btnSearchMut) btnSearchMut.addEventListener('click', renderMutations);

    const btnResetMut = document.getElementById('btn-reset-mutation-filter');
    if (btnResetMut) {
        btnResetMut.addEventListener('click', () => {
            calState.mutationStart = '';
            calState.mutationEnd = '';
            document.getElementById('display-mutation-start').innerText = 'Pilih Tanggal';
            document.getElementById('display-mutation-end').innerText = 'Pilih Tanggal';
            renderMutations();
        });
    }

    const btnSearchDues = document.getElementById('btn-search-dues');
    if (btnSearchDues) btnSearchDues.addEventListener('click', renderDuesTab);

    const btnResetDues = document.getElementById('btn-reset-dues-filter');
    if (btnResetDues) {
        btnResetDues.addEventListener('click', () => {
            calState.duesStart = '';
            calState.duesEnd = '';
            document.getElementById('display-dues-start').innerText = 'Pilih Tanggal';
            document.getElementById('display-dues-end').innerText = 'Pilih Tanggal';
            renderDuesTab();
        });
    }

    const searchRes = document.getElementById('search-resident');
    if (searchRes) searchRes.addEventListener('input', renderDuesTab);

    const btnCopyDana = document.getElementById('btn-copy-dana');
    if (btnCopyDana) {
        btnCopyDana.addEventListener('click', () => {
            const num = document.getElementById('dana-number')?.innerText || '';
            navigator.clipboard.writeText(num);
            showCustomAlert("Berhasil", "Nomor DANA berhasil disalin!");
        });
    }

    const fabAdmin = document.getElementById('fab-admin');
    if (fabAdmin) {
        fabAdmin.addEventListener('click', () => {
            populateHouseSelect();
            populateInventorySelect();
            if (state.isAdmin) {
                openModal('modal-admin');
            } else {
                openModal('modal-login');
            }
        });
    }

    document.querySelectorAll('.close-modal').forEach(btn => {
        btn.addEventListener('click', (e) => {
            closeModal(e.target.closest('.modal').id);
        });
    });

    const formLogin = document.getElementById('form-login');
    if (formLogin) {
        formLogin.addEventListener('submit', (e) => {
            e.preventDefault();
            const pin = document.getElementById('login-pin')?.value;
            if (pin === "3462" || pin === "3642") {
                state.isAdmin = true;
                localStorage.setItem("admin_session", "true");
                closeModal('modal-login');
                const pinEl = document.getElementById('login-pin');
                if (pinEl) pinEl.value = '';
                openModal('modal-admin');
                renderUsageTab();
            } else {
                showCustomAlert("Akses Ditolak", "PIN Admin Salah!");
            }
        });
    }

    const btnLogout = document.getElementById('btn-logout');
    if (btnLogout) {
        btnLogout.addEventListener('click', () => {
            showCustomConfirm("Logout Admin", "Apakah kamu yakin ingin keluar dari mode Admin?", () => {
                state.isAdmin = false;
                localStorage.removeItem("admin_session");
                closeModal('modal-admin');
                renderUsageTab();
                showCustomAlert("Logout Berhasil", "Kamu telah keluar dari mode Admin.");
            });
        });
    }

    // FORMS SUBMIT
    const formSingleDues = document.getElementById('form-single-dues');
    if (formSingleDues) {
        formSingleDues.addEventListener('submit', async (e) => {
            e.preventDefault();
            const house_number = document.getElementById('dues-house-number').value;
            const amount = Number(document.getElementById('dues-amount').value);
            const created_at = document.getElementById('input-dues-date').value;

            const { error } = await sb.from('dues_payments').insert([{ house_number, amount, created_at }]);
            handleFormResponse(error, "Iuran berhasil disimpan!");
        });
    }

    const formBulkDues = document.getElementById('form-bulk-dues');
    if (formBulkDues) {
        formBulkDues.addEventListener('submit', async (e) => {
            e.preventDefault();
            const rawText = document.getElementById('bulk-text').value.trim();
            const created_at = document.getElementById('input-bulk-date').value;
            
            const lines = rawText.split('\n');
            const payload = [];

            lines.forEach(line => {
                const parts = line.trim().split(/\s+/);
                if (parts.length >= 2) {
                    payload.push({
                        house_number: parts[0],
                        amount: Number(parts[1]),
                        created_at: created_at
                    });
                }
            });

            if (payload.length === 0) {
                showCustomAlert("Gagal", "Format data bulk tidak valid!");
                return;
            }

            const { error } = await sb.from('dues_payments').insert(payload);
            handleFormResponse(error, `${payload.length} Data Iuran berhasil diproses!`);
        });
    }

    const formOtherIncome = document.getElementById('form-other-income');
    if (formOtherIncome) {
        formOtherIncome.addEventListener('submit', async (e) => {
            e.preventDefault();
            const title = document.getElementById('income-title').value;
            const amount = Number(document.getElementById('income-amount').value);
            const created_at = document.getElementById('input-income-date').value;

            const { error } = await sb.from('other_incomes').insert([{ title, amount, created_at }]);
            handleFormResponse(error, "Pemasukan berhasil disimpan!");
        });
    }

    const formExpense = document.getElementById('form-expense');
    if (formExpense) {
        formExpense.addEventListener('submit', async (e) => {
            e.preventDefault();
            const category = document.getElementById('expense-category').value;
            const title = document.getElementById('expense-title').value;
            const amount = Number(document.getElementById('expense-amount').value);
            const pic = document.getElementById('expense-pic').value;
            const receipt_url = document.getElementById('expense-receipt').value;
            const proof_url = document.getElementById('expense-proof').value;
            const created_at = document.getElementById('input-expense-date').value;

            const { error } = await sb.from('expenses').insert([{ category, title, amount, pic, receipt_url, proof_url, created_at }]);
            handleFormResponse(error, "Pengeluaran berhasil disimpan!");
        });
    }

    const formInventory = document.getElementById('form-inventory');
    if (formInventory) {
        formInventory.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('inv-name').value;
            const quantity = Number(document.getElementById('inv-qty').value);
            const price = Number(document.getElementById('inv-price').value);
            const status = document.getElementById('inv-status').value;

            const { error } = await sb.from('inventories').insert([{ name, quantity, price, status }]);
            handleFormResponse(error, "Data barang aset berhasil disimpan!");
        });
    }

    const formUsage = document.getElementById('form-usage');
    if (formUsage) {
        formUsage.addEventListener('submit', async (e) => {
            e.preventDefault();
            const user_name = document.getElementById('use-user-name').value;
            const inventory_id = Number(document.getElementById('use-inventory-id').value);
            const quantity = Number(document.getElementById('use-qty').value);
            const use_type = document.getElementById('use-type').value;
            const use_date = document.getElementById('input-use-date').value;
            const income_amount = Number(document.getElementById('use-income').value);

            const currentInv = state.inventories.find(i => i.id === inventory_id);
            if (!currentInv || currentInv.quantity < quantity) {
                showCustomAlert("Stok Kurang", `Stok barang tersedia saat ini hanya ${currentInv ? currentInv.quantity : 0} unit.`);
                return;
            }

            const { error: usageError } = await sb.from('item_usages').insert([{
                user_name, inventory_id, quantity, use_type, use_date, return_date: null, income_amount, status: 'Aktif'
            }]);

            if (usageError) {
                showCustomAlert("Gagal", usageError.message);
                return;
            }

            const newQty = currentInv.quantity - quantity;
            await sb.from('inventories').update({ quantity: newQty }).eq('id', inventory_id);

            if (income_amount > 0) {
                await sb.from('other_incomes').insert([{
                    title: `Sewa Barang (${currentInv.name}) - ${user_name}`,
                    amount: income_amount,
                    created_at: use_date
                }]);
            }

            handleFormResponse(null, "Transaksi penggunaan berhasil dicatat & stok otomatis berkurang!");
        });
    }

    const formReturnItem = document.getElementById('form-return-item');
    if (formReturnItem) {
        formReturnItem.addEventListener('submit', async (e) => {
            e.preventDefault();
            const usageId = document.getElementById('return-usage-id').value;
            const returnDateVal = document.getElementById('input-return-date').value;

            const usageData = state.itemUsages.find(u => u.id == usageId);
            if (!usageData) return;

            const { error } = await sb.from('item_usages').update({
                status: 'Selesai',
                return_date: returnDateVal
            }).eq('id', usageId);

            if (error) {
                showCustomAlert("Gagal", error.message);
                return;
            }

            const currentInv = state.inventories.find(i => i.id === usageData.inventory_id);
            if (currentInv) {
                await sb.from('inventories').update({
                    quantity: currentInv.quantity + usageData.quantity
                }).eq('id', currentInv.id);
            }

            closeModal('modal-return');
            handleFormResponse(null, "Barang berhasil dikembalikan & stok telah diperbarui!");
        });
    }

    const formAnn = document.getElementById('form-announcement');
    if (formAnn) {
        formAnn.addEventListener('submit', async (e) => {
            e.preventDefault();
            const title = document.getElementById('ann-title').value;
            const content = document.getElementById('ann-content').value;

            const { error } = await sb.from('announcements').insert([{ title, content }]);
            handleFormResponse(error, "Pengumuman berhasil diposting!");
        });
    }

    const formRes = document.getElementById('form-resident');
    if (formRes) {
        formRes.addEventListener('submit', async (e) => {
            e.preventDefault();
            const house_number = document.getElementById('res-house').value.toUpperCase();
            const full_name = document.getElementById('res-name').value;

            const { error } = await sb.from('residents').insert([{ house_number, full_name }]);
            handleFormResponse(error, "Data warga berhasil ditambahkan!");
        });
    }

    const manageType = document.getElementById('manage-type');
    if (manageType) manageType.addEventListener('change', renderManageData);

    const btnAlertClose = document.getElementById('btn-alert-close');
    if (btnAlertClose) btnAlertClose.addEventListener('click', () => closeModal('modal-alert'));

    const btnConfirmCancel = document.getElementById('btn-confirm-cancel');
    if (btnConfirmCancel) btnConfirmCancel.addEventListener('click', () => closeModal('modal-confirm'));

    const btnConfirmOk = document.getElementById('btn-confirm-ok');
    if (btnConfirmOk) {
        btnConfirmOk.addEventListener('click', () => {
            if (state.confirmCallback) state.confirmCallback();
            closeModal('modal-confirm');
        });
    }
}

// HANDLE AFTER SUBMIT FORM
async function handleFormResponse(error, successMsg) {
    if (error) {
        showCustomAlert("Gagal", "Terjadi kesalahan: " + error.message);
    } else {
        showCustomAlert("Sukses", successMsg);
        await loadAllData();
    }
}

// OPEN RETURN MODAL
window.openReturnModal = function(id) {
    const usage = state.itemUsages.find(u => u.id == id);
    if (!usage) return;

    const invObj = state.inventories.find(i => i.id === usage.inventory_id);
    const itemName = invObj ? invObj.name : 'Barang';

    const idEl = document.getElementById('return-usage-id');
    const infoEl = document.getElementById('return-item-info');
    const inputEl = document.getElementById('input-return-date');
    const displayEl = document.getElementById('display-return-date');

    const todayStr = new Date().toISOString().split('T')[0];

    if (idEl) idEl.value = id;
    if (infoEl) infoEl.innerText = `${usage.user_name} mengembalikan ${usage.quantity} unit ${itemName}`;
    if (inputEl) inputEl.value = todayStr;
    if (displayEl) displayEl.innerText = formatDate(todayStr);

    openModal('modal-return');
};

// KELOLA DATA MANAGEMENT
function renderManageData() {
    const typeSelect = document.getElementById('manage-type');
    if (!typeSelect) return;

    const table = typeSelect.value;
    const container = document.getElementById('manage-list');
    if (!container) return;
    
    let data = [];
    if (table === 'dues_payments') data = state.duesPayments;
    else if (table === 'expenses') data = state.expenses;
    else if (table === 'other_incomes') data = state.otherIncomes;
    else if (table === 'inventories') data = state.inventories;
    else if (table === 'item_usages') data = state.itemUsages;
    else if (table === 'announcements') data = state.announcements;
    else if (table === 'residents') data = state.residents;

    if (!data || data.length === 0) {
        container.innerHTML = '<div class="loading-state">Data kosong</div>';
        return;
    }

    let html = '';
    data.forEach(item => {
        let label = item.name || item.title || (item.user_name ? `${item.user_name} (${item.status})` : `Rumah ${item.house_number}`) || item.full_name;
        let sub = item.price !== undefined ? `${item.quantity || 1} unit x ${formatRupiah(item.price)}` : item.amount !== undefined ? formatRupiah(item.amount) : item.use_type ? `Unit ID: ${item.inventory_id} - ${item.quantity} unit` : item.content || item.full_name || '';

        html += `
            <div class="list-item" style="margin-bottom:8px;">
                <div class="item-info">
                    <h4>${label}</h4>
                    <small>${sub}</small>
                </div>
                <div style="display:flex; gap:6px;">
                    <button class="btn-sm btn-outline-blue" onclick="window.openEditModal('${table}', '${item.id}')">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn-sm btn-danger" onclick="window.confirmDelete('${table}', '${item.id}')">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </div>
        `;
    });

    container.innerHTML = html;
}

// OPEN EDIT MODAL FULL FIELDS
window.openEditModal = function(table, id) {
    let stateKey = table === 'dues_payments' ? 'duesPayments' : table === 'other_incomes' ? 'otherIncomes' : table === 'item_usages' ? 'itemUsages' : table;
    const data = state[stateKey].find(x => x.id == id);
    if (!data) return;

    const idEl = document.getElementById('edit-id');
    const tableEl = document.getElementById('edit-table');
    if (idEl) idEl.value = id;
    if (tableEl) tableEl.value = table;

    const fieldsContainer = document.getElementById('edit-fields');
    if (!fieldsContainer) return;
    fieldsContainer.innerHTML = '';

    if (table === 'dues_payments') {
        const houseOptions = state.residents.map(r => 
            `<option value="${r.house_number}" ${r.house_number === data.house_number ? 'selected' : ''}>Rumah ${r.house_number} (${maskName(r.full_name)})</option>`
        ).join('');

        fieldsContainer.innerHTML = `
            <div class="form-group">
                <label>No Rumah Warga</label>
                <select id="edit-val-house" class="form-control" required>${houseOptions}</select>
            </div>
            <div class="form-group">
                <label>Nominal (Rp)</label>
                <input type="number" id="edit-val-amount" class="form-control" value="${data.amount || 0}" required>
            </div>
            <div class="form-group">
                <label>Tanggal Transaksi</label>
                <input type="date" id="edit-val-date" class="form-control" value="${data.created_at ? data.created_at.split('T')[0] : ''}" required>
            </div>
        `;
    } else if (table === 'other_incomes') {
        fieldsContainer.innerHTML = `
            <div class="form-group">
                <label>Judul / Sumber Pemasukan</label>
                <input type="text" id="edit-val-title" class="form-control" value="${data.title || ''}" required>
            </div>
            <div class="form-group">
                <label>Nominal (Rp)</label>
                <input type="number" id="edit-val-amount" class="form-control" value="${data.amount || 0}" required>
            </div>
            <div class="form-group">
                <label>Tanggal Transaksi</label>
                <input type="date" id="edit-val-date" class="form-control" value="${data.created_at ? data.created_at.split('T')[0] : ''}" required>
            </div>
        `;
    } else if (table === 'expenses') {
        const categories = ['Kebersihan', 'Keamanan', 'Sosial', 'Infrastruktur', 'Lainnya'];
        const categoryOptions = categories.map(c => 
            `<option value="${c}" ${c === data.category ? 'selected' : ''}>${c}</option>`
        ).join('');

        fieldsContainer.innerHTML = `
            <div class="form-group">
                <label>Kategori</label>
                <select id="edit-val-category" class="form-control" required>${categoryOptions}</select>
            </div>
            <div class="form-group">
                <label>Judul Pengeluaran</label>
                <input type="text" id="edit-val-title" class="form-control" value="${data.title || ''}" required>
            </div>
            <div class="form-group">
                <label>Nominal (Rp)</label>
                <input type="number" id="edit-val-amount" class="form-control" value="${data.amount || 0}" required>
            </div>
            <div class="form-group">
                <label>PIC / Penanggung Jawab</label>
                <input type="text" id="edit-val-pic" class="form-control" value="${data.pic || ''}" required>
            </div>
            <div class="form-group">
                <label>Link Nota (URL)</label>
                <input type="url" id="edit-val-receipt" class="form-control" value="${data.receipt_url || ''}">
            </div>
            <div class="form-group">
                <label>Link Bukti Barang (URL)</label>
                <input type="url" id="edit-val-proof" class="form-control" value="${data.proof_url || ''}">
            </div>
            <div class="form-group">
                <label>Tanggal Transaksi</label>
                <input type="date" id="edit-val-date" class="form-control" value="${data.created_at ? data.created_at.split('T')[0] : ''}" required>
            </div>
        `;
    } else if (table === 'inventories') {
        const statuses = ['Tersedia', 'Dipinjam', 'Disewa', 'Rusak'];
        const statusOptions = statuses.map(s => 
            `<option value="${s}" ${s === data.status ? 'selected' : ''}>${s}</option>`
        ).join('');

        fieldsContainer.innerHTML = `
            <div class="form-group">
                <label>Nama Barang</label>
                <input type="text" id="edit-val-name" class="form-control" value="${data.name || ''}" required>
            </div>
            <div class="form-group">
                <label>Jumlah Unit Stok</label>
                <input type="number" id="edit-val-qty" class="form-control" value="${data.quantity || 0}" required min="0">
            </div>
            <div class="form-group">
                <label>Harga Beli Per Unit (Rp)</label>
                <input type="number" id="edit-val-price" class="form-control" value="${data.price || 0}" required>
            </div>
            <div class="form-group">
                <label>Status Ketersediaan</label>
                <select id="edit-val-status" class="form-control" required>${statusOptions}</select>
            </div>
        `;
    } else if (table === 'item_usages') {
        const invOptions = state.inventories.map(i => 
            `<option value="${i.id}" ${i.id === data.inventory_id ? 'selected' : ''}>${i.name}</option>`
        ).join('');

        fieldsContainer.innerHTML = `
            <div class="form-group">
                <label>Nama Pengguna / Peminjam</label>
                <input type="text" id="edit-val-user" class="form-control" value="${data.user_name || ''}" required>
            </div>
            <div class="form-group">
                <label>Pilih Barang</label>
                <select id="edit-val-inv-id" class="form-control" required>${invOptions}</select>
            </div>
            <div class="form-group">
                <label>Jumlah Dipinjam/Disewa</label>
                <input type="number" id="edit-val-qty" class="form-control" value="${data.quantity || 1}" min="1" required>
            </div>
            <div class="form-group">
                <label>Jenis Penggunaan</label>
                <select id="edit-val-use-type" class="form-control" required>
                    <option value="Disewa" ${data.use_type === 'Disewa' ? 'selected' : ''}>Disewa</option>
                    <option value="Dipinjam" ${data.use_type === 'Dipinjam' ? 'selected' : ''}>Dipinjam</option>
                </select>
            </div>
            <div class="form-group">
                <label>Status Transaksi</label>
                <select id="edit-val-usage-status" class="form-control" required>
                    <option value="Aktif" ${data.status === 'Aktif' ? 'selected' : ''}>Aktif (Sedang Dipinjam/Sewa)</option>
                    <option value="Selesai" ${data.status === 'Selesai' ? 'selected' : ''}>Selesai (Sudah Dikembalikan)</option>
                </select>
            </div>
            <div class="form-group">
                <label>Tanggal Pinjam/Sewa</label>
                <input type="date" id="edit-val-use-date" class="form-control" value="${data.use_date ? data.use_date.split('T')[0] : ''}" required>
            </div>
            <div class="form-group">
                <label>Kas Diterima (Rp)</label>
                <input type="number" id="edit-val-income" class="form-control" value="${data.income_amount || 0}" required>
            </div>
        `;
    } else if (table === 'announcements') {
        fieldsContainer.innerHTML = `
            <div class="form-group">
                <label>Judul Pengumuman</label>
                <input type="text" id="edit-val-title" class="form-control" value="${data.title || ''}" required>
            </div>
            <div class="form-group">
                <label>Isi Pengumuman</label>
                <textarea id="edit-val-content" class="form-control" rows="4" required>${data.content || ''}</textarea>
            </div>
        `;
    } else if (table === 'residents') {
        fieldsContainer.innerHTML = `
            <div class="form-group">
                <label>No Rumah</label>
                <input type="text" id="edit-val-house" class="form-control" value="${data.house_number || ''}" required>
            </div>
            <div class="form-group">
                <label>Nama Lengkap</label>
                <input type="text" id="edit-val-name" class="form-control" value="${data.full_name || ''}" required>
            </div>
        `;
    }

    openModal('modal-edit');
};

// SUBMIT FORM EDIT GENERIC WITH FULL FIELDS
const formEditGen = document.getElementById('form-edit-generic');
if (formEditGen) {
    formEditGen.addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('edit-id').value;
        const table = document.getElementById('edit-table').value;
        const targetId = !isNaN(id) && !isNaN(parseFloat(id)) ? Number(id) : id;
        
        let payload = {};

        if (table === 'dues_payments') {
            payload.house_number = document.getElementById('edit-val-house').value;
            payload.amount = Number(document.getElementById('edit-val-amount').value);
            payload.created_at = document.getElementById('edit-val-date').value;
        } else if (table === 'other_incomes') {
            payload.title = document.getElementById('edit-val-title').value;
            payload.amount = Number(document.getElementById('edit-val-amount').value);
            payload.created_at = document.getElementById('edit-val-date').value;
        } else if (table === 'expenses') {
            payload.category = document.getElementById('edit-val-category').value;
            payload.title = document.getElementById('edit-val-title').value;
            payload.amount = Number(document.getElementById('edit-val-amount').value);
            payload.pic = document.getElementById('edit-val-pic').value;
            payload.receipt_url = document.getElementById('edit-val-receipt').value;
            payload.proof_url = document.getElementById('edit-val-proof').value;
            payload.created_at = document.getElementById('edit-val-date').value;
        } else if (table === 'inventories') {
            payload.name = document.getElementById('edit-val-name').value;
            payload.quantity = Number(document.getElementById('edit-val-qty').value);
            payload.price = Number(document.getElementById('edit-val-price').value);
            payload.status = document.getElementById('edit-val-status').value;
        } else if (table === 'item_usages') {
            const oldUsage = state.itemUsages.find(u => u.id == targetId);
            const newStatus = document.getElementById('edit-val-usage-status').value;

            payload.user_name = document.getElementById('edit-val-user').value;
            payload.inventory_id = Number(document.getElementById('edit-val-inv-id').value);
            payload.quantity = Number(document.getElementById('edit-val-qty').value);
            payload.use_type = document.getElementById('edit-val-use-type').value;
            payload.status = newStatus;
            payload.use_date = document.getElementById('edit-val-use-date').value;
            payload.income_amount = Number(document.getElementById('edit-val-income').value);

            if (oldUsage && oldUsage.status === 'Aktif' && newStatus === 'Selesai') {
                payload.return_date = new Date().toISOString().split('T')[0];
                const inv = state.inventories.find(i => i.id === payload.inventory_id);
                if (inv) {
                    await sb.from('inventories').update({ quantity: inv.quantity + payload.quantity }).eq('id', inv.id);
                }
            }
        } else if (table === 'announcements') {
            payload.title = document.getElementById('edit-val-title').value;
            payload.content = document.getElementById('edit-val-content').value;
        } else if (table === 'residents') {
            payload.house_number = document.getElementById('edit-val-house').value.toUpperCase();
            payload.full_name = document.getElementById('edit-val-name').value;
        }

        const { error } = await sb.from(table).update(payload).eq('id', targetId);
        
        closeModal('modal-edit');
        handleFormResponse(error, "Data berhasil diperbarui!");
        renderManageData();
    });
}

window.confirmDelete = function(table, id) {
    showCustomConfirm("Konfirmasi Hapus", "Apakah Anda yakin ingin menghapus data ini?", async () => {
        try {
            const targetId = !isNaN(id) && !isNaN(parseFloat(id)) ? Number(id) : id;
            
            if (table === 'item_usages') {
                const oldUsage = state.itemUsages.find(u => u.id == targetId);
                if (oldUsage && oldUsage.status === 'Aktif') {
                    const inv = state.inventories.find(i => i.id === oldUsage.inventory_id);
                    if (inv) {
                        await sb.from('inventories').update({ quantity: inv.quantity + oldUsage.quantity }).eq('id', inv.id);
                    }
                }
            }

            const { error } = await sb.from(table).delete().eq('id', targetId);
            
            if (error) {
                showCustomAlert("Gagal Hapus", "Database Error: " + error.message);
            } else {
                showCustomAlert("Sukses", "Data berhasil dihapus!");
                await loadAllData();
                renderManageData();
            }
        } catch (err) {
            showCustomAlert("Error", "Terjadi kesalahan: " + err.message);
        }
    });
};

// MODALS HELPERS
function openModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('active');
}

function closeModal(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('active');
}

function showCustomAlert(title, message) {
    const elTitle = document.getElementById('alert-title');
    const elMsg = document.getElementById('alert-message');
    if (elTitle) elTitle.innerText = title;
    if (elMsg) elMsg.innerText = message;
    openModal('modal-alert');
}

function showCustomConfirm(title, message, onConfirm) {
    const elTitle = document.getElementById('confirm-title');
    const elMsg = document.getElementById('confirm-message');
    if (elTitle) elTitle.innerText = title;
    if (elMsg) elMsg.innerText = message;
    state.confirmCallback = onConfirm;
    openModal('modal-confirm');
}
