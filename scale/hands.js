// Camera + MediaPipe hand tracking. Exposes Hands.list: up to two hands, sorted left to right on screen,
// each { tip: {x, y} (index fingertip, 0..1 of the mirrored camera frame), pointing, lm: [21 points] }.

const MP = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14';
const MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

const Hands = {
  video: null,
  model: null,
  lastTime: -1,
  aspect: 16 / 9,
  list: [],
  status: 'camera off',
  onStatus: null,

  setStatus(t) {
    this.status = t;
    if (this.onStatus) this.onStatus(t);
  },

  async start() {
    this.setStatus('asking for camera…');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720, facingMode: 'user' }, audio: false });
      const v = document.createElement('video');
      v.playsInline = true;
      v.muted = true;
      v.srcObject = stream;
      await v.play();
      this.video = v;
    } catch (err) {
      this.setStatus('no camera (' + (err && err.name ? err.name : 'error') + '): mouse only');
      return;
    }
    this.setStatus('loading hand tracking…');
    try {
      const { HandLandmarker, FilesetResolver } = await import(MP + '/vision_bundle.mjs');
      const fileset = await FilesetResolver.forVisionTasks(MP + '/wasm');
      const make = (delegate) => HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODEL, delegate },
        runningMode: 'VIDEO',
        numHands: 2,
        minHandDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });
      try { this.model = await make('GPU'); } catch (e) { this.model = await make('CPU'); }
      this.setStatus('hands ready');
    } catch (err) {
      this.setStatus('hand tracking failed to load: mouse only');
    }
  },

  // call once per animation frame; only does work when the camera has a new frame
  update() {
    const v = this.video;
    if (!this.model || !v || v.readyState < 2) { this.list = []; return; }
    if (v.currentTime === this.lastTime) return;
    this.lastTime = v.currentTime;
    const res = this.model.detectForVideo(v, performance.now());
    const asp = (v.videoWidth / v.videoHeight) || 16 / 9;
    this.aspect = asp;

    const next = (res.landmarks || []).map((raw) => {
      const lm = raw.map((p) => ({ x: 1 - p.x, y: p.y })); // mirrored, like a selfie view
      const d = (a, b) => Math.hypot((lm[a].x - lm[b].x) * asp, lm[a].y - lm[b].y);
      const extended = (tip, pip) => d(tip, 0) > d(pip, 0) * 1.12;
      const curled = (tip, pip) => d(tip, 0) < d(pip, 0) * 1.1;
      const others = [[12, 10], [16, 14], [20, 18]].filter(([t, p]) => curled(t, p)).length;
      return { tip: { x: lm[8].x, y: lm[8].y }, rawPointing: extended(8, 6) && others >= 2, lm };
    });
    next.sort((a, b) => a.tip.x - b.tip.x);

    const same = next.length === this.list.length;
    next.forEach((h, i) => {
      const o = same ? this.list[i] : null;
      if (o) {
        // light smoothing against jittery detections
        h.tip.x = o.tip.x + (h.tip.x - o.tip.x) * 0.6;
        h.tip.y = o.tip.y + (h.tip.y - o.tip.y) * 0.6;
        h.score = Math.max(0, Math.min(4, o.score + (h.rawPointing ? 1 : -1)));
      } else {
        h.score = h.rawPointing ? 2 : 0;
      }
      h.pointing = h.score >= 2; // needs a couple of frames to switch, so a single misread doesn't flicker
    });
    this.list = next;
  },

  // distance between the two index fingertips as a fraction of the frame width (null without two hands)
  spread() {
    if (this.list.length < 2) return null;
    const [a, b] = this.list;
    return Math.hypot(a.tip.x - b.tip.x, (a.tip.y - b.tip.y) / this.aspect);
  },

  pointer() {
    return this.list.find((h) => h.pointing) || null;
  },
};
