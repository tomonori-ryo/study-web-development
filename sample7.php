<?php
$fruits = [
    'Apple' => 'りんご',
    'Lemon' => 'レモン',
    'Grape' => 'ブドウ',
    'Tomato' => 'トマト'
];

foreach ($fruits as $english => $japanese) {
    echo "英語:".$english . "<br>";
    echo "日本語:".$japanese . "<br>"; 
}
?>
