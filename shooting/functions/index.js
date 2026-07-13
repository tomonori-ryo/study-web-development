const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();

const MAX_RUN_SCORE = 20000;
const COOLDOWN_MS = 60000;
const RANKING_TITLE_LIMIT = 5;
const FIXED_TITLES = {
  rookie: 'ルーキー',
  score100: 'スコア100突破',
  weaponMaster: 'ウェポンマスター',
};

async function computeRank(uid, highScore) {
  if (highScore <= 0) return null;
  const snapshot = await admin.firestore()
    .collection('users')
    .orderBy('highScore', 'desc')
    .limit(RANKING_TITLE_LIMIT)
    .get();
  let position = 0;
  let found = null;
  snapshot.forEach((doc) => {
    position += 1;
    if (doc.id === uid) found = position;
  });
  return found;
}

/**
 * スコア保存（クライアントから users の highScore 等を直接書けないようサーバー専用）
 */
exports.submitScore = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'ログインが必要です');
  }

  const uid = context.auth.uid;
  const runScore = Math.floor(Number(data && data.score) || 0);
  if (!Number.isFinite(runScore) || runScore < 0 || runScore > MAX_RUN_SCORE) {
    throw new functions.https.HttpsError('invalid-argument', '無効なスコアです');
  }

  const userRef = admin.firestore().collection('users').doc(uid);

  const result = await admin.firestore().runTransaction(async (transaction) => {
    const userDoc = await transaction.get(userRef);
    if (!userDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'ユーザーデータが見つかりません');
    }

    const userData = userDoc.data();
    const lastPlayed = userData.lastPlayed;
    if (lastPlayed && typeof lastPlayed.toMillis === 'function') {
      const elapsed = Date.now() - lastPlayed.toMillis();
      if (elapsed < COOLDOWN_MS) {
        throw new functions.https.HttpsError(
          'resource-exhausted',
          'スコア送信は60秒に1回までです'
        );
      }
    }

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
      const newRank = await computeRank(uid, newHighScore);
      if (newRank && newRank >= 1 && newRank <= RANKING_TITLE_LIMIT) {
        progress.currentRank = newRank;
      } else {
        delete progress.currentRank;
      }
    }

    const nextTitles = Array.from(unlockedTitleSet);
    const activeTitle = userData.activeTitle || nextTitles[0] || '';

    transaction.update(userRef, {
      highScore: newHighScore,
      totalGames: newTotalGames,
      totalScore: newTotalScore,
      titles: nextTitles,
      activeTitle,
      progress,
      lastPlayed: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
      highScore: newHighScore,
      totalGames: newTotalGames,
      totalScore: newTotalScore,
      titles: nextTitles,
      activeTitle,
      progress,
    };
  });

  return result;
});
