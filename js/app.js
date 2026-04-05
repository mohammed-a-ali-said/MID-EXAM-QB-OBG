const ALL_CARDS = window.ALL_CARDS || [];
const questionResolutionHelpers = window.questionResolutionHelpers || window.OBG_QB_Utils || {
  normalizeLectureName: (value) => value,
  getStudyEligibleCards: ({ cards }) => Array.isArray(cards) ? cards : [],
  getRepresentativeForCanonical: () => null,
  cardHasLectureAssociation: () => true,
  questionIsActive: (card) => card && card.active !== false,
  lectureNames: [],
  examNames: [],
  contentMetadata: {},
};
const CONTENT_METADATA = window.OBG_CONTENT_METADATA || questionResolutionHelpers.contentMetadata || {};

const NOTES = {"Antenatal Care (ANC)":["Note 22.\nط¬ظ‡ ط¹ظ„ظٹظ‡ط§ ط§ط³ط¦ظ„ط© ظپظٹ ط§ظ„ط§ظ…طھط­ط§ظ†\nvery important note\nâ—‹ Immunizations: -\nâ†’ Safe immunizations (include antigens from killed or inactivated organisms):\nInfluenza (all pregnant women in flu season).\nTetanus, diphtheria, pertussis (Tdap)\nHepatitis B (pre- and postexposure).\nHepatitis A (pre- and postexposure).\nPneumococcus (only high-risk women).\nMeningococcus (in unusual outbreaks).\nTyphoid (not routinely recommended).\nâ†’ Unsafe immunizations (include antigens from live attenuated organisms):\nMMR (measles, mumps, rubella)\nPolio\nYellow fever\nVaricella","Note 23.\nط¬ظ‡ ط¹ظ„ظٹظ‡ط§ ط§ط³ط¦ظ„ط© ظپظٹ ط§ظ„ط§ظ…طھط­ط§ظ†\nvery important note\nâ€¢ Daily dietary requirement Of a woman during pregnancy (2nd half)\nFood element\nPregnancy\nKilocalories\n2500\nProtein\n60 gm\nIron\n40 gm\nFolic acid\n400 خ¼g\nCalcium\n1000 mg\nVitamin A\n6000 I.U."],"Cardiac Disorders & Anaemia with Pregnancy":["Important notes:\n*minimal level of Hb to allow delivery is\n10 gm/dl\n(ط¬طھ ظپظٹ ط§ظ…طھط­ط§ظ† ط³ط§طھط©)\n*iron needed in pregnancy is\n27 mg/dl\n*anemia of chronic infection is\nnormocytic normochromic anemia\n*Iron absorption differs during pregnancy\n*There is threshold for iron absorption\n*Iron stores is 500 mg\n*Folic acid given in megaloblastic anemia"],"Normal Labour":["ظپظٹ ط§ظ„ظپظˆط±ظ…ط§طھظٹظپ ط¨طھط§ط¹ظƒظ… ظ„ط£ظ†ظ‡ ط¬ظ‡ ظپظٹ ط§ظ…طھط­ط§ظ† ط³ظ†ط© ط±ط§ط¨ط¹ط© ط§ظ„ط³ظ†ط© ط§ظ„ظٹ ظپط§طھطھ ط­ط§ظˆظ„ظˆط§ طھطھط£ظƒط¯ظˆط§ ظ…ظ† ط§ط¬ط§ط¨ط© ط§ظ„ط³ط¤ط§ظ„ ط¯ظ‡"]};

// â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ
// STATE
// â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ
let deck=[], idx=0, flipped=false, reviewed=0;
let scores={again:0,good:0,easy:0}, mcqRes={correct:0,wrong:0};
const filterState = {
  exam: 'all',
  src: '',
  type: '',
  lecture: null,
};
let osceSubIdx = {};  // cardId -> current sub-question index
let osceResults = {}; // cardId -> {subIdx -> 'correct'|'wrong'|'unanswered'}
let mcqAnswers   = {};  // cardId -> chosen letter
let flashRatings = {};  // cardId -> 'again'|'good'|'easy'
const PRACTICE_LECTURE_KEY = 'obg_selected_lecture';
const RANDOM_MODE_KEY = 'obg_random_mode';
let randomMode = true;
let pendingCardDirection = 'next';

function animateCount(el, targetValue, duration = 350) {
  const start = parseInt(el.textContent) || 0;
  const end = parseInt(targetValue) || 0;
  if (start === end) { el.textContent = end; return; }
  const startTime = performance.now();
  function step(now) {
    const p = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - p, 3); // ease-out-cubic
    el.textContent = Math.round(start + (end - start) * eased);
    if (p < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
function animateFractionText(el, current, total, duration = 350){
  if(!el) return;
  let currentEl = el.querySelector('[data-current]');
  let totalEl = el.querySelector('[data-total]');
  if(!currentEl || !totalEl){
    el.innerHTML = '<span data-current>0</span> / <span data-total>0</span>';
    currentEl = el.querySelector('[data-current]');
    totalEl = el.querySelector('[data-total]');
  }
  animateCount(currentEl, current, duration);
  animateCount(totalEl, total, duration);
}
function animateSidebarCounts(){
  document.querySelectorAll('.s-cnt[data-target-count]').forEach(el => {
    animateCount(el, el.dataset.targetCount);
  });
}
function transitionCard(newHTML, direction = 'next'){
  const stage = document.getElementById('card-stage');
  if(!stage) return;
  const exitClass = direction === 'prev' ? 'card-exit-right' : 'card-exit-left';
  const enterClass = direction === 'prev' ? 'card-enter-left' : 'card-enter-right';
  const clearClasses = () => stage.classList.remove('card-exit-left','card-exit-right','card-enter-left','card-enter-right');
  const mount = () => {
    stage.innerHTML = newHTML;
    clearClasses();
    stage.classList.add(enterClass);
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        stage.classList.remove(enterClass);
      });
    });
  };
  const hasContent = stage.childElementCount > 0 || String(stage.textContent || '').trim().length > 0;
  if(!hasContent){
    mount();
    return;
  }
  clearClasses();
  requestAnimationFrame(() => {
    stage.classList.add(exitClass);
    setTimeout(mount, 180);
  });
}

function renderDeckMeta(total, mcq, osce, flash, saq, suffix){
  const el = document.getElementById('deck-meta');
  if(!el) return;
  const prev = {
    total: parseInt(el.querySelector('[data-meta="total"]')?.textContent) || 0,
    mcq: parseInt(el.querySelector('[data-meta="mcq"]')?.textContent) || 0,
    osce: parseInt(el.querySelector('[data-meta="osce"]')?.textContent) || 0,
    flash: parseInt(el.querySelector('[data-meta="flash"]')?.textContent) || 0,
    saq: parseInt(el.querySelector('[data-meta="saq"]')?.textContent) || 0,
  };
  el.innerHTML = '<strong><span data-meta="total">'+prev.total+'</span></strong> cards &nbsp;&middot;&nbsp; '
    + '<span data-meta="mcq">'+prev.mcq+'</span> MCQ &nbsp;&middot;&nbsp; '
    + '<span data-meta="osce">'+prev.osce+'</span> OSCE &nbsp;&middot;&nbsp; '
    + '<span data-meta="flash">'+prev.flash+'</span> Flash &nbsp;&middot;&nbsp; '
    + '<span data-meta="saq">'+prev.saq+'</span> SAQ &nbsp;&middot;&nbsp; '
    + suffix;
  animateCount(el.querySelector('[data-meta="total"]'), total);
  animateCount(el.querySelector('[data-meta="mcq"]'), mcq);
  animateCount(el.querySelector('[data-meta="osce"]'), osce);
  animateCount(el.querySelector('[data-meta="flash"]'), flash);
  animateCount(el.querySelector('[data-meta="saq"]'), saq);
}

function getVisibleCards(options = {}){
  return questionResolutionHelpers.getStudyEligibleCards({
    cards: Array.isArray(options.cards) ? options.cards : ALL_CARDS,
    lecture: options.lecture || 'all',
    dedupe: options.dedupe !== false,
  });
}

function getLectureOptions(){
  const metadataLectures = Array.isArray(CONTENT_METADATA.lectures)
    ? CONTENT_METADATA.lectures.filter(lecture => lecture && lecture.active !== false).map(lecture => lecture.name)
    : [];
  const primaryLectures = getVisibleCards({ dedupe:false })
    .map(c => String(c.lecture || '').trim())
    .filter(Boolean);
  const lecturePool = metadataLectures.length
    ? metadataLectures.concat(primaryLectures.filter(lecture => !metadataLectures.includes(lecture)))
    : primaryLectures;
  return [...new Set(lecturePool)].sort((a,b)=>String(a).localeCompare(String(b)));
}
function getExamOptions(){
  const metadataExams = Array.isArray(CONTENT_METADATA.exams)
    ? CONTENT_METADATA.exams.filter(exam => exam && exam.active !== false).map(exam => exam.label)
    : [];
  const cardExams = getVisibleCards({ dedupe:false }).map(c => String(c.exam || '').trim()).filter(Boolean);
  const fallbackExams = Array.isArray(questionResolutionHelpers.examNames) ? questionResolutionHelpers.examNames : [];
  return [...new Set([...metadataExams, ...cardExams, ...fallbackExams])].sort((a,b)=>String(a).localeCompare(String(b)));
}
const EXACT_SOURCE_GROUPS = [
  { key:'new_form', label:"New Form", match:(source)=>source.includes('new formative') },
  { key:'old_form', label:"Old Form", match:(source)=>source.includes('old formative') || source.includes("lecture q's (old") },
  { key:'prev_exam', label:"Prev Exam", match:(source)=>source.includes('previous exam') || source.includes('mid-term exam') },
  { key:'osce', label:"OSCE", match:(source)=>source.includes('osce') || source.includes('ospe') },
  { key:'lectures_2026', label:"2026 Lectures Q's", match:(source)=>source.includes("2026 lectures q's") }
];
function exactSourceGroupFor(source){
  const normalized = String(source || '').trim().toLowerCase();
  if(!normalized) return '';
  const group = EXACT_SOURCE_GROUPS.find(entry => entry.match(normalized));
  return group ? group.key : '';
}
function cardMatchesSourceGroup(card, groupKey){
  if(!card || !groupKey) return false;
  if(groupKey === 'lectures_2026'){
    const tags = getCardTagTexts(card);
    if(tags.includes("2026 Lectures Q's")) return true;
  }
  return exactSourceGroupFor(card.source || '') === groupKey;
}
function getExactSourceOptions(cards = getVisibleCards({ dedupe:false })){
  const counts = new Map();
  (Array.isArray(cards) ? cards : []).forEach(card => {
    EXACT_SOURCE_GROUPS.forEach(entry => {
      if(!cardMatchesSourceGroup(card, entry.key)) return;
      counts.set(entry.key, (counts.get(entry.key) || 0) + 1);
    });
  });
  return EXACT_SOURCE_GROUPS
    .map(entry => ({ source: entry.key, count: counts.get(entry.key) || 0 }))
    .filter(entry => entry.count > 0);
}
function exactSourceLabel(source){
  const key = String(source || '').trim();
  const group = EXACT_SOURCE_GROUPS.find(entry => entry.key === key);
  return group ? group.label : key || 'Unknown';
}
function getCardTagTexts(card){
  const tags = Array.isArray(card?.tags) ? card.tags : [];
  return tags.map(tag => {
    if(typeof tag === 'string') return tag;
    if(tag && typeof tag === 'object') return String(tag.txt || tag.label || tag.name || '').trim();
    return '';
  }).filter(Boolean);
}

function exactSourceTabClass(source){
  if(source === 'new_form') return 'ftab-new';
  if(source === 'prev_exam') return 'ftab-prev';
  if(source === 'osce') return 'ftab-osce';
  if(source === 'lectures_2026') return 'ftab-new';
  return 'ftab-old';
}
function normalizeLectureFilter(value){
  if(value == null) return 'all';
  const normalized = String(value).trim();
  if(!normalized || normalized.toLowerCase() === 'all') return 'all';
  const resolutionHelper = questionResolutionHelpers.normalizeLectureName(normalized);
  if(resolutionHelper) return resolutionHelper;
  return getLectureOptions().find(lecture => String(lecture) === normalized) || normalized;
}
function shuffleArray(array){
  const copy = Array.isArray(array) ? array.slice() : [];
  for(let i=copy.length-1;i>0;i--){
    const j=Math.floor(Math.random()*(i+1));
    [copy[i],copy[j]]=[copy[j],copy[i]];
  }
  return copy;
}
function filterCardsByLecture(cards, lectureFilter){
  const lecture = normalizeLectureFilter(lectureFilter);
  if(lecture === 'all') return Array.isArray(cards) ? cards.slice() : [];
  return (Array.isArray(cards) ? cards : []).filter(card => questionResolutionHelpers.cardHasLectureAssociation(card, lecture));
}
function filterQuestionsByLecture(questionElements, lectureFilter){
  return filterCardsByLecture(questionElements, lectureFilter);
}
function storedLecturePreference(){
  return normalizeLectureFilter(localStorage.getItem(PRACTICE_LECTURE_KEY) || 'all');
}
function storedRandomMode(){
  const raw = localStorage.getItem(RANDOM_MODE_KEY);
  return raw === null ? true : raw !== 'false';
}
function persistPracticePreferences(){
  try{
    localStorage.setItem(PRACTICE_LECTURE_KEY, normalizeLectureFilter(filterState.lecture || 'all'));
    localStorage.setItem(RANDOM_MODE_KEY, String(!!randomMode));
  }catch(e){}
}
function syncSidebarSelection(){
  document.querySelectorAll('.sb-item[data-k]').forEach(el=>{
    const isActive = !!filterState.lecture && el.dataset.k===filterState.lecture;
    el.classList.toggle('active', isActive);
    const sub=el.querySelector('.s-subtabs');
    if(!sub) return;
    sub.querySelectorAll('.s-stab').forEach(b=>b.classList.remove('on'));
    if(!isActive) return;
    const targetType = filterState.type || 'all';
    const btn = Array.from(sub.querySelectorAll('.s-stab')).find(b=>String(b.textContent||'').trim().toUpperCase().startsWith(targetType.toUpperCase()));
    if(btn) btn.classList.add('on');
    else if(sub.querySelector('.s-stab')) sub.querySelector('.s-stab').classList.add('on');
  });
}
function syncPracticeControls(){
  const select=document.getElementById('practice-lecture-select');
  if(select){
    const options=['<option value="all">All Lectures</option>'].concat(getLectureOptions().map(function(lecture){return '<option value="'+esc(lecture)+'">'+esc2(lecture)+'</option>'; }));
    select.innerHTML=options.join('');
    select.value=normalizeLectureFilter(filterState.lecture || 'all');
  }
  const toggle=document.getElementById('practice-random-toggle');
  if(toggle) toggle.checked=!!randomMode;
}
function syncAllFilterUI(){
  document.querySelectorAll('[data-f]').forEach(btn=>btn.classList.toggle('active', btn.dataset.f===filterState.exam));
  document.querySelectorAll('[data-src]').forEach(btn=>btn.classList.toggle('active', btn.dataset.src===filterState.src));
  // Sync top bar type buttons
  document.querySelectorAll('[data-type]').forEach(b => {
    b.classList.toggle('active', b.dataset.type === filterState.type);
  });
  syncSidebarSelection();
  // Sync sidebar subtabs for active lecture
  if (filterState.lecture) {
    const sid = 'sub_' + filterState.lecture.replace(/[^a-z0-9]/gi,'_');
    const sub = document.getElementById(sid);
    if (sub) {
      sub.querySelectorAll('.s-stab').forEach(b => {
        const t = b.dataset?.lectype || 'all';
        b.classList.toggle('on', filterState.type ? t === filterState.type : t === 'all');
      });
    }
  }
  syncPracticeControls();
  updateFilterStatus();
}
function setFilters(patch, config){
  const options = config || {};
  const triggerRender = options.triggerRender !== false;
  Object.assign(filterState, patch);
  syncAllFilterUI();
  persistPracticePreferences();
  if(triggerRender) applyFilter();
}
function updateFilterStatus() {
  const bar = document.getElementById('filter-status');
  const chips = document.getElementById('fstatus-chips');
  if(!bar || !chips) return;
  const active = [];

  if (filterState.exam !== 'all')
    active.push({ label: '?? ' + filterState.exam.toUpperCase(), clear: () => setFilters({ exam: 'all' }) });
  if (filterState.lecture)
    active.push({ label: '?? ' + filterState.lecture, clear: () => setFilters({ lecture: null, type: '' }) });
  if (filterState.src)
    active.push({ label: '?? ' + srcLabel(filterState.src), clear: () => setFilters({ src: '' }) });
  if (filterState.type)
    active.push({ label: '?? ' + filterState.type, clear: () => setFilters({ type: '' }) });

  bar.style.display = active.length ? 'flex' : 'none';
  chips.innerHTML = active.map((f, i) =>
    '<span class="fchip">' + f.label + '<span class="fchip-x" data-ci="' + i + '">?</span></span>'
  ).join('');

  chips.querySelectorAll('.fchip-x').forEach(x => {
    const i = parseInt(x.dataset.ci);
    x.addEventListener('click', (e) => { e.stopPropagation(); active[i].clear(); });
  });
}
function clearAllFilters() {
  setFilters({ exam: 'all', src: '', type: '', lecture: null });
}
function applyLectureSelection(value, opts={}){
  const lecture = normalizeLectureFilter(value);
  // Dropdown selection intentionally performs a clean reset.
  setFilters({ lecture: lecture === 'all' ? null : lecture, src: '', type: '' }, { triggerRender: opts.apply !== false });
}
function handlePracticeLectureChange(value){
  applyLectureSelection(value);
}
function handleRandomModeToggle(checked){
  randomMode = !!checked;
  persistPracticePreferences();
  syncPracticeControls();
  applyFilter();
}
function practiceSelectedLecture(){
  applyLectureSelection(document.getElementById('practice-lecture-select')?.value || 'all', { resetFilters:true });
  const label = filterState.lecture || 'All Lectures';
  const message = `Starting Practice: ${label} (${deck.length} cards)`;
  if(window.SRS_UI && typeof window.SRS_UI.toast === 'function') window.SRS_UI.toast(message);
}
window.OBG_QB_Utils = {
  shuffleArray,
  filterCardsByLecture,
  filterQuestionsByLecture,
  normalizeLectureFilter,
  getVisibleCards,
  getSelectedLecture: () => normalizeLectureFilter(filterState.lecture || 'all'),
  setSelectedLecture: (lecture) => applyLectureSelection(lecture),
  isRandomModeEnabled: () => !!randomMode,
  ...questionResolutionHelpers
};

// â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ
// SOURCE LABEL
// â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ
function srcLabel(s){
  const m = {
    'old_formative':'Old Formative','new_formative':'New Formative',
    'previous_exam':'Previous Exam','osce':'OSCE/OSPE','extra_from_bank':'Extra (Bank)',
    'unknown':'Unknown'
  };
  for(let k in m){ if(s && s.toLowerCase().includes(k.replace('_',' ').split('_')[0])) return m[k]; }
  return m[s] || s || 'Unknown';
}
function srcClass(s){
  if(!s) return 'src-old';
  const sl = s.toLowerCase();
  if(sl.includes('new')) return 'src-new';
  if(sl.includes('old')) return 'src-old';
  if(sl.includes('prev') || sl.includes('exam')) return 'src-prev';
  if(sl.includes('osce') || sl.includes('ospe')) return 'src-osce';
  if(sl.includes('extra')) return 'src-extra';
  return 'src-old';
}

// â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ
// FILTERS
// â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ
function setFilter(btn, f){
  setFilters({ exam: f, lecture: null, src: '', type: '' });
}
function setSrcFilter(btn){
  const src = btn.dataset.src;
  setFilters({ src: filterState.src === src ? '' : src });
}
function setTypeFilter(btn){
  const t = btn.dataset.type;
  setFilters({ type: filterState.type === t ? '' : t });
}
function setExactSourceFilter(){ return; }
function runLectureSwitch(callback, activeItem){
  const container = document.querySelector('.main') || document.getElementById('stage-wrap');
  const finish = () => {
    if(activeItem){
      activeItem.classList.remove('lec-highlight');
      void activeItem.offsetWidth;
      activeItem.classList.add('lec-highlight');
      setTimeout(() => activeItem.classList.remove('lec-highlight'), 400);
    }
  };
  if(!container){
    callback();
    finish();
    return;
  }
  container.classList.add('lec-switching');
  requestAnimationFrame(() => {
    setTimeout(() => {
      callback();
      container.classList.remove('lec-switching');
      finish();
    }, 160);
  });
}
function setSL(k){
  const el=document.querySelector('.sb-item[data-k="'+k+'"]');
  runLectureSwitch(function(){ setFilters({ lecture: k, type: '' }); }, el);
}
function setST(e,k,t){
  e.stopPropagation();
  const activeItem=document.querySelector('.sb-item[data-k="'+k+'"]');
  runLectureSwitch(function(){ setFilters({ lecture: k, type: t === 'all' ? '' : t }); }, activeItem);
}
function applyFilter(){
  pendingCardDirection = 'next';
  let d=getVisibleCards({ dedupe:false });
  if(filterState.exam!=='all') d=d.filter(c=>String(c.exam||'')===filterState.exam);
  if(filterState.src) d=d.filter(c=>exactSourceGroupFor(c.source||'')===filterState.src || (filterState.src==='lectures_2026' && getCardTagTexts(c).includes("2026 Lectures Q's")));
  if(filterState.type) d=d.filter(c=>c.cardType===filterState.type);
  if(filterState.lecture) d=filterCardsByLecture(d, filterState.lecture);
  d=questionResolutionHelpers.getStudyEligibleCards({cards:d, lecture:filterState.lecture || 'all', dedupe:true});
  if(randomMode) d=shuffleArray(d);
  loadDeck(d);
}
function loadDeck(d){
  deck=d; idx=0; flipped=false; reviewed=0;
  scores={again:0,good:0,easy:0}; mcqRes={correct:0,wrong:0};
  osceSubIdx={};
  let title='All Questions';
  if(filterState.lecture) title=filterState.lecture+(filterState.type?' - '+filterState.type:'');
  else if(filterState.exam!=='all') title=filterState.exam;
  if(filterState.src) title+=' | '+srcLabel(filterState.src);
  if(filterState.type) title+=' | '+filterState.type;
  document.getElementById('deck-title').textContent=title;
  const nm=d.filter(c=>c.cardType==='MCQ').length;
  const no=d.filter(c=>c.cardType==='OSCE').length;
  const nf=d.filter(c=>c.cardType==='FLASHCARD').length;
  const ns=d.filter(c=>c.cardType==='SAQ').length;
  const lectureNote = filterState.lecture ? ` &nbsp;|&nbsp; Lecture filter: ${esc2(filterState.lecture)}` : '';
  renderDeckMeta(d.length, nm, no, nf, ns, (randomMode ? 'Randomized order' : 'Sequential order') + lectureNote);
  syncPracticeControls();
}
function shuffleDeck(){
  deck=shuffleArray(deck);
  idx=0; flipped=false; renderCard(); updateNav();
}
function resetDeck(){ applyFilter(); }

// â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ
// RENDER
// â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ
function renderCard(){
  const stage=document.getElementById('card-stage');
  if(!stage) return;
  let newHTML='';
  if(!deck.length){
    newHTML='<div class="empty"><h3>No cards match</h3><p>Try a different filter.</p></div>';
    transitionCard(newHTML, pendingCardDirection);
    document.getElementById('btn-flip').style.display='none'; return;
  }
  document.getElementById('btn-flip').style.display='';
  const c=deck[idx]; flipped=false;
  if(c.unresolvedStub){
    newHTML=renderUnresolvedStub(c);
    transitionCard(newHTML, pendingCardDirection);
    const fb=document.getElementById('btn-flip');
    fb.textContent='Unavailable';
    fb.disabled=true;
    updateProgress();
    return;
  }
  document.getElementById('nav-ctr').textContent=(idx+1)+' / '+deck.length;
  
  if(c.cardType==='MCQ') newHTML=renderMCQ(c);
  else if(c.cardType==='OSCE') newHTML=renderOSCE(c);
  else if(c.cardType==='FLASHCARD') newHTML=renderFlipCard(c,'FLASHCARD');
  else if(c.cardType==='SAQ') newHTML=renderFlipCard(c,'SAQ');
  transitionCard(newHTML, pendingCardDirection);
  
  const fb=document.getElementById('btn-flip');
  if(c.cardType==='MCQ'){
    fb.textContent='Select Answer'; fb.disabled=true;
  } else {
    fb.textContent='Flip'; fb.disabled=false;
    fb.onclick=flipCard;
  }
  updateProgress();
}

function renderInlineNote(c){
  if(!c || !c.note) return '';
  const note = String(c.note).trim();
  if(!note) return '';
  const meaningful = note.replace(/[\s?!.,;:()\-–—]/g, '');
  if(!meaningful.length) return '';
  return `<div class="card-note" dir="auto"><strong>Note:</strong> ${mdBold(esc2(note))}</div>`;
}

function renderQuestionMedia(c){
  const image = String(c?.image || '').trim();
  const alt = esc(c?.imageAlt || 'Question image');
  if(image){
    return `<div class="question-media"><img src="${esc(image)}" style="max-width:100%;max-height:360px;border-radius:12px;margin:10px auto 14px;display:block;box-shadow:0 8px 24px rgba(0,0,0,.12);background:#fff" alt="${alt}">${c?.imageAlt?`<div style="text-align:center;font-size:.76rem;color:#64748b;margin-top:-4px;margin-bottom:12px">${esc2(c.imageAlt)}</div>`:''}</div>`;
  }
  if(c?.imagePlaceholder){
    return `<div class="img-ph" dir="auto">${esc2(c.imagePlaceholderText||'Image')}</div>`;
  }
  return '';
}

function renderMCQ(c){
  const tags=(c.displayTags||c.tags||[]).map(t=>`<span class="tag ${t.cls}">${esc2(t.txt)}</span>`).join('');
  const srcBadge=`<span class="src-badge ${srcClass(c.source)}">${srcLabel(c.source)}</span>`;
  const answerKey = c.displayAnswer || c.ans || '';
  const choices=(c.displayChoices||c.choices||[]).map((ch,i)=>{
    const l=String.fromCharCode(65+i);
    return `<button class="choice-btn" data-l="${l}" onclick="pick(this,'${l}','${answerKey}')">
      <span class="c-letter" id="ci${l}_${c.id}">${l}</span>
      <span dir="auto">${esc2(ch)}</span><span class="c-icon" id="icon${l}_${c.id}"></span>
    </button>`;
  }).join('');
  const imgPh = renderQuestionMedia(c);
  const extraBanner = c._extra ? `<div class="extra-banner">This question is from the study bank (not in printed source)</div>` : '';
  return `<div class="mcq-card">
  <div class="mcq-hdr">
    <div class="mcq-badge">
      <span class="mcq-qn">${esc2(c.num||'')}</span>
      <span class="mcq-tag-b">MCQ</span>
      ${srcBadge}
    </div>
    <div class="mcq-lec">${esc2(c.lecture||'')}${c.doctor?` &nbsp;آ·&nbsp; ${esc2(c.doctor)}`:''}</div>
  </div>
  ${imgPh}${extraBanner}
  <div class="mcq-stem" dir="auto">${mdBold(esc2(c.displayStem||c.q||''))}</div>
  ${renderInlineNote(c)}
  ${tags?`<div class="mcq-tags">${tags}</div>`:''}
  <div class="mcq-choices">${choices}</div>
  <div class="mcq-result" id="mcq-res-${c.id}"></div>
  <div class="mcq-footer">
    <div class="rate-btns" id="rate-btns-${c.id}" style="display:none">
      <button class="rate-btn rb-again" onclick="rate('again')">Again</button>
      <button class="rate-btn rb-good" onclick="rate('good')">Good</button>
      <button class="rate-btn rb-easy" onclick="rate('easy')">Easy</button>
    </div>
    <span style="font-size:.71rem;color:#6b7280" id="mcq-hint-${c.id}">Click a choice to answer</span>
  </div>
</div>`;
}

function renderOSCE(c){
  if(!osceSubIdx[c.id]) osceSubIdx[c.id]=0;
  const subIdx = osceSubIdx[c.id]||0;
  const subs = c.subParts||[];
  const cur = subs[subIdx]||{};
  const results = osceResults[c.id]||{};
  
  const srcBadge=`<span class="src-badge ${srcClass(c.source)}">${srcLabel(c.source)}</span>`;
  const extraBanner = c._extra ? `<div class="extra-banner">From study bank (not in printed source)</div>` : '';
  
  // Progress dots
  const dots = subs.map((s,i)=>{
    let cls='osce-dot';
    if(results[i]==='correct') cls+=' answered-ok';
    else if(results[i]==='wrong') cls+=' answered-ng';
    else if(i===subIdx) cls+=' current';
    return `<div class="${cls}" onclick="jumpOSCESub(${i})">${i+1}</div>`;
  }).join('');
  
  // Current sub question
  let subContent='';
  if(subs.length>1 || (subs.length===1 && subs[0].q)){
    // Sub-question header
    const subQ = cur.q||'';
    const subQm = subQ.match(/Q\d+\.\d+[\.\s]*(.*)/);
    const subQText = subQm ? subQm[1] : subQ;
    subContent = subQ ? `<div class="osce-sub-hdr" dir="auto">Part ${subIdx+1}: ${esc2(subQText)}</div>` : '';
  }
  
  // Choices for current sub
  const choices = (cur.choices||[]).map((ch,i)=>{
    const l=String.fromCharCode(65+i);
    const cid=`${c.id}_${subIdx}`;
    return `<button class="choice-btn" data-l="${l}" onclick="pickOSCE(this,'${l}','${cur.ans||''}','${c.id}',${subIdx})">
      <span class="c-letter" id="oci${l}_${cid}">${l}</span>
      <span>${esc2(ch)}</span><span class="c-icon" id="oicon${l}_${cid}"></span>
    </button>`;
  }).join('');
  
  const imgPh = renderQuestionMedia(c);
  
  const tags=(c.displayTags||c.tags||[]).map(t=>`<span class="tag ${t.cls}">${esc2(t.txt)}</span>`).join('');
  return `<div class="osce-card">
  <div class="osce-hdr">
    <div class="mcq-badge">
      <span class="mcq-qn">${esc2(c.num||'')}</span>
      <span class="mcq-tag-b" style="background:rgba(255,255,255,.15)">OSCE</span>
      ${srcBadge}
      ${subs.length>1?`<span class="mcq-tag-b" style="background:rgba(255,255,255,.15)">${subs.length} parts</span>`:''}
    </div>
    <div class="mcq-lec">${esc2(c.lecture||'')}</div>
  </div>
  ${imgPh}${extraBanner}
  <div class="osce-stem" dir="auto">${mdBold(esc2(c.displayStem||c.stem||c.q||''))}</div>
  ${renderInlineNote(c)}
  ${tags?`<div class="mcq-tags">${tags}</div>`:''}
  ${subs.length>1?`<div class="osce-progress">${dots}</div>`:''}
  ${subContent}
  <div class="mcq-choices" id="osce-choices-${c.id}">${choices}</div>
  <div class="mcq-result" id="osce-res-${c.id}_${subIdx}"></div>
  <div class="mcq-footer">
    ${subs.length>1?`<div style="display:flex;gap:8px">
      <button class="btn btn-out" style="font-size:.74rem;padding:4px 10px" onclick="prevOSCESub('${c.id}')" ${subIdx===0?'disabled':''}>Prev Part ${subIdx}</button>
      <button class="btn btn-out" style="font-size:.74rem;padding:4px 10px" onclick="nextOSCESub('${c.id}')" ${subIdx>=subs.length-1?'disabled':''}>Part ${subIdx+2} Next</button>
    </div>`:'<div></div>'}
    <div class="rate-btns" id="osce-rate-${c.id}" style="display:none">
      <button class="rate-btn rb-again" onclick="rate('again')">Again</button>
      <button class="rate-btn rb-good" onclick="rate('good')">Good</button>
      <button class="rate-btn rb-easy" onclick="rate('easy')">Easy</button>
    </div>
  </div>
</div>`;
}

function renderFlipCard(c, type){
  const srcBadge=`<span class="src-badge ${srcClass(c.source)}">${srcLabel(c.source)}</span>`;
  const tclass = type==='FLASHCARD'?'ttype-flash':'ttype-saq';
  const tname = type==='FLASHCARD'?'FLASH':'SAQ';
  const extraBanner = c._extra ? `<div class="extra-banner" style="text-align:center;margin:0 0 8px">From study bank</div>` : '';
  const tags=(c.displayTags||c.tags||[]).map(t=>`<span class="tag ${t.cls}">${esc2(t.txt)}</span>`).join('');
  const media = renderQuestionMedia(c);
  
  // FRONT
  const front=`<div class="flip-front card-face card-front" onclick="flipCard()">
  <div class="cf-body">
    <div class="q-badge"><span>${esc2(c.num||'')}</span><span class="ttype ${tclass}">${tname}</span><span>${esc2(c.lecture||'')}</span></div>
    <div class="q-lec">${srcBadge}</div>
    ${extraBanner}
    <div class="q-text" dir="auto">${mdBold(esc2(c.displayStem||c.q||''))}</div>
    ${media}
    ${renderInlineNote(c)}
    ${tags?`<div class="mcq-tags">${tags}</div>`:''}
    <div class="q-hint">Click to reveal answer</div>
  </div>
  <div class="flip-cta">Click card or press <strong>Space</strong> to flip</div>
</div>`;
  
  // BACK
  let backContent = '';
  if(type==='FLASHCARD'){
    backContent=`<div class="ans-hdr">
  <div class="ans-hdr-q">${esc2(c.displayStem||c.q||'')}</div>
  <span class="src-badge ${srcClass(c.source)}">${srcLabel(c.source)}</span>
</div>
<div class="ans-body"><div class="ans-text">${mdBold(esc2(c.displayAnswer||c.a||''))}</div></div>`;
  } else {
    backContent=`<div class="ans-hdr">
  <div class="ans-hdr-q">${esc2(c.displayStem||c.q||'')}</div>
  <span class="src-badge ${srcClass(c.source)}">${srcLabel(c.source)}</span>
</div>
<div class="ans-body"><div class="ans-text">${mdBold(esc2(c.displayAnswer||c.a||'Rate yourself after recalling the answer.'))}</div></div>`;
  }
  
  const back=`<div class="flip-back card-face card-back card-back-flash">
  ${backContent}
  <div class="ans-footer">
    <div class="rate-btns">
      <button class="rate-btn rb-again" onclick="rate('again')">Again</button>
      <button class="rate-btn rb-good" onclick="rate('good')">Good</button>
      <button class="rate-btn rb-easy" onclick="rate('easy')">Easy</button>
    </div>
    <span style="font-size:.71rem;color:#6b7280">1/2/3 to rate</span>
  </div>
</div>`;
  
  return `<div class="flip-scene card-stage"><div class="flip-card-inner" id="cflip">${front}${back}</div></div>`;
}

// â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ
// MCQ INTERACTION
// â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ
function renderUnresolvedStub(c){
  const tags=(c.displayTags||[]).map(t=>`<span class="tag ${t.cls}">${esc2(t.txt)}</span>`).join('');
  return `<div class="mcq-card">
  <div class="mcq-hdr">
    <div class="mcq-badge">
      <span class="mcq-qn">${esc2(c.num||'')}</span>
      <span class="mcq-tag-b">REFERENCE</span>
      <span class="src-badge ${srcClass(c.source)}">${srcLabel(c.source)}</span>
    </div>
    <div class="mcq-lec">${esc2(c.lecture||'')}</div>
  </div>
  <div class="mcq-stem" dir="auto">${mdBold(esc2(c.displayStem||c.q||''))}</div>
  ${tags?`<div class="mcq-tags">${tags}</div>`:''}
  <div class="mcq-result" style="display:block;background:#fff7ed;color:#9a3412;border:1px solid #fdba74">
    This reference stub could not be resolved to a full question body, so it is excluded from normal study queues.
  </div>
</div>`;
}

function pick(btn, chosen, correct){
  if(btn.classList.contains('locked')) return;
  const c=deck[idx]; if(!c) return;
  document.querySelectorAll('.choice-btn').forEach(b=>b.classList.add('locked'));
  const ok=(chosen===correct);
  btn.classList.add(ok?'chosen-correct':'chosen-wrong');
  document.getElementById('ci'+chosen+'_'+c.id).textContent=ok?'OK':'X';
  if(!ok && correct){
    const cb=document.querySelector('.choice-btn[data-l="'+correct+'"]');
    if(cb){cb.classList.add('reveal-correct');
      const ci=document.getElementById('ci'+correct+'_'+c.id);
      if(ci) ci.textContent='OK';
    }
  }
  const res=document.getElementById('mcq-res-'+c.id);
  if(res){
    if(ok){res.className='mcq-result ok';res.textContent='Correct!';mcqRes.correct++;}
    else{res.className='mcq-result ng';res.innerHTML='Incorrect - Answer: <strong>'+correct+'</strong>';mcqRes.wrong++;}
  }
  const hint=document.getElementById('mcq-hint-'+c.id);
  if(hint) hint.style.display='none';
  const rb=document.getElementById('rate-btns-'+c.id);
  if(rb) rb.style.display='flex';
  const fb=document.getElementById('btn-flip');
  if(fb){fb.disabled=false;fb.onclick=function(){rate('good');};}
  flipped=true; reviewed++; updateStats(); updateProgress();
  if(deck[idx]) mcqAnswers[deck[idx].id]=chosen; saveProgress();
}

function pickOSCE(btn, chosen, correct, cardId, subIdx){
  if(btn.classList.contains('locked')) return;
  document.querySelectorAll('#osce-choices-'+cardId+' .choice-btn').forEach(b=>b.classList.add('locked'));
  const cid=cardId+'_'+subIdx;
  const ok=(chosen===correct);
  btn.classList.add(ok?'chosen-correct':'chosen-wrong');
  document.getElementById('oci'+chosen+'_'+cid).textContent=ok?'OK':'X';
  if(!ok && correct){
    const cb=document.querySelector('#osce-choices-'+cardId+' .choice-btn[data-l="'+correct+'"]');
    if(cb){cb.classList.add('reveal-correct');
      const ci=document.getElementById('oci'+correct+'_'+cid); if(ci) ci.textContent='OK';
    }
  }
  const res=document.getElementById('osce-res-'+cid);
  if(res){
    if(ok){res.className='mcq-result ok';res.textContent='Correct!';mcqRes.correct++;}
    else{res.className='mcq-result ng';res.innerHTML='Incorrect - Answer: <strong>'+correct+'</strong>';mcqRes.wrong++;}
  }
  if(!osceResults[cardId]) osceResults[cardId]={};
  osceResults[cardId][subIdx]=ok?'correct':'wrong';
  flipped=true; reviewed++; updateStats(); updateProgress();
  
  // Show rate buttons if last sub
  const c=deck[idx]; if(!c) return;
  const subs=c.subParts||[];
  if(subIdx>=subs.length-1){
    const rb=document.getElementById('osce-rate-'+cardId);
    if(rb) rb.style.display='flex';
  }
}

function prevOSCESub(cardId){
  if(!osceSubIdx[cardId]) osceSubIdx[cardId]=0;
  if(osceSubIdx[cardId]>0){ osceSubIdx[cardId]--; renderCard(); }
}
function nextOSCESub(cardId){
  const c=deck[idx]; if(!c) return;
  const subs=c.subParts||[];
  if(!osceSubIdx[cardId]) osceSubIdx[cardId]=0;
  if(osceSubIdx[cardId]<subs.length-1){ osceSubIdx[cardId]++; renderCard(); }
}
function jumpOSCESub(i){
  const c=deck[idx]; if(!c) return;
  osceSubIdx[c.id]=i; renderCard();
}

// â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ
// FLIP / RATE / NAV
// â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ
function flipCard(){
  const cf=document.querySelector('.flip-card-inner');
  if(cf){ cf.classList.toggle('flipped'); flipped=!flipped;
    if(flipped){reviewed++;updateStats();updateProgress();}
  }
}
function rate(r){
  scores[r]=(scores[r]||0)+1;
  if(deck[idx]) flashRatings[deck[idx].id]=r; saveProgress();
  nextCard();
}
function nextCard(){ if(idx<deck.length-1){idx++;flipped=false;pendingCardDirection='next';renderCard();updateNav();saveProgress();}else{showScore();} }
function prevCard(){ if(idx>0){idx--;flipped=false;pendingCardDirection='prev';renderCard();updateNav();saveProgress();} }
function updateNav(){
  document.getElementById('btn-prev').disabled=idx<=0;
  document.getElementById('btn-next').disabled=idx>=deck.length-1;
  animateFractionText(document.getElementById('nav-ctr'), idx+1, deck.length);
}
function updateProgress(){
  const total=deck.length; if(!total) return;
  const pct=Math.round(reviewed/total*100);
  document.getElementById('prog-fill').style.width=pct+'%';
  document.getElementById('prog-txt').textContent=reviewed+' / '+total;
}

// â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ
// STATS
// â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ
function updateStats(){
  animateCount(document.getElementById('s-total'), deck.length);
  animateCount(document.getElementById('s-mcq'), deck.filter(c=>c.cardType==='MCQ').length);
  animateCount(document.getElementById('s-osce'), deck.filter(c=>c.cardType==='OSCE').length);
  animateCount(document.getElementById('s-flash'), deck.filter(c=>c.cardType==='FLASHCARD').length);
  animateCount(document.getElementById('s-saq'), deck.filter(c=>c.cardType==='SAQ').length);
  animateCount(document.getElementById('s-rev'), reviewed);
  const nm=deck.filter(c=>c.cardType==='MCQ'||c.cardType==='OSCE').length;
  const done=mcqRes.correct+mcqRes.wrong;
  document.getElementById('s-score').textContent=nm&&done?mcqRes.correct+'/'+done:'-';
}

// â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ
// COUNTS
// â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ
function updateCounts(){
  const ids={all:0,mcq:0,osce:0,flash:0,saq:0};
  const examCounts={};
  const srcCounts={old_form:0,new_form:0,prev_exam:0,osce:0,lectures_2026:0};
  const tagCounts={};
  getVisibleCards({ dedupe:false }).forEach(c=>{
    ids.all++;
    const examKey=String(c.exam||'').trim() || 'mid';
    examCounts[examKey]=(examCounts[examKey]||0)+1;
    if(c.cardType==='MCQ')       ids.mcq++;
    if(c.cardType==='OSCE')      ids.osce++;
    if(c.cardType==='FLASHCARD') ids.flash++;
    if(c.cardType==='SAQ')       ids.saq++;
    EXACT_SOURCE_GROUPS.forEach(entry => {
      if(cardMatchesSourceGroup(c, entry.key)) srcCounts[entry.key]++;
    });
    getCardTagTexts(c).forEach(tag => {
      tagCounts[tag]=(tagCounts[tag]||0)+1;
    });
  });
  Object.entries(ids).forEach(([k,v])=>{const el=document.getElementById('c-'+k);if(el)animateCount(el, v);});
  Object.entries(examCounts).forEach(([k,v])=>{
    const key = k.toLowerCase().replace(/[^a-z0-9]+/g,'-');
    const el=document.getElementById('c-exam-'+key);
    if(el) animateCount(el, v);
  });
  const _s=(id,v)=>{const e=document.getElementById(id);if(e)animateCount(e, v);};
  _s('c-src-old',srcCounts.old_form);
  _s('c-src-new',srcCounts.new_form);
  _s('c-src-prev',srcCounts.prev_exam);
  _s('c-src-osce',srcCounts.osce);
  _s('c-src-2026',srcCounts.lectures_2026);
  _s('c-mcq',ids.mcq);
  _s('c-osce',ids.osce);
  _s('c-flash',ids.flash);
  _s('c-saq-t',ids.saq);
  Object.entries(tagCounts).forEach(([tag,v])=>{
    const key=tag.toLowerCase().replace(/[^a-z0-9]+/g,'-');
    const el=document.getElementById('c-tag-'+key);
    if(el) animateCount(el, v);
  });
}

// â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ
// SIDEBAR
// â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ
function buildSidebar(){
  const list=document.getElementById('sb-list');
  const visibleCards=getVisibleCards({ dedupe:false });
  const lectures=getLectureOptions();
  let html='';
  lectures.forEach(lec=>{
    const cards=visibleCards.filter(c=>questionResolutionHelpers.cardHasLectureAssociation(c, lec));
    const nTotal=cards.length;
    const nM=cards.filter(c=>c.cardType==='MCQ').length;
    const nO=cards.filter(c=>c.cardType==='OSCE').length;
    const nF=cards.filter(c=>c.cardType==='FLASHCARD').length;
    const nS=cards.filter(c=>c.cardType==='SAQ').length;
    const hasNotes=NOTES[lec]&&NOTES[lec].length>0;
    const sid='sub_'+lec.replace(/[^a-z0-9]/gi,'_');
    const subtabs=[];
    subtabs.push(`<button class="s-stab on" data-lectype="all" onclick="setST(event,'${esc(lec)}','all')">All(${nTotal})</button>`);
    if(nM) subtabs.push(`<button class="s-stab mcq-t" data-lectype="MCQ" onclick="setST(event,'${esc(lec)}','MCQ')">MCQ(${nM})</button>`);
    if(nO) subtabs.push(`<button class="s-stab osce-t" data-lectype="OSCE" onclick="setST(event,'${esc(lec)}','OSCE')">OSCE(${nO})</button>`);
    if(nF) subtabs.push(`<button class="s-stab flash-t" data-lectype="FLASHCARD" onclick="setST(event,'${esc(lec)}','FLASHCARD')">Flash(${nF})</button>`);
    if(nS) subtabs.push(`<button class="s-stab saq-t" data-lectype="SAQ" onclick="setST(event,'${esc(lec)}','SAQ')">SAQ(${nS})</button>`);
    if(hasNotes) subtabs.push(`<button class="notes-btn" onclick="openNotes('${esc(lec)}',event)">Notes</button>`);
    html+=`<li class="sb-item" data-k="${esc(lec)}" onclick="setSL('${esc(lec)}')">
      <div class="s-main">
        <span class="s-name">${esc2(lec)}</span>
        <span class="s-cnt" data-target-count="${nTotal}">0</span>
      </div>
      <div class="s-subtabs" id="${sid}">${subtabs.join('')}</div>
    </li>`;
  });
  list.innerHTML=html;
  animateSidebarCounts();
}

// â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ
// NOTES
// â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ
function openNotes(lec, e){
  e.stopPropagation();
  const notes=(NOTES[lec]||[]).join('\n\n---\n\n');
  document.getElementById('notes-title').textContent='Notes: '+lec;
  document.getElementById('notes-content').textContent=notes||'No notes.';
  document.getElementById('notes-modal').classList.add('visible');
}
function closeNotes(){ document.getElementById('notes-modal').classList.remove('visible'); }

// â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ
// SCORE
// â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ
function showScore(){
  const nm=deck.filter(c=>c.cardType==='MCQ'||c.cardType==='OSCE').length;
  const ns=deck.filter(c=>c.cardType==='FLASHCARD'||c.cardType==='SAQ').length;
  const pct=nm?(mcqRes.correct/nm):0;
  document.getElementById('sc-emoji').textContent=pct>.75?'🏆':pct>.5?'👍':'💪';
  document.getElementById('sc-sub').textContent=deck.length+' cards reviewed ('+nm+' MCQ/OSCE | '+ns+' Flash/SAQ)';
  let g='';
  if(nm) g+=`<div class="sc-stat ok"><div class="sc-n">${mcqRes.correct}</div><div class="sc-l">Correct</div></div>
    <div class="sc-stat ng"><div class="sc-n">${mcqRes.wrong}</div><div class="sc-l">Wrong</div></div>`;
  if(ns) g+=`<div class="sc-stat ag"><div class="sc-n">${scores.again||0}</div><div class="sc-l">Again</div></div>
    <div class="sc-stat gd"><div class="sc-n">${scores.good||0}</div><div class="sc-l">Good</div></div>
    <div class="sc-stat ez"><div class="sc-n">${scores.easy||0}</div><div class="sc-l">Easy</div></div>`;
  document.getElementById('sc-grid').innerHTML=g;
  document.getElementById('score-overlay').classList.add('visible');
}
function closeScore(){ document.getElementById('score-overlay').classList.remove('visible'); }

// â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ
// KEYBOARD
// â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ
document.addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA') return;
  const c=deck[idx]; if(!c) return;
  if(e.code==='Space'&&(c.cardType==='FLASHCARD'||c.cardType==='SAQ')){e.preventDefault();flipCard();}
  if(e.code==='ArrowRight') nextCard();
  if(e.code==='ArrowLeft')  prevCard();
  if(flipped){ if(e.key==='1')rate('again'); if(e.key==='2')rate('good'); if(e.key==='3')rate('easy'); }
});

// â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ
// HELPERS
// â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ
function mdBold(s){ return String(s).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>'); }
function esc(s){ return String(s).replace(/'/g,"&#39;").replace(/"/g,"&quot;"); }
function esc2(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ
// â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ
// LOCAL STORAGE â€” PROGRESS
// â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ
const LS_KEY = 'obg_progress_v1';

function saveProgress(){
  const sidebar = document.getElementById('sidebar') || document.querySelector('.sidebar');
  const data = {
    mcqAnswers, osceResults, flashRatings,
    reviewed, scores, mcqRes, idx,
    filterState,
    sidebarScrollTop: sidebar ? sidebar.scrollTop : 0
  };
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch(e){}
}

function loadProgress(){
  try {
    const raw = localStorage.getItem(LS_KEY);
    randomMode = storedRandomMode();
    let sidebarScrollTop = 0;
    if(raw){
      const d = JSON.parse(raw);
      mcqAnswers   = d.mcqAnswers   || {};
      osceResults  = d.osceResults  || {};
      flashRatings = d.flashRatings || {};
      Object.assign(filterState, d.filterState || {
        exam: d.activeFilter || 'all',
        src: d.activeSrc || '',
        type: d.activeType || '',
        lecture: d.activeLec || null,
      });
      reviewed     = d.reviewed     || 0;
      scores       = d.scores       || {again:0, good:0, easy:0};
      mcqRes       = d.mcqRes       || {correct:0, wrong:0};
      idx          = d.idx || 0;
      sidebarScrollTop = d.sidebarScrollTop || 0;
    }
    const preferredLecture = storedLecturePreference();
    if(preferredLecture === 'all'){
      filterState.lecture = null;
    }else{
      filterState.lecture = preferredLecture;
    }
    renderExactSourceTabs();
    const _savedIdx = idx || 0; // capture BEFORE applyFilter resets idx to 0
    applyFilter();
    idx = Math.min(_savedIdx, Math.max(0, deck.length - 1)); // restore position
    syncAllFilterUI();
    renderCard(); updateNav(); updateStats(); updateProgress();
    if(sidebarScrollTop){
      const sidebar = document.getElementById('sidebar') || document.querySelector('.sidebar');
      if(sidebar) sidebar.scrollTop = sidebarScrollTop;
    }
  } catch(e){ console.warn('loadProgress failed', e); applyFilter(); }
}
function renderExamTabs(){
  const tabs=document.getElementById('exam-tabs');
  if(!tabs) return;
  const exams=getExamOptions();
  const labelMap={mid:'Mid',paper1:'Paper 1',paper2:'Paper 2'};
  const html=[
    `<button class="ftab ${filterState.exam==='all'?'active':''}" data-f="all" onclick="setFilter(this,'all')">All <span class="cnt" id="c-all">0</span></button>`
  ].concat(exams.map(exam=>{
    const safe=String(exam).toLowerCase().replace(/[^a-z0-9]+/g,'-');
    const label=labelMap[exam] || exam;
    return `<button class="ftab ${filterState.exam===exam?'active':''}" data-f="${esc(exam)}" onclick="setFilter(this,'${esc(exam)}')">${esc2(label)} <span class="cnt" id="c-exam-${safe}">0</span></button>`;
  })).join('');
  tabs.innerHTML=html;
}
function renderExactSourceTabs(){ return; }

function clearProgress(){
  if(!confirm('Clear all saved progress?')) return;
  localStorage.removeItem(LS_KEY);
  mcqAnswers={}; osceResults={}; flashRatings={};
  reviewed=0; scores={again:0,good:0,easy:0}; mcqRes={correct:0,wrong:0};
  Object.assign(filterState,{ exam:'all', src:'', type:'', lecture:storedLecturePreference()==='all'?null:storedLecturePreference() });
  randomMode = storedRandomMode();
  syncAllFilterUI();
  renderExactSourceTabs();
  applyFilter();
}
// â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ
// INIT
// â•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گâ•گ
buildSidebar();
renderExamTabs();
renderExactSourceTabs();
try{ updateCounts(); }catch(e){ console.warn('updateCounts error',e); }
syncAllFilterUI();
loadProgress();
window.addEventListener('pagehide', saveProgress);

function showStats(){
  const all=getVisibleCards({ dedupe:false });
  const mcqAll=all.filter(c=>c.cardType==='MCQ');
  const flAll=all.filter(c=>c.cardType==='FLASHCARD'||c.cardType==='SAQ');
  let mcqC=0,mcqW=0;
  mcqAll.forEach(c=>{const a=mcqAnswers[c.id];const correct=c.displayAnswer||c.ans;if(a){if(a===correct)mcqC++;else mcqW++;}});
  const mcqU=mcqAll.length-mcqC-mcqW;
  let flA=0,flG=0,flE=0;
  flAll.forEach(c=>{const r=flashRatings[c.id];if(r==='again')flA++;else if(r==='good')flG++;else if(r==='easy')flE++;});
  const flU=flAll.length-flA-flG-flE;
  const total=Object.keys(mcqAnswers).length+Object.keys(flashRatings).length;
  document.getElementById('ss-total').textContent=total;
  document.getElementById('ss-correct').textContent=mcqC;
  document.getElementById('ss-wrong').textContent=mcqW;
  document.getElementById('ss-again').textContent=flA;
  document.getElementById('ss-good').textContent=flG;
  document.getElementById('ss-easy').textContent=flE;
  const mt=mcqAll.length||1;
  const _sw=(id,pct)=>{const e=document.getElementById(id);if(e)e.style.width=pct+'%';};
  _sw('ss-bc',mcqC/mt*100); _sw('ss-bw',mcqW/mt*100); _sw('ss-bu',mcqU/mt*100);
  const ft=flAll.length||1;
  _sw('ss-fa',flA/ft*100); _sw('ss-fg',flG/ft*100); _sw('ss-fe',flE/ft*100); _sw('ss-fu',flU/ft*100);
  const lecs=getLectureOptions();
  const cont=document.getElementById('ss-lecs');
  if(cont) cont.innerHTML='';
  lecs.forEach(lec=>{
    const lc=all.filter(c=>questionResolutionHelpers.cardHasLectureAssociation(c, lec));
    let ans=0;
    lc.forEach(c=>{
      if(c.cardType==='MCQ'&&mcqAnswers[c.id])ans++;
      else if((c.cardType==='FLASHCARD'||c.cardType==='SAQ')&&flashRatings[c.id])ans++;
      else if(c.cardType==='OSCE'&&osceResults[c.id]&&Object.keys(osceResults[c.id]).length)ans++;
    });
    const pct=Math.round(ans/lc.length*100);
    const row=document.createElement('div');
    row.className='st-bar-row';
    row.innerHTML='<span class="st-bar-name" title="'+lec+'">'+lec+'</span>'
      +'<div class="st-bar-wrap"><div class="st-bar-fill" style="width:'+pct+'%"></div></div>'
      +'<span class="st-bar-cnt">'+ans+'/'+lc.length+' ('+pct+'%)</span>';
    if(cont) cont.appendChild(row);
  });

  // Wrong questions list
  const wrongCards = getVisibleCards({ dedupe:false }).filter(c => c.cardType==='MCQ' && mcqAnswers[c.id] && mcqAnswers[c.id]!==((c.displayAnswer||c.ans)));
  const wList = document.getElementById('ss-wrong-list');
  const practiceBtn = document.getElementById('practice-wrong-btn');
  practiceBtn.textContent = wrongCards.length
    ? 'Practice ' + wrongCards.length + ' Wrong Question' + (wrongCards.length>1?'s':'')
    : 'No Wrong Answers Yet';
  practiceBtn.disabled = wrongCards.length === 0;
  wList.innerHTML = '';
  if(wrongCards.length === 0){
    wList.innerHTML = '<div class="wq-empty">No wrong answers yet - keep going!</div>';
  } else {
    wrongCards.forEach(c => {
      const yourAns  = mcqAnswers[c.id];
      const corrAns  = c.displayAnswer || c.ans;
      const choices  = c.displayChoices || c.choices || [];
      const yourTxt  = choices[yourAns.charCodeAt(0)-65] || yourAns;
      const corrTxt  = choices[corrAns.charCodeAt(0)-65] || corrAns;
      const stem     = (c.q || c.stem || '').substring(0, 120) + ((c.q||c.stem||'').length > 120 ? '...' : '');
      const div = document.createElement('div');
      div.className = 'wrong-q-item';
      div.title = 'Click to go to this question';
      div.innerHTML =
        '<div class="wq-num">' + c.num + ' | ' + c.cardType + '</div>' +
        '<div class="wq-lec">' + (c.lecture||'') + '</div>' +
        '<div class="wq-q">' + stem + '</div>' +
        '<div class="wq-ans">' +
          '<span class="wq-your">Your: ' + yourAns + ') ' + yourTxt.substring(0,60) + '</span>' +
          '<span class="wq-correct">Correct: ' + corrAns + ') ' + corrTxt.substring(0,60) + '</span>' +
        '</div>';
      div.onclick = () => { goToCard(c.id); };
      wList.appendChild(div);
    });
  }

  document.getElementById('stats-overlay').classList.add('visible');
}
function closeStats(){document.getElementById('stats-overlay').classList.remove('visible');}


function practiceWrong(){
  const wrongCards = questionResolutionHelpers.getStudyEligibleCards({
    cards: (randomMode ? shuffleArray(ALL_CARDS) : ALL_CARDS).filter(c => c.cardType==='MCQ' && mcqAnswers[c.id] && mcqAnswers[c.id]!==((c.displayAnswer||c.ans))),
    dedupe: true
  });
  if(!wrongCards.length) return;
  // Clear previous answers for these cards so they can be re-answered
  wrongCards.forEach(c => delete mcqAnswers[c.id]);
  saveProgress();
  // Load wrong cards as the new deck
  deck = wrongCards;
  idx = 0; flipped = false; reviewed = 0;
  scores = {again:0,good:0,easy:0}; mcqRes = {correct:0,wrong:0};
  setFilters({ lecture:null, exam:'all', src:'', type:'' }, { triggerRender:false });
  document.getElementById('deck-title').textContent = 'Practice: Wrong Questions (' + wrongCards.length + ')';
  closeStats();
  renderCard(); updateNav(); updateStats(); updateProgress();
}

function goToCard(cardId){
  // Find the card in ALL_CARDS and navigate to it
  let cardIdx = ALL_CARDS.findIndex(c=>c.id===cardId);
  if(cardIdx === -1) return;
  // Load all cards filtered to matching lecture
  let card = ALL_CARDS[cardIdx];
  if(card.unresolvedStub && card.canonicalSourceId){
    const fallback = questionResolutionHelpers.getRepresentativeForCanonical(card.canonicalSourceId, card.lecture);
    if(fallback){
      card = fallback;
      cardIdx = ALL_CARDS.findIndex(c=>c.id===card.id);
    }
  }
  setFilters({ lecture:card.lecture, exam:'all', src:'', type:'' }, { triggerRender:false });
  applyFilter();
  const deckIdx = deck.findIndex(c=>c.id===card.id || (c.canonicalSourceId && c.canonicalSourceId === card.canonicalSourceId));
  if(deckIdx !== -1){ idx = deckIdx; }
  persistPracticePreferences();
  syncSidebarSelection();
  syncPracticeControls();
  closeStats();
  renderCard(); updateNav(); updateStats(); updateProgress();
}


