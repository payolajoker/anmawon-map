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
    userLocation: null,
    userOverlay: null,
    locationStatus: "idle",
    nearbyVisibleCount: null,
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

  function distanceMeters(lat1, lng1, lat2, lng2) {
    const toRad = (degrees) => degrees * Math.PI / 180;
    const earthRadius = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2
      + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function shopsByDistance(items) {
    if (!mapState.userLocation) return [...items];
    return [...items]
      .map((shop) => ({
        ...shop,
        distanceFromUser: distanceMeters(
          mapState.userLocation.lat,
          mapState.userLocation.lng,
          Number(shop.lat),
          Number(shop.lng),
        ),
      }))
      .sort((a, b) => a.distanceFromUser - b.distanceFromUser);
  }

  function selectNearestShop(items) {
    if (!mapState.userLocation || !items.length) return;
    const nearest = shopsByDistance(items)[0];
    if (nearest) state.selectedId = nearest.id;
  }

  function targetNearbyCount(items) {
    if (items.length <= 2) return items.length;
    return Math.min(5, items.length);
  }

  function getDisplayShops(filtered) {
    if (!mapState.userLocation) return filtered;
    return shopsByDistance(filtered).slice(0, targetNearbyCount(filtered));
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

  function renderSummary(filtered, displayed = filtered) {
    const total = shops.length;
    const homeCount = displayed.filter((shop) => present(shop.homepageUrl)).length;
    els.dataSummary.textContent = `수집일 ${payload.metadata?.collectedDate || "2026-06-26"}, 좌표 확인 ${formatCount(total)}곳`;
    els.resultCount.textContent = formatCount(displayed.length);
    els.homeCount.textContent = formatCount(homeCount);

    if (mapState.failed) {
      els.mapSummary.textContent = "지도 로딩 실패. 카카오 도메인 등록을 확인하세요.";
    } else if (mapState.locationStatus === "locating") {
      els.mapSummary.textContent = "현재 위치를 확인하는 중입니다.";
    } else if (mapState.userLocation && filtered.length) {
      const visible = mapState.nearbyVisibleCount || displayed.length;
      els.mapSummary.textContent = `현재 위치 기준 가까운 ${formatCount(visible)}곳을 지도에 표시합니다.`;
    } else {
      els.mapSummary.textContent = `${formatCount(filtered.length)}곳을 지도에 표시합니다.`;
    }
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
      render({ fitMap: false, panToSelected: false });
      requestUserLocation();
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

  function userLocationContent() {
    return `<div class="user-location-marker" aria-label="현재 위치"></div>`;
  }

  function updateUserLocationMarker() {
    if (!mapState.ready || !mapState.userLocation || !window.kakao?.maps) return;
    if (mapState.userOverlay) mapState.userOverlay.setMap(null);
    const position = new window.kakao.maps.LatLng(mapState.userLocation.lat, mapState.userLocation.lng);
    mapState.userOverlay = new window.kakao.maps.CustomOverlay({
      position,
      content: userLocationContent(),
      xAnchor: 0.5,
      yAnchor: 0.5,
      zIndex: 30,
    });
    mapState.userOverlay.setMap(mapState.map);
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

  function updateMapMarkers(filtered, shouldFit, options = {}) {
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
      const shouldCluster = mapState.clusterer && !(mapState.userLocation && markers.length <= 5);
      if (shouldCluster) mapState.clusterer.addMarkers(markers);
      else markers.forEach((marker) => marker.setMap(mapState.map));
      mapState.signature = signature;
    }
    updateUserLocationMarker();
    if (shouldFit) {
      if (mapState.userLocation && options.useUserLocation !== false) {
        fitMapToUserLocation(filtered);
      } else {
        fitMapTo(filtered);
        if (filtered.length === 1) focusSelectedOnMap(false);
        else closeSelectedOverlay();
      }
    }
  }

  function fitMapTo(items) {
    mapState.nearbyVisibleCount = null;
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

  function symmetricBoundsAroundUser(targets) {
    const { lat, lng } = mapState.userLocation;
    const minDelta = 0.003;
    const padding = 1.08;
    let latDelta = minDelta;
    let lngDelta = minDelta;
    targets.forEach((shop) => {
      latDelta = Math.max(latDelta, Math.abs(Number(shop.lat) - lat));
      lngDelta = Math.max(lngDelta, Math.abs(Number(shop.lng) - lng));
    });
    latDelta *= padding;
    lngDelta *= padding;
    const bounds = new window.kakao.maps.LatLngBounds();
    bounds.extend(new window.kakao.maps.LatLng(lat - latDelta, lng - lngDelta));
    bounds.extend(new window.kakao.maps.LatLng(lat + latDelta, lng + lngDelta));
    return bounds;
  }

  function visibleShopCount(items) {
    if (!mapState.ready || !items.length) return 0;
    const bounds = mapState.map.getBounds();
    return items.filter((shop) => bounds.contain(new window.kakao.maps.LatLng(Number(shop.lat), Number(shop.lng)))).length;
  }

  function rangeScore(count, minVisible, maxVisible) {
    if (count >= minVisible && count <= maxVisible) return 0;
    return count < minVisible ? (minVisible - count) * 4 : count - maxVisible;
  }

  function adjustZoomToVisibleRange(items, attempt = 0, visited = new Set(), best = null) {
    if (!mapState.ready || !mapState.userLocation || !items.length) return;
    const minVisible = Math.min(3, items.length);
    const maxVisible = Math.min(5, items.length);
    const currentLevel = mapState.map.getLevel();
    const currentCount = visibleShopCount(items);
    const currentScore = rangeScore(currentCount, minVisible, maxVisible);
    const nextBest = !best || currentScore < best.score
      ? { level: currentLevel, count: currentCount, score: currentScore }
      : best;

    if (currentScore === 0 || attempt >= 12) {
      if (nextBest.level !== currentLevel) {
        mapState.map.setLevel(nextBest.level);
        mapState.map.setCenter(new window.kakao.maps.LatLng(mapState.userLocation.lat, mapState.userLocation.lng));
      }
      mapState.nearbyVisibleCount = Math.min(nextBest.count, items.length);
      const filtered = getFilteredShops();
      renderSummary(filtered, getDisplayShops(filtered));
      return;
    }

    const nextLevel = currentCount > maxVisible ? currentLevel - 1 : currentLevel + 1;
    if (nextLevel < 1 || nextLevel > 14 || visited.has(nextLevel)) {
      mapState.nearbyVisibleCount = Math.min(nextBest.count, items.length);
      const filtered = getFilteredShops();
      renderSummary(filtered, getDisplayShops(filtered));
      return;
    }

    visited.add(currentLevel);
    mapState.map.setLevel(nextLevel);
    mapState.map.setCenter(new window.kakao.maps.LatLng(mapState.userLocation.lat, mapState.userLocation.lng));
    window.setTimeout(() => adjustZoomToVisibleRange(items, attempt + 1, visited, nextBest), 180);
  }

  function fitMapToUserLocation(items) {
    if (!mapState.ready || !mapState.userLocation) {
      fitMapTo(items);
      return;
    }
    mapState.nearbyVisibleCount = null;
    closeSelectedOverlay();
    updateUserLocationMarker();
    const userPosition = new window.kakao.maps.LatLng(mapState.userLocation.lat, mapState.userLocation.lng);

    if (!items.length) {
      mapState.map.setLevel(5);
      mapState.map.panTo(userPosition);
      renderSummary(items, items);
      return;
    }

    const nearby = shopsByDistance(items).slice(0, targetNearbyCount(items));
    mapState.map.setBounds(symmetricBoundsAroundUser(nearby));
    window.setTimeout(() => {
      mapState.map.setCenter(userPosition);
      adjustZoomToVisibleRange(items);
      if (items.length === 1) focusSelectedOnMap(false);
    }, 220);
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
    const { fitMap = false, panToSelected = false, useUserLocation = true } = options;
    const filtered = getFilteredShops();
    const displayed = useUserLocation ? getDisplayShops(filtered) : filtered;
    if (fitMap && useUserLocation && mapState.userLocation && displayed.length && !panToSelected) {
      selectNearestShop(displayed);
    }
    renderSummary(filtered, displayed);
    renderDetail(displayed);
    updateMapMarkers(displayed, fitMap, { useUserLocation });
    if (panToSelected) focusSelectedOnMap(true);
  }

  function requestUserLocation() {
    if (!navigator.geolocation || !mapState.ready) {
      render({ fitMap: true, panToSelected: false, useUserLocation: false });
      return;
    }
    mapState.locationStatus = "locating";
    renderSummary(getFilteredShops());
    navigator.geolocation.getCurrentPosition(
      (position) => {
        mapState.locationStatus = "ready";
        mapState.userLocation = {
          lat: Number(position.coords.latitude),
          lng: Number(position.coords.longitude),
        };
        const filtered = getFilteredShops();
        selectNearestShop(getDisplayShops(filtered));
        render({ fitMap: true, panToSelected: false, useUserLocation: true });
      },
      () => {
        mapState.locationStatus = "failed";
        mapState.userLocation = null;
        mapState.nearbyVisibleCount = null;
        render({ fitMap: true, panToSelected: false, useUserLocation: false });
      },
      { enableHighAccuracy: true, timeout: 9000, maximumAge: 300000 },
    );
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
    els.fitMapButton.addEventListener("click", () => {
      const filtered = getFilteredShops();
      if (mapState.userLocation) fitMapToUserLocation(getDisplayShops(filtered));
      else fitMapTo(filtered);
    });
    els.selectedMapButton.addEventListener("click", () => focusSelectedOnMap(true));
  }

  function init() {
    bindEvents();
    render({ fitMap: false });
    initKakaoMap();
  }

  init();
})();
