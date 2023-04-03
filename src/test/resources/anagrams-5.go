package main

import (
	"bufio"
	"fmt"
	"os"
	"sort"
	"strings"
)

func main() {
	if len(os.Args) != 2 {
		fmt.Printf("Usage: %s anagrams.txt\n", os.Args[0])
		os.Exit(1)
	}

	filePath := os.Args[1]
	words, err := readWordsFromFile(filePath)
	if err != nil {
		fmt.Println("Error:", err)
		os.Exit(1)
	}

	anagrams := findAnagrams(words)
	printAnagrams(anagrams)
}

func readWordsFromFile(filePath string) ([]string, error) {
	file, err := os.Open(filePath)
	if err != nil {
		return nil, err
	}
	defer file.Close()

	var words []string
	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		words = append(words, scanner.Text())
	}

	return words, scanner.Err()
}

func findAnagrams(words []string) map[string][]string {
	anagrams := make(map[string][]string)
	for _, word := range words {
		sortedWord := sortString(word)
		anagrams[sortedWord] = append(anagrams[sortedWord], word)
	}
	return anagrams
}

func printAnagrams(anagrams map[string][]string) {
	for _, anagramList := range anagrams {
		if len(anagramList) > 1 {
			fmt.Println(strings.Join(anagramList, ", "))
		}
	}
}

func sortString(s string) string {
	r := []rune(s)
	sort.Slice(r, func(i, j int) bool {
		return r[i] < r[j]
	})
	return string(r)
}

