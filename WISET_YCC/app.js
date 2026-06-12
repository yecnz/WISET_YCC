const STORAGE_KEY = "sugarfit-lab-state-v5";
const STATE_VERSION = 5;

// ── 룰 테이블 ──────────────────────────────────────────────
// adiMgKg: 공식 ADI(mg/kg). 없으면 toleranceMgKg(위장 내약 상한, 검증 전 mock)을 사용.
// tasteCapMg: 1잔 기준 인공 끝맛·쓴맛이 두드러지기 시작하는 맛 상한선(mock).
// pricePerKg: 원료 단가(원/kg, mock). verified: 원자료 검증 여부.
const RULE_TABLE = {
  allulose: {
    name: "알룰로스", class: "기타 감미료", unit: "g",
    sweetness: 0.7, adiMgKg: null, toleranceMgKg: 900, tasteCapMg: 25000,
    kcalPerG: 0.3, gi: 0, sugarAlcohol: false, highIntensity: false,
    natural: true, pricePerKg: 12000, verified: false,
    source: "FDA GRAS·문헌 내약 상한", version: "v0.1"
  },
  erythritol: {
    name: "에리스리톨", class: "당알코올", unit: "g",
    sweetness: 0.65, adiMgKg: null, toleranceMgKg: 780, tasteCapMg: 20000,
    kcalPerG: 0.2, gi: 0, sugarAlcohol: true, highIntensity: false,
    natural: true, pricePerKg: 9000, verified: false,
    source: "JECFA·문헌 내약 상한", version: "v0.1"
  },
  maltitol: {
    name: "말티톨", class: "당알코올", unit: "g",
    sweetness: 0.9, adiMgKg: null, toleranceMgKg: 600, tasteCapMg: 25000,
    kcalPerG: 2.1, gi: 35, sugarAlcohol: true, highIntensity: false,
    natural: true, pricePerKg: 4000, verified: false,
    source: "문헌 내약 상한·GI 높음", version: "v0.1"
  },
  sucralose: {
    name: "수크랄로스", class: "고감미료", unit: "mg",
    sweetness: 600, adiMgKg: 15, toleranceMgKg: null, tasteCapMg: 120,
    kcalPerG: 0, gi: 0, sugarAlcohol: false, highIntensity: true,
    natural: false, pricePerKg: 150000, verified: true,
    source: "JECFA ADI 15mg/kg", version: "v0.1"
  },
  stevia: {
    name: "스테비아", class: "천연 고감미료", unit: "mg",
    sweetness: 250, adiMgKg: 4, toleranceMgKg: null, tasteCapMg: 150,
    kcalPerG: 0, gi: 0, sugarAlcohol: false, highIntensity: true,
    natural: true, pricePerKg: 120000, verified: true,
    source: "JECFA ADI 4mg/kg(스테비올 기준)", version: "v0.1"
  }
};

const ALL_KEYS = Object.keys(RULE_TABLE);
const SERVING_SHARE = 0.5; // 1일 허용량 중 1잔에 배분하는 비율(하루 2잔 가정)
const GUT_FACTOR = { high: 0.5, medium: 0.8, low: 1.0 };
const GI_EXCLUDE_THRESHOLD = 10;
const SWEETNESS_PCT = { mild: 5, medium: 7, strong: 9 };
const SUGAR_KCAL_PER_G = 4;
const SUGAR_PRICE_PER_KG = 1500;
const DRINK_DEFAULT_SWEETNESS = { "아이스티": "medium", "에이드": "strong", "요거트 드링크": "medium", "탄산 음료": "strong" };

// 거리 가중 예측: 구성 거리(0~1)에 대한 가우시안 폭과 신뢰 하한.
// 폭이 넓으면 실측 배합 점수가 먼 이웃으로 희석되므로 좁게 유지한다.
const PREDICT_TAU = 0.15;
const PREDICT_MIN_WEIGHT = 0.2;
const ALT_MIN_DISTANCE = 0.15; // 대안 다양성 최소 거리

const SCORE_WEIGHTS = {
  overall: 0.3,
  sugarLike: 0.2,
  sweetness: 0.15,
  body: 0.15,
  flavorBalance: 0.1,
  aftertasteStability: 0.1
};

const SENSORY_FIELDS = [
  ["sweetness", "단맛 만족도"],
  ["sugarLike", "설탕 유사도"],
  ["aftertasteNeg", "끝맛 거부감"],
  ["body", "바디감"],
  ["flavorBalance", "향미 균형"],
  ["overall", "전체 기호도"],
  ["repurchase", "재구매 의향"]
];

// 역방향 항목: 점수가 높을수록 부정적 (저장은 원점수, 역변환은 점수 계산에서)
const REVERSE_ITEMS = {
  aftertasteNeg: "거부감이 없으면 1, 강할수록 7 — 높을수록 부정적입니다"
};

const RADAR_AXES = [
  ["sweetness", "단맛"],
  ["sugarLike", "설탕 유사"],
  ["aftertasteStability", "끝맛 안정"],
  ["body", "바디감"],
  ["flavorBalance", "향미 균형"],
  ["overall", "기호도"]
];

const PRESETS = {
  general: { label: "일반 소비자", weight: 60, giSensitivity: "medium", glucoseCare: false, avoidAftertaste: false },
  glucose: { label: "혈당 관리형", weight: 60, giSensitivity: "medium", glucoseCare: true, avoidAftertaste: false },
  gut: { label: "위장 민감형", weight: 60, giSensitivity: "high", glucoseCare: false, avoidAftertaste: true }
};

const seedState = {
  version: STATE_VERSION,
  project: {
    drinkType: "아이스티",
    servingMl: 350,
    sweetPreference: "medium",
    weight: 60,
    giSensitivity: "medium",
    glucoseCare: false,
    avoidAftertaste: false,
    allowedIngredients: [...ALL_KEYS],
    costCapKrw: 0,
    naturalOnly: false,
    hasRun: true
  },
  formulas: [
    { id: "control", name: "설탕 대조군", kind: "control", shares: {} },
    { id: "f1", name: "알룰로스 100", kind: "seed", shares: { allulose: 1 } },
    { id: "f2", name: "알룰로스·에리스리톨 70:30", kind: "seed", shares: { allulose: 0.7, erythritol: 0.3 } },
    { id: "f3", name: "알룰로스·수크랄로스 70:30", kind: "seed", shares: { allulose: 0.7, sucralose: 0.3 } },
    { id: "f4", name: "알룰로스·스테비아 60:40", kind: "seed", shares: { allulose: 0.6, stevia: 0.4 } },
    { id: "f5", name: "에리스리톨·스테비아 60:40", kind: "seed", shares: { erythritol: 0.6, stevia: 0.4 } },
    { id: "f6", name: "에리스리톨·수크랄로스 40:60", kind: "seed", shares: { erythritol: 0.4, sucralose: 0.6 } },
    { id: "f7", name: "말티톨·수크랄로스 50:50", kind: "seed", shares: { maltitol: 0.5, sucralose: 0.5 } },
    { id: "f8", name: "알룰로스·에리·스테비아 50:30:20", kind: "seed", shares: { allulose: 0.5, erythritol: 0.3, stevia: 0.2 } }
  ],
  reviews: [
    makeReview("일반 소비자", "control", [7, 7, 1, 6, 6, 7, 6], "기준 음료. 익숙하고 무난함"),
    makeReview("카페 음료 선호", "control", [6, 7, 1, 6, 6, 6, 6], "단맛과 바디감이 안정적"),
    makeReview("헬스 관심", "control", [7, 6, 2, 6, 5, 6, 5], "맛은 좋지만 당이 부담"),
    makeReview("헬스 관심", "f1", [5, 6, 2, 5, 5, 6, 5], "깔끔하고 설탕과 비슷한 단맛"),
    makeReview("일반 소비자", "f1", [6, 6, 2, 5, 5, 5, 5], "끝맛이 거의 없음"),
    makeReview("카페 음료 선호", "f2", [5, 6, 2, 5, 5, 6, 5], "균형이 좋고 부담 없음"),
    makeReview("다이어트 관심", "f2", [6, 5, 2, 5, 5, 6, 6], "시원한 끝맛이 살짝 있지만 좋음"),
    makeReview("헬스 관심", "f3", [6, 5, 3, 4, 5, 5, 5], "단맛은 충분한데 바디감이 가벼움"),
    makeReview("일반 소비자", "f3", [5, 5, 4, 4, 4, 5, 4], "끝맛이 약간 인공적"),
    makeReview("다이어트 관심", "f4", [5, 5, 4, 4, 5, 5, 4], "스테비아 특유의 쓴 끝맛이 남"),
    makeReview("카페 음료 선호", "f4", [5, 4, 4, 4, 4, 4, 4], "향은 좋지만 끝맛이 아쉬움"),
    makeReview("헬스 관심", "f5", [4, 4, 4, 3, 4, 4, 3], "청량감은 있는데 바디감이 약함"),
    makeReview("일반 소비자", "f5", [5, 4, 3, 4, 4, 4, 4], "무난하지만 설탕 느낌은 덜함"),
    makeReview("다이어트 관심", "f6", [5, 4, 4, 3, 4, 4, 4], "단맛이 날카롭고 가벼움"),
    makeReview("카페 음료 선호", "f6", [4, 4, 3, 4, 4, 4, 4], "특별한 거부감은 없음"),
    makeReview("일반 소비자", "f7", [5, 5, 2, 5, 5, 5, 4], "바디감이 설탕에 가까움"),
    makeReview("카페 음료 선호", "f7", [5, 5, 3, 5, 5, 5, 5], "묵직하고 자연스러운 단맛"),
    makeReview("헬스 관심", "f8", [6, 6, 2, 5, 6, 6, 6], "균형이 가장 좋음"),
    makeReview("다이어트 관심", "f8", [6, 6, 2, 6, 5, 6, 5], "끝맛 부담 없이 만족스러움")
  ],
  ruleOverrides: {}
};

let state = loadState();
let wizardStep = 1;

// ── 상태 ───────────────────────────────────────────────────
function makeReview(segment, formulaId, scores, comment) {
  const [sweetness, sugarLike, aftertasteNeg, body, flavorBalance, overall, repurchase] = scores;
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
    segment,
    formulaId,
    sweetness,
    sugarLike,
    aftertasteNeg,
    body,
    flavorBalance,
    overall,
    repurchase,
    comment,
    createdAt: new Date().toISOString()
  };
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return structuredClone(seedState);
  try {
    const parsed = JSON.parse(saved);
    if (parsed.version !== STATE_VERSION) return structuredClone(seedState);
    return normalizeState(parsed);
  } catch {
    return structuredClone(seedState);
  }
}

function normalizeState(parsed) {
  return {
    ...structuredClone(seedState),
    ...parsed,
    project: { ...seedState.project, ...(parsed.project || {}) },
    ruleOverrides: parsed.ruleOverrides || {}
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function rule(key) {
  return { ...RULE_TABLE[key], ...(state.ruleOverrides[key] || {}) };
}

function formulaById(id) {
  return state.formulas.find((formula) => formula.id === id);
}

function reviewsForFormula(id) {
  return state.reviews.filter((review) => review.formulaId === id);
}

function average(numbers) {
  if (!numbers.length) return 0;
  return numbers.reduce((sum, value) => sum + Number(value), 0) / numbers.length;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

// ── 안전성 엔진 ────────────────────────────────────────────
function targetSugarEqG(project) {
  return (SWEETNESS_PCT[project.sweetPreference] * project.servingMl) / 100;
}

function hardCaps(project) {
  const caps = {};
  for (const key of ALL_KEYS) {
    const r = rule(key);
    const basisMgKg = r.adiMgKg ?? r.toleranceMgKg;
    const dailyMg = basisMgKg * project.weight;
    const servingMg = dailyMg * SERVING_SHARE;
    let capMg = Math.min(servingMg, r.tasteCapMg);
    const tasteBound = r.tasteCapMg < servingMg;
    const gutFactor = r.sugarAlcohol ? GUT_FACTOR[project.giSensitivity] : 1;
    capMg *= gutFactor;
    caps[key] = {
      rule: r,
      capMg,
      dailyMg,
      tasteBound,
      gutFactor,
      excluded: Boolean(project.glucoseCare) && r.gi >= GI_EXCLUDE_THRESHOLD
    };
  }
  return caps;
}

function evaluateShares(shares, project, caps) {
  const sugarEq = targetSugarEqG(project);
  const perIngredient = Object.entries(shares).map(([key, share]) => {
    const r = rule(key);
    const cap = caps[key];
    const amountMg = ((share * sugarEq) / r.sweetness) * 1000;
    return {
      key,
      rule: r,
      share,
      amountMg,
      capMg: cap.capMg,
      usage: amountMg / Math.max(cap.capMg, 1),
      excluded: cap.excluded
    };
  });
  const excludedByGi = perIngredient.filter((item) => item.excluded).map((item) => item.rule.name);
  const maxUsage = Math.max(...perIngredient.map((item) => item.usage));
  const overCap = perIngredient.filter((item) => item.usage > 1).map((item) => item.rule.name);
  const kcal = perIngredient.reduce((sum, item) => sum + (item.amountMg / 1000) * item.rule.kcalPerG, 0);
  const costKrw = perIngredient.reduce((sum, item) => sum + (item.amountMg / 1e6) * item.rule.pricePerKg, 0);
  const overCost = project.costCapKrw > 0 && costKrw > project.costCapKrw;
  return {
    perIngredient,
    excludedByGi,
    overCap,
    overCost,
    maxUsage,
    margin: clamp(1 - maxUsage, 0, 1),
    pass: !excludedByGi.length && !overCap.length && !overCost,
    kcal,
    costKrw,
    sugarEq
  };
}

// ── 후보 자동 생성 (그리드 탐색) ───────────────────────────
function allowedKeys(project) {
  return project.allowedIngredients.filter((key) => (project.naturalOnly ? rule(key).natural : true));
}

function generateCandidates(project) {
  const keys = allowedKeys(project);
  const out = [];
  keys.forEach((k) => out.push({ [k]: 1 }));
  for (let i = 0; i < keys.length; i += 1) {
    for (let j = i + 1; j < keys.length; j += 1) {
      for (let a = 10; a <= 90; a += 10) {
        out.push({ [keys[i]]: a / 100, [keys[j]]: (100 - a) / 100 });
      }
    }
  }
  for (let i = 0; i < keys.length; i += 1) {
    for (let j = i + 1; j < keys.length; j += 1) {
      for (let k = j + 1; k < keys.length; k += 1) {
        for (let a = 10; a <= 80; a += 10) {
          for (let b = 10; a + b <= 90; b += 10) {
            const c = 100 - a - b;
            out.push({ [keys[i]]: a / 100, [keys[j]]: b / 100, [keys[k]]: c / 100 });
          }
        }
      }
    }
  }
  return out;
}

function sharesName(shares) {
  return Object.entries(shares)
    .sort((a, b) => b[1] - a[1])
    .map(([key, share]) => `${rule(key).name} ${Math.round(share * 100)}`)
    .join("·");
}

function sharesDistance(a, b) {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let sum = 0;
  keys.forEach((key) => {
    sum += Math.abs((a[key] || 0) - (b[key] || 0));
  });
  return sum / 2; // 0(동일)~1(완전 상이)
}

function sugarAlcoholShare(shares) {
  return Object.entries(shares).reduce((sum, [key, share]) => sum + (rule(key).sugarAlcohol ? share : 0), 0);
}

function highIntensityShare(shares) {
  return Object.entries(shares).reduce((sum, [key, share]) => sum + (rule(key).highIntensity ? share : 0), 0);
}

// ── 관능 예측 (거리 가중) ──────────────────────────────────
function measuredFormulaStats() {
  return state.formulas
    .filter((formula) => formula.kind !== "control")
    .map((formula) => {
      const reviews = reviewsForFormula(formula.id);
      if (!reviews.length) return null;
      const avg = (key) => average(reviews.map((review) => review[key]));
      const stats = {
        count: reviews.length,
        sweetness: avg("sweetness"),
        sugarLike: avg("sugarLike"),
        aftertasteNeg: avg("aftertasteNeg"),
        body: avg("body"),
        flavorBalance: avg("flavorBalance"),
        overall: avg("overall"),
        repurchase: avg("repurchase")
      };
      stats.aftertasteStability = 8 - stats.aftertasteNeg;
      return { formula, stats };
    })
    .filter(Boolean);
}

function predictStats(shares, measured) {
  if (!measured.length) return { stats: null, reliable: false, nearestD: 1, measuredMatch: false, dataCount: 0 };
  // 실측 배합은 평활 없이 실측 평균을 그대로 사용 (보간은 미실험 배합 전용)
  const exact = measured.find(({ formula }) => sharesDistance(shares, formula.shares) < 0.001);
  if (exact) {
    return { stats: exact.stats, reliable: true, nearestD: 0, measuredMatch: true, dataCount: exact.stats.count };
  }
  let weightSum = 0;
  let nearestD = 1;
  const acc = {};
  const itemKeys = ["sweetness", "sugarLike", "aftertasteNeg", "body", "flavorBalance", "overall", "repurchase"];
  itemKeys.forEach((key) => (acc[key] = 0));
  let dataCount = 0;
  measured.forEach(({ formula, stats }) => {
    const d = sharesDistance(shares, formula.shares);
    nearestD = Math.min(nearestD, d);
    const w = Math.exp(-((d / PREDICT_TAU) ** 2)) * Math.min(stats.count, 4);
    weightSum += w;
    dataCount += stats.count;
    itemKeys.forEach((key) => (acc[key] += stats[key] * w));
  });
  if (weightSum < PREDICT_MIN_WEIGHT) {
    return { stats: null, reliable: false, nearestD, measuredMatch: false, dataCount };
  }
  const stats = {};
  itemKeys.forEach((key) => (stats[key] = acc[key] / weightSum));
  stats.aftertasteStability = 8 - stats.aftertasteNeg;
  stats.count = dataCount;
  return { stats, reliable: true, nearestD, measuredMatch: nearestD < 0.001, dataCount };
}

function compositeScore(stats) {
  if (!stats) return null;
  return Object.entries(SCORE_WEIGHTS).reduce((sum, [key, weight]) => sum + stats[key] * weight, 0);
}

function controlStats() {
  const reviews = reviewsForFormula("control");
  if (!reviews.length) return null;
  const avg = (key) => average(reviews.map((review) => review[key]));
  const stats = {
    count: reviews.length,
    sweetness: avg("sweetness"),
    sugarLike: avg("sugarLike"),
    aftertasteNeg: avg("aftertasteNeg"),
    body: avg("body"),
    flavorBalance: avg("flavorBalance"),
    overall: avg("overall"),
    repurchase: avg("repurchase")
  };
  stats.aftertasteStability = 8 - stats.aftertasteNeg;
  return stats;
}

// ── 추천 엔진 ──────────────────────────────────────────────
function personalFit(shares, project) {
  const adjustments = [];
  let total = 0;
  const saShare = sugarAlcoholShare(shares);
  if (saShare > 0 && project.giSensitivity !== "low") {
    const penalty = (project.giSensitivity === "high" ? 0.6 : 0.2) * saShare;
    total -= penalty;
    adjustments.push(`위장 민감도(${sensitivityLabel(project.giSensitivity)})로 당알코올 비중 ${Math.round(saShare * 100)}%에 −${penalty.toFixed(2)}점`);
  }
  const hiShare = highIntensityShare(shares);
  if (project.avoidAftertaste && hiShare > 0) {
    const penalty = 0.5 * hiShare;
    total -= penalty;
    adjustments.push(`끝맛 민감 조건으로 고감미료 비중 ${Math.round(hiShare * 100)}%에 −${penalty.toFixed(2)}점`);
  }
  return { total, adjustments };
}

function runSearch(project, options = {}) {
  const caps = hardCaps(project);
  const measured = measuredFormulaStats();
  const candidates = generateCandidates(project);
  const entries = candidates.map((shares) => {
    const safety = evaluateShares(shares, project, caps);
    const prediction = predictStats(shares, measured);
    const composite = compositeScore(prediction.stats);
    const fit = personalFit(shares, project);
    const score = (composite ?? 4) + fit.total + safety.margin * 0.3;
    return { shares, name: sharesName(shares), safety, prediction, stats: prediction.stats, composite, fit, score };
  });

  const passing = entries.filter((entry) => entry.safety.pass).sort((a, b) => b.score - a.score);
  const counts = {
    total: entries.length,
    passed: passing.length,
    overCap: entries.filter((e) => e.safety.overCap.length && !e.safety.excludedByGi.length).length,
    giExcluded: entries.filter((e) => e.safety.excludedByGi.length).length,
    overCost: entries.filter((e) => e.safety.overCost && !e.safety.overCap.length && !e.safety.excludedByGi.length).length
  };

  // 다양성 보장 대안 선정: 이미 뽑힌 배합과 구성 거리 ALT_MIN_DISTANCE 이상
  const selected = [];
  for (const entry of passing) {
    if (selected.length === 3) break;
    if (selected.every((s) => sharesDistance(s.shares, entry.shares) >= ALT_MIN_DISTANCE)) {
      selected.push(entry);
    }
  }
  for (const entry of passing) {
    if (selected.length === 3) break;
    if (!selected.includes(entry)) selected.push(entry);
  }

  const result = {
    empty: !passing.length,
    top: selected[0] || null,
    alternatives: selected.slice(1),
    passing,
    counts,
    caps,
    measuredCount: measured.length,
    reviewCount: state.reviews.length
  };

  if (!options.skipSensitivity && result.top) {
    result.sensitivity = sensitivityCheck(project, result.top);
  }
  return result;
}

// 민감도 미니 체크: 체중 ±10kg, 당도 ±1단계에서 추천 유지 여부
function sensitivityCheck(project, top) {
  const levels = ["mild", "medium", "strong"];
  const variants = [];
  variants.push({ label: `체중 ${project.weight - 10}kg`, project: { ...project, weight: clamp(project.weight - 10, 30, 120) } });
  variants.push({ label: `체중 ${project.weight + 10}kg`, project: { ...project, weight: clamp(project.weight + 10, 30, 120) } });
  const idx = levels.indexOf(project.sweetPreference);
  if (idx > 0) variants.push({ label: `당도 −1단계(${SWEETNESS_PCT[levels[idx - 1]]}%)`, project: { ...project, sweetPreference: levels[idx - 1] } });
  if (idx < levels.length - 1) variants.push({ label: `당도 +1단계(${SWEETNESS_PCT[levels[idx + 1]]}%)`, project: { ...project, sweetPreference: levels[idx + 1] } });

  return variants.map((variant) => {
    const r = runSearch(variant.project, { skipSensitivity: true });
    if (!r.top) return { label: variant.label, status: "none" };
    const same = sharesDistance(r.top.shares, top.shares) < 0.001;
    return { label: variant.label, status: same ? "same" : "changed", topName: r.top.name };
  });
}

// ── 렌더링 ─────────────────────────────────────────────────
let currentResult = null;

function render() {
  currentResult = state.project.hasRun ? runSearch(state.project) : null;
  renderHome();
  renderWizard();
  renderResults();
  renderFormulaOptions();
  renderRecentReviews();
  renderLibrary();
  renderRuleTable();
  renderData();
}

function renderHome() {
  document.getElementById("homeReviewCount").textContent = `${state.reviews.length}건`;
  document.getElementById("homeBatchCount").textContent = `${state.formulas.filter((f) => f.kind === "batch").length}개`;
  document.getElementById("homePassCount").textContent = currentResult ? `${currentResult.counts.passed}개` : "-";
  document.getElementById("homeBest").textContent = currentResult?.top ? currentResult.top.name : "-";
}

// ── 위저드 ─────────────────────────────────────────────────
function renderWizard() {
  document.querySelectorAll(".wizard-step").forEach((step) => {
    step.classList.toggle("hidden", Number(step.dataset.step) !== wizardStep);
  });
  document.querySelectorAll(".step-dot").forEach((dot) => {
    const n = Number(dot.dataset.step);
    dot.classList.toggle("active", n === wizardStep);
    dot.classList.toggle("done", n < wizardStep);
  });
  document.getElementById("wizardPrev").classList.toggle("hidden", wizardStep === 1);
  document.getElementById("wizardNext").classList.toggle("hidden", wizardStep === 4);
  document.getElementById("wizardRun").classList.toggle("hidden", wizardStep !== 4);
  renderIngredientPicker();
  if (wizardStep === 4) renderWizardSummary();
}

function renderIngredientPicker(selection) {
  const picker = document.getElementById("ingredientPicker");
  const form = document.getElementById("wizardForm");
  const naturalOnly = form.naturalOnly.checked;
  const checked = selection || currentPickerSelection();
  picker.innerHTML = ALL_KEYS.map((key) => {
    const r = rule(key);
    const disabled = naturalOnly && !r.natural;
    const isChecked = checked.includes(key) && !disabled;
    return `
      <label class="ingredient-card ${disabled ? "ingredient-disabled" : ""}">
        <input type="checkbox" name="ing_${key}" ${isChecked ? "checked" : ""} ${disabled ? "disabled" : ""} />
        <span class="ingredient-body">
          <strong>${r.name}</strong>
          <span>${r.class} · 감미도 ×${r.sweetness}${r.natural ? " · 천연 유래" : " · 인공"}</span>
          <span>단가 ${r.pricePerKg.toLocaleString()}원/kg${r.verified ? "" : ' · <em class="badge-unverified">검증 전</em>'}</span>
        </span>
      </label>
    `;
  }).join("");
}

function currentPickerSelection() {
  const form = document.getElementById("wizardForm");
  const inputs = [...form.querySelectorAll("#ingredientPicker input[type='checkbox']")];
  if (!inputs.length) return state.project.allowedIngredients;
  return ALL_KEYS.filter((key) => form[`ing_${key}`]?.checked);
}

function readWizardForm() {
  const form = document.getElementById("wizardForm");
  return {
    drinkType: form.drinkType.value,
    servingMl: Number(form.servingMl.value),
    sweetPreference: form.sweetPreference.value,
    weight: Number(form.weight.value),
    giSensitivity: form.giSensitivity.value,
    glucoseCare: form.glucoseCare.checked,
    avoidAftertaste: form.avoidAftertaste.checked,
    allowedIngredients: currentPickerSelection(),
    costCapKrw: Number(form.costCapKrw.value || 0),
    naturalOnly: form.naturalOnly.checked,
    hasRun: true
  };
}

function fillWizardForm(project) {
  const form = document.getElementById("wizardForm");
  form.drinkType.value = project.drinkType;
  form.servingMl.value = project.servingMl;
  form.sweetPreference.value = project.sweetPreference;
  form.weight.value = project.weight;
  form.giSensitivity.value = project.giSensitivity;
  form.glucoseCare.checked = project.glucoseCare;
  form.avoidAftertaste.checked = project.avoidAftertaste;
  form.costCapKrw.value = project.costCapKrw;
  form.naturalOnly.checked = project.naturalOnly;
  renderIngredientPicker(project.allowedIngredients);
}

function renderWizardSummary() {
  const p = readWizardForm();
  const keys = p.allowedIngredients.filter((key) => (p.naturalOnly ? rule(key).natural : true));
  const pairCount = (keys.length * (keys.length - 1)) / 2;
  const tripleCount = (keys.length * (keys.length - 1) * (keys.length - 2)) / 6;
  const total = keys.length + pairCount * 9 + tripleCount * 36;
  document.getElementById("wizardSummary").innerHTML = `
    <article class="segment-item"><strong>제품</strong><p>${p.drinkType} · ${p.servingMl}ml · 당도 ${SWEETNESS_PCT[p.sweetPreference]}% (설탕 당량 ${((SWEETNESS_PCT[p.sweetPreference] * p.servingMl) / 100).toFixed(1)}g)</p></article>
    <article class="segment-item"><strong>타깃</strong><p>체중 ${p.weight}kg · 위장 ${sensitivityLabel(p.giSensitivity)} · 혈당 관리 ${p.glucoseCare ? "ON" : "OFF"} · 끝맛 민감 ${p.avoidAftertaste ? "ON" : "OFF"}</p></article>
    <article class="segment-item"><strong>원료·제약</strong><p>${keys.map((k) => rule(k).name).join(", ") || "없음"} · 원가 상한 ${p.costCapKrw > 0 ? p.costCapKrw.toLocaleString() + "원/잔" : "무제한"} · ${p.naturalOnly ? "천연 유래만" : "라벨링 제약 없음"}</p></article>
    <article class="segment-item"><strong>탐색 공간</strong><p>약 ${total}개 배합 (단독 ${keys.length} + 2종 조합 ${pairCount * 9} + 3종 조합 ${tripleCount * 36})</p></article>
  `;
}

// ── 결과 ───────────────────────────────────────────────────
function renderResults() {
  const empty = document.getElementById("resultsEmpty");
  const body = document.getElementById("resultsBody");
  if (!currentResult) {
    empty.classList.remove("hidden");
    body.classList.add("hidden");
    return;
  }
  empty.classList.add("hidden");
  body.classList.remove("hidden");

  const result = currentResult;
  document.getElementById("metricSearched").textContent = `${result.counts.total}개`;
  document.getElementById("metricPassed").textContent = `${result.counts.passed}개`;
  document.getElementById("metricBest").textContent = result.top ? result.top.name : "후보 없음";
  const control = compositeScore(controlStats());
  document.getElementById("metricRetention").textContent =
    result.top && control && result.top.composite ? `${Math.round((result.top.composite / control) * 100)}%` : "-";

  renderRecommendation(result);
  renderCalcDetails(result);
  renderSensitivity(result);
  renderScoreBars(result);
  renderCompare(result, control);
  drawScatter(result);
  drawRadar(result);
}

function renderRecommendation(result) {
  const recommendation = document.getElementById("recommendation");
  const reasonList = document.getElementById("reasonList");

  if (result.empty) {
    recommendation.innerHTML = `
      <article class="notice-card">
        <h3>안전·제약 기준을 만족하는 후보가 없습니다</h3>
        <p>탐색 ${result.counts.total}개 중 상한 초과 ${result.counts.overCap}개, 혈당 필터 제외 ${result.counts.giExcluded}개, 원가 초과 ${result.counts.overCost}개로 모두 제외되었습니다.</p>
        <p><strong>목표 당도를 한 단계 낮추거나</strong>, 제공량·원가 상한·원료 선택을 조정해 주세요.</p>
      </article>
    `;
    reasonList.innerHTML = "";
    return;
  }

  const cardFor = (entry, rank) => {
    const tag = rank === 0 ? "추천" : `대안 ${rank}`;
    const predBadge = entry.prediction.measuredMatch
      ? '<em class="badge-measured">실측</em>'
      : '<em class="badge-predicted">예측</em>';
    const ingredients = entry.safety.perIngredient
      .map((item) => `
        <div class="spec">
          <span>${item.rule.name}</span>
          <strong>${formatAmount(item.amountMg, item.rule.unit)}</strong>
        </div>
      `)
      .join("");
    return `
      <article class="recommend-card ${rank === 0 ? "" : "alt-card"}">
        <span class="recommend-score">${tag} · 최종 ${entry.score.toFixed(2)}점</span>
        ${predBadge}
        <h3>${entry.name}</h3>
        <p>예상 ${Math.round(entry.safety.kcal)}kcal · 원가 ${Math.round(entry.safety.costKrw)}원/잔 · 안전 여유 ${Math.round(entry.safety.margin * 100)}%</p>
        <div class="spec-grid">${ingredients}</div>
        <button type="button" class="ghost-button sheet-button" data-sheet="${rank}">실험 시트 내보내기</button>
      </article>
    `;
  };

  recommendation.innerHTML = [result.top, ...result.alternatives]
    .map((entry, index) => cardFor(entry, index))
    .join("");
  reasonList.innerHTML = recommendationReasons(result).map((reason) => `<li>${reason}</li>`).join("");
}

function recommendationReasons(result) {
  const { top, counts } = result;
  const project = state.project;
  const reasons = [];

  reasons.push(
    `선택 원료 ${allowedKeys(project).length}종으로 ${counts.total}개 배합을 자동 탐색해 안전·제약 통과 ${counts.passed}개 중 1위입니다.`
  );

  const scoreLabel = top.prediction.measuredMatch ? "실측 종합 관능 점수" : "예측 종합 관능 점수";
  if (top.composite) {
    const bestItem = Object.keys(SCORE_WEIGHTS)
      .map((key) => ({ key, value: top.stats[key] }))
      .sort((a, b) => b.value - a.value)[0];
    reasons.push(
      `${scoreLabel} ${top.composite.toFixed(2)}점(7점 만점). 관능 데이터 ${result.reviewCount}건 기반이며, 가장 가까운 실측 배합과의 구성 거리는 ${top.prediction.nearestD.toFixed(2)}입니다. 강점 항목은 ${scoreItemLabel(bestItem.key)}(${bestItem.value.toFixed(1)}점)입니다.`
    );
  } else {
    reasons.push("주변에 실측 관능 데이터가 없어 기본 점수로 평가되었습니다. 이 배합을 실험·평가하면 예측이 정교해집니다.");
  }

  const worst = [...top.safety.perIngredient].sort((a, b) => b.usage - a.usage)[0];
  reasons.push(
    `안전 사용률이 가장 높은 성분은 ${worst.rule.name}로, 하드 캡(${formatAmount(worst.capMg, worst.rule.unit)}) 대비 ${Math.round(worst.usage * 100)}% 사용합니다. 모든 성분이 체중 ${project.weight}kg 기준 섭취 상한 안에 있습니다.`
  );

  if (top.fit.adjustments.length) {
    reasons.push(`개인 조건 보정: ${top.fit.adjustments.join(", ")}.`);
  }

  const excludedParts = [];
  if (counts.overCap) excludedParts.push(`상한 초과 ${counts.overCap}개`);
  if (counts.giExcluded) excludedParts.push(`혈당 필터 제외 ${counts.giExcluded}개`);
  if (counts.overCost) excludedParts.push(`원가 초과 ${counts.overCost}개`);
  if (excludedParts.length) reasons.push(`제외된 후보: ${excludedParts.join(" · ")}.`);

  const sugarEq = targetSugarEqG(project);
  const sugarKcal = sugarEq * SUGAR_KCAL_PER_G;
  const sugarCost = (sugarEq / 1000) * SUGAR_PRICE_PER_KG;
  const kcalCut = sugarKcal ? Math.round((1 - top.safety.kcal / sugarKcal) * 100) : 0;
  reasons.push(
    `같은 당도의 설탕 음료(${sugarEq.toFixed(1)}g, ${Math.round(sugarKcal)}kcal, 원가 약 ${Math.round(sugarCost)}원) 대비 당류 100% 감소, 칼로리 약 ${kcalCut}% 감소, 원가는 ${Math.round(top.safety.costKrw)}원/잔입니다.`
  );

  return reasons;
}

function renderCalcDetails(result) {
  const box = document.getElementById("calcDetails");
  if (result.empty) {
    box.innerHTML = "";
    return;
  }
  const project = state.project;
  const top = result.top;
  const sugarEq = targetSugarEqG(project);
  const lines = top.safety.perIngredient.map((item) => `
    <li>${item.rule.name}: ${sugarEq.toFixed(1)}g × ${Math.round(item.share * 100)}% ÷ 감미도 ${item.rule.sweetness} = <strong>${formatAmount(item.amountMg, item.rule.unit)}</strong> ≤ 하드 캡 ${formatAmount(item.capMg, item.rule.unit)} (사용률 ${Math.round(item.usage * 100)}%)</li>
  `).join("");
  box.innerHTML = `
    <details class="calc-details">
      <summary>계산 과정 펼쳐보기</summary>
      <ol>
        <li>목표 당도 ${SWEETNESS_PCT[project.sweetPreference]}% × ${project.servingMl}ml ÷ 100 = 설탕 당량 <strong>${sugarEq.toFixed(1)}g</strong></li>
        ${lines}
        <li>하드 캡 = min(체중 ${project.weight}kg × ADI(또는 내약 상한) × 1잔 배분율 50%, 맛 상한선)${project.giSensitivity !== "low" ? ` · 당알코올 ×${GUT_FACTOR[project.giSensitivity]} 하향` : ""}</li>
        <li>최종 점수 = 종합 관능 ${top.composite ? top.composite.toFixed(2) : "4.00(기본)"} + 개인 보정 ${top.fit.total.toFixed(2)} + 안전 여유 가점 ${(top.safety.margin * 0.3).toFixed(2)} = <strong>${top.score.toFixed(2)}점</strong></li>
      </ol>
    </details>
  `;
}

function renderSensitivity(result) {
  const box = document.getElementById("sensitivityBox");
  if (result.empty || !result.sensitivity) {
    box.innerHTML = "";
    return;
  }
  const chips = result.sensitivity.map((item) => {
    if (item.status === "same") return `<span class="sens-chip sens-same">${item.label} → 추천 유지</span>`;
    if (item.status === "changed") return `<span class="sens-chip sens-changed">${item.label} → ${item.topName}</span>`;
    return `<span class="sens-chip sens-none">${item.label} → 후보 없음</span>`;
  }).join("");
  box.innerHTML = `
    <div class="sens-block">
      <span class="label">Robustness</span>
      <p class="chart-note" style="margin-top:4px">조건이 조금 달라져도 추천이 유지되는지 확인합니다.</p>
      <div class="sens-chips">${chips}</div>
    </div>
  `;
}

function renderScoreBars(result) {
  const scoreBars = document.getElementById("scoreBars");
  const top10 = result.passing.slice(0, 10);
  const maxScore = Math.max(...top10.map((entry) => entry.score), 1);
  scoreBars.innerHTML = top10
    .map((entry) => `
      <div class="bar-item">
        <strong>${entry.name} <span class="bar-values">${entry.score.toFixed(2)}</span></strong>
        <div class="bar-row"><div class="bar-fill" style="width:${Math.round((entry.score / maxScore) * 100)}%"></div></div>
      </div>
    `)
    .join("");
  document.getElementById("rankingNote").textContent = result.counts.passed > 10
    ? `외 ${result.counts.passed - 10}개 배합이 추가로 통과했습니다.`
    : "";
}

function renderCompare(result, control) {
  const sugarEq = targetSugarEqG(state.project);
  const sugarKcal = sugarEq * SUGAR_KCAL_PER_G;
  const stats = controlStats();
  const compareCards = document.getElementById("compareCards");
  const compareBars = document.getElementById("compareBars");
  const compareLegend = document.getElementById("compareLegend");

  if (result.empty || !result.top) {
    document.getElementById("compareSugar").textContent = "-";
    document.getElementById("compareKcal").textContent = "-";
    document.getElementById("compareRetention").textContent = "-";
    compareCards.innerHTML = `<p class="chart-note">추천 후보가 없어 비교를 표시할 수 없습니다.</p>`;
    compareBars.innerHTML = "";
    compareLegend.innerHTML = "";
    return;
  }

  const top = result.top;
  const kcalCut = sugarKcal ? Math.round((1 - top.safety.kcal / sugarKcal) * 100) : 0;
  const retention = control && top.composite ? Math.round((top.composite / control) * 100) : null;

  document.getElementById("compareSugar").textContent = "100%";
  document.getElementById("compareKcal").textContent = `${kcalCut}%`;
  document.getElementById("compareRetention").textContent = retention ? `${retention}%` : "-";

  compareCards.innerHTML = `
    <article class="compare-card">
      <span class="label">설탕 대조군</span>
      <h3>설탕 ${sugarEq.toFixed(1)}g</h3>
      <p>당류 ${sugarEq.toFixed(1)}g · ${Math.round(sugarKcal)}kcal · 관능 종합 ${control ? control.toFixed(2) : "-"}점</p>
    </article>
    <article class="compare-card compare-best">
      <span class="label">추천 배합</span>
      <h3>${top.name}</h3>
      <p>당류 0g · ${Math.round(top.safety.kcal)}kcal · 관능 종합 ${top.composite ? top.composite.toFixed(2) : "-"}점${top.prediction.measuredMatch ? " (실측)" : " (예측)"}</p>
    </article>
  `;

  compareLegend.innerHTML = `
    <span class="legend-item"><i style="background:#a8b08c"></i>설탕 대조군</span>
    <span class="legend-item"><i style="background:#6e7f3e"></i>${top.name}</span>
  `;

  compareBars.innerHTML = RADAR_AXES.map(([key, label]) => {
    const controlValue = stats ? stats[key] : 0;
    const topValue = top.stats ? top.stats[key] : 0;
    return `
      <div class="bar-item">
        <strong>${label} <span class="bar-values">${controlValue.toFixed(1)} vs ${topValue.toFixed(1)}</span></strong>
        <div class="bar-row"><div class="bar-fill" style="width:${Math.round((controlValue / 7) * 100)}%; background:#a8b08c"></div></div>
        <div class="bar-row"><div class="bar-fill" style="width:${Math.round((topValue / 7) * 100)}%; background:#6e7f3e"></div></div>
      </div>
    `;
  }).join("");
}

// ── 평가 입력 ──────────────────────────────────────────────
function renderFormulaOptions() {
  const formulaSelect = document.getElementById("formulaSelect");
  const groups = [
    ["실험 배치", state.formulas.filter((f) => f.kind === "batch").map((f) => [f.id, `${f.blindCode} (블라인드)`])],
    ["기준 배합", state.formulas.filter((f) => f.kind === "seed").map((f) => [f.id, f.name])],
    ["내 배합", state.formulas.filter((f) => f.kind === "custom").map((f) => [f.id, f.name])],
    ["대조군", state.formulas.filter((f) => f.kind === "control").map((f) => [f.id, f.name])]
  ];
  formulaSelect.innerHTML = groups
    .filter(([, items]) => items.length)
    .map(([label, items]) => `
      <optgroup label="${label}">
        ${items.map(([id, name]) => `<option value="${id}">${name}</option>`).join("")}
      </optgroup>
    `)
    .join("");
}

// ── 관능평가 척도 (7칸 세그먼트, 탭 1회 입력) ──────────────
function buildSurveyItems() {
  const list = document.getElementById("likertList");
  list.innerHTML = SENSORY_FIELDS.map(([key, label]) => {
    const reverseHint = REVERSE_ITEMS[key];
    return `
      <fieldset class="likert-row" data-item="${key}">
        <div class="likert-title">
          <strong>${label}</strong>
          ${reverseHint ? `<em class="badge-reverse">역방향</em>` : ""}
        </div>
        ${reverseHint ? `<p class="likert-hint">${reverseHint}</p>` : ""}
        <div class="likert-scale" role="radiogroup" aria-label="${label}">
          ${[1, 2, 3, 4, 5, 6, 7].map((value) => `
            <label>
              <input type="radio" name="${key}" value="${value}" />
              <span>${value}</span>
            </label>
          `).join("")}
        </div>
        <div class="likert-anchors"><span>전혀 그렇지 않다</span><span>매우 그렇다</span></div>
      </fieldset>
    `;
  }).join("");
}

function surveyAnsweredCount() {
  const form = document.getElementById("surveyForm");
  return SENSORY_FIELDS.filter(([key]) => form.elements[key].value !== "").length;
}

function updateSurveyProgress() {
  document.getElementById("surveyProgress").textContent = `${surveyAnsweredCount()}/${SENSORY_FIELDS.length} 응답`;
}

function showSurveyMessage(text, isError) {
  const message = document.getElementById("surveyMessage");
  message.hidden = false;
  message.textContent = text;
  message.classList.toggle("survey-message-error", Boolean(isError));
}

function resetSurveyScores() {
  document.querySelectorAll("#likertList input[type='radio']").forEach((radio) => (radio.checked = false));
  document.querySelectorAll("#likertList .likert-missing").forEach((row) => row.classList.remove("likert-missing"));
  document.getElementById("surveyForm").comment.value = "";
  updateSurveyProgress();
}

function renderRecentReviews() {
  const recentReviews = document.getElementById("recentReviews");
  const reviews = [...state.reviews].slice(-6).reverse();
  recentReviews.innerHTML = reviews
    .map((review) => {
      const formula = formulaById(review.formulaId);
      const name = formula ? (formula.kind === "batch" ? `${formula.blindCode} ${formula.name}` : formula.name) : "삭제된 배합";
      return `
        <article class="review-item">
          <strong>${name} · 기호도 ${review.overall}점</strong>
          <p>${review.segment} · ${review.comment || "의견 없음"}</p>
        </article>
      `;
    })
    .join("");
}

// ── 라이브러리 ─────────────────────────────────────────────
function renderLibrary() {
  const batchList = document.getElementById("batchList");
  const batches = state.formulas.filter((f) => f.kind === "batch");
  batchList.innerHTML = batches.length
    ? batches
        .map((batch) => {
          const count = reviewsForFormula(batch.id).length;
          return `
            <article class="formula-card">
              <header>
                <div>
                  <span class="label">${batch.blindCode}</span>
                  <h2>${batch.name}</h2>
                </div>
                <span class="pill">평가 ${count}건</span>
              </header>
              <div class="spec-grid">
                <div class="spec"><span>제공량</span><strong>${batch.snapshot.servingMl}ml · 당도 ${batch.snapshot.sweetPct}%</strong></div>
                <div class="spec"><span>등록일</span><strong>${batch.snapshot.createdAt.slice(0, 10)}</strong></div>
              </div>
              <div class="gauge-stack">
                ${batch.snapshot.amounts.map((a) => `<div class="gauge-item"><span>${a.name} ${a.display}</span></div>`).join("")}
              </div>
              <button type="button" class="ghost-button sheet-button" data-batch-sheet="${batch.id}">실험 시트 다시 받기</button>
            </article>
          `;
        })
        .join("")
    : `<p class="chart-note">아직 등록된 배치가 없습니다. 탐색 결과에서 "실험 시트 내보내기"를 누르면 배치가 등록되고 평가 입력과 연결됩니다.</p>`;

  const formulaGrid = document.getElementById("formulaGrid");
  const caps = hardCaps(state.project);
  const measured = measuredFormulaStats();
  const cards = state.formulas
    .filter((f) => f.kind === "seed" || f.kind === "custom")
    .map((formula) => {
      const safety = evaluateShares(formula.shares, state.project, caps);
      const reviews = reviewsForFormula(formula.id);
      const prediction = predictStats(formula.shares, measured);
      const composite = compositeScore(prediction.stats);
      const status = safety.excludedByGi.length
        ? `혈당 필터 제외`
        : safety.overCap.length
          ? `상한 초과 (${safety.overCap.join(", ")})`
          : safety.overCost
            ? "원가 초과"
            : "통과";
      return `
        <article class="formula-card ${safety.pass ? "" : "formula-failed"}">
          <header>
            <div>
              <span class="label">${formula.kind === "custom" ? "내 배합" : "기준 배합"} · ${sharesLabel(formula.shares)}</span>
              <h2>${formula.name}</h2>
            </div>
            <span class="pill">${composite ? composite.toFixed(1) + "점" : "데이터 없음"}</span>
          </header>
          <div class="spec-grid">
            <div class="spec"><span>현재 조건 판정</span><strong>${status}</strong></div>
            <div class="spec"><span>안전 여유</span><strong>${Math.round(safety.margin * 100)}%</strong></div>
            <div class="spec"><span>원가</span><strong>${Math.round(safety.costKrw)}원/잔</strong></div>
            <div class="spec"><span>평가 수</span><strong>${reviews.length}건</strong></div>
          </div>
        </article>
      `;
    });

  const control = compositeScore(controlStats());
  const sugarEq = targetSugarEqG(state.project);
  cards.unshift(`
    <article class="formula-card control-card">
      <header>
        <div>
          <span class="label">기준선</span>
          <h2>설탕 대조군</h2>
        </div>
        <span class="pill">${control ? control.toFixed(1) + "점" : "데이터 없음"}</span>
      </header>
      <div class="spec-grid">
        <div class="spec"><span>설탕</span><strong>${sugarEq.toFixed(1)}g</strong></div>
        <div class="spec"><span>칼로리</span><strong>${Math.round(sugarEq * SUGAR_KCAL_PER_G)}kcal</strong></div>
        <div class="spec"><span>역할</span><strong>블라인드 비교 기준</strong></div>
        <div class="spec"><span>평가 수</span><strong>${reviewsForFormula("control").length}건</strong></div>
      </div>
    </article>
  `);
  formulaGrid.innerHTML = cards.join("");
}

// ── 룰 테이블 ──────────────────────────────────────────────
function renderRuleTable() {
  const table = document.getElementById("ruleTable");
  table.innerHTML = `
    <thead>
      <tr>
        <th>성분</th><th>분류</th><th>감미도</th><th>기준치</th><th>GI</th><th>천연</th>
        <th>맛 상한선</th><th>단가(원/kg)</th><th>출처 / 버전</th>
      </tr>
    </thead>
    <tbody>
      ${ALL_KEYS.map((key) => {
        const r = rule(key);
        const base = RULE_TABLE[key];
        const basis = r.adiMgKg ? `ADI ${r.adiMgKg}mg/kg` : `내약 ${r.toleranceMgKg}mg/kg`;
        const capDisplay = r.unit === "g" ? (r.tasteCapMg / 1000).toFixed(1) : Math.round(r.tasteCapMg);
        const overridden = state.ruleOverrides[key] ? ' <em class="badge-overridden">수정됨</em>' : "";
        return `
          <tr data-key="${key}">
            <td><strong>${r.name}</strong>${r.verified ? "" : ' <em class="badge-unverified">검증 전</em>'}${overridden}</td>
            <td>${r.class}</td>
            <td>×${r.sweetness}</td>
            <td>${basis}</td>
            <td>${r.gi}</td>
            <td>${r.natural ? "예" : "아니오"}</td>
            <td><input type="number" min="1" step="any" name="cap_${key}" value="${capDisplay}" /> ${r.unit === "g" ? "g" : "mg"}/잔</td>
            <td><input type="number" min="0" step="100" name="price_${key}" value="${r.pricePerKg}" /></td>
            <td class="rule-source">${base.source} · ${base.version}</td>
          </tr>
        `;
      }).join("")}
    </tbody>
  `;
}

// ── 데이터 관리 ────────────────────────────────────────────
function renderData() {
  document.getElementById("dataReviewCount").textContent = `${state.reviews.length}건`;
  document.getElementById("dataFormulaCount").textContent = `${state.formulas.filter((f) => f.kind === "seed" || f.kind === "custom").length}개`;
  document.getElementById("dataBatchCount").textContent = `${state.formulas.filter((f) => f.kind === "batch").length}개`;
  document.getElementById("dataOverrideCount").textContent = `${Object.keys(state.ruleOverrides).length}건`;
}

// ── 차트 ───────────────────────────────────────────────────
function setupCanvas(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width) return null;
  canvas.width = rect.width * ratio;
  canvas.height = rect.height * ratio;
  const ctx = canvas.getContext("2d");
  ctx.scale(ratio, ratio);
  return { ctx, width: rect.width, height: rect.height };
}

function drawScatter(result) {
  const scatterChart = document.getElementById("scatterChart");
  const setup = setupCanvas(scatterChart);
  if (!setup) return;
  const { ctx, width, height } = setup;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fafaf2";
  ctx.fillRect(0, 0, width, height);
  const pad = 44;
  ctx.strokeStyle = "#e3e2d4";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = pad + ((height - pad * 2) / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(width - pad, y);
    ctx.stroke();
  }
  ctx.fillStyle = "#7c8068";
  ctx.font = "12px Pretendard, system-ui";
  ctx.fillText("안전 여유도 →", pad, height - 14);
  ctx.fillText("관능 예측점수 ↑", 12, pad - 14);

  const points = result.passing.slice(0, 40);
  points.forEach((entry, index) => {
    const composite = entry.composite ?? 4;
    const x = pad + entry.safety.margin * (width - pad * 2);
    const y = height - pad - ((composite - 1) / 6) * (height - pad * 2);
    const r = index === 0 ? 10 : index < 5 ? 7 : 4.5;
    ctx.beginPath();
    ctx.fillStyle = index === 0 ? "#56632f" : "#6e7f3e";
    ctx.globalAlpha = index < 5 ? 1 : 0.45;
    ctx.arc(clamp(x, pad, width - pad), clamp(y, pad, height - pad), r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    if (index < 5) {
      ctx.fillStyle = "#343828";
      ctx.fillText(entry.name, clamp(x + 12, pad, width - 180), clamp(y + 4, pad, height - pad));
    }
  });
}

function drawRadar(result) {
  const radarChart = document.getElementById("radarChart");
  const radarLegend = document.getElementById("radarLegend");
  const setup = setupCanvas(radarChart);
  if (!setup) return;
  const { ctx, width, height } = setup;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fafaf2";
  ctx.fillRect(0, 0, width, height);

  if (result.empty || !result.top) {
    ctx.fillStyle = "#7c8068";
    ctx.font = "14px Pretendard, system-ui";
    ctx.fillText("추천 후보가 없어 프로파일을 표시할 수 없습니다.", 24, 40);
    radarLegend.innerHTML = "";
    return;
  }

  const cx = width / 2;
  const cy = height / 2 + 8;
  const radius = Math.min(width, height) / 2 - 52;
  const axes = RADAR_AXES;
  const angleFor = (index) => -Math.PI / 2 + (index * 2 * Math.PI) / axes.length;

  ctx.strokeStyle = "#e3e2d4";
  ctx.fillStyle = "#7c8068";
  ctx.font = "12px Pretendard, system-ui";
  for (let level = 1; level <= 3; level += 1) {
    ctx.beginPath();
    axes.forEach((_, index) => {
      const r = (radius * level) / 3;
      const x = cx + r * Math.cos(angleFor(index));
      const y = cy + r * Math.sin(angleFor(index));
      index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
  }
  axes.forEach(([, label], index) => {
    const x = cx + (radius + 26) * Math.cos(angleFor(index));
    const y = cy + (radius + 26) * Math.sin(angleFor(index));
    ctx.textAlign = "center";
    ctx.fillText(label, x, y + 4);
  });

  const series = [
    { entry: result.top, color: "#6e7f3e" },
    ...result.alternatives.map((entry, index) => ({ entry, color: index === 0 ? "#b8a04e" : "#a8b08c" }))
  ];

  series.forEach(({ entry, color }) => {
    if (!entry.stats) return;
    ctx.beginPath();
    axes.forEach(([key], index) => {
      const value = clamp(entry.stats[key], 1, 7);
      const r = ((value - 1) / 6) * radius;
      const x = cx + r * Math.cos(angleFor(index));
      const y = cy + r * Math.sin(angleFor(index));
      index === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = color + "26";
    ctx.fill();
  });

  radarLegend.innerHTML = series
    .map(({ entry, color }, index) => `
      <span class="legend-item"><i style="background:${color}"></i>${index === 0 ? "추천" : `대안 ${index}`} · ${entry.name}</span>
    `)
    .join("");
}

// ── 실험 시트 / 배치 ───────────────────────────────────────
function registerBatch(entry) {
  const batchNumber = state.formulas.filter((f) => f.kind === "batch").length + 1;
  const blindCode = `BL-${String(batchNumber).padStart(3, "0")}`;
  const batch = {
    id: `b${Date.now()}`,
    kind: "batch",
    name: entry.name,
    shares: entry.shares,
    blindCode,
    snapshot: {
      servingMl: state.project.servingMl,
      sweetPct: SWEETNESS_PCT[state.project.sweetPreference],
      createdAt: new Date().toISOString(),
      amounts: entry.safety.perIngredient.map((item) => ({
        name: item.rule.name,
        display: formatAmount(item.amountMg, item.rule.unit),
        amountMg: item.amountMg,
        unit: item.rule.unit
      })),
      kcal: entry.safety.kcal
    }
  };
  state.formulas.push(batch);
  saveState();
  return batch;
}

function exportBatchSheet(batch) {
  const rows = [
    ["실험 시트", ""],
    ["배치 ID", batch.id],
    ["블라인드 코드", batch.blindCode],
    ["배합명 (패널 비공개)", batch.name],
    ["생성일", batch.snapshot.createdAt],
    ["제공량(ml)", batch.snapshot.servingMl],
    ["목표 당도(%)", batch.snapshot.sweetPct],
    ["예상 칼로리(kcal)", Math.round(batch.snapshot.kcal)],
    ["", ""],
    ["성분", "칭량값"]
  ];
  batch.snapshot.amounts.forEach((a) => rows.push([a.name, a.display]));
  rows.push(["", ""]);
  rows.push(["제조 순서", ""]);
  rows.push(["1", "정수된 물(또는 베이스)을 계량한다"]);
  rows.push(["2", "감미료를 위 칭량값대로 계량해 완전히 용해한다"]);
  rows.push(["3", "베이스(차·과즙 등)를 넣고 동일 온도(냉장 4℃)로 맞춘다"]);
  rows.push(["4", `블라인드 코드 ${batch.blindCode}로 표기해 제공한다`]);
  downloadCsv(rows, `sheet-${batch.blindCode}.csv`);
}

function downloadCsv(rows, filename) {
  const csv = "﻿" + rows.map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

// ── 유틸 ───────────────────────────────────────────────────
function formatAmount(mg, unit) {
  return unit === "g" ? `${(mg / 1000).toFixed(1)}g` : `${Math.round(mg)}mg`;
}

function sharesLabel(shares) {
  return Object.entries(shares)
    .sort((a, b) => b[1] - a[1])
    .map(([key, share]) => `${rule(key).name} ${Math.round(share * 100)}%`)
    .join(" · ");
}

function scoreItemLabel(key) {
  return {
    overall: "전체 기호도",
    sugarLike: "설탕 유사도",
    sweetness: "단맛 만족도",
    body: "바디감",
    flavorBalance: "향미 균형",
    aftertasteStability: "끝맛 안정성"
  }[key];
}

function sensitivityLabel(value) {
  return { low: "둔감", medium: "보통", high: "예민" }[value];
}

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

const TAB_META = {
  home: ["홈", "맛 만족도와 섭취 안전성을 동시에 고려한 저당 음료 배합 R&D 자동화 도구"],
  explore: ["배합 탐색", "조건 4단계를 입력하면 후보 배합을 자동으로 탐색합니다"],
  results: ["탐색 결과", "안전 상한과 제약을 통과한 배합만 관능 예측 점수로 정렬했습니다"],
  survey: ["평가 입력", "7점 척도 관능평가를 입력하면 예측 엔진이 자동으로 갱신됩니다"],
  library: ["라이브러리", "실험 배치와 기준·커스텀 배합을 관리합니다"],
  rules: ["룰 테이블", "성분 기준치와 단가를 출처·버전과 함께 관리합니다"],
  data: ["데이터 관리", "프로젝트 파일과 관능 데이터를 내보내고 가져옵니다"]
};

function switchTab(tabId) {
  document.querySelectorAll(".nav-button").forEach((button) => button.classList.toggle("active", button.dataset.tab === tabId));
  document.querySelectorAll(".tab-panel").forEach((panel) => panel.classList.toggle("active", panel.id === tabId));
  const [title, desc] = TAB_META[tabId] || TAB_META.home;
  document.getElementById("pageTitle").textContent = title;
  document.getElementById("pageDesc").textContent = desc;
  render();
}

// ── 이벤트 ─────────────────────────────────────────────────
document.querySelectorAll(".nav-button").forEach((tabButton) => {
  tabButton.addEventListener("click", () => switchTab(tabButton.dataset.tab));
});

document.getElementById("startWizard").addEventListener("click", () => {
  wizardStep = 1;
  switchTab("explore");
});
document.getElementById("goWizard").addEventListener("click", () => {
  wizardStep = 1;
  switchTab("explore");
});

document.getElementById("wizardNext").addEventListener("click", () => {
  if (wizardStep === 3 && !currentPickerSelection().length) {
    alert("원료를 1종 이상 선택해 주세요.");
    return;
  }
  wizardStep = Math.min(4, wizardStep + 1);
  renderWizard();
});

document.getElementById("wizardPrev").addEventListener("click", () => {
  wizardStep = Math.max(1, wizardStep - 1);
  renderWizard();
});

document.getElementById("stepIndicator").addEventListener("click", (event) => {
  const dot = event.target.closest(".step-dot");
  if (!dot) return;
  wizardStep = Number(dot.dataset.step);
  renderWizard();
});

document.getElementById("wizardForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const project = readWizardForm();
  if (!allowedKeys(project).length) {
    alert("제약 조건을 만족하는 원료가 없습니다. 원료 선택이나 라벨링 조건을 확인해 주세요.");
    return;
  }
  state.project = project;
  saveState();
  switchTab("results");
});

document.getElementById("wizardForm").addEventListener("change", (event) => {
  if (event.target.name === "drinkType") {
    const form = document.getElementById("wizardForm");
    form.sweetPreference.value = DRINK_DEFAULT_SWEETNESS[form.drinkType.value] || "medium";
  }
  if (event.target.name === "naturalOnly") {
    renderIngredientPicker();
  }
  if (wizardStep === 4) renderWizardSummary();
});

document.getElementById("presetRow").addEventListener("click", (event) => {
  const button = event.target.closest(".preset-button");
  if (!button) return;
  const preset = PRESETS[button.dataset.preset];
  const form = document.getElementById("wizardForm");
  form.weight.value = preset.weight;
  form.giSensitivity.value = preset.giSensitivity;
  form.glucoseCare.checked = preset.glucoseCare;
  form.avoidAftertaste.checked = preset.avoidAftertaste;
  document.querySelectorAll(".preset-button").forEach((b) => b.classList.toggle("active", b === button));
});

// 추천 카드의 실험 시트 내보내기 (배치 등록 + CSV)
document.getElementById("recommendation").addEventListener("click", (event) => {
  const button = event.target.closest("[data-sheet]");
  if (!button || !currentResult) return;
  const rank = Number(button.dataset.sheet);
  const entry = rank === 0 ? currentResult.top : currentResult.alternatives[rank - 1];
  if (!entry) return;
  const batch = registerBatch(entry);
  exportBatchSheet(batch);
  render();
  alert(`배치 ${batch.blindCode}가 등록되었습니다. 평가 입력에서 블라인드 코드로 선택할 수 있습니다.`);
});

// 라이브러리의 배치 시트 재다운로드
document.getElementById("batchList").addEventListener("click", (event) => {
  const button = event.target.closest("[data-batch-sheet]");
  if (!button) return;
  const batch = formulaById(button.dataset.batchSheet);
  if (batch) exportBatchSheet(batch);
});

document.getElementById("openFormulaForm").addEventListener("click", () => {
  document.getElementById("formulaForm").classList.toggle("hidden");
});

document.getElementById("formulaForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  const shares = {};
  let sum = 0;
  for (const key of ALL_KEYS) {
    const value = Number(data[`share_${key}`] || 0);
    if (value > 0) shares[key] = value / 100;
    sum += value;
  }
  if (Math.abs(sum - 100) > 0.5) {
    alert(`성분 비중의 합이 100%가 되어야 합니다. (현재 ${sum}%)`);
    return;
  }
  state.formulas.push({ id: `f${Date.now()}`, kind: "custom", name: data.name, shares });
  event.currentTarget.reset();
  event.currentTarget.classList.add("hidden");
  saveState();
  render();
});

// 척도 선택: 진행 카운터 갱신 + 미응답 강조 해제
document.getElementById("likertList").addEventListener("change", (event) => {
  event.target.closest(".likert-row")?.classList.remove("likert-missing");
  updateSurveyProgress();
});

// 숫자키 1~7로 빠른 입력 (항목에 포커스가 있을 때)
document.getElementById("likertList").addEventListener("keydown", (event) => {
  if (!/^[1-7]$/.test(event.key)) return;
  const row = event.target.closest(".likert-row");
  if (!row) return;
  const radio = row.querySelector(`input[value="${event.key}"]`);
  if (radio) {
    radio.checked = true;
    radio.dispatchEvent(new Event("change", { bubbles: true }));
    event.preventDefault();
  }
});

document.getElementById("surveyForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const form = event.currentTarget;

  // 미응답 항목이 있으면 제출 차단 + 해당 항목 강조
  const missing = SENSORY_FIELDS.filter(([key]) => form.elements[key].value === "");
  if (missing.length) {
    missing.forEach(([key]) => {
      document.querySelector(`.likert-row[data-item="${key}"]`)?.classList.add("likert-missing");
    });
    const first = document.querySelector(`.likert-row[data-item="${missing[0][0]}"]`);
    first?.scrollIntoView({ behavior: "smooth", block: "center" });
    showSurveyMessage(`${missing.length}개 항목이 미응답입니다. 표시된 항목을 선택해 주세요.`, true);
    return;
  }

  const data = Object.fromEntries(new FormData(form));
  state.reviews.push(
    makeReview(
      data.segment,
      data.formulaId,
      SENSORY_FIELDS.map(([key]) => Number(data[key])),
      data.comment
    )
  );
  saveState();

  // 연속 입력: 평가 대상·참여자 그룹은 유지하고 점수·의견만 초기화
  const target = formulaById(data.formulaId);
  const targetName = target ? (target.kind === "batch" ? target.blindCode : target.name) : "평가 대상";
  resetSurveyScores();
  showSurveyMessage(`${targetName} 평가가 저장되었습니다. (해당 대상 누적 ${reviewsForFormula(data.formulaId).length}건)`, false);
  render();
});

// 룰 테이블 저장/복원
document.getElementById("ruleSave").addEventListener("click", () => {
  document.querySelectorAll("#ruleTable tbody tr").forEach((row) => {
    const key = row.dataset.key;
    const base = RULE_TABLE[key];
    const capInput = Number(row.querySelector(`[name="cap_${key}"]`).value);
    const priceInput = Number(row.querySelector(`[name="price_${key}"]`).value);
    const tasteCapMg = base.unit === "g" ? capInput * 1000 : capInput;
    const override = {};
    if (Math.abs(tasteCapMg - base.tasteCapMg) > 0.01) override.tasteCapMg = tasteCapMg;
    if (Math.abs(priceInput - base.pricePerKg) > 0.01) override.pricePerKg = priceInput;
    if (Object.keys(override).length) {
      state.ruleOverrides[key] = override;
    } else {
      delete state.ruleOverrides[key];
    }
  });
  saveState();
  render();
});

document.getElementById("ruleReset").addEventListener("click", () => {
  state.ruleOverrides = {};
  saveState();
  render();
});

// 데이터 관리
function exportSensoryCsv() {
  const header = ["createdAt", "segment", "target", "blindCode", "composition", ...SENSORY_FIELDS.map(([key]) => key), "comment"];
  const rows = state.reviews.map((review) => {
    const formula = formulaById(review.formulaId);
    return [
      review.createdAt,
      review.segment,
      formula?.name || "",
      formula?.blindCode || "",
      formula ? (formula.kind === "control" ? "설탕 100%" : sharesLabel(formula.shares)) : "",
      ...SENSORY_FIELDS.map(([key]) => review[key]),
      review.comment
    ];
  });
  downloadCsv([header, ...rows], "sugarfit-sensory-data.csv");
}

document.getElementById("exportCsv").addEventListener("click", exportSensoryCsv);
document.getElementById("exportCsv2").addEventListener("click", exportSensoryCsv);

document.getElementById("exportJson").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "sugarfit-project.json";
  link.click();
  URL.revokeObjectURL(url);
  document.getElementById("dataMessage").textContent = "프로젝트 JSON을 내보냈습니다.";
});

document.getElementById("importJson").addEventListener("change", (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      if (parsed.version !== STATE_VERSION || !Array.isArray(parsed.formulas) || !Array.isArray(parsed.reviews)) {
        throw new Error("형식 불일치");
      }
      state = normalizeState(parsed);
      saveState();
      fillWizardForm(state.project);
      render();
      document.getElementById("dataMessage").textContent = "프로젝트를 불러왔습니다.";
    } catch {
      document.getElementById("dataMessage").textContent = "가져오기 실패: 호환되지 않는 JSON 파일입니다.";
    }
    event.target.value = "";
  };
  reader.readAsText(file);
});

function resetAll() {
  state = structuredClone(seedState);
  saveState();
  fillWizardForm(state.project);
  wizardStep = 1;
  resetSurveyScores();
  document.getElementById("surveyMessage").hidden = true;
  render();
}

document.getElementById("resetData").addEventListener("click", resetAll);
document.getElementById("resetAll").addEventListener("click", () => {
  if (confirm("모든 데이터(배치·평가·룰 수정값)를 초기화할까요?")) {
    resetAll();
    document.getElementById("dataMessage").textContent = "초기화했습니다.";
  }
});

window.addEventListener("resize", () => {
  if (currentResult) {
    drawScatter(currentResult);
    drawRadar(currentResult);
  }
});

buildSurveyItems();
updateSurveyProgress();
fillWizardForm(state.project);
render();
