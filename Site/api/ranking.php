<?php
/**
 * MuHollow Launcher API - Top Resets Ranking
 * Returns top resets ranking data as JSON for the launcher.
 */

define('access', 'api');

include('../includes/webengine.php');

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');

// Class code to abbreviation mapping (xteam format)
function getClassAbbr($classCode) {
    $code = intval($classCode);
    if ($code >= 0  && $code <= 7)   return 'dw';
    if ($code >= 16 && $code <= 23)  return 'dk';
    if ($code >= 32 && $code <= 39)  return 'elf';
    if ($code >= 48 && $code <= 54)  return 'mg';
    if ($code >= 64 && $code <= 67)  return 'dl';
    if ($code >= 80 && $code <= 87)  return 'sum';
    if ($code >= 96 && $code <= 102) return 'rf';
    if ($code >= 112 && $code <= 118) return 'gl';
    if ($code >= 128 && $code <= 135) return 'rw';
    if ($code >= 144 && $code <= 147) return 'sl';
    return 'dw';
}

$ranking_data = LoadCacheData('rankings_resets.cache');

if (!is_array($ranking_data)) {
    echo json_encode(array('error' => 'Ranking data unavailable', 'players' => array()));
    exit;
}

$players = array();
$rank = 1;

foreach ($ranking_data as $i => $rdata) {
    if ($i === 0) continue; // skip timestamp line
    if (!is_array($rdata) || count($rdata) < 3) continue;

    $players[] = array(
        'rank'   => $rank,
        'name'   => $rdata[0],
        'class'  => getClassAbbr($rdata[1]),
        'resets' => intval($rdata[2]),
        'level'  => intval($rdata[3])
    );
    $rank++;
}

echo json_encode(array(
    'players'   => $players,
    'updatedAt' => intval($ranking_data[0][0])
));
