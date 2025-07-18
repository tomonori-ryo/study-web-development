<!DOCTYPE html>
<html lang='ja'>
<head>
    <meta charset='UTF-8'>
    <title>ログインフォーム - チャッピーくん</title>
  <style>
    body {
      margin: 0;
      font-family: "Helvetica Neue", sans-serif;
      background-color: #1e1e1e;
      color: #f5f5f5;
      display: flex;
      justify-content: center;
      align-items: center;
      height: 100vh;
    }

    .form-container {
      background-color: #2a2a2a;
      padding: 30px 40px;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.4);
      width: 100%;
      max-width: 400px;
    }

    h2 {
      text-align: center;
      margin-bottom: 20px;
      color: #ffffff;
    }

    label {
      display: block;
      margin-bottom: 15px;
      font-size: 15px;
    }
    
    input[type="text"],
    input[type="email"],
    input[type="password"] {
      width: 100%;
      padding: 10px;
      font-size: 14px;
      border: 1px solid #444;
      border-radius: 8px;
      background-color: #1e1e1e;
      color: #f5f5f5;
      outline: none;
    }
    
    input[type="text"]:focus,
    input[type="email"]:focus,
    input[type="password"]:focus {
      border-color: #4f46e5;
    }

    button {
      width: 100%;
      padding: 12px;
      font-size: 16px;
      background-color: #4f46e5;
      color: #fff;
      border: none;
      border-radius: 8px;
      cursor: pointer;
      margin-top: 10px;
      transition: background-color 0.3s ease;
    }

    button:hover {
      background-color: #3730a3;
    }

    input[type="submit"] {
    width: 100%;
    padding: 10px 0;
    font-size: 14px;
    background-color:rgb(53, 53, 62);
    color: #fff;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    margin-top: 10px;
    transition: background-color 0.3s ease;
  }

  input[type="submit"]:hover {
    background-color:rgb(94, 93, 103);
  }
    
  /* 新規登録ボタンのホバー効果 */
  .register-button {
    padding: 10px 20px;
    font-size: 14px;
    background-color: rgb(53, 53, 62);
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    transition: background-color 0.3s ease;
  }

  .register-button:hover {
    background-color: rgb(94, 93, 103);
  }
    
  </style>
</head>   
<body> 
<form method = 'post' action='chatlogin.php'>
    <p>
        <label for="username">ユーザー名:</label>
        <input type='text' name='username'>
    </p>
    <p>
        <label for="password">パスワード:</label>
        <input type='password' name='password'>
    </p>
    
    <input type='submit' value='送信する'>
    
    <!-- 新規登録ボタンをフォーム内に移動 -->
    <div style="text-align: center; margin-top: 10px;">
      <a href="register.html">
        <button type="button" class="register-button">
          新規登録はこちら
        </button>
      </a>
    </div>
</form>

<?php
session_start();

if(!empty($_SESSION['login'])){
   echo "ログイン済みです<br>";
   session_destroy();
   exit;
}

if((empty($_POST['username'])) || (empty($_POST['password']))) {
    echo 'ユーザー名、パスワードを入力してください。';
    exit;
}



try {
    // DB接続
    $db = new PDO('mysql:dbname=chat_app;host=localhost;port=8888;charset=utf8', 'root', 'root');

    $stmt = $db->prepare('SELECT * FROM users WHERE username = :username');
    $stmt->execute([':username' => $_POST['username']]);
    $user = $stmt->fetch(PDO::FETCH_ASSOC);
    if(!$user){
        echo "ログインに失敗しました";
        exit;
    }
    if(password_verify($_POST['password'],$user['password'])){
        session_regenerate_id(true);
        $_SESSION['login'] = true;
        $_SESSION['username'] = $user['username'];
        header("Location: chat.php");
    }else{
        echo 'ログインに失敗しました。（２）';
    }
} catch (PDOException $e) {
    echo 'DB接続エラー: ' . $e->getMessage();
}

?>
</body>




