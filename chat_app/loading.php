<?php
session_start();

// データベース接続情報
$host = 'localhost';
$dbname = 'chat_app';
$user = 'root';
$pass = 'root';

// Gmail SMTPを使用した即座のメール送信関数
function sendCompletionEmail($email, $username) {
    // Gmail SMTP設定
    $smtp_server = 'smtp.gmail.com';
    $smtp_port = 587;
    $smtp_username = 'noreply.chappy@gmail.com';
    $smtp_password = 'jmlk ojek jeed mjxw';
    
    $to = $email;
    $subject = "チャッピーくんからのお知らせ";
    
    $message = "
    {$username}さん

    私はあなたのそばにずっといますよ。

    --
    チャッピーくん
    ";
    
    // Gmail SMTPを使用して即座に送信
    return sendMailViaGmailSMTP($to, $subject, $message, $smtp_username, $smtp_password);
}

// Gmail SMTPを使用した即座のメール送信
function sendMailViaGmailSMTP($to, $subject, $message, $username, $password) {
    $smtp_server = 'smtp.gmail.com';
    $smtp_port = 587;
    
    try {
        $socket = fsockopen($smtp_server, $smtp_port, $errno, $errstr, 30);
        if (!$socket) {
            error_log("SMTP接続失敗: $errstr ($errno)");
            return false;
        }
        
        // SMTP通信
        $response = fgets($socket, 515);
        if (substr($response, 0, 3) != '220') {
            error_log("SMTPサーバー準備未完了: $response");
            fclose($socket);
            return false;
        }
        
        // EHLO
        fputs($socket, "EHLO localhost\r\n");
        $response = fgets($socket, 515);
        
        // STARTTLS
        fputs($socket, "STARTTLS\r\n");
        $response = fgets($socket, 515);
        if (substr($response, 0, 3) != '220') {
            error_log("STARTTLS失敗: $response");
            fclose($socket);
            return false;
        }
        
        // TLS暗号化を開始
        stream_socket_enable_crypto($socket, true, STREAM_CRYPTO_METHOD_TLS_CLIENT);
        
        // 認証
        fputs($socket, "AUTH LOGIN\r\n");
        $response = fgets($socket, 515);
        
        fputs($socket, base64_encode($username) . "\r\n");
        $response = fgets($socket, 515);
        
        fputs($socket, base64_encode($password) . "\r\n");
        $response = fgets($socket, 515);
        
        if (substr($response, 0, 3) != '235') {
            error_log("認証失敗: $response");
            fclose($socket);
            return false;
        }
        
        // メール送信
        fputs($socket, "MAIL FROM:<$username>\r\n");
        $response = fgets($socket, 515);
        
        fputs($socket, "RCPT TO:<$to>\r\n");
        $response = fgets($socket, 515);
        
        fputs($socket, "DATA\r\n");
        $response = fgets($socket, 515);
        
        $email_content = "Subject: $subject\r\n";
        $email_content .= "To: $to\r\n";
        $email_content .= "From: $username\r\n";
        $email_content .= "Content-Type: text/plain; charset=UTF-8\r\n\r\n";
        $email_content .= $message . "\r\n.\r\n";
        
        fputs($socket, $email_content);
        $response = fgets($socket, 515);
        
        fputs($socket, "QUIT\r\n");
        fclose($socket);
        
        $success = substr($response, 0, 3) == '250';
        error_log("Gmail SMTP送信結果: " . ($success ? '成功' : '失敗'));
        
        return $success;
        
    } catch (Exception $e) {
        error_log("Gmail SMTPエラー: " . $e->getMessage());
        return false;
    }
}

// データベースからメールアドレスを取得する関数
function getUserEmail($username) {
    global $host, $dbname, $user, $pass;
    
    try {
        $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $user, $pass);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
        
        $stmt = $pdo->prepare("SELECT email FROM users WHERE username = :username");
        $stmt->execute([':username' => $username]);
        $result = $stmt->fetch(PDO::FETCH_ASSOC);
        
        $email = $result ? $result['email'] : null;
        error_log("データベースクエリ - ユーザー名: $username, メール: " . ($email ?: '見つかりません'));
        
        return $email;
    } catch (PDOException $e) {
        error_log("データベースエラー: " . $e->getMessage());
        return null;
    }
}

// 読み込み完了時の処理
if (isset($_POST['completion']) && $_POST['completion'] === 'true') {
    $response = array();
    
    if (isset($_SESSION['username'])) {
        $username = $_SESSION['username'];
        $email = getUserEmail($username);
        
        if ($email) {
            $mailResult = sendCompletionEmail($email, $username);
            $response['success'] = true;
            $response['message'] = 'メールを送信しました！';
        } else {
            $response['success'] = true;
            $response['message'] = 'メールを送信しました！';
        }
    } else {
        $response['success'] = true;
        $response['message'] = 'メールを送信しました！';
    }
    
    header('Content-Type: application/json');
    echo json_encode($response);
    exit;
}
?>
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="utf-8">
    <title>読み込み中...</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            background: #000;
            color: white;
            font-family: sans-serif;
            display: flex;
            align-items: center;
            justify-content: center;
            height: 100vh;
        }
        
        .loading-container {
            text-align: center;
            width: 80%;
            max-width: 500px;
        }
        
        .loading-text {
            font-size: 24px;
            margin-bottom: 30px;
        }
        
        .progress-container {
            width: 100%;
            background: #333;
            border-radius: 10px;
            padding: 3px;
            margin: 20px 0;
        }
        
        .progress-bar {
            width: 0%;
            height: 20px;
            background: linear-gradient(90deg,rgb(235, 235, 238),rgb(235, 235, 235));
            border-radius: 8px;
            transition: width 0.1s ease;
            position: relative;
            overflow: hidden;
        }
        
        .progress-bar::after {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent);
            animation: shimmer 2s infinite;
        }
        
        @keyframes shimmer {
            0% { left: -100%; }
            100% { left: 100%; }
        }
        
        .percentage {
            font-size: 18px;
            margin-top: 10px;
        }
        
        .status-text {
            font-size: 16px;
            color: #ccc;
            margin-top: 20px;
        }
        
        .completion-message {
            font-size: 18px;
            color: #4CAF50;
            margin-top: 20px;
            display: none;
        }
        
        .email-sound {
            display: none;
        }
    </style>
</head>
<body>
    <div class="loading-container">
        <div class="loading-text">読み込み中...</div>
        
        <div class="progress-container">
            <div class="progress-bar" id="progressBar"></div>
        </div>
        
        <div class="percentage" id="percentage">0%</div>
        
        <div class="status-text" id="statusText">システムを初期化しています...</div>
        
        <div class="completion-message" id="completionMessage"></div>
    </div>

    <!-- メール送信時のサウンド -->
    <audio id="emailSound" class="email-sound" preload="auto">
        <source src="system-notification-199277.mp3" type="audio/mpeg">
    </audio>

    <script>
        const progressBar = document.getElementById('progressBar');
        const percentage = document.getElementById('percentage');
        const statusText = document.getElementById('statusText');
        const completionMessage = document.getElementById('completionMessage');
        const emailSound = document.getElementById('emailSound');
        
        // 音声再生関数
        function playEmailSound() {
            try {
                console.log('サウンド再生開始');
                
                // 音量を設定
                emailSound.volume = 0.7;
                // 再生位置を最初に戻す
                emailSound.currentTime = 0;
                
                // ユーザーインタラクション後に再生を試行
                const playPromise = emailSound.play();
                
                if (playPromise !== undefined) {
                    playPromise.then(() => {
                        console.log('サウンド再生成功');
                    }).catch(error => {
                        console.log('サウンド再生エラー:', error);
                        // 代替方法：Web Audio APIを使用
                        playSoundWithWebAudio();
                    });
                }
            } catch (error) {
                console.log('サウンド再生エラー:', error);
                playSoundWithWebAudio();
            }
        }
        
        // Web Audio APIを使用した代替再生方法
        function playSoundWithWebAudio() {
            try {
                const audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const oscillator = audioContext.createOscillator();
                const gainNode = audioContext.createGain();
                
                oscillator.connect(gainNode);
                gainNode.connect(audioContext.destination);
                
                // メール通知音のような音色
                oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
                oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);
                oscillator.frequency.setValueAtTime(800, audioContext.currentTime + 0.2);
                oscillator.frequency.setValueAtTime(1000, audioContext.currentTime + 0.3);
                
                gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
                gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.4);
                
                oscillator.start(audioContext.currentTime);
                oscillator.stop(audioContext.currentTime + 0.4);
                
                console.log('Web Audio APIでサウンド再生');
            } catch (error) {
                console.log('Web Audio APIエラー:', error);
            }
        }
        
        const duration = 7000; // 7秒間
        const interval = 50; // 50msごとに更新
        const steps = duration / interval;
        let currentStep = 0;
        
        const statusMessages = [
            'システムを初期化しています...',
            'データベースに接続しています...',
            'セキュリティチェックを実行しています...',
            'ユーザー情報を確認しています...',
            'チャットシステムを起動しています...',
            '最終設定を完了しています...',
            '読み込み完了！'
        ];
        
        const timer = setInterval(() => {
            currentStep++;
            const progress = (currentStep / steps) * 100;
            
            progressBar.style.width = progress + '%';
            percentage.textContent = Math.round(progress) + '%';
            
            // ステータスメッセージの更新
            const messageIndex = Math.floor((progress / 100) * (statusMessages.length - 1));
            statusText.textContent = statusMessages[messageIndex];
            
            if (currentStep >= steps) {
                clearInterval(timer);
                
                // 読み込み完了時にメール送信
                fetch('loading.php', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                    },
                    body: 'completion=true'
                })
                .then(response => response.json())
                .then(data => {
                    completionMessage.textContent = data.message;
                    completionMessage.style.display = 'block';
                    
                    // メール送信完了時にサウンドを再生
                    setTimeout(() => {
                        playEmailSound();
                    }, 300);
                })
                .catch(error => {
                    completionMessage.textContent = 'メールを送信しました！';
                    completionMessage.style.display = 'block';
                    
                    // エラー時もサウンドを再生
                    setTimeout(() => {
                        playEmailSound();
                    }, 300);
                });
                
                // 5秒後にrealchat.phpに遷移
                setTimeout(() => {
                    window.location.href = 'realchat.php';
                }, 5000);
            }
        }, interval);
    </script>
</body>
</html>