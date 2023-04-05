<?php
function getWords() {
    $words = file(
        'http://www.puzzlers.org/pub/wordlists/unixdict.txt',
        FILE_IGNORE_NEW_LINES
    );
    return $words;
}

function getAnagrams($words) {
    $anagrams = array();
    foreach ($words as $word) {
        $chars = str_split($word);
        sort($chars);
        $chars = implode("", $chars);
        $length = strlen($chars);
        $anagrams[$length][$chars][] = $word;
    }
    krsort($anagrams);
    return $anagrams;
}

function getFinalWords($anagrams) {
    $final_words = array();
    foreach ($anagrams as $anagram) {
        foreach ($anagram as $words) {
            if (count($words) >= 2) {
                $counts = array();
                foreach ($words as $word) {
                    $counts[$word] = array($word);
                    foreach ($words as $second_word) {
                        for ($i = 0, $length = strlen($word); $i < $length; $i++) {
                            if ($word[$i] === $second_word[$i]) continue 2;
                        }
                        $counts[$word][] = $second_word;
                    }
                }
                $max = 0;
                $max_key = '';
                foreach ($counts as $name => $count) {
                    if (count($count) > $max) {
                        $max = count($count);
                        $max_key = $name;
                    }
                }
                if ($max > 1) {
                    $final_words[] = $counts[$max_key];
                }
            }
        }
        if ($final_words) break;
    }
    return $final_words;
}

$words = getWords();
$anagrams = getAnagrams($words);
$final_words = getFinalWords($anagrams);

foreach ($final_words as $final_word) {
    echo implode(" ", $final_word), "\n";
}
?>
