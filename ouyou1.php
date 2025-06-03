<?php
$week = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

$start = strtotime("today");             // 今日
$end = strtotime("+1 year", $start);     // 1年後

for ($date = $start; $date < $end; $date = strtotime("+1 day", $date)) {
    $month = date('n', $date);           // 月（1〜12）
    $day = date('j', $date);             // 日（1〜31）
    $weekday = date('w', $date);         // 曜日（0〜6）

    echo "{$month}/{$day}({$week[$weekday]}) ";
}
?>