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

const NOTES = {"Antenatal Care (ANC)":["Note 22.\nجه عليها اسئلة في الامتحان\nvery important note\n○ Immunizations: -\n→ Safe immunizations (include antigens from killed or inactivated organisms):\nInfluenza (all pregnant women in flu season).\nTetanus, diphtheria, pertussis (Tdap)\nHepatitis B (pre- and postexposure).\nHepatitis A (pre- and postexposure).\nPneumococcus (only high-risk women).\nMeningococcus (in unusual outbreaks).\nTyphoid (not routinely recommended).\n→ Unsafe immunizations (include antigens from live attenuated organisms):\nMMR (measles, mumps, rubella)\nPolio\nYellow fever\nVaricella","Note 23.\nجه عليها اسئلة في الامتحان\nvery important note\n• Daily dietary requirement Of a woman during pregnancy (2nd half)\nFood element\nPregnancy\nKilocalories\n2500\nProtein\n60 gm\nIron\n40 gm\nFolic acid\n400 μg\nCalcium\n1000 mg\nVitamin A\n6000 I.U."],"Cardiac Disorders & Anaemia with Pregnancy":["Important notes:\n*minimal level of Hb to allow delivery is\n10 gm/dl\n(جت في امتحان ساتة)\n*iron needed in pregnancy is\n27 mg/dl\n*anemia of chronic infection is\nnormocytic normochromic anemia\n*Iron absorption differs during pregnancy\n*There is threshold for iron absorption\n*Iron stores is 500 mg\n*Folic acid given in megaloblastic anemia"],"Normal Labour":["في الفورماتيف بتاعكم لأنه جه في امتحان سنة رابعة السنة الي فاتت حاولوا تتأكدوا من اجابة السؤال ده"]};

// ═══════════════════════════════════
// STATE
// ═══════════════════════════════════
let deck=[], idx=0, flipped=false, reviewed=0;
let scores={again:0,good:0,easy:0}, mcqRes={correct:0,wrong:0};
let activeFilter='all', activeSrc='', activeType='', activeLec=null, activeLecType='all';
let osceSubIdx = {};  // cardId -> current sub-question index
let osceResults = {}; // cardId -> {subIdx -> 'correct'|'wrong'|'unanswered'}
let mcqAnswers   = {};  // cardId -> chosen letter
let flashRatings = {};  // cardId -> 'again'|'good'|'easy'
const PRACTICE_LECTURE_KEY = 'obg_selected_lecture';
const RANDOM_MODE_KEY = 'obg_random_mode';
let randomMode = true;

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
  const allLectures = getVisibleCards({ dedupe:false })
    .flatMap(c => [c.lecture].concat(Array.isArray(c.alsoInLectures) ? c.alsoInLectures : []))
    .filter(Boolean);
  const fallbackLectures = Array.isArray(questionResolutionHelpers.lectureNames) ? questionResolutionHelpers.lectureNames : [];
  return [...new Set([...metadataLectures, ...allLectures, ...fallbackLectures])].sort((a,b)=>String(a).localeCompare(String(b)));
}
function getExamOptions(){
  const metadataExams = Array.isArray(CONTENT_METADATA.exams)
    ? CONTENT_METADATA.exams.filter(exam => exam && exam.active !== false).map(exam => exam.label)
    : [];
  const cardExams = getVisibleCards({ dedupe:false }).map(c => String(c.exam || '').trim()).filter(Boolean);
  const fallbackExams = Array.isArray(questionResolutionHelpers.examNames) ? questionResolutionHelpers.examNames : [];
  return [...new Set([...metadataExams, ...cardExams, ...fallbackExams])].sort((a,b)=>String(a).localeCompare(String(b)));
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
    localStorage.setItem(PRACTICE_LECTURE_KEY, normalizeLectureFilter(activeLec || 'all'));
    localStorage.setItem(RANDOM_MODE_KEY, String(!!randomMode));
  }catch(e){}
}
function syncSidebarSelection(){
  document.querySelectorAll('.sb-item[data-k]').forEach(el=>{
    el.classList.toggle('active', !!activeLec && el.dataset.k===activeLec);
  });
}
function syncPracticeControls(){
  const select=document.getElementById('practice-lecture-select');
  if(select){
    const options=['<option value="all">All Lectures</option>']
      .concat(getLectureOptions().map(lecture=>`<option value="${esc(lecture)}">${esc2(lecture)}</option>`));
    select.innerHTML=options.join('');
    select.value=normalizeLectureFilter(activeLec || 'all');
  }
  const toggle=document.getElementById('practice-random-toggle');
  if(toggle) toggle.checked=!!randomMode;
}
function applyLectureSelection(value, opts={}){
  const lecture = normalizeLectureFilter(value);
  if(opts.resetFilters){
    activeFilter='all';
    activeSrc='';
    activeType='';
  }
  activeLec = lecture === 'all' ? null : lecture;
  activeLecType='all';
  if(opts.persist !== false) persistPracticePreferences();
  syncSidebarSelection();
  syncPracticeControls();
  if(opts.apply !== false) applyFilter();
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
  const label = activeLec || 'All Lectures';
  const message = `Starting Practice: ${label} (${deck.length} cards)`;
  if(window.SRS_UI && typeof window.SRS_UI.toast === 'function') window.SRS_UI.toast(message);
}
window.OBG_QB_Utils = {
  shuffleArray,
  filterCardsByLecture,
  filterQuestionsByLecture,
  normalizeLectureFilter,
  getVisibleCards,
  getSelectedLecture: () => normalizeLectureFilter(activeLec || 'all'),
  setSelectedLecture: (lecture) => applyLectureSelection(lecture),
  isRandomModeEnabled: () => !!randomMode,
  ...questionResolutionHelpers
};

// ═══════════════════════════════════
// SOURCE LABEL
// ═══════════════════════════════════
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

// ═══════════════════════════════════
// FILTERS
// ═══════════════════════════════════
function setFilter(btn, f){
  document.querySelectorAll('[data-f]').forEach(b=>b.classList.remove('active'));
  btn.classList.add('active');
  activeFilter = f; activeLecType='all';
  syncSidebarSelection();
  syncPracticeControls();
  applyFilter();
}
function setSrcFilter(btn){
  const src = btn.dataset.src;
  if(btn.classList.contains('active')){ btn.classList.remove('active'); activeSrc=''; }
  else {
    document.querySelectorAll('[data-src]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active'); activeSrc=src;
  }
  applyFilter();
}
function setTypeFilter(btn){
  const t = btn.dataset.type;
  if(btn.classList.contains('active')){ btn.classList.remove('active'); activeType=''; }
  else {
    document.querySelectorAll('[data-type]').forEach(b=>b.classList.remove('active'));
    btn.classList.add('active'); activeType=t;
  }
  applyFilter();
}
function setSL(k){
  document.querySelectorAll('.sb-item[data-k]').forEach(el=>el.classList.remove('active'));
  const el=document.querySelector('.sb-item[data-k="'+k+'"]'); if(el)el.classList.add('active');
  activeLec=k; activeLecType='all';
  const sid='sub_'+k.replace(/[^a-z0-9]/gi,'_');
  const sub=document.getElementById(sid);
  if(sub)sub.querySelectorAll('.s-stab').forEach((b,i)=>b.classList.toggle('on',i===0));
  persistPracticePreferences();
  syncPracticeControls();
  applyFilter();
}
function setST(e,k,t){
  e.stopPropagation();
  const sid='sub_'+k.replace(/[^a-z0-9]/gi,'_');
  const sub=document.getElementById(sid);
  if(sub){sub.querySelectorAll('.s-stab').forEach(b=>b.classList.remove('on'));e.target.classList.add('on');}
  activeLec=k; activeLecType=t;
  persistPracticePreferences();
  syncPracticeControls();
  applyFilter();
}
function applyFilter(){
  let d=getVisibleCards({ dedupe:false });
  if(activeFilter!=='all') d=d.filter(c=>String(c.exam||'')===activeFilter);
  if(activeSrc) d=d.filter(c=>(c.source||'').toLowerCase().includes(activeSrc.replace('_',' ')));
  // Special: extra_from_bank has _extra flag
  if(activeSrc==='extra_from_bank') d=getVisibleCards({ dedupe:false }).filter(c=>c._extra);
  if(activeType) d=d.filter(c=>c.cardType===activeType);
  if(activeLec){
    d=filterCardsByLecture(d, activeLec);
    if(activeLecType==='MCQ')       d=d.filter(c=>c.cardType==='MCQ');
    if(activeLecType==='OSCE')      d=d.filter(c=>c.cardType==='OSCE');
    if(activeLecType==='FLASHCARD') d=d.filter(c=>c.cardType==='FLASHCARD');
    if(activeLecType==='SAQ')       d=d.filter(c=>c.cardType==='SAQ');
  }
  d=questionResolutionHelpers.getStudyEligibleCards({cards:d, lecture:activeLec || 'all', dedupe:true});
  if(randomMode) d=shuffleArray(d);
  loadDeck(d);
}
function loadDeck(d){
  deck=d; idx=0; flipped=false; reviewed=0;
  scores={again:0,good:0,easy:0}; mcqRes={correct:0,wrong:0};
  osceSubIdx={};
  let title='All Questions';
  if(activeLec) title=activeLec+(activeLecType!=='all'?' — '+activeLecType:'');
  else if(activeFilter!=='all') title=activeFilter;
  if(activeSrc) title+=' · '+srcLabel(activeSrc);
  if(activeType) title+=' · '+activeType;
  document.getElementById('deck-title').textContent=title;
  const nm=d.filter(c=>c.cardType==='MCQ').length;
  const no=d.filter(c=>c.cardType==='OSCE').length;
  const nf=d.filter(c=>c.cardType==='FLASHCARD').length;
  const ns=d.filter(c=>c.cardType==='SAQ').length;
  const lectureNote = activeLec ? ` &nbsp;·&nbsp; Lecture filter: ${esc2(activeLec)}` : '';
  document.getElementById('deck-meta').innerHTML=
    `<strong>${d.length}</strong> cards &nbsp;·&nbsp; ${nm} MCQ &nbsp;·&nbsp; ${no} OSCE &nbsp;·&nbsp; ${nf} Flash &nbsp;·&nbsp; ${ns} SAQ &nbsp;·&nbsp; ${randomMode ? 'Randomized order' : 'Sequential order'}${lectureNote}`;
  syncPracticeControls();
}
function shuffleDeck(){
  deck=shuffleArray(deck);
  idx=0; flipped=false; renderCard(); updateNav();
}
function resetDeck(){ applyFilter(); }

// ═══════════════════════════════════
// RENDER
// ═══════════════════════════════════
function renderCard(){
  const stage=document.getElementById('card-stage');
  if(!deck.length){
    stage.innerHTML='<div class="empty"><h3>No cards match</h3><p>Try a different filter.</p></div>';
    document.getElementById('btn-flip').style.display='none'; return;
  }
  document.getElementById('btn-flip').style.display='';
  const c=deck[idx]; flipped=false;
  if(c.unresolvedStub){
    stage.innerHTML=renderUnresolvedStub(c);
    const fb=document.getElementById('btn-flip');
    fb.textContent='Unavailable';
    fb.disabled=true;
    updateProgress();
    return;
  }
  document.getElementById('nav-ctr').textContent=(idx+1)+' / '+deck.length;
  
  if(c.cardType==='MCQ') stage.innerHTML=renderMCQ(c);
  else if(c.cardType==='OSCE') stage.innerHTML=renderOSCE(c);
  else if(c.cardType==='FLASHCARD') stage.innerHTML=renderFlipCard(c,'FLASHCARD');
  else if(c.cardType==='SAQ') stage.innerHTML=renderFlipCard(c,'SAQ');
  
  const fb=document.getElementById('btn-flip');
  if(c.cardType==='MCQ'){
    fb.textContent='Select Answer'; fb.disabled=true;
  } else {
    fb.textContent='Flip ↩'; fb.disabled=false;
    fb.onclick=flipCard;
  }
  updateProgress();
}

function renderInlineNote(c){
  if(!c || !c.note) return '';
  return `<div class="card-note"><strong>Note:</strong> ${mdBold(esc2(c.note))}</div>`;
}

function renderQuestionMedia(c){
  const image = String(c?.image || '').trim();
  const alt = esc(c?.imageAlt || 'Question image');
  if(image){
    return `<div class="question-media"><img src="${esc(image)}" style="max-width:100%;max-height:360px;border-radius:12px;margin:10px auto 14px;display:block;box-shadow:0 8px 24px rgba(0,0,0,.12);background:#fff" alt="${alt}">${c?.imageAlt?`<div style="text-align:center;font-size:.76rem;color:#64748b;margin-top:-4px;margin-bottom:12px">${esc2(c.imageAlt)}</div>`:''}</div>`;
  }
  if(c?.imagePlaceholder){
    return `<div class="img-ph">${esc2(c.imagePlaceholderText||'Image')}</div>`;
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
      <span>${esc2(ch)}</span><span class="c-icon" id="icon${l}_${c.id}"></span>
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
    <div class="mcq-lec">${esc2(c.lecture||'')}${c.doctor?` &nbsp;·&nbsp; ${esc2(c.doctor)}`:''}</div>
  </div>
  ${imgPh}${extraBanner}
  <div class="mcq-stem">${mdBold(esc2(c.displayStem||c.q||''))}</div>
  ${renderInlineNote(c)}
  ${tags?`<div class="mcq-tags">${tags}</div>`:''}
  <div class="mcq-choices">${choices}</div>
  <div class="mcq-result" id="mcq-res-${c.id}"></div>
  <div class="mcq-footer">
    <div class="rate-btns" id="rate-btns-${c.id}" style="display:none">
      <button class="rate-btn rb-again" onclick="rate('again')">↺ Again</button>
      <button class="rate-btn rb-good" onclick="rate('good')">◎ Good</button>
      <button class="rate-btn rb-easy" onclick="rate('easy')">✓ Easy</button>
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
    subContent = subQ ? `<div class="osce-sub-hdr">Part ${subIdx+1}: ${esc2(subQText)}</div>` : '';
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
  <div class="osce-stem">${mdBold(esc2(c.displayStem||c.stem||c.q||''))}</div>
  ${renderInlineNote(c)}
  ${tags?`<div class="mcq-tags">${tags}</div>`:''}
  ${subs.length>1?`<div class="osce-progress">${dots}</div>`:''}
  ${subContent}
  <div class="mcq-choices" id="osce-choices-${c.id}">${choices}</div>
  <div class="mcq-result" id="osce-res-${c.id}_${subIdx}"></div>
  <div class="mcq-footer">
    ${subs.length>1?`<div style="display:flex;gap:8px">
      <button class="btn btn-out" style="font-size:.74rem;padding:4px 10px" onclick="prevOSCESub('${c.id}')" ${subIdx===0?'disabled':''}>← Part ${subIdx}</button>
      <button class="btn btn-out" style="font-size:.74rem;padding:4px 10px" onclick="nextOSCESub('${c.id}')" ${subIdx>=subs.length-1?'disabled':''}>Part ${subIdx+2} →</button>
    </div>`:'<div></div>'}
    <div class="rate-btns" id="osce-rate-${c.id}" style="display:none">
      <button class="rate-btn rb-again" onclick="rate('again')">↺ Again</button>
      <button class="rate-btn rb-good" onclick="rate('good')">◎ Good</button>
      <button class="rate-btn rb-easy" onclick="rate('easy')">✓ Easy</button>
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
  const front=`<div class="card-face card-front" onclick="flipCard()">
  <div class="cf-body">
    <div class="q-badge"><span>${esc2(c.num||'')}</span><span class="ttype ${tclass}">${tname}</span><span>${esc2(c.lecture||'')}</span></div>
    <div class="q-lec">${srcBadge}</div>
    ${extraBanner}
    <div class="q-text">${mdBold(esc2(c.displayStem||c.q||''))}</div>
    ${media}
    ${renderInlineNote(c)}
    ${tags?`<div class="mcq-tags">${tags}</div>`:''}
    <div class="q-hint">Click to reveal answer</div>
  </div>
  <div class="flip-cta">🖱️ Click card or press <strong>Space</strong> to flip</div>
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
<div class="saq-ans-body">Rate yourself after recalling the answer.</div>`;
  }
  
  const back=`<div class="card-face card-back card-back-flash">
  ${backContent}
  <div class="ans-footer">
    <div class="rate-btns">
      <button class="rate-btn rb-again" onclick="rate('again')">↺ Again</button>
      <button class="rate-btn rb-good" onclick="rate('good')">◎ Good</button>
      <button class="rate-btn rb-easy" onclick="rate('easy')">✓ Easy</button>
    </div>
    <span style="font-size:.71rem;color:#6b7280">1/2/3 to rate</span>
  </div>
</div>`;
  
  return `<div class="card-stage"><div class="card-flip" id="cflip">${front}${back}</div></div>`;
}

// ═══════════════════════════════════
// MCQ INTERACTION
// ═══════════════════════════════════
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
  <div class="mcq-stem">${mdBold(esc2(c.displayStem||c.q||''))}</div>
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
  document.getElementById('ci'+chosen+'_'+c.id).textContent=ok?'✓':'✗';
  if(!ok && correct){
    const cb=document.querySelector('.choice-btn[data-l="'+correct+'"]');
    if(cb){cb.classList.add('reveal-correct');
      const ci=document.getElementById('ci'+correct+'_'+c.id);
      if(ci) ci.textContent='✓';
    }
  }
  const res=document.getElementById('mcq-res-'+c.id);
  if(res){
    if(ok){res.className='mcq-result ok';res.textContent='✓ Correct!';mcqRes.correct++;}
    else{res.className='mcq-result ng';res.innerHTML='✗ Incorrect — Answer: <strong>'+correct+'</strong>';mcqRes.wrong++;}
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
  document.getElementById('oci'+chosen+'_'+cid).textContent=ok?'✓':'✗';
  if(!ok && correct){
    const cb=document.querySelector('#osce-choices-'+cardId+' .choice-btn[data-l="'+correct+'"]');
    if(cb){cb.classList.add('reveal-correct');
      const ci=document.getElementById('oci'+correct+'_'+cid); if(ci) ci.textContent='✓';
    }
  }
  const res=document.getElementById('osce-res-'+cid);
  if(res){
    if(ok){res.className='mcq-result ok';res.textContent='✓ Correct!';mcqRes.correct++;}
    else{res.className='mcq-result ng';res.innerHTML='✗ Incorrect — Answer: <strong>'+correct+'</strong>';mcqRes.wrong++;}
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

// ═══════════════════════════════════
// FLIP / RATE / NAV
// ═══════════════════════════════════
function flipCard(){
  const cf=document.getElementById('cflip');
  if(cf){ cf.classList.toggle('flipped'); flipped=!flipped;
    if(flipped){reviewed++;updateStats();updateProgress();}
  }
}
function rate(r){
  scores[r]=(scores[r]||0)+1;
  if(deck[idx]) flashRatings[deck[idx].id]=r; saveProgress();
  nextCard();
}
function nextCard(){ if(idx<deck.length-1){idx++;flipped=false;renderCard();updateNav();}else{showScore();} }
function prevCard(){ if(idx>0){idx--;flipped=false;renderCard();updateNav();} }
function updateNav(){
  document.getElementById('btn-prev').disabled=idx<=0;
  document.getElementById('btn-next').disabled=idx>=deck.length-1;
  document.getElementById('nav-ctr').textContent=(idx+1)+' / '+deck.length;
}
function updateProgress(){
  const total=deck.length; if(!total) return;
  const pct=Math.round(reviewed/total*100);
  document.getElementById('prog-fill').style.width=pct+'%';
  document.getElementById('prog-txt').textContent=reviewed+' / '+total;
}

// ═══════════════════════════════════
// STATS
// ═══════════════════════════════════
function updateStats(){
  document.getElementById('s-total').textContent=deck.length;
  document.getElementById('s-mcq').textContent=deck.filter(c=>c.cardType==='MCQ').length;
  document.getElementById('s-osce').textContent=deck.filter(c=>c.cardType==='OSCE').length;
  document.getElementById('s-flash').textContent=deck.filter(c=>c.cardType==='FLASHCARD').length;
  document.getElementById('s-saq').textContent=deck.filter(c=>c.cardType==='SAQ').length;
  document.getElementById('s-rev').textContent=reviewed;
  const nm=deck.filter(c=>c.cardType==='MCQ'||c.cardType==='OSCE').length;
  const done=mcqRes.correct+mcqRes.wrong;
  document.getElementById('s-score').textContent=nm&&done?mcqRes.correct+'/'+done:'—';
}

// ═══════════════════════════════════
// COUNTS
// ═══════════════════════════════════
function updateCounts(){
  const ids={all:0,mcq:0,osce:0,flash:0,saq:0};
  const examCounts={};
  const srcCounts={old_formative:0,new_formative:0,previous_exam:0,osce:0,extra_from_bank:0};
  getVisibleCards({ dedupe:false }).forEach(c=>{
    ids.all++;
    const examKey=String(c.exam||'').trim() || 'mid';
    examCounts[examKey]=(examCounts[examKey]||0)+1;
    if(c.cardType==='MCQ')       ids.mcq++;
    if(c.cardType==='OSCE')      ids.osce++;
    if(c.cardType==='FLASHCARD') ids.flash++;
    if(c.cardType==='SAQ')       ids.saq++;
    const sl=(c.source||'').toLowerCase();
    if(c._extra) srcCounts.extra_from_bank++;
    else if(sl.includes('new')) srcCounts.new_formative++;
    else if(sl.includes('old') || sl.includes('lecture')) srcCounts.old_formative++;
    else if(sl.includes('prev') || sl.includes('exam')) srcCounts.previous_exam++;
    else if(sl.includes('osce') || sl.includes('ospe')) srcCounts.osce++;
  });
  Object.entries(ids).forEach(([k,v])=>{const el=document.getElementById('c-'+k);if(el)el.textContent=v;});
  Object.entries(examCounts).forEach(([k,v])=>{
    const key = k.toLowerCase().replace(/[^a-z0-9]+/g,'-');
    const el=document.getElementById('c-exam-'+key);
    if(el) el.textContent=v;
  });
  const _s=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  _s('c-src-old',srcCounts.old_formative);
  _s('c-src-new',srcCounts.new_formative);
  _s('c-src-prev',srcCounts.previous_exam);
  _s('c-src-osce',srcCounts.osce);
  _s('c-src-extra',srcCounts.extra_from_bank);
  _s('c-mcq',ids.mcq);
  _s('c-osce',ids.osce);
  _s('c-flash',ids.flash);
  _s('c-saq-t',ids.saq);
}

// ═══════════════════════════════════
// SIDEBAR
// ═══════════════════════════════════
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
    subtabs.push(`<button class="s-stab on" onclick="setST(event,'${esc(lec)}','all')">All(${nTotal})</button>`);
    if(nM) subtabs.push(`<button class="s-stab mcq-t" onclick="setST(event,'${esc(lec)}','MCQ')">MCQ(${nM})</button>`);
    if(nO) subtabs.push(`<button class="s-stab osce-t" onclick="setST(event,'${esc(lec)}','OSCE')">OSCE(${nO})</button>`);
    if(nF) subtabs.push(`<button class="s-stab flash-t" onclick="setST(event,'${esc(lec)}','FLASHCARD')">Flash(${nF})</button>`);
    if(nS) subtabs.push(`<button class="s-stab saq-t" onclick="setST(event,'${esc(lec)}','SAQ')">SAQ(${nS})</button>`);
    if(hasNotes) subtabs.push(`<button class="notes-btn" onclick="openNotes('${esc(lec)}',event)">📝 Notes</button>`);
    html+=`<li class="sb-item" data-k="${esc(lec)}" onclick="setSL('${esc(lec)}')">
      <div class="s-main">
        <span class="s-name">${esc2(lec)}</span>
        <span class="s-cnt">${nTotal}</span>
      </div>
      <div class="s-subtabs" id="${sid}">${subtabs.join('')}</div>
    </li>`;
  });
  list.innerHTML=html;
}

// ═══════════════════════════════════
// NOTES
// ═══════════════════════════════════
function openNotes(lec, e){
  e.stopPropagation();
  const notes=(NOTES[lec]||[]).join('\n\n---\n\n');
  document.getElementById('notes-title').textContent='Notes: '+lec;
  document.getElementById('notes-content').textContent=notes||'No notes.';
  document.getElementById('notes-modal').classList.add('visible');
}
function closeNotes(){ document.getElementById('notes-modal').classList.remove('visible'); }

// ═══════════════════════════════════
// SCORE
// ═══════════════════════════════════
function showScore(){
  const nm=deck.filter(c=>c.cardType==='MCQ'||c.cardType==='OSCE').length;
  const ns=deck.filter(c=>c.cardType==='FLASHCARD'||c.cardType==='SAQ').length;
  const pct=nm?(mcqRes.correct/nm):0;
  document.getElementById('sc-emoji').textContent=pct>.75?'🏆':pct>.5?'⭐':'📖';
  document.getElementById('sc-sub').textContent=deck.length+' cards reviewed ('+nm+' MCQ/OSCE · '+ns+' Flash/SAQ)';
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

// ═══════════════════════════════════
// KEYBOARD
// ═══════════════════════════════════
document.addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT'||e.target.tagName==='TEXTAREA') return;
  const c=deck[idx]; if(!c) return;
  if(e.code==='Space'&&(c.cardType==='FLASHCARD'||c.cardType==='SAQ')){e.preventDefault();flipCard();}
  if(e.code==='ArrowRight') nextCard();
  if(e.code==='ArrowLeft')  prevCard();
  if(flipped){ if(e.key==='1')rate('again'); if(e.key==='2')rate('good'); if(e.key==='3')rate('easy'); }
});

// ═══════════════════════════════════
// HELPERS
// ═══════════════════════════════════
function mdBold(s){ return String(s).replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>'); }
function esc(s){ return String(s).replace(/'/g,"&#39;").replace(/"/g,"&quot;"); }
function esc2(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// ═══════════════════════════════════
// ═══════════════════════════════════
// LOCAL STORAGE — PROGRESS
// ═══════════════════════════════════
const LS_KEY = 'obg_progress_v1';

function saveProgress(){
  const data = {
    mcqAnswers, osceResults, flashRatings,
    reviewed, scores, mcqRes, idx,
    activeFilter, activeSrc, activeType, activeLec, activeLecType
  };
  try { localStorage.setItem(LS_KEY, JSON.stringify(data)); } catch(e){}
}

function loadProgress(){
  try {
    const raw = localStorage.getItem(LS_KEY);
    randomMode = storedRandomMode();
    if(raw){
      const d = JSON.parse(raw);
      mcqAnswers   = d.mcqAnswers   || {};
      osceResults  = d.osceResults  || {};
      flashRatings = d.flashRatings || {};
      activeFilter = d.activeFilter || 'all';
      activeSrc    = d.activeSrc    || '';
      activeType   = d.activeType   || '';
      activeLec    = d.activeLec    || null;
      activeLecType= d.activeLecType|| 'all';
      reviewed     = d.reviewed     || 0;
      scores       = d.scores       || {again:0, good:0, easy:0};
      mcqRes       = d.mcqRes       || {correct:0, wrong:0};
      idx = d.idx || 0;
    }
    const preferredLecture = storedLecturePreference();
    if(preferredLecture === 'all'){
      activeLec = null;
      activeLecType = 'all';
    }else{
      activeLec = preferredLecture;
      activeLecType = 'all';
    }
    applyFilter();
    idx = Math.min(idx || 0, Math.max(0, deck.length - 1));
    syncSidebarSelection();
    syncPracticeControls();
    renderCard(); updateNav(); updateStats(); updateProgress();
  } catch(e){ console.warn('loadProgress failed', e); applyFilter(); }
}
function renderExamTabs(){
  const tabs=document.getElementById('exam-tabs');
  if(!tabs) return;
  const exams=getExamOptions();
  const labelMap={mid:'Mid',paper1:'Paper 1',paper2:'Paper 2'};
  const html=[
    `<button class="ftab ${activeFilter==='all'?'active':''}" data-f="all" onclick="setFilter(this,'all')">All <span class="cnt" id="c-all">0</span></button>`
  ].concat(exams.map(exam=>{
    const safe=String(exam).toLowerCase().replace(/[^a-z0-9]+/g,'-');
    const label=labelMap[exam] || exam;
    return `<button class="ftab ${activeFilter===exam?'active':''}" data-f="${esc(exam)}" onclick="setFilter(this,'${esc(exam)}')">${esc2(label)} <span class="cnt" id="c-exam-${safe}">0</span></button>`;
  })).join('');
  tabs.innerHTML=html;
}

function clearProgress(){
  if(!confirm('Clear all saved progress?')) return;
  localStorage.removeItem(LS_KEY);
  mcqAnswers={}; osceResults={}; flashRatings={};
  reviewed=0; scores={again:0,good:0,easy:0}; mcqRes={correct:0,wrong:0};
  activeFilter='all'; activeSrc=''; activeType=''; activeLec=storedLecturePreference()==='all'?null:storedLecturePreference(); activeLecType='all';
  randomMode = storedRandomMode();
  syncSidebarSelection();
  syncPracticeControls();
  applyFilter();
}
// ═══════════════════════════════════
// INIT
// ═══════════════════════════════════
buildSidebar();
renderExamTabs();
try{ updateCounts(); }catch(e){ console.warn('updateCounts error',e); }
syncPracticeControls();
loadProgress();

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
  document.getElementById('ss-bc').style.width=(mcqC/mt*100)+'%';
  document.getElementById('ss-bw').style.width=(mcqW/mt*100)+'%';
  document.getElementById('ss-bu').style.width=(mcqU/mt*100)+'%';
  const ft=flAll.length||1;
  document.getElementById('ss-fa').style.width=(flA/ft*100)+'%';
  document.getElementById('ss-fg').style.width=(flG/ft*100)+'%';
  document.getElementById('ss-fe').style.width=(flE/ft*100)+'%';
  document.getElementById('ss-fu').style.width=(flU/ft*100)+'%';
  const lecs=getLectureOptions();
  const cont=document.getElementById('ss-lecs');
  cont.innerHTML='';
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
    cont.appendChild(row);
  });

  // Wrong questions list
  const wrongCards = getVisibleCards({ dedupe:false }).filter(c => c.cardType==='MCQ' && mcqAnswers[c.id] && mcqAnswers[c.id]!==((c.displayAnswer||c.ans)));
  const wList = document.getElementById('ss-wrong-list');
  const practiceBtn = document.getElementById('practice-wrong-btn');
  practiceBtn.textContent = wrongCards.length
    ? '🔁 Practice ' + wrongCards.length + ' Wrong Question' + (wrongCards.length>1?'s':'')
    : '✅ No Wrong Answers Yet';
  practiceBtn.disabled = wrongCards.length === 0;
  wList.innerHTML = '';
  if(wrongCards.length === 0){
    wList.innerHTML = '<div class="wq-empty">🎉 No wrong answers yet — keep going!</div>';
  } else {
    wrongCards.forEach(c => {
      const yourAns  = mcqAnswers[c.id];
      const corrAns  = c.displayAnswer || c.ans;
      const choices  = c.displayChoices || c.choices || [];
      const yourTxt  = choices[yourAns.charCodeAt(0)-65] || yourAns;
      const corrTxt  = choices[corrAns.charCodeAt(0)-65] || corrAns;
      const stem     = (c.q || c.stem || '').substring(0, 120) + ((c.q||c.stem||'').length > 120 ? '…' : '');
      const div = document.createElement('div');
      div.className = 'wrong-q-item';
      div.title = 'Click to go to this question';
      div.innerHTML =
        '<div class="wq-num">' + c.num + ' · ' + c.cardType + '</div>' +
        '<div class="wq-lec">📚 ' + (c.lecture||'') + '</div>' +
        '<div class="wq-q">' + stem + '</div>' +
        '<div class="wq-ans">' +
          '<span class="wq-your">❌ Your: ' + yourAns + ') ' + yourTxt.substring(0,60) + '</span>' +
          '<span class="wq-correct">✅ Correct: ' + corrAns + ') ' + corrTxt.substring(0,60) + '</span>' +
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
  activeLec = null; activeFilter = 'all'; activeSrc = ''; activeType = '';
  persistPracticePreferences();
  syncSidebarSelection();
  syncPracticeControls();
  document.getElementById('deck-title').textContent = '❌ Practice: Wrong Questions (' + wrongCards.length + ')';
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
  activeLec = card.lecture; activeLecType = 'all';
  activeFilter = 'all'; activeSrc = ''; activeType = '';
  applyFilter();
  const deckIdx = deck.findIndex(c=>c.id===card.id || (c.canonicalSourceId && c.canonicalSourceId === card.canonicalSourceId));
  if(deckIdx !== -1){ idx = deckIdx; }
  persistPracticePreferences();
  syncSidebarSelection();
  syncPracticeControls();
  closeStats();
  renderCard(); updateNav(); updateStats(); updateProgress();
}
