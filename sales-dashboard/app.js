(() => {
  const CFG = window.APP_CONFIG;
  const OFF = CFG.TIMEZONE_OFFSET_HOURS * 3600 * 1000;
  const fmt = new Intl.NumberFormat("en-KE");
  const money = (n) => "KSh " + fmt.format(Math.round(n));

  // ---- data access -------------------------------------------------------
  async function fetchAll() {
    const rows = [];
    const page = 1000;
    for (let from = 0; from < 20000; from += page) {
      const url = `${CFG.SUPABASE_URL}/rest/v1/transactions` +
        `?select=amount,created_at,package_type,phone_number,mpesa_receipt,voucher_code` +
        `&status=eq.success&order=created_at.desc`;
      const res = await fetch(url, {
        headers: {
          apikey: CFG.SUPABASE_KEY,
          Authorization: `Bearer ${CFG.SUPABASE_KEY}`,
          Range: `${from}-${from + page - 1}`,
          "Range-Unit": "items",
        },
      });
      if (!res.ok) throw new Error(`Backend error ${res.status}`);
      const batch = await res.json();
      rows.push(...batch);
      if (batch.length < page) break;
    }
    return rows;
  }

  // ---- local (EAT) date helpers -----------------------------------------
  const local = (iso) => new Date(new Date(iso).getTime() + OFF);
  const dayKey = (d) => d.toISOString().slice(0, 10);
  const monthKey = (d) => d.toISOString().slice(0, 7);
  function weekStart(d) {          // Monday-based
    const x = new Date(d);
    const wd = (x.getUTCDay() + 6) % 7;
    x.setUTCDate(x.getUTCDate() - wd);
    return dayKey(x);
  }
  const nowLocal = () => new Date(Date.now() + OFF);

  // ---- rendering ---------------------------------------------------------
  const charts = {};
  function drawChart(id, labels, data, color, type = "bar") {
    if (charts[id]) charts[id].destroy();
    charts[id] = new Chart(document.getElementById(id), {
      type,
      data: {
        labels,
        datasets: [{
          label: "KSh",
          data,
          backgroundColor: color,
          borderColor: color,
          borderWidth: 2,
          borderRadius: 5,
          tension: .35,
          fill: type === "line" ? "origin" : false,
        }],
      },
      options: {
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: "#8ea0c4", maxRotation: 0, autoSkip: true }, grid: { display: false } },
          y: { ticks: { color: "#8ea0c4" }, grid: { color: "#22304d" }, beginAtZero: true },
        },
      },
    });
  }

  function seriesBack(map, keys) { return keys.map((k) => map[k] || 0); }

  function render(rows) {
    const byDay = {}, byWeek = {}, byMonth = {}, cntDay = {};
    let all = 0;
    for (const r of rows) {
      const d = local(r.created_at);
      const amt = Number(r.amount) || 0;
      all += amt;
      const dk = dayKey(d);
      byDay[dk] = (byDay[dk] || 0) + amt;
      cntDay[dk] = (cntDay[dk] || 0) + 1;
      const wk = weekStart(d);
      byWeek[wk] = (byWeek[wk] || 0) + amt;
      const mk = monthKey(d);
      byMonth[mk] = (byMonth[mk] || 0) + amt;
    }

    const today = nowLocal();
    const tKey = dayKey(today);
    const yDate = new Date(today); yDate.setUTCDate(yDate.getUTCDate() - 1);
    const yKey = dayKey(yDate);
    const wKey = weekStart(today);
    const mKey = monthKey(today);

    const countIn = (pred) => rows.filter((r) => pred(local(r.created_at))).length;
    const set = (id, v) => (document.getElementById(id).textContent = v);

    set("kpi-today", money(byDay[tKey] || 0));
    set("kpi-today-c", `${cntDay[tKey] || 0} payments`);
    set("kpi-yest", money(byDay[yKey] || 0));
    set("kpi-yest-c", `${cntDay[yKey] || 0} payments`);
    set("kpi-week", money(byWeek[wKey] || 0));
    set("kpi-week-c", `${countIn((d) => weekStart(d) === wKey)} payments`);
    set("kpi-month", money(byMonth[mKey] || 0));
    set("kpi-month-c", `${countIn((d) => monthKey(d) === mKey)} payments`);
    set("kpi-all", money(all));
    set("kpi-all-c", `${rows.length} payments`);

    // last 30 days
    const dayKeys = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today); d.setUTCDate(d.getUTCDate() - i);
      dayKeys.push(dayKey(d));
    }
    drawChart("chart-daily", dayKeys.map((k) => k.slice(5)), seriesBack(byDay, dayKeys), "#12d18e", "line");

    // last 12 weeks
    const weekKeys = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(today); d.setUTCDate(d.getUTCDate() - i * 7);
      weekKeys.push(weekStart(d));
    }
    drawChart("chart-weekly", weekKeys.map((k) => k.slice(5)), seriesBack(byWeek, weekKeys), "#3d8bfd");

    // last 12 months
    const monthKeys = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - i, 1));
      monthKeys.push(monthKey(d));
    }
    drawChart("chart-monthly", monthKeys, seriesBack(byMonth, monthKeys), "#f2c14e");

    // packages this month
    const pkg = {};
    rows.filter((r) => monthKey(local(r.created_at)) === mKey).forEach((r) => {
      const k = r.package_type || "unknown";
      pkg[k] = pkg[k] || { c: 0, s: 0 };
      pkg[k].c++; pkg[k].s += Number(r.amount) || 0;
    });
    document.querySelector("#pkg-table tbody").innerHTML =
      Object.entries(pkg).sort((a, b) => b[1].s - a[1].s)
        .map(([k, v]) => `<tr><td>${k}</td><td>${v.c}</td><td class="r">${money(v.s)}</td></tr>`)
        .join("") || `<tr><td colspan="3">No sales yet this month</td></tr>`;

    // latest payments
    document.querySelector("#recent-table tbody").innerHTML =
      rows.slice(0, 20).map((r) => {
        const d = local(r.created_at);
        const t = `${dayKey(d).slice(5)} ${d.toISOString().slice(11, 16)}`;
        return `<tr><td>${t}</td><td>${r.phone_number || "—"}</td><td>${r.package_type || "—"}</td>` +
               `<td class="r">${money(Number(r.amount) || 0)}</td><td>${r.mpesa_receipt || "—"}</td></tr>`;
      }).join("") || `<tr><td colspan="5">No payments found</td></tr>`;

    document.getElementById("updated").textContent =
      "Updated " + nowLocal().toISOString().slice(11, 16);
  }

  async function load() {
    const btn = document.getElementById("refresh");
    btn.disabled = true;
    try {
      render(await fetchAll());
    } catch (e) {
      document.getElementById("updated").textContent = "Could not load data: " + e.message;
    } finally {
      btn.disabled = false;
    }
  }

  document.getElementById("refresh").addEventListener("click", load);
  load();
  setInterval(load, (CFG.AUTO_REFRESH_SECONDS || 60) * 1000);
})();
