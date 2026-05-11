<?php
$to = "kd1350608@st.kobedenshi.ac.jp"; // あなたのメールアドレス
$subject = "テスト";
$message = "テストメッセージ";
$headers = "From: noreply.chappy@gmail.com";

if(mail($to, $subject, $message, $headers)) {
    echo "メール送信成功";
} else {
    echo "メール送信失敗";
}
?> 