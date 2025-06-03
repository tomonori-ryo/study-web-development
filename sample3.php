<?php
//商品ごとの価格
$apples = 100;
$meat = 1000;
$eggs = 200;
// 税抜き合計
$total = $apples + $meat + $eggs;
//税率１０％バージョン
$taxRate = 0.10;
//税込合計
$totalWithTax = $total * (1+$taxRate);
//表示
echo "税抜き合計金額：{$total}円<br>";
echo "税込み合計金額：" . round($totalWithTax) . "円<br>";
?>
