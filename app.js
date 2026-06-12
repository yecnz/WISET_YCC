const STORAGE_KEY = "sugarfit-lab-state-v3";

const sweetenerRules = {
  "알룰로스": { limitMgKg: 400, aftertaste: 0.12, giLoad: 0.25 },
  "스테비아": { limitMgKg: 4, aftertaste: 0.72, giLoad: 0.05 },
  "에리스리톨": { limitMgKg: 500, aftertaste: 0.28, giLoad: 0.75 },
  "알룰로스+스테비아": { limitMgKg: 120, aftertaste: 0.38, giLoad: 0.18 },
  "알룰로스+에리스리톨": { limitMgKg: 420, aftertaste: 0.22, giLoad: 0.48 },
  "에리스리톨+스테비아": { limitMgKg: 180, aftertaste: 0.45, giLoad: 0.55 }
};

const seedState = {
  profile: {
    goal: "sugarControl",
    drinkType: "아이스티",
    weight: 60,
    servingMl: 350,
    sweetPreference: "medium",
    flavorPreference: "복숭아",
    giSensitivity: "medium",
    avoidAftertaste: true,
    lowCalorie: true
  },
  formulas: [
    { id: "f1", name: "Peach-Lite 01", flavor: "복숭아", sweetenerType: "알룰로스", sweetener: 35, acid: 3, tea: 4, sugar: 4.2, calories: 42, caffeine: 28, sweetenerMg: 1200 },
    { id: "f2", name: "Lemon-Clear 02", flavor: "레몬", sweetenerType: "알룰로스+스테비아", sweetener: 45, acid: 5, tea: 5, sugar: 3.8, calories: 36, caffeine: 35, sweetenerMg: 820 },
    { id: "f3", name: "Grapefruit-Bold 03", flavor: "자몽", sweetenerType: "스테비아", sweetener: 30, acid: 6, tea: 6, sugar: 3.2, calories: 28, caffeine: 44, sweetenerMg: 180 },
    { id: "f4", name: "Berry-Soft 04", flavor: "베리", sweetenerType: "에리스리톨", sweetener: 55, acid: 4, tea: 3, sugar: 5.1, calories: 48, caffeine: 18, sweetenerMg: 9800 },
    { id: "f5", name: "Peach-Zero 05", flavor: "복숭아", sweetenerType: "알룰로스+스테비아", sweetener: 70, acid: 4, tea: 4, sugar: 2.4, calories: 24, caffeine: 25, sweetenerMg: 760 },
    { id: "f6", name: "Lemon-Mild 06", flavor: "레몬", sweetenerType: "알룰로스", sweetener: 52, acid: 3, tea: 4, sugar: 3.1, calories: 31, caffeine: 22, sweetenerMg: 1450 }
  ],
  reviews: [
    makeReview("헬스 관심", "f1", 5, 4, 6, 5, 6, 6, "복숭아 향이 자연스럽고 부담이 적음"),
    makeReview("카페 음료 선호", "f1", 6, 4, 6, 6, 6, 5, "당이 적은 느낌이 덜해서 좋음"),
    makeReview("다이어트 관심", "f2", 4, 6, 5, 4, 5, 5, "상큼하지만 끝맛이 조금 날카로움"),
    makeReview("일반 소비자", "f2", 5, 5, 5, 5, 5, 4, "깔끔하고 무난함"),
    makeReview("헬스 관심", "f3", 3, 6, 4, 4, 4, 4, "쓴맛과 산미가 강함"),
    makeReview("카페 음료 선호", "f4", 6, 4, 6, 6, 6, 6, "향은 좋지만 단맛이 조금 높음"),
    makeReview("다이어트 관심", "f5", 4, 4, 5, 4, 5, 5, "저당 느낌은 좋은데 바디감이 약함"),
    makeReview("일반 소비자", "f6", 5, 4, 5, 5, 5, 5, "레몬향과 차 농도가 편함")
  ]
};

let state = loadState();

const tabs = document.querySelectorAll(".nav-button");
const panels = document.querySelectorAll(".tab-panel");
const formulaGrid = document.getElementById("formulaGrid");
const formulaSelect = document.getElementById("formulaSelect");
const recentReviews = document.getElementById("recentReviews");
const driverBars = document.getElementById("driverBars");
const segmentList = document.getElementById("segmentList");
const recommendation = document.getElementById("recommendation");
const reasonList = document.getElementById("reasonList");
const scatterChart = document.getElementById("scatterChart");
const profileSummary = document.getElementById("profileSummary");

function makeReview(segment, formulaId, sweetness, balance, aroma, mouthfeel, overall, repurchase, comment) {
  return {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
    segment,
    formulaId,
    sweetness,
    balance,
    aroma,
    mouthfeel,
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
    return normalizeState(JSON.parse(saved));
  } catch {
    return structuredClone(seedState);
  }
}

function normalizeState(saved) {
  return {
    ...seedState,
    ...saved,
    profile: { ...seedState.profile, ...(saved.profile || {}) },
    formulas: (saved.formulas || seedState.formulas).map((formula, index) => ({
      ...seedState.formulas[index % seedState.formulas.length],
      ...formula,
      sweetenerMg: formula.sweetenerMg ?? estimateSweetenerMg(formula)
    })),
    reviews: saved.reviews || seedState.reviews
  };
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

function formulaStats(formula) {
  const reviews = reviewsForFormula(formula.id);
  const overall = average(reviews.map((review) => review.overall));
  const repurchase = average(reviews.map((review) => review.repurchase));
  const sugarSaving = Math.max(0, Math.round(((10 - formula.sugar) / 10) * 100));
  const healthFit = healthFitScore(formula);
  const safety = safetyCheck(formula);
  const score = safety.pass ? overall * 0.42 + repurchase * 0.18 + (sugarSaving / 100) * 0.85 + healthFit * 0.7 + safety.margin * 0.75 + reviews.length * 0.04 : 0;
  return { reviews, overall, repurchase, sugarSaving, healthFit, safety, score };
}

function render() {
  renderMetrics();
  renderFormulas();
  renderFormulaOptions();
  renderRecentReviews();
  renderDrivers();
  renderSegments();
  renderProfile();
  renderRecommendation();
  drawScatter();
}

function renderMetrics() {
  const allOverall = state.reviews.map((review) => review.overall);
  const ranked = [...state.formulas].sort((a, b) => formulaStats(b).score - formulaStats(a).score);
  const best = ranked[0];
  const passRate = state.formulas.length ? Math.round((state.formulas.filter((formula) => safetyCheck(formula).pass).length / state.formulas.length) * 100) : 0;
  document.getElementById("metricCount").textContent = state.reviews.length;
  document.getElementById("metricAverage").textContent = `${passRate}%`;
  document.getElementById("metricBest").textContent = best ? best.name.replace(/\s\d+$/, "") : "-";
  document.getElementById("metricSweetener").textContent = best ? best.sweetenerType : "-";
}

function renderFormulas() {
  formulaGrid.innerHTML = state.formulas
    .map((formula) => {
      const stats = formulaStats(formula);
      return `
        <article class="formula-card">
          <header>
            <div>
              <span class="label">${formula.flavor}</span>
              <h2>${formula.name}</h2>
            </div>
            <span class="pill">${stats.overall.toFixed(1)}점</span>
          </header>
          <div class="spec-grid">
            <div class="spec"><span>대체당</span><strong>${formula.sweetenerType}</strong></div>
            <div class="spec"><span>대체당 비율</span><strong>${formula.sweetener}%</strong></div>
            <div class="spec"><span>당 함량</span><strong>${formula.sugar}g</strong></div>
            <div class="spec"><span>안전 판정</span><strong>${stats.safety.pass ? "통과" : "초과"}</strong></div>
            <div class="spec"><span>안전 여유</span><strong>${Math.round(stats.safety.margin * 100)}%</strong></div>
            <div class="spec"><span>산미</span><strong>${formula.acid}/7</strong></div>
            <div class="spec"><span>칼로리</span><strong>${formula.calories}kcal</strong></div>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderProfile() {
  const profile = state.profile;
  const form = document.getElementById("profileForm");
  if (form && document.activeElement !== form) {
    form.goal.value = profile.goal;
    form.drinkType.value = profile.drinkType;
    form.weight.value = profile.weight;
    form.servingMl.value = profile.servingMl;
    form.sweetPreference.value = profile.sweetPreference;
    form.flavorPreference.value = profile.flavorPreference;
    form.giSensitivity.value = profile.giSensitivity;
    form.avoidAftertaste.checked = Boolean(profile.avoidAftertaste);
    form.lowCalorie.checked = Boolean(profile.lowCalorie);
  }
  profileSummary.innerHTML = `
    <article class="segment-item">
      <strong>${goalLabel(profile.goal)}</strong>
      <p>${profile.drinkType} · ${sweetLabel(profile.sweetPreference)} · ${profile.flavorPreference} 향 선호</p>
    </article>
    <article class="segment-item">
      <strong>섭취 상한 기준</strong>
      <p>${profile.weight}kg 기준 · ${profile.servingMl}ml 1회 제공량 · 위장 민감도 ${sensitivityLabel(profile.giSensitivity)}</p>
    </article>
    <article class="segment-item">
      <strong>연구용 기준</strong>
      <p>진단·치료가 아닌 알려진 섭취 상한 기반의 과량 제어 및 배합 실험 추천 기준입니다.</p>
    </article>
  `;
}

function renderFormulaOptions() {
  formulaSelect.innerHTML = state.formulas
    .map((formula) => `<option value="${formula.id}">${formula.name} · ${formula.flavor}</option>`)
    .join("");
}

function renderRecentReviews() {
  const reviews = [...state.reviews].slice(-6).reverse();
  recentReviews.innerHTML = reviews
    .map((review) => {
      const formula = formulaById(review.formulaId);
      return `
        <article class="review-item">
          <strong>${formula?.name || "삭제된 배합"} · ${review.overall}점</strong>
          <p>${review.segment} · ${review.comment || "의견 없음"}</p>
        </article>
      `;
    })
    .join("");
}

function renderDrivers() {
  const fields = [
    ["sweetness", "단맛 만족도"],
    ["balance", "산미 균형"],
    ["aroma", "향 선호도"],
    ["mouthfeel", "입안 느낌"],
    ["repurchase", "재구매 의향"]
  ];
  const drivers = fields
    .map(([key, label]) => ({ label, value: Math.abs(correlation(state.reviews.map((r) => r[key]), state.reviews.map((r) => r.overall))) }))
    .sort((a, b) => b.value - a.value);
  driverBars.innerHTML = drivers
    .map((driver, index) => {
      const color = [null, "var(--coral)", "var(--blue)", "var(--yellow)", "var(--mint)", "#805d93"][index + 1] || "var(--mint)";
      return `
        <div class="bar-item">
          <strong>${driver.label}</strong>
          <div class="bar-row"><div class="bar-fill" style="width:${Math.round(driver.value * 100)}%; background:${color}"></div></div>
        </div>
      `;
    })
    .join("");
}

function renderSegments() {
  const segments = [...new Set(state.reviews.map((review) => review.segment))];
  segmentList.innerHTML = segments
    .map((segment) => {
      const reviews = state.reviews.filter((review) => review.segment === segment);
      const bestFormulaId = bestFormulaForReviews(reviews);
      const best = formulaById(bestFormulaId);
      return `
        <article class="segment-item">
          <strong>${segment}</strong>
          <p>평균 ${average(reviews.map((r) => r.overall)).toFixed(1)}점 · 선호 배합 ${best?.name || "-"}</p>
        </article>
      `;
    })
    .join("");
}

function renderRecommendation() {
  const next = buildRecommendation();
  recommendation.innerHTML = `
    <article class="recommend-card">
      <span class="recommend-score">예상 만족도 ${next.predicted.toFixed(1)}점</span>
      <h3>${next.name}</h3>
      <p>${next.summary}</p>
        <div class="spec-grid">
          <div class="spec"><span>향</span><strong>${next.flavor}</strong></div>
          <div class="spec"><span>대체당</span><strong>${next.sweetenerType}</strong></div>
          <div class="spec"><span>대체당 비율</span><strong>${next.sweetener}%</strong></div>
          <div class="spec"><span>산미</span><strong>${next.acid}/7</strong></div>
          <div class="spec"><span>예상 당 함량</span><strong>${next.sugar.toFixed(1)}g</strong></div>
        </div>
    </article>
  `;
  reasonList.innerHTML = next.reasons.map((reason) => `<li>${reason}</li>`).join("");
}

function buildRecommendation() {
  const ranked = [...state.formulas].sort((a, b) => formulaStats(b).score - formulaStats(a).score);
  const best = ranked[0] || seedState.formulas[0];
  const bestStats = formulaStats(best);
  const topDriver = topPreferenceDriver();
  const sweetenerType = recommendSweetenerType(state.profile, best);
  const sweetener = clamp(Math.round(best.sweetener + (best.sugar > 3.2 ? 8 : 2)), 20, 82);
  const acid = clamp(best.acid + (topDriver === "balance" ? 0 : -1), 2, 6);
  const sugar = Math.max(1.8, best.sugar - 0.7);
  const calories = Math.max(16, best.calories - 7);
  return {
    name: `${state.profile.flavorPreference}-Fit ${String(state.formulas.length + 1).padStart(2, "0")}`,
    flavor: state.profile.flavorPreference,
    sweetenerType,
    sweetener,
    acid,
    tea: best.tea,
    sugar,
    calories,
    predicted: clamp(bestStats.overall + 0.25 + bestStats.healthFit * 0.35, 1, 7),
    summary: `${goalLabel(state.profile.goal)} 목표와 ${state.profile.flavorPreference} 향 선호를 반영한 개인 맞춤형 다음 실험 배합입니다.`,
    reasons: [
      `${best.name}이 안전 여유도와 만족도를 합산한 추천 점수에서 가장 높았습니다.`,
      `${goalLabel(state.profile.goal)} 조건에는 ${sweetenerType} 조합이 적합하게 계산되었습니다.`,
      `${topDriverLabel(topDriver)} 항목이 전체 만족도와 가장 강하게 연결되어 있습니다.`,
      `체중 ${state.profile.weight}kg 기준 안전 상한 안에서 예상 당 함량 ${sugar.toFixed(1)}g, ${calories}kcal로 낮추는 후보입니다.`
    ]
  };
}

function safetyCheck(formula) {
  const rule = sweetenerRules[formula.sweetenerType] || sweetenerRules["알룰로스"];
  const profile = state.profile || seedState.profile;
  const limitMg = rule.limitMgKg * Number(profile.weight || 60);
  const usedMg = Number(formula.sweetenerMg ?? estimateSweetenerMg(formula));
  const sensitivityPenalty = profile.giSensitivity === "high" ? rule.giLoad * 0.22 : profile.giSensitivity === "medium" ? rule.giLoad * 0.1 : 0;
  const ratio = usedMg / Math.max(limitMg, 1) + sensitivityPenalty;
  const margin = clamp(1 - ratio, 0, 1);
  return {
    pass: ratio <= 1,
    margin,
    limitMg,
    usedMg,
    ratio
  };
}

function estimateSweetenerMg(formula) {
  return Math.round((Number(formula.sweetener || 40) / 100) * 350 * 80);
}

function healthFitScore(formula) {
  const profile = state.profile || seedState.profile;
  const rule = sweetenerRules[formula.sweetenerType] || sweetenerRules["알룰로스"];
  let score = 0.45;
  if (profile.flavorPreference === formula.flavor) score += 0.18;
  if (profile.goal === "sugarControl") score += formula.sugar <= 3.2 ? 0.2 : formula.sugar <= 4.2 ? 0.1 : -0.08;
  if (profile.goal === "diet") score += formula.calories <= 32 ? 0.2 : formula.calories <= 45 ? 0.08 : -0.08;
  if (profile.goal === "fitness") score += formula.tea >= 4 ? 0.09 : 0.02;
  if (profile.goal === "daily") score += formula.sugar <= 5 ? 0.12 : 0;
  if (profile.giSensitivity === "high") score += rule.giLoad <= 0.3 ? 0.14 : -0.12;
  if (profile.giSensitivity === "medium") score += rule.giLoad <= 0.55 ? 0.08 : -0.04;
  if (profile.avoidAftertaste && formula.sweetenerType === "스테비아") score -= 0.12;
  if (profile.avoidAftertaste && formula.sweetenerType === "알룰로스") score += 0.1;
  if (profile.lowCalorie && formula.calories <= 32) score += 0.1;
  return clamp(score, 0, 1);
}

function recommendSweetenerType(profile, best) {
  if (profile.avoidAftertaste && profile.goal === "sugarControl") return "알룰로스+에리스리톨";
  if (profile.avoidAftertaste) return "알룰로스";
  if (profile.goal === "diet") return "알룰로스+스테비아";
  if (profile.goal === "fitness") return "에리스리톨+스테비아";
  return best.sweetenerType;
}

function goalLabel(goal) {
  return {
    sugarControl: "혈당 관리",
    diet: "체중 관리",
    fitness: "운동/단백질 식단",
    daily: "일상 저당 섭취"
  }[goal];
}

function sweetLabel(value) {
  return {
    mild: "은은한 단맛",
    medium: "보통 단맛",
    strong: "강한 단맛"
  }[value];
}

function caffeineLabel(value) {
  return {
    low: "낮음",
    medium: "보통",
    high: "높음"
  }[value];
}

function sensitivityLabel(value) {
  return {
    low: "낮음",
    medium: "보통",
    high: "높음"
  }[value];
}

function topPreferenceDriver() {
  const keys = ["sweetness", "balance", "aroma", "mouthfeel", "repurchase"];
  return keys
    .map((key) => ({ key, value: Math.abs(correlation(state.reviews.map((r) => r[key]), state.reviews.map((r) => r.overall))) }))
    .sort((a, b) => b.value - a.value)[0]?.key || "aroma";
}

function topDriverLabel(key) {
  return {
    sweetness: "단맛 만족도",
    balance: "산미 균형",
    aroma: "향 선호도",
    mouthfeel: "입안 느낌",
    repurchase: "재구매 의향"
  }[key];
}

function bestFormulaForReviews(reviews) {
  const scores = {};
  reviews.forEach((review) => {
    scores[review.formulaId] ??= [];
    scores[review.formulaId].push(review.overall);
  });
  return Object.entries(scores).sort((a, b) => average(b[1]) - average(a[1]))[0]?.[0];
}

function correlation(xs, ys) {
  if (xs.length < 2 || ys.length < 2) return 0;
  const xAvg = average(xs);
  const yAvg = average(ys);
  const numerator = xs.reduce((sum, x, index) => sum + (x - xAvg) * (ys[index] - yAvg), 0);
  const xDenom = Math.sqrt(xs.reduce((sum, x) => sum + (x - xAvg) ** 2, 0));
  const yDenom = Math.sqrt(ys.reduce((sum, y) => sum + (y - yAvg) ** 2, 0));
  if (!xDenom || !yDenom) return 0;
  return numerator / (xDenom * yDenom);
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function drawScatter() {
  const ctx = scatterChart.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  const rect = scatterChart.getBoundingClientRect();
  scatterChart.width = rect.width * ratio;
  scatterChart.height = rect.height * ratio;
  ctx.scale(ratio, ratio);
  const width = rect.width;
  const height = rect.height;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#f9fbf8";
  ctx.fillRect(0, 0, width, height);
  const pad = 44;
  ctx.strokeStyle = "#dce4dc";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i += 1) {
    const y = pad + ((height - pad * 2) / 4) * i;
    ctx.beginPath();
    ctx.moveTo(pad, y);
    ctx.lineTo(width - pad, y);
    ctx.stroke();
  }
  ctx.fillStyle = "#68746d";
  ctx.font = "12px system-ui";
  ctx.fillText("안전 여유도", pad, height - 14);
  ctx.fillText("높은 만족도", 12, pad - 14);

  state.formulas.forEach((formula) => {
    const stats = formulaStats(formula);
    const x = pad + stats.safety.margin * (width - pad * 2);
    const y = height - pad - ((stats.overall || 3.5) - 1) / 6 * (height - pad * 2);
    ctx.beginPath();
    ctx.fillStyle = formula.flavor === "복숭아" ? "#dd6b57" : formula.flavor === "레몬" ? "#e5b84b" : formula.flavor === "자몽" ? "#4777b8" : "#2d8b73";
    ctx.arc(clamp(x, pad, width - pad), clamp(y, pad, height - pad), 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#1e2420";
    ctx.fillText(formula.name.split(" ")[0], clamp(x + 12, pad, width - 110), clamp(y + 4, pad, height - pad));
  });
}

document.querySelectorAll("input[type='range']").forEach((range) => {
  const output = range.parentElement.querySelector("output");
  range.addEventListener("input", () => {
    output.textContent = range.value;
  });
});

tabs.forEach((tabButton) => {
  tabButton.addEventListener("click", () => {
    tabs.forEach((button) => button.classList.remove("active"));
    panels.forEach((panel) => panel.classList.remove("active"));
    tabButton.classList.add("active");
    document.getElementById(tabButton.dataset.tab).classList.add("active");
    drawScatter();
  });
});

document.getElementById("openFormulaForm").addEventListener("click", () => {
  document.getElementById("formulaForm").classList.toggle("hidden");
});

document.getElementById("formulaForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
    state.formulas.push({
      id: `f${Date.now()}`,
      name: data.name,
      flavor: data.flavor,
      sweetenerType: data.sweetenerType,
      sweetener: Number(data.sweetener),
      acid: Number(data.acid),
      tea: Number(data.tea),
      sugar: Number(data.sugar),
      calories: Number(data.calories),
      caffeine: 25,
      sweetenerMg: Number(data.sweetenerMg)
    });
  event.currentTarget.reset();
  event.currentTarget.classList.add("hidden");
  saveState();
  render();
});

document.getElementById("profileForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  state.profile = {
    goal: data.goal,
    drinkType: data.drinkType,
    weight: Number(data.weight),
    servingMl: Number(data.servingMl),
    sweetPreference: data.sweetPreference,
    flavorPreference: data.flavorPreference,
    giSensitivity: data.giSensitivity,
    avoidAftertaste: Boolean(data.avoidAftertaste),
    lowCalorie: Boolean(data.lowCalorie)
  };
  saveState();
  render();
});

document.getElementById("surveyForm").addEventListener("submit", (event) => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(event.currentTarget));
  state.reviews.push(
    makeReview(
      data.segment,
      data.formulaId,
      Number(data.sweetness),
      Number(data.balance),
      Number(data.aroma),
      Number(data.mouthfeel),
      Number(data.overall),
      Number(data.repurchase),
      data.comment
    )
  );
  event.currentTarget.reset();
  document.querySelectorAll("input[type='range']").forEach((range) => {
    range.value = 5;
    range.parentElement.querySelector("output").textContent = "5";
  });
  saveState();
  render();
});

document.getElementById("resetData").addEventListener("click", () => {
  state = structuredClone(seedState);
  saveState();
  render();
});

document.getElementById("exportCsv").addEventListener("click", () => {
  const header = ["createdAt", "segment", "formula", "sweetenerType", "sweetenerMg", "safetyPass", "safetyMargin", "sugar", "calories", "sweetness", "balance", "aroma", "mouthfeel", "overall", "repurchase", "comment"];
  const rows = state.reviews.map((review) => {
    const formula = formulaById(review.formulaId);
    const safety = formula ? safetyCheck(formula) : null;
    return [review.createdAt, review.segment, formula?.name || "", formula?.sweetenerType || "", formula?.sweetenerMg || "", safety?.pass || "", safety ? Math.round(safety.margin * 100) : "", formula?.sugar || "", formula?.calories || "", review.sweetness, review.balance, review.aroma, review.mouthfeel, review.overall, review.repurchase, review.comment];
  });
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "sugarfit-sensory-data.csv";
  link.click();
  URL.revokeObjectURL(url);
});

function csvCell(value) {
  return `"${String(value ?? "").replaceAll('"', '""')}"`;
}

window.addEventListener("resize", drawScatter);
render();
