const HONDURAS_OFFSET = -6;

function toHondurasTime(isoString) {
    const date = new Date(isoString);
    const hondurasMs = date.getTime() + HONDURAS_OFFSET * 3600000;
    const h = new Date(hondurasMs);
    const hh = String(h.getUTCHours()).padStart(2, "0");
    const mm = String(h.getUTCMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
}

function toHondurasDate(isoString) {
    const date = new Date(isoString);
    const hondurasMs = date.getTime() + HONDURAS_OFFSET * 3600000;
    const h = new Date(hondurasMs);
    const yyyy = h.getUTCFullYear();
    const mm = String(h.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(h.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
}

function filterByDate(records, selectedDate) {
    return records.filter((r) => toHondurasDate(r.punch_time) === selectedDate);
}

function groupByEmployee(records) {
    const groups = {};
    for (const r of records) {
        if (!groups[r.employee]) {
            groups[r.employee] = [];
        }
        groups[r.employee].push(r);
    }
    for (const emp of Object.keys(groups)) {
        groups[emp].sort((a, b) => new Date(a.punch_time) - new Date(b.punch_time));
    }
    return groups;
}

function renderTable(grouped) {
    const tbody = document.getElementById("tableBody");
    const employees = Object.keys(grouped).sort();

    if (employees.length === 0) {
        tbody.innerHTML = `<tr><td colspan="2" class="empty-message">Sin registros para esta fecha</td></tr>`;
        document.getElementById("employeeCount").textContent = "0 empleados";
        return;
    }

    let html = "";
    for (const emp of employees) {
        const badges = grouped[emp]
            .map((r) => {
                const time = toHondurasTime(r.punch_time);
                const cls = r.punch_state === "0" ? "badge-in" : "badge-out";
                return `<span class="punch-badge ${cls}" title="Terminal: ${r.terminal_alias}">${time}</span>`;
            })
            .join("");

        html += `<tr>
            <td class="employee-name">${emp}</td>
            <td><div class="punch-badges">${badges}</div></td>
        </tr>`;
    }

    tbody.innerHTML = html;
    document.getElementById("employeeCount").textContent = `${employees.length} empleados`;
}

function updateTimestamp() {
    const now = new Date();
    const hondurasMs = now.getTime() + HONDURAS_OFFSET * 3600000;
    const h = new Date(hondurasMs);
    const hh = String(h.getUTCHours()).padStart(2, "0");
    const mm = String(h.getUTCMinutes()).padStart(2, "0");
    document.getElementById("lastUpdate").textContent = `Última actualización: ${hh}:${mm}`;
}

function getToken() {
    return localStorage.getItem("token");
}

function logout() {
    const token = getToken();
    if (token) {
        fetch("/logout", {
            method: "POST",
            headers: { "Authorization": `Bearer ${token}` }
        }).catch(() => {});
    }
    localStorage.removeItem("token");
    window.location.href = "/login.html";
}

async function loadAttendance() {
    const token = getToken();
    if (!token) {
        window.location.href = "/login.html";
        return;
    }

    const tbody = document.getElementById("tableBody");
    tbody.innerHTML = `<tr><td colspan="2" class="empty-message">Cargando datos...</td></tr>`;

    const selectedDate = document.getElementById("datePicker").value;

    let records;
    try {
        const res = await fetch("/attendance", {
            headers: { "Authorization": `Bearer ${token}` }
        });
        if (res.status === 401) {
            logout();
            return;
        }
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        records = await res.json();
    } catch (err) {
        console.warn("API no disponible, usando datos de prueba:", err.message);
        records = MOCK_DATA;
    }

    const filtered = filterByDate(records, selectedDate);
    const grouped = groupByEmployee(filtered);
    renderTable(grouped);
    updateTimestamp();
}

document.addEventListener("DOMContentLoaded", () => {
    if (!getToken()) {
        window.location.href = "/login.html";
        return;
    }

    const datePicker = document.getElementById("datePicker");
    const now = new Date();
    const hondurasMs = now.getTime() + HONDURAS_OFFSET * 3600000;
    const h = new Date(hondurasMs);
    const today = `${h.getUTCFullYear()}-${String(h.getUTCMonth() + 1).padStart(2, "0")}-${String(h.getUTCDate()).padStart(2, "0")}`;
    datePicker.value = today;

    document.getElementById("refreshBtn").addEventListener("click", loadAttendance);
    document.getElementById("logoutBtn").addEventListener("click", logout);
    datePicker.addEventListener("change", loadAttendance);

    loadAttendance();
    setInterval(loadAttendance, 10000);
});
