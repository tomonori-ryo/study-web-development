<?php
    $hey= 'phpで時間を表記';
    print("$hey<br>");
// 日本時間を設定
date_default_timezone_set('Asia/Tokyo');

// 現在の日時を取得
$now = date("Y年m月d日 H時i分s秒");

// 表示
echo "現在の時間は「{$now}」です。";
?>


