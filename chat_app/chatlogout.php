<?php
session_start();
session_destroy();
header('Location: chatlogin.php');
exit;