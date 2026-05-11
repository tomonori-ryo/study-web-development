<?php
// データベース接続情報（XAMPPの初期設定を想定）
$host = 'localhost';
$dbname = 'chat_app';        // データベース名（phpMyAdminで作ったやつ）
$user = 'root';              // XAMPPのデフォルトユーザー
$pass = 'root';                  // パスワード（XAMPPは初期空白）

try {
    // PDOでデータベースに接続
    $pdo = new PDO("mysql:host=$host;dbname=$dbname;charset=utf8mb4", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    exit('データベース接続失敗: ' . $e->getMessage());
}

// フォームからのPOSTデータを受け取る
$username = $_POST['username'] ?? '';
$furigana = $_POST['furigana'] ?? '';
$email    = $_POST['email'] ?? '';
$password = $_POST['password'] ?? '';

// バリデーション（超簡易）
if (empty($username) || empty($furigana) || empty($email) || empty($password)) {
    exit('すべての項目を入力してください');
}

// パスワードをハッシュ化（セキュリティのため）
$hashed_password = password_hash($password, PASSWORD_DEFAULT);

// SQL文を準備
$sql = "INSERT INTO users (username, furigana, email, password) 
        VALUES (:username, :furigana, :email, :password)";

try {
    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        ':username' => $username,
        ':furigana' => $furigana,
        ':email'    => $email,
        ':password' => $hashed_password
    ]);
    header("Location: chatlogin.php");
    exit;
    echo "登録が完了しました！";
} catch (PDOException $e) {
    echo "登録に失敗しました: " . $e->getMessage();
}
?>