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

// 固定称号の定義
const FIXED_TITLES = {
  rookie: 'ルーキー',
  score100: 'スコア100突破',
  weaponMaster: 'ウェポンマスター'
};

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

// データ管理クラス
class FirebaseDataManager {
  constructor() {
    this.db = db;
    this.auth = auth;
    this.storage = storage;
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

  // スコア保存
  async saveScore(score) {
    try {
      const user = this.auth.currentUser;
      if (!user) throw new Error('ユーザーがログインしていません');
      
      const userRef = this.db.collection('users').doc(user.uid);
      const userDoc = await userRef.get();
      
      if (userDoc.exists) {
        const userData = userDoc.data();
        const newHighScore = Math.max(userData.highScore || 0, score);
        const newTotalGames = (userData.totalGames || 0) + 1;
        const newTotalScore = (userData.totalScore || 0) + score;
        const currentTitles = Array.isArray(userData.titles) ? [...userData.titles] : [];
        const progress = { ...(userData.progress || {}) };
        const unlockedTitleSet = new Set(currentTitles);

        if (newTotalGames >= 1) {
          unlockedTitleSet.add(FIXED_TITLES.rookie);
        }
        if (newHighScore >= 100) {
          unlockedTitleSet.add(FIXED_TITLES.score100);
        }
        if (progress.rapidUnlocked && progress.shotgunUnlocked && progress.laserUnlocked) {
          progress.allWeaponsUnlocked = true;
        }
        if (progress.allWeaponsUnlocked) {
          unlockedTitleSet.add(FIXED_TITLES.weaponMaster);
        }

        const nextTitles = Array.from(unlockedTitleSet);
        const activeTitle = userData.activeTitle || nextTitles[0] || '';
        
        await userRef.update({
          highScore: newHighScore,
          totalGames: newTotalGames,
          totalScore: newTotalScore,
          titles: nextTitles,
          activeTitle: activeTitle,
          progress: progress,
          lastPlayed: firebase.firestore.FieldValue.serverTimestamp()
        });

        // 動的称号も評価して追加
        const dynamicAdded = await this.evaluateDynamicTitles(userRef, {
          ...userData,
          highScore: newHighScore,
          totalGames: newTotalGames,
          totalScore: newTotalScore,
          titles: nextTitles,
          progress
        });
        const finalTitles = dynamicAdded || nextTitles;
        return { highScore: newHighScore, totalGames: newTotalGames, totalScore: newTotalScore, titles: finalTitles, activeTitle, progress };
      }
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

  // ランキング取得
  async getRanking() {
    try {
      const snapshot = await this.db.collection('users')
        .orderBy('highScore', 'desc')
        .limit(10)
        .get();
      
      const ranking = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        ranking.push({
          id: doc.id,
          username: data.username,
          highScore: data.highScore || 0,
          activeTitle: data.activeTitle || ''
        });
      });
      
      return ranking;
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
  //   titles/{titleId}: { label, condition: { type, value } }
  // ─────────────────────────────────────────────
  async listEvents() {
    const snap = await this.db.collection('events').orderBy('endsAt', 'desc').get();
    const list = [];
    snap.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
    return list;
  }

  // 現在アクティブなイベント (active=true かつ now in [startsAt, endsAt]) を1件取得
  async getActiveEvent() {
    try {
      const snap = await this.db.collection('events').where('active', '==', true).get();
      const now = Date.now();
      let chosen = null;
      snap.forEach(doc => {
        const d = doc.data();
        const start = Date.parse(d.startsAt);
        const end   = Date.parse(d.endsAt);
        if (!isNaN(start) && !isNaN(end) && now >= start && now <= end) {
          if (!chosen) chosen = { id: doc.id, ...d };
        }
      });
      return chosen;
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

  // 画像アップロード（管理者専用）。File を受け取って Storage に保存し
  // ダウンロード可能な永続URLを返す。
  async uploadEventBossImage(file, opts = {}) {
    if (!this.storage) throw new Error('Firebase Storage SDK が初期化されていません');
    const user = this.auth.currentUser;
    if (!user || !isAdminEmail(user.email)) throw new Error('管理者権限がありません');

    const safeName = (file.name || 'image').replace(/[^\w.\-]/g, '_');
    const ts = Date.now();
    const path = `event-bosses/${ts}_${safeName}`;
    const ref = this.storage.ref().child(path);
    const metadata = { contentType: file.type || 'image/png' };
    const task = await ref.put(file, metadata);
    const url = await task.ref.getDownloadURL();
    if (typeof opts.onComplete === 'function') opts.onComplete(url);
    return { url, path };
  }

  // 動的称号: ユーザーデータを元に、未解放の称号を解禁
  //   condition.type:
  //     'score'          : highScore >= condition.value
  //     'totalGames'     : totalGames >= condition.value
  //     'eventBoss'      : progress[condition.value] === true (任意の progress flag)
  //     'bossLevel'      : progress.maxBossLevelDefeated >= condition.value
  //     'weaponUnlocked' : progress[`${value}Unlocked`] === true（例: shotgun → shotgunUnlocked）
  //     'progressFlag'   : progress[condition.value] === true (eventBoss と同義の汎用版)
  async evaluateDynamicTitles(userRef, userData) {
    try {
      const titles = await this.listTitles();
      if (!titles.length) return null;
      const current = Array.isArray(userData.titles) ? [...userData.titles] : [];
      const set = new Set(current);
      const progress = userData.progress || {};
      const highScore = userData.highScore || 0;
      const totalGames = userData.totalGames || 0;
      const maxBossLv  = Number(progress.maxBossLevelDefeated) || 0;

      for (const t of titles) {
        if (!t.label) continue;
        const cond = t.condition || {};
        let ok = false;
        switch (cond.type) {
          case 'score':          ok = highScore >= (Number(cond.value) || 0); break;
          case 'totalGames':     ok = totalGames >= (Number(cond.value) || 0); break;
          case 'eventBoss':      ok = !!progress[cond.value]; break;
          case 'progressFlag':   ok = !!progress[cond.value]; break;
          case 'bossLevel':      ok = maxBossLv >= (Number(cond.value) || 0); break;
          case 'weaponUnlocked': ok = !!progress[`${cond.value}Unlocked`]; break;
          default: ok = false;
        }
        if (ok) set.add(t.label);
      }
      const next = Array.from(set);
      if (next.length !== current.length) {
        await userRef.update({ titles: next });
        return next;
      }
      return null;
    } catch (e) {
      console.warn('evaluateDynamicTitles failed:', e);
      return null;
    }
  }
}

// グローバルインスタンス
const firebaseDataManager = new FirebaseDataManager();

// 認証状態の監視
auth.onAuthStateChanged((user) => {
  if (user) {
    console.log('ユーザーがログインしました:', user.email);
  } else {
    console.log('ユーザーがログアウトしました');
  }
}); 