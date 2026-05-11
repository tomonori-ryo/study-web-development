<?php
session_start();

$username = isset($_SESSION['username']) ? $_SESSION['username'] : 'ゲスト';

if (empty($_SESSION['login'])) {
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

?>

<!DOCTYPE html>
<html lang="ja">
<link href="https://fonts.googleapis.com/css2?family=Creepster&display=swap" rel="stylesheet">
<head>
  <meta charset="utf-8">
  <title>チャピーくん</title>
  <style>
    body {
      font-family: sans-serif;
      background: black;
      margin: 0;
      padding: 0;
      display: flex;
      flex-direction: column;
      height: 100vh;
    }

    h1 {
      color: white;
      margin: 10px;
    }

    .chat-container {
      flex: 1;
      padding: 10px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
    }

    .message {
      max-width: 70%;
      padding: 10px 15px;
      margin: 10px;
      border-radius: 12px;
      line-height: 1.5;
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
      border-bottom-left-radius: 0;
    }

    .input-area {
      display: flex;
      border-top: 1px solid #ccc;
      padding: 10px;
      background: white;
    }

    .input-area input {
      flex: 1;
      padding: 10px;
      font-size: 16px;
      border: 1px solid #ccc;
      border-radius: 8px;
    }

    .input-area button {
      margin-left: 10px;
      padding: 10px 15px;
      font-size: 16px;
      background-color: #4f46e5;
      color: white;
      border: none;
      border-radius: 8px;
      cursor: pointer;
    }

    .input-area button:hover {
      background-color: #3730a3;
    }
    .red-custom-font {
      color: red;
      font-family: 'Creepster', cursive;
      font-weight: bold;
    }
    
    /* 新規登録ボタンのスタイル */
    .register-link {
        display: inline-block;
        padding: 10px 20px;
        background-color: #666;
        color: #fff;
        text-decoration: none;
        border-radius: 8px;
        font-size: 14px;
        transition: background-color 0.3s ease;
        margin-top: 20px;
    }

    .register-link:hover {
        background-color: #555;
    
        .image-message {
  background: transparent !important;
  padding: 0 !important;
  box-shadow: none !important;
  margin: 10px auto !important;
  max-width: 100%;
}
  </style>
  <script>
    const username = <?php echo json_encode($username); ?>;
  </script>
</head>
<body>
    
    <h1>チャッピーくん→</h1>

    <div class="chat-container" id="chat"></div>
  
    <div class="input-area">
      <input type="text" id="userInput" placeholder="質問してみましょう" autocomplete="off" />
      <button type="button" id="sendButton">↑</button>
    </div>
    
    
    <script>
        const chat = document.getElementById('chat');
        const input = document.getElementById('userInput');
        
        let isSending = false; // 送信中のフラグ

        function sendMessage() {
            const text = input.value.trim();
            if (!text || isSending) return; // 送信中は送信を防ぐ

            isSending = true; // 送信開始
            
            addMessage(text, 'user');
            input.value = '';
            input.focus();
            
            // 送信ボタンを無効化
            const sendButton = document.querySelector('button');
            sendButton.disabled = true;
            sendButton.textContent = '送信中...';
            
            // ローディング表示
            const loadingMsg = document.createElement('div');
            loadingMsg.className = 'message assistant';
            loadingMsg.textContent = '考え中...';
            chat.appendChild(loadingMsg);
            chat.scrollTop = chat.scrollHeight;
            
            // Ollama APIにリクエスト
            fetch('api.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    message: text
                })
            })
            .then(response => response.json())
            .then(data => {
                // ローディングメッセージを削除
                if (loadingMsg.parentNode) {
                    chat.removeChild(loadingMsg);
                }
                
                if (data.error) {
                    addMessage('エラーが発生しました: ' + data.error, 'assistant');
                } else {
                    addMessage(data.response, 'assistant');
                }
            })
            .catch(error => {
                // ローディングメッセージを削除
                if (loadingMsg.parentNode) {
                    chat.removeChild(loadingMsg);
                }
                addMessage('通信エラーが発生しました。', 'assistant');
                console.error('Error:', error);
            })
            .finally(() => {
                // 送信完了後の処理
                isSending = false;
                sendButton.disabled = false;
                sendButton.textContent = '↑';
            });
        }

        // addMessage関数
        function addMessage(content, role, isHTML = false) {
            const msg = document.createElement('div');
            msg.className = `message ${role}`;
            if (isHTML) {
                msg.innerHTML = content; // HTMLを有効にする
            } else {
                msg.textContent = content;
            }
            chat.appendChild(msg);
            chat.scrollTop = chat.scrollHeight;
        }
        
        // イベントリスナーの重複登録を防ぐ
        let eventListenersAdded = false;

        function initializeEventListeners() {
            if (eventListenersAdded) return;
            
            // エンターキーで送信
            input.addEventListener('keydown', function(event) {
                if (event.key === 'Enter' && !isSending) {
                    event.preventDefault();
                    sendMessage();
                }
            });
            
            // 送信ボタンのクリック
            const sendButton = document.querySelector('button');
            sendButton.addEventListener('click', function(event) {
                event.preventDefault();
                if (!isSending) {
                    sendMessage();
                }
            });
            
            eventListenersAdded = true;
        }

        // ページ読み込み時にイベントリスナーを初期化
        document.addEventListener('DOMContentLoaded', initializeEventListeners);
      </script>

<p style="position: fixed; top: 10px; right: 20px; margin: 0; z-index: 100;">
  <a href="chatlogout.php" style="color: lightgray; text-decoration: none;">ログアウト</a>
</p>
  </body>
  </html>

