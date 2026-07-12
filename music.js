let audioContext = null;
let source = null;

const audio = document.querySelector("[data-music-audio]");
const nowPlaying = document.querySelector("[data-music-now-playing]");
const playPauseButton = document.querySelector("[data-music-play-pause]");
const progress = document.querySelector("[data-music-progress]");
const progressTrack = document.querySelector("[data-music-progress-track]");
const progressThumb = document.querySelector("[data-music-progress-thumb]");
const tracks = document.querySelectorAll("[data-music-track]");

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

async function ensureAudioContext() {
  if (!audioContext) {
    audioContext = new AudioContext();
  }

  if (audioContext.state === "suspended") {
    await audioContext.resume();
  }

  if (!source) {
    source = audioContext.createMediaElementSource(audio);
    source.connect(audioContext.destination);
  }
}

function updatePlayPauseButton() {
  if (!playPauseButton || !audio) return;

  const hasTrack = Boolean(audio.src);
  const isPlaying = hasTrack && !audio.paused;

  playPauseButton.disabled = !hasTrack;
  playPauseButton.classList.toggle("is-playing", isPlaying);
  playPauseButton.setAttribute("aria-label", isPlaying ? "Pause" : "Play");
}

async function togglePlayPause() {
  if (!audio?.src) return;

  await ensureAudioContext();

  if (audio.paused) {
    try {
      await audio.play();
    } catch {
      // Autoplay may be blocked until user interaction.
    }
  } else {
    audio.pause();
  }

  updatePlayPauseButton();
}

function setActiveTrack(button) {
  tracks.forEach((track) => {
    track.classList.toggle("is-active", track === button);
  });
}

async function loadTrack(filename, button) {
  if (!audio) return;

  await ensureAudioContext();

  audio.src = `assets/music/${encodeURIComponent(filename)}`;
  audio.load();
  setActiveTrack(button);

  if (nowPlaying) {
    nowPlaying.textContent = filename;
  }

  try {
    await audio.play();
  } catch {
    // Autoplay may be blocked until user interaction.
  }

  updatePlayPauseButton();
}

function updateProgress() {
  if (!progressThumb || !audio?.duration) return;

  const percent = (audio.currentTime / audio.duration) * 100;
  progressThumb.style.left = `${percent}%`;
  progress?.setAttribute("aria-valuenow", String(Math.round(percent)));
}

function resetProgress() {
  if (!progressThumb) return;

  progressThumb.style.left = "0%";
  progress?.setAttribute("aria-valuenow", "0");
}

function seekToPosition(clientX) {
  if (!progressTrack || !audio?.duration) return;

  const rect = progressTrack.getBoundingClientRect();
  const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
  audio.currentTime = ratio * audio.duration;
  updateProgress();
}

function stopMusic() {
  if (!audio) return;

  audio.pause();
  audio.currentTime = 0;
  resetProgress();
}

function resetMusic() {
  stopMusic();

  tracks.forEach((track) => track.classList.remove("is-active"));

  if (nowPlaying) {
    nowPlaying.textContent = "select a track";
  }

  updatePlayPauseButton();
}

tracks.forEach((track) => {
  track.addEventListener("click", () => {
    loadTrack(track.dataset.filename, track);
  });
});

audio?.addEventListener("play", () => {
  ensureAudioContext();
  updatePlayPauseButton();
});

audio?.addEventListener("pause", updatePlayPauseButton);

audio?.addEventListener("timeupdate", updateProgress);
audio?.addEventListener("loadedmetadata", updateProgress);

audio?.addEventListener("ended", () => {
  resetProgress();
  updatePlayPauseButton();
});

playPauseButton?.addEventListener("click", () => {
  togglePlayPause();
});

progressTrack?.addEventListener("click", (event) => {
  seekToPosition(event.clientX);
});

let isDraggingProgress = false;

progressTrack?.addEventListener("pointerdown", (event) => {
  isDraggingProgress = true;
  progressTrack.setPointerCapture(event.pointerId);
  seekToPosition(event.clientX);
});

progressTrack?.addEventListener("pointermove", (event) => {
  if (!isDraggingProgress) return;
  seekToPosition(event.clientX);
});

progressTrack?.addEventListener("pointerup", () => {
  isDraggingProgress = false;
});

progressTrack?.addEventListener("pointercancel", () => {
  isDraggingProgress = false;
});

window.musicPanel = {
  stop: resetMusic,
};
