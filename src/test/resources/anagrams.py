#!/usr/bin/env python3

import sys
from collections import defaultdict


def load_words(file_path):
    with open(file_path, 'r') as file:
        return file.read().splitlines()


def find_anagrams(words):
    anagrams = defaultdict(list)
    for word in words:
        sorted_word = ''.join(sorted(word))
        anagrams[sorted_word].append(word)
    return anagrams


def print_anagrams(anagrams):
    for sorted_word, anagram_list in anagrams.items():
        if len(anagram_list) > 1:
            print(', '.join(anagram_list))


def main():
    if len(sys.argv) != 2:
        print(f"Usage: {sys.argv[0]} anagrams.txt")
        sys.exit(1)

    file_path = sys.argv[1]
    words = load_words(file_path)
    anagrams = find_anagrams(words)
    print_anagrams(anagrams)


if __name__ == "__main__":
    main()
