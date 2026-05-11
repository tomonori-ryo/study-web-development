// npm版Firebase設定
import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
  projectId: "YOUR_PROJECT_ID",
  storageBucket: "YOUR_PROJECT_ID.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Firebase初期化
const app = initializeApp(firebaseConfig);

// Firestoreデータベース
const db = getFirestore(app);

// 認証
const auth = getAuth(app);

// データ管理クラス（npm版）
class FirebaseDataManager {
  constructor() {
    this.db = db;
    this.auth = auth;
  }

  // ユーザー登録
  async registerUser(email, password, username) {
    try {
      const { createUserWithEmailAndPassword } = await import('firebase/auth');
      const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
      
      const userCredential = await createUserWithEmailAndPassword(this.auth, email, password);
      const user = userCredential.user;
      
      // ユーザープロフィールを保存
      await setDoc(doc(this.db, 'users', user.uid), {
        username: username,
        email: email,
        createdAt: serverTimestamp(),
        highScore: 0,
        totalGames: 0,
        totalScore: 0
      });
      
      return user;
    } catch (error) {
      throw error;
    }
  }

  // ユーザーログイン
  async loginUser(email, password) {
    try {
      const { signInWithEmailAndPassword } = await import('firebase/auth');
      const userCredential = await signInWithEmailAndPassword(this.auth, email, password);
      return userCredential.user;
    } catch (error) {
      throw error;
    }
  }

  // ログアウト
  async logoutUser() {
    try {
      const { signOut } = await import('firebase/auth');
      await signOut(this.auth);
    } catch (error) {
      throw error;
    }
  }

  // スコア保存
  async saveScore(score) {
    try {
      const { doc, getDoc, updateDoc, serverTimestamp } = await import('firebase/firestore');
      
      const user = this.auth.currentUser;
      if (!user) throw new Error('ユーザーがログインしていません');
      
      const userRef = doc(this.db, 'users', user.uid);
      const userDoc = await getDoc(userRef);
      
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const newHighScore = Math.max(userData.highScore || 0, score);
        const newTotalGames = (userData.totalGames || 0) + 1;
        const newTotalScore = (userData.totalScore || 0) + score;
        
        await updateDoc(userRef, {
          highScore: newHighScore,
          totalGames: newTotalGames,
          totalScore: newTotalScore,
          lastPlayed: serverTimestamp()
        });
        
        return { highScore: newHighScore, totalGames: newTotalGames, totalScore: newTotalScore };
      }
    } catch (error) {
      throw error;
    }
  }

  // ユーザーデータ取得
  async getUserData() {
    try {
      const { doc, getDoc } = await import('firebase/firestore');
      
      const user = this.auth.currentUser;
      if (!user) throw new Error('ユーザーがログインしていません');
      
      const userDoc = await getDoc(doc(this.db, 'users', user.uid));
      if (userDoc.exists()) {
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
      const { collection, query, orderBy, limit, getDocs } = await import('firebase/firestore');
      
      const q = query(
        collection(this.db, 'users'),
        orderBy('highScore', 'desc'),
        limit(10)
      );
      
      const snapshot = await getDocs(q);
      const ranking = [];
      
      snapshot.forEach(doc => {
        const data = doc.data();
        ranking.push({
          id: doc.id,
          username: data.username,
          highScore: data.highScore || 0
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
      const { doc, updateDoc, serverTimestamp } = await import('firebase/firestore');
      
      const user = this.auth.currentUser;
      if (!user) throw new Error('ユーザーがログインしていません');
      
      await updateDoc(doc(this.db, 'users', user.uid), {
        settings: settings,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      throw error;
    }
  }

  // 設定取得
  async getSettings() {
    try {
      const { doc, getDoc } = await import('firebase/firestore');
      
      const user = this.auth.currentUser;
      if (!user) throw new Error('ユーザーがログインしていません');
      
      const userDoc = await getDoc(doc(this.db, 'users', user.uid));
      if (userDoc.exists()) {
        const data = userDoc.data();
        return data.settings || {};
      }
      return {};
    } catch (error) {
      throw error;
    }
  }
}

// グローバルインスタンス
const firebaseDataManager = new FirebaseDataManager();

export { firebaseDataManager }; 