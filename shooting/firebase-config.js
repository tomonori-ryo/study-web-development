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
        const oldHighScore = userData.highScore || 0;
        const newHighScore = Math.max(oldHighScore, score);
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

        // ランキング判定: トップ RANKING_TITLE_LIMIT 名のみをスキャンし
        //   現在順位を progress.currentRank に保存。圏外なら削除して称号も剥奪。
        //   ハイスコアを更新した時のみ自分の順位は上がりうるので、その時だけ計算する。
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

  // 指定ユーザーの現在のランキング順位を返す。トップ scanLimit 名の中に
  // 自分が見つかれば 1 始まりの順位を、見つからなければ null を返す。
  // ランキング称号はトップ RANKING_TITLE_LIMIT 位までを順位ごとに付与する。
  async computeRank(uid, highScore, scanLimit = RANKING_TITLE_LIMIT) {
    try {
      const snapshot = await this.db.collection('users')
        .orderBy('highScore', 'desc')
        .limit(scanLimit)
        .get();
      let position = 0;
      let found = null;
      snapshot.forEach(doc => {
        position += 1;
        if (doc.id === uid) found = position;
      });
      // スコアが 0 の人にランキング称号を付けたくないので保険
      if (highScore <= 0) return null;
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