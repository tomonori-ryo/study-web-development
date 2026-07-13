// Firebase設定
const firebaseConfig = {
  apiKey: "AIzaSyCiubdIeWsTS2RpMHVuztuYJO0tKx2CHtU",
  authDomain: "shooting-game-25c63.firebaseapp.com",
  projectId: "shooting-game-25c63",
  storageBucket: "shooting-game-25c63.firebasestorage.app",
  messagingSenderId: "1053348191041",
  appId: "1:1053348191041:web:57a48965847d201108dfc0",
  measurementId: "G-JEEYRRL45M"
};

// Firebase初期化
firebase.initializeApp(firebaseConfig);
console.log('Firebase初期化完了');

// Firestoreデータベース
const db = firebase.firestore();
console.log('Firestore初期化完了');

// 認証（永続性を設定）
const auth = firebase.auth();
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL)
  .then(() => {
    console.log('Firebase認証永続性設定完了');
  })
  .catch((error) => {
    console.error('認証永続性設定エラー:', error);
  });
console.log('Firebase認証初期化完了');

// Analytics（admin.html など analytics SDK を読み込まないページもあるので防御的に）
let analytics = null;
try {
  if (typeof firebase.analytics === 'function') {
    analytics = firebase.analytics();
    console.log('Analytics初期化完了');
  } else {
    console.log('Analytics SDK 未読み込み (skip)');
  }
} catch (e) {
  console.warn('Analytics init skipped:', e.message);
}

// Storage（管理画面で画像をアップロード）
// 利用側で firebase-storage-compat.js を読み込んでいない場合は undefined になるので
// アクセス前にチェックする。
let storage = null;
try {
  if (typeof firebase.storage === 'function') {
    storage = firebase.storage();
    console.log('Firebase Storage初期化完了');
  }
} catch (e) {
  console.warn('Storage init skipped:', e.message);
}

/** 1 プレイでサーバーに送れるスコア上限（firestore.rules の maxRunScore と揃える） */
const MAX_SCORE_SUBMIT_PER_RUN = 20000;
/** 連続 saveScore の最短間隔 ms（firestore.rules の 60 秒クールダウンと揃える） */
const SCORE_SUBMIT_COOLDOWN_MS = 60000;
/** ランキング用: 改竄疑いユーザーを飛ばしたうえで上位を埋めるための取得余裕 */
const RANKING_QUERY_FETCH_PAD = 50;

/**
 * ランキング集計用のスコア統計（Firestore users ドキュメントから）
 * @returns {{ highScore: number, totalGames: number, totalScore: number }}
 */
function buildRankingStatsFromUserData(data) {
  const d = data && typeof data === 'object' ? data : {};
  return {
    highScore: Number(d.highScore) || 0,
    totalGames: Number(d.totalGames) || 0,
    totalScore: Number(d.totalScore) || 0
  };
}

/**
 * 明らかな改竄・不整合の理由コード（空ならランキング対象）
 * @param {object} data Firestore users ドキュメント
 * @returns {string[]}
 */
function getSuspiciousScoreReasons(data) {
  const s = buildRankingStatsFromUserData(data);
  const reasons = [];
  const cap = MAX_SCORE_SUBMIT_PER_RUN;

  if (s.highScore > cap) reasons.push('highScore_over_run_cap');
  if (s.totalGames <= 0 && s.highScore > 0) reasons.push('highScore_without_games');
  if (s.totalGames > 0 && s.totalScore > s.totalGames * cap) reasons.push('totalScore_exceeds_cap');
  if (s.totalGames > 0 && s.highScore > s.totalScore) reasons.push('highScore_exceeds_total');
  if (s.totalGames >= 2 && s.totalScore / s.totalGames > cap) reasons.push('avg_score_over_run_cap');

  return reasons;
}

/** ランキング・順位称号から除外するか */
function isSuspiciousRankingUser(data) {
  return getSuspiciousScoreReasons(data).length > 0;
}

// 固定称号の定義
const FIXED_TITLES = {
  rookie: 'ルーキー',
  score100: 'スコア100突破',
  weaponMaster: 'ウェポンマスター'
};

// ─────── ランキング称号 ───────
// このランクまでに入っているユーザーだけが「順位称号」を保持できる。
// 圏外に出れば剥奪。順位ごとに別の称号を当てる運用を想定。
const RANKING_TITLE_LIMIT = 5;

// ─────── 管理者ホワイトリスト ───────
// 注意: クライアントサイドのみの判定です。Firestore セキュリティルールでも
// 同等の制限を入れない限り、悪意のあるユーザーは API を直接叩けます。
// 段階的に Firestore Rules 側でも `request.auth.token.email in [...]` を強制してください。
const ADMIN_EMAILS = [
  'tomonoriryou4@gmail.com'
];

function isAdminEmail(email) {
  return !!email && ADMIN_EMAILS.includes(String(email).toLowerCase());
}

/** 現在のログインセッションが管理者か（index / shooting_game の UI 制御用） */
function isShootingAdminSession() {
  try {
    return isAdminEmail(auth.currentUser && auth.currentUser.email);
  } catch (e) {
    return false;
  }
}

/** Firestore `config/builtinEventAccess` のドキュメント ID */
const BUILTIN_EVENT_ACCESS_DOC_ID = 'builtinEventAccess';

/** 艦隊・星獣の公開モードを正規化（未設定時は従来挙動に近い既定） */
function normalizeBuiltinEventAccess(raw) {
  const d = raw && typeof raw === 'object' ? raw : {};
  const sf = String(d.shadowFleet || 'open').toLowerCase();
  const cd = String(d.cosmicDragon || 'open').toLowerCase();
  const shadowFleet = ['open', 'maintenance', 'test'].includes(sf) ? sf : 'open';
  const cosmicDragon = ['open', 'admin_only', 'maintenance', 'test'].includes(cd) ? cd : 'open';
  const mk = String(d.maintenanceMessageJa || '').trim();
  const tk = String(d.testMessageJa || '').trim();
  return {
    shadowFleet,
    cosmicDragon,
    testBypassKey: String(d.testBypassKey || '').trim(),
    maintenanceMessageJa: mk || 'ただいまイベントを調整中です。しばらくお待ちください。',
    testMessageJa: tk || 'テスト公開中です。参加用キーが必要です。'
  };
}

/** URL の `?eventKey=` が設定キーと一致したら sessionStorage に保持（以降の遷移でも有効） */
function syncShootingEventBypassFromUrl(access) {
  try {
    const n = normalizeBuiltinEventAccess(access);
    const key = n.testBypassKey;
    if (!key) return;
    const u = new URLSearchParams(window.location.search).get('eventKey');
    if (u === key) sessionStorage.setItem('shootingEventBypassKey', key);
  } catch (e) { /* ignore */ }
}

function hasShootingEventBypass(access) {
  const n = normalizeBuiltinEventAccess(access);
  const key = n.testBypassKey;
  if (!key) return false;
  try {
    if (sessionStorage.getItem('shootingEventBypassKey') === key) return true;
    return new URLSearchParams(window.location.search).get('eventKey') === key;
  } catch (e) {
    return false;
  }
}

/** 艦隊襲来（ビルトイン影艦隊）をプレイ可能か */
function canPlayBuiltinShadowFleet(access) {
  const n = normalizeBuiltinEventAccess(access);
  if (n.shadowFleet === 'open') return true;
  try {
    if (isShootingAdminSession()) return true;
  } catch (e) { /* ignore */ }
  return hasShootingEventBypass(n);
}

/** 星獣襲来をプレイ可能か（open / admin_only / メンテ・テスト） */
function canPlayBuiltinCosmicDragon(access) {
  const n = normalizeBuiltinEventAccess(access);
  if (n.cosmicDragon === 'open') return true;
  let admin = false;
  try {
    admin = isShootingAdminSession();
  } catch (e) { /* ignore */ }
  if (admin) return true;
  if (n.cosmicDragon === 'admin_only') {
    return hasShootingEventBypass(n);
  }
  return hasShootingEventBypass(n);
}

// データ管理クラス
class FirebaseDataManager {
  constructor() {
    this.db = db;
    this.auth = auth;
    this.storage = storage;
    /** listAnnouncementsPublic で「件数はあるが表示 0」の診断を一度だけ出す */
    this._annPublicFilterWarned = false;
  }

  // ユーザー登録
  async registerUser(email, password, username) {
    try {
      console.log('ユーザー登録開始:', { email, username });
      
      // Firebase認証でユーザー作成
      const userCredential = await this.auth.createUserWithEmailAndPassword(email, password);
      const user = userCredential.user;
      
      console.log('Firebase認証成功:', user.uid);
      
      // ユーザープロフィールを保存
      await this.db.collection('users').doc(user.uid).set({
        username: username,
        email: email,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        highScore: 0,
        totalGames: 0,
        totalScore: 0,
        titles: [],
        activeTitle: '',
        settings: {
          difficulty: 'normal',
          pvpAiDifficulty: 'hard',
          weaponLoadout: ['normal', 'rapid', 'shotgun', 'laser']
        },
        progress: {
          allWeaponsUnlocked: false
        }
      });
      
      console.log('Firestore保存成功');
      return user;
    } catch (error) {
      console.error('Firebase登録エラー:', error);
      console.error('エラーコード:', error.code);
      console.error('エラーメッセージ:', error.message);
      throw error;
    }
  }

  // ユーザーログイン
  async loginUser(email, password) {
    try {
      const userCredential = await this.auth.signInWithEmailAndPassword(email, password);
      return userCredential.user;
    } catch (error) {
      throw error;
    }
  }

  // ログアウト
  async logoutUser() {
    try {
      await this.auth.signOut();
    } catch (error) {
      throw error;
    }
  }

  // パスワードリセットメール送信
  async sendPasswordResetEmail(email) {
    try {
      const actionCodeSettings = {
        // リセット完了後の戻り先を専用ページにする
        url: new URL('reset-password.html', window.location.href).href
      };
      await this.auth.sendPasswordResetEmail(email, actionCodeSettings);
    } catch (error) {
      throw error;
    }
  }

  /** 通常プレイ開始時に呼ぶ。スコア送信はこのセッション ID とセットでのみルールが通る。 */
  async startPlaySession() {
    const user = this.auth.currentUser;
    if (!user) return null;
    const ref = this.db.collection('users').doc(user.uid).collection('playSessions').doc();
    await ref.set({
      startedAt: firebase.firestore.FieldValue.serverTimestamp(),
      consumed: false
    });
    return ref.id;
  }

  // スコア保存（プレイセッション検証 + Firestore Rules。コンソールからの直書きは拒否）
  async saveScore(score, playSessionId) {
    try {
      const user = this.auth.currentUser;
      if (!user) throw new Error('ユーザーがログインしていません');

      const sessionId = (playSessionId && String(playSessionId).trim()) || '';
      if (!sessionId) throw new Error('PLAY_SESSION_REQUIRED');

      const now = Date.now();
      if (this._lastScoreSubmitAt && (now - this._lastScoreSubmitAt) < SCORE_SUBMIT_COOLDOWN_MS) {
        throw new Error('SCORE_SUBMIT_RATE_LIMITED');
      }

      const runScore = Math.max(0, Math.min(
        Math.floor(Number(score) || 0),
        MAX_SCORE_SUBMIT_PER_RUN
      ));

      const userRef = this.db.collection('users').doc(user.uid);
      const sessionRef = userRef.collection('playSessions').doc(sessionId);
      const userDoc = await userRef.get();

      if (!userDoc.exists) throw new Error('ユーザーデータが見つかりません');

      const userData = userDoc.data();
      const oldHighScore = userData.highScore || 0;
      const newHighScore = Math.max(oldHighScore, runScore);
      const newTotalGames = (userData.totalGames || 0) + 1;
      const newTotalScore = (userData.totalScore || 0) + runScore;
      const currentTitles = Array.isArray(userData.titles) ? [...userData.titles] : [];
      const progress = { ...(userData.progress || {}) };
      const unlockedTitleSet = new Set(currentTitles);

      if (newTotalGames >= 1) unlockedTitleSet.add(FIXED_TITLES.rookie);
      if (newHighScore >= 100) unlockedTitleSet.add(FIXED_TITLES.score100);
      if (progress.rapidUnlocked && progress.shotgunUnlocked && progress.laserUnlocked) {
        progress.allWeaponsUnlocked = true;
      }
      if (progress.allWeaponsUnlocked) {
        unlockedTitleSet.add(FIXED_TITLES.weaponMaster);
      }

      if (newHighScore > oldHighScore) {
        try {
          const newRank = await this.computeRank(user.uid, newHighScore);
          if (newRank && newRank >= 1 && newRank <= RANKING_TITLE_LIMIT) {
            progress.currentRank = newRank;
          } else {
            delete progress.currentRank;
          }
        } catch (e) {
          console.warn('rank compute failed:', e);
        }
      }

      const nextTitles = Array.from(unlockedTitleSet);
      const activeTitle = userData.activeTitle || nextTitles[0] || '';

      const batch = this.db.batch();
      batch.update(sessionRef, { consumed: true, runScore });
      batch.update(userRef, {
        highScore: newHighScore,
        totalGames: newTotalGames,
        totalScore: newTotalScore,
        titles: nextTitles,
        activeTitle,
        progress,
        lastPlayed: firebase.firestore.FieldValue.serverTimestamp(),
        lastScoreSessionId: sessionId
      });
      await batch.commit();
      this._lastScoreSubmitAt = now;

      const merged = {
        highScore: newHighScore,
        totalGames: newTotalGames,
        totalScore: newTotalScore,
        titles: nextTitles,
        activeTitle,
        progress
      };

      try {
        const dynamicAdded = await this.evaluateDynamicTitles(userRef, merged);
        if (dynamicAdded) merged.titles = dynamicAdded;
      } catch (e) {
        console.warn('evaluateDynamicTitles after saveScore:', e);
      }

      return merged;
    } catch (error) {
      throw error;
    }
  }

  // 進捗更新（称号条件用）
  async updateProgress(progressPatch) {
    try {
      const user = this.auth.currentUser;
      if (!user) throw new Error('ユーザーがログインしていません');

      const userRef = this.db.collection('users').doc(user.uid);
      const userDoc = await userRef.get();
      if (!userDoc.exists) throw new Error('ユーザーデータが見つかりません');

      const userData = userDoc.data();
      const currentProgress = userData.progress || {};
      const nextProgress = { ...currentProgress, ...progressPatch };

      // 単調増加するフィールド: 既存値より小さい値で上書きしない
      const MONOTONIC_FIELDS = ['maxBossLevelDefeated'];
      MONOTONIC_FIELDS.forEach(k => {
        const incoming = Number(progressPatch[k]);
        const existing = Number(currentProgress[k]) || 0;
        if (!isNaN(incoming)) nextProgress[k] = Math.max(existing, incoming);
      });

      // 個別の武器解放フラグが揃ったら allWeaponsUnlocked を立てる
      if (nextProgress.rapidUnlocked && nextProgress.shotgunUnlocked && nextProgress.laserUnlocked) {
        nextProgress.allWeaponsUnlocked = true;
      }

      const currentTitles = Array.isArray(userData.titles) ? [...userData.titles] : [];
      const unlockedTitleSet = new Set(currentTitles);
      if (nextProgress.allWeaponsUnlocked) {
        unlockedTitleSet.add(FIXED_TITLES.weaponMaster);
      }
      const nextTitles = Array.from(unlockedTitleSet);
      const activeTitle = userData.activeTitle || nextTitles[0] || '';

      await userRef.update({
        progress: nextProgress,
        titles: nextTitles,
        activeTitle: activeTitle,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      // 動的称号評価（イベントボス系などはここで反映）
      const dynamicAdded = await this.evaluateDynamicTitles(userRef, {
        ...userData,
        progress: nextProgress,
        titles: nextTitles
      });
      const finalTitles = dynamicAdded || nextTitles;
      return { progress: nextProgress, titles: finalTitles, activeTitle };
    } catch (error) {
      throw error;
    }
  }

  // ユーザーデータ取得
  async getUserData() {
    try {
      const user = this.auth.currentUser;
      if (!user) throw new Error('ユーザーがログインしていません');
      
      const userDoc = await this.db.collection('users').doc(user.uid).get();
      if (userDoc.exists) {
        return userDoc.data();
      }
      return null;
    } catch (error) {
      throw error;
    }
  }

  /**
   * 最高スコアが 3000 を超えているが shieldUnlocked が無い既存ユーザーへ、
   * progress.shieldUnlocked をレトロフィット付与する（ゲーム内スコア解放と同条件: highScore > 3000）。
   * 成功時は localStorage の weaponProgress にも反映する。
   * @returns {Promise<boolean>} Firestore を更新したら true
   */
  async ensureShieldUnlockedForLegacyHighScore() {
    try {
      const user = this.auth.currentUser;
      if (!user) return false;

      const userRef = this.db.collection('users').doc(user.uid);
      const snap = await userRef.get();
      if (!snap.exists) return false;

      const userData = snap.data();
      const highScore = Number(userData.highScore) || 0;
      if (highScore <= 3000) return false;

      const progress = { ...(userData.progress || {}) };
      if (progress.shieldUnlocked) return false;

      progress.shieldUnlocked = true;
      await userRef.update({
        progress,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });

      try {
        const local = JSON.parse(localStorage.getItem('weaponProgress') || '{}') || {};
        if (!local.shieldUnlocked) {
          local.shieldUnlocked = true;
          localStorage.setItem('weaponProgress', JSON.stringify(local));
        }
      } catch (e) { /* ignore */ }

      return true;
    } catch (e) {
      console.warn('ensureShieldUnlockedForLegacyHighScore:', e);
      return false;
    }
  }

  // 指定ユーザーの現在のランキング順位を返す。トップ scanLimit 名の中に
  // 自分が見つかれば 1 始まりの順位を、見つからなければ null を返す。
  // ランキング称号はトップ RANKING_TITLE_LIMIT 位までを順位ごとに付与する。
  async computeRank(uid, highScore, scanLimit = RANKING_TITLE_LIMIT) {
    try {
      if (highScore <= 0) return null;

      const snapshot = await this.db.collection('users')
        .orderBy('highScore', 'desc')
        .limit(RANKING_QUERY_FETCH_PAD)
        .get();
      let position = 0;
      let found = null;
      snapshot.forEach(doc => {
        if (isSuspiciousRankingUser(doc.data())) return;
        position += 1;
        if (position > scanLimit) return;
        if (doc.id === uid) found = position;
      });
      return found;
    } catch (e) {
      console.warn('computeRank error:', e);
      return null;
    }
  }

  // アプリ起動時にランキング称号を最新化する。
  //   - 自分のスコアでは順位は上がりようがないが、他人の更新で「降格」「圏外」になり得るので、
  //     ホーム画面が開かれたタイミングで再評価する。
  //   - 降格 or 圏外を検出した場合のみ通知ペイロードを返す（昇格は通知しない）。
  //   - DB の progress.currentRank が即時更新されるため、同じ変動で再度ポップアップが
  //     表示されることはない（自然なデデュプ）。
  //
  // 戻り値: null | { type: 'demoted' | 'lost', oldRank, newRank, lostTitle, newTitle }
  async refreshRankingTitleOnStartup() {
    try {
      const user = this.auth.currentUser;
      if (!user) return null;
      const userRef = this.db.collection('users').doc(user.uid);
      const userDoc = await userRef.get();
      if (!userDoc.exists) return null;

      const userData = userDoc.data();
      const highScore = userData.highScore || 0;
      if (highScore <= 0) return null; // 未プレイのユーザーは対象外

      const progress = { ...(userData.progress || {}) };
      const oldRank = Number(progress.currentRank) || 0;

      if (isSuspiciousRankingUser(userData)) {
        if (oldRank > 0) {
          delete progress.currentRank;
          await userRef.update({
            progress,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
          });
          try {
            await this.evaluateDynamicTitles(userRef, { ...userData, progress });
          } catch (e) { /* ignore */ }
        }
        return null;
      }

      const newRankRaw = await this.computeRank(user.uid, highScore);
      const inBand = !!(newRankRaw && newRankRaw >= 1 && newRankRaw <= RANKING_TITLE_LIMIT);
      const newRank = inBand ? newRankRaw : 0;

      // 変化なし: 早期 return
      if (oldRank === newRank) return null;

      const isDemotion = oldRank > 0 && (!inBand || newRank > oldRank);

      // ランキング称号ラベル群を、後段の称号書き換え用に取得
      const titles = await this.listTitles();
      const findTitleByRank = (rank) => {
        if (!rank) return null;
        const t = titles.find(tt => tt && tt.condition && tt.condition.type === 'ranking' && Number(tt.condition.value) === rank);
        return t ? t.label : null;
      };
      const lostTitle = isDemotion ? findTitleByRank(oldRank) : null;
      const newTitle  = inBand     ? findTitleByRank(newRank) : null;

      // currentRank を反映して再評価。圏外なら削除。
      if (inBand) progress.currentRank = newRank;
      else delete progress.currentRank;

      await userRef.update({
        progress,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      // evaluateDynamicTitles 側で ranking 系は剥奪→再付与されるので、ここで明示的にラベル操作は不要
      await this.evaluateDynamicTitles(userRef, { ...userData, progress });

      if (isDemotion) {
        return {
          type: inBand ? 'demoted' : 'lost',
          oldRank,
          newRank: inBand ? newRank : null,
          lostTitle,
          newTitle
        };
      }
      // 昇格は通知しない
      return null;
    } catch (e) {
      console.warn('refreshRankingTitleOnStartup failed:', e);
      return null;
    }
  }

  // 総ユーザー数を取得。
  //   v9.7+ の集計クエリ (count().get()) があれば 1 ドキュメント読み取りで済むが、
  //   この compat SDK は 9.0.0 系なので、フルスキャンにフォールバックする。
  //   小規模利用なら問題ないが、ユーザーが増えてきたら後日 aggregation に切り替える。
  async getUserCount() {
    try {
      // 1) 集計クエリが使えるなら最優先
      const coll = this.db.collection('users');
      if (typeof coll.count === 'function') {
        try {
          const agg = await coll.count().get();
          if (agg && typeof agg.data === 'function') {
            const data = agg.data();
            return Number(data.count) || 0;
          }
        } catch (e) {
          // 失敗したら下のフルスキャンへフォールバック
          console.warn('users count() aggregation failed, falling back to scan:', e);
        }
      }
      // 2) フォールバック: 全件取得して size を返す
      const snapshot = await coll.get();
      return snapshot.size;
    } catch (e) {
      console.warn('getUserCount failed:', e);
      return null;
    }
  }

  _assertAdminSession() {
    if (!isShootingAdminSession()) {
      throw new Error('管理者のみ実行できます');
    }
  }

  /** 改竄疑いユーザーの一覧（管理者用） */
  async listSuspiciousUsers() {
    this._assertAdminSession();
    const snapshot = await this.db.collection('users').get();
    const rows = [];
    snapshot.forEach((doc) => {
      const data = doc.data();
      if (!isSuspiciousRankingUser(data)) return;
      rows.push({
        id: doc.id,
        username: data.username || '(名前なし)',
        email: data.email || '',
        highScore: Number(data.highScore) || 0,
        totalGames: Number(data.totalGames) || 0,
        totalScore: Number(data.totalScore) || 0,
        reasons: getSuspiciousScoreReasons(data)
      });
    });
    rows.sort((a, b) => b.highScore - a.highScore);
    return rows;
  }

  /**
   * 1ユーザーのスコア系を0に戻す（武器解放・設定は維持）
   * @returns {Promise<object>} 更新後の主要フィールド
   */
  async adminResetUserScoresToZero(uid) {
    this._assertAdminSession();
    if (!uid) throw new Error('UID が必要です');

    const userRef = this.db.collection('users').doc(uid);
    const snap = await userRef.get();
    if (!snap.exists) throw new Error('ユーザーが見つかりません');
    const data = snap.data();

    let rankingLabels = new Set();
    try {
      const dynamicTitles = await this.listTitles();
      dynamicTitles.forEach((t) => {
        if (t && t.condition && t.condition.type === 'ranking' && t.label) {
          rankingLabels.add(t.label);
        }
      });
    } catch (e) { /* ignore */ }

    const progress = { ...(data.progress || {}) };
    delete progress.currentRank;

    const titles = (Array.isArray(data.titles) ? data.titles : []).filter((label) => {
      if (label === FIXED_TITLES.score100 || label === FIXED_TITLES.rookie) return false;
      if (rankingLabels.has(label)) return false;
      return true;
    });

    const patch = {
      highScore: 0,
      totalGames: 0,
      totalScore: 0,
      titles,
      activeTitle: titles[0] || data.activeTitle || '',
      progress,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };

    await userRef.update(patch);

    try {
      await this.evaluateDynamicTitles(userRef, {
        ...data,
        highScore: 0,
        totalGames: 0,
        totalScore: 0,
        titles,
        progress
      });
    } catch (e) {
      console.warn('evaluateDynamicTitles after admin reset:', e);
    }

    return {
      uid,
      username: data.username,
      email: data.email,
      ...patch
    };
  }

  /** 改竄疑いユーザーを一括でスコア0にリセット */
  async adminResetAllSuspiciousUsers() {
    this._assertAdminSession();
    const targets = await this.listSuspiciousUsers();
    const results = [];
    for (const u of targets) {
      try {
        await this.adminResetUserScoresToZero(u.id);
        results.push({ id: u.id, username: u.username, ok: true });
      } catch (e) {
        results.push({ id: u.id, username: u.username, ok: false, error: e.message });
      }
    }
    return {
      total: targets.length,
      resetCount: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok),
      targets
    };
  }

  /**
   * ランキング取得
   * @param {'highScore'|'averageScore'} kind  highScore: 最高スコア上位10（クエリ効率あり）
   *   averageScore: 平均スコア（総スコア÷総プレイ）上位10。1回以上プレイしたユーザーのみ。
   */
  async getRanking(kind = 'highScore') {
    const mode = (kind === 'averageScore' || kind === 'average' || kind === 'avg') ? 'averageScore' : 'highScore';
    try {
      if (mode === 'highScore') {
        const snapshot = await this.db.collection('users')
          .orderBy('highScore', 'desc')
          .limit(RANKING_QUERY_FETCH_PAD)
          .get();

        const ranking = [];
        snapshot.forEach(doc => {
          if (ranking.length >= 10) return;
          const data = doc.data();
          if (isSuspiciousRankingUser(data)) return;
          const tg = Number(data.totalGames) || 0;
          const ts = Number(data.totalScore) || 0;
          const averageScore = tg > 0 ? Math.round(ts / tg) : 0;
          ranking.push({
            id: doc.id,
            username: data.username,
            highScore: data.highScore || 0,
            averageScore,
            activeTitle: data.activeTitle || ''
          });
        });
        return ranking;
      }

      // 平均スコア: 集計フィールドが無いユーザーが混在するため全件取得してソート（小規模向け）
      const snapshot = await this.db.collection('users').get();
      const rows = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        if (isSuspiciousRankingUser(data)) return;
        const tg = Number(data.totalGames) || 0;
        const ts = Number(data.totalScore) || 0;
        if (tg < 1) return;
        const averageScore = Math.round(ts / tg);
        if (averageScore > MAX_SCORE_SUBMIT_PER_RUN) return;
        rows.push({
          id: doc.id,
          username: data.username,
          highScore: data.highScore || 0,
          averageScore,
          activeTitle: data.activeTitle || ''
        });
      });
      rows.sort((a, b) => {
        if (b.averageScore !== a.averageScore) return b.averageScore - a.averageScore;
        return (b.highScore || 0) - (a.highScore || 0);
      });
      return rows.slice(0, 10);
    } catch (error) {
      throw error;
    }
  }

  // 設定保存
  async saveSettings(settings) {
    try {
      const user = this.auth.currentUser;
      if (!user) throw new Error('ユーザーがログインしていません');
      
      await this.db.collection('users').doc(user.uid).update({
        settings: settings,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (error) {
      throw error;
    }
  }

  // 設定取得
  async getSettings() {
    try {
      const user = this.auth.currentUser;
      if (!user) throw new Error('ユーザーがログインしていません');
      
      const userDoc = await this.db.collection('users').doc(user.uid).get();
      if (userDoc.exists) {
        const data = userDoc.data();
        return data.settings || {};
      }
      return {};
    } catch (error) {
      throw error;
    }
  }

  // PvP対戦機能

  // 対戦ルーム作成
  async createPvPRoom() {
    try {
      const user = this.auth.currentUser;
      if (!user) throw new Error('ユーザーがログインしていません');
      
      const roomRef = await this.db.collection('pvp_rooms').add({
        player1: {
          uid: user.uid,
          username: user.displayName || user.email.split('@')[0],
          ready: true
        },
        player2: null,
        status: 'waiting',
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        gameData: {
          player1Hp: 100,
          player2Hp: 100,
          obstacles: [],
          gameTime: 120
        }
      });
      
      return roomRef.id;
    } catch (error) {
      throw error;
    }
  }

  // 対戦ルーム参加
  async joinPvPRoom(roomId) {
    try {
      const user = this.auth.currentUser;
      if (!user) throw new Error('ユーザーがログインしていません');
      
      const roomRef = this.db.collection('pvp_rooms').doc(roomId);
      const roomDoc = await roomRef.get();
      
      if (!roomDoc.exists) {
        throw new Error('ルームが見つかりません');
      }
      
      const roomData = roomDoc.data();
      if (roomData.player2) {
        throw new Error('ルームが満員です');
      }
      
      await roomRef.update({
        player2: {
          uid: user.uid,
          username: user.displayName || user.email.split('@')[0],
          ready: true
        },
        status: 'ready'
      });
      
      return roomId;
    } catch (error) {
      throw error;
    }
  }

  // 利用可能なルーム取得
  async getAvailableRooms() {
    try {
      console.log('利用可能なルームを検索中...');
      
      // インデックスエラーを回避するため、シンプルなクエリを使用
      const snapshot = await this.db.collection('pvp_rooms')
        .where('status', '==', 'waiting')
        .limit(10)
        .get();
      
      const rooms = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        rooms.push({
          id: doc.id,
          player1: data.player1,
          createdAt: data.createdAt
        });
      });
      
      console.log(`利用可能なルーム数: ${rooms.length}`);
      return rooms;
    } catch (error) {
      console.error('ルーム取得エラー:', error);
      
      // インデックスエラーの場合は空の配列を返す
      if (error.message.includes('index') || error.message.includes('requires an index')) {
        console.log('Firebaseインデックスが作成中です。空のルームリストを返します。');
        console.log('インデックス作成URL:', error.message.match(/https:\/\/console\.firebase\.google\.com[^\s]*/));
        return [];
      }
      
      throw error;
    }
  }

  // 弾丸情報送信
  async sendBullet(roomId, playerId, bulletData) {
    try {
      const user = this.auth.currentUser;
      if (!user) throw new Error('ユーザーがログインしていません');
      
      await this.db.collection('pvp_rooms').doc(roomId)
        .collection('bullets')
        .add({
          playerId: playerId,
          bullet: bulletData,
          timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
      throw error;
    }
  }

  // ゲーム状態更新
  async updateGameState(roomId, gameState) {
    try {
      const user = this.auth.currentUser;
      if (!user) throw new Error('ユーザーがログインしていません');
      
      await this.db.collection('pvp_rooms').doc(roomId).update({
        gameData: gameState,
        lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
      });
    } catch (error) {
      throw error;
    }
  }

  // ルーム状態監視
  onRoomStateChange(roomId, callback) {
    return this.db.collection('pvp_rooms').doc(roomId)
      .onSnapshot((doc) => {
        if (doc.exists) {
          callback(doc.data());
        }
      });
  }

  // 弾丸情報監視
  onBulletsChange(roomId, callback) {
    return this.db.collection('pvp_rooms').doc(roomId)
      .collection('bullets')
      .orderBy('timestamp', 'desc')
      .limit(50)
      .onSnapshot((snapshot) => {
        const bullets = [];
        snapshot.forEach(doc => {
          bullets.push(doc.data());
        });
        callback(bullets);
      });
  }

  // ─────────────────────────────────────────────
  // 管理者用 API（イベント / 動的称号）
  //   events/{eventId}: { title, startsAt(ISO), endsAt(ISO), bosses[], active }
  //   active=true のドキュメントがゲームに反映（日時は参考用。複数ある場合は updatedAt が新しい方）
  //   config/builtinEventAccess: 艦隊・星獣ビルトインの公開モード・参加キー
  //   titles/{titleId}: { label, condition: { type, value } }
  // ─────────────────────────────────────────────
  async getBuiltinEventAccess() {
    try {
      const doc = await this.db.collection('config').doc(BUILTIN_EVENT_ACCESS_DOC_ID).get();
      if (!doc.exists) return normalizeBuiltinEventAccess(null);
      return normalizeBuiltinEventAccess(doc.data());
    } catch (e) {
      console.warn('getBuiltinEventAccess failed:', e);
      return normalizeBuiltinEventAccess(null);
    }
  }

  async saveBuiltinEventAccess(data) {
    const user = this.auth.currentUser;
    if (!user || !isAdminEmail(user.email)) throw new Error('管理者権限がありません');
    const n = normalizeBuiltinEventAccess(data);
    await this.db.collection('config').doc(BUILTIN_EVENT_ACCESS_DOC_ID).set({
      shadowFleet: n.shadowFleet,
      cosmicDragon: n.cosmicDragon,
      testBypassKey: n.testBypassKey,
      maintenanceMessageJa: n.maintenanceMessageJa,
      testMessageJa: n.testMessageJa,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
  }

  async listEvents() {
    const snap = await this.db.collection('events').orderBy('endsAt', 'desc').get();
    const list = [];
    snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
    return list;
  }

  /** Firestore の updatedAt 等をミリ秒に（並び替え用） */
  _eventDocUpdatedMillis(d) {
    const u = d && d.updatedAt;
    if (u != null && typeof u.toMillis === 'function') return u.toMillis();
    if (typeof u === 'number' && Number.isFinite(u)) return u;
    if (u != null && typeof u.seconds === 'number') {
      return u.seconds * 1000 + (typeof u.nanoseconds === 'number' ? u.nanoseconds / 1e6 : 0);
    }
    return 0;
  }

  // 現在ゲームに載せるイベント: active=true のみ（開始/終了日時は管理用・表示用。公開 ON なら日時外でも反映）
  async getActiveEvent() {
    try {
      const snap = await this.db.collection('events').where('active', '==', true).get();
      const rows = [];
      snap.forEach(doc => rows.push({ id: doc.id, ...doc.data() }));
      if (!rows.length) return null;
      rows.sort((a, b) => this._eventDocUpdatedMillis(b) - this._eventDocUpdatedMillis(a));
      return rows[0];
    } catch (e) {
      console.warn('getActiveEvent failed:', e);
      return null;
    }
  }

  async saveEvent(eventId, data) {
    const user = this.auth.currentUser;
    if (!user || !isAdminEmail(user.email)) throw new Error('管理者権限がありません');
    const payload = { ...data, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    if (eventId) {
      await this.db.collection('events').doc(eventId).set(payload, { merge: true });
      return eventId;
    } else {
      payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      const ref = await this.db.collection('events').add(payload);
      return ref.id;
    }
  }

  async deleteEvent(eventId) {
    const user = this.auth.currentUser;
    if (!user || !isAdminEmail(user.email)) throw new Error('管理者権限がありません');
    await this.db.collection('events').doc(eventId).delete();
  }

  async listTitles() {
    const snap = await this.db.collection('titles').get();
    const list = [];
    snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
    return list;
  }

  async saveTitle(titleId, data) {
    const user = this.auth.currentUser;
    if (!user || !isAdminEmail(user.email)) throw new Error('管理者権限がありません');
    const payload = { ...data, updatedAt: firebase.firestore.FieldValue.serverTimestamp() };
    if (titleId) {
      await this.db.collection('titles').doc(titleId).set(payload, { merge: true });
      return titleId;
    } else {
      payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      const ref = await this.db.collection('titles').add(payload);
      return ref.id;
    }
  }

  async deleteTitle(titleId) {
    const user = this.auth.currentUser;
    if (!user || !isAdminEmail(user.email)) throw new Error('管理者権限がありません');
    await this.db.collection('titles').doc(titleId).delete();
  }

  // ─────── お知らせ（全員が読める / 管理者のみ編集）───────
  // announcements/{id}: title, body, imageUrl?, active, showPopup, priority,
  //   startsAt / endsAt (任意・ISO 文字列。空なら期間制限なし)
  _announcementCreatedMillis(data) {
    const c = data && data.createdAt;
    if (c && typeof c.toMillis === 'function') return c.toMillis();
    if (typeof c === 'number') return c;
    return 0;
  }

  /** お知らせの startsAt/endsAt: ISO 文字列想定だが Timestamp や数値が混ざっても比較可能に */
  _announcementTimeToIso(v) {
    if (v == null || v === '') return '';
    if (typeof v === 'string') return String(v).trim();
    if (typeof v === 'number' && Number.isFinite(v)) {
      const d = new Date(v);
      return isNaN(d.getTime()) ? '' : d.toISOString();
    }
    if (typeof v === 'object' && v !== null && typeof v.toDate === 'function') {
      const d = v.toDate();
      return isNaN(d.getTime()) ? '' : d.toISOString();
    }
    if (typeof v === 'object' && v !== null && typeof v.seconds === 'number') {
      const ms = v.seconds * 1000 + (typeof v.nanoseconds === 'number' ? v.nanoseconds / 1e6 : 0);
      const d = new Date(ms);
      return isNaN(d.getTime()) ? '' : d.toISOString();
    }
    return String(v).trim();
  }

  /** Firestore の画像 URL（複数キー・改行混入に対応） */
  _announcementImageUrlFromData(d) {
    if (!d) return '';
    const candidates = [d.imageUrl, d.imageURL, d.bannerUrl, d.banner_url, d.image];
    let s = '';
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      if (c == null || c === '') continue;
      if (typeof c === 'string') {
        s = c;
        break;
      }
      if (typeof c === 'object' && c !== null && typeof c.url === 'string') {
        s = c.url;
        break;
      }
    }
    if (!s) return '';
    s = String(s).replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
    if (s.startsWith('`') && s.endsWith('`')) s = s.slice(1, -1).trim();
    if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
      s = s.slice(1, -1).trim();
    }
    // URL 内に紛れた改行・タブ・スペースを除去（エディタ折り返し・コピペ対策）
    s = s.replace(/\s+/g, '');
    return s;
  }

  _normalizeAnnouncementDoc(id, d) {
    if (!d) {
      return {
        id, title: '', body: '', imageUrl: '', active: false, showPopup: false, priority: 0, startsAt: '', endsAt: ''
      };
    }
    return {
      id,
      title: String(d.title || '').trim(),
      body: String(d.body || ''),
      imageUrl: this._announcementImageUrlFromData(d),
      active: !!d.active,
      showPopup: !!d.showPopup,
      priority: Number(d.priority) || 0,
      startsAt: this._announcementTimeToIso(d.startsAt),
      endsAt: this._announcementTimeToIso(d.endsAt),
      createdAt: d.createdAt,
      updatedAt: d.updatedAt
    };
  }

  _isAnnouncementInWindow(ann, now) {
    if (!ann || !ann.active) return false;
    const t = typeof now === 'number' ? now : Date.now();
    if (ann.startsAt) {
      const s = Date.parse(ann.startsAt);
      if (!isNaN(s) && t < s) return false;
    }
    if (ann.endsAt) {
      const e = Date.parse(ann.endsAt);
      if (!isNaN(e) && t > e) return false;
    }
    return true;
  }

  /** ゲーム・ホーム用: 公開中かつ表示期間内のお知らせのみ（新しい順） */
  async listAnnouncementsPublic() {
    const snap = await this.db.collection('announcements').get();
    const now = Date.now();
    const list = [];
    snap.forEach(doc => {
      const ann = this._normalizeAnnouncementDoc(doc.id, doc.data());
      if (!this._isAnnouncementInWindow(ann, now)) return;
      list.push(ann);
    });
    list.sort((a, b) => (Number(b.priority) - Number(a.priority))
      || (this._announcementCreatedMillis(b) - this._announcementCreatedMillis(a)));
    if (!this._annPublicFilterWarned && snap.size > 0 && list.length === 0) {
      this._annPublicFilterWarned = true;
      console.warn(
        '[FirebaseDataManager] announcements: Firestore に',
        snap.size,
        '件ありますが「公開」かつ掲載期間内のものは 0 件です。管理画面で「公開する」と掲載開始/終了を確認してください。'
      );
    }
    return list;
  }

  /** 管理画面用: 期間フィルタなしの全件 */
  async listAnnouncementsAll() {
    const snap = await this.db.collection('announcements').get();
    const list = [];
    snap.forEach(doc => list.push(this._normalizeAnnouncementDoc(doc.id, doc.data())));
    list.sort((a, b) => (this._announcementCreatedMillis(b) - this._announcementCreatedMillis(a)));
    return list;
  }

  async saveAnnouncement(announcementId, data) {
    const user = this.auth.currentUser;
    if (!user || !isAdminEmail(user.email)) throw new Error('管理者権限がありません');
    const payload = {
      title: String((data && data.title) || '').trim(),
      body: String((data && data.body) || ''),
      imageUrl: (data && data.imageUrl) ? String(data.imageUrl).trim() : '',
      active: !!(data && data.active),
      showPopup: !!(data && data.showPopup),
      priority: Number(data && data.priority) || 0,
      startsAt: (data && data.startsAt) ? String(data.startsAt).trim() : '',
      endsAt: (data && data.endsAt) ? String(data.endsAt).trim() : '',
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    };
    if (announcementId) {
      await this.db.collection('announcements').doc(announcementId).set(payload, { merge: true });
      return announcementId;
    }
    payload.createdAt = firebase.firestore.FieldValue.serverTimestamp();
    const ref = await this.db.collection('announcements').add(payload);
    return ref.id;
  }

  async deleteAnnouncement(announcementId) {
    const user = this.auth.currentUser;
    if (!user || !isAdminEmail(user.email)) throw new Error('管理者権限がありません');
    await this.db.collection('announcements').doc(announcementId).delete();
  }

  // 画像アップロード（管理者専用）。File を受け取って Storage に保存し
  // ダウンロード可能な永続URLを返す。
  async uploadImageToFolder(folder, file, opts = {}) {
    if (!this.storage) throw new Error('Firebase Storage SDK が初期化されていません');
    const user = this.auth.currentUser;
    if (!user || !isAdminEmail(user.email)) throw new Error('管理者権限がありません');

    const safeName = (file.name || 'image').replace(/[^\w.\-]/g, '_');
    const ts = Date.now();
    const path = `${folder}/${ts}_${safeName}`;
    const ref = this.storage.ref().child(path);
    const metadata = { contentType: file.type || 'image/png' };
    const task = await ref.put(file, metadata);
    const url = await task.ref.getDownloadURL();
    if (typeof opts.onComplete === 'function') opts.onComplete(url);
    return { url, path };
  }
  // 互換: 既存呼び出し名
  async uploadEventBossImage(file, opts = {}) {
    return this.uploadImageToFolder('event-bosses', file, opts);
  }
  async uploadTitleIcon(file, opts = {}) {
    return this.uploadImageToFolder('title-icons', file, opts);
  }
  async uploadAnnouncementImage(file, opts = {}) {
    return this.uploadImageToFolder('announcements', file, opts);
  }

  // 動的称号: ユーザーデータを元に、未解放の称号を解禁
  //   condition.type:
  //     'score'          : highScore  >= condition.value
  //     'totalScore'     : totalScore >= condition.value（累計スコア）
  //     'totalGames'     : totalGames >= condition.value
  //     'eventBoss'      : progress[condition.value] === true (任意の progress flag)
  //     'progressFlag'   : progress[condition.value] === true (eventBoss と同義の汎用版)
  //     'bossLevel'      : progress.maxBossLevelDefeated >= condition.value
  //     'weaponUnlocked' : progress[`${value}Unlocked`] === true（例: shotgun → shotgunUnlocked）
  //     'allWeapons'     : progress.allWeaponsUnlocked === true（value 不要）
  //     'eventClear'     : progress 中の eventBossSkin* フラグが value 個以上
  //     'noDamageRun'    : progress.noDamageRunDone === true（value 不要）
  //     'multiTitle'     : 現在所持している称号数 >= value（自分自身は除外）
  //     'ranking'        : progress.currentRank === value（厳密一致 / 圏外 = 剥奪）
  // ranking だけは「降格」を伴う唯一の動的称号タイプ。トップ RANKING_TITLE_LIMIT
  // 以内に入っているときのみ、その順位ぴったりの称号を付与する。
  async evaluateDynamicTitles(userRef, userData) {
    try {
      const titles = await this.listTitles();
      if (!titles.length) return null;
      const current = Array.isArray(userData.titles) ? [...userData.titles] : [];
      const progress = userData.progress || {};
      const highScore = userData.highScore || 0;
      const totalGames = userData.totalGames || 0;
      const totalScore = userData.totalScore || 0;
      const maxBossLv  = Number(progress.maxBossLevelDefeated) || 0;
      const currentRank = Number(progress.currentRank) || 0; // 0 = 圏外 or 未計測
      const eventSkinCount = Object.keys(progress).filter(k => k.startsWith('eventBossSkin') && !!progress[k]).length;

      // ranking 系の称号は条件を満たさなくなったら剥奪する必要があるので、
      // 一度ベースから除外しておき、評価で満たしたものだけ後で追加する。
      const rankingTitleLabels = new Set();
      for (const t of titles) {
        if (t && t.condition && t.condition.type === 'ranking' && t.label) {
          rankingTitleLabels.add(t.label);
        }
      }
      const set = new Set([...current].filter(label => !rankingTitleLabels.has(label)));

      // multiTitle 評価のために 2 パス: まず通常の称号を解禁、次に multiTitle を判定。
      // （multiTitle が他の称号にも依存するため）
      const passes = [];
      for (const t of titles) {
        if (!t.label) continue;
        const cond = t.condition || {};
        if (cond.type === 'multiTitle') {
          passes.push(t);
          continue;
        }
        let ok = false;
        switch (cond.type) {
          case 'score':          ok = highScore  >= (Number(cond.value) || 0); break;
          case 'totalScore':     ok = totalScore >= (Number(cond.value) || 0); break;
          case 'totalGames':     ok = totalGames >= (Number(cond.value) || 0); break;
          case 'eventBoss':      ok = !!progress[cond.value]; break;
          case 'progressFlag':   ok = !!progress[cond.value]; break;
          case 'bossLevel':      ok = maxBossLv >= (Number(cond.value) || 0); break;
          case 'weaponUnlocked': ok = !!progress[`${cond.value}Unlocked`]; break;
          case 'allWeapons':     ok = !!progress.allWeaponsUnlocked; break;
          case 'eventClear':     ok = eventSkinCount >= (Number(cond.value) || 0); break;
          case 'noDamageRun':    ok = !!progress.noDamageRunDone; break;
          case 'ranking':        ok = currentRank > 0 && currentRank === (Number(cond.value) || 0); break;
          default: ok = false;
        }
        if (ok) set.add(t.label);
      }
      // multiTitle の評価（既に上で取得した称号数を基準）
      for (const t of passes) {
        const need = Number(t.condition.value) || 0;
        // 自分自身を除いた称号数
        const have = Array.from(set).filter(label => label !== t.label).length;
        if (have >= need) set.add(t.label);
      }

      // 集合に変化があれば書き戻す。ranking 系は剥奪もあるため、長さだけで判定せず
      // 要素の出入りもチェックする。
      const next = Array.from(set);
      const before = [...current].sort();
      const after  = [...next].sort();
      const changed = before.length !== after.length || before.some((v, i) => v !== after[i]);

      if (changed) {
        const update = { titles: next };
        // activeTitle が剥奪された場合は別の所持称号にフォールバック
        if (userData.activeTitle && !next.includes(userData.activeTitle)) {
          update.activeTitle = next[0] || '';
        }
        await userRef.update(update);
        return next;
      }
      return null;
    } catch (e) {
      console.warn('evaluateDynamicTitles failed:', e);
      return null;
    }
  }
}

// グローバルインスタンス（let/const は window のプロパティにならない。
// announcements-ui.js 等は window.firebaseDataManager を参照するため明示的に載せる）
const firebaseDataManager = new FirebaseDataManager();
if (typeof window !== 'undefined') {
  window.firebaseDataManager = firebaseDataManager;
  window.isShootingAdminSession = isShootingAdminSession;
  window.normalizeBuiltinEventAccess = normalizeBuiltinEventAccess;
  window.syncShootingEventBypassFromUrl = syncShootingEventBypassFromUrl;
  window.hasShootingEventBypass = hasShootingEventBypass;
  window.canPlayBuiltinShadowFleet = canPlayBuiltinShadowFleet;
  window.canPlayBuiltinCosmicDragon = canPlayBuiltinCosmicDragon;
  window.isSuspiciousRankingUser = isSuspiciousRankingUser;
  window.getSuspiciousScoreReasons = getSuspiciousScoreReasons;
}

// 認証状態の監視
auth.onAuthStateChanged((user) => {
  if (user) {
    console.log('ユーザーがログインしました:', user.email);
  } else {
    console.log('ユーザーがログアウトしました');
  }
}); 