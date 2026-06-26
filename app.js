(() => {
  const payload = window.ANMAWON_DATA || { metadata: { count: 0 }, shops: [] };
  const shops = payload.shops || [];
  const pageSize = 28;

  const state = {
    query: "",
    area: "all",
    reservation: "all",
    parking: "all",
    homepageOnly: false,
    coordOnly: false,
    sort: "default",
    visible: pageSize,
    selectedId: shops[0]?.id || null,
  };

  const els = {
    themeToggle: document.getElementById("themeToggle"),
    dataSummary: document.getElementById("dataSummary"),
    searchInput: document.getElementById("searchInput"),
    areaSelect: document.getElementById("areaSelect"),
    reservationSelect: document.getElementById("reservationSelect"),
    parkingSelect: document.getElementById("parkingSelect"),
    sortSelect: document.getElementById("sortSelect"),
    homepageOnly: document.getElementById("homepageOnly"),
    coordOnly: document.getElementById("coordOnly"),
    resetButton: document.getElementById("resetButton"),
    resultCount: document.getElementById("resultCount"),
    coordCount: document.getElementById("coordCount"),
    homeCount: document.getElementById("homeCount"),
    visibleSummary: document.getElementById("visibleSummary"),
    results: document.getElementById("results"),
    emptyState: document.getElementById("emptyState"),
    loadMoreButton: document.getElementById("loadMoreButton"),
    detailEmpty: document.getElementById("detailEmpty"),
    detailCard: document.getElementById("detailCard"),
    detailArea: document.getElementById("detailArea"),
    detailTitle: document.getElementById("detail-title"),
    detailAddress: document.getElementById("detailAddress"),
    phoneLink: document.getElementById("phoneLink"),
    homeLink: document.getElementById("homeLink"),
    detailPhone: document.getElementById("detailPhone"),
    detailPrice: document.getElementById("detailPrice"),
    detailHours: document.getElementById("detailHours"),
    detailReservation: document.getElementById("detailReservation"),
    detailParking: document.getElementById("detailParking"),
    detailCoords: document.getElementById("detailCoords"),
    detailIntro: document.getElementById("detailIntro"),
    mapHelp: document.getElementById("mapHelp"),
    mapPreview: document.getElementById("mapPreview"),
    kakaoMapLink: document.getElementById("kakaoMapLink"),
    kakaoRouteLink: document.getElementById("kakaoRouteLink"),
    googleMapLink: document.getElementById("googleMapLink"),
    sourceDetailLink: document.getElementById("sourceDetailLink"),
  };

  const normalise = (value) => String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
  const present = (value) => Boolean(String(value || "").trim());
  const hasCoords = (shop) => present(shop.lat) && present(shop.lng);
  const emptyText = "확인 필요";

  function classifyAvailability(value) {
    const text = normalise(value);
    if (!text) return "unknown";
    if (text.includes("불가능") || text.includes("불가") || text.includes("안됨") || text.includes("없음")) return "no";
    if (text.includes("가능") || text.includes("예약") || text.includes("시행")) return "yes";
    return "unknown";
  }

  function safeText(value) {
    return present(value) ? String(value).trim() : emptyText;
  }

  function escapeHtml(value) {
    return String(value || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function highlight(value) {
    const text = escapeHtml(value);
    const query = state.query.trim();
    if (!query) return text;
    const terms = query.split(/\s+/).filter(Boolean).slice(0, 4).map((term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    if (!terms.length) return text;
    return text.replace(new RegExp(`(${terms.join("|")})`, "gi"), "<mark>$1</mark>");
  }

  function formatCount(number) {
    return new Intl.NumberFormat("ko-KR").format(number);
  }

  function statusLabel(value, kind) {
    const cls = classifyAvailability(value);
    const original = safeText(value);
    if (cls === "yes") return { cls: "yes", text: `${kind} 가능`, detail: original };
    if (cls === "no") return { cls: "no", text: `${kind} 불가능`, detail: original };
    return { cls: "unknown", text: `${kind} 확인 필요`, detail: original };
  }

  function telHref(phone) {
    const cleaned = String(phone || "").replace(/[^0-9+]/g, "");
    return cleaned ? `tel:${cleaned}` : "#";
  }

  function cleanUrl(url) {
    const text = String(url || "").trim();
    if (!text) return "";
    if (/^https?:\/\//i.test(text)) return text;
    return `http://${text}`;
  }

  function mapUrls(shop) {
    const name = encodeURIComponent(shop.name || "안마원");
    const address = encodeURIComponent(shop.address || shop.name || "안마원");
    if (hasCoords(shop)) {
      const lat = encodeURIComponent(shop.lat);
      const lng = encodeURIComponent(shop.lng);
      return {
        kakao: `https://map.kakao.com/link/map/${name},${lat},${lng}`,
        kakaoRoute: `https://map.kakao.com/link/to/${name},${lat},${lng}`,
        google: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
        googleEmbed: `https://maps.google.com/maps?q=${lat},${lng}&z=16&hl=ko&output=embed`,
      };
    }
    return {
      kakao: `https://map.kakao.com/?q=${address}`,
      kakaoRoute: `https://map.kakao.com/?q=${address}`,
      google: `https://www.google.com/maps/search/?api=1&query=${address}`,
      googleEmbed: "",
    };
  }

  function buildSearchText(shop) {
    return normalise([
      shop.name,
      shop.phone,
      shop.homepage,
      shop.address,
      shop.price,
      shop.hours,
      shop.reservation,
      shop.parking,
      shop.intro,
      shop.area,
    ].join(" "));
  }

  function getFilteredShops() {
    const query = normalise(state.query);
    let items = shops.filter((shop) => {
      if (state.area !== "all" && shop.area !== state.area) return false;
      if (state.homepageOnly && !present(shop.homepageUrl)) return false;
      if (state.coordOnly && !hasCoords(shop)) return false;
      if (state.reservation !== "all" && classifyAvailability(shop.reservation) !== state.reservation) return false;
      if (state.parking !== "all" && classifyAvailability(shop.parking) !== state.parking) return false;
      if (query && !buildSearchText(shop).includes(query)) return false;
      return true;
    });

    items = [...items].sort((a, b) => {
      if (state.sort === "name") return a.name.localeCompare(b.name, "ko-KR");
      if (state.sort === "area") return `${a.area}${a.name}`.localeCompare(`${b.area}${b.name}`, "ko-KR");
      if (state.sort === "coord") return Number(hasCoords(b)) - Number(hasCoords(a)) || Number(b.no) - Number(a.no);
      return Number(b.no) - Number(a.no);
    });

    return items;
  }

  function renderAreaOptions() {
    const areas = [...new Set(shops.map((shop) => shop.area).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ko-KR"));
    els.areaSelect.innerHTML = `<option value="all">전체 지역</option>${areas.map((area) => `<option value="${escapeHtml(area)}">${escapeHtml(area)}</option>`).join("")}`;
  }

  function renderSummary(filtered) {
    const total = shops.length;
    const coordCount = filtered.filter(hasCoords).length;
    const homeCount = filtered.filter((shop) => present(shop.homepageUrl)).length;
    els.dataSummary.textContent = `수집일 ${payload.metadata?.collectedDate || "2026-06-26"}, 전체 ${formatCount(total)}곳`;
    els.resultCount.textContent = formatCount(filtered.length);
    els.coordCount.textContent = formatCount(coordCount);
    els.homeCount.textContent = formatCount(homeCount);
    const visible = Math.min(state.visible, filtered.length);
    els.visibleSummary.textContent = `${formatCount(filtered.length)}곳 중 ${formatCount(visible)}곳을 표시 중입니다.`;
  }

  function renderResults(filtered) {
    const visibleItems = filtered.slice(0, state.visible);
    els.emptyState.hidden = filtered.length > 0;
    els.results.innerHTML = visibleItems.map((shop) => {
      const reservation = statusLabel(shop.reservation, "예약");
      const parking = statusLabel(shop.parking, "주차");
      const active = shop.id === state.selectedId ? " is-active" : "";
      return `
        <button class="shop-card${active}" type="button" data-id="${escapeHtml(shop.id)}" role="listitem" aria-label="${escapeHtml(shop.name)} 상세 보기">
          <div class="shop-card-top">
            <div>
              <h3>${highlight(shop.name)}</h3>
              <p class="card-phone">${highlight(safeText(shop.phone))}</p>
            </div>
            <span class="number-badge">${escapeHtml(shop.area)} ${escapeHtml(shop.no)}</span>
          </div>
          <p class="card-address">${highlight(shop.address)}</p>
          <div class="shop-meta">
            <span class="status-pill ${reservation.cls}">${escapeHtml(reservation.text)}</span>
            <span class="status-pill ${parking.cls}">${escapeHtml(parking.text)}</span>
            ${hasCoords(shop) ? `<span class="status-pill yes">좌표 있음</span>` : `<span class="status-pill">좌표 없음</span>`}
          </div>
        </button>
      `;
    }).join("");
    els.loadMoreButton.hidden = state.visible >= filtered.length;
  }

  function setLink(el, href, disabled = false) {
    el.href = disabled ? "#" : href;
    el.classList.toggle("is-disabled", disabled);
    el.setAttribute("aria-disabled", disabled ? "true" : "false");
  }

  function renderMap(shop) {
    const urls = mapUrls(shop);
    setLink(els.kakaoMapLink, urls.kakao, false);
    setLink(els.kakaoRouteLink, urls.kakaoRoute, !hasCoords(shop));
    setLink(els.googleMapLink, urls.google, false);

    if (urls.googleEmbed) {
      els.mapHelp.textContent = "API 키 없이 좌표와 외부 지도 링크를 사용합니다. 카카오 JS API 키는 필요 없습니다.";
      els.mapPreview.innerHTML = `
        <div class="map-coordinate-card">
          <strong>${escapeHtml(shop.name)} 위치 좌표</strong>
          <p>내장 지도 API 대신 검증 가능한 좌표와 외부 지도 링크를 제공합니다.</p>
          <code>${escapeHtml(shop.lat)}, ${escapeHtml(shop.lng)}</code>
        </div>
      `;
      return;
    }

    els.mapHelp.textContent = "좌표가 없어 주소 검색 링크로 연결합니다.";
    els.mapPreview.innerHTML = `<div class="map-fallback"><p>이 항목은 위도와 경도가 없습니다.<br>카카오맵이나 구글지도에서 주소로 검색하세요.</p></div>`;
  }

  function renderDetail(filtered) {
    let shop = shops.find((item) => item.id === state.selectedId);
    if (!shop || !filtered.some((item) => item.id === shop.id)) {
      shop = filtered[0] || null;
      state.selectedId = shop?.id || null;
    }

    els.detailEmpty.hidden = Boolean(shop);
    els.detailCard.hidden = !shop;
    if (!shop) return;

    const homepageUrl = cleanUrl(shop.homepageUrl);
    els.detailArea.textContent = shop.area || "지역 미상";
    els.detailTitle.textContent = shop.name || "상호명 없음";
    els.detailAddress.textContent = safeText(shop.address);
    els.detailPhone.textContent = safeText(shop.phone);
    els.detailPrice.textContent = safeText(shop.price);
    els.detailHours.textContent = safeText(shop.hours);
    els.detailReservation.textContent = safeText(shop.reservation);
    els.detailParking.textContent = safeText(shop.parking);
    els.detailCoords.textContent = hasCoords(shop) ? `${shop.lat}, ${shop.lng}` : emptyText;
    els.detailIntro.textContent = safeText(shop.intro);

    setLink(els.phoneLink, telHref(shop.phone), !present(shop.phone));
    setLink(els.homeLink, homepageUrl, !homepageUrl);
    els.sourceDetailLink.href = shop.sourceUrl || "#";
    els.sourceDetailLink.classList.toggle("is-disabled", !shop.sourceUrl);

    renderMap(shop);
  }

  function render() {
    const filtered = getFilteredShops();
    renderSummary(filtered);
    renderDetail(filtered);
    renderResults(filtered);
  }

  function resetFilters() {
    state.query = "";
    state.area = "all";
    state.reservation = "all";
    state.parking = "all";
    state.homepageOnly = false;
    state.coordOnly = false;
    state.sort = "default";
    state.visible = pageSize;
    els.searchInput.value = "";
    els.areaSelect.value = "all";
    els.reservationSelect.value = "all";
    els.parkingSelect.value = "all";
    els.homepageOnly.checked = false;
    els.coordOnly.checked = false;
    els.sortSelect.value = "default";
    render();
  }

  function bindEvents() {
    els.searchInput.addEventListener("input", (event) => {
      state.query = event.target.value;
      state.visible = pageSize;
      render();
    });
    els.areaSelect.addEventListener("change", (event) => {
      state.area = event.target.value;
      state.visible = pageSize;
      render();
    });
    els.reservationSelect.addEventListener("change", (event) => {
      state.reservation = event.target.value;
      state.visible = pageSize;
      render();
    });
    els.parkingSelect.addEventListener("change", (event) => {
      state.parking = event.target.value;
      state.visible = pageSize;
      render();
    });
    els.sortSelect.addEventListener("change", (event) => {
      state.sort = event.target.value;
      render();
    });
    els.homepageOnly.addEventListener("change", (event) => {
      state.homepageOnly = event.target.checked;
      state.visible = pageSize;
      render();
    });
    els.coordOnly.addEventListener("change", (event) => {
      state.coordOnly = event.target.checked;
      state.visible = pageSize;
      render();
    });
    els.resetButton.addEventListener("click", resetFilters);
    els.loadMoreButton.addEventListener("click", () => {
      state.visible += pageSize;
      render();
    });
    els.results.addEventListener("click", (event) => {
      const card = event.target.closest(".shop-card");
      if (!card) return;
      state.selectedId = card.dataset.id;
      render();
      if (window.matchMedia("(max-width: 980px)").matches) {
        els.detailCard.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    });
    els.themeToggle.addEventListener("click", () => {
      const root = document.documentElement;
      const current = root.getAttribute("data-theme");
      const next = current === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      localStorage.setItem("anmawon-theme", next);
      els.themeToggle.textContent = next === "dark" ? "밝게" : "어둡게";
      els.themeToggle.setAttribute("aria-pressed", next === "dark" ? "true" : "false");
    });
  }

  function initTheme() {
    const saved = localStorage.getItem("anmawon-theme");
    if (saved === "dark" || saved === "light") {
      document.documentElement.setAttribute("data-theme", saved);
      els.themeToggle.textContent = saved === "dark" ? "밝게" : "어둡게";
      els.themeToggle.setAttribute("aria-pressed", saved === "dark" ? "true" : "false");
    }
  }

  function init() {
    initTheme();
    renderAreaOptions();
    bindEvents();
    render();
  }

  init();
})();
