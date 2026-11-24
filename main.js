const pages = [...document.querySelectorAll("[data-page-section]")];

const navTrack = document.querySelector("[data-nav-track]");
const navPill = document.querySelector("[data-nav-pill]");
const navItems = [...document.querySelectorAll("[data-nav]")];

let pillAnimation = null;
let pillX = 0;
let pillW = 0;
let activePageId = "home";
let navPageId = "home";
let contentGeneration = 0;

const imageCache = new Map();
const pageReady = new Map();

function stopMusicPanel() {
  window.musicPanel?.stop();
}

function warmImage(url) {
  if (!url || imageCache.has(url)) return imageCache.get(url);

  const warm = new Image();
  warm.decoding = "async";
  warm.src = url;
  imageCache.set(url, warm);
  return warm;
}

function deferHeavyMedia() {
  pages.forEach((page) => {
    if (page.id === "home") return;

    page.querySelectorAll("img[src]").forEach((img) => {
      if (img.dataset.src) return;
      if (img.hasAttribute("data-film-ticket")) return;
      img.dataset.src = img.getAttribute("src");
      img.removeAttribute("src");
    });

    page.querySelectorAll("video[src]").forEach((video) => {
      if (video.dataset.src) return;
      video.dataset.src = video.getAttribute("src");
      video.removeAttribute("src");
      video.removeAttribute("autoplay");
      video.preload = "none";
    });
  });
}

function imagesForPage(pageId) {
  const page = pages.find((item) => item.id === pageId);
  if (!page) return [];

  return [...page.querySelectorAll("img[data-src], img[src]")];
}

function imageUrlsForPage(pageId) {
  return imagesForPage(pageId)
    .map((img) => img.dataset.src || img.getAttribute("src"))
    .filter(Boolean);
}

function assignImageSource(img) {
  const url = img.dataset.src || img.getAttribute("src");
  if (!url) return;

  warmImage(url);
  if (img.getAttribute("src") !== url) {
    img.src = url;
  }
}

function hydrateImagesGradually(images, generation, readyKey) {
  let index = 0;

  const step = () => {
    if (generation !== contentGeneration) return;

    // One image per frame keeps long tasks off the nav animation.
    if (index < images.length) {
      assignImageSource(images[index]);
      index += 1;
      scheduleContentWork(step);
      return;
    }

    pageReady.set(readyKey, Promise.resolve());
  };

  step();
}

function currentReadyKey(pageId) {
  return pageId;
}

function pendingImages(images) {
  return images.filter((img) => {
    const url = img.dataset.src || img.getAttribute("src");
    return Boolean(url && img.getAttribute("src") !== url);
  });
}

function ensurePageReady(pageId) {
  if (pageId === "home") {
    return Promise.resolve();
  }

  const readyKey = currentReadyKey(pageId);
  const images = imagesForPage(pageId);
  const pending = pendingImages(images);

  if (pending.length === 0) {
    pageReady.set(readyKey, Promise.resolve());
    return Promise.resolve();
  }

  // Resume if a previous visit was interrupted mid-hydrate.
  pageReady.delete(readyKey);
  hydrateImagesGradually(pending, contentGeneration, readyKey);
  return Promise.resolve();
}

function prefetchPage(pageId) {
  if (!pageId || pageId === "home") return;

  // Warm the HTTP cache only — no DOM writes, so hover never janks the pill.
  imageUrlsForPage(pageId).forEach((url) => warmImage(url));
}

const lightbox = document.querySelector("[data-lightbox]");
const lightboxImage = document.querySelector("[data-lightbox-image]");
const lightboxClose = document.querySelector("[data-lightbox-close]");
let lightboxLastFocus = null;
let lightboxRequestId = 0;

const ticketScrim = document.querySelector("[data-ticket-scrim]");
const filmTickets = [...document.querySelectorAll("[data-film-ticket]")];
const filmPage = document.querySelector("#film");
const filmRemSection = document.querySelector("#film-rem");
const filmScrollHint = document.querySelector("[data-film-scroll-rem]");
let ticketSession = null;
let ticketCloseTimer = null;
let ticketWatchTimer = null;

function syncFilmScrollHint() {
  if (!filmScrollHint || !filmPage) return;

  const desktop = window.matchMedia("(min-width: 721px)").matches;
  const onFilm = filmPage.classList.contains("is-active");
  const nearTop = filmPage.scrollTop < 48;
  filmScrollHint.hidden = !(desktop && onFilm && nearTop);
}

const filmDesktopQuery = window.matchMedia("(min-width: 901px)");

// On desktop the two tickets live in the bottom corners of the screen. Show
// the one for the film in view; the other slides down out of its corner.
function syncFilmTickets() {
  if (!filmPage || !filmRemSection) return;

  const desktop = filmDesktopQuery.matches;
  const midpoint = filmPage.scrollTop + filmPage.clientHeight / 2;
  const showRem = midpoint >= filmRemSection.offsetTop;

  filmTickets.forEach((ticket) => {
    const isRem = Boolean(ticket.closest(".film--rem"));
    ticket.classList.toggle("is-tucked", desktop && isRem !== showRem);
  });
}

let filmScrollAnimation = 0;

function scrollFilmToRem() {
  if (!filmPage || !filmRemSection) return;

  const pageRect = filmPage.getBoundingClientRect();
  const remRect = filmRemSection.getBoundingClientRect();
  const to = Math.max(0, filmPage.scrollTop + (remRect.top - pageRect.top));
  const from = filmPage.scrollTop;
  const distance = to - from;
  if (Math.abs(distance) < 1) return;

  const duration = 1100;
  const start = performance.now();
  const animId = ++filmScrollAnimation;

  const easeInOutCubic = (t) =>
    t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  const step = (now) => {
    if (animId !== filmScrollAnimation) return;

    const progress = Math.min(1, (now - start) / duration);
    filmPage.scrollTop = from + distance * easeInOutCubic(progress);
    syncFilmScrollHint();
    syncFilmTickets();

    if (progress < 1) {
      requestAnimationFrame(step);
    }
  };

  requestAnimationFrame(step);
}

filmScrollHint?.addEventListener("click", (event) => {
  event.preventDefault();
  scrollFilmToRem();
});

filmPage?.addEventListener(
  "scroll",
  () => {
    syncFilmScrollHint();
    syncFilmTickets();
  },
  { passive: true }
);

window.addEventListener("resize", () => {
  syncFilmScrollHint();
  syncFilmTickets();
});

const TICKET_MOTION_MS = 520;
const TICKET_MOTION_EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

function closeLightbox() {
  if (!lightbox || lightbox.hidden) return;

  lightbox.hidden = true;
  if (!ticketSession) {
    document.body.style.overflow = "";
  }
  lightboxRequestId += 1;

  if (lightboxImage) {
    lightboxImage.classList.remove("is-ready");
    lightboxImage.removeAttribute("src");
    lightboxImage.alt = "";
  }

  lightboxLastFocus?.focus?.();
  lightboxLastFocus = null;
}

function ticketMotionTransition() {
  const easing = `${TICKET_MOTION_MS}ms ${TICKET_MOTION_EASE}`;
  return ["left", "top", "width", "transform", "filter"]
    .map((property) => `${property} ${easing}`)
    .join(", ");
}

function ticketRestRotate(ticket) {
  const tilt = filmDesktopQuery.matches ? 12 : 17;
  return ticket.closest(".film--rem") ? tilt : -tilt;
}

function ticketAspect(ticket) {
  if (ticket.naturalWidth && ticket.naturalHeight) {
    return ticket.naturalWidth / ticket.naturalHeight;
  }
  return 1648 / 2445;
}

function ticketExpandedWidth(ticket) {
  const targetHeight = Math.min(window.innerHeight * 0.88, 720);
  return targetHeight * ticketAspect(ticket);
}

function clearTicketCloseTimer() {
  if (ticketCloseTimer) {
    clearTimeout(ticketCloseTimer);
    ticketCloseTimer = null;
  }
}

function clearTicketWatchTimer() {
  if (ticketWatchTimer) {
    clearTimeout(ticketWatchTimer);
    ticketWatchTimer = null;
  }
}

function hideTicketWatchButton() {
  clearTicketWatchTimer();
  const watch = ticketSession?.watch;
  if (!watch) return;
  watch.classList.remove("is-visible");
}

function showTicketWatchButton() {
  clearTicketWatchTimer();
  const watch = ticketSession?.watch;
  if (!watch) return;
  ticketWatchTimer = setTimeout(() => {
    watch.classList.add("is-visible");
    ticketWatchTimer = null;
  }, TICKET_MOTION_MS - 40);
}

function closeTicketDetail({ instant = false } = {}) {
  if (!ticketSession) return;

  const { ticket, clone, watch } = ticketSession;
  clearTicketCloseTimer();
  hideTicketWatchButton();

  const finish = () => {
    clearTicketCloseTimer();
    clearTicketWatchTimer();
    watch?.remove();
    clone.remove();
    ticket.classList.remove("is-origin-hidden");
    ticketScrim?.classList.remove("is-visible");
    if (ticketScrim) ticketScrim.hidden = true;
    document.body.classList.remove("has-ticket-detail");
    if (lightbox?.hidden !== false) {
      document.body.style.overflow = "";
    }
    ticketSession = null;
  };

  if (instant) {
    finish();
    return;
  }

  const rect = ticket.getBoundingClientRect();
  const rotate = ticketRestRotate(ticket);
  const endWidth = ticket.offsetWidth;

  // Lock the current expanded size in px so width can interpolate cleanly.
  clone.style.transition = "none";
  clone.style.width = `${clone.offsetWidth}px`;
  clone.style.height = "auto";
  void clone.offsetWidth;

  clone.style.transition = ticketMotionTransition();
  void clone.offsetWidth;

  ticketScrim?.classList.remove("is-visible");
  clone.style.left = `${rect.left + rect.width / 2}px`;
  clone.style.top = `${rect.top + rect.height / 2}px`;
  clone.style.width = `${endWidth}px`;
  clone.style.transform = `translate(-50%, -50%) rotate(${rotate}deg)`;
  clone.style.filter = "drop-shadow(0 18px 30px rgba(0, 0, 0, 0.16))";

  // Wait for the full motion — don't cut on the first transitionend.
  ticketCloseTimer = setTimeout(finish, TICKET_MOTION_MS + 40);
}

function openTicketDetail(ticket) {
  if (!ticket || ticketSession) return;

  closeLightbox();

  const rect = ticket.getBoundingClientRect();
  const rotate = ticketRestRotate(ticket);
  const restWidth = ticket.offsetWidth;
  const clone = ticket.cloneNode(true);
  const src =
    ticket.currentSrc || ticket.getAttribute("src") || ticket.dataset.src;
  const watchUrl = ticket.dataset.watchUrl;

  clone.classList.add("film__ticket-fly");
  clone.classList.remove("is-origin-hidden", "is-tucked");
  clone.removeAttribute("data-film-ticket");
  clone.removeAttribute("aria-hidden");
  clone.alt = ticket.dataset.ticketLabel || "Ticket";
  clone.setAttribute("role", "img");
  if (src) {
    clone.src = src;
  }

  Object.assign(clone.style, {
    position: "fixed",
    left: `${rect.left + rect.width / 2}px`,
    top: `${rect.top + rect.height / 2}px`,
    width: `${Math.max(restWidth, 1)}px`,
    height: "auto",
    transform: `translate(-50%, -50%) rotate(${rotate}deg)`,
    transition: "none",
    zIndex: "45",
  });

  const watch = document.createElement("a");
  watch.className = "film__watch";
  watch.textContent = "Watch here";
  watch.href = watchUrl || "#";
  watch.target = "_blank";
  watch.rel = "noopener noreferrer";
  watch.addEventListener("click", (event) => {
    event.stopPropagation();
  });

  ticket.classList.add("is-origin-hidden");
  document.body.appendChild(clone);
  document.body.appendChild(watch);

  if (ticketScrim) {
    ticketScrim.hidden = false;
    requestAnimationFrame(() => ticketScrim.classList.add("is-visible"));
  }

  document.body.classList.add("has-ticket-detail");
  document.body.style.overflow = "hidden";
  ticketSession = { ticket, clone, watch };

  clone.addEventListener("click", (event) => {
    event.stopPropagation();
    closeTicketDetail();
  });

  const targetWidth = ticketExpandedWidth(ticket);

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!ticketSession || ticketSession.clone !== clone) return;

      clone.style.transition = ticketMotionTransition();
      clone.style.left = "50%";
      clone.style.top = "50%";
      clone.style.width = `${targetWidth}px`;
      clone.style.height = "auto";
      clone.style.transform = "translate(-50%, -50%) rotate(0deg)";
      clone.style.filter = "drop-shadow(0 28px 40px rgba(0, 0, 0, 0.22))";
      showTicketWatchButton();
    });
  });
}

filmTickets.forEach((ticket) => {
  ticket.addEventListener("click", (event) => {
    event.stopPropagation();
    openTicketDetail(ticket);
  });
});

ticketScrim?.addEventListener("click", () => {
  closeTicketDetail();
});

async function openLightbox(trigger) {
  if (!lightbox || !lightboxImage || !trigger) return;

  closeTicketDetail({ instant: true });

  const fullUrl = trigger.dataset.full;
  if (!fullUrl) return;

  const thumb = trigger.querySelector("img");
  const alt = thumb?.alt || "Image detail";
  const requestId = ++lightboxRequestId;

  lightboxLastFocus = document.activeElement;
  lightbox.hidden = false;
  document.body.style.overflow = "hidden";
  lightboxImage.classList.remove("is-ready");
  lightboxImage.alt = alt;
  lightboxClose?.focus();

  warmImage(fullUrl);
  lightboxImage.src = fullUrl;

  try {
    if (lightboxImage.decode) {
      await lightboxImage.decode();
    } else if (!lightboxImage.complete) {
      await new Promise((resolve) => {
        lightboxImage.addEventListener("load", resolve, { once: true });
        lightboxImage.addEventListener("error", resolve, { once: true });
      });
    }
  } catch {
    // Still show whatever loaded.
  }

  if (requestId !== lightboxRequestId || lightbox.hidden) return;
  lightboxImage.classList.add("is-ready");
}

document.querySelectorAll("[data-full]").forEach((trigger) => {
  trigger.addEventListener("click", () => {
    openLightbox(trigger);
  });
});

lightboxClose?.addEventListener("click", (event) => {
  event.stopPropagation();
  closeLightbox();
});

lightbox?.addEventListener("click", (event) => {
  if (event.target === lightbox) {
    closeLightbox();
  }
});

const aboutOpen = document.querySelector("[data-about-open]");
const aboutPanel = document.querySelector("[data-about-panel]");
const aboutMobileQuery = window.matchMedia("(max-width: 720px)");
const aboutInactiveImg = aboutOpen?.querySelector(".about-me__img--inactive");
const aboutActiveImg = aboutOpen?.querySelector(".about-me__img--active");
let aboutLastFocus = null;
let aboutSwapTimer = null;
let aboutSwapShowActive = false;

function setAboutMeFrame(showActive) {
  aboutSwapShowActive = !!showActive;
  // Inline styles so this still works when iOS Reduce Motion suppresses CSS animations.
  if (aboutInactiveImg) {
    aboutInactiveImg.style.setProperty("opacity", aboutSwapShowActive ? "0" : "1", "important");
  }
  if (aboutActiveImg) {
    aboutActiveImg.style.setProperty("opacity", aboutSwapShowActive ? "1" : "0", "important");
    aboutActiveImg.style.setProperty("animation", "none", "important");
  }
}

function stopAboutMeSwap() {
  if (aboutSwapTimer) {
    clearInterval(aboutSwapTimer);
    aboutSwapTimer = null;
  }
  aboutSwapShowActive = false;
  if (aboutInactiveImg) aboutInactiveImg.style.removeProperty("opacity");
  if (aboutActiveImg) {
    aboutActiveImg.style.removeProperty("opacity");
    aboutActiveImg.style.removeProperty("animation");
  }
}

function startAboutMeSwap() {
  stopAboutMeSwap();
  if (!aboutOpen || !aboutInactiveImg || !aboutActiveImg) return;

  setAboutMeFrame(false);
  aboutSwapTimer = setInterval(() => {
    setAboutMeFrame(!aboutSwapShowActive);
  }, 900);
}

// The button sits under the home subtitle, so it only shows on the home page.
// On touch screens it flips between its two drawings on its own.
function placeAboutMe() {
  if (!aboutOpen) return;

  if (aboutMobileQuery.matches && activePageId === "home") {
    startAboutMeSwap();
  } else {
    stopAboutMeSwap();
  }
}

function setAboutExpanded(expanded) {
  aboutOpen?.setAttribute("aria-expanded", expanded ? "true" : "false");
}

function closeAboutPanel() {
  if (!aboutPanel || aboutPanel.hidden) return;

  aboutPanel.hidden = true;
  setAboutExpanded(false);
  aboutLastFocus?.focus?.();
  aboutLastFocus = null;
}

function openAboutPanel() {
  if (!aboutPanel) return;

  closeLightbox();
  closeDocPanel();
  aboutLastFocus = document.activeElement;
  aboutPanel.hidden = false;
  setAboutExpanded(true);
  loadSpotifyNow();
}

aboutOpen?.addEventListener("click", () => {
  openAboutPanel();
});

aboutPanel?.addEventListener("click", (event) => {
  if (event.target === aboutPanel) {
    closeAboutPanel();
  }
});

const spotifyNow = document.querySelector("[data-spotify-now]");
const spotifyEmbed = document.querySelector("[data-spotify-embed]");
let spotifyRequestId = 0;

function hideSpotifyNow() {
  if (!spotifyNow) return;
  spotifyNow.hidden = true;
  if (spotifyEmbed) spotifyEmbed.src = "about:blank";
}

async function loadSpotifyNow() {
  if (!spotifyNow || !spotifyEmbed) return;

  const requestId = ++spotifyRequestId;

  try {
    const response = await fetch("/api/spotify", { cache: "no-store" });
    if (!response.ok) {
      hideSpotifyNow();
      return;
    }

    const data = await response.json();
    if (requestId !== spotifyRequestId) return;

    const track = data?.track;
    if (!track?.id) {
      hideSpotifyNow();
      return;
    }

    const embedSrc = `https://open.spotify.com/embed/track/${encodeURIComponent(
      track.id
    )}?utm_source=generator`;

    if (spotifyEmbed.src !== embedSrc) {
      spotifyEmbed.src = embedSrc;
    }

    spotifyNow.hidden = false;
  } catch {
    if (requestId === spotifyRequestId) hideSpotifyNow();
  }
}

const docOpen = document.querySelector("[data-doc-open]");
const docPanel = document.querySelector("[data-doc-panel]");
const docPages = [...document.querySelectorAll("[data-doc-page]")];
const docPagesWrap = document.querySelector("[data-doc-pages]");
const docPrev = document.querySelector("[data-doc-prev]");
const docNext = document.querySelector("[data-doc-next]");
let docLastFocus = null;
let docPageIndex = 0;

function setDocExpanded(expanded) {
  docOpen?.setAttribute("aria-expanded", expanded ? "true" : "false");
}

function setDocPage(index) {
  if (!docPages.length) return;

  docPageIndex = Math.max(0, Math.min(docPages.length - 1, index));
  docPages.forEach((page, i) => {
    const active = i === docPageIndex;
    page.hidden = !active;
    page.classList.toggle("is-active", active);
  });

  if (docPrev) docPrev.disabled = docPageIndex === 0;
  if (docNext) docNext.disabled = docPageIndex === docPages.length - 1;
  if (docPagesWrap) docPagesWrap.scrollTop = 0;
}

function closeDocPanel() {
  if (!docPanel || docPanel.hidden) return;

  docPanel.hidden = true;
  setDocExpanded(false);
  docLastFocus?.focus?.();
  docLastFocus = null;
}

function openDocPanel() {
  if (!docPanel) return;

  closeLightbox();
  closeAboutPanel();
  docLastFocus = document.activeElement;
  docPanel.hidden = false;
  setDocExpanded(true);
  setDocPage(0);
}

docOpen?.addEventListener("click", () => {
  openDocPanel();
});

docPanel?.addEventListener("click", (event) => {
  if (event.target === docPanel) {
    closeDocPanel();
  }
});

docPrev?.addEventListener("click", (event) => {
  event.stopPropagation();
  setDocPage(docPageIndex - 1);
});

docNext?.addEventListener("click", (event) => {
  event.stopPropagation();
  setDocPage(docPageIndex + 1);
});

placeAboutMe();
if (aboutMobileQuery.addEventListener) {
  aboutMobileQuery.addEventListener("change", placeAboutMe);
} else {
  aboutMobileQuery.addListener(placeAboutMe);
}

document.addEventListener("keydown", (event) => {
  if (docPanel && !docPanel.hidden) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setDocPage(docPageIndex - 1);
      return;
    }
    if (event.key === "ArrowRight") {
      event.preventDefault();
      setDocPage(docPageIndex + 1);
      return;
    }
  }

  if (event.key === "Escape") {
    if (ticketSession) {
      closeTicketDetail();
      return;
    }
    if (docPanel && !docPanel.hidden) {
      closeDocPanel();
      return;
    }
    if (aboutPanel && !aboutPanel.hidden) {
      closeAboutPanel();
      return;
    }
    closeLightbox();
  }
});

function releasePage(pageId) {
  if (!pageId || pageId === "home") return;

  if (pageId === "music-production" || pageId === "music") {
    stopMusicPanel();
  }
}

function applyPillPose(x, width) {
  pillX = x;
  pillW = width;
  navPill.style.width = `${width}px`;
  navPill.style.transform = `translate3d(${x}px, -50%, 0) scaleX(1)`;
}

function moveNavPill(target, animate = true) {
  if (!navTrack || !navPill || !target) return;

  const nextX = target.offsetLeft;
  const nextW = target.offsetWidth;

  if (pillAnimation) {
    pillAnimation.cancel();
    pillAnimation = null;
  }

  if (!animate) {
    applyPillPose(nextX, nextW);
    return;
  }

  const fromX = pillX;
  const fromW = pillW || nextW;

  // Width is set once to the destination size; motion is transform-only
  // (translate + scaleX) so the pill can stay on the compositor thread.
  navPill.style.width = `${nextW}px`;
  const startScale = fromW / nextW;

  pillAnimation = navPill.animate(
    [
      {
        transform: `translate3d(${fromX}px, -50%, 0) scaleX(${startScale})`,
      },
      {
        transform: `translate3d(${nextX}px, -50%, 0) scaleX(1)`,
      },
    ],
    {
      duration: 450,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "forwards",
    }
  );

  pillX = nextX;
  pillW = nextW;

  pillAnimation.finished
    .then(() => {
      if (!pillAnimation) return;
      try {
        pillAnimation.commitStyles();
      } catch {
        // Safari may throw if styles can't be committed.
      }
      pillAnimation.cancel();
      pillAnimation = null;
      applyPillPose(nextX, nextW);
    })
    .catch(() => {
      pillAnimation = null;
      applyPillPose(nextX, nextW);
    });
}

function setActiveNav(id, animatePill = true) {
  const target =
    navItems.find((item) => item.dataset.nav === id) ||
    navItems.find((item) => item.dataset.nav === "home");

  navItems.forEach((item) => {
    const isActive = item === target;
    item.classList.toggle("is-active", isActive);
    if (isActive) {
      item.setAttribute("aria-current", "page");
    } else {
      item.removeAttribute("aria-current");
    }
  });

  moveNavPill(target, animatePill);
}

function revealPage(pageId) {
  closeTicketDetail({ instant: true });
  closeLightbox();
  closeAboutPanel();
  closeDocPanel();

  if (activePageId && activePageId !== pageId) {
    releasePage(activePageId);
  }

  pages.forEach((page) => {
    const isActive = page.id === pageId;
    page.classList.toggle("is-active", isActive);
    page.setAttribute("aria-hidden", isActive ? "false" : "true");
  });

  activePageId = pageId;
  window.scrollTo(0, 0);
  if (filmPage) filmPage.scrollTop = 0;
  placeAboutMe();
  syncFilmScrollHint();
  syncFilmTickets();
  if (pageId === "app-development") slideInDocCard();
}

// Like the film tickets, the Flatlist card slides up out of its corner when
// the apps page appears (desktop only; on phones it sits in the page flow).
function slideInDocCard() {
  if (!docOpen || !filmDesktopQuery.matches) return;

  docOpen.classList.add("is-tucked");
  void docOpen.offsetWidth; // Render it tucked before letting it slide.
  requestAnimationFrame(() => docOpen.classList.remove("is-tucked"));
}

function afterNextPaint(callback) {
  requestAnimationFrame(() => {
    requestAnimationFrame(callback);
  });
}

function scheduleContentWork(callback) {
  if (typeof scheduler !== "undefined" && scheduler.postTask) {
    scheduler.postTask(callback, { priority: "background" });
    return;
  }

  if (typeof requestIdleCallback === "function") {
    requestIdleCallback(() => callback(), { timeout: 120 });
    return;
  }

  setTimeout(callback, 0);
}

function showPage(id) {
  const pageId = id || "home";
  navPageId = pageId;

  // 1) Nav only — must stay tiny and sync so the pill never waits on content.
  setActiveNav(pageId, true);

  const generation = ++contentGeneration;

  // 2) Content on its own schedule, after the browser has painted the nav frame.
  afterNextPaint(() => {
    if (generation !== contentGeneration) return;

    scheduleContentWork(() => {
      if (generation !== contentGeneration) return;
      revealPage(pageId);
      ensurePageReady(pageId);
    });
  });
}

navItems.forEach((item) => {
  item.addEventListener("click", () => {
    showPage(item.dataset.nav);
  });

  item.addEventListener("pointerenter", () => {
    prefetchPage(item.dataset.nav);
  });

  item.addEventListener("focus", () => {
    prefetchPage(item.dataset.nav);
  });
});

window.addEventListener("resize", () => {
  const active = navItems.find((item) => item.classList.contains("is-active"));
  moveNavPill(active, false);
});

if (window.location.hash) {
  history.replaceState(null, "", window.location.pathname + window.location.search);
}

deferHeavyMedia();

pages.forEach((page) => {
  const isHome = page.id === "home";
  page.classList.toggle("is-active", isHome);
  page.setAttribute("aria-hidden", isHome ? "false" : "true");
});

function syncNavPill(animate = false) {
  const active = navItems.find((item) => item.classList.contains("is-active"));
  moveNavPill(active, animate);
}

requestAnimationFrame(() => {
  syncNavPill(false);
  syncFilmScrollHint();
  syncFilmTickets();
});

if (document.fonts?.ready) {
  document.fonts.ready.then(() => {
    syncNavPill(false);
  });
}

window.addEventListener("orientationchange", () => {
  setTimeout(() => {
    syncNavPill(false);
  }, 200);
});

const CAROUSEL_INTERVAL_MS = 3800;
// Share of the image width a drag must cover to move to the next image.
const CAROUSEL_DRAG_THRESHOLD = 0.18;
const CAROUSEL_CLICK_SLOP_PX = 6;
const CAROUSEL_WHEEL_THRESHOLD = 40;
// A trackpad keeps sending wheel events while its momentum fades; ignore them
// until they pause this long so one swipe moves one image.
const CAROUSEL_WHEEL_GAP_MS = 250;

function setupCarousel(carousel) {
  const viewport = carousel.querySelector(".carousel__viewport");
  const track = carousel.querySelector("[data-carousel-track]");
  const progress = carousel.querySelector("[data-carousel-progress]");
  const thumb = carousel.querySelector("[data-carousel-thumb]");
  const prevButton = carousel.querySelector("[data-carousel-prev]");
  const nextButton = carousel.querySelector("[data-carousel-next]");
  const autoplay = carousel.dataset.carouselAutoplay !== "off";
  if (!viewport || !track) return;

  const slides = [...track.querySelectorAll(".carousel__slide")];
  const count = slides.length;
  if (count < 2) return;

  function loopCopy(slide) {
    const copy = slide.cloneNode(true);
    copy.setAttribute("aria-hidden", "true");
    copy.tabIndex = -1;
    if (copy.dataset.full) {
      copy.addEventListener("click", () => openLightbox(copy));
    }
    return copy;
  }

  // Copies of the last and first images sit at each end so the loop can keep
  // moving in either direction. Positions 1..count are the real images.
  track.prepend(loopCopy(slides[count - 1]));
  track.append(loopCopy(slides[0]));
  if (thumb) thumb.style.width = `${100 / count}%`;

  let position = 1;
  let timer = null;
  let hovered = false;
  let inView = false;
  let drag = null;
  let scrubbing = false;
  let suppressClick = false;
  let wheelTotal = 0;
  let wheelLastAt = 0;
  let wheelLockedUntil = 0;
  let shownIndex = 0;

  const currentIndex = () => (position - 1 + count) % count;

  function render({ instant = false, offsetPx = 0 } = {}) {
    track.classList.toggle("is-instant", instant);
    thumb?.classList.toggle("is-instant", instant);
    const base = -position * 100;
    track.style.transform = offsetPx
      ? `translateX(calc(${base}% + ${offsetPx}px))`
      : `translateX(${base}%)`;
    if (thumb) thumb.style.transform = `translateX(${currentIndex() * 100}%)`;
    slides.forEach((slide, i) => {
      slide.tabIndex = i === currentIndex() ? 0 : -1;
    });

    if (currentIndex() !== shownIndex) {
      shownIndex = currentIndex();
      carousel.dispatchEvent(
        new CustomEvent("carousel:change", {
          detail: { index: shownIndex, slide: slides[shownIndex] },
        }),
      );
    }
  }

  // Swap a loop copy for the real image it mirrors, without animating.
  function leaveLoopCopy() {
    if (position === 0) position = count;
    else if (position === count + 1) position = 1;
    else return;
    render({ instant: true });
    void track.offsetWidth; // Commit the jump before the next animated move.
  }

  function canAutoplay() {
    return (
      inView &&
      !hovered &&
      !drag &&
      !scrubbing &&
      !document.hidden &&
      lightbox?.hidden !== false &&
      !ticketSession
    );
  }

  function restartAutoplay() {
    clearTimeout(timer);
    if (!autoplay) return;
    timer = setTimeout(() => {
      if (canAutoplay()) step(1);
      else restartAutoplay();
    }, CAROUSEL_INTERVAL_MS);
  }

  function step(delta) {
    leaveLoopCopy();
    position += delta;
    render();
    restartAutoplay();
  }

  function jumpTo(index) {
    leaveLoopCopy();
    position = index + 1;
    render();
    restartAutoplay();
  }

  track.addEventListener("transitionend", (event) => {
    if (event.target === track) leaveLoopCopy();
  });

  carousel.addEventListener("pointerenter", (event) => {
    if (event.pointerType === "mouse") hovered = true;
  });
  carousel.addEventListener("pointerleave", (event) => {
    if (event.pointerType !== "mouse") return;
    hovered = false;
    restartAutoplay();
  });

  // Drag with the mouse or swipe with a finger; the image follows the pointer.
  viewport.addEventListener("dragstart", (event) => event.preventDefault());

  viewport.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    suppressClick = false;
    leaveLoopCopy();
    drag = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dx: 0,
      active: false,
      width: viewport.clientWidth,
    };
  });

  viewport.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;

    if (!drag.active) {
      if (Math.abs(dx) < CAROUSEL_CLICK_SLOP_PX) return;
      if (Math.abs(dy) > Math.abs(dx)) {
        drag = null; // Vertical gesture: let the page scroll.
        return;
      }
      drag.active = true;
      carousel.classList.add("is-dragging");
      viewport.setPointerCapture(event.pointerId);
    }

    drag.dx = dx;
    render({ instant: true, offsetPx: dx });
  });

  function endDrag(event) {
    if (!drag || event.pointerId !== drag.id) return;
    const { active, dx, width } = drag;
    drag = null;
    carousel.classList.remove("is-dragging");
    if (!active) return;

    suppressClick = true;
    if (Math.abs(dx) > width * CAROUSEL_DRAG_THRESHOLD) {
      step(dx < 0 ? 1 : -1);
    } else {
      render();
      restartAutoplay();
    }
  }

  viewport.addEventListener("pointerup", endDrag);
  viewport.addEventListener("pointercancel", endDrag);

  // A drag ends with a click on the image; don't open the lightbox for it.
  viewport.addEventListener(
    "click",
    (event) => {
      if (!suppressClick) return;
      suppressClick = false;
      event.stopPropagation();
      event.preventDefault();
    },
    true,
  );

  // Two-finger horizontal scroll on a trackpad, or shift + mouse wheel.
  viewport.addEventListener(
    "wheel",
    (event) => {
      const dx = event.deltaX || (event.shiftKey ? event.deltaY : 0);
      if (Math.abs(dx) <= Math.abs(event.shiftKey ? 0 : event.deltaY)) return;
      event.preventDefault();

      const now = performance.now();
      if (now < wheelLockedUntil) {
        wheelLockedUntil = now + CAROUSEL_WHEEL_GAP_MS;
        return;
      }
      if (now - wheelLastAt > CAROUSEL_WHEEL_GAP_MS) wheelTotal = 0;
      wheelLastAt = now;
      wheelTotal += dx;
      if (Math.abs(wheelTotal) < CAROUSEL_WHEEL_THRESHOLD) return;

      step(wheelTotal > 0 ? 1 : -1);
      wheelTotal = 0;
      wheelLockedUntil = now + CAROUSEL_WHEEL_GAP_MS;
    },
    { passive: false },
  );

  // Click or drag along the progress bar to pick an image.
  function indexAt(clientX) {
    const rect = progress.getBoundingClientRect();
    const fraction = (clientX - rect.left) / rect.width;
    return Math.min(count - 1, Math.max(0, Math.floor(fraction * count)));
  }

  progress?.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    scrubbing = true;
    progress.setPointerCapture(event.pointerId);
    jumpTo(indexAt(event.clientX));
  });
  progress?.addEventListener("pointermove", (event) => {
    if (!scrubbing) return;
    const index = indexAt(event.clientX);
    if (index !== currentIndex()) jumpTo(index);
  });
  const endScrub = () => {
    if (!scrubbing) return;
    scrubbing = false;
    restartAutoplay();
  };
  progress?.addEventListener("pointerup", endScrub);
  progress?.addEventListener("pointercancel", endScrub);

  prevButton?.addEventListener("click", () => step(-1));
  nextButton?.addEventListener("click", () => step(1));

  carousel.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
    event.preventDefault();
    step(event.key === "ArrowRight" ? 1 : -1);
    slides[currentIndex()].focus({ preventScroll: true });
  });

  if ("IntersectionObserver" in window) {
    new IntersectionObserver(
      (entries) => {
        inView = entries.some((entry) => entry.isIntersecting);
        if (inView) restartAutoplay();
      },
      { threshold: 0.4 },
    ).observe(carousel);
  } else {
    inView = true;
  }

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) restartAutoplay();
  });

  render({ instant: true });
  restartAutoplay();
}

document.querySelectorAll("[data-carousel]").forEach(setupCarousel);
