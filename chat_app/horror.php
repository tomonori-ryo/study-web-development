<?php
session_start();
?>
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <title>error</title>
    <style>
        body {
            margin: 0;
            padding: 0;
            background-image: url('9812395ea210c2b04c35323e3012b0ab.png');
            background-size: cover;
            background-position: center;
            background-repeat: no-repeat;
            height: 100vh;
            display: flex;
            justify-content: center;
            align-items: center;
            color: black;
            font-family: 'Arial', sans-serif;
            font-size: 24px;
        }
    </style>
</head>
<body>
    <h1>error</h1>
    
    <!-- 音声ファイル -->
    <audio id="noise" src="horror-hit-logo-142395.mp3" preload="auto"></audio>
    <audio id="curse" src="frantic-screaming-213549.mp3" preload="auto"></audio>

    <script>
        setTimeout(() => {
            const noise = document.getElementById('noise');
            const curse = document.getElementById('curse');
            
            if (noise && curse) {
                // 呪いの音声の終了イベントを設定
                curse.addEventListener('ended', function() {
                    setTimeout(() => {
                        window.location.href = 'loading.php';
                    }, 1000);
                });
                
                // ノイズを再生
                noise.play();
                
                // ノイズの後に呪いの音声を再生
                setTimeout(() => {
                    curse.play();
                }, 1000);
            }
        }, 2000);
    </script>
</body>
</html>