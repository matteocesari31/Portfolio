const pages = [...document.querySelectorAll("[data-page-section]")];
const appVideos = [...document.querySelectorAll("[data-app-video]")];

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

function pauseAppVideos() {
  appVideos.forEach((video) => {
    video.pause();
  });
}

function wakeAppVideos() {
  appVideos.forEach((video) => {
    if (video.dataset.src && !video.getAttribute("src")) {
      video.src = video.dataset.src;
      video.preload = "metadata";
    }
  });
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

  if (pageId === "app-development") {
    wakeAppVideos();
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
let ticketSession = null;
let ticketCloseTimer = null;
let ticketWatchTimer = null;

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
  return ticket.closest(".film--rem") ? 17 : -17;
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
  clone.classList.remove("is-origin-hidden");
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

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    if (ticketSession) {
      closeTicketDetail();
      return;
    }
    closeLightbox();
  }
});

function releasePage(pageId) {
  if (!pageId || pageId === "home") return;

  // Keep media src after first hydrate so return visits stay instant.
  // Only pause video so it stops decoding frames while hidden.
  if (pageId === "app-development") {
    pauseAppVideos();
  }

  if (pageId === "music-production") {
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

requestAnimationFrame(() => syncNavPill(false));

if (document.fonts?.ready) {
  document.fonts.ready.then(() => syncNavPill(false));
}
