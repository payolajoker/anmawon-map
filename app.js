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

  const mapState = {
    ready: false,
    failed: false,
    map: null,
    clusterer: null,
    markers: new Map(),
    infoWindow: null,
    signature: "",
    lastFiltered: [],
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
    routeHelp: document.getElementById("routeHelp"),
    kakaoMapLink: document.getElementById("kakaoMapLink"),
    kakaoRouteLink: document.getElementById("kakaoRouteLink"),
    googleMapLink: document.getElementById("googleMapLink"),
    sourceDetailLink: document.getElementById("sourceDetailLink"),
    mapSummary: document.getElementById("mapSummary"),
    kakaoMap: document.getElementById("kakaoMap"),
    mapLoading: document.getElementById("mapLoading"),
    mapError: document.getElementById("mapError"),
    fitMapButton: document.getElementById("fitMapButton"),
    selectedMapButton: document.getElementById("selectedMapButton"),
  };

  const normalise = (value) => String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
  const present = (value) => Boolean(String(value || "").trim());
  const hasCoords = (shop) => present(shop.lat) && present(shop.lng) && !Number.isNaN(Number(shop.lat)) && !Number.isNaN(Number(shop.lng));
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
      };
    }
    return {
      kakao: `https://map.kakao.com/?q=${address}`,
      kakaoRoute: `https://map.kakao.com/?q=${address}`,
      google: `https://www.google.com/maps/search/?api=1&query=${address}`,
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
    const missingCoordCount = filtered.length - coordCount;
    els.mapSummary.textContent = mapState.failed
      ? "지도 로딩 실패. 카카오 도메인 등록을 확인하세요."
      : missingCoordCount > 0
        ? `검색 결과 ${formatCount(filtered.length)}곳 중 ${formatCount(coordCount)}곳은 지도에 표시됩니다. 좌표 없는 ${formatCount(missingCoordCount)}곳은 목록에만 표시됩니다.`
        : `검색 결과 ${formatCount(filtered.length)}곳 전부 지도에 표시됩니다.`;
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
            ${hasCoords(shop) ? `<span class="status-pill yes">지도 표시 가능</span>` : `<span class="status-pill">좌표 없음</span>`}
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

  function renderDetail(filtered) {
    let shop = shops.find((item) => item.id === state.selectedId);
    if (!shop || !filtered.some((item) => item.id === shop.id)) {
      shop = filtered[0] || null;
      state.selectedId = shop?.id || null;
    }

    els.detailEmpty.hidden = Boolean(shop);
    els.detailCard.hidden = !shop;
    els.selectedMapButton.disabled = !shop || !hasCoords(shop) || !mapState.ready;
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
    els.routeHelp.textContent = hasCoords(shop)
      ? "선택한 위치가 위 지도에 표시됩니다. 외부 지도에서 길찾기도 열 수 있습니다."
      : "좌표가 없어 외부 지도에서는 주소 검색으로 연결합니다.";

    const urls = mapUrls(shop);
    setLink(els.phoneLink, telHref(shop.phone), !present(shop.phone));
    setLink(els.homeLink, homepageUrl, !homepageUrl);
    setLink(els.kakaoMapLink, urls.kakao, false);
    setLink(els.kakaoRouteLink, urls.kakaoRoute, !hasCoords(shop));
    setLink(els.googleMapLink, urls.google, false);
    setLink(els.sourceDetailLink, shop.sourceUrl || "#", !shop.sourceUrl);
  }

  function failMap() {
    if (mapState.ready) return;
    mapState.failed = true;
    els.mapLoading.hidden = true;
    els.mapError.hidden = false;
    els.selectedMapButton.disabled = true;
    renderSummary(getFilteredShops());
  }

  function initKakaoMap() {
    if (!window.kakao || !window.kakao.maps || typeof window.kakao.maps.load !== "function") {
      failMap();
      return;
    }

    const failTimer = window.setTimeout(failMap, 9000);
    window.kakao.maps.load(() => {
      window.clearTimeout(failTimer);
      const center = new window.kakao.maps.LatLng(36.35, 127.8);
      mapState.map = new window.kakao.maps.Map(els.kakaoMap, {
        center,
        level: 13,
      });
      mapState.infoWindow = new window.kakao.maps.InfoWindow({ zIndex: 10 });
      const zoomControl = new window.kakao.maps.ZoomControl();
      mapState.map.addControl(zoomControl, window.kakao.maps.ControlPosition.RIGHT);
      const mapTypeControl = new window.kakao.maps.MapTypeControl();
      mapState.map.addControl(mapTypeControl, window.kakao.maps.ControlPosition.TOPRIGHT);

      if (window.kakao.maps.MarkerClusterer) {
        mapState.clusterer = new window.kakao.maps.MarkerClusterer({
          map: mapState.map,
          averageCenter: true,
          minLevel: 7,
          gridSize: 70,
          calculator: [10, 50, 100, 300],
          styles: [
            {
              width: "42px",
              height: "42px",
              background: "rgba(20, 85, 51, 0.92)",
              color: "#fff",
              borderRadius: "21px",
              textAlign: "center",
              fontWeight: "800",
              lineHeight: "42px",
              border: "2px solid rgba(255, 255, 255, 0.9)",
            },
            {
              width: "52px",
              height: "52px",
              background: "rgba(20, 85, 51, 0.92)",
              color: "#fff",
              borderRadius: "26px",
              textAlign: "center",
              fontWeight: "800",
              lineHeight: "52px",
              border: "2px solid rgba(255, 255, 255, 0.9)",
            },
            {
              width: "62px",
              height: "62px",
              background: "rgba(20, 85, 51, 0.94)",
              color: "#fff",
              borderRadius: "31px",
              textAlign: "center",
              fontWeight: "900",
              lineHeight: "62px",
              border: "2px solid rgba(255, 255, 255, 0.9)",
            },
            {
              width: "72px",
              height: "72px",
              background: "rgba(20, 85, 51, 0.96)",
              color: "#fff",
              borderRadius: "36px",
              textAlign: "center",
              fontWeight: "900",
              lineHeight: "72px",
              border: "2px solid rgba(255, 255, 255, 0.9)",
            },
          ],
        });
      }

      mapState.ready = true;
      mapState.failed = false;
      els.mapLoading.hidden = true;
      els.mapError.hidden = true;
      render({ fitMap: true, panToSelected: false });
    });
  }

  function clearMarkers() {
    if (mapState.clusterer) mapState.clusterer.clear();
    mapState.markers.forEach((marker) => marker.setMap(null));
    mapState.markers.clear();
    if (mapState.infoWindow) mapState.infoWindow.close();
  }

  function makeMarker(shop) {
    const position = new window.kakao.maps.LatLng(Number(shop.lat), Number(shop.lng));
    const marker = new window.kakao.maps.Marker({ position, title: shop.name });
    window.kakao.maps.event.addListener(marker, "click", () => {
      state.selectedId = shop.id;
      render({ fitMap: false, panToSelected: true });
      if (window.matchMedia("(max-width: 980px)").matches) {
        els.detailCard.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    });
    return marker;
  }

  function markerInfoContent(shop) {
    return `
      <div style="min-width:190px;padding:12px 14px;color:#17211b;font-family:system-ui,sans-serif;line-height:1.45">
        <strong style="display:block;margin-bottom:4px;font-size:14px">${escapeHtml(shop.name)}</strong>
        <span style="display:block;color:#5f6f65;font-size:12px">${escapeHtml(shop.phone || "전화번호 확인 필요")}</span>
        <span style="display:block;margin-top:4px;color:#5f6f65;font-size:12px">${escapeHtml(shop.address || "주소 확인 필요")}</span>
      </div>
    `;
  }

  function updateMapMarkers(filtered, shouldFit) {
    mapState.lastFiltered = filtered;
    if (!mapState.ready || !window.kakao?.maps) return;
    const coordItems = filtered.filter(hasCoords);
    const signature = coordItems.map((shop) => shop.id).join("|");
    if (signature !== mapState.signature) {
      clearMarkers();
      const markers = coordItems.map((shop) => {
        const marker = makeMarker(shop);
        mapState.markers.set(shop.id, marker);
        return marker;
      });
      if (mapState.clusterer) {
        mapState.clusterer.addMarkers(markers);
      } else {
        markers.forEach((marker) => marker.setMap(mapState.map));
      }
      mapState.signature = signature;
    }
    if (shouldFit) fitMapTo(coordItems);
    focusSelectedOnMap(false);
  }

  function fitMapTo(items) {
    if (!mapState.ready || !items.length) return;
    if (items.length === 1) {
      const only = items[0];
      mapState.map.setLevel(4);
      mapState.map.panTo(new window.kakao.maps.LatLng(Number(only.lat), Number(only.lng)));
      return;
    }
    const bounds = new window.kakao.maps.LatLngBounds();
    items.forEach((shop) => bounds.extend(new window.kakao.maps.LatLng(Number(shop.lat), Number(shop.lng))));
    mapState.map.setBounds(bounds);
  }

  function focusSelectedOnMap(pan) {
    if (!mapState.ready || !state.selectedId) return;
    const shop = shops.find((item) => item.id === state.selectedId);
    if (!shop || !hasCoords(shop)) return;
    const marker = mapState.markers.get(shop.id);
    const position = new window.kakao.maps.LatLng(Number(shop.lat), Number(shop.lng));
    if (pan) {
      mapState.map.setLevel(Math.min(mapState.map.getLevel(), 5));
      mapState.map.panTo(position);
    }
    if (marker && mapState.infoWindow) {
      mapState.infoWindow.setContent(markerInfoContent(shop));
      mapState.infoWindow.open(mapState.map, marker);
    }
  }

  function render(options = {}) {
    const { fitMap = false, panToSelected = false } = options;
    const filtered = getFilteredShops();
    renderSummary(filtered);
    renderDetail(filtered);
    renderResults(filtered);
    updateMapMarkers(filtered, fitMap);
    if (panToSelected) focusSelectedOnMap(true);
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
    render({ fitMap: true });
  }

  function bindEvents() {
    els.searchInput.addEventListener("input", (event) => {
      state.query = event.target.value;
      state.visible = pageSize;
      render({ fitMap: true });
    });
    els.areaSelect.addEventListener("change", (event) => {
      state.area = event.target.value;
      state.visible = pageSize;
      render({ fitMap: true });
    });
    els.reservationSelect.addEventListener("change", (event) => {
      state.reservation = event.target.value;
      state.visible = pageSize;
      render({ fitMap: true });
    });
    els.parkingSelect.addEventListener("change", (event) => {
      state.parking = event.target.value;
      state.visible = pageSize;
      render({ fitMap: true });
    });
    els.sortSelect.addEventListener("change", (event) => {
      state.sort = event.target.value;
      render({ fitMap: false });
    });
    els.homepageOnly.addEventListener("change", (event) => {
      state.homepageOnly = event.target.checked;
      state.visible = pageSize;
      render({ fitMap: true });
    });
    els.coordOnly.addEventListener("change", (event) => {
      state.coordOnly = event.target.checked;
      state.visible = pageSize;
      render({ fitMap: true });
    });
    els.resetButton.addEventListener("click", resetFilters);
    els.loadMoreButton.addEventListener("click", () => {
      state.visible += pageSize;
      render({ fitMap: false });
    });
    els.results.addEventListener("click", (event) => {
      const card = event.target.closest(".shop-card");
      if (!card) return;
      state.selectedId = card.dataset.id;
      render({ fitMap: false, panToSelected: true });
      if (window.matchMedia("(max-width: 980px)").matches) {
        els.detailCard.scrollIntoView({ block: "start", behavior: "smooth" });
      }
    });
    els.fitMapButton.addEventListener("click", () => {
      fitMapTo(getFilteredShops().filter(hasCoords));
    });
    els.selectedMapButton.addEventListener("click", () => {
      focusSelectedOnMap(true);
    });
    els.themeToggle.addEventListener("click", () => {
      const root = document.documentElement;
      const current = root.getAttribute("data-theme");
      const next = current === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("anmawon-theme", next); } catch (_) {}
      els.themeToggle.textContent = next === "dark" ? "밝게" : "어둡게";
      els.themeToggle.setAttribute("aria-pressed", next === "dark" ? "true" : "false");
    });
  }

  function initTheme() {
    let saved = "";
    try { saved = localStorage.getItem("anmawon-theme") || ""; } catch (_) {}
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
    render({ fitMap: false });
    initKakaoMap();
  }

  init();
})();
