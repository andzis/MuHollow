<?php
/**
 * MuHollow Launcher API - Online Players Count
 * Returns the number of players currently online.
 */

define('access', 'api');

include('../includes/webengine.php');

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

$online = loadCache('online_characters.cache');

$count = 0;
if (is_array($online)) {
    // Remove timestamp entry (first element is usually the timestamp array)
    foreach ($online as $entry) {
        if (is_string($entry)) $count++;
    }
}

echo json_encode(array(
    'online' => $count,
    'max'    => 500
));
