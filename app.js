const storageKey = "allowance-growing-v2";
const firebaseConfigKey = "allowance-growing-firebase-config";
const familyCodeKey = "allowance-growing-family-code";
const roleKey = "allowance-growing-role";

const defaults = {
  child: "관우",
  goal: "스케이트보드",
  goalAmount: 50000,
  reward: "가족 보드게임 밤",
  comments: [],
  transactions: [],
};

const seedTransactionMemos = new Set(["지난달 잔액 이월", "아이스크림 구매", "심부름 용돈", "문구 세트", "이번 달 용돈"]);
const seedCommentTexts = new Set(["이번 주 간식비를 스스로 확인한 점이 좋았어.", "목표까지 절반 가까이 왔네. 필요한 소비와 원하는 소비를 같이 나눠보자."]);

let state = loadState();
let cloud = {
  enabled: false,
  syncing: false,
  docRef: null,
  setDoc: null,
  unsubscribe: null,
};

function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function loadState() {
  const saved = localStorage.getItem(storageKey);
  if (!saved) return structuredClone(defaults);

  try {
    const parsed = { ...structuredClone(defaults), ...JSON.parse(saved) };
    parsed.transactions = (parsed.transactions || []).filter((item) => !isSeedTransaction(item));
    parsed.comments = (parsed.comments || []).filter((item) => !isSeedComment(item));
    return parsed;
  } catch {
    return structuredClone(defaults);
  }
}

function isSeedTransaction(item) {
  return item && seedTransactionMemos.has(item.memo) && String(item.date || "").startsWith("2026-06-");
}

function isSeedComment(item) {
  return item && seedCommentTexts.has(item.text);
}

function saveState() {
  localStorage.setItem(storageKey, JSON.stringify(state));
  syncToCloud();
}

function money(value) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function numberOnly(value) {
  return Math.round(value).toLocaleString("ko-KR");
}

function totals() {
  const income = state.transactions.filter((item) => item.type === "income").reduce((sum, item) => sum + item.amount, 0);
  const expense = state.transactions.filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amount, 0);
  return { income, expense, balance: income - expense };
}

function progressPercent() {
  const { balance } = totals();
  return Math.max(0, Math.min(100, Math.round((balance / state.goalAmount) * 100)));
}

function render() {
  const total = totals();
  const percent = progressPercent();
  const monthIncome = state.transactions.filter((item) => item.type === "income").reduce((sum, item) => sum + item.amount, 0);
  const monthExpense = state.transactions.filter((item) => item.type === "expense").reduce((sum, item) => sum + item.amount, 0);

  text("childName", state.child);
  value("settingChild", state.child);
  text("goalTitle", state.goal);
  text("goalChip", money(state.goalAmount));
  text("balanceText", money(total.balance));
  text("progressText", `${money(state.goalAmount)} 목표 대비 ${percent}%`);
  text("summaryBanner", `이번 달 ${money(monthIncome)} 받고 ${money(monthExpense)} 사용했어요.`);
  text("desktopSummary", `${money(total.balance)} 저축 중`);
  text("familyCode", currentFamilyCode());
  text("cloudFamilyCode", currentFamilyCode());
  text("incomeStat", money(total.income));
  text("expenseStat", money(total.expense));
  text("remainStat", money(total.balance));
  text("badgeText", percent >= 100 ? "목표 달성" : percent >= 50 ? "절반 돌파" : "첫 저축 준비");
  text("moodLabel", moodFor(total.balance, monthExpense));
  text("moodIcon", moodIconFor(total.balance, monthExpense, percent));
  text("lessonCard", lessonFor(total.balance, monthExpense, percent));
  text("coachTip", coachTip(monthExpense, percent));

  value("settingGoal", state.goal);
  value("settingAmount", state.goalAmount);
  value("settingReward", state.reward);
  value("settingRole", currentRole());
  value("quickGoalName", state.goal);
  value("quickGoalAmount", state.goalAmount);
  value("settingFamilyCode", currentFamilyCode());
  value("firebaseConfigInput", localStorage.getItem(firebaseConfigKey) || "");

  document.getElementById("progressBar").style.width = `${percent}%`;
  renderRaceStage(total.balance, monthExpense, percent);

  renderTransactions();
  renderCategories();
  renderComments();
  renderCloudStatus();
  applyRoleMode();
}

function text(id, content) {
  const el = document.getElementById(id);
  if (el) el.textContent = content;
}

function value(id, content) {
  const el = document.getElementById(id);
  if (el) el.value = content;
}

function currentFamilyCode() {
  const saved = localStorage.getItem(familyCodeKey);
  if (saved) return saved;
  const code = `RACE-${String(hashCode(state.child)).slice(0, 4)}`;
  localStorage.setItem(familyCodeKey, code);
  return code;
}

function currentRole() {
  return localStorage.getItem(roleKey) || "child";
}

function isParentMode() {
  return currentRole() === "parent";
}

function applyRoleMode() {
  const parentMode = isParentMode();
  document.body.dataset.role = parentMode ? "parent" : "child";
  text("rolePill", parentMode ? "부모 확인 모드" : "아이 입력 모드");
}

function hashCode(textValue) {
  return [...textValue].reduce((sum, char) => sum + char.charCodeAt(0), 1000);
}

function moodFor(balance, expense) {
  if (balance < 0) return "잠깐 멈추기";
  if (expense > balance) return "소비 점검";
  if (progressPercent() >= 80) return "결승선 근처";
  return "좋은 페이스";
}

function moodIconFor(balance, expense, percent) {
  if (percent >= 100) return "🎉";
  if (balance < 0 || expense > balance) return "😟";
  if (expense > 0) return "🙂";
  return "😊";
}

function lessonFor(balance, expense, percent) {
  if (percent >= 100) return `목표를 달성했어요. ${state.reward} 보상을 받고, 다음 목표에는 저축과 나눔을 함께 넣어보세요.`;
  if (expense > balance) return "이번 달에는 쓴 돈이 남은 돈보다 많아요. 다음 소비 전에는 하루 기다리기 규칙을 써보면 좋아요.";
  return "좋은 흐름이에요. 사고 싶은 것을 사진으로 남기고, 꼭 필요한지 한 번 더 확인하는 습관을 이어가세요.";
}

function coachTip(expense, percent) {
  if (percent >= 75) return "목표가 가까워졌습니다. 달성 후 남길 돈과 쓸 돈을 나눠서 이야기해 보세요.";
  if (expense > 8000) return "지출이 늘었습니다. 아이에게 혼내기보다 어떤 순간에 쓰고 싶었는지 먼저 물어보세요.";
  return "돈을 쓰기 전에 필요한 것인지, 갖고 싶은 것인지 함께 이야기해 보세요.";
}

function renderRaceStage(balance, expense, percent) {
  const raceCard = document.getElementById("raceCard");
  const runner = document.getElementById("runner");
  const runnerPng = document.getElementById("runnerPng");
  if (!raceCard) return;

  let stage = "run";
  let number = "2";
  let label = "치즈로 가는 중...";
  let position = mazePosition(percent);
  let left = position.left;
  let top = position.top;
  const lastTransaction = state.transactions.at(-1);
  const hasExpense = state.transactions.some((item) => item.type === "expense");

  if (percent >= 100) {
    stage = "finish";
    number = "5";
    label = "치즈 도착!";
    left = 77;
    top = 74;
  } else if (lastTransaction?.type === "expense" || balance < 0 || expense > balance + 3000) {
    stage = "fall";
    number = "3";
    label = "잠깐 길을 잃었어요!";
    left = Math.max(12, Math.min(58, left));
    top = Math.min(74, top + 8);
  } else if (lastTransaction?.type === "income" && hasExpense) {
    stage = "recover";
    number = "4";
    label = "다시 치즈로!";
  } else if (percent < 20) {
    stage = "start";
    number = "1";
    label = "출발!";
  }

  raceCard.dataset.stage = stage;
  if (runner) {
    runner.style.setProperty("--runner-left", `${Math.max(8, Math.min(78, left))}%`);
    runner.style.setProperty("--runner-top", `${Math.max(18, Math.min(76, top))}%`);
  }
  if (runnerPng && runnerPng.dataset.bound !== "true") {
    runnerPng.dataset.bound = "true";
    runnerPng.onload = () => raceCard.classList.remove("asset-missing");
    runnerPng.onerror = () => raceCard.classList.add("asset-missing");
  }
}

function renderTransactions() {
  const list = document.getElementById("transactionList");
  const items = [...state.transactions].sort((a, b) => b.date.localeCompare(a.date));
  const actions = !isParentMode();
  if (!items.length) {
    list.innerHTML = `<div class="empty-state">${isParentMode() ? "아직 아이가 기록한 내역이 없어요." : "아직 기록이 없어요. 용돈을 받거나 쓴 뒤 직접 기록해 보세요."}</div>`;
    return;
  }

  list.innerHTML = items
    .map(
      (item) => `
        <article class="row ${actions ? "" : "readonly"}">
          <small>${formatDate(item.date)}</small>
          <div><strong>${item.memo}</strong><small>${item.category}</small></div>
          <strong class="amount ${item.type}">${item.type === "income" ? "+" : "-"}${numberOnly(item.amount)}</strong>
          <div class="row-actions" ${actions ? "" : "hidden"}>
            <button type="button" data-edit-id="${item.id}" aria-label="수정">✎</button>
            <button class="delete" type="button" data-delete-id="${item.id}" aria-label="삭제">×</button>
          </div>
        </article>
      `,
    )
    .join("");
}

function formatDate(dateText) {
  const date = new Date(`${dateText}T00:00:00`);
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function mazePosition(percent) {
  const path = [
    { left: 8, top: 10 },
    { left: 9, top: 23 },
    { left: 27, top: 23 },
    { left: 31, top: 34 },
    { left: 55, top: 34 },
    { left: 58, top: 49 },
    { left: 69, top: 51 },
    { left: 69, top: 64 },
    { left: 56, top: 69 },
    { left: 47, top: 74 },
    { left: 58, top: 83 },
    { left: 77, top: 82 },
  ];
  const clamped = Math.max(0, Math.min(100, percent));
  const scaled = (clamped / 100) * (path.length - 1);
  const index = Math.floor(scaled);
  const nextIndex = Math.min(path.length - 1, index + 1);
  const ratio = scaled - index;
  const start = path[index];
  const end = path[nextIndex];

  return {
    left: start.left + (end.left - start.left) * ratio,
    top: start.top + (end.top - start.top) * ratio,
  };
}

function renderCategories() {
  const target = document.getElementById("categoryBars");
  const expenses = state.transactions.filter((item) => item.type === "expense");
  const byCategory = expenses.reduce((map, item) => {
    map[item.category] = (map[item.category] || 0) + item.amount;
    return map;
  }, {});
  const max = Math.max(1, ...Object.values(byCategory));

  if (!expenses.length) {
    target.innerHTML = `<div class="lesson-card">아직 지출이 없어요. 첫 소비를 기록하면 가장 많이 쓴 곳을 보여줄게요.</div>`;
    return;
  }

  target.innerHTML = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(
      ([category, amount]) => `
        <div class="bar-row">
          <div class="bar-head"><span>${category}</span><strong>${money(amount)}</strong></div>
          <div class="bar-track"><span class="bar-fill" style="width:${Math.max(16, (amount / max) * 100)}%"></span></div>
        </div>
      `,
    )
    .join("");
}

function renderComments() {
  const comments = state.comments || [];
  const list = document.getElementById("familyComments");

  if (!comments.length) {
    list.innerHTML = `<div class="empty-state">아직 가족 코멘트가 없어요.</div>`;
    return;
  }

  list.innerHTML = comments
    .map(
      (comment) => `
        <div class="comment">
          <div>
            <strong>${comment.name}</strong>
            <span>${comment.text}</span>
          </div>
          <button type="button" data-comment-delete-id="${comment.id}" aria-label="코멘트 삭제">×</button>
        </div>
      `,
    )
    .join("");
}

function renderCloudStatus(message) {
  const hasConfig = Boolean(localStorage.getItem(firebaseConfigKey));
  const status = document.getElementById("cloudStatus");
  if (!status) return;

  if (message) {
    status.textContent = message;
    status.dataset.state = cloud.enabled ? "online" : "offline";
    return;
  }

  if (cloud.enabled) {
    status.textContent = "가족 동기화 켜짐";
    status.dataset.state = "online";
  } else if (hasConfig) {
    status.textContent = "동기화 연결 중";
    status.dataset.state = "pending";
  } else {
    status.textContent = "이 기기 안에만 저장 중";
    status.dataset.state = "offline";
  }
}

function setView(view) {
  document.querySelectorAll(".view").forEach((el) => el.classList.toggle("active", el.id === `${view}View`));
  document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.view === view));
}

function openEntry(type) {
  if (isParentMode()) return;
  value("entryEditId", "");
  value("entryType", type);
  text("entryTitle", type === "income" ? "용돈 받기" : "용돈 쓰기");
  value("entryMemo", "");
  value("entryAmount", "");
  value("entryCategory", type === "income" ? "용돈" : "간식");
  document.getElementById("entryDialog").showModal();
}

function openEditEntry(id) {
  if (isParentMode()) return;
  const item = state.transactions.find((transaction) => transaction.id === id);
  if (!item) return;

  value("entryEditId", item.id);
  value("entryType", item.type);
  text("entryTitle", "용돈 기록 수정");
  value("entryMemo", item.memo);
  value("entryAmount", item.amount);
  value("entryCategory", item.category);
  document.getElementById("entryDialog").showModal();
}

function saveEntry(event) {
  event.preventDefault();
  if (isParentMode()) return;
  const editId = document.getElementById("entryEditId").value;
  const item = {
    id: editId || uid(),
    date: editId ? state.transactions.find((transaction) => transaction.id === editId)?.date || new Date().toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    memo: document.getElementById("entryMemo").value.trim(),
    amount: Number(document.getElementById("entryAmount").value),
    category: document.getElementById("entryCategory").value,
    type: document.getElementById("entryType").value,
  };

  if (!item.memo || !item.amount) return;

  if (editId) {
    state.transactions = state.transactions.map((transaction) => (transaction.id === editId ? item : transaction));
  } else {
    state.transactions.push(item);
  }
  saveState();
  document.getElementById("entryDialog").close();
  render();
}

function deleteEntry(id) {
  if (isParentMode()) return;
  const item = state.transactions.find((transaction) => transaction.id === id);
  if (!item) return;
  if (!confirm(`"${item.memo}" 기록을 삭제할까요?`)) return;

  state.transactions = state.transactions.filter((transaction) => transaction.id !== id);
  saveState();
  render();
}

function addComment(event) {
  event.preventDefault();
  const author = document.getElementById("commentAuthor").value;
  const input = document.getElementById("commentText");
  const textValue = input.value.trim();

  if (!textValue) return;

  state.comments = [
    ...(state.comments || []),
    {
      id: uid(),
      name: author,
      text: textValue,
      date: new Date().toISOString(),
    },
  ];
  input.value = "";
  saveState();
  render();
}

function deleteComment(id) {
  state.comments = (state.comments || []).filter((comment) => comment.id !== id);
  saveState();
  render();
}

function parseNaturalText() {
  if (isParentMode()) return;
  const input = document.getElementById("naturalInput");
  const textValue = input.value.trim();
  const amount = Number((textValue.match(/(\d[\d,]*)\s*원?/) || [])[1]?.replaceAll(",", ""));
  if (!textValue || !amount) return;

  const isIncome = /받|용돈|심부름|이월|저축/.test(textValue) && !/샀|구매|썼|사용/.test(textValue);
  state.transactions.push({
    id: uid(),
    date: new Date().toISOString().slice(0, 10),
    memo: textValue.replace(/(\d[\d,]*)\s*원?/g, "").trim() || "빠른 기록",
    amount,
    category: isIncome ? "용돈" : guessCategory(textValue),
    type: isIncome ? "income" : "expense",
  });
  input.value = "";
  saveState();
  render();
}

function guessCategory(textValue) {
  if (/아이스|과자|간식|편의점/.test(textValue)) return "간식";
  if (/문구|펜|공책|장난감/.test(textValue)) return "문구/장난감";
  if (/게임|오락|PC|피시/.test(textValue)) return "오락/게임";
  return "간식";
}

function startVoice() {
  if (isParentMode()) return;
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRecognition) {
    value("naturalInput", "엄마한테 5000원 받았어");
    return;
  }

  const recognition = new SpeechRecognition();
  recognition.lang = "ko-KR";
  recognition.onresult = (event) => {
    value("naturalInput", event.results[0][0].transcript);
  };
  recognition.start();
}

function makeShare() {
  const summary = `${state.child}의 용돈 상황: 현재 ${money(totals().balance)}, ${state.goal} 목표 ${progressPercent()}% 진행 중`;
  const shareBox = document.getElementById("shareBox");

  if (cloud.enabled) {
    shareBox.value = `${summary}\n\n가족 코드: ${currentFamilyCode()}\n같은 Firebase 설정과 가족 코드를 입력하면 같은 장부를 볼 수 있어요.`;
  } else {
    const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(state))));
    shareBox.value = `${summary}\n\n공유 데이터:\n#share=${encoded}`;
  }

  shareBox.select();
  navigator.clipboard?.writeText(shareBox.value);
}

async function initCloud() {
  const rawConfig = localStorage.getItem(firebaseConfigKey);
  if (!rawConfig) {
    renderCloudStatus();
    return;
  }

  try {
    const config = JSON.parse(rawConfig);
    const [{ initializeApp, getApp, getApps }, firestore] = await Promise.all([
      import("https://www.gstatic.com/firebasejs/12.14.0/firebase-app.js"),
      import("https://www.gstatic.com/firebasejs/12.14.0/firebase-firestore.js"),
    ]);

    const app = getApps().some((item) => item.name === "allowance-growing")
      ? getApp("allowance-growing")
      : initializeApp(config, "allowance-growing");
    const db = firestore.getFirestore(app);
    cloud.docRef = firestore.doc(db, "families", currentFamilyCode());
    cloud.setDoc = firestore.setDoc;
    cloud.enabled = true;

    cloud.unsubscribe?.();
    cloud.unsubscribe = firestore.onSnapshot(cloud.docRef, async (snapshot) => {
      if (cloud.syncing) return;

      if (!snapshot.exists()) {
        await syncToCloud();
        return;
      }

      const remote = snapshot.data()?.state;
      if (!remote) return;
      state = { ...structuredClone(defaults), ...remote };
      localStorage.setItem(storageKey, JSON.stringify(state));
      render();
    });

    renderCloudStatus("가족 동기화 켜짐");
  } catch (error) {
    cloud.enabled = false;
    renderCloudStatus("Firebase 설정을 확인해 주세요");
    console.error(error);
  }
}

async function syncToCloud() {
  if (!cloud.enabled || !cloud.docRef || !cloud.setDoc) return;

  cloud.syncing = true;
  try {
    await cloud.setDoc(
      cloud.docRef,
      {
        familyCode: currentFamilyCode(),
        updatedAt: new Date().toISOString(),
        state,
      },
      { merge: true },
    );
    renderCloudStatus("방금 가족 장부에 저장됨");
  } catch (error) {
    renderCloudStatus("동기화 저장 실패");
    console.error(error);
  } finally {
    cloud.syncing = false;
  }
}

function saveSettings(event) {
  event.preventDefault();
  localStorage.setItem(roleKey, document.getElementById("settingRole").value);
  state.child = document.getElementById("settingChild").value.trim() || state.child;
  state.goal = document.getElementById("settingGoal").value.trim() || state.goal;
  state.goalAmount = Number(document.getElementById("settingAmount").value) || state.goalAmount;
  state.reward = document.getElementById("settingReward").value.trim() || state.reward;

  const familyCode = document.getElementById("settingFamilyCode").value.trim().toUpperCase();
  if (familyCode) localStorage.setItem(familyCodeKey, familyCode);

  const rawConfig = document.getElementById("firebaseConfigInput").value.trim();
  if (rawConfig) localStorage.setItem(firebaseConfigKey, rawConfig);

  saveState();
  render();
  initCloud();
  setView("home");
}

function saveQuickGoal() {
  if (isParentMode()) return;
  const nextGoal = document.getElementById("quickGoalName").value.trim();
  const nextAmount = Number(document.getElementById("quickGoalAmount").value);

  if (nextGoal) state.goal = nextGoal;
  if (nextAmount >= 1000) state.goalAmount = nextAmount;

  saveState();
  render();
}

document.querySelectorAll(".tab").forEach((button) => {
  button.addEventListener("click", () => setView(button.dataset.view));
});

document.querySelectorAll("[data-open-entry]").forEach((button) => {
  button.addEventListener("click", () => openEntry(button.dataset.openEntry));
});

document.getElementById("entryForm").addEventListener("submit", saveEntry);
document.getElementById("closeEntryBtn").addEventListener("click", () => document.getElementById("entryDialog").close());
document.getElementById("cancelEntryBtn").addEventListener("click", () => document.getElementById("entryDialog").close());
document.getElementById("parseBtn").addEventListener("click", parseNaturalText);
document.getElementById("voiceBtn").addEventListener("click", startVoice);
document.getElementById("copyShareBtn").addEventListener("click", makeShare);
document.getElementById("notifyBtn").addEventListener("click", () => setView("family"));
document.getElementById("settingsForm").addEventListener("submit", saveSettings);
document.getElementById("saveQuickGoalBtn").addEventListener("click", saveQuickGoal);
document.getElementById("commentForm").addEventListener("submit", addComment);
document.getElementById("transactionList").addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit-id]");
  const deleteButton = event.target.closest("[data-delete-id]");

  if (editButton) openEditEntry(editButton.dataset.editId);
  if (deleteButton) deleteEntry(deleteButton.dataset.deleteId);
});
document.getElementById("familyComments").addEventListener("click", (event) => {
  const deleteButton = event.target.closest("[data-comment-delete-id]");
  if (deleteButton) deleteComment(deleteButton.dataset.commentDeleteId);
});

render();
initCloud();
