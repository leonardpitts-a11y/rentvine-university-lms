/*
 * Rentvine University -- Interactive LMS Program
 * Created by Leonard Pitts.
 */
(() => {
  const course = window.RVU_COURSE;
  const TRAINER_MODE = !!(course.meta && course.meta.trainerMode);
  const STORAGE_KEY = TRAINER_MODE ? 'rentvine-university-interactive-lms-v6-trainer-edition' : 'rentvine-university-interactive-lms-v6-beginner-enhanced';
  const PASS_MARK = Number(course.meta.quizPassMark || 0.8);
  const app = document.getElementById('app');
  const sidebar = document.getElementById('sidebar');
  const toast = document.getElementById('toast');
  let state = loadState();
  let lastRenderedRoute = null;

  function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
  }
  function attr(value) { return escapeHtml(value).replace(/`/g, '&#96;'); }
  function pct(n) { return `${Math.round(Math.max(0, Math.min(1, n)) * 100)}%`; }
  function toastMsg(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 2400);
  }
  function defaultState() {
    return {
      profile: { learnerName: '', startDate: '', targetDate: '', cohort: '' },
      setup: {}, tracks: {}, videos: {}, reference: {}, glossary: {}, onboarding: {}, rolePath: { selected: 'full' }, match: {}, accessibility: { highContrast: false }, weeks: {}, checkpoints: {}, caseFile: {},
      capstone: { steps: {}, submit: {}, notes: '', scoreReviewed: false, criticalFailure: false },
      lastRoute: '#overview', updatedAt: new Date().toISOString()
    };
  }
  function deepMerge(base, incoming) {
    if (!incoming || typeof incoming !== 'object') return base;
    const out = Array.isArray(base) ? base.slice() : { ...base };
    Object.keys(incoming).forEach(k => {
      if (incoming[k] && typeof incoming[k] === 'object' && !Array.isArray(incoming[k])) out[k] = deepMerge(out[k] || {}, incoming[k]);
      else out[k] = incoming[k];
    });
    return out;
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      return deepMerge(defaultState(), JSON.parse(raw));
    } catch (e) { return defaultState(); }
  }
  function saveState(skipScorm=false) {
    state.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    updateOverallProgress();
    if (!skipScorm) syncScorm();
    syncMonday();
  }
  function getPath(path) {
    return path.split('.').reduce((obj, key) => (obj && obj[key] !== undefined ? obj[key] : undefined), state);
  }
  function setPath(path, value) {
    const keys = path.split('.');
    let obj = state;
    keys.slice(0, -1).forEach(k => { if (!obj[k] || typeof obj[k] !== 'object') obj[k] = {}; obj = obj[k]; });
    obj[keys[keys.length - 1]] = value;
  }
  function deletePath(path) {
    const keys = path.split('.');
    let obj = state;
    for (const k of keys.slice(0, -1)) { if (!obj[k]) return; obj = obj[k]; }
    delete obj[keys[keys.length - 1]];
  }
  function checked(path) { return getPath(path) ? 'checked' : ''; }
  function value(path) { return attr(getPath(path) || ''); }
  function checkedIcon(ok) { return ok ? '✓' : '—'; }
  function statusBadge(ok, label) { return `<span class="status-badge ${ok ? 'pass' : 'open'}">${escapeHtml(label)}</span>`; }

  function linkButton(url, label, extra = '') {
    if (!url) return '<span class="resource-meta">Link unavailable</span>';
    return `<a class="button primary small" href="${attr(url)}" target="_blank" rel="noopener" ${extra}>${escapeHtml(label)}</a>`;
  }

  function currentRoute() { return window.location.hash || state.lastRoute || '#overview'; }

  function initSidebar() {
    const route = currentRoute();
    const weekLinks = course.weeks.map(w => {
      const s = weekStats(w);
      // Mirror the same dimming the Role Path Filters page already applies to its own filtered
      // module list (.role-week.dimmed): once a learner picks a narrower role path, weeks that
      // path doesn't require should look visually de-emphasized here in the persistent sidebar
      // too, not just on the Role Path Filters page itself. Still fully clickable/navigable --
      // "Full certification still requires all 19 weeks and the capstone" per that page's copy.
      const inPath = isWeekInSelectedPath(w.week);
      return `<li><a class="nav-link ${!inPath ? 'dimmed' : ''} ${route === `#week-${String(w.week).padStart(2,'0')}` ? 'active' : ''}" href="#week-${String(w.week).padStart(2,'0')}">
        <span>Week ${w.week}: ${escapeHtml(w.title)}</span><span class="badge ${s.complete ? 'complete' : ''}">${pct(s.progress)}</span>
      </a></li>`;
    }).join('');
    const checkpointLinks = (course.checkpoints || []).map(cp => {
      const p = checkpointProgress(cp).progress;
      return `<li><a class="nav-link ${route === ('#' + cp.id) ? 'active' : ''}" href="#${cp.id}">
        <span>${escapeHtml(cp.title)}</span><span class="badge ${p >= 1 ? 'complete' : ''}">${pct(p)}</span>
      </a></li>`;
    }).join('');
    sidebar.innerHTML = `
      <h2>Start here</h2>
      <ul class="nav-list">
        ${navItem('#overview', 'Overview', route)}
        ${navItem('#before-begin', 'Before You Begin', route, onboardingProgress())}
        ${navItem('#dashboard', 'Progress Dashboard', route)}
        ${navItem('#role-paths', 'Role Path Filters', route)}
        ${navItem('#videos', 'Video Alignment Map', route)}
        ${navItem('#glossary', 'Defined Terms & Glossary', route, glossaryOverallProgress())}
        ${navItem('#glossary-match', 'Match Terms Practice', route)}
        ${navItem('#job-aids', 'Downloadable Job Aids', route)}
      </ul>
      <h2>Weekly modules</h2>
      <ul class="nav-list">${weekLinks}</ul>
      <h2>Phase Checkpoints</h2>
      <ul class="nav-list">${checkpointLinks}</ul>
      <h2>Finish</h2>
      <ul class="nav-list">
        ${navItem('#capstone', 'Capstone Checklist & Rubric', route, capstoneProgress())}
        ${navItem('#resources', 'Resource Library', route)}
      </ul>`;
  }
  function navItem(hash, label, route, progress) {
    const badge = progress === undefined ? '' : `<span class="badge ${progress >= 1 ? 'complete' : ''}">${pct(progress)}</span>`;
    return `<li><a class="nav-link ${route === hash ? 'active' : ''}" href="${hash}"><span>${escapeHtml(label)}</span>${badge}</a></li>`;
  }

  function onboardingProgress() {
    const checks = course.onboarding?.checks || [];
    if (!checks.length) return 1;
    return checks.filter((_, i) => state.onboarding?.checks?.[i]).length / checks.length;
  }
  function selectedRolePath() {
    const id = state.rolePath?.selected || 'full';
    return (course.rolePaths || []).find(p => p.id === id) || (course.rolePaths || [])[0];
  }
  function isWeekInSelectedPath(weekNumber) {
    const path = selectedRolePath();
    return !path || (path.weeks || []).includes(Number(weekNumber));
  }
  function phaseMapForWeek(weekNumber) {
    return (course.phaseMaps || []).find(m => (m.weeks || []).includes(Number(weekNumber)));
  }

  function resourceProgress(week) {
    if (!week.resources.length) return 1;
    const st = state.weeks[week.week]?.resources || {};
    return week.resources.filter((_, i) => st[i]).length / week.resources.length;
  }
  function successProgress(week) {
    if (!week.successCriteria.length) return 1;
    const st = state.weeks[week.week]?.success || {};
    return week.successCriteria.filter((_, i) => st[i]).length / week.successCriteria.length;
  }
  // Most weeks require a lab walkthrough video. A week can opt out with `videoUploadRequired: false`
  // in its data (currently just Week 1), in which case a supporting document takes its place instead.
  // (`videoUploadRequired` already existed in the course data for every week but was previously
  // unused by the app -- this wires it up rather than introducing a second, parallel flag.)
  function weekVideoRequired(week) { return week.videoUploadRequired !== false; }
  function labSubmissionProgress(week) {
    const st = state.weeks[week.week] || {};
    if (!weekVideoRequired(week)) {
      const hasDocs = !!(st.documentFiles && st.documentFiles.length);
      return hasDocs ? 1 : 0;
    }
    const hasAttachedFile = !!(st.videoFile && st.videoFile.name);
    return hasAttachedFile || (st.videoUploaded && (st.videoEvidenceLink || st.videoEvidenceFileName)) ? 1 : 0;
  }
  // Kept as an alias -- weekStats() and older callers refer to this by its original name.
  function labVideoProgress(week) { return labSubmissionProgress(week); }

  // ---- Lab video file storage (IndexedDB) ----
  // localStorage (used for all other state) has a ~5-10MB quota and cannot reliably hold binary
  // video data, so attached lab/capstone video files are stored in their own IndexedDB database,
  // keyed by a stable string (e.g. "week-3" or "capstone"). Only small metadata (name/size/type/
  // storedAt) lives in the regular JSON state so it still exports/imports/syncs normally.
  const VIDEO_DB_NAME = 'rentvine-university-lab-videos';
  // Bumped from 1 to 2 to add the "documents" store below (for supporting-document attachments).
  // onupgradeneeded only fires when the requested version is higher than what's already on disk,
  // so this version bump is required for anyone who already used the video-attach feature at v1 --
  // otherwise their existing database would never gain the new "documents" store.
  const VIDEO_DB_VERSION = 2;
  const VIDEO_STORE_NAME = 'files';
  const DOC_STORE_NAME = 'documents';
  let videoDbPromise = null;
  function openVideoDb() {
    if (videoDbPromise) return videoDbPromise;
    videoDbPromise = new Promise((resolve, reject) => {
      if (!('indexedDB' in window)) { reject(new Error('IndexedDB is not available in this browser.')); return; }
      const req = indexedDB.open(VIDEO_DB_NAME, VIDEO_DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(VIDEO_STORE_NAME)) req.result.createObjectStore(VIDEO_STORE_NAME);
        if (!req.result.objectStoreNames.contains(DOC_STORE_NAME)) req.result.createObjectStore(DOC_STORE_NAME);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return videoDbPromise;
  }
  function saveVideoFile(key, file) {
    return openVideoDb().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(VIDEO_STORE_NAME, 'readwrite');
      tx.objectStore(VIDEO_STORE_NAME).put({ blob: file, name: file.name, type: file.type, size: file.size, storedAt: new Date().toISOString() }, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    }));
  }
  function loadVideoFile(key) {
    return openVideoDb().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(VIDEO_STORE_NAME, 'readonly');
      const req = tx.objectStore(VIDEO_STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    }));
  }
  function deleteVideoFile(key) {
    return openVideoDb().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(VIDEO_STORE_NAME, 'readwrite');
      tx.objectStore(VIDEO_STORE_NAME).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    }));
  }
  function humanFileSize(bytes) {
    if (bytes === undefined || bytes === null || bytes === '') return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let n = Number(bytes) || 0;
    let i = 0;
    while (n >= 1024 && i < units.length - 1) { n /= 1024; i += 1; }
    return `${n.toFixed(i > 0 && n < 10 ? 1 : 0)} ${units[i]}`;
  }
  function handleVideoFileAttach(key, pathPrefix, file) {
    const WARN_BYTES = 500 * 1024 * 1024; // 500MB soft warning -- browsers vary in how much they'll store
    saveVideoFile(key, file).then(() => {
      setPath(`${pathPrefix}.videoFile`, { name: file.name, size: file.size, type: file.type, storedAt: new Date().toISOString() });
      setPath(`${pathPrefix}.videoEvidenceFileName`, file.name);
      saveState(); render();
      toastMsg(file.size > WARN_BYTES ? 'Large video attached -- use Open to confirm it plays correctly.' : 'Video file attached. Use Open or Download to confirm it saved correctly.');
    }).catch(() => {
      toastMsg('Could not save that file in this browser. Try a shorter recording, or use the external upload center and paste a share link instead.');
    });
  }
  function labVideoAttachBlock(pathPrefix, key) {
    const meta = getPath(`${pathPrefix}.videoFile`);
    const attached = meta && meta.name;
    const details = attached
      ? `<div class="callout"><strong>Attached video file</strong>${escapeHtml(meta.name)} (${humanFileSize(meta.size)})<br><span class="resource-meta">Saved in this browser on ${escapeHtml(meta.storedAt ? new Date(meta.storedAt).toLocaleString() : '')}</span>
          <p><button type="button" class="button primary small" data-action="open-video-file" data-key="${attr(key)}">Open / play video</button> <button type="button" class="button secondary small" data-action="download-video-file" data-key="${attr(key)}">Download video</button> <button type="button" class="button danger small" data-action="remove-video-file" data-key="${attr(key)}" data-path-prefix="${attr(pathPrefix)}">Remove attached file</button></p>
        </div>`
      : '<p class="resource-meta">No video file attached yet in this browser.</p>';
    return `<div class="field"><label>Attach video file from your computer<input type="file" accept="video/*" data-action="attach-video-file" data-key="${attr(key)}" data-path-prefix="${attr(pathPrefix)}"></label></div>${details}`;
  }

  // ---- Supporting document storage (IndexedDB) ----
  // Same database as the video store above (see VIDEO_DB_VERSION comment), but a document key can
  // hold *multiple* files (screenshots, exports, PDFs, etc.), since a single lab or capstone
  // submission often has more than one supporting document.
  function loadDocRecord(key) {
    return openVideoDb().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(DOC_STORE_NAME, 'readonly');
      const req = tx.objectStore(DOC_STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result || { files: [] });
      req.onerror = () => reject(req.error);
    }));
  }
  function saveDocRecord(key, record) {
    return openVideoDb().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(DOC_STORE_NAME, 'readwrite');
      tx.objectStore(DOC_STORE_NAME).put(record, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    }));
  }
  function addDocFiles(key, pathPrefix, fileList) {
    const incoming = Array.from(fileList).map(file => ({ name: file.name, size: file.size, type: file.type, blob: file, storedAt: new Date().toISOString() }));
    loadDocRecord(key).then(record => {
      const files = (record && record.files) || [];
      const merged = files.concat(incoming);
      return saveDocRecord(key, { files: merged }).then(() => merged);
    }).then(merged => {
      setPath(`${pathPrefix}.documentFiles`, merged.map(f => ({ name: f.name, size: f.size, type: f.type, storedAt: f.storedAt })));
      saveState(); render();
      toastMsg(incoming.length > 1 ? `${incoming.length} documents attached.` : 'Document attached.');
    }).catch(() => {
      toastMsg('Could not save that file in this browser. Try a smaller file, or use the external upload center instead.');
    });
  }
  function removeDocFile(key, pathPrefix, index) {
    loadDocRecord(key).then(record => {
      const files = (record && record.files) || [];
      files.splice(index, 1);
      return saveDocRecord(key, { files }).then(() => files);
    }).then(files => {
      setPath(`${pathPrefix}.documentFiles`, files.map(f => ({ name: f.name, size: f.size, type: f.type, storedAt: f.storedAt })));
      saveState(); render();
      toastMsg('Document removed.');
    }).catch(() => toastMsg('Could not remove that document.'));
  }
  function labDocumentsAttachBlock(pathPrefix, key) {
    const list = getPath(`${pathPrefix}.documentFiles`) || [];
    const rows = list.map((meta, i) => `<div class="callout"><strong>${escapeHtml(meta.name)}</strong> (${humanFileSize(meta.size)})<br><span class="resource-meta">Saved in this browser on ${escapeHtml(meta.storedAt ? new Date(meta.storedAt).toLocaleString() : '')}</span>
        <p><button type="button" class="button primary small" data-action="open-doc-file" data-key="${attr(key)}" data-index="${i}">Open document</button> <button type="button" class="button secondary small" data-action="download-doc-file" data-key="${attr(key)}" data-index="${i}">Download</button> <button type="button" class="button danger small" data-action="remove-doc-file" data-key="${attr(key)}" data-path-prefix="${attr(pathPrefix)}" data-index="${i}">Remove</button></p>
      </div>`).join('');
    const details = list.length ? rows : '<p class="resource-meta">No supporting documents attached yet in this browser.</p>';
    return `<div class="field"><label>Attach supporting documents from your computer (screenshots, exports, PDFs)<input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.png,.jpg,.jpeg,.gif" data-action="attach-doc-files" data-key="${attr(key)}" data-path-prefix="${attr(pathPrefix)}"></label></div>${details}`;
  }
  function guideProgress(week) {
    if (!week.guidedExample) return 1;
    const st = state.weeks[week.week] || {};
    return st.guideReviewed ? 1 : 0;
  }

  function glossaryTermsForWeek(weekNumber) {
    return (course.glossary || []).filter(g => (g.weeks || []).includes(Number(weekNumber)));
  }
  function glossaryProgress(week) {
    const terms = glossaryTermsForWeek(week.week);
    if (!terms.length) return 1;
    return terms.filter(g => state.glossary?.[g.id]?.reviewed).length / terms.length;
  }
  function glossaryOverallProgress() {
    const terms = course.glossary || [];
    if (!terms.length) return 1;
    return terms.filter(g => state.glossary?.[g.id]?.reviewed).length / terms.length;
  }

  // Match Term to Definition practice (the "#glossary-match" page) is scoped per week just like
  // the knowledge check quiz, but its answers live under `match.answers.<week>.<row>` /
  // `match.submitted.<week>` rather than under `weeks.<week>`, since the practice page lets a
  // learner jump between weeks with a single dropdown rather than being embedded per-week. This
  // mirrors computeQuizStatus() so it can be folded into weekStats() as an equal, required
  // component of each week's completion.
  function matchTermsForWeek(weekNumber) {
    return glossaryTermsForWeek(weekNumber).slice(0, 8);
  }
  function computeMatchStatus(weekNumber) {
    const terms = matchTermsForWeek(weekNumber);
    const total = terms.length;
    if (!total) return { total: 0, answered: 0, correct: 0, score: 1, submitted: true, passed: true, progress: 1 };
    let answered = 0, correct = 0;
    terms.forEach((t, i) => {
      const selected = getPath(`match.answers.${weekNumber}.${i}`);
      if (selected) answered += 1;
      if (selected === t.id) correct += 1;
    });
    const score = correct / total;
    const submitted = !!getPath(`match.submitted.${weekNumber}`);
    const passed = submitted && score >= PASS_MARK;
    const progress = passed ? 1 : Math.min(0.75, answered / total * 0.75);
    return { total, answered, correct, score, submitted, passed, progress };
  }
  function matchStatus(week) { return computeMatchStatus(week.week); }
  function shuffleArray(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  // Generates (and persists) a randomized question order + per-question option order for a quiz
  // namespace, so every fresh attempt (first view, or after Clear/retake) gets a new arrangement.
  // Scoring itself is order-independent -- it keys answers by stable question id and compares
  // option text, so shuffling display order never affects correctness.
  function getQuizOrder(namespace, questions) {
    const ids = questions.map(q => q.id);
    let order = getPath(`${namespace}.quizOrder`);
    const valid = order && Array.isArray(order.questionIds) &&
      order.questionIds.length === ids.length &&
      order.questionIds.every(id => ids.includes(id)) &&
      questions.every(q => Array.isArray(order.options && order.options[q.id]) && order.options[q.id].length === q.options.length);
    if (!valid) {
      const options = {};
      questions.forEach(q => { options[q.id] = shuffleArray(q.options.map((_, idx) => idx)); });
      order = { questionIds: shuffleArray(ids), options };
      setPath(`${namespace}.quizOrder`, order);
      saveState();
    }
    return order;
  }
  // Quiz options are authored as "A. Text", "B. Text", etc. When option order is shuffled between
  // learners/attempts, the visible A/B/C/D letters must stay fixed to their on-screen position
  // (position 1 is always "A", position 2 is always "B", ...) -- only the underlying content moves
  // between letters. optionContent() strips the authored letter so content can be compared and
  // re-labeled purely by display position, never by its original authored letter.
  const OPTION_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
  function optionContent(opt) {
    const m = /^[A-Za-z]\.\s*(.*)$/.exec(opt || '');
    return m ? m[1] : (opt || '');
  }
  function computeQuizStatus(namespace, questions) {
    const st = getPath(namespace) || {};
    const qstate = st.quiz || {};
    const total = questions.length;
    let answered = 0, correct = 0;
    questions.forEach((q) => {
      const selected = qstate[q.id]?.answer;
      if (selected) answered += 1;
      const correctAnswer = optionContent(q.options[q.correctOptionIndex] || q.correctAnswer);
      if (selected && selected === correctAnswer) correct += 1;
    });
    const score = total ? correct / total : 1;
    const submitted = !!st.quizSubmitted;
    const passed = submitted && score >= PASS_MARK;
    const progress = passed ? 1 : Math.min(0.75, total ? answered / total * 0.75 : 1);
    return { total, answered, correct, score, submitted, passed, progress };
  }
  function quizStatus(week) { return computeQuizStatus(`weeks.${week.week}`, week.questions); }
  function checkpointQuizStatus(cp) { return computeQuizStatus(`checkpoints.${cp.id}`, cp.questions); }
  function weekStats(week) {
    const st = state.weeks[week.week] || {};
    const rp = resourceProgress(week);
    const gp = guideProgress(week);
    const tp = glossaryProgress(week);
    const sp = successProgress(week);
    const vp = labVideoProgress(week);
    const qs = quizStatus(week);
    const ms = matchStatus(week);
    const mp = st.moduleComplete ? 1 : 0;
    const progress = (rp + gp + tp + sp + vp + qs.progress + ms.progress + mp) / 8;
    return { resources: rp, guide: gp, terms: tp, lab: sp, video: vp, quiz: qs.progress, quizStatus: qs, match: ms.progress, matchStatus: ms, module: mp, progress, complete: progress >= 1 };
  }
  function capstoneScore() {
    const rubric = course.capstone.rubric || [];
    const maxPoints = rubric.reduce((sum, r) => sum + Number(r.points || 0), 0) || 100;
    let earned = 0;
    rubric.forEach((r, i) => {
      const val = Number(state.capstone.steps?.[i]?.pointsEarned || 0);
      earned += Math.max(0, Math.min(Number(r.points || 0), val));
    });
    const passPoints = Number(course.capstone.passPoints || 85);
    const criticalFailure = !!state.capstone.criticalFailure;
    return { earned, maxPoints, pct: maxPoints ? earned / maxPoints : 0, passPoints, passed: earned >= passPoints && !criticalFailure, criticalFailure };
  }
  function capstoneProgress() {
    const rubric = course.capstone.rubric || course.capstone.steps.map((step, i) => ({ step: i+1, task: step, points: 1 }));
    const total = rubric.length + 7;
    const doneSteps = rubric.filter((_, i) => state.capstone.steps?.[i]?.done).length;
    const submitLabels = ['sandbox','ownerStatement','videoUploaded','evidenceNamed','submitted','dashboardUpdated','scoreReviewed'];
    const doneSubmit = submitLabels.filter(k => state.capstone.submit?.[k] || state.capstone[k]).length;
    return (doneSteps + doneSubmit) / total;
  }
  function checkpointForAfterWeek(weekNumber) {
    return (course.checkpoints || []).find(cp => Number(cp.afterWeek) === Number(weekNumber));
  }
  function checkpointProgress(cp) {
    const qs = checkpointQuizStatus(cp);
    const signOffItems = cp.managerSignOff?.signOffItems || [];
    const st = state.checkpoints[cp.id] || {};
    const signedOff = signOffItems.length ? signOffItems.filter((_, i) => st.signoff?.[i]).length / signOffItems.length : 1;
    return { quiz: qs.progress, quizStatus: qs, signOff: signedOff, progress: (qs.progress + signedOff) / 2 };
  }
  function checkpointsAverage() {
    const list = course.checkpoints || [];
    if (!list.length) return 1;
    return list.reduce((acc, cp) => acc + checkpointProgress(cp).progress, 0) / list.length;
  }
  function overallProgress() {
    const weekAverage = course.weeks.reduce((acc, w) => acc + weekStats(w).progress, 0) / course.weeks.length;
    return (weekAverage * 0.8) + (checkpointsAverage() * 0.1) + (capstoneProgress() * 0.1);
  }
  function updateOverallProgress() {
    const label = document.getElementById('overall-label');
    const bar = document.getElementById('overall-bar');
    if (!label || !bar) return;
    const p = overallProgress();
    label.textContent = pct(p);
    bar.style.width = pct(p);
  }

  function render() {
    const route = currentRoute();
    // Only jump to the top of the page when the learner actually navigates to a different
    // tab/section (a route change). Re-renders triggered by in-page actions on the *same*
    // route (answering a question, checking a box, scoring a quiz, etc.) must not reset scroll.
    const routeChanged = route !== lastRenderedRoute;
    lastRenderedRoute = route;
    if (route !== '#overview') state.resumeRoute = route;
    state.lastRoute = route;
    saveState(true);
    initSidebar();
    if (route === '#overview') renderOverview();
    else if (route === '#before-begin') renderBeforeBegin();
    else if (route === '#dashboard') renderDashboard();
    else if (route === '#role-paths') renderRolePaths();
    else if (route === '#videos') renderVideos();
    else if (route === '#glossary') renderGlossary();
    else if (route === '#glossary-match') renderGlossaryMatch();
    else if (route === '#job-aids') renderJobAids();
    else if (route === '#capstone') renderCapstone();
    else if (route === '#resources') renderResourceLibrary();
    else if (route.startsWith('#checkpoint-')) {
      const id = route.replace('#', '');
      const cp = (course.checkpoints || []).find(c => c.id === id) || (course.checkpoints || [])[0];
      if (cp) renderCheckpoint(cp); else window.location.hash = '#overview';
    }
    else if (route.startsWith('#week-')) {
      const num = Number(route.replace('#week-', ''));
      const week = course.weeks.find(w => w.week === num) || course.weeks[0];
      renderWeek(week);
    } else {
      window.location.hash = '#overview';
    }
    if (routeChanged) window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    app.focus({ preventScroll: true });
  }

  function renderOverview() {
    app.innerHTML = `
      <section class="hero">
        <div class="kicker">${escapeHtml(course.meta.edition)} · Version ${escapeHtml(course.meta.version)}</div>
        <h1>${escapeHtml(course.meta.title)}</h1>
        <p>${escapeHtml(course.meta.description)}</p>
        <div class="stat-row">
          <span class="stat-pill done">19 weeks</span>
          <span class="stat-pill">57-76 learning hours</span>
          <span class="stat-pill">5 certification tracks</span>
          <span class="stat-pill done">Process-ordered lessons</span>
          <span class="stat-pill done">Guided walkthrough examples</span>
          <span class="stat-pill done">Defined terms glossary</span>
          <span class="stat-pill done">Scored knowledge checks</span>
          <span class="stat-pill done">Required lab videos</span>
        </div>
      </section>
      <section class="panel">
        <h2>Learner profile</h2>
        <div class="form-grid">
          ${field('Learner name', 'profile.learnerName')}
          ${field('Start date', 'profile.startDate', 'date')}
          ${field('Target completion date', 'profile.targetDate', 'date')}
          ${field('Cohort / team', 'profile.cohort')}
        </div>
      </section>
      <section class="panel">
        <h2>Setup checklist</h2>
        ${course.setupChecklist.map((item, i) => checkline(`setup.${i}`, item)).join('')}
      </section>
      <section class="callout warning"><strong>Safety reminder</strong>${escapeHtml(course.meta.safety)}</section>
      <section class="panel grid two">
        <div>
          <h2>How this interactive package works</h2>
          <p>Use the navigation to move through the program. Open materials with the green buttons, review the defined terms for each lesson, complete the lab checklist, submit required lab videos, score knowledge checks, review explanations, and mark modules complete.</p>
          <p>Your work is saved automatically in this browser. Use Export JSON or Export CSV to keep a backup or submit progress.</p>
        </div>
        <div>
          <h2>Quick actions</h2>
          <p><a class="button primary" href="#dashboard">Open Progress Dashboard</a></p>
          <p><a class="button secondary" href="${attr(state.resumeRoute || '#before-begin')}">Resume where I left off</a></p>
          <p><a class="button secondary" href="#before-begin">Start Before You Begin</a></p>
          <p><a class="button secondary" href="#role-paths">Choose a Role Path</a></p>
          <p><a class="button secondary" href="#week-01">Start Week 1</a></p>
          <p><a class="button secondary" href="#videos">Review Video Alignment Map</a></p>
          <p><a class="button secondary" href="#glossary">Open Defined Terms & Glossary</a></p>
          <p><a class="button secondary" href="#glossary-match">Practice Match Terms</a></p>
          <p><a class="button secondary" href="#job-aids">Download Job Aids</a></p>
          <p><a class="button secondary" href="${attr(course.submission?.labVideoUploadUrl || 'upload-lab-video.html')}" target="_blank" rel="noopener">Open Video Upload Center</a></p>
        </div>
      </section>
      <section class="panel"><h2>Accessibility and usability</h2><p>${escapeHtml(course.meta.accessibilityNote || '')}</p><p><button class="button secondary" data-action="toggle-contrast">Toggle high contrast mode</button></p></section>
      <section class="panel">
        <h2>Lab video submission requirement</h2>
        <p>${escapeHtml(course.submission?.instructions || '')}</p>
      </section>`;
  }

  function renderBeforeBegin() {
    const o = course.onboarding || {};
    const sections = (o.sections || []).map(sec => `<details class="process-detail" open><summary>${escapeHtml(sec.heading)}</summary><p>${escapeHtml(sec.body)}</p></details>`).join('');
    const checks = (o.checks || []).map((c, i) => checkline(`onboarding.checks.${i}`, c)).join('');
    app.innerHTML = `<section class="module-header"><div class="kicker">Beginner orientation</div><h1>${escapeHtml(o.title || 'Before You Begin')}</h1><p>${escapeHtml(o.intro || '')}</p><div class="module-progress"><div class="progress-rail"><div class="progress-fill" style="width:${pct(onboardingProgress())}"></div></div><strong>${pct(onboardingProgress())}</strong></div></section>
      <section class="panel"><h2>What you should understand first</h2><ul>${(o.outcomes || []).map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ul></section>
      <section class="panel"><h2>Orientation guide</h2>${sections}</section>
      <section class="panel"><h2>Start-up check</h2>${checks}<p><a class="button primary" href="#week-01">Continue to Week 1</a></p></section>`;
  }

  function renderRolePaths() {
    const selected = selectedRolePath();
    const options = (course.rolePaths || []).map(p => `<option value="${attr(p.id)}" ${selected && selected.id === p.id ? 'selected' : ''}>${escapeHtml(p.title)}</option>`).join('');
    const weekCards = course.weeks.map(w => {
      const required = selected && (selected.weeks || []).includes(w.week);
      return `<article class="resource-card role-week ${required ? 'required' : 'dimmed'}"><div><span class="badge ${required ? 'complete' : ''}">${required ? 'Required' : 'Optional'}</span></div><div><div class="resource-title">Week ${w.week}: ${escapeHtml(w.title)}</div><div class="resource-meta">${escapeHtml(w.phase)} · ${escapeHtml(w.processStage || '')}</div></div><div><a class="button ${required ? 'primary' : 'secondary'} small" href="#week-${String(w.week).padStart(2,'0')}">Open</a></div></article>`;
    }).join('');
    app.innerHTML = `<section class="module-header"><div class="kicker">Role path filters</div><h1>Choose your learner path</h1><p>Pick a role path to highlight the modules most relevant to that learner. Full certification still requires all 19 weeks and the capstone.</p></section>
      <section class="panel"><div class="field"><label>Current role path<select id="role-path-select" data-path="rolePath.selected">${options}</select></label></div><p><strong>${escapeHtml(selected?.title || '')}</strong>: ${escapeHtml(selected?.focus || '')}</p></section>
      <section class="panel"><h2>Filtered module list</h2>${weekCards}</section>`;
  }

  function renderCheckpointCallout(week) {
    const cp = checkpointForAfterWeek(week.week);
    if (!cp) return '';
    return `<section class="callout warning"><strong>Phase checkpoint due after this week</strong> You are finishing ${escapeHtml(cp.phase)}. Before moving on, complete <a href="#${cp.id}">${escapeHtml(cp.title)}</a>: a cumulative retention check, a real case review, and a manager sign-off.</section>`;
  }
  function renderHoaProperty(week) {
    const hp = week.hoaProperty;
    if (!hp) return '';
    const details = Object.keys(hp.details || {}).map(k => `<div class="meta-card"><strong>${escapeHtml(k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()))}</strong>${escapeHtml(hp.details[k])}</div>`).join('');
    const assoc = hp.associationDetails || {};
    const assocDetails = Object.keys(assoc).map(k => `<div class="meta-card"><strong>${escapeHtml(k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()))}</strong>${escapeHtml(assoc[k])}</div>`).join('');
    return `<section class="panel"><h2>${escapeHtml(hp.title || 'HOA property for this week’s lab')}</h2>
      <p><strong>${escapeHtml(hp.propertyName)}</strong> — ${escapeHtml(hp.address)}</p>
      <p class="resource-meta"><strong>Portfolio:</strong> ${escapeHtml(hp.portfolio)}</p>
      <h3>Property details</h3>
      <div class="meta-grid">${details}</div>
      <h3>HOA / association</h3>
      <p><strong>HOA name:</strong> ${escapeHtml(hp.hoaName)} &nbsp;·&nbsp; <strong>Association record:</strong> ${escapeHtml(hp.associationName)}</p>
      <div class="meta-grid">${assocDetails}</div>
      <p class="resource-meta">${escapeHtml(hp.note || '')}</p>
    </section>`;
  }
  // Multifamily property counterpart to renderHoaProperty() above -- a fixed, reused example
  // (789 Oakview Commons) so the same units/tags/groups/manager names show up consistently
  // wherever Week 3's lab references them, instead of the learner inventing new ones each time.
  function renderMultifamilyProperty(week) {
    const mp = week.multifamilyProperty;
    if (!mp) return '';
    const details = Object.keys(mp.details || {}).map(k => `<div class="meta-card"><strong>${escapeHtml(k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()))}</strong>${escapeHtml(mp.details[k])}</div>`).join('');
    const unitRows = (mp.units || []).map(u => `<tr><td>${escapeHtml(u.unit)}</td><td>${escapeHtml(u.bedsBaths)}</td><td>${escapeHtml(u.rent)}</td><td>${escapeHtml((u.tags || []).join(', '))}</td><td>${escapeHtml(u.manager)}</td></tr>`).join('');
    return `<section class="panel"><h2>${escapeHtml(mp.title || "Multifamily property for this week's lab")}</h2>
      <p><strong>${escapeHtml(mp.propertyName)}</strong> — ${escapeHtml(mp.address)}</p>
      <p class="resource-meta"><strong>Portfolio:</strong> ${escapeHtml(mp.portfolio)}</p>
      <h3>Property details</h3>
      <div class="meta-grid">${details}</div>
      <h3>Units, tags &amp; assigned manager</h3>
      <div class="table-wrap"><table><thead><tr><th>Unit</th><th>Beds/Baths</th><th>Rent</th><th>Tags</th><th>Assigned manager</th></tr></thead><tbody>${unitRows}</tbody></table></div>
      <p class="resource-meta"><strong>Property group:</strong> ${escapeHtml(mp.propertyGroup || '')}</p>
      <p class="resource-meta">${escapeHtml(mp.note || '')}</p>
    </section>`;
  }
  function renderPhaseMapSnippet(week) {
    const m = phaseMapForWeek(week.week);
    if (!m) return '';
    return `<section class="panel process-mini"><h2>Where this module fits</h2><p><strong>${escapeHtml(m.phase)}</strong>: ${escapeHtml(m.question || '')}</p><div class="flow-row">${(m.flow || []).map((f, i) => `<span class="flow-step">${i+1}. ${escapeHtml(f)}</span>`).join('')}</div></section>`;
  }

  // Which of the 12 detailed fixed-case-file facts are actually relevant "new sandbox information"
  // for a given week, rather than repeating the same full list on every single week. Weeks 1-2 are
  // the one-time setup weeks (see setupBlock below) so they show everything; every later week only
  // shows the specific fact(s) its own lab step needs -- e.g. Week 6 (lease creation) needs the
  // rent/deposit/lease-term numbers, Week 11 (maintenance) needs the vendor/maintenance-issue facts.
  // A week not listed for a given key simply doesn't show that card -- the learner is expected to
  // reference back to the Week 1-2 setup (or the always-visible Owner/Property/Applicant/Vendor
  // summary cards) instead of having it repeated everywhere.
  function factRelevantWeeks(key) {
    const scope = (course.practiceCompany || {}).fixedFactsWeeks || {};
    return scope[key] || [1, 2];
  }
  function renderPracticeCompany(week) {
    const pc = course.practiceCompany || {};
    const ps = week.practiceCompanyStep || {};
    const facts = pc.fixedFacts || {};
    const relevantKeys = Object.keys(facts).filter(k => factRelevantWeeks(k).includes(week.week));
    const factCards = relevantKeys.map(k => `<div class="meta-card"><strong>${escapeHtml(k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()))}</strong>${escapeHtml(facts[k])}</div>`).join('');
    const noNewFactsNote = (week.week > 2 && !relevantKeys.length)
      ? `<p class="resource-meta"><strong>No new case file facts for this week.</strong> Reuse the Owner/Property/Applicant/Vendor records above and the details you already entered in Week 1-2.</p>`
      : '';
    const setupBlock = week.week === 1 || week.week === 2
      ? `<div class="callout warning"><strong>One-time case file setup (do this once, not every week)</strong><ol>${(pc.setupInstructions || []).map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ol></div>`
      : `<p class="resource-meta"><strong>Reminder:</strong> reuse the records you already created in Week 1-2. Do not recreate the portfolio, property, or contacts — find them by name or address, the same way you would in real Rentvine.</p>`;
    // "This week" is pulled out of the meta-grid and rendered as its own full-width, standout
    // banner above it -- its instruction text runs much longer than the short one-line Owner/
    // Property/Applicant/Vendor cards, and sharing a grid row with them was stretching those
    // short cards to match its height. Reuses the same green .callout treatment as the
    // "Real-world connection" / "Tip" callouts elsewhere on the week page.
    const thisWeekBanner = `<div class="callout case-file-focus"><span class="kicker">This week's lab focus</span>${escapeHtml(ps.instruction || '')}</div>`;
    return `<section class="panel"><h2>Practice company case file</h2><p><strong>${escapeHtml(pc.company || '')}</strong>: ${escapeHtml(pc.scenario || '')}</p><p class="resource-meta">${escapeHtml(pc.fixedFactsNote || '')}</p>${thisWeekBanner}<div class="meta-grid"><div class="meta-card"><strong>Owner</strong>${escapeHtml(pc.owner || '')}</div><div class="meta-card"><strong>Property</strong>${escapeHtml(pc.property || '')}</div><div class="meta-card"><strong>Applicant / tenant</strong>${escapeHtml(pc.applicantTenant || '')}</div><div class="meta-card"><strong>Vendor</strong>${escapeHtml(pc.vendor || '')}</div>${factCards}</div>${noNewFactsNote}${setupBlock}</section>`;
  }

  function renderScenarioPractice(week) {
    const sp = week.scenarioPractice;
    if (!sp) return '';
    return `<section class="panel scenario-panel"><h2>${escapeHtml(sp.title || 'Scenario practice')}</h2><p><strong>Scenario:</strong> ${escapeHtml(sp.scenario || '')}</p><p><strong>Your task:</strong> ${escapeHtml(sp.prompt || '')}</p><details><summary>Key lesson after you try</summary><p>${escapeHtml(sp.keyLesson || '')}</p><p>${linkButton(sp.remediationUrl, sp.remediationTitle || 'Review lesson guide')}</p></details></section>`;
  }

  function renderJobAids() {
    const cards = (course.jobAids || []).map(j => `<article class="resource-card"><div><span class="badge complete">PDF/Print</span></div><div><div class="resource-title">${escapeHtml(j.title)}</div><div class="resource-summary">${escapeHtml(j.summary || '')}</div></div><div><a class="button primary small" href="${attr(j.url)}" target="_blank" rel="noopener">Open job aid</a></div></article>`).join('');
    app.innerHTML = `<section class="module-header"><div class="kicker">Quick reference</div><h1>Downloadable Job Aids</h1><p>Open a checklist, print it, or save it as PDF from your browser. These are designed for lab work, capstone practice, and post-training reference.</p></section><section class="panel">${cards}</section>`;
  }

  function renderGlossaryMatch() {
    const selectedWeek = Number(getPath('match.week') || 1);
    const terms = matchTermsForWeek(selectedWeek);
    const options = terms.map(t => `<option value="${attr(t.id)}">${escapeHtml(t.term)}</option>`).join('');
    const rows = terms.map((t, i) => {
      const selected = getPath(`match.answers.${selectedWeek}.${i}`) || '';
      const submitted = getPath(`match.submitted.${selectedWeek}`);
      const ok = submitted && selected === t.id;
      const wrong = submitted && selected && selected !== t.id;
      return `<tr class="${ok ? 'match-correct' : wrong ? 'match-wrong' : ''}"><td>${escapeHtml(t.definition)}</td><td><select data-path="match.answers.${selectedWeek}.${i}"><option value="">Choose term...</option>${options.replace(`value="${attr(selected)}"`, `value="${attr(selected)}" selected`)}</select></td><td>${submitted ? (ok ? 'Correct' : `Review: ${escapeHtml(t.term)}`) : '—'}</td></tr>`;
    }).join('');
    const status = computeMatchStatus(selectedWeek);
    const statusPanel = status.total
      ? `<div class="score-panel ${status.passed ? 'pass' : 'open'}"><strong>${pct(status.progress)} of requirement met.</strong> ${status.submitted ? `${status.correct}/${status.total} correct (${pct(status.score)}).` : `${status.answered}/${status.total} matched so far -- click Check matches when ready.`} ${status.passed ? 'Requirement satisfied for this week.' : ''}</div>`
      : `<div class="score-panel pass"><strong>No glossary terms are scoped to Week ${selectedWeek}.</strong> Nothing required here -- pick another week above.</div>`;
    app.innerHTML = `<section class="module-header"><div class="kicker">Glossary practice</div><h1>Match Term to Definition</h1><p>Select a week, then match each beginner definition to the correct Rentvine/property-management term.</p><p class="resource-meta">Completion requirement: match at least ${Math.round(PASS_MARK * 100)}% of a week's terms correctly and click Check matches. This now counts toward that week's overall progress and dashboard completion, the same as the knowledge check.</p></section>
      <section class="panel glossary-tools"><div class="field"><label>Week<select id="match-week" data-path="match.week">${course.weeks.map(w => `<option value="${w.week}" ${w.week === selectedWeek ? 'selected' : ''}>Week ${w.week}: ${escapeHtml(w.title)}</option>`).join('')}</select></label></div><div class="glossary-actions"><button class="button primary" data-action="score-match" data-week="${selectedWeek}">Check matches</button><button class="button secondary" data-action="clear-match" data-week="${selectedWeek}">Clear this practice</button></div></section>
      <section class="panel"><h2>Practice set</h2>${statusPanel}<div class="table-wrap"><table><thead><tr><th>Definition</th><th>Choose the matching term</th><th>Feedback</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  }

  function field(label, path, type='text', placeholder='') {
    return `<div class="field"><label>${escapeHtml(label)}<input type="${type}" data-path="${attr(path)}" value="${value(path)}" placeholder="${attr(placeholder)}"></label></div>`;
  }
  function numberField(label, path, min, max) {
    return `<div class="field"><label>${escapeHtml(label)}<input type="number" data-path="${attr(path)}" value="${value(path)}" min="${attr(min)}" max="${attr(max)}"></label></div>`;
  }
  function textArea(label, path, placeholder='') {
    return `<div class="field"><label>${escapeHtml(label)}<textarea data-path="${attr(path)}" placeholder="${attr(placeholder)}">${escapeHtml(getPath(path) || '')}</textarea></label></div>`;
  }
  function checkline(path, label) {
    return `<label class="checkline"><input type="checkbox" data-path="${attr(path)}" ${checked(path)}><span>${escapeHtml(label)}</span></label>`;
  }

  function renderDashboard() {
    const rows = course.weeks.map(w => {
      const s = weekStats(w);
      const qs = s.quizStatus;
      const quizText = qs.submitted ? `${qs.correct}/${qs.total} · ${pct(qs.score)} ${qs.passed ? 'pass' : 'review'}` : `${qs.answered}/${qs.total} answered`;
      const ms = s.matchStatus;
      const matchText = !ms.total ? 'n/a' : (ms.submitted ? `${ms.correct}/${ms.total} · ${pct(ms.score)} ${ms.passed ? 'pass' : 'review'}` : `${ms.answered}/${ms.total} answered`);
      return `<tr>
        <td>Week ${w.week}</td><td><a href="#week-${String(w.week).padStart(2,'0')}">${escapeHtml(w.title)}</a></td><td>${escapeHtml(w.phase)}</td>
        <td>${checkedIcon(s.resources >= 1)} ${pct(s.resources)}</td>
        <td>${checkedIcon(s.guide >= 1)} ${s.guide ? 'reviewed' : 'required'}</td>
        <td>${checkedIcon(s.terms >= 1)} ${pct(s.terms)}</td>
        <td>${checkedIcon(s.lab >= 1)} ${pct(s.lab)}</td>
        <td>${checkedIcon(s.video >= 1)} ${s.video ? 'submitted' : 'required'}${weekVideoRequired(w) ? '' : ' (docs only)'}</td>
        <td>${checkedIcon(qs.passed)} ${escapeHtml(quizText)}</td>
        <td>${checkedIcon(!ms.total || ms.passed)} ${escapeHtml(matchText)}</td>
        <td>${checkedIcon(s.module >= 1)}</td><td><strong>${pct(s.progress)}</strong></td>
      </tr>`;
    }).join('');
    app.innerHTML = `
      <section class="module-header"><div class="kicker">Program tracking</div><h1>Progress Dashboard</h1><p>Track all 19 process-ordered weeks, learning materials, guided examples, defined terms, labs, required lab-video uploads, scored knowledge checks, match-term practice, and module completion.</p></section>
      <section class="panel"><div class="table-wrap"><table><thead><tr><th>Week</th><th>Module</th><th>Phase</th><th>Materials</th><th>Guide</th><th>Defined terms</th><th>Lab</th><th>Lab video</th><th>Knowledge check</th><th>Match practice</th><th>Complete</th><th>Progress</th></tr></thead><tbody>${rows}</tbody></table></div></section>
      <section class="panel"><h2>Phase Checkpoints</h2><div class="table-wrap"><table><thead><tr><th>Checkpoint</th><th>Phase</th><th>Retention check</th><th>Manager sign-off</th><th>Progress</th></tr></thead><tbody>${(course.checkpoints || []).map(cp => {
        const p = checkpointProgress(cp);
        return `<tr><td><a href="#${cp.id}">${escapeHtml(cp.title)}</a></td><td>${escapeHtml(cp.phase)}</td><td>${checkedIcon(p.quizStatus.passed)} ${p.quizStatus.submitted ? `${p.quizStatus.correct}/${p.quizStatus.total}` : `${p.quizStatus.answered}/${p.quizStatus.total} answered`}</td><td>${checkedIcon(p.signOff >= 1)} ${pct(p.signOff)}</td><td><strong>${pct(p.progress)}</strong></td></tr>`;
      }).join('')}</tbody></table></div></section>
      <section class="panel grid two">
        <div><h2>Backup your work</h2><p>Export your progress at the end of each module. JSON preserves answers, scores, upload confirmations, and notes; CSV provides a simple module status summary.</p><p><button id="export-json-inline" class="button primary">Export JSON</button> <button id="export-csv-inline" class="button secondary">Export CSV</button></p></div>
        <div><h2>Completion rule</h2><p>For each week, complete the materials, guided walkthrough example, defined terms review, lab checklist, required lab video submission, scored knowledge check, and match-term practice (${Math.round(PASS_MARK * 100)}%+ correct). Weekly pass mark: ${Math.round(PASS_MARK * 100)}%.</p></div>
      </section>`;
  }

  function renderVideos() {
    const rows = course.videos.map(v => `<tr><td><strong>${escapeHtml(v.code)}</strong></td><td><a href="${attr(v.url)}" target="_blank" rel="noopener">${escapeHtml(v.title)}</a><br><span class="resource-meta">${escapeHtml(v.summary)}</span></td><td>Primary: ${escapeHtml(v.primaryWeeks.join(', ') || '—')}<br>Supporting: ${escapeHtml(v.supportingWeeks.join(', ') || '—')}</td><td>${escapeHtml(v.track)}</td></tr>`).join('');
    app.innerHTML = `<section class="module-header"><div class="kicker">Updated resources</div><h1>Video Alignment Map</h1><p>These videos replace the old video archive and are aligned to the weekly subject matter.</p></section>
      <section class="panel"><div class="table-wrap"><table><thead><tr><th>Code</th><th>Video and summary</th><th>Module use</th><th>Track</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  }



  // The standalone Process & Certification Map page (formerly two pages: "Process Maps" and
  // "Program Map & Tracks") has been removed entirely per request -- no nav item, no route. The
  // per-week "Where this module fits" snippet (renderPhaseMapSnippet, below) is a separate, smaller
  // feature that reuses the same course.phaseMaps data and is intentionally left in place. The
  // underlying course.phaseMaps / course.processMap / course.tracks data is also left in course-data
  // untouched (harmless if unused, and phaseMaps still feeds that per-week snippet) -- only the
  // rendering/routing/nav for the removed page itself was taken out.

  // Most weeks require both a lab walkthrough video and (optionally) supporting documents. A week
  // with `videoRequired: false` (currently just Week 1) skips the video box entirely and instead
  // requires at least one supporting document -- see labSubmissionProgress() for the matching logic.
  function renderLabSubmissionPanel(week, uploadUrl) {
    const documentsBlock = labDocumentsAttachBlock(`weeks.${week.week}`, `week-${week.week}-docs`);
    if (!weekVideoRequired(week)) {
      return `<section class="panel"><h2>Required lab submission</h2><p>${escapeHtml(week.labVideoRequirement || 'Attach the required supporting document(s) for this week below.')}</p><p>No video walkthrough is required for this week -- attach your supporting document(s) instead.</p>${documentsBlock}${checkline(`weeks.${week.week}.videoUploaded`, 'I attached the required supporting document(s) above.')}</section>`;
    }
    return `<section class="panel"><h2>Required lab video submission</h2><p>${escapeHtml(week.labVideoRequirement || course.submission?.instructions || '')}</p><p>Attach your recording directly below so it can be reopened or downloaded right from this program. If your recording is too large to attach here, use the external upload center instead.</p><p>${linkButton(uploadUrl, 'Open external upload center', `data-action="open-upload" data-week="${week.week}"`)}</p>${labVideoAttachBlock(`weeks.${week.week}`, `week-${week.week}`)}<h3>Supporting documents</h3>${documentsBlock}${checkline(`weeks.${week.week}.videoUploaded`, 'I submitted the required lab walkthrough video and any supporting documents above.')}</section>`;
  }

  // Detailed, real-product how-to content adapted from the Rentvine Client Training program.
  // A week's `productWalkthrough` (if present) is an array of blocks: {title, intro, steps:[{title,
  // body, tip}], sourceNote}. `body` and `tip` intentionally contain authored HTML (lists, bold
  // emphasis) and are inserted as-is rather than escaped, the same way this content rendered in its
  // original source file.
  // "Watch It In Action" real-screenshot demo carousel, attached to a Product Walkthrough
  // block as `block.demo` (array of {src, caption, href}). Client-side state (current slide,
  // autoplay timer) lives in PW_DEMO_STATE, keyed by a stable id derived from week + block index,
  // and is intentionally NOT persisted to localStorage -- it's just a viewing aid, not progress.
  const PW_DEMO_STATE = {};
  function pwDemoId(weekNum, blockIndex) { return `pw-demo-w${weekNum}-${blockIndex}`; }

  function renderPwDemo(demoId, shots) {
    if (!shots || !shots.length) return '';
    const st = PW_DEMO_STATE[demoId] || (PW_DEMO_STATE[demoId] = { index: 0, timer: null });
    st.shots = shots;
    const idx = ((st.index % shots.length) + shots.length) % shots.length;
    const shotItem = shots[idx];
    const dots = shots.map((_, i) => `<span class="pw-demo-dot ${i === idx ? 'on' : ''}" data-action="pw-demo-jump" data-demo-id="${attr(demoId)}" data-index="${i}"></span>`).join('');
    return `<div class="pw-demo" data-demo-id="${attr(demoId)}">
      <div class="pw-demo-stage"><img src="${attr(shotItem.src)}" alt="${attr(shotItem.caption)}" loading="lazy"></div>
      <div class="pw-demo-caption">${idx + 1}/${shots.length} — ${escapeHtml(shotItem.caption)}</div>
      <div class="pw-demo-controls">
        <button type="button" class="button secondary small" data-action="pw-demo-prev" data-demo-id="${attr(demoId)}">&lsaquo; Prev</button>
        <button type="button" class="button primary small" data-action="pw-demo-play" data-demo-id="${attr(demoId)}">${st.timer ? '&#10074;&#10074; Pause' : '&#9654; Play walkthrough'}</button>
        <button type="button" class="button secondary small" data-action="pw-demo-next" data-demo-id="${attr(demoId)}">Next &rsaquo;</button>
      </div>
      <div class="pw-demo-dots">${dots}</div>
      <div class="resource-meta">Real Rentvine screenshot — <a href="${attr(shotItem.href)}" target="_blank" rel="noopener">view source article</a></div>
    </div>`;
  }

  function renderProductWalkthrough(week) {
    const blocks = week.productWalkthrough || [];
    if (!blocks.length) return '';
    return blocks.map((block, blockIndex) => {
      const stepsHtml = block.steps.map((s, i) => `<div class="pw-step"><h3>${i + 1}. ${s.title}</h3><div>${s.body}</div>${s.tip ? `<div class="callout"><strong>Tip</strong>${s.tip}</div>` : ''}</div>`).join('');
      const demoHtml = block.demo && block.demo.length ? `<div class="section-label">Watch It In Action</div>${renderPwDemo(pwDemoId(week.week, blockIndex), block.demo)}` : '';
      return `<section class="panel"><h2>${escapeHtml(block.title)}</h2>${block.intro ? `<p>${escapeHtml(block.intro)}</p>` : ''}${demoHtml}${stepsHtml}${block.sourceNote ? `<p class="resource-meta">${escapeHtml(block.sourceNote)}</p>` : ''}</section>`;
    }).join('');
  }

  function renderWeek(week) {
    const s = weekStats(week);
    const qs = s.quizStatus;
    const uploadUrl = week.videoUploadUrl || course.submission?.labVideoUploadUrl || 'upload-lab-video.html';
    app.innerHTML = `
      <section class="module-header">
        <div class="kicker">Week ${week.week} · ${escapeHtml(week.phase)}</div>
        <h1>${escapeHtml(week.title)}</h1>
        <p>${escapeHtml(week.buildForwardOutcome)}</p>
        <div class="module-progress"><div class="progress-rail"><div class="progress-fill" style="width:${pct(s.progress)}"></div></div><strong>${pct(s.progress)}</strong></div>
        <div class="stat-row">
          <span class="stat-pill ${s.resources >= 1 ? 'done' : ''}">Materials ${pct(s.resources)}</span>
          <span class="stat-pill ${s.guide >= 1 ? 'done' : ''}">Guide ${s.guide ? 'reviewed' : 'required'}</span>
          <span class="stat-pill ${s.terms >= 1 ? 'done' : ''}">Terms ${pct(s.terms)}</span>
          <span class="stat-pill ${s.lab >= 1 ? 'done' : ''}">Lab ${pct(s.lab)}</span>
          <span class="stat-pill ${s.video >= 1 ? 'done' : ''}">${weekVideoRequired(week) ? 'Lab video' : 'Lab documents'} ${s.video ? 'submitted' : 'required'}</span>
          <span class="stat-pill ${qs.passed ? 'done' : ''}">Quiz ${qs.submitted ? `${qs.correct}/${qs.total} · ${pct(qs.score)}` : `${qs.answered}/${qs.total} answered`}</span>
          <span class="stat-pill ${s.matchStatus.passed ? 'done' : ''}">Match practice ${s.matchStatus.total ? (s.matchStatus.submitted ? `${s.matchStatus.correct}/${s.matchStatus.total} · ${pct(s.matchStatus.score)}` : `${s.matchStatus.answered}/${s.matchStatus.total} answered`) : 'n/a'}</span>
          <span class="stat-pill ${s.module >= 1 ? 'done' : ''}">Module ${s.module ? 'done' : 'open'}</span>
        </div>
      </section>
      <section class="panel meta-grid">
        ${metaCard('Process step', week.processStage)}${metaCard('Checkpoint', week.checkpoint)}${metaCard('Estimated time', week.estimatedTime)}${metaCard('Prerequisite', week.prerequisite)}${metaCard('Topics', week.topics)}
      </section>
      ${renderCheckpointCallout(week)}
      ${renderPhaseMapSnippet(week)}
      ${renderPracticeCompany(week)}
      ${renderHoaProperty(week)}
      ${renderMultifamilyProperty(week)}
      <section class="panel"><h2>Learning outcomes</h2><ul>${week.objectives.map(o => `<li>${escapeHtml(o)}</li>`).join('')}</ul></section>
      ${renderGuidedExample(week)}
      ${renderWeekGlossary(week)}
      ${renderWeekMatchPractice(week)}
      <section class="panel"><h2>Learning materials</h2><p>Click Open to launch the material. Opening a resource also marks it reviewed.</p><button class="button secondary small" data-action="mark-materials" data-week="${week.week}">Mark all materials reviewed</button>${week.resources.map((r, i) => resourceCard(week.week, r, i)).join('')}</section>
      ${renderProductWalkthrough(week)}
      <section class="callout"><strong>Real-world connection</strong>${escapeHtml(week.realWorldConnection)}</section>
      <section class="callout warning"><strong>Watch for</strong>${escapeHtml(week.watchFor)}</section>
      ${renderScenarioPractice(week)}
      ${renderRealCaseNote(week)}
      <section class="panel"><h2>Practice lab</h2><ol>${week.labSteps.map(x => `<li>${escapeHtml(x)}</li>`).join('')}</ol><h3>Lab success checklist</h3>${week.successCriteria.map((c, i) => checkline(`weeks.${week.week}.success.${i}`, c)).join('')}</section>
      ${renderLabSubmissionPanel(week, uploadUrl)}
      <section class="panel"><h2>Knowledge check</h2><p>Select one answer for each question, then score the knowledge check. Correct answers and explanations appear after you submit. Pass mark: ${Math.round(PASS_MARK * 100)}%.</p>${quizSummary(week)}${renderQuizQuestions(`weeks.${week.week}`, week.questions, qs.submitted || TRAINER_MODE)}<p><button class="button primary" data-action="score-quiz" data-week="${week.week}">Score knowledge check</button> <button class="button secondary" data-action="clear-quiz" data-week="${week.week}">Clear knowledge check</button></p></section>
      ${renderWeekNotes(week)}
      <section class="panel"><h2>Module completion</h2>${completionReminder(s, week)}${checkline(`weeks.${week.week}.moduleComplete`, `I completed this module, submitted the required lab ${weekVideoRequired(week) ? 'video' : 'documents'}, passed the knowledge check, and updated my LMS record.`)}<p><button class="button danger small" data-action="clear-week" data-week="${week.week}">Clear this week only</button> <button class="button secondary small" data-action="back-top">Back to top</button></p></section>`;
  }
  function completionReminder(s, week) {
    const missing = [];
    if (s.resources < 1) missing.push('review all materials');
    if (s.guide < 1) missing.push('review the guided walkthrough example');
    if (s.terms < 1) missing.push('review defined terms');
    if (s.lab < 1) missing.push('complete lab success checklist');
    if (s.video < 1) missing.push(week && !weekVideoRequired(week) ? 'attach required lab documents' : 'submit lab video');
    if (!s.quizStatus.passed) missing.push('pass knowledge check');
    if (!missing.length) return '<p class="score-panel pass">All tracked module requirements are complete.</p>';
    return `<p class="score-panel open"><strong>Before marking complete:</strong> ${escapeHtml(missing.join(', '))}.</p>`;
  }

  function renderGuidedExample(week) {
    const g = week.guidedExample;
    if (!g) return '';
    const paragraphs = (g.paragraphs || []).map(p => `<p>${escapeHtml(p)}</p>`).join('');
    const questions = (g.summaryQuestions || []).map(q => `<li>${escapeHtml(q)}</li>`).join('');
    const scenario = g.scenario ? `<p class="guide-scenario"><strong>Scenario:</strong> ${escapeHtml(g.scenario)}</p>` : '';
    const hook = g.memoryHook ? `<div class="callout"><strong>Beginner-friendly summary</strong>${escapeHtml(g.memoryHook)}</div>` : '';
    return `<section class="panel guide-panel"><h2>${escapeHtml(g.title || 'Guided walkthrough example')}</h2>${scenario}<div class="guide-script">${paragraphs}</div>${hook}<h3>Use this guide to answer</h3><ul>${questions}</ul>${checkline(`weeks.${week.week}.guideReviewed`, 'I reviewed this guided example and can explain the workflow in beginner-friendly language.')}</section>`;
  }
  function renderWeekGlossary(week) {
    const terms = glossaryTermsForWeek(week.week);
    if (!terms.length) return '';
    const rows = terms.map(g => `<tr><td>${checkline(`glossary.${g.id}.reviewed`, '')}</td><td><strong>${escapeHtml(g.term)}</strong><br><span class="resource-meta">${escapeHtml(g.category)}</span></td><td>${escapeHtml(g.definition)}<br><span class="resource-meta"><strong>Why it matters:</strong> ${escapeHtml(g.whyItMatters || '')}</span></td><td>${linkButton(g.guideUrl, 'Open lesson guide')}</td></tr>`).join('');
    return `<section class="panel"><h2>Defined terms for this lesson</h2><p>Review these beginner-friendly terms before the lab. Each term includes a one-click Rentvine Help Center lesson guide.</p><p><button class="button secondary small" data-action="mark-terms" data-week="${week.week}">Mark lesson terms reviewed</button> <a class="button secondary small" href="#glossary">Open full glossary</a></p><div class="table-wrap"><table><thead><tr><th>Reviewed</th><th>Term</th><th>Definition</th><th>Lesson guide</th></tr></thead><tbody>${rows}</tbody></table></div></section>`;
  }

  // Required completion status for the Match Term to Definition practice ("#glossary-match"),
  // shown inline on the week page so the requirement is visible without leaving it. The link
  // pre-selects this week on the match practice page rather than leaving the learner to find it
  // in the week dropdown themselves.
  function renderWeekMatchPractice(week) {
    const ms = matchStatus(week);
    if (!ms.total) return '';
    const statusText = ms.submitted ? `${ms.correct}/${ms.total} correct (${pct(ms.score)}).` : `${ms.answered}/${ms.total} matched so far.`;
    return `<section class="panel"><h2>Match term to definition practice</h2><p>Match this week's glossary terms to their definitions. Required: at least ${Math.round(PASS_MARK * 100)}% correct to satisfy this week's completion.</p><div class="score-panel ${ms.passed ? 'pass' : 'open'}"><strong>${pct(ms.progress)} of requirement met.</strong> ${statusText} ${ms.passed ? 'Requirement satisfied.' : ''}</div><p><a class="button primary small" data-action="open-week-match" data-week="${week.week}" href="#glossary-match">Open match practice for this week</a></p></section>`;
  }

  function metaCard(label, text) { return `<div class="meta-card"><strong>${escapeHtml(label)}</strong>${escapeHtml(text || '—')}</div>`; }
  function resourceCard(week, r, i) {
    return `<article class="resource-card"><div>${checkline(`weeks.${week}.resources.${i}`, '')}</div><div><div class="resource-title">${escapeHtml(r.title)}</div><div class="resource-meta">${escapeHtml(r.type)}${r.videoCode ? ` · ${escapeHtml(r.videoCode)}` : ''}</div><div class="resource-summary">${escapeHtml(r.summary)}</div></div><div>${linkButton(r.url, r.type.toLowerCase().includes('video') ? 'Open video' : 'Open resource', `data-action="open-resource" data-week="${week}" data-resource="${i}"`)}</div></article>`;
  }
  function quizSummaryFromStatus(qs) {
    if (!qs.submitted) return `<div class="score-panel open">Answered: ${qs.answered}/${qs.total}. Submit to calculate your score.</div>`;
    return `<div class="score-panel ${qs.passed ? 'pass' : 'fail'}"><strong>Score: ${qs.correct}/${qs.total} (${pct(qs.score)}).</strong> ${qs.passed ? 'Passed.' : 'Review the explanations and retake this knowledge check.'}</div>`;
  }
  function quizSummary(week) { return quizSummaryFromStatus(quizStatus(week)); }
  function renderQuizQuestions(namespace, questions, submitted) {
    const order = getQuizOrder(namespace, questions);
    const byId = {};
    questions.forEach(q => { byId[q.id] = q; });
    return order.questionIds.map(qid => {
      const q = byId[qid];
      if (!q) return '';
      return questionCard(namespace, q, submitted, order.options[qid]);
    }).join('');
  }
  function questionCard(namespace, q, submitted, optionOrder) {
    const qid = q.id;
    const selected = getPath(`${namespace}.quiz.${qid}.answer`) || '';
    const correctContent = optionContent(q.options[q.correctOptionIndex] || q.correctAnswer);
    const order = optionOrder || q.options.map((_, idx) => idx);
    // Content is shuffled by `order`, but the displayed letter always matches on-screen position --
    // position 1 is always "A.", position 2 is always "B.", regardless of which authored option
    // (and which original letter) landed there.
    const displayContents = order.map(idx => optionContent(q.options[idx]));
    const opts = displayContents.map((content, pos) => {
      const letter = OPTION_LETTERS[pos] || String(pos + 1);
      const isCorrect = submitted && content === correctContent;
      const isWrongSelected = submitted && selected === content && content !== correctContent;
      const cls = isCorrect ? 'correct' : isWrongSelected ? 'incorrect' : '';
      return `<label class="option ${cls}"><input type="radio" name="${attr(namespace)}-q-${attr(qid)}" data-path="${namespace}.quiz.${attr(qid)}.answer" value="${attr(content)}" ${selected === content ? 'checked' : ''}>${escapeHtml(letter)}. ${escapeHtml(content)}</label>`;
    }).join('');
    const correctPos = displayContents.indexOf(correctContent);
    const correctLetter = OPTION_LETTERS[correctPos] || String(correctPos + 1);
    const correctDisplay = `${correctLetter}. ${correctContent}`;
    const remediation = submitted && selected !== correctContent && q.remediationUrl ? `<p class="resource-meta"><strong>Review next:</strong> <a href="${attr(q.remediationUrl)}" target="_blank" rel="noopener">${escapeHtml(q.remediationTitle || 'Lesson guide')}</a></p>` : '';
    const unattempted = TRAINER_MODE && !selected;
    const feedbackLabel = unattempted ? 'Answer key' : (selected === correctContent ? 'Correct' : 'Incorrect');
    const feedback = submitted ? `<div class="answer-feedback ${unattempted ? 'pass' : (selected === correctContent ? 'pass' : 'fail')}"><strong>${feedbackLabel}.</strong> Correct answer: ${escapeHtml(correctDisplay)}<br><span>${escapeHtml(q.explanation || '')}</span>${remediation}</div>` : '';
    return `<article class="question-card"><fieldset><legend>${escapeHtml(q.question)}</legend>${opts}</fieldset>${feedback}</article>`;
  }

  function renderCapstone() {
    const rubric = course.capstone.rubric || course.capstone.steps.map((step, i) => ({ step: i+1, task: step, points: 1, requirement: '', evidence: '' }));
    const score = capstoneScore();
    const rows = rubric.map((r, i) => `<div class="capstone-step"><h3>${r.step}. ${escapeHtml(r.task)} <span class="points">${escapeHtml(r.points)} pts</span></h3><p><strong>Critical requirement:</strong> ${escapeHtml(r.requirement || 'Complete the required task accurately.')}</p><p><strong>Evidence:</strong> ${escapeHtml(r.evidence || 'Evidence required.')}</p>${checkline(`capstone.steps.${i}.done`, 'Completed')}${numberField(`Points earned out of ${r.points}`, `capstone.steps.${i}.pointsEarned`, 0, r.points)}${field('Evidence link or file name', `capstone.steps.${i}.evidence`)}${textArea('Notes', `capstone.steps.${i}.notes`)}</div>`).join('');
    const failureItems = (course.capstone.automaticFailureConditions || []).map((x, i) => checkline(`capstone.failures.${i}`, x)).join('');
    const uploadUrl = course.capstone.videoUploadUrl || course.submission?.capstoneVideoUploadUrl || 'upload-lab-video.html?capstone=1';
    app.innerHTML = `
      <section class="module-header"><div class="kicker">Certification finish line</div><h1>${escapeHtml(course.capstone.title)}</h1><p>${escapeHtml(course.capstone.instructions)}</p><div class="module-progress"><div class="progress-rail"><div class="progress-fill" style="width:${pct(capstoneProgress())}"></div></div><strong>${pct(capstoneProgress())}</strong></div></section>
      <section class="callout warning"><strong>Final review target</strong>${escapeHtml(course.capstone.finalReviewTarget)}</section>
      <section class="panel"><h2>Capstone score</h2><div class="score-panel ${score.passed ? 'pass' : score.criticalFailure ? 'fail' : 'open'}"><strong>${score.earned}/${score.maxPoints} points.</strong> Pass standard: ${score.passPoints}+ points and no critical failures. ${score.passed ? 'Pass standard met.' : 'Pass standard not yet met.'}</div>${checkline('capstone.criticalFailure', 'Critical failure present')}</section>
      <section class="panel"><h2>Required capstone video submission</h2><p>Submit a walkthrough video or screen recording showing the completed capstone workflow in the training/sandbox database.</p><p>Attach it directly below so it can be reopened or downloaded right from this program. If your recording is too large to attach here, use the external upload center instead.</p><p>${linkButton(uploadUrl, 'Open external upload center', 'data-action="open-upload" data-week="capstone"')}</p>${labVideoAttachBlock('capstone', 'capstone')}<h3>Supporting documents</h3>${labDocumentsAttachBlock('capstone', 'capstone-docs')}${checkline('capstone.submit.videoUploaded', 'I submitted the required capstone walkthrough video and any supporting documents above.')}</section>
      <section class="panel"><h2>Scored rubric</h2>${rows}</section>
      <section class="panel"><h2>Automatic failure conditions</h2>${failureItems || '<p>No automatic failure conditions configured.</p>'}</section>
      <section class="panel"><h2>Certification submission checklist</h2>
        ${checkline('capstone.submit.sandbox', 'All capstone steps completed in a training or sandbox database.')}
        ${checkline('capstone.submit.ownerStatement', 'Owner statement generated and reviewed before submission.')}
        ${checkline('capstone.submit.evidenceNamed', 'Screenshots, exports, and video evidence named clearly.')}
        ${checkline('capstone.submit.submitted', 'Capstone evidence submitted for review.')}
        ${checkline('capstone.submit.dashboardUpdated', 'Program progress dashboard updated.')}
        ${checkline('capstone.scoreReviewed', 'Capstone score and critical-failure status reviewed.')}
        ${textArea('Capstone notes', 'capstone.notes')}
      </section>`;
  }

  function renderCheckpoint(cp) {
    const namespace = `checkpoints.${cp.id}`;
    const qs = checkpointQuizStatus(cp);
    const progress = checkpointProgress(cp);
    const agenda = (cp.managerSignOff?.meetingAgenda || []).map(x => `<li>${escapeHtml(x)}</li>`).join('');
    const reviewFocus = (cp.managerSignOff?.reviewFocus || []).map(x => `<li>${escapeHtml(x)}</li>`).join('');
    const signOffItems = (cp.managerSignOff?.signOffItems || []).map((x, i) => checkline(`${namespace}.signoff.${i}`, x)).join('');
    app.innerHTML = `
      <section class="module-header">
        <div class="kicker">Phase checkpoint · ${escapeHtml(cp.phase)}</div>
        <h1>${escapeHtml(cp.title)}</h1>
        <p>${escapeHtml(cp.purpose)}</p>
        <p class="resource-meta"><strong>Covers weeks:</strong> ${escapeHtml((cp.weeksCovered || []).join(', '))}</p>
        <div class="module-progress"><div class="progress-rail"><div class="progress-fill" style="width:${pct(progress.progress)}"></div></div><strong>${pct(progress.progress)}</strong></div>
      </section>
      <section class="panel"><h2>1. Cumulative retention check</h2><p>This quiz mixes new material from this phase with concepts from earlier phases, to check what actually stuck rather than what you can look up. Pass mark: ${Math.round(PASS_MARK * 100)}%.</p>${quizSummaryFromStatus(qs)}${renderQuizQuestions(namespace, cp.questions, qs.submitted || TRAINER_MODE)}<p><button class="button primary" data-action="score-checkpoint-quiz" data-id="${attr(cp.id)}">Score retention check</button> <button class="button secondary" data-action="clear-checkpoint-quiz" data-id="${attr(cp.id)}">Clear retention check</button></p></section>
      <section class="panel"><h2>2. Manager sign-off</h2>
        <h3>Meeting agenda</h3><ol>${agenda}</ol>
        <h3>What the manager reviews</h3><ul>${reviewFocus}</ul>
        <h3>Sign-off checklist</h3>${signOffItems}
        <div class="form-grid">${field('Manager name', `${namespace}.managerName`)}${field('Sign-off date', `${namespace}.signOffDate`, 'date')}</div>
        <div class="field"><label>Outcome<select data-path="${namespace}.outcome"><option value="">Choose outcome...</option><option value="ready" ${getPath(`${namespace}.outcome`) === 'ready' ? 'selected' : ''}>Ready to proceed</option><option value="practice" ${getPath(`${namespace}.outcome`) === 'practice' ? 'selected' : ''}>Needs additional practice</option></select></label></div>
        ${textArea('Manager notes', `${namespace}.managerNotes`)}
      </section>
      <section class="panel"><p><a class="button secondary small" href="#dashboard">Back to dashboard</a> <button class="button secondary small" data-action="back-top">Back to top</button></p></section>`;
  }

  function renderWeekNotes(week) {
    return `<section class="panel"><h2>My notes</h2><p>Jot down anything worth remembering from this module -- questions for your manager, things that clicked, or steps you want to double-check later. These notes are just for you.</p>${textArea('Notes for Week ' + week.week, `weeks.${week.week}.myNotes`, 'Type your own notes for this week here...')}</section>`;
  }
  function renderRealCaseNote(week) {
    const rce = course.realCaseExposure || {};
    return `<section class="panel"><h2>${escapeHtml(rce.title || 'Real Case Review')}</h2><p>${escapeHtml(rce.guidance || '')}</p>${textArea(rce.weeklyPromptLabel || "This week's real case note", `weeks.${week.week}.realCaseNote`, rce.weeklyPromptPlaceholder || '')}</section>`;
  }

  function renderGlossary() {
    const terms = course.glossary || [];
    const categories = [...new Set(terms.map(g => g.category).filter(Boolean))].sort();
    const reviewed = terms.filter(g => state.glossary?.[g.id]?.reviewed).length;
    const rows = terms.map(g => {
      const weekText = (g.weeks || []).map(w => `Week ${w}`).join(', ');
      const searchText = `${g.term} ${g.category} ${g.definition} ${g.whyItMatters} ${weekText}`.toLowerCase();
      return `<tr class="glossary-row" data-category="${attr(g.category)}" data-search="${attr(searchText)}" data-weeks="${attr((g.weeks || []).join(','))}">
        <td>${checkline(`glossary.${g.id}.reviewed`, '')}</td>
        <td><strong>${escapeHtml(g.term)}</strong><br><span class="resource-meta">${escapeHtml(g.category)}</span></td>
        <td>${escapeHtml(g.definition)}<br><span class="resource-meta"><strong>Why it matters:</strong> ${escapeHtml(g.whyItMatters || '')}</span></td>
        <td>${escapeHtml(weekText)}</td>
        <td><a class="button primary small" href="${attr(g.guideUrl)}" target="_blank" rel="noopener" data-action="open-glossary-guide" data-term="${attr(g.id)}">Open guide</a><br><span class="resource-meta">${escapeHtml(g.guideTitle)}</span></td>
      </tr>`;
    }).join('');
    app.innerHTML = `<section class="module-header"><div class="kicker">Learner reference</div><h1>Defined Terms & Glossary</h1><p>Use this tab like a Monday-board style glossary: review the term, read the plain-English definition, see which week teaches it, and open the official Rentvine Help Center lesson guide in one click.</p><div class="module-progress"><div class="progress-rail"><div class="progress-fill" style="width:${pct(glossaryOverallProgress())}"></div></div><strong>${reviewed}/${terms.length} reviewed</strong></div></section>
      <section class="panel glossary-tools"><div class="field"><label>Search terms, definitions, or weeks<input id="glossary-search" type="search" placeholder="Example: reserve, move-out, ACH, RentSign"></label></div><div class="field"><label>Filter by category<select id="glossary-category"><option value="">All categories</option>${categories.map(c => `<option value="${attr(c)}">${escapeHtml(c)}</option>`).join('')}</select></label></div><div class="field"><label>Filter by week<select id="glossary-week"><option value="">All weeks</option>${course.weeks.map(w => `<option value="${w.week}">Week ${w.week}</option>`).join('')}</select></label></div><div class="glossary-actions"><button class="button secondary" data-action="mark-glossary-all">Mark all glossary terms reviewed</button><button class="button secondary" data-action="clear-glossary-filter">Clear filters</button></div></section>
      <section class="panel"><div class="table-wrap"><table><thead><tr><th>Reviewed</th><th>Term</th><th>Plain-English definition</th><th>Week</th><th>Lesson guide</th></tr></thead><tbody id="glossary-body">${rows}</tbody></table></div><p id="glossary-count" class="resource-meta"></p></section>`;
    filterGlossary();
  }

  function filterGlossary() {
    const q = (document.getElementById('glossary-search')?.value || '').trim().toLowerCase();
    const cat = document.getElementById('glossary-category')?.value || '';
    const week = document.getElementById('glossary-week')?.value || '';
    const rows = [...document.querySelectorAll('.glossary-row')];
    let visible = 0;
    rows.forEach(row => {
      const matchesQuery = !q || row.dataset.search.includes(q);
      const matchesCat = !cat || row.dataset.category === cat;
      const matchesWeek = !week || (row.dataset.weeks || '').split(',').includes(week);
      const show = matchesQuery && matchesCat && matchesWeek;
      row.hidden = !show;
      if (show) visible += 1;
    });
    const count = document.getElementById('glossary-count');
    if (count) count.textContent = `${visible} of ${rows.length} glossary terms shown.`;
  }

  function renderResourceLibrary() {
    const videoCards = course.videos.map(v => `<article class="resource-card"><div>${checkline(`videos.${v.code}.reviewed`, '')}</div><div><div class="resource-title">${escapeHtml(v.code)} · ${escapeHtml(v.title)}</div><div class="resource-summary">${escapeHtml(v.summary)}</div><div class="resource-meta">Used in weeks: ${[...v.primaryWeeks, ...v.supportingWeeks].sort((a,b)=>a-b).join(', ')}</div></div><div>${linkButton(v.url, 'Open video', `data-video="${attr(v.code)}"`)}</div></article>`).join('');
    const refCards = course.referenceLinks.map((r, i) => `<article class="resource-card"><div>${checkline(`reference.${i}.reviewed`, '')}</div><div><div class="resource-title">${escapeHtml(r.title)}</div><div class="resource-meta">Reference link</div></div><div>${linkButton(r.url, 'Open resource')}</div></article>`).join('');
    app.innerHTML = `<section class="module-header"><div class="kicker">Appendix</div><h1>Resource Library</h1><p>Updated video archive, defined terms/glossary board, core reference links, and the required video upload center.</p></section><section class="panel"><h2>Required upload center</h2><p>${linkButton(course.submission?.labVideoUploadUrl || 'upload-lab-video.html', 'Open Video Upload Center')}</p><p class="resource-meta">Administrators can replace the default upload destination in data/course.json and data/course-data.js with an LMS, Google Drive, OneDrive, or form upload URL.</p></section><section class="panel"><h2>Defined Terms & Glossary</h2><p><a class="button secondary" href="#glossary">Open glossary board</a> <a class="button secondary" href="#glossary-match">Practice matching terms</a></p><p class="resource-meta">Search beginner definitions, open weekly lesson guides, and launch related Help Center articles.</p></section><section class="panel"><h2>Downloadable Job Aids</h2><p><a class="button secondary" href="#job-aids">Open job aid library</a></p></section><section class="panel"><h2>Updated video archive</h2>${videoCards}</section><section class="panel"><h2>Core reference links</h2>${refCards}</section>`;
  }

  function exportJson() {
    download(`rentvine-university-progress-${dateStamp()}.json`, JSON.stringify({ course: course.meta, exportedAt: new Date().toISOString(), progress: state }, null, 2), 'application/json');
  }
  function exportCsv() {
    const lines = [['Week','Module','Phase','Materials','Guide Reviewed','Defined Terms','Lab','Lab Video','Quiz Correct','Quiz Score','Quiz Passed','Match Correct','Match Passed','Module Done','Progress']];
    course.weeks.forEach(w => { const s = weekStats(w); const q = s.quizStatus; const m = s.matchStatus; lines.push([w.week, w.title, w.phase, pct(s.resources), s.guide ? 'Yes' : 'No', pct(s.terms), pct(s.lab), s.video ? 'Yes' : 'No', `${q.correct}/${q.total}`, pct(q.score), q.passed ? 'Yes' : 'No', m.total ? `${m.correct}/${m.total}` : 'n/a', (!m.total || m.passed) ? 'Yes' : 'No', s.module ? 'Yes' : 'No', pct(s.progress)]); });
    (course.checkpoints || []).forEach(cp => {
      const p = checkpointProgress(cp);
      lines.push([cp.afterWeek, cp.title, cp.phase, '', '', '', '', '', `${p.quizStatus.correct}/${p.quizStatus.total}`, pct(p.quizStatus.score), p.quizStatus.passed ? 'Yes' : 'No', '', '', p.signOff >= 1 ? 'Yes' : 'No', pct(p.progress)]);
    });
    const cs = capstoneScore();
    lines.push(['Capstone','Capstone Practical','Certification','','','','','','',`${cs.earned}/${cs.maxPoints}`, cs.passed ? 'Yes' : 'No','','','',pct(capstoneProgress())]);
    lines.push(['Glossary','Defined Terms & Glossary','Reference','','',pct(glossaryOverallProgress()),'','','','',glossaryOverallProgress() >= 1 ? 'Yes' : 'No','','','',pct(glossaryOverallProgress())]);
    const csv = lines.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
    download(`rentvine-university-progress-summary-${dateStamp()}.csv`, csv, 'text/csv');
  }
  function download(name, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function dateStamp() { return new Date().toISOString().slice(0,10); }

  function importProgress(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        state = parsed.progress || parsed;
        saveState(); render(); toastMsg('Progress imported.');
      } catch (e) { toastMsg('Import failed: invalid JSON.'); }
    };
    reader.readAsText(file);
  }

  let scormApi = null;
  function findScormApi(win) {
    let attempts = 0;
    while (win && attempts < 10) {
      if (win.API) return win.API;
      attempts += 1;
      win = win.parent && win.parent !== win ? win.parent : null;
    }
    return null;
  }
  function initScorm() {
    try {
      scormApi = findScormApi(window) || (window.opener ? findScormApi(window.opener) : null);
      if (scormApi) scormApi.LMSInitialize('');
    } catch (e) { scormApi = null; }
  }
  function syncScorm() {
    if (!scormApi) return;
    try {
      const progress = Math.round(overallProgress() * 100);
      scormApi.LMSSetValue('cmi.core.lesson_location', currentRoute());
      scormApi.LMSSetValue('cmi.core.score.raw', String(progress));
      scormApi.LMSSetValue('cmi.core.lesson_status', progress >= 100 ? 'completed' : 'incomplete');
      scormApi.LMSSetValue('cmi.suspend_data', JSON.stringify({ progress, updatedAt: state.updatedAt, route: currentRoute() }).slice(0, 4000));
      scormApi.LMSCommit('');
    } catch (e) { /* ignore */ }
  }
  window.addEventListener('beforeunload', () => { try { if (scormApi) { syncScorm(); scormApi.LMSFinish(''); } } catch(e) {} });

  // --- monday.com live sync -------------------------------------------------
  // When RU is hosted and opened inside a monday.com "Item view" app (a custom
  // iframe tab on a specific board item/row), this pushes a learner's computed
  // progress snapshot into that item's columns automatically every time
  // saveState() runs. Outside of monday.com -- the standalone HTML file, the
  // SCORM package, a plain browser tab -- window.self === window.top, so this
  // entire block no-ops immediately and never loads any external script.
  // See MONDAY-APP-SETUP.md for the full walkthrough (registering the app,
  // hosting RU, and wiring up the column IDs below).
  const MONDAY_COLUMNS = {
    status: '',          // Status column -- Not Started / In Progress / At Risk / Completed
    rolePath: '',        // Dropdown column -- learner's selected role path title
    currentWeek: '',     // Numbers column -- next incomplete week in their path
    weeksCompleted: '',  // Numbers column -- count of fully completed weeks
    overallProgress: '', // Numbers column -- 0-100
    quizAvg: '',         // Numbers column -- 0-100, average score across attempted quizzes
    matchAvg: '',        // Numbers column -- 0-100, average score across attempted match practice
    capstoneStatus: '',  // Status column -- Not Started / In Progress / Submitted / Passed
    lastSync: ''         // Date column -- date of the most recent sync
  };
  let mondayClient = null;
  let mondayContext = null;
  function initMondaySync() {
    if (window.self === window.top) return; // not embedded in an iframe -- nothing to sync to
    try {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/monday-sdk-js/dist/main.js';
      script.onload = () => {
        try {
          mondayClient = window.mondaySdk();
          mondayClient.listen('context', (res) => {
            const ctx = res && res.data;
            if (ctx && ctx.itemId && ctx.boardId) { mondayContext = ctx; syncMonday(); }
          });
        } catch (e) { mondayClient = null; }
      };
      script.onerror = () => { mondayClient = null; };
      document.head.appendChild(script);
    } catch (e) { /* ignore -- never let sync setup break the app */ }
  }
  function mondayProgressSnapshot() {
    const path = selectedRolePath();
    const weeksInPath = path ? course.weeks.filter(w => isWeekInSelectedPath(w.week)) : course.weeks;
    const statsList = weeksInPath.map(w => weekStats(w));
    const weeksCompleted = statsList.filter(s => s.complete).length;
    const nextWeek = weeksInPath.find(w => !weekStats(w).complete);
    const currentWeek = nextWeek ? nextWeek.week : (weeksInPath.length ? weeksInPath[weeksInPath.length - 1].week : '');
    const quizzed = statsList.filter(s => s.quizStatus.total > 0);
    const quizAvg = quizzed.length ? Math.round(quizzed.reduce((a, s) => a + s.quizStatus.score, 0) / quizzed.length * 100) : 0;
    const matched = statsList.filter(s => s.matchStatus.total > 0);
    const matchAvg = matched.length ? Math.round(matched.reduce((a, s) => a + s.matchStatus.score, 0) / matched.length * 100) : 0;
    const overallPct = Math.round(overallProgress() * 100);
    const cs = capstoneScore();
    const capstoneStatusLabel = cs.passed ? 'Passed' : (state.capstone.submit?.submitted ? 'Submitted' : (capstoneProgress() > 0 ? 'In Progress' : 'Not Started'));
    const target = state.profile?.targetDate ? new Date(state.profile.targetDate) : null;
    const overdue = target && !isNaN(target) && target < new Date() && overallPct < 100;
    const statusLabel = overallPct >= 100 ? 'Completed' : overdue ? 'At Risk' : overallPct > 0 ? 'In Progress' : 'Not Started';
    return { status: statusLabel, rolePath: path ? path.title : '', currentWeek, weeksCompleted, overallProgress: overallPct, quizAvg, matchAvg, capstoneStatus: capstoneStatusLabel, lastSync: new Date().toISOString().slice(0, 10) };
  }
  function syncMonday() {
    if (!mondayClient || !mondayContext) return;
    try {
      const snap = mondayProgressSnapshot();
      const columnValues = {};
      if (MONDAY_COLUMNS.status) columnValues[MONDAY_COLUMNS.status] = { label: snap.status };
      if (MONDAY_COLUMNS.rolePath && snap.rolePath) columnValues[MONDAY_COLUMNS.rolePath] = { labels: [snap.rolePath] };
      if (MONDAY_COLUMNS.currentWeek) columnValues[MONDAY_COLUMNS.currentWeek] = String(snap.currentWeek);
      if (MONDAY_COLUMNS.weeksCompleted) columnValues[MONDAY_COLUMNS.weeksCompleted] = String(snap.weeksCompleted);
      if (MONDAY_COLUMNS.overallProgress) columnValues[MONDAY_COLUMNS.overallProgress] = String(snap.overallProgress);
      if (MONDAY_COLUMNS.quizAvg) columnValues[MONDAY_COLUMNS.quizAvg] = String(snap.quizAvg);
      if (MONDAY_COLUMNS.matchAvg) columnValues[MONDAY_COLUMNS.matchAvg] = String(snap.matchAvg);
      if (MONDAY_COLUMNS.capstoneStatus) columnValues[MONDAY_COLUMNS.capstoneStatus] = { label: snap.capstoneStatus };
      if (MONDAY_COLUMNS.lastSync) columnValues[MONDAY_COLUMNS.lastSync] = { date: snap.lastSync };
      if (!Object.keys(columnValues).length) return;
      mondayClient.api(
        `mutation ($boardId: ID!, $itemId: ID!, $columnValues: JSON!) {
          change_multiple_column_values(board_id: $boardId, item_id: $itemId, column_values: $columnValues) { id }
        }`,
        { variables: { boardId: mondayContext.boardId, itemId: mondayContext.itemId, columnValues: JSON.stringify(columnValues) } }
      ).catch(() => {});
    } catch (e) { /* ignore -- sync is best-effort and must never break the learner experience */ }
  }

  document.addEventListener('input', e => {
    const el = e.target;
    if (el.matches('[data-path]')) {
      if (el.type === 'checkbox') setPath(el.dataset.path, el.checked);
      else if (el.type === 'radio') { if (el.checked) setPath(el.dataset.path, el.value); }
      else setPath(el.dataset.path, el.value);
      saveState();
    }
    if (el.id === 'glossary-search' || el.id === 'glossary-category' || el.id === 'glossary-week') filterGlossary();
  });
  document.addEventListener('change', e => {
    const el = e.target;
    if (el.id === 'import-progress' && el.files?.[0]) importProgress(el.files[0]);
    if (el.dataset && el.dataset.action === 'attach-video-file' && el.files?.[0]) {
      handleVideoFileAttach(el.dataset.key, el.dataset.pathPrefix, el.files[0]);
    }
    if (el.dataset && el.dataset.action === 'attach-doc-files' && el.files?.length) {
      addDocFiles(el.dataset.key, el.dataset.pathPrefix, el.files);
      el.value = '';
    }
    if (el.id === 'glossary-category' || el.id === 'glossary-week') filterGlossary();
    if (el.id === 'role-path-select' || el.id === 'match-week') { saveState(); render(); }
    if (el.matches('[data-path]') && (el.type === 'checkbox' || el.type === 'radio')) render();
  });
  document.addEventListener('click', e => {
    const t = e.target.closest('[data-action], [data-video]');
    if (!t) return;
    if (t.dataset.action === 'open-resource') {
      setPath(`weeks.${t.dataset.week}.resources.${t.dataset.resource}`, true); saveState(); setTimeout(render, 250);
    }
    if (t.dataset.video) { setPath(`videos.${t.dataset.video}.reviewed`, true); saveState(); }
    if (t.dataset.action === 'open-upload' && t.dataset.week && t.dataset.week !== 'capstone') {
      setPath(`weeks.${t.dataset.week}.uploadOpened`, true); saveState();
    }
    if (t.dataset.action === 'mark-materials') {
      const week = course.weeks.find(w => String(w.week) === String(t.dataset.week));
      week.resources.forEach((_, i) => setPath(`weeks.${week.week}.resources.${i}`, true));
      saveState(); render(); toastMsg('All materials marked reviewed.');
    }
    if (t.dataset.action === 'mark-terms') {
      glossaryTermsForWeek(t.dataset.week).forEach(g => setPath(`glossary.${g.id}.reviewed`, true));
      saveState(); render(); toastMsg('Lesson terms marked reviewed.');
    }
    if (t.dataset.action === 'mark-glossary-all') {
      (course.glossary || []).forEach(g => setPath(`glossary.${g.id}.reviewed`, true));
      saveState(); render(); toastMsg('All glossary terms marked reviewed.');
    }
    if (t.dataset.action === 'clear-glossary-filter') {
      const s = document.getElementById('glossary-search'); const c = document.getElementById('glossary-category'); const w = document.getElementById('glossary-week');
      if (s) s.value = ''; if (c) c.value = ''; if (w) w.value = ''; filterGlossary();
    }
    if (t.dataset.action === 'open-glossary-guide' && t.dataset.term) {
      setPath(`glossary.${t.dataset.term}.guideOpened`, true); saveState();
    }
    if (t.dataset.action === 'back-top') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    if (t.dataset.action === 'toggle-contrast') {
      state.accessibility.highContrast = !state.accessibility.highContrast;
      document.body.classList.toggle('high-contrast', !!state.accessibility.highContrast);
      saveState(); toastMsg(state.accessibility.highContrast ? 'High contrast on.' : 'High contrast off.');
    }
    if (t.dataset.action === 'score-match') {
      const weekNum = Number(t.dataset.week);
      const before = computeMatchStatus(weekNum);
      if (before.answered < before.total) { toastMsg(`Match all ${before.total} terms before checking.`); return; }
      setPath(`match.submitted.${weekNum}`, true); saveState(); render();
      const after = computeMatchStatus(weekNum);
      toastMsg(after.passed ? 'Matches checked -- requirement satisfied.' : `Matches checked: ${after.correct}/${after.total} correct. Adjust the highlighted rows and check again.`);
    }
    if (t.dataset.action === 'clear-match') {
      deletePath(`match.answers.${t.dataset.week}`); deletePath(`match.submitted.${t.dataset.week}`); saveState(); render(); toastMsg('Match practice cleared.');
    }
    if (t.dataset.action === 'open-week-match') {
      setPath('match.week', Number(t.dataset.week)); saveState();
    }
    if (t.dataset.action === 'score-quiz') {
      const week = course.weeks.find(w => String(w.week) === String(t.dataset.week));
      const q = quizStatus(week);
      if (q.answered < q.total) { toastMsg(`Answer all ${q.total} questions before scoring.`); return; }
      setPath(`weeks.${week.week}.quizSubmitted`, true);
      const qs = quizStatus(week);
      setPath(`weeks.${week.week}.quizScore`, `${qs.correct}/${qs.total} (${pct(qs.score)})`);
      saveState(); render(); toastMsg(qs.passed ? 'Knowledge check passed.' : 'Review explanations and retake.');
    }
    if (t.dataset.action === 'clear-quiz') {
      if (confirm('Clear answers and score for this knowledge check? The next attempt will use a freshly shuffled question and answer order.')) {
        deletePath(`weeks.${t.dataset.week}.quiz`); deletePath(`weeks.${t.dataset.week}.quizSubmitted`); deletePath(`weeks.${t.dataset.week}.quizScore`); deletePath(`weeks.${t.dataset.week}.quizOrder`); saveState(); render(); toastMsg('Knowledge check cleared. New question order on next attempt.');
      }
    }
    if (t.dataset.action === 'score-checkpoint-quiz') {
      const cp = (course.checkpoints || []).find(c => c.id === t.dataset.id);
      if (!cp) return;
      const q = checkpointQuizStatus(cp);
      if (q.answered < q.total) { toastMsg(`Answer all ${q.total} questions before scoring.`); return; }
      setPath(`checkpoints.${cp.id}.quizSubmitted`, true);
      const qs = checkpointQuizStatus(cp);
      setPath(`checkpoints.${cp.id}.quizScore`, `${qs.correct}/${qs.total} (${pct(qs.score)})`);
      saveState(); render(); toastMsg(qs.passed ? 'Retention check passed.' : 'Review explanations and retake.');
    }
    if (t.dataset.action === 'clear-checkpoint-quiz') {
      if (confirm('Clear answers and score for this retention check? The next attempt will use a freshly shuffled question and answer order.')) {
        deletePath(`checkpoints.${t.dataset.id}.quiz`); deletePath(`checkpoints.${t.dataset.id}.quizSubmitted`); deletePath(`checkpoints.${t.dataset.id}.quizScore`); deletePath(`checkpoints.${t.dataset.id}.quizOrder`); saveState(); render(); toastMsg('Retention check cleared. New question order on next attempt.');
      }
    }
    if (t.dataset.action === 'clear-glossary') {
      if (confirm('Clear glossary review checkmarks?')) { state.glossary = {}; saveState(); render(); toastMsg('Glossary review cleared.'); }
    }
    if (t.dataset.action === 'clear-week') {
      if (confirm('Clear saved work for this week only?')) { delete state.weeks[t.dataset.week]; saveState(); render(); toastMsg('Week cleared.'); }
    }
    if (t.dataset.action === 'open-video-file' && t.dataset.key) {
      loadVideoFile(t.dataset.key).then(rec => {
        if (!rec || !rec.blob) { toastMsg('No attached file found for this item.'); return; }
        const url = URL.createObjectURL(rec.blob);
        window.open(url, '_blank', 'noopener');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }).catch(() => toastMsg('Could not open the attached file in this browser.'));
    }
    if (t.dataset.action === 'download-video-file' && t.dataset.key) {
      loadVideoFile(t.dataset.key).then(rec => {
        if (!rec || !rec.blob) { toastMsg('No attached file found for this item.'); return; }
        const url = URL.createObjectURL(rec.blob);
        const a = document.createElement('a'); a.href = url; a.download = rec.name || 'lab-video'; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }).catch(() => toastMsg('Could not download the attached file in this browser.'));
    }
    if (t.dataset.action === 'remove-video-file' && t.dataset.key) {
      if (confirm('Remove the attached video file? This cannot be undone.')) {
        deleteVideoFile(t.dataset.key).catch(() => {}).finally(() => {
          if (t.dataset.pathPrefix) { deletePath(`${t.dataset.pathPrefix}.videoFile`); deletePath(`${t.dataset.pathPrefix}.videoEvidenceFileName`); }
          saveState(); render(); toastMsg('Attached video removed.');
        });
      }
    }
    if (t.dataset.action === 'open-doc-file' && t.dataset.key) {
      loadDocRecord(t.dataset.key).then(rec => {
        const file = rec && rec.files && rec.files[Number(t.dataset.index)];
        if (!file || !file.blob) { toastMsg('No attached document found.'); return; }
        const url = URL.createObjectURL(file.blob);
        window.open(url, '_blank', 'noopener');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }).catch(() => toastMsg('Could not open that document in this browser.'));
    }
    if (t.dataset.action === 'download-doc-file' && t.dataset.key) {
      loadDocRecord(t.dataset.key).then(rec => {
        const file = rec && rec.files && rec.files[Number(t.dataset.index)];
        if (!file || !file.blob) { toastMsg('No attached document found.'); return; }
        const url = URL.createObjectURL(file.blob);
        const a = document.createElement('a'); a.href = url; a.download = file.name || 'document'; document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      }).catch(() => toastMsg('Could not download that document in this browser.'));
    }
    if (t.dataset.action === 'remove-doc-file' && t.dataset.key) {
      if (confirm('Remove this attached document? This cannot be undone.')) {
        removeDocFile(t.dataset.key, t.dataset.pathPrefix, Number(t.dataset.index));
      }
    }
    if (t.dataset.action === 'pw-demo-prev' || t.dataset.action === 'pw-demo-next') {
      const st = PW_DEMO_STATE[t.dataset.demoId];
      if (st && st.shots && st.shots.length) {
        const len = st.shots.length;
        st.index = t.dataset.action === 'pw-demo-next' ? (st.index + 1) % len : (st.index - 1 + len) % len;
        if (st.timer) { clearInterval(st.timer); st.timer = null; }
        render();
      }
    }
    if (t.dataset.action === 'pw-demo-jump') {
      const st = PW_DEMO_STATE[t.dataset.demoId];
      if (st) {
        st.index = Number(t.dataset.index) || 0;
        if (st.timer) { clearInterval(st.timer); st.timer = null; }
        render();
      }
    }
    if (t.dataset.action === 'pw-demo-play') {
      const demoId = t.dataset.demoId;
      const st = PW_DEMO_STATE[demoId];
      if (st) {
        if (st.timer) {
          clearInterval(st.timer); st.timer = null;
        } else {
          st.timer = setInterval(() => {
            if (!document.querySelector(`[data-demo-id="${demoId}"]`) || !st.shots || !st.shots.length) { clearInterval(st.timer); st.timer = null; return; }
            st.index = (st.index + 1) % st.shots.length;
            render();
          }, 4200);
        }
        render();
      }
    }
  });
  document.getElementById('nav-toggle').addEventListener('click', () => document.body.classList.toggle('nav-open'));
  document.getElementById('export-json').addEventListener('click', exportJson);
  document.getElementById('export-csv').addEventListener('click', exportCsv);
  document.getElementById('print-page').addEventListener('click', () => window.print());
  document.getElementById('clear-progress').addEventListener('click', () => {
    if (confirm('Reset all saved progress in this browser? Export a backup first if needed.')) { state = defaultState(); saveState(); render(); toastMsg('Progress reset.'); }
  });
  document.addEventListener('click', e => {
    if (e.target.id === 'export-json-inline') exportJson();
    if (e.target.id === 'export-csv-inline') exportCsv();
    if (e.target.closest('.nav-link') && window.innerWidth < 980) document.body.classList.remove('nav-open');
  });
  window.addEventListener('hashchange', render);

  function initTrainerBanner() {
    if (!TRAINER_MODE) return;
    const banner = document.createElement('div');
    banner.textContent = 'TRAINER EDITION — correct answers and explanations are shown automatically. Do not distribute this copy to learners.';
    banner.setAttribute('role', 'status');
    banner.style.cssText = 'position:sticky;top:0;z-index:9999;background:#b3261e;color:#fff;font-weight:700;text-align:center;padding:.5rem 1rem;font-size:.9rem;';
    document.body.insertBefore(banner, document.body.firstChild);
    document.title = 'TRAINER EDITION — ' + document.title;
  }

  initScorm();
  initMondaySync();
  initTrainerBanner();
  document.body.classList.toggle('high-contrast', !!state.accessibility?.highContrast);
  if (!window.location.hash) window.location.hash = '#overview';
  render();
})();
