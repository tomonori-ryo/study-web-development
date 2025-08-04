# 戦闘機シューティングゲーム

宇宙を駆け巡る戦闘機で敵を倒すシューティングゲームです。

## 🎮 ゲームの特徴

- **3つの難易度**: 簡単、通常、難しい
- **武器システム**: 4種類の武器（通常弾、連射弾、散弾、レーザー）
- **ボス戦**: レベルに応じて強くなるボス
- **アイテムシステム**: 弾薬補給、ライフ回復
- **アカウント機能**: ユーザー登録、ログイン、マイページ
- **ランキングシステム**: スコアランキング

## 🚀 デプロイ方法

### 1. Firebase設定

1. **Firebaseプロジェクトを作成**
   - [Firebase Console](https://console.firebase.google.com/)にアクセス
   - 新しいプロジェクトを作成

2. **Firestore Databaseを有効化**
   - Firestore Database → データベースを作成
   - セキュリティルールを設定

3. **認証を有効化**
   - Authentication → Sign-in method
   - Email/Passwordを有効化

4. **設定を更新**
   - `firebase-config.js`の設定値を実際の値に変更

### 2. Netlifyでデプロイ（推奨）

1. **Netlifyにサインアップ**
   - [Netlify](https://netlify.com)にアクセス
   - GitHubアカウントでサインアップ

2. **プロジェクトをアップロード**
   - ドラッグ&ドロップでプロジェクトフォルダをアップロード
   - またはGitHubリポジトリを連携

3. **環境変数を設定**
   - Site settings → Environment variables
   - Firebase設定を追加（必要に応じて）

### 3. Firebase Hosting（代替）

1. **Firebase CLIをインストール**
   ```bash
   npm install -g firebase-tools
   ```

2. **Firebaseプロジェクトを初期化**
   ```bash
   firebase login
   firebase init hosting
   ```

3. **デプロイ**
   ```bash
   firebase deploy
   ```

### 4. GitHub Pages

1. **GitHubリポジトリを作成**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/yourusername/shooting-game.git
   git branch -M main
   git push -u origin main
   ```

2. **GitHub Pagesを有効化**
   - Settings → Pages
   - Source: Deploy from a branch
   - Branch: main

## 📁 ファイル構成

```
shooting-game/
├── index.html              # ホームページ
├── mypage.html             # マイページ
├── shooting_game.html      # ゲーム本体
├── firebase-config.js      # Firebase設定
├── firebase.json           # Firebase Hosting設定
├── shoot.mp3              # 射撃音
├── explosion.mp3          # 爆発音
├── boss_shoot.mp3         # ボス射撃音
├── boss_explosion.mp3     # ボス爆発音
├── .github/workflows/     # GitHub Actions設定
└── README.md              # このファイル
```

## 🎯 操作方法

- **移動**: 矢印キー
- **発射**: スペースキー
- **武器変更**: 数字キー1-4
- **ゲーム開始**: ボタンクリック

## 🔧 技術仕様

- **フロントエンド**: HTML5, CSS3, JavaScript (ES6+)
- **バックエンド**: Firebase (Authentication, Firestore)
- **音声**: Web Audio API
- **ストレージ**: LocalStorage + Firebase Firestore
- **レスポンシブデザイン**: 対応
- **認証**: Firebase Authentication
- **データベース**: Cloud Firestore

## 📱 対応ブラウザ

- Chrome 60+
- Firefox 55+
- Safari 12+
- Edge 79+

## 🎨 カスタマイズ

ゲームの設定は `shooting_game.html` 内の変数で調整可能です：

- 難易度設定
- 武器パラメータ
- 敵の出現頻度
- ボスの強さ

## �� ライセンス

MIT License 