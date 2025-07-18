<?php
// 詳細なメール送信テスト
$to = "kd1350608@st.kobedenshi.ac.jp"; // あなたのメールアドレス
$subject = "詳細テストメール";
$message = "これは詳細テストメールです。\n送信時刻: " . date('Y-m-d H:i:s');
$headers = "From: noreply.chappy@gmail.com\r\n";
$headers .= "Content-Type: text/plain; charset=UTF-8\r\n";

echo "メール送信テスト開始...\n";
echo "送信先: $to\n";
echo "件名: $subject\n";
echo "送信者: noreply.chappy@gmail.com\n\n";

$result = mail($to, $subject, $message, $headers);

echo "送信結果: " . ($result ? '成功' : '失敗') . "\n";

// エラー情報を確認
$error = error_get_last();
if ($error) {
    echo "エラー情報:\n";
    print_r($error);
}

// メール送信の詳細情報
echo "\nメール送信の詳細:\n";
echo "mail()関数の戻り値: " . var_export($result, true) . "\n";

// 実際にメールが送信されたかどうかを確認する方法
if ($result) {
    echo "\n注意: mail()関数はtrueを返しましたが、\n";
    echo "実際のメール送信は失敗している可能性があります。\n";
    echo "以下の点を確認してください:\n";
    echo "1. スパムフォルダを確認\n";
    echo "2. メールサーバーのログを確認\n";
    echo "3. 送信者アドレスが正しいか確認\n";
}
?> 