(() => {
  const payload = window.ANMAWON_DATA || { metadata: { count: 0 }, shops: [] };
  const shops = payload.shops || [];

  const state = {
    query: "",
    reservation: "all",
    parking: "all",
    homepageOnly: false,
    selectedId: shops[0]?.id || null,
  };

  const mapState = {
    ready: false,
    failed: false,
    map: null,
    clusterer: null,
    markers: new Map(),
    selectedOverlay: null,
    signature: "",
    lastFiltered: [],
  };

  const els = {
    dataSummary: document.getElementById("dataSummary"),
    searchInput: document.getElementById("searchInput"),
    reservationSelect: document.getElementById("reservationSelect"),
    parkingSelect: document.getElementById("parkingSelect"),
    homepageOnly: document.getElementById("homepageOnly"),
    resetButton: document.getElementById("resetButton"),
    resultCount: document.getElementById("resultCount"),
    homeCount: document.getElementById("homeCount"),
    detailEmpty: document.getElementById("detailEmpty"),
    detailCard: document.getElementById("detailCard"),
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
  const emptyText = "확인 필요";

  function hasCoords(shop) {
    return present(shop.lat) && present(shop.lng) && !Number.isNaN(Number(shop.lat)) && !Number.isNaN(Number(shop.lng));
  }

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

  function formatCount(number) {
    return new Intl.NumberFormat("ko-KR").format(number);
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
    const lat = encodeURIComponent(shop.lat);
    const lng = encodeURIComponent(shop.lng);
    return {
      kakao: `https://map.kakao.com/link/map/${name},${lat},${lng}`,
      kakaoRoute: `https://map.kakao.com/link/to/${name},${lat},${lng}`,
      google: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
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
    ].join(" "));
  }

  function getFilteredShops() {
    const query = normalise(state.query);
    let items = shops.filter((shop) => {
      if (state.homepageOnly && !present(shop.homepageUrl)) return false;
      if (state.reservation !== "all" && classifyAvailability(shop.reservation) !== state.reservation) return false;
      if (state.parking !== "all" && classifyAvailability(shop.parking) !== state.parking) return false;
      if (query && !buildSearchText(shop).includes(query)) return false;
      return true;
    });

    items = [...items].sort((a, b) => a.name.localeCompare(b.name, "ko-KR"));

    return items;
  }

  function renderSummary(filtered) {
    const total = shops.length;
    const homeCount = filtered.filter((shop) => present(shop.homepageUrl)).length;
    els.dataSummary.textContent = `수집일 ${payload.metadata?.collectedDate || "2026-06-26"}, 좌표 확인 ${formatCount(total)}곳`;
    els.resultCount.textContent = formatCount(filtered.length);
    els.homeCount.textContent = formatCount(homeCount);
    els.mapSummary.textContent = mapState.failed
      ? "지도 로딩 실패. 카카오 도메인 등록을 확인하세요."
      : `${formatCount(filtered.length)}곳을 지도에 표시합니다.`;
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
    els.selectedMapButton.disabled = !shop || !mapState.ready;
    if (!shop) return;

    const homepageUrl = cleanUrl(shop.homepageUrl);
    const urls = mapUrls(shop);
    els.detailTitle.textContent = shop.name || "상호명 없음";
    els.detailAddress.textContent = safeText(shop.address);
    els.detailPhone.textContent = safeText(shop.phone);
    els.detailPrice.textContent = safeText(shop.price);
    els.detailHours.textContent = safeText(shop.hours);
    els.detailReservation.textContent = safeText(shop.reservation);
    els.detailParking.textContent = safeText(shop.parking);
    els.detailCoords.textContent = `${shop.lat}, ${shop.lng}`;
    els.detailIntro.textContent = safeText(shop.intro);

    setLink(els.phoneLink, telHref(shop.phone), !present(shop.phone));
    setLink(els.homeLink, homepageUrl, !homepageUrl);
    setLink(els.kakaoMapLink, urls.kakao, false);
    setLink(els.kakaoRouteLink, urls.kakaoRoute, false);
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
      mapState.map = new window.kakao.maps.Map(els.kakaoMap, {
        center: new window.kakao.maps.LatLng(36.35, 127.8),
        level: 13,
      });

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
            clusterStyle(42),
            clusterStyle(52),
            clusterStyle(62),
            clusterStyle(72),
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

  function clusterStyle(size) {
    return {
      width: `${size}px`,
      height: `${size}px`,
      background: "rgba(20, 85, 51, 0.94)",
      color: "#fff",
      borderRadius: `${size / 2}px`,
      textAlign: "center",
      fontWeight: "900",
      lineHeight: `${size}px`,
      border: "2px solid rgba(255, 255, 255, 0.92)",
      boxShadow: "0 8px 20px rgba(16, 32, 25, 0.2)",
    };
  }

  function clearMarkers() {
    if (mapState.clusterer) mapState.clusterer.clear();
    mapState.markers.forEach((marker) => marker.setMap(null));
    mapState.markers.clear();
    closeSelectedOverlay();
  }

  function closeSelectedOverlay() {
    if (mapState.selectedOverlay) {
      mapState.selectedOverlay.setMap(null);
      mapState.selectedOverlay = null;
    }
  }

  function makeMarker(shop) {
    const position = new window.kakao.maps.LatLng(Number(shop.lat), Number(shop.lng));
    const marker = new window.kakao.maps.Marker({ position, title: shop.name });
    window.kakao.maps.event.addListener(marker, "click", () => {
      state.selectedId = shop.id;
      render({ fitMap: false, panToSelected: true });
      document.querySelector(".detail-section")?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    return marker;
  }

  function selectedOverlayContent(shop) {
    return `
      <div class="marker-label">
        <strong>${escapeHtml(shop.name || "상호명 없음")}</strong>
        <span>${escapeHtml(shop.phone || "전화번호 확인 필요")}</span>
      </div>
    `;
  }

  function updateMapMarkers(filtered, shouldFit) {
    mapState.lastFiltered = filtered;
    if (!mapState.ready || !window.kakao?.maps) return;
    const signature = filtered.map((shop) => shop.id).join("|");
    if (signature !== mapState.signature) {
      clearMarkers();
      const markers = filtered.map((shop) => {
        const marker = makeMarker(shop);
        mapState.markers.set(shop.id, marker);
        return marker;
      });
      if (mapState.clusterer) mapState.clusterer.addMarkers(markers);
      else markers.forEach((marker) => marker.setMap(mapState.map));
      mapState.signature = signature;
    }
    if (shouldFit) {
      fitMapTo(filtered);
      if (filtered.length === 1) focusSelectedOnMap(false);
      else closeSelectedOverlay();
    }
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
    if (!shop || !mapState.markers.has(shop.id)) {
      closeSelectedOverlay();
      return;
    }
    const position = new window.kakao.maps.LatLng(Number(shop.lat), Number(shop.lng));
    if (pan) {
      mapState.map.setLevel(Math.min(mapState.map.getLevel(), 5));
      mapState.map.panTo(position);
    }
    closeSelectedOverlay();
    mapState.selectedOverlay = new window.kakao.maps.CustomOverlay({
      position,
      content: selectedOverlayContent(shop),
      xAnchor: 0.5,
      yAnchor: 1.35,
      zIndex: 20,
    });
    mapState.selectedOverlay.setMap(mapState.map);
  }

  function render(options = {}) {
    const { fitMap = false, panToSelected = false } = options;
    const filtered = getFilteredShops();
    renderSummary(filtered);
    renderDetail(filtered);
    updateMapMarkers(filtered, fitMap);
    if (panToSelected) focusSelectedOnMap(true);
  }

  function resetFilters() {
    state.query = "";
    state.reservation = "all";
    state.parking = "all";
    state.homepageOnly = false;
    state.selectedId = shops[0]?.id || null;
    els.searchInput.value = "";
    els.reservationSelect.value = "all";
    els.parkingSelect.value = "all";
    els.homepageOnly.checked = false;
    render({ fitMap: true, panToSelected: false });
  }

  function bindEvents() {
    els.searchInput.addEventListener("input", (event) => {
      state.query = event.target.value;
      render({ fitMap: true });
    });
    els.reservationSelect.addEventListener("change", (event) => {
      state.reservation = event.target.value;
      render({ fitMap: true });
    });
    els.parkingSelect.addEventListener("change", (event) => {
      state.parking = event.target.value;
      render({ fitMap: true });
    });
    els.homepageOnly.addEventListener("change", (event) => {
      state.homepageOnly = event.target.checked;
      render({ fitMap: true });
    });
    els.resetButton.addEventListener("click", resetFilters);
    els.fitMapButton.addEventListener("click", () => fitMapTo(getFilteredShops()));
    els.selectedMapButton.addEventListener("click", () => focusSelectedOnMap(true));
  }

  function init() {
    bindEvents();
    render({ fitMap: false });
    initKakaoMap();
  }

  init();
})();
