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

// Analytics
const analytics = firebase.analytics();
console.log('Analytics初期化完了');

// 固定称号の定義
const FIXED_TITLES = {
  rookie: 'ルーキー',
  score100: 'スコア100突破',
  weaponMaster: 'ウェポンマスター'
};

// データ管理クラス
class FirebaseDataManager {
  constructor() {
    this.db = db;
    this.auth = auth;
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
        
        return { highScore: newHighScore, totalGames: newTotalGames, totalScore: newTotalScore, titles: nextTitles, activeTitle, progress };
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

      return { progress: nextProgress, titles: nextTitles, activeTitle };
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