<?php
session_start();

// ログインチェック関数
function checkLogin() {
    if (empty($_SESSION['login'])) {
        if (!isset($_SESSION["login"])) {
            header("Location: chatlogin.php");
            exit;
        }
        return false;
    }
    return true;
}

// ログインが必要な場合のHTMLを表示
function showLoginRequiredPage() {
    echo <<<HTML
    <!DOCTYPE html>
    <html lang="ja">
    <head>
      <meta charset="utf-8">
      <title>ログインが必要です</title>
      <style>
        body {
          font-family: sans-serif;
          background: #000;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          height: 100vh;
        }

        .chat-container {
          flex: 1;
          overflow-y: auto;
          padding: 20px;
          display: flex;
          flex-direction: column;
          background: #000;
        }

        .message {
          max-width: 70%;
          padding: 12px 18px;
          margin: 10px;
          border-radius: 16px;
          line-height: 1.6;
          font-size: 16px;
          word-break: break-word;
          opacity: 0;
          transform: translateY(20px);
          animation: pop-in 0.5s ease forwards;
        }

        .message:nth-child(1) {
          animation-delay: 0.1s;
        }
        .message:nth-child(2) {
          animation-delay: 1.0s;
        }
        .message:nth-child(3) {
          animation-delay: 2.0s;
        }

        @keyframes pop-in {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .user {
          align-self: flex-end;
          background-color: #616164;
          color: white;
          border-bottom-right-radius: 0;
        }

        .assistant {
          align-self: flex-start;
          background-color: #e5e7eb;
          color: black;
          border-bottom-left-radius: 0;
        }

        .input-area {
          display: flex;
          padding: 10px;
          background: #111;
          border-top: 1px solid #333;
          position: sticky;
          bottom: 0;
        }

        .input-area input {
          flex: 1;
          padding: 10px;
          font-size: 16px;
          border-radius: 8px;
          border: 1px solid #555;
          background: #222;
          color: #999;
        }

        .input-area button {
          margin-left: 10px;
          padding: 10px 16px;
          background-color: #4f46e5;
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 16px;
          cursor: not-allowed;
          opacity: 0.5;
        }

        .disabled-msg {
          font-size: 14px;
          text-align: center;
          color: #aaa;
          margin-top: 5px;
        }

        a {
          color: #4f46e5;
          text-decoration: underline;
        }
      </style>
    </head>
    <body>
      <div class="chat-container">
        <div class="message assistant">
          チャッピーくんをご利用いただくにはログインが必要です。
        </div>
        <div class="message user">
          どうやってログインすればいいの？
        </div>
        <div class="message assistant">
          下記のリンクからログインページに移動してください。<br>
          <a href="chatlogin.php">ログインページへ</a>
        </div>
      </div>
      <div class="input-area">
        <input type="text" placeholder="ログインが必要です" disabled />
        <button disabled>送信</button>
      </div>
    </body>
    </html>
    HTML;
    exit;
}

// ユーザー名を安全に取得
function getUsername() {
    return htmlspecialchars($_SESSION["username"]); // XSS防止
}
?> 